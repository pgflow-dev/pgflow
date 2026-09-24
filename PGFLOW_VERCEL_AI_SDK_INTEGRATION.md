# Pgflow + Vercel AI SDK Integration Analysis

## Executive Summary

This document analyzes how **pgflow** (especially `@pgflow/client`) can be leveraged as a backend for chat applications built with **Vercel AI SDK's `useChat` hook** and related features.

**Key Finding:** Pgflow's event-driven streaming architecture and the Vercel AI SDK's extensible transport system are highly compatible. Integration can happen at multiple levels:

1. **Backend Integration**: Use pgflow flows in Next.js API routes that stream responses to `useChat`
2. **Custom Transport**: Create a `PgflowChatTransport` that directly connects frontend to pgflow client
3. **Hybrid Approach**: Combine pgflow workflows with AI SDK's native LLM capabilities

---

## 1. Understanding the Components

### 1.1 Pgflow Client Architecture

**Core Capabilities:**
- Event-driven workflow execution with real-time streaming
- Type-safe TypeScript API with generics
- Supabase Realtime for WebSocket-based event propagation
- Multi-step workflow orchestration with DAG execution
- Per-run and per-step event subscriptions
- State management with snapshot loading and incremental updates

**Key Classes:**
- `PgflowClient`: Main client for starting/managing flows
- `FlowRun<TFlow>`: Represents a single workflow execution with events
- `FlowStep<TFlow, TStepSlug>`: Individual step within a flow with state tracking
- `SupabaseBroadcastAdapter`: Handles Supabase Realtime communication

**Event Model:**
```typescript
// Run events
run.on('completed', (event) => {
  console.log(event.output); // Type-safe output
});

// Step events
run.step('generate_response').on('completed', (event) => {
  console.log(event.output); // Type-safe step output
});
```

**Reference:** See comprehensive pgflow client analysis in previous Task output (agent ID: ad920c5)

### 1.2 Vercel AI SDK useChat Hook

**Architecture (AI SDK 5+):**
- Transport-based modular design
- Decoupled state management (compatible with Zustand, Redux, etc.)
- Server-Sent Events (SSE) streaming protocol
- Default `/api/chat` endpoint with `DefaultChatTransport`

**Core API:**
```typescript
const { messages, sendMessage, status } = useChat({
  transport: customTransport, // Custom ChatTransport implementation
  onFinish: (message, options) => {},
  onError: (error) => {},
});
```

**ChatTransport Interface:**
```typescript
interface ChatTransport<UI_MESSAGE extends UIMessage> {
  sendMessages(options: {
    trigger: 'submit-message' | 'regenerate-message';
    chatId: string;
    messageId: string | undefined;
    messages: UI_MESSAGE[];
    abortSignal: AbortSignal | undefined;
  } & ChatRequestOptions): Promise<ReadableStream<UIMessageChunk>>;

  reconnectToStream(options: {
    chatId: string;
  } & ChatRequestOptions): Promise<ReadableStream<UIMessageChunk> | null>;
}
```

**Stream Protocol Requirements:**
- Header: `x-vercel-ai-ui-message-stream: v1`
- Format: Server-Sent Events (SSE)
- Data chunks: `data: {"type":"text-delta","text":"..."}\n\n`
- Termination: `data: [DONE]\n\n`

---

## 2. Integration Patterns

### 2.1 Pattern A: Backend API Route Integration (Recommended)

**Architecture:**
```
React UI (useChat)
  → Next.js API Route (/api/chat)
    → Pgflow Client → Pgflow Database
    → Transform events to SSE stream
  ← SSE Response
← Update UI
```

**Implementation:**

```typescript
// app/api/chat/route.ts
import { PgflowClient } from '@pgflow/client';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  const { messages } = await req.json();
  const lastMessage = messages[messages.length - 1];

  // Initialize pgflow client
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const pgflow = new PgflowClient(supabase);

  // Start flow with user input
  const run = await pgflow.startFlow('chat_workflow', {
    message: lastMessage.content,
    conversation_history: messages.slice(0, -1),
  });

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Set up event listeners before waiting
      run.on('*', (event) => {
        if (event.event_type === 'run:completed') {
          // Send final text
          const chunk = `data: ${JSON.stringify({
            type: 'text-delta',
            text: event.output.response
          })}\n\n`;
          controller.enqueue(encoder.encode(chunk));

          // Send finish event
          const finishChunk = `data: ${JSON.stringify({
            type: 'finish',
            finishReason: 'stop'
          })}\n\n`;
          controller.enqueue(encoder.encode(finishChunk));

          // Close stream
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      });

      // Stream intermediate steps
      if (run.hasStep('generate_response')) {
        run.step('generate_response').on('completed', (event) => {
          const chunk = `data: ${JSON.stringify({
            type: 'text-delta',
            text: event.output
          })}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        });
      }

      // Handle errors
      run.on('failed', (event) => {
        const errorChunk = `data: ${JSON.stringify({
          type: 'error',
          error: event.error_message
        })}\n\n`;
        controller.enqueue(encoder.encode(errorChunk));
        controller.close();
      });

      // Wait for completion
      try {
        await run.waitForStatus('completed', { timeoutMs: 60000 });
      } catch (error) {
        await run.waitForStatus('failed');
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'x-vercel-ai-ui-message-stream': 'v1',
    },
  });
}
```

**Frontend:**
```typescript
// app/page.tsx
'use client';
import { useChat } from '@ai-sdk/react';

export default function Chat() {
  const { messages, sendMessage, status } = useChat({
    api: '/api/chat',
  });

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>{m.content}</div>
      ))}
      <button
        onClick={() => sendMessage({ content: 'Hello!' })}
        disabled={status === 'streaming'}
      >
        Send
      </button>
    </div>
  );
}
```

**Advantages:**
- ✅ Simple to implement
- ✅ Works with existing pgflow infrastructure
- ✅ Full server-side control and security
- ✅ Compatible with Vercel deployment
- ✅ Can leverage Next.js middleware

**Disadvantages:**
- ❌ Requires server component for pgflow client
- ❌ Additional network hop (client → API → pgflow)

---

### 2.2 Pattern B: Custom PgflowChatTransport

**Architecture:**
```
React UI (useChat with custom transport)
  → PgflowChatTransport
    → Pgflow Client (browser)
      → Supabase Realtime (WebSocket)
        → Pgflow Database
```

**Implementation:**

```typescript
// lib/pgflow-chat-transport.ts
import { PgflowClient } from '@pgflow/client/browser';
import type { ChatTransport, UIMessageChunk } from '@ai-sdk/react';

export class PgflowChatTransport implements ChatTransport<UIMessage> {
  constructor(
    private pgflowClient: PgflowClient,
    private flowSlug: string,
  ) {}

  async sendMessages(options): Promise<ReadableStream<UIMessageChunk>> {
    const { messages, chatId } = options;
    const lastMessage = messages[messages.length - 1];

    // Start or continue flow
    const run = await this.pgflowClient.startFlow(this.flowSlug, {
      message: lastMessage.content,
      conversation_id: chatId,
      history: messages.slice(0, -1),
    }, chatId); // Use chatId as run_id for continuity

    return new ReadableStream({
      async start(controller) {
        // Listen to all events
        const unsubscribe = run.on('*', (event) => {
          switch (event.event_type) {
            case 'run:started':
              controller.enqueue({
                type: 'start',
                id: run.run_id,
              } as UIMessageChunk);
              break;

            case 'run:completed':
              // Enqueue text content
              controller.enqueue({
                type: 'text-delta',
                text: event.output.response,
              } as UIMessageChunk);

              // Finish message
              controller.enqueue({
                type: 'finish',
                finishReason: 'stop',
              } as UIMessageChunk);

              unsubscribe();
              controller.close();
              break;

            case 'run:failed':
              controller.enqueue({
                type: 'error',
                error: new Error(event.error_message),
              } as UIMessageChunk);
              unsubscribe();
              controller.close();
              break;
          }
        });

        // Stream intermediate steps
        if (run.hasStep('reasoning')) {
          run.step('reasoning').on('completed', (event) => {
            controller.enqueue({
              type: 'data-reasoning',
              data: event.output,
            } as UIMessageChunk);
          });
        }

        // Wait for completion
        try {
          await run.waitForStatus('completed', {
            timeoutMs: 60000,
            signal: options.abortSignal,
          });
        } catch (error) {
          if (error.name !== 'AbortError') {
            controller.error(error);
          }
        }
      },

      cancel() {
        // Cleanup if needed
        run.dispose?.();
      },
    });
  }

  async reconnectToStream(options): Promise<ReadableStream<UIMessageChunk> | null> {
    const { chatId } = options;

    // Try to get existing run
    const run = await this.pgflowClient.getRun(chatId);
    if (!run) return null;

    // If already completed, return null
    if (run.status === 'completed' || run.status === 'failed') {
      return null;
    }

    // Re-subscribe to events
    return new ReadableStream({
      async start(controller) {
        const unsubscribe = run.on('*', (event) => {
          // Same event handling as sendMessages
          // ... (similar logic)
        });

        await run.waitForStatus('completed', { timeoutMs: 60000 });
      },
    });
  }
}
```

**Usage:**
```typescript
// app/page.tsx
'use client';
import { useChat } from '@ai-sdk/react';
import { PgflowClient } from '@pgflow/client/browser';
import { createClient } from '@supabase/supabase-js';
import { PgflowChatTransport } from '@/lib/pgflow-chat-transport';
import { useMemo } from 'react';

export default function Chat() {
  const transport = useMemo(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const pgflow = new PgflowClient(supabase);
    return new PgflowChatTransport(pgflow, 'chat_workflow');
  }, []);

  const { messages, sendMessage } = useChat({
    transport,
  });

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>{m.content}</div>
      ))}
      <button onClick={() => sendMessage({ content: 'Hello!' })}>
        Send
      </button>
    </div>
  );
}
```

**Advantages:**
- ✅ Direct browser → database communication (no API middleman)
- ✅ Leverages Supabase Realtime's WebSocket infrastructure
- ✅ Automatic reconnection via Supabase
- ✅ Works in offline-first scenarios
- ✅ Real-time progress from all workflow steps

**Disadvantages:**
- ❌ Requires exposing Supabase credentials to browser
- ❌ Limited server-side control (auth, validation)
- ❌ RLS policies must be carefully configured
- ❌ Cannot use service role key (security risk)

---

### 2.3 Pattern C: Hybrid with AI SDK Core

**Architecture:**
```
useChat
  → API Route
    → Pgflow flow for orchestration
    → AI SDK Core for LLM calls (streamText)
    → Combine streams
  ← SSE Response
```

**Use Case:** Use pgflow for complex workflow orchestration (RAG, tool calling, multi-agent) while using AI SDK Core's native LLM streaming for the final response generation.

**Implementation:**

```typescript
// app/api/chat/route.ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { PgflowClient } from '@pgflow/client';

export async function POST(req: Request) {
  const { messages } = await req.json();
  const supabase = createClient(...);
  const pgflow = new PgflowClient(supabase);

  // Run pgflow for context retrieval/preparation
  const prepRun = await pgflow.startFlow('chat_context_prep', {
    message: messages[messages.length - 1].content,
  });

  await prepRun.waitForStatus('completed');
  const context = prepRun.output;

  // Use AI SDK Core for streaming LLM response
  const result = streamText({
    model: openai('gpt-4'),
    messages: [
      { role: 'system', content: context.systemPrompt },
      ...messages,
    ],
  });

  return result.toDataStreamResponse();
}
```

**Advantages:**
- ✅ Best of both worlds: pgflow orchestration + AI SDK streaming
- ✅ Leverages AI SDK's built-in provider integrations
- ✅ Native tool calling support
- ✅ Automatic token counting, retries, etc.

**Disadvantages:**
- ❌ More complex architecture
- ❌ Two systems to maintain

---

## 3. Key Integration Points

### 3.1 Event Mapping

**Pgflow Events → AI SDK Stream Protocol:**

| Pgflow Event | AI SDK Chunk Type | Implementation |
|--------------|-------------------|----------------|
| `run:started` | `start` | Send start chunk with run ID |
| `run:completed` | `text-delta` + `finish` | Send final output as text, then finish |
| `run:failed` | `error` | Send error chunk |
| `step:completed` (reasoning) | `reasoning-delta` | Stream intermediate reasoning |
| `step:completed` (tool) | `tool-input-delta` | Stream tool execution progress |
| Custom step output | `data-[type]` | Custom data parts |

**Example Mapping Function:**
```typescript
function mapPgflowEventToAISDK(
  event: FlowRunEvent | StepEvent
): UIMessageChunk[] {
  switch (event.event_type) {
    case 'run:started':
      return [{ type: 'start', id: event.run_id }];

    case 'run:completed':
      return [
        { type: 'text-delta', text: event.output.response },
        { type: 'finish', finishReason: 'stop' }
      ];

    case 'run:failed':
      return [{
        type: 'error',
        error: new Error(event.error_message)
      }];

    case 'step:completed':
      // Map based on step type
      if (event.step_slug === 'reasoning') {
        return [{
          type: 'data-reasoning',
          data: event.output
        }];
      }
      return [];

    default:
      return [];
  }
}
```

### 3.2 Type Safety Bridge

**Challenge:** Maintain type safety across pgflow flows and AI SDK messages.

**Solution:** Define shared types and conversion utilities.

```typescript
// types/chat.ts
import type { UIMessage } from '@ai-sdk/react';
import type { ExtractFlowInput, ExtractFlowOutput } from '@pgflow/dsl';

// Define your flow types
export const ChatFlow = new Flow<{
  message: string;
  history: UIMessage[];
}>({ slug: 'chat_workflow' })
  .step('parse', async (input) => ({ intent: string }))
  .step('generate', async () => ({ response: string }))
  .step('format', async () => ({ response: string }));

export type ChatFlowInput = ExtractFlowInput<typeof ChatFlow>;
export type ChatFlowOutput = ExtractFlowOutput<typeof ChatFlow>;

// Converters
export function uiMessagesToFlowInput(
  messages: UIMessage[]
): ChatFlowInput {
  return {
    message: messages[messages.length - 1].content,
    history: messages.slice(0, -1),
  };
}

export function flowOutputToUIMessage(
  output: ChatFlowOutput,
  id: string
): UIMessage {
  return {
    id,
    role: 'assistant',
    content: output.response,
  };
}
```

### 3.3 Authentication & Authorization

**For Backend Pattern (A):**
- Use Next.js middleware for auth
- Pass user context to pgflow flows
- Configure Supabase RLS policies

```typescript
// middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const { data: { session } } = await supabase.auth.getSession();

  if (!session && req.nextUrl.pathname.startsWith('/api/chat')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return res;
}
```

**For Custom Transport Pattern (B):**
- Configure Supabase RLS policies to restrict flow access by user ID
- Use anon key in browser with RLS enforcement
- Example RLS policy:

```sql
-- Only allow users to start flows for themselves
CREATE POLICY "Users can start their own flows"
ON flow_runs
FOR INSERT
USING (auth.uid() = user_id);

-- Only allow users to read their own flow runs
CREATE POLICY "Users can read their own runs"
ON flow_runs
FOR SELECT
USING (auth.uid() = user_id);
```

---

## 4. Advanced Use Cases

### 4.1 Multi-Step Conversation with Progress

Show intermediate workflow steps to users:

```typescript
// Frontend
const { messages, sendMessage, data } = useChat({
  api: '/api/chat',
  onData: (chunk) => {
    if (chunk.type === 'data-search') {
      console.log('Search results:', chunk.data);
      // Update UI with search progress
    }
    if (chunk.type === 'data-reasoning') {
      console.log('AI reasoning:', chunk.data);
      // Show reasoning to user
    }
  },
});

// Backend
run.step('search').on('completed', (event) => {
  controller.enqueue(encoder.encode(
    `data: ${JSON.stringify({
      type: 'data-search',
      data: event.output
    })}\n\n`
  ));
});

run.step('reasoning').on('completed', (event) => {
  controller.enqueue(encoder.encode(
    `data: ${JSON.stringify({
      type: 'data-reasoning',
      data: event.output
    })}\n\n`
  ));
});
```

### 4.2 Tool Calling Integration

Pgflow orchestrates tool execution, AI SDK displays it:

```typescript
// Define flow with tool steps
const ChatFlow = new Flow({ slug: 'chat_with_tools' })
  .step('detect_intent', async (input) => ({
    needsTool: boolean,
    tool: string
  }))
  .step('execute_tool', async () => ({ result: any }))
  .step('generate_response', async () => ({ response: string }));

// Backend: Map tool execution to AI SDK format
run.step('execute_tool').on('started', (event) => {
  controller.enqueue(encoder.encode(
    `data: ${JSON.stringify({
      type: 'tool-input-start',
      toolCallId: event.step_slug,
      toolName: 'search',
    })}\n\n`
  ));
});

run.step('execute_tool').on('completed', (event) => {
  controller.enqueue(encoder.encode(
    `data: ${JSON.stringify({
      type: 'tool-input-available',
      toolCallId: event.step_slug,
      result: event.output,
    })}\n\n`
  ));
});
```

### 4.3 Multimodal Messages

Pgflow processes images/files, streams results:

```typescript
// Flow with image processing
const VisionFlow = new Flow<{
  message: string;
  image_url: string;
}>({ slug: 'vision_chat' })
  .step('analyze_image', async (input) => ({
    description: string
  }))
  .step('generate_response', async () => ({
    response: string
  }));

// Frontend: Send multimodal message
sendMessage({
  content: 'What is in this image?',
  experimental_attachments: [{
    url: imageUrl,
    contentType: 'image/png',
  }],
});

// Backend: Process in pgflow
const run = await pgflow.startFlow('vision_chat', {
  message: lastMessage.content,
  image_url: lastMessage.experimental_attachments[0].url,
});
```

### 4.4 Conversation Memory & History

Leverage pgflow's database persistence:

```typescript
// Backend
export async function POST(req: Request) {
  const { messages, id: chatId } = await req.json();

  // Check if this is a continuing conversation
  const existingRun = await pgflow.getRun(chatId);

  if (existingRun && existingRun.status === 'completed') {
    // Start new run in same conversation
    const run = await pgflow.startFlow('chat_workflow', {
      message: lastMessage.content,
      conversation_id: chatId,
      previous_run_id: existingRun.run_id,
    });
    // ...
  }
}

// Query conversation history via pgflow
const conversationHistory = await supabase
  .from('flow_runs')
  .select('input, output, created_at')
  .eq('flow_slug', 'chat_workflow')
  .eq('input->conversation_id', conversationId)
  .order('created_at', { ascending: true });
```

---

## 5. Implementation Recommendations

### 5.1 Getting Started (Recommended Path)

1. **Start with Pattern A (Backend Integration):**
   - Simplest to implement and secure
   - Create `/api/chat` route in Next.js
   - Use pgflow client server-side
   - Map pgflow events to SSE chunks

2. **Define Your Chat Flow:**
   ```typescript
   // flows/chat-flow.ts
   import { Flow } from '@pgflow/dsl';

   export const ChatFlow = new Flow<{
     message: string;
     user_id: string;
   }>({ slug: 'chat_workflow' })
     .step('parse_intent', async (input) => {
       // Intent classification
       return { intent: 'question', entities: [] };
     })
     .step('retrieve_context', async ({ intent }) => {
       // RAG / vector search
       return { documents: [] };
     })
     .step('generate_response', async ({ documents, message }) => {
       // LLM call
       return { response: 'AI response here' };
     });
   ```

3. **Test Integration:**
   - Start with simple message → response flow
   - Add step-by-step progress indicators
   - Implement error handling

4. **Iterate:**
   - Add tool calling
   - Add multimodal support
   - Optimize performance

### 5.2 Production Considerations

**Performance:**
- Use Supabase connection pooling for pgflow
- Configure `realtimeStabilizationDelayMs` for latency
- Set appropriate timeouts in `waitForStatus`
- Consider caching flow definitions

**Error Handling:**
```typescript
// Retry logic for transient failures
let retries = 3;
while (retries > 0) {
  try {
    const run = await pgflow.startFlow(flowSlug, input);
    await run.waitForStatus('completed', { timeoutMs: 60000 });
    break;
  } catch (error) {
    retries--;
    if (retries === 0) throw error;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
```

**Monitoring:**
```typescript
// Log all pgflow events
pgflow.onRunEvent((event) => {
  analytics.track('pgflow_run_event', {
    event_type: event.event_type,
    run_id: event.run_id,
    flow_slug: event.flow_slug,
  });
});

// Track latency
const startTime = Date.now();
run.on('completed', () => {
  const duration = Date.now() - startTime;
  metrics.histogram('pgflow_run_duration_ms', duration);
});
```

**Testing:**
```typescript
// Test pgflow flows independently
describe('ChatFlow', () => {
  it('should generate response', async () => {
    const run = await pgflow.startFlow('chat_workflow', {
      message: 'Hello',
      user_id: 'test-user',
    });

    await run.waitForStatus('completed', { timeoutMs: 10000 });

    expect(run.status).toBe('completed');
    expect(run.output).toHaveProperty('response');
  });
});

// Test API route integration
describe('/api/chat', () => {
  it('should stream SSE response', async () => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    });

    expect(response.headers.get('x-vercel-ai-ui-message-stream')).toBe('v1');

    const reader = response.body.getReader();
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }

    expect(chunks.some(c => c.includes('text-delta'))).toBe(true);
    expect(chunks.some(c => c.includes('[DONE]'))).toBe(true);
  });
});
```

### 5.3 Migration Path

**From Existing AI SDK App:**

1. Identify complex workflows in your current API routes
2. Extract them into pgflow flows
3. Replace direct LLM calls with pgflow client calls
4. Keep simple requests using AI SDK Core

**From Existing Pgflow App:**

1. Add Vercel AI SDK to your Next.js app
2. Create API route that wraps pgflow client
3. Replace custom chat UI with `useChat` hook
4. Migrate event handling to AI SDK patterns

---

## 6. Comparison with Other Approaches

### 6.1 vs. Direct AI SDK Core Usage

| Aspect | Pgflow + useChat | AI SDK Core Only |
|--------|------------------|------------------|
| Workflow Orchestration | ✅ Native multi-step DAGs | ❌ Manual orchestration |
| State Persistence | ✅ Database-backed | ❌ Ephemeral |
| Real-time Progress | ✅ Event-driven per step | ⚠️ Only final stream |
| Type Safety | ✅ Full generics | ✅ Full generics |
| Tool Calling | ⚠️ Manual implementation | ✅ Native support |
| Provider Support | ⚠️ Custom integration | ✅ 30+ providers |
| Complexity | ⚠️ Higher (two systems) | ✅ Lower (single SDK) |

**Recommendation:** Use pgflow for complex, multi-step workflows. Use AI SDK Core for simple chat.

### 6.2 vs. LangChain + useChat

| Aspect | Pgflow | LangChain |
|--------|--------|-----------|
| Execution Model | Database-backed workflow engine | In-memory chains |
| Streaming | Native event-driven | Via callbacks |
| State Management | PostgreSQL persistence | Redis/memory |
| Observability | Built-in via database | Requires LangSmith |
| Scalability | Database-native concurrency | Process-based |

### 6.3 vs. Custom WebSocket Implementation

| Aspect | Pgflow + Supabase Realtime | Custom WebSocket |
|--------|----------------------------|------------------|
| Connection Management | ✅ Handled by Supabase | ❌ Manual implementation |
| Reconnection | ✅ Automatic | ❌ Manual logic |
| Scaling | ✅ Supabase infrastructure | ❌ Custom load balancing |
| Security | ✅ RLS policies | ❌ Custom auth |

---

## 7. Next Steps

### Proof of Concept

1. Create a simple chat flow in pgflow:
   ```bash
   cd /home/user/pgflow
   # Define flow in examples/ or test in your app
   ```

2. Implement basic API route:
   ```typescript
   // app/api/chat/route.ts
   // Use Pattern A implementation from section 2.1
   ```

3. Test with `useChat`:
   ```typescript
   // app/page.tsx
   // Use basic useChat example from section 2.1
   ```

### Enhancements

- [ ] Create `@pgflow/ai-sdk` integration package
- [ ] Add helper utilities for event mapping
- [ ] Implement `PgflowChatTransport` class
- [ ] Add example flows for common patterns (RAG, agents, etc.)
- [ ] Create Next.js template with pgflow + AI SDK
- [ ] Add monitoring/observability helpers

### Documentation

- [ ] Add pgflow examples in `/examples/ai-chat`
- [ ] Document best practices for chat workflows
- [ ] Create migration guide for AI SDK users
- [ ] Add troubleshooting guide

---

## 8. Conclusion

**Pgflow and Vercel AI SDK are highly complementary:**

- **Pgflow** excels at orchestrating complex, multi-step AI workflows with database-backed state management
- **Vercel AI SDK** provides excellent frontend primitives and streaming UX

**Best Integration:** Use pgflow as the backend workflow engine with AI SDK's `useChat` hook for the frontend, connecting them via either:
1. A Next.js API route that transforms pgflow events to SSE (recommended for most cases)
2. A custom `PgflowChatTransport` for direct browser-to-database communication (advanced use cases)

**This integration enables:**
- Type-safe, multi-step AI workflows
- Real-time streaming of intermediate progress
- Database-backed conversation history
- Scalable, production-ready architecture
- Best-in-class developer experience

The complementary strengths of both tools make them an excellent foundation for building sophisticated AI chat applications.

---

## References

### Pgflow Resources
- Pgflow Client Documentation: `/home/user/pgflow/pkgs/client/`
- Flow DSL: `/home/user/pgflow/pkgs/dsl/`
- Examples: `/home/user/pgflow/examples/`

### Vercel AI SDK Resources
- [AI SDK Documentation](https://ai-sdk.dev)
- [useChat Reference](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat)
- [Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
- [Custom Transports](https://ai-sdk.dev/docs/ai-sdk-ui/transport)
- [GitHub Repository](https://github.com/vercel/ai)
- [AI SDK 5 Announcement](https://vercel.com/blog/ai-sdk-5)
- [AI SDK 6 Announcement](https://vercel.com/blog/ai-sdk-6)

### Community Examples
- [WebSocket Transport Discussion](https://github.com/vercel/ai/discussions/5607)
- [Custom Provider Implementation](https://ai-sdk.dev/providers/community-providers/custom-providers)
- [WorkflowChatTransport](https://useworkflow.dev/docs/api-reference/workflow-ai/workflow-chat-transport) (similar concept)
