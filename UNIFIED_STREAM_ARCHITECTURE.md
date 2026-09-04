# Unified Stream Architecture: Pgflow Events + LLM Streaming

## The Vision

**Single continuous stream that includes:**
1. Pgflow step events (preparation progress) → displayed as AI SDK data chunks
2. Final LLM streaming (actual response) → displayed as message content

**User experience:**
```
User: "What is quantum computing?"

AI: [Searching knowledge base...]
    [Found 15 results]
    [Ranking by relevance...]
    [Top 5 results selected]
    [Extracting key information...]
    [Generating response...]

    Quantum computing is a type of computation that harnesses...
    [streams token by token]
```

**All in one useChat conversation!**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend                                                     │
│   useChat({ api: '/api/chat' })                             │
│     ↓ receives SSE stream with:                             │
│     - data-search (pgflow event)                            │
│     - data-rank (pgflow event)                              │
│     - text-delta (LLM tokens)                               │
│     - finish                                                 │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ↓ Single SSE connection
                  │
┌─────────────────┴───────────────────────────────────────────┐
│ POST /api/chat (Node.js, 300s timeout)                     │
│                                                              │
│  1. Start pgflow flow                                       │
│  2. Subscribe to step events (Realtime)                     │
│  3. Convert pgflow events → SSE data chunks                 │
│  4. When preparation complete, start LLM streaming          │
│  5. Stream LLM tokens → SSE text-delta chunks               │
│  6. Close stream when done                                  │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ↕
┌─────────────────┴───────────────────────────────────────────┐
│ Supabase Realtime + Database                                │
│                                                              │
│  Pgflow Flow Execution:                                     │
│    ├─ search → broadcasts 'step:completed'                  │
│    ├─ rank → broadcasts 'step:completed'                    │
│    └─ extract → broadcasts 'step:completed'                 │
└──────────────────────────────────────────────────────────────┘
```

---

## Implementation

### Backend: Single Unified Endpoint

```typescript
// app/api/chat/route.ts
export const runtime = 'nodejs'; // 300s timeout
export const dynamic = 'force-dynamic';

import { PgflowClient } from '@pgflow/client';
import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';

export async function POST(req: Request) {
  const { messages } = await req.json();
  const userMessage = messages[messages.length - 1].content;

  // Auth check
  const session = await getServerSession(req);
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Initialize
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const pgflow = new PgflowClient(supabase);

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendChunk = (data: any) => {
        const chunk = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(chunk));
      };

      try {
        // Send start event
        sendChunk({ type: 'start', id: crypto.randomUUID() });

        // ==========================================
        // PHASE 1: Pgflow Preparation with Progress
        // ==========================================

        // Start pgflow flow
        const run = await pgflow.startFlow('chat_preparation', {
          message: userMessage,
          userId: session.user.id,
        });

        // Track preparation data for LLM context
        let preparationContext: any = {};

        // Listen to step events and convert to AI SDK chunks
        const stepEventListener = pgflow.onStepEvent((event) => {
          if (event.run_id !== run.run_id) return;

          // Step started - send progress
          if (event.event_type === 'step:started') {
            const messages = {
              search: 'Searching knowledge base...',
              rerank: 'Ranking results by relevance...',
              extract: 'Extracting key information...',
              prepare_context: 'Preparing response context...',
            };

            sendChunk({
              type: 'data-progress',
              data: {
                step: event.step_slug,
                status: 'started',
                message: messages[event.step_slug] || `Processing ${event.step_slug}...`,
              },
            });
          }

          // Step completed - send results
          if (event.event_type === 'step:completed') {
            // Store for context
            preparationContext[event.step_slug] = event.output;

            // Send to frontend
            sendChunk({
              type: `data-${event.step_slug}`,
              data: event.output,
            });

            // Send completion message
            const completionMessages = {
              search: `Found ${event.output?.count || 0} results`,
              rerank: `Selected top ${event.output?.topResults?.length || 0} results`,
              extract: `Extracted ${event.output?.chunks?.length || 0} relevant passages`,
              prepare_context: 'Context ready',
            };

            sendChunk({
              type: 'data-progress',
              data: {
                step: event.step_slug,
                status: 'completed',
                message: completionMessages[event.step_slug] || 'Completed',
              },
            });
          }

          // Step failed
          if (event.event_type === 'step:failed') {
            sendChunk({
              type: 'error',
              error: `Failed at ${event.step_slug}: ${event.error_message}`,
            });
          }
        });

        // Wait for preparation to complete
        try {
          await run.waitForStatus('completed', {
            timeoutMs: 60000, // 60 seconds for preparation
          });
        } catch (error) {
          stepEventListener(); // Unsubscribe
          sendChunk({
            type: 'error',
            error: 'Preparation timed out',
          });
          controller.close();
          return;
        }

        // Unsubscribe from step events
        stepEventListener();

        // Get final context
        const finalContext = run.output || preparationContext.prepare_context;

        if (!finalContext) {
          sendChunk({
            type: 'error',
            error: 'Preparation completed but no context available',
          });
          controller.close();
          return;
        }

        // ==========================================
        // PHASE 2: LLM Streaming
        // ==========================================

        sendChunk({
          type: 'data-progress',
          data: {
            step: 'generate',
            status: 'started',
            message: 'Generating response...',
          },
        });

        // Initialize OpenAI
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });

        // Stream LLM response
        const llmStream = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: finalContext.systemPrompt || `Context: ${JSON.stringify(finalContext)}`,
            },
            ...messages,
          ],
          stream: true,
        });

        // Stream tokens
        for await (const chunk of llmStream) {
          const delta = chunk.choices[0]?.delta?.content || '';
          if (delta) {
            sendChunk({
              type: 'text-delta',
              text: delta,
            });
          }
        }

        // Send sources as final data
        if (finalContext.sources) {
          sendChunk({
            type: 'data-sources',
            data: {
              sources: finalContext.sources,
            },
          });
        }

        // Send finish
        sendChunk({
          type: 'finish',
          finishReason: 'stop',
        });

        controller.close();
      } catch (error) {
        console.error('Stream error:', error);
        sendChunk({
          type: 'error',
          error: error.message,
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

---

## Frontend: Standard useChat with Progress Display

```typescript
// app/chat/page.tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

export default function ChatPage() {
  const [progressSteps, setProgressSteps] = useState<
    Array<{ step: string; status: string; message: string }>
  >([]);
  const [searchData, setSearchData] = useState<any>(null);
  const [rankData, setRankData] = useState<any>(null);
  const [sources, setSources] = useState<any[]>([]);

  const { messages, sendMessage, status } = useChat({
    api: '/api/chat',

    // Handle custom data chunks
    onData: (chunk) => {
      // Progress updates
      if (chunk.type === 'data-progress') {
        setProgressSteps((prev) => {
          const existing = prev.findIndex((p) => p.step === chunk.data.step);
          if (existing >= 0) {
            // Update existing step
            const updated = [...prev];
            updated[existing] = chunk.data;
            return updated;
          } else {
            // Add new step
            return [...prev, chunk.data];
          }
        });
      }

      // Search results
      if (chunk.type === 'data-search') {
        setSearchData(chunk.data);
      }

      // Rank results
      if (chunk.type === 'data-rerank') {
        setRankData(chunk.data);
      }

      // Sources
      if (chunk.type === 'data-sources') {
        setSources(chunk.data.sources);
      }
    },

    // Clear progress on new message
    onBeforeSend: () => {
      setProgressSteps([]);
      setSearchData(null);
      setRankData(null);
      setSources([]);
    },
  });

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto p-4">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`p-4 rounded-lg ${
              message.role === 'user' ? 'bg-blue-100' : 'bg-gray-100'
            }`}
          >
            <div className="font-semibold mb-2">
              {message.role === 'user' ? '🧑 You' : '🤖 AI'}
            </div>
            <div className="whitespace-pre-wrap">{message.content}</div>

            {/* Show sources after message */}
            {message.role === 'assistant' && sources.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-300">
                <div className="text-sm font-semibold text-gray-700 mb-2">
                  Sources:
                </div>
                <div className="space-y-1">
                  {sources.map((source, idx) => (
                    <div key={idx} className="text-xs text-gray-600">
                      [{idx + 1}] {source}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Progress indicator during streaming */}
        {status === 'streaming' && progressSteps.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="font-semibold text-blue-900 mb-3">
              🔄 Processing...
            </div>

            {/* Step progress */}
            <div className="space-y-2">
              {progressSteps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  {step.status === 'started' && (
                    <div className="animate-spin h-3 w-3 border-2 border-blue-600 border-t-transparent rounded-full" />
                  )}
                  {step.status === 'completed' && (
                    <div className="text-green-600">✓</div>
                  )}
                  <span className="text-gray-700">{step.message}</span>
                </div>
              ))}
            </div>

            {/* Detailed data (expandable) */}
            {searchData && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
                  Search results ({searchData.count})
                </summary>
                <div className="mt-2 text-xs text-gray-600">
                  {JSON.stringify(searchData, null, 2)}
                </div>
              </details>
            )}

            {rankData && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
                  Ranking details
                </summary>
                <div className="mt-2 text-xs text-gray-600">
                  {JSON.stringify(rankData, null, 2)}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          const message = formData.get('message') as string;
          if (message.trim()) {
            sendMessage({ content: message });
            e.currentTarget.reset();
          }
        }}
        className="flex gap-2"
      >
        <input
          name="message"
          type="text"
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2"
          placeholder="Ask anything..."
          disabled={status === 'streaming'}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={status === 'streaming'}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {status === 'streaming' ? '⏳' : '📤'} Send
        </button>
      </form>
    </div>
  );
}
```

---

## Event Mapping: Pgflow → AI SDK

### Pgflow Events

```typescript
// Step started
{
  event_type: 'step:started',
  run_id: 'abc123',
  step_slug: 'search',
}

// Step completed
{
  event_type: 'step:completed',
  run_id: 'abc123',
  step_slug: 'search',
  output: { count: 10, results: [...] }
}
```

### AI SDK Chunks (sent via SSE)

```typescript
// Progress indicator (custom data)
data: {"type":"data-progress","data":{"step":"search","status":"started","message":"Searching knowledge base..."}}

// Step result (custom data)
data: {"type":"data-search","data":{"count":10,"results":[...]}}

// Completion indicator (custom data)
data: {"type":"data-progress","data":{"step":"search","status":"completed","message":"Found 10 results"}}

// LLM token (text)
data: {"type":"text-delta","text":"Quantum"}

// Finish
data: {"type":"finish","finishReason":"stop"}
```

---

## Alternative: Custom Wrapper Hook

For even better DX, create a wrapper around `useChat`:

```typescript
// hooks/use-pgflow-chat.ts
import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

interface ProgressStep {
  step: string;
  status: 'started' | 'completed' | 'failed';
  message: string;
  data?: any;
}

export function usePgflowChat(options?: {
  api?: string;
  onStepComplete?: (step: string, data: any) => void;
}) {
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [preparationData, setPreparationData] = useState<Record<string, any>>({});

  const chat = useChat({
    api: options?.api || '/api/chat',

    onData: (chunk) => {
      // Handle progress updates
      if (chunk.type === 'data-progress') {
        setProgressSteps((prev) => {
          const existing = prev.findIndex((p) => p.step === chunk.data.step);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = { ...updated[existing], ...chunk.data };
            return updated;
          }
          return [...prev, chunk.data];
        });
      }

      // Handle step data
      if (chunk.type.startsWith('data-') && chunk.type !== 'data-progress') {
        const stepName = chunk.type.replace('data-', '');
        setPreparationData((prev) => ({
          ...prev,
          [stepName]: chunk.data,
        }));

        options?.onStepComplete?.(stepName, chunk.data);
      }
    },

    onBeforeSend: () => {
      // Clear progress on new message
      setProgressSteps([]);
      setPreparationData({});
    },
  });

  return {
    ...chat,
    progressSteps,
    preparationData,
    isPrepairing: progressSteps.some((s) => s.status === 'started'),
  };
}
```

### Usage

```typescript
const {
  messages,
  sendMessage,
  status,
  progressSteps,
  preparationData,
  isPrepairing,
} = usePgflowChat({
  onStepComplete: (step, data) => {
    console.log(`Step ${step} completed:`, data);
  },
});

return (
  <div>
    {/* Show progress */}
    {isPrepairing && (
      <ProgressBar steps={progressSteps} />
    )}

    {/* Show messages */}
    {messages.map(m => <Message key={m.id}>{m.content}</Message>)}

    {/* Show search results while preparing */}
    {preparationData.search && (
      <SearchResults data={preparationData.search} />
    )}
  </div>
);
```

---

## Visual Timeline

What the user sees during a conversation:

```
[User sends: "What is quantum computing?"]

Time: 0s
  🔄 Processing...
     ⏳ Searching knowledge base...

Time: 2s
  🔄 Processing...
     ✓ Found 15 results
     ⏳ Ranking results by relevance...

Time: 5s
  🔄 Processing...
     ✓ Found 15 results
     ✓ Selected top 5 results
     ⏳ Extracting key information...

Time: 8s
  🔄 Processing...
     ✓ Found 15 results
     ✓ Selected top 5 results
     ✓ Extracted 12 relevant passages
     ⏳ Generating response...

Time: 9s
  🤖 AI: Quantum|

Time: 9.05s
  🤖 AI: Quantum computing|

Time: 9.1s
  🤖 AI: Quantum computing is|

[continues streaming tokens...]

Time: 20s
  🤖 AI: Quantum computing is a type of computation that...
         [complete response]

     Sources:
     [1] Wikipedia: Quantum Computing
     [2] MIT OpenCourseware: Quantum Information
```

---

## Advantages

### ✅ **Unified User Experience**
- Everything in one chat conversation
- Progress updates feel native
- Smooth transition from prep → streaming

### ✅ **Standard AI SDK Patterns**
- Uses regular `useChat` hook
- Custom data chunks for progress
- No custom transport needed

### ✅ **Real-time Progress**
- User sees each step as it happens
- Can show detailed data (search results, etc.)
- Better UX than "loading..."

### ✅ **Pgflow Benefits**
- Multi-step orchestration
- Durable storage
- Can query past preparations
- Retry individual steps

### ✅ **Fast Final Streaming**
- LLM tokens stream via SSE (28-48ms)
- No Realtime overhead for tokens
- Only Realtime used for coarse step events

---

## Comparison

| Approach | Progress Updates | Final Streaming | Complexity | UX |
|----------|-----------------|-----------------|------------|-----|
| **Unified Stream** | ✅ Real-time in chat | ✅ Fast (SSE) | Medium | ⭐⭐⭐⭐⭐ |
| Split Architecture | ⚠️ Separate UI | ✅ Fast (SSE) | Low | ⭐⭐⭐ |
| Frontend Transport | ✅ Real-time in chat | ❌ Slow (Realtime) | High | ⭐⭐⭐ |

---

## Implementation Checklist

- [ ] Create pgflow preparation flow with meaningful step names
- [ ] Implement /api/chat endpoint with dual-phase streaming
- [ ] Subscribe to pgflow step events in API route
- [ ] Map step events → AI SDK data chunks
- [ ] Frontend: Use `useChat` with `onData` handler
- [ ] Display progress steps in chat UI
- [ ] Show detailed step data (collapsible)
- [ ] Test with realistic multi-step flow
- [ ] Add error handling for step failures
- [ ] Polish progress indicators (animations, icons)

---

## Potential Issues & Solutions

### Issue 1: API Route Timeout During Preparation

**Problem:** Preparation takes 60s, but connection times out.

**Solution:**
```typescript
// Keep connection alive with periodic heartbeats
const heartbeat = setInterval(() => {
  sendChunk({ type: 'heartbeat' });
}, 10000); // Every 10 seconds

// Clear on completion
clearInterval(heartbeat);
```

### Issue 2: Realtime Event Delay

**Problem:** Step events arrive with 100-200ms delay.

**Solution:** This is acceptable for coarse-grained progress. Users won't notice 200ms delay when each step takes 3-5 seconds.

### Issue 3: Failed Steps

**Problem:** Step fails, but user sees partial progress.

**Solution:**
```typescript
if (event.event_type === 'step:failed') {
  sendChunk({
    type: 'data-progress',
    data: {
      step: event.step_slug,
      status: 'failed',
      message: `Failed: ${event.error_message}`,
    },
  });

  sendChunk({
    type: 'error',
    error: `Preparation failed at ${event.step_slug}`,
  });

  controller.close();
}
```

---

## Conclusion

**This unified stream architecture gives you:**

✅ **Everything in one conversation** (prep progress + final response)
✅ **Real-time updates** (pgflow events → AI SDK data chunks)
✅ **Fast LLM streaming** (standard SSE, 28-48ms)
✅ **Standard patterns** (useChat, no custom transport)
✅ **Great UX** (users see step-by-step progress)
✅ **Pgflow benefits** (orchestration, durability, observability)

**Perfect for Perplexity-style multi-step AI apps.**

The key insight: **Pgflow events become AI SDK data chunks**, displayed alongside the final streaming response in one unified chat experience.
