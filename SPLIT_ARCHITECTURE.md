# Split Architecture: Pgflow Preparation + Separate Streaming

## The Elegant Solution

Split the pipeline into two distinct phases:

1. **Pgflow Flow**: Multi-step preparation (search, rank, analyze) - durable, database-backed
2. **Streaming Endpoint**: Simple LLM proxy - fast, standard SSE streaming

**Key Insight:** Pgflow orchestrates **preparation**, not **streaming**.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (React + useChat)                                  │
└────┬─────────────────────────────────────────────┬──────────┘
     │                                              │
     │ 1. Start preparation                        │ 3. Start streaming
     │                                              │
     ↓                                              ↓
┌────────────────────────┐              ┌─────────────────────┐
│ POST /api/prepare      │              │ POST /api/stream    │
│ (Node.js, 300s)        │              │ (Edge, 25s is fine) │
│                        │              │                     │
│ Starts pgflow flow     │              │ Reads context       │
│ Returns runId          │              │ Proxies LLM         │
└────┬───────────────────┘              └──────┬──────────────┘
     │                                         │
     ↓                                         ↓
┌────────────────────────────────────────────────────────────┐
│ Supabase Database                                          │
│                                                            │
│  Pgflow Flow Execution:                                   │
│    ├─ Step 1: search (5s) → results stored                │
│    ├─ Step 2: rerank (3s) → rankings stored               │
│    ├─ Step 3: extract (4s) → chunks stored                │
│    └─ Status: completed                                   │
│                                                            │
│  2. Frontend polls or listens via Realtime                │
│     When all steps complete → trigger streaming           │
└────────────────────────────────────────────────────────────┘
```

---

## Implementation

### Phase 1: Preparation Flow (Pgflow)

#### Backend: Pgflow Flow Definition

```typescript
// flows/chat-preparation.ts
import { Flow } from '@pgflow/dsl';

export const ChatPreparationFlow = new Flow<{
  message: string;
  conversationId: string;
  userId: string;
}>({ slug: 'chat_preparation' })

  .step('search', async (input) => {
    // Vector search, web search, etc.
    const results = await vectorSearch(input.message);

    return {
      results: results.map(r => ({
        content: r.content,
        source: r.source,
        score: r.score,
      })),
      count: results.length,
    };
  })

  .step('rerank', async (input) => {
    // Rerank results by relevance
    const reranked = await rerankResults(
      input.message,
      input.results
    );

    return {
      topResults: reranked.slice(0, 5),
      scores: reranked.map(r => r.score),
    };
  })

  .step('extract', async (input) => {
    // Extract relevant chunks from top results
    const chunks = await extractRelevantChunks(
      input.message,
      input.topResults
    );

    return {
      chunks: chunks,
      sources: chunks.map(c => c.source),
    };
  })

  .step('prepare_context', async (input) => {
    // Format context for LLM
    const context = formatContext(input.chunks);

    return {
      systemPrompt: `You are a helpful assistant. Use the following context to answer the user's question:\n\n${context}`,
      sources: input.sources,
      ready: true, // Signal that we're ready to stream
    };
  });
```

#### API Route: Start Preparation

```typescript
// app/api/prepare/route.ts
export const runtime = 'nodejs'; // Long timeout for multi-step flow

import { PgflowClient } from '@pgflow/client';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  // Authenticate
  const session = await getServerSession(req);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { message, conversationId } = await req.json();

  // Initialize pgflow
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const pgflow = new PgflowClient(supabase);

  // Start preparation flow
  const run = await pgflow.startFlow('chat_preparation', {
    message,
    conversationId: conversationId || crypto.randomUUID(),
    userId: session.user.id,
  });

  // Return immediately with runId
  // Frontend will poll/listen for completion
  return Response.json({
    runId: run.run_id,
    status: 'preparing',
  });
}
```

### Phase 2: Streaming Endpoint (Simple Proxy)

```typescript
// app/api/stream/route.ts
export const runtime = 'edge'; // Fast, can use Edge runtime!

import { OpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  // Authenticate
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { runId, message, history } = await req.json();

  // Get preparation context from database
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: authHeader },
      },
    }
  );

  // Fetch pgflow run output
  const { data: run, error } = await supabase
    .from('flow_runs')
    .select('status, output')
    .eq('run_id', runId)
    .single();

  if (error || !run) {
    return Response.json({ error: 'Run not found' }, { status: 404 });
  }

  if (run.status !== 'completed') {
    return Response.json(
      { error: 'Preparation not complete' },
      { status: 400 }
    );
  }

  // Get context from final step output
  const context = run.output;

  // Stream LLM response (standard, fast, no pgflow involved)
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const stream = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: context.systemPrompt },
      ...(history || []),
      { role: 'user', content: message },
    ],
    stream: true,
  });

  // Return standard SSE stream (fast!)
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || '';
          if (delta) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'text-delta', text: delta })}\n\n`)
            );
          }
        }

        // Send sources as custom data
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'data-sources', data: context.sources })}\n\n`)
        );

        // Finish
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'finish', finishReason: 'stop' })}\n\n`)
        );

        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

---

## Frontend: Two-Phase Flow

### Option A: Custom Hook (Recommended)

```typescript
// hooks/use-pgflow-chat.ts
import { useState, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { createBrowserClient } from '@supabase/supabase-js';
import { PgflowClient } from '@pgflow/client/browser';

export function usePgflowChat() {
  const [preparationStatus, setPreparationStatus] = useState<
    'idle' | 'preparing' | 'ready' | 'error'
  >('idle');
  const [runId, setRunId] = useState<string | null>(null);
  const [preparationData, setPreparationData] = useState<any>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const pgflow = new PgflowClient(supabase);

  // Phase 1: Start preparation
  const startPreparation = useCallback(async (message: string) => {
    setPreparationStatus('preparing');

    try {
      // Start pgflow preparation flow
      const run = await pgflow.startFlow('chat_preparation', {
        message,
        conversationId: crypto.randomUUID(),
        userId: 'current-user', // Get from auth
      });

      setRunId(run.run_id);

      // Listen to step completions
      run.step('search').on('completed', (event) => {
        setPreparationData((prev) => ({
          ...prev,
          search: event.output,
        }));
      });

      run.step('rerank').on('completed', (event) => {
        setPreparationData((prev) => ({
          ...prev,
          rerank: event.output,
        }));
      });

      run.step('extract').on('completed', (event) => {
        setPreparationData((prev) => ({
          ...prev,
          extract: event.output,
        }));
      });

      // Wait for completion
      await run.waitForStatus('completed');

      setPreparationStatus('ready');
      return run.run_id;
    } catch (error) {
      console.error('Preparation failed:', error);
      setPreparationStatus('error');
      throw error;
    }
  }, [pgflow]);

  // Phase 2: Stream response
  const { messages, sendMessage, status, ...rest } = useChat({
    api: '/api/stream',
    body: { runId }, // Pass runId to streaming endpoint
  });

  // Combined send: prepare then stream
  const sendMessageWithPreparation = useCallback(
    async (content: string) => {
      // Phase 1: Prepare
      const preparedRunId = await startPreparation(content);

      // Phase 2: Stream (once preparation completes)
      sendMessage({ content, data: { runId: preparedRunId } });
    },
    [startPreparation, sendMessage]
  );

  return {
    messages,
    sendMessage: sendMessageWithPreparation,
    status: preparationStatus === 'preparing' ? 'preparing' : status,
    preparationStatus,
    preparationData,
    ...rest,
  };
}
```

### Usage in Component

```typescript
// app/chat/page.tsx
'use client';

import { usePgflowChat } from '@/hooks/use-pgflow-chat';

export default function ChatPage() {
  const {
    messages,
    sendMessage,
    status,
    preparationStatus,
    preparationData,
  } = usePgflowChat();

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
            {message.content}
          </div>
        ))}
      </div>

      {/* Preparation Progress */}
      {preparationStatus === 'preparing' && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="font-semibold text-blue-900 mb-2">
            🔍 Preparing your answer...
          </div>

          {preparationData?.search && (
            <div className="text-sm text-gray-700 mb-1">
              ✓ Searched {preparationData.search.count} sources
            </div>
          )}

          {preparationData?.rerank && (
            <div className="text-sm text-gray-700 mb-1">
              ✓ Ranked top {preparationData.rerank.topResults.length} results
            </div>
          )}

          {preparationData?.extract && (
            <div className="text-sm text-gray-700">
              ✓ Extracted relevant information
            </div>
          )}
        </div>
      )}

      {/* Streaming Progress */}
      {status === 'streaming' && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="animate-pulse">💬</div>
            <span className="text-green-900">Writing response...</span>
          </div>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          const message = formData.get('message') as string;
          if (message.trim()) {
            sendMessage(message);
            e.currentTarget.reset();
          }
        }}
        className="flex gap-2"
      >
        <input
          name="message"
          type="text"
          className="flex-1 border rounded-lg px-4 py-2"
          placeholder="Ask anything..."
          disabled={preparationStatus === 'preparing' || status === 'streaming'}
        />
        <button
          type="submit"
          disabled={preparationStatus === 'preparing' || status === 'streaming'}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
```

### Option B: Sequential API Calls (Simpler)

```typescript
// hooks/use-pgflow-chat-simple.ts
import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

export function usePgflowChatSimple() {
  const [preparing, setPreparing] = useState(false);

  const { messages, sendMessage, status, ...rest } = useChat({
    api: '/api/stream',

    // Intercept before sending
    onBeforeSend: async ({ content }) => {
      setPreparing(true);

      // Phase 1: Call preparation endpoint
      const res = await fetch('/api/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content }),
      });

      const { runId } = await res.json();

      // Poll until ready (or use Realtime)
      let ready = false;
      while (!ready) {
        await new Promise((resolve) => setTimeout(resolve, 500));

        const statusRes = await fetch(`/api/runs/${runId}`);
        const { status } = await statusRes.json();

        if (status === 'completed') {
          ready = true;
        }
      }

      setPreparing(false);

      // Return modified body with runId
      return { runId, message: content };
    },
  });

  return {
    messages,
    sendMessage,
    status: preparing ? 'preparing' : status,
    preparing,
    ...rest,
  };
}
```

---

## Advantages of Split Architecture

### ✅ **Clean Separation of Concerns**
- Pgflow: Orchestration (what it's good at)
- Streaming endpoint: Proxying (what it's good at)
- No mixing of concerns

### ✅ **Fast Streaming**
- Streaming endpoint can use Edge runtime (25s is fine for LLM proxy)
- Standard SSE streaming (28-48ms per token)
- No pgflow overhead during streaming

### ✅ **Durable Preparation**
- All prep steps stored in database
- Can query past preparations
- Full observability (SQL)
- Can retry individual steps

### ✅ **Flexible Frontend**
- Choose how to wait for preparation (polling vs Realtime)
- Show granular progress during preparation
- Standard useChat for streaming phase

### ✅ **Simple Streaming Endpoint**
- Just reads context from DB
- Proxies to LLM
- No complex logic
- Easy to test

### ✅ **Reusable Context**
- Preparation result is in database
- Can regenerate response without re-preparing
- Can use same context for multiple prompts
- Cache preparation results

### ✅ **Better Error Handling**
- Preparation failures are separate from streaming failures
- Can retry preparation independently
- Streaming endpoint is simple, less likely to fail

---

## Comparison with Other Approaches

| Approach | Prep Timeout | Stream Timeout | Stream Latency | Complexity |
|----------|--------------|----------------|----------------|------------|
| **Split (This)** | 300s (Node.js) | 25s (Edge, fine) | 28-48ms (SSE) | Low |
| Hybrid | 300s (Node.js) | 300s (same route) | 28-48ms (SSE) | Medium |
| Frontend Transport | 120s (Supabase) | 120s (Supabase) | 91-231ms (Realtime) | High |

---

## Advanced: Caching & Regeneration

### Cache Preparation Results

```typescript
// User asks: "What is quantum computing?"
// 1. Prepare (search, rank, extract) → cache result

// Later, user asks: "Explain it simpler"
// 2. Reuse cached preparation
// 3. Only stream new response with different system prompt

const { data: cachedRun } = await supabase
  .from('flow_runs')
  .select('output')
  .eq('input->message', 'What is quantum computing?')
  .eq('flow_slug', 'chat_preparation')
  .eq('status', 'completed')
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

if (cachedRun && isFresh(cachedRun.created_at)) {
  // Skip preparation, use cached context
  streamResponse(cachedRun.output);
} else {
  // Run fresh preparation
  await startPreparation(message);
}
```

### Regenerate Without Re-preparing

```typescript
// User clicks "Regenerate response"
// Don't re-run search, just re-stream with same context

const regenerate = async () => {
  sendMessage({
    content: lastMessage,
    data: {
      runId: existingRunId, // Reuse preparation
      regenerate: true,
    },
  });
};
```

---

## Implementation Checklist

### Phase 1: Basic Split
- [ ] Create chat_preparation flow in pgflow
- [ ] Implement /api/prepare endpoint (Node.js)
- [ ] Implement /api/stream endpoint (Edge)
- [ ] Frontend: Sequential calls (prepare → wait → stream)
- [ ] Test with polling for completion

### Phase 2: Real-time Updates
- [ ] Add Realtime listener in frontend
- [ ] Show step-by-step progress
- [ ] Remove polling, use event-driven

### Phase 3: Optimization
- [ ] Add preparation result caching
- [ ] Implement regeneration without re-prep
- [ ] Add error recovery
- [ ] Performance monitoring

### Phase 4: Advanced Features
- [ ] Parallel preparation for multiple queries
- [ ] Incremental context updates
- [ ] Adaptive preparation (skip steps if cached)
- [ ] Cost optimization (cache expensive operations)

---

## Conclusion

**This split architecture is the best approach for your use case:**

✅ **Pgflow does orchestration** (multi-step preparation, durable)
✅ **Streaming endpoint is simple** (just proxy, fast)
✅ **Clean separation** (easy to reason about)
✅ **Fast streaming** (28-48ms, can use Edge)
✅ **Flexible** (cache, regenerate, reuse context)
✅ **Reliable** (prep stored in DB, streaming is standard)

**Perfect for Perplexity-style apps where:**
- Multi-step preparation is complex and slow
- Streaming response is fast and simple
- Want to show step-by-step progress
- May regenerate response without re-searching

**This is the architecture I recommend implementing.**
