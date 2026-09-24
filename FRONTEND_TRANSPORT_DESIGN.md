# Pgflow Frontend Transport with Streaming Steps

## Architecture Overview

**Philosophy:** Use pgflow client in the **frontend** as a custom ChatTransport, and implement **streaming helpers** in backend flows to emit incremental data that the frontend consumes as AI SDK chunks.

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (React + AI SDK)                                   │
│                                                              │
│  useChat({ transport: PgflowChatTransport })                │
│    │                                                         │
│    └─→ PgflowClient (browser)                               │
│         │                                                    │
│         └─→ Supabase Realtime (WebSocket)                   │
│              ↕                                               │
└──────────────┼───────────────────────────────────────────────┘
               │
               │ Broadcast Events
               │
┌──────────────┼───────────────────────────────────────────────┐
│              ↕                                               │
│  Supabase Database + Realtime                               │
│                                                              │
│    Pgflow Flows (Backend - Supabase Functions/Edge)         │
│      │                                                       │
│      └─→ Steps with streaming context                       │
│           .step('generate', async (input, ctx) => {          │
│             for await (chunk of llm.stream()) {             │
│               await ctx.stream.emit('text', chunk);         │
│             }                                                │
│           })                                                 │
└──────────────────────────────────────────────────────────────┘
```

**Key Advantages:**
- ✅ No backend API routes needed (direct Supabase connection)
- ✅ Streaming works naturally via Supabase Realtime
- ✅ Type-safe frontend → backend communication
- ✅ RLS policies enforce authorization
- ✅ Works offline/reconnects automatically

---

## 1. Streaming Context API for Pgflow Steps

### 1.1 New Streaming Events

Extend pgflow's broadcast events to support streaming chunks:

```typescript
// pkgs/client/src/lib/types/events.ts

/**
 * New event type: step streaming chunks
 * Emitted during step execution for incremental data
 */
export type BroadcastStepStreamEvent = {
  event_type: 'step:stream';
  run_id: string;
  step_slug: string;
  stream_type: 'text' | 'data' | 'reasoning' | 'tool-input';
  chunk: Json; // The incremental data
  index: number; // Chunk sequence number
  timestamp: string;
};

// Add to existing BroadcastEvent union
export type BroadcastEvent =
  | BroadcastRunEvent
  | BroadcastStepEvent
  | BroadcastStepStreamEvent; // NEW
```

### 1.2 Streaming Context Interface

```typescript
// pkgs/dsl/src/lib/streaming-context.ts

/**
 * Streaming context passed to step functions
 * Allows steps to emit incremental chunks during execution
 */
export interface StreamingContext {
  /**
   * Emit a streaming chunk to connected clients
   */
  emit(type: 'text' | 'data' | 'reasoning' | 'tool-input', chunk: any): Promise<void>;

  /**
   * Emit text delta (for LLM streaming)
   */
  emitText(text: string): Promise<void>;

  /**
   * Emit custom data
   */
  emitData(key: string, data: any): Promise<void>;

  /**
   * Emit reasoning/thinking
   */
  emitReasoning(reasoning: string): Promise<void>;

  /**
   * Emit tool execution progress
   */
  emitToolInput(toolName: string, input: any): Promise<void>;
}

/**
 * Step function signature with streaming context
 */
export type StepFunctionWithStreaming<TInput, TOutput> = (
  input: TInput,
  ctx: {
    stream: StreamingContext;
    runId: string;
    stepSlug: string;
  }
) => Promise<TOutput>;
```

### 1.3 Implementation (Backend - Supabase Edge Function)

```typescript
// supabase/functions/pgflow-streaming-helper/index.ts

import { createClient } from '@supabase/supabase-js';

/**
 * Create a streaming context for a pgflow step
 * Broadcasts chunks via Supabase Realtime
 */
export function createStreamingContext(
  supabase: SupabaseClient,
  runId: string,
  stepSlug: string
): StreamingContext {
  let chunkIndex = 0;

  const emit = async (
    streamType: 'text' | 'data' | 'reasoning' | 'tool-input',
    chunk: any
  ) => {
    const event: BroadcastStepStreamEvent = {
      event_type: 'step:stream',
      run_id: runId,
      step_slug: stepSlug,
      stream_type: streamType,
      chunk,
      index: chunkIndex++,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to the run's channel
    await supabase.channel(`pgflow:run:${runId}`).send({
      type: 'broadcast',
      event: 'step:stream',
      payload: event,
    });
  };

  return {
    emit,

    emitText: async (text: string) => {
      await emit('text', { text });
    },

    emitData: async (key: string, data: any) => {
      await emit('data', { key, data });
    },

    emitReasoning: async (reasoning: string) => {
      await emit('reasoning', { reasoning });
    },

    emitToolInput: async (toolName: string, input: any) => {
      await emit('tool-input', { toolName, input });
    },
  };
}
```

### 1.4 Usage in Flows

```typescript
// Example: Chat flow with streaming LLM response

import { Flow } from '@pgflow/dsl';
import { createStreamingContext } from './pgflow-streaming-helper';
import { OpenAI } from 'openai';

export const ChatFlow = new Flow<{
  message: string;
  conversationId: string;
}>({ slug: 'streaming_chat' })

  .step('retrieve_context', async (input, ctx) => {
    // Emit reasoning about what we're doing
    await ctx.stream.emitReasoning('Searching knowledge base...');

    const results = await vectorSearch(input.message);

    // Emit the retrieved data
    await ctx.stream.emitData('search_results', results);

    return { context: results };
  })

  .step('generate_response', async (input, ctx) => {
    const openai = new OpenAI();

    // Stream LLM response token by token
    const stream = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: `Context: ${input.context}` },
        { role: 'user', content: input.message },
      ],
      stream: true,
    });

    let fullResponse = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        // Emit each token to frontend immediately
        await ctx.stream.emitText(delta);
        fullResponse += delta;
      }
    }

    // Return final result (stored in database)
    return { response: fullResponse };
  })

  .step('format', async (input) => {
    return {
      response: input.response,
      formatted: true
    };
  });
```

---

## 2. Frontend PgflowChatTransport

### 2.1 Implementation

```typescript
// lib/pgflow-chat-transport.ts

import { PgflowClient } from '@pgflow/client/browser';
import type {
  ChatTransport,
  UIMessage,
  UIMessageChunk
} from '@ai-sdk/react';
import type { BroadcastStepStreamEvent } from '@pgflow/client';

export class PgflowChatTransport implements ChatTransport<UIMessage> {
  constructor(
    private pgflowClient: PgflowClient,
    private flowSlug: string,
  ) {}

  async sendMessages(options: {
    trigger: 'submit-message' | 'regenerate-message';
    chatId: string;
    messageId: string | undefined;
    messages: UIMessage[];
    abortSignal: AbortSignal | undefined;
  }): Promise<ReadableStream<UIMessageChunk>> {

    const { messages, chatId, abortSignal } = options;
    const lastMessage = messages[messages.length - 1];

    return new ReadableStream({
      start: async (controller) => {
        try {
          // Start the pgflow flow
          const run = await this.pgflowClient.startFlow(
            this.flowSlug,
            {
              message: lastMessage.content,
              conversationId: chatId,
              history: messages.slice(0, -1),
            },
            chatId // Use chatId as runId for consistency
          );

          // Send start chunk
          controller.enqueue({
            type: 'start',
            id: run.run_id,
          } as UIMessageChunk);

          // Listen to streaming events
          const unsubscribeStream = this.pgflowClient.onStepEvent((event) => {
            if (event.run_id !== run.run_id) return;

            // Handle streaming chunks
            if (event.event_type === 'step:stream') {
              const streamEvent = event as BroadcastStepStreamEvent;
              const chunks = this.mapStreamEventToChunks(streamEvent);
              chunks.forEach(chunk => controller.enqueue(chunk));
            }
          });

          // Listen to step completion
          const unsubscribeSteps = this.pgflowClient.onStepEvent((event) => {
            if (event.run_id !== run.run_id) return;

            if (event.event_type === 'step:completed') {
              // Optionally emit step completion as data
              controller.enqueue({
                type: 'data-step-complete',
                data: {
                  step: event.step_slug,
                  output: event.output,
                },
              } as UIMessageChunk);
            }
          });

          // Listen to run completion/failure
          const unsubscribeRun = run.on('*', (runEvent) => {
            if (runEvent.event_type === 'run:completed') {
              // Send finish chunk
              controller.enqueue({
                type: 'finish',
                finishReason: 'stop',
              } as UIMessageChunk);

              // Cleanup
              unsubscribeStream();
              unsubscribeSteps();
              unsubscribeRun();
              controller.close();
            }

            if (runEvent.event_type === 'run:failed') {
              // Send error chunk
              controller.enqueue({
                type: 'error',
                error: new Error(runEvent.error_message),
              } as UIMessageChunk);

              // Cleanup
              unsubscribeStream();
              unsubscribeSteps();
              unsubscribeRun();
              controller.close();
            }
          });

          // Handle abort signal
          if (abortSignal) {
            abortSignal.addEventListener('abort', () => {
              unsubscribeStream();
              unsubscribeSteps();
              unsubscribeRun();
              controller.close();
            });
          }

          // Wait for completion
          await run.waitForStatus('completed', {
            timeoutMs: 5 * 60 * 1000, // 5 minutes
            signal: abortSignal,
          }).catch(async () => {
            // Check if it failed
            await run.waitForStatus('failed', {
              timeoutMs: 1000,
              signal: abortSignal,
            });
          });

        } catch (error) {
          controller.error(error);
        }
      },

      cancel() {
        // Cleanup on cancel (handled by abort signal)
      },
    });
  }

  async reconnectToStream(options: {
    chatId: string;
  }): Promise<ReadableStream<UIMessageChunk> | null> {
    const { chatId } = options;

    // Try to get existing run
    const run = await this.pgflowClient.getRun(chatId);

    if (!run) return null;

    // If already completed, return null
    if (run.status === 'completed' || run.status === 'failed') {
      return null;
    }

    // Re-subscribe to the stream
    return new ReadableStream({
      start: async (controller) => {
        // Similar logic to sendMessages but without starting new run
        // Just resubscribe to events...

        const unsubscribe = run.on('*', (event) => {
          // Map events to chunks
          // ...
        });

        await run.waitForStatus('completed', { timeoutMs: 60000 });
        unsubscribe();
        controller.close();
      },
    });
  }

  /**
   * Map pgflow streaming events to AI SDK chunks
   */
  private mapStreamEventToChunks(
    event: BroadcastStepStreamEvent
  ): UIMessageChunk[] {
    switch (event.stream_type) {
      case 'text':
        return [{
          type: 'text-delta',
          text: event.chunk.text,
        }];

      case 'reasoning':
        return [{
          type: 'reasoning-delta',
          reasoning: event.chunk.reasoning,
        }];

      case 'data':
        return [{
          type: `data-${event.chunk.key}`,
          data: event.chunk.data,
        }];

      case 'tool-input':
        return [{
          type: 'tool-input-delta',
          toolCallId: event.step_slug,
          toolName: event.chunk.toolName,
          argsTextDelta: JSON.stringify(event.chunk.input),
        }];

      default:
        return [];
    }
  }
}
```

### 2.2 Frontend Usage

```typescript
// app/page.tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { PgflowClient } from '@pgflow/client/browser';
import { createClient } from '@supabase/supabase-js';
import { PgflowChatTransport } from '@/lib/pgflow-chat-transport';
import { useMemo } from 'react';

export default function ChatPage() {
  const transport = useMemo(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const pgflow = new PgflowClient(supabase);

    return new PgflowChatTransport(pgflow, 'streaming_chat');
  }, []);

  const {
    messages,
    sendMessage,
    status,
    data // Custom data from streaming events
  } = useChat({
    transport,
    onData: (chunk) => {
      // Handle custom streaming data
      if (chunk.type === 'data-search_results') {
        console.log('Search results:', chunk.data);
        // Update UI with search progress
      }
    },
  });

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((message) => (
          <div key={message.id} className="mb-4">
            <div className="font-bold">
              {message.role === 'user' ? 'You' : 'AI'}
            </div>
            <div>{message.content}</div>
          </div>
        ))}

        {/* Show custom streaming data */}
        {data && data['search_results'] && (
          <div className="text-gray-500 text-sm">
            Searching: {JSON.stringify(data['search_results'])}
          </div>
        )}

        {status === 'streaming' && (
          <div className="text-gray-500">AI is thinking...</div>
        )}
      </div>

      <div className="border-t p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.elements.namedItem('message') as HTMLInputElement;
            sendMessage({ content: input.value });
            input.value = '';
          }}
        >
          <input
            name="message"
            type="text"
            className="w-full border rounded px-3 py-2"
            placeholder="Type a message..."
            disabled={status === 'streaming'}
          />
        </form>
      </div>
    </div>
  );
}
```

---

## 3. Required Changes to Pgflow

### 3.1 Client Changes

```typescript
// pkgs/client/src/lib/PgflowClient.ts

export class PgflowClient {
  // ... existing code ...

  /**
   * Listen to step streaming events (NEW)
   */
  onStepStreamEvent(
    callback: (event: BroadcastStepStreamEvent) => void
  ): Unsubscribe {
    return this.#realtimeAdapter.on('stepStreamEvent', callback);
  }
}
```

```typescript
// pkgs/client/src/lib/adapters/SupabaseBroadcastAdapter.ts

export class SupabaseBroadcastAdapter {
  // ... existing code ...

  #handleBroadcastMessage(payload: unknown) {
    const parsed = this.#parseJsonFields(payload);

    switch (parsed.event_type) {
      case 'run:started':
      case 'run:completed':
      case 'run:failed':
        this.#emitter.emit('runEvent', parsed as BroadcastRunEvent);
        break;

      case 'step:started':
      case 'step:completed':
      case 'step:failed':
        this.#emitter.emit('stepEvent', parsed as BroadcastStepEvent);
        break;

      case 'step:stream': // NEW
        this.#emitter.emit('stepStreamEvent', parsed as BroadcastStepStreamEvent);
        break;
    }
  }
}
```

### 3.2 Backend Flow Executor Changes

```typescript
// pkgs/executor/src/lib/step-executor.ts (or wherever steps are executed)

import { createStreamingContext } from './streaming-context';

export async function executeStep(
  step: Step,
  input: any,
  context: ExecutionContext
) {
  const { runId, stepSlug, supabase } = context;

  // Create streaming context
  const streamingContext = createStreamingContext(supabase, runId, stepSlug);

  // Call step function with streaming context
  const output = await step.execute(input, {
    stream: streamingContext,
    runId,
    stepSlug,
  });

  return output;
}
```

---

## 4. Helper Utilities

### 4.1 AI SDK Streaming Adapter

Helper to easily stream from AI SDK providers in pgflow steps:

```typescript
// lib/pgflow-ai-sdk-adapter.ts

import { streamText } from 'ai';
import type { StreamingContext } from '@pgflow/dsl';

/**
 * Stream AI SDK results through pgflow streaming context
 */
export async function streamAISDKResponse(
  streamTextResult: ReturnType<typeof streamText>,
  ctx: StreamingContext
): Promise<string> {
  let fullText = '';

  for await (const chunk of streamTextResult.textStream) {
    await ctx.emitText(chunk);
    fullText += chunk;
  }

  return fullText;
}

// Usage in flow:
.step('generate', async (input, ctx) => {
  const result = streamText({
    model: openai('gpt-4'),
    prompt: input.message,
  });

  const response = await streamAISDKResponse(result, ctx.stream);

  return { response };
})
```

### 4.2 OpenAI Streaming Adapter

```typescript
// lib/pgflow-openai-adapter.ts

import type { OpenAI } from 'openai';
import type { StreamingContext } from '@pgflow/dsl';

export async function streamOpenAIResponse(
  stream: AsyncIterable<OpenAI.ChatCompletionChunk>,
  ctx: StreamingContext
): Promise<string> {
  let fullResponse = '';

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || '';
    if (delta) {
      await ctx.emitText(delta);
      fullResponse += delta;
    }
  }

  return fullResponse;
}

// Usage:
.step('generate', async (input, ctx) => {
  const stream = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [...],
    stream: true,
  });

  const response = await streamOpenAIResponse(stream, ctx.stream);
  return { response };
})
```

### 4.3 Generic Async Iterator Adapter

```typescript
// lib/pgflow-stream-adapter.ts

import type { StreamingContext } from '@pgflow/dsl';

/**
 * Stream any async iterable through pgflow
 */
export async function* streamToContext<T>(
  iterable: AsyncIterable<T>,
  ctx: StreamingContext,
  mapper: (item: T) => { type: string; data: any }
): AsyncGenerator<T> {
  for await (const item of iterable) {
    const { type, data } = mapper(item);
    await ctx.emit(type as any, data);
    yield item;
  }
}

// Usage:
.step('process', async (input, ctx) => {
  const results = [];

  for await (const item of streamToContext(
    processLargeDataset(input),
    ctx.stream,
    (item) => ({ type: 'data', data: { progress: item.progress } })
  )) {
    results.push(item);
  }

  return { results };
})
```

---

## 5. Authentication & Security

### 5.1 Supabase RLS Policies

```sql
-- Only authenticated users can start flows
CREATE POLICY "authenticated_users_can_start_flows"
ON flow_runs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can only read their own runs
CREATE POLICY "users_read_own_runs"
ON flow_runs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can only subscribe to their own run channels
-- (Enforced via Supabase Realtime RLS)
ALTER PUBLICATION supabase_realtime ADD TABLE flow_runs;
```

### 5.2 Frontend Auth

```typescript
// lib/pgflow-chat-transport.ts (updated)

export class PgflowChatTransport implements ChatTransport<UIMessage> {
  constructor(
    private supabaseClient: SupabaseClient, // Pass supabase client
    private flowSlug: string,
  ) {}

  async sendMessages(options) {
    // Check authentication
    const { data: { session } } = await this.supabaseClient.auth.getSession();

    if (!session) {
      throw new Error('User must be authenticated');
    }

    const pgflow = new PgflowClient(this.supabaseClient);

    // Rest of implementation...
  }
}
```

---

## 6. Complete Example

### 6.1 Backend Flow (Supabase Edge Function)

```typescript
// supabase/functions/flows/streaming-chat.ts

import { Flow } from '@pgflow/dsl';
import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import { streamOpenAIResponse } from './helpers/streaming';

export const StreamingChatFlow = new Flow<{
  message: string;
  conversationId: string;
  userId: string;
}>({ slug: 'streaming_chat' })

  .step('classify_intent', async (input, ctx) => {
    await ctx.stream.emitReasoning('Analyzing your message...');

    const openai = new OpenAI();
    const intent = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{
        role: 'user',
        content: `Classify this message intent: "${input.message}"`
      }],
    });

    const classification = intent.choices[0].message.content;

    await ctx.stream.emitData('intent', { classification });

    return { intent: classification };
  })

  .step('retrieve_context', async (input, ctx) => {
    await ctx.stream.emitReasoning('Searching knowledge base...');

    // Simulate vector search
    const results = await vectorSearch(input.message);

    await ctx.stream.emitData('search_results', {
      count: results.length,
      sources: results.map(r => r.source),
    });

    return { context: results };
  })

  .step('generate_response', async (input, ctx) => {
    await ctx.stream.emitReasoning('Generating response...');

    const openai = new OpenAI();

    const stream = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `Context: ${JSON.stringify(input.context)}`
        },
        {
          role: 'user',
          content: input.message
        }
      ],
      stream: true,
    });

    // Stream each token to frontend
    const response = await streamOpenAIResponse(stream, ctx.stream);

    return { response };
  });
```

### 6.2 Frontend with Progress Indicators

```typescript
// app/chat/page.tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { PgflowChatTransport } from '@/lib/pgflow-chat-transport';
import { createBrowserClient } from '@/lib/supabase';
import { useMemo, useState } from 'react';

export default function ChatPage() {
  const [customData, setCustomData] = useState<Record<string, any>>({});

  const supabase = useMemo(() => createBrowserClient(), []);

  const transport = useMemo(() => {
    return new PgflowChatTransport(supabase, 'streaming_chat');
  }, [supabase]);

  const { messages, sendMessage, status } = useChat({
    transport,
    onData: (chunk) => {
      // Capture custom streaming data
      if (chunk.type.startsWith('data-')) {
        const key = chunk.type.replace('data-', '');
        setCustomData(prev => ({ ...prev, [key]: chunk.data }));
      }
    },
  });

  return (
    <div className="max-w-2xl mx-auto p-4">
      {/* Messages */}
      <div className="space-y-4 mb-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`p-3 rounded ${
              msg.role === 'user' ? 'bg-blue-100' : 'bg-gray-100'
            }`}
          >
            <div className="font-bold mb-1">
              {msg.role === 'user' ? 'You' : 'AI'}
            </div>
            <div>{msg.content}</div>
          </div>
        ))}
      </div>

      {/* Progress Indicators */}
      {status === 'streaming' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
          <div className="font-semibold mb-2">Processing...</div>

          {customData.intent && (
            <div className="text-sm text-gray-600">
              ✓ Intent: {customData.intent.classification}
            </div>
          )}

          {customData.search_results && (
            <div className="text-sm text-gray-600">
              ✓ Found {customData.search_results.count} results
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          const message = formData.get('message') as string;
          sendMessage({ content: message });
          e.currentTarget.reset();
        }}
        className="flex gap-2"
      >
        <input
          name="message"
          type="text"
          className="flex-1 border rounded px-3 py-2"
          placeholder="Ask anything..."
          disabled={status === 'streaming'}
        />
        <button
          type="submit"
          disabled={status === 'streaming'}
          className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
```

---

## 7. Implementation Roadmap

### Phase 1: Core Streaming Infrastructure (Week 1-2)

- [ ] Add `BroadcastStepStreamEvent` type to client
- [ ] Update `SupabaseBroadcastAdapter` to handle streaming events
- [ ] Add `onStepStreamEvent` to `PgflowClient`
- [ ] Create `StreamingContext` interface in DSL package

### Phase 2: Backend Helpers (Week 2-3)

- [ ] Implement `createStreamingContext` in executor
- [ ] Update step executor to pass streaming context
- [ ] Create OpenAI streaming adapter
- [ ] Create AI SDK streaming adapter
- [ ] Add tests for streaming context

### Phase 3: Frontend Transport (Week 3-4)

- [ ] Implement `PgflowChatTransport` class
- [ ] Add event mapping utilities
- [ ] Create TypeScript types for streaming events
- [ ] Add reconnection support
- [ ] Add tests for transport

### Phase 4: Documentation & Examples (Week 4)

- [ ] Add streaming examples to `/examples`
- [ ] Document streaming API
- [ ] Create migration guide
- [ ] Add troubleshooting guide

### Phase 5: Polish & Optimization (Week 5)

- [ ] Performance testing (measure latency)
- [ ] Error handling improvements
- [ ] Add telemetry/monitoring hooks
- [ ] Production hardening

---

## 8. Advantages of This Approach

### ✅ **No Backend API Routes**
- Frontend connects directly to Supabase
- Flows execute in Supabase Edge Functions or self-hosted workers
- Simpler architecture, fewer moving parts

### ✅ **Native Streaming**
- Pgflow's event system is built for streaming
- Supabase Realtime handles WebSocket complexity
- Automatic reconnection on network failures

### ✅ **Type Safety End-to-End**
- Flow input/output types
- Streaming event types
- AI SDK chunk types
- Full TypeScript inference

### ✅ **Better Developer Experience**
- Write flows with familiar async/await
- Stream data with simple `ctx.stream.emit()`
- Frontend automatically receives chunks
- No manual SSE formatting

### ✅ **Scalability**
- Supabase handles connection pooling
- Database-backed state
- RLS policies enforce security
- Works with serverless edge functions

---

## 9. Comparison with Backend Approach

| Aspect | Frontend Transport | Backend API Route |
|--------|-------------------|-------------------|
| Architecture | Direct Supabase connection | Client → API → Supabase |
| Latency | Lower (one less hop) | Higher (extra hop) |
| Auth | RLS policies | API middleware |
| Offline | Automatic (Supabase) | Manual implementation |
| Complexity | Medium (need RLS) | Lower (traditional) |
| Scalability | High (Supabase infra) | Medium (API scaling) |
| Cost | Realtime connections | API route compute |

**Recommendation:** Frontend transport for most use cases. Backend API route only if you need server-side preprocessing or have strict security requirements.

---

## 10. Next Steps

1. **Prototype the streaming context API**
   - Implement `createStreamingContext` helper
   - Test with simple OpenAI streaming example
   - Validate event broadcasting works

2. **Build PgflowChatTransport**
   - Implement basic transport class
   - Test with useChat hook
   - Verify reconnection logic

3. **Create example application**
   - Simple chat with streaming
   - Show intermediate progress (search results, reasoning)
   - Document the pattern

4. **Gather feedback**
   - Test with real AI workflows
   - Measure performance (latency, throughput)
   - Iterate on API design

This approach gives you the **best of both worlds**: pgflow's powerful workflow orchestration with AI SDK's excellent frontend primitives, connected via Supabase Realtime for native streaming support.
