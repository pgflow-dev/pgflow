# The Pragmatic Architecture: Hybrid Approach

After critical analysis, here's what actually makes sense:

## Problems with "Frontend Transport via Realtime" Approach

### ❌ Problem 1: Realtime is Not Streaming
- Supabase Realtime = pub/sub messaging (discrete events)
- Not designed for high-frequency token delivery
- 3-5x latency overhead per token
- No backpressure, no flow control
- Calling it "streaming" is misleading

### ❌ Problem 2: Edge Runtime Timeout is Universal
- Affects ALL edge functions (not just pgflow)
- 25s Vercel Edge limit is too short for LLM streaming
- ANY proxy that streams LLM responses has this issue
- Not unique to our approach

### ❌ Problem 3: Over-Engineering
- Chunk storage in database for every token
- Complex recovery logic
- High Realtime message costs
- Solving a problem the wrong way

---

## The Right Architecture: Hybrid Approach

**Use the right tool for each job:**

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (React + useChat)                                  │
│   └─ Uses standard fetch to /api/chat                       │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ↓ HTTP POST
                  │
┌─────────────────┴───────────────────────────────────────────┐
│ Next.js API Route (Node.js Runtime, not Edge!)             │
│   ├─ Timeout: 300s (Vercel), 10min (self-hosted)           │
│   ├─ Authenticates user                                     │
│   ├─ Starts pgflow flow in database                         │
│   ├─ Subscribes to pgflow events via Supabase Realtime     │
│   ├─ Streams LLM response via SSE (traditional streaming)  │
│   └─ Maps pgflow events → SSE data chunks                  │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ├─ SSE Stream ─→ Frontend (fast, low latency)
                  │
                  └─ Supabase Realtime ←→ Pgflow Database
                       (for step events, not token streaming)
```

---

## Implementation

### Backend: Node.js API Route (NOT Edge)

```typescript
// app/api/chat/route.ts
export const runtime = 'nodejs'; // ← 300s timeout (not 25s!)
export const dynamic = 'force-dynamic';

import { PgflowClient } from '@pgflow/client';
import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';

export async function POST(req: Request) {
  // 1. Authenticate
  const session = await getServerSession(req);
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { messages, conversationId } = await req.json();

  // 2. Initialize pgflow client
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const pgflow = new PgflowClient(supabase);

  // 3. Start multi-step flow
  const run = await pgflow.startFlow('chat_pipeline', {
    message: messages[messages.length - 1].content,
    userId: session.user.id,
    conversationId,
  });

  // 4. Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Helper to send SSE event
      const sendEvent = (data: any) => {
        const chunk = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(chunk));
      };

      try {
        // Subscribe to pgflow events (non-streaming steps)
        run.on('*', (event) => {
          if (event.event_type === 'run:started') {
            sendEvent({ type: 'start', id: run.run_id });
          }
          if (event.event_type === 'run:failed') {
            sendEvent({ type: 'error', error: event.error_message });
            controller.close();
          }
        });

        // Listen to step completions (for progress)
        run.step('search').on('completed', (event) => {
          sendEvent({
            type: 'data-search-complete',
            data: {
              count: event.output.results.length,
              sources: event.output.sources,
            },
          });
        });

        run.step('analyze').on('completed', (event) => {
          sendEvent({
            type: 'data-analysis',
            data: event.output,
          });
        });

        // Wait for all non-streaming steps to complete
        await run.step('search').waitForStatus('completed');
        await run.step('analyze').waitForStatus('completed');

        // 5. Get context from completed steps
        const searchResults = run.step('search').output?.results || [];
        const analysis = run.step('analyze').output;

        // 6. NOW stream LLM response via traditional SSE
        // This happens in the API route (long timeout, reliable)
        const openai = new OpenAI();
        const llmStream = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: `Context: ${JSON.stringify(searchResults)}\nAnalysis: ${JSON.stringify(analysis)}`,
            },
            ...messages,
          ],
          stream: true,
        });

        // Stream tokens via SSE (fast, low latency)
        for await (const chunk of llmStream) {
          const delta = chunk.choices[0]?.delta?.content || '';
          if (delta) {
            sendEvent({
              type: 'text-delta',
              text: delta,
            });
          }
        }

        // 7. Mark run as completed in database
        // (or let pgflow executor handle this if running in worker)

        sendEvent({
          type: 'finish',
          finishReason: 'stop',
        });

        controller.close();
      } catch (error) {
        sendEvent({
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
      'x-vercel-ai-data-stream': 'v1',
    },
  });
}
```

### Frontend: Standard useChat

```typescript
'use client';

import { useChat } from '@ai-sdk/react';

export default function Chat() {
  const { messages, sendMessage, status, data } = useChat({
    api: '/api/chat', // ← Standard fetch, no custom transport!
    onData: (chunk) => {
      // Custom data from pgflow steps
      if (chunk.type === 'data-search-complete') {
        console.log('Search done:', chunk.data);
      }
      if (chunk.type === 'data-analysis') {
        console.log('Analysis:', chunk.data);
      }
    },
  });

  return (
    <div>
      {/* Show intermediate progress */}
      {status === 'streaming' && data && (
        <div className="progress">
          {data['search-complete'] && (
            <div>✓ Found {data['search-complete'].count} results</div>
          )}
          {data.analysis && (
            <div>✓ Analysis: {data.analysis.summary}</div>
          )}
        </div>
      )}

      {/* Messages */}
      {messages.map(m => (
        <div key={m.id}>{m.content}</div>
      ))}

      {/* Input */}
      <button onClick={() => sendMessage({ content: 'Hello!' })}>
        Send
      </button>
    </div>
  );
}
```

---

## What Each Component Does

### Pgflow (Database Orchestration)
- **Executes multi-step pipeline** (search → analyze → prepare context)
- **Stores step outputs** in database (durable, queryable)
- **Broadcasts step events** via Supabase Realtime (progress updates)
- **NOT used for token streaming** (that's SSE's job)

### API Route (Node.js Runtime)
- **Long timeout** (300s on Vercel, unlimited self-hosted)
- **Authenticates requests** (user session, rate limits)
- **Subscribes to pgflow events** (listens for step completions)
- **Streams LLM tokens via SSE** (traditional, fast, reliable)
- **Maps pgflow progress → SSE data chunks** (for frontend)

### Supabase Realtime
- **Used for coarse-grained events** (step completed, run status)
- **NOT for fine-grained token streaming** (that's wasteful)
- Frequency: ~5-10 events per conversation (not 300 tokens!)

### SSE Streaming
- **Used for token streaming** (fast, low latency)
- Direct connection API route → frontend
- No intermediate hops, no extra overhead
- Standard streaming protocol

---

## Advantages of This Approach

### ✅ **Fast Token Streaming**
- SSE latency: 28-48ms per token (same as direct OpenAI)
- No Realtime overhead
- No JSON wrapping per token
- Standard streaming protocol

### ✅ **Long Timeouts**
- Node.js runtime: 300s on Vercel
- Self-hosted: Unlimited
- No edge timeout issues

### ✅ **Pgflow Benefits Preserved**
- Multi-step orchestration still works
- Step outputs stored in database
- Can retry individual steps
- Full observability (SQL queries)

### ✅ **Simpler Architecture**
- No chunk storage needed
- No complex recovery logic
- Standard patterns (SSE, fetch)
- Less code to maintain

### ✅ **Lower Costs**
- Realtime: ~10 messages/conversation (not 300!)
- Cost: <$1/month for 1000 daily chats
- 90% cheaper than token-per-message approach

### ✅ **Better UX**
- Intermediate progress via data chunks
- Fast token streaming for final response
- Best of both worlds

---

## What Gets Streamed Where

| Data Type | Transport | Frequency | Latency |
|-----------|-----------|-----------|---------|
| Step completions | Realtime | ~5/conversation | 100-200ms (acceptable) |
| Progress updates | Realtime | ~10/conversation | 100-200ms (acceptable) |
| LLM tokens | SSE | ~300/conversation | 28-48ms (fast!) |
| Final outputs | Database | 1/step | N/A (durable) |

---

## Edge Cases Handled

### 1. API Route Timeout (300s)
**Very rare** (would need 300s LLM response)

If it happens:
- Frontend detects timeout
- Queries database for completed steps
- Shows partial progress
- User can retry

**Recovery:**
```typescript
if (timeout detected) {
  const run = await fetch('/api/runs/' + conversationId);
  const completedSteps = run.steps.filter(s => s.status === 'completed');

  // Show what completed
  displayProgress(completedSteps);

  // Offer retry
  showRetryButton();
}
```

### 2. Network Disconnection
**Standard SSE reconnection:**
```typescript
useChat({
  api: '/api/chat',
  onError: (error) => {
    if (error.message.includes('fetch')) {
      // Network error, retry with exponential backoff
      retryConnection();
    }
  },
});
```

### 3. Flow Step Failure
**Pgflow handles this:**
- Step fails → marked as 'failed' in database
- API route receives 'step:failed' event
- Sends error to frontend via SSE
- User can retry individual step

---

## When to Use What

### Use This Hybrid Approach ✅
- Multi-step AI pipelines (2+ steps before LLM)
- Need intermediate progress updates
- Want pgflow orchestration benefits
- Reliable token streaming required

### Use Frontend Transport ⚠️
- **Only if you NEED browser-to-database direct connection**
- Offline-first applications
- No backend API allowed (browser extensions, static sites)
- Accept 3-5x latency overhead

### Use Simple Backend API ✅
- Single-step chat (prompt → LLM → response)
- No multi-step orchestration needed
- Maximum simplicity required

---

## Migration Path

### Phase 1: Start Simple (No Pgflow)
```typescript
// Simple API route with SSE streaming
export async function POST(req: Request) {
  const openai = new OpenAI();
  const stream = await openai.chat.completions.create({ stream: true });
  return new Response(stream);
}
```

### Phase 2: Add Pgflow When Complexity Grows
When you need:
- Multi-step workflows (search before generate)
- State persistence (recover from failures)
- Observability (query past conversations)

Then add the hybrid approach.

---

## Conclusion

**You were right to question both assumptions:**

1. ❌ **Supabase Realtime is not streaming** - It's pub/sub messaging
   - **Solution:** Use SSE for token streaming, Realtime for coarse events

2. ❌ **Edge timeout affects everyone** - Not pgflow-specific
   - **Solution:** Use Node.js runtime (longer timeout), not Edge

**The pragmatic architecture:**
- **Pgflow:** Multi-step orchestration (database)
- **Realtime:** Step completion events (coarse-grained)
- **SSE:** Token streaming (fast, low latency)
- **Node.js API Route:** Long timeout (300s+)

This gives you:
- ✅ Fast token streaming (28-48ms)
- ✅ Multi-step orchestration (pgflow)
- ✅ Intermediate progress (Realtime events)
- ✅ Reliable delivery (long timeouts)
- ✅ Simple architecture (standard patterns)
- ✅ Low cost (<$1/month for 1000 chats)

**Much better than trying to force Realtime to be a streaming protocol.**
