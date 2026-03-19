# Complete Example: Production-Ready Streaming Chat with Recovery

This example demonstrates the full implementation of pgflow + Vercel AI SDK integration with:
- Real-time streaming via Supabase Realtime
- Chunk persistence in database
- Automatic recovery from edge function timeouts
- Reconnection support
- Graceful handling of partial responses

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Frontend (React + useChat)                                      │
│   └─ PgflowChatTransport                                        │
│        ├─ Realtime: Fast streaming                              │
│        └─ Database: Recovery + reconnection                     │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ↕ WebSocket + SQL
                  │
┌─────────────────┴───────────────────────────────────────────────┐
│ Supabase                                                         │
│   ├─ Realtime: Broadcasts streaming chunks                      │
│   ├─ Database: Stores chunks + checkpoints                      │
│   └─ Edge Functions: Executes pgflow flows                      │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ↓
            Pgflow Flows
              ├─ Step 1: Search (fast, no streaming)
              ├─ Step 2: Analyze (fast, emit reasoning)
              └─ Step 3: Generate (slow, stream tokens + persist)
```

---

## 1. Database Setup

### Run Migrations

```sql
-- streaming_chunks table
CREATE TABLE IF NOT EXISTS streaming_chunks (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES flow_runs(run_id) ON DELETE CASCADE,
  step_slug TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_type TEXT NOT NULL CHECK (chunk_type IN ('text', 'data', 'reasoning', 'tool-input')),
  chunk_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(run_id, step_slug, chunk_index)
);

CREATE INDEX idx_streaming_chunks_run_step
  ON streaming_chunks(run_id, step_slug, chunk_index);

-- Enable RLS
ALTER TABLE streaming_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_chunks"
  ON streaming_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM flow_runs
      WHERE flow_runs.run_id = streaming_chunks.run_id
        AND flow_runs.user_id = auth.uid()
    )
  );

CREATE POLICY "service_role_insert_chunks"
  ON streaming_chunks FOR INSERT
  WITH CHECK (true);

-- Add checkpoint support to flow_steps
ALTER TABLE flow_steps
  ADD COLUMN IF NOT EXISTS checkpoint_data JSONB,
  ADD COLUMN IF NOT EXISTS checkpoint_at TIMESTAMPTZ;
```

---

## 2. Backend Flow (Supabase Edge Function)

### `supabase/functions/execute-streaming-chat/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { OpenAI } from 'https://esm.sh/openai@4';
import { StreamingChatFlow } from './flows/streaming-chat.ts';
import { createStreamingContext } from './helpers/streaming-context.ts';

serve(async (req) => {
  try {
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Parse request
    const { message, conversationId, history } = await req.json();

    // Execute flow (pgflow executor would do this automatically)
    // For this example, we'll execute manually
    const runId = conversationId || crypto.randomUUID();

    // Execute the flow
    const result = await executeStreamingChatFlow(
      supabase,
      runId,
      {
        message,
        conversationId,
        userId: user.id,
        history,
      }
    );

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

async function executeStreamingChatFlow(
  supabase: any,
  runId: string,
  input: any
) {
  // Step 1: Search
  const searchCtx = createStreamingContext(supabase, runId, 'search', {
    enabled: false, // Don't persist search chunks
  });

  await searchCtx.emitReasoning('Searching knowledge base...');

  const searchResults = await performSearch(input.message);

  await searchCtx.emitData('search_results', {
    count: searchResults.length,
    sources: searchResults.map(r => r.source),
  });

  // Step 2: Analyze
  const analyzeCtx = createStreamingContext(supabase, runId, 'analyze', {
    enabled: false,
  });

  await analyzeCtx.emitReasoning('Analyzing results...');

  const analysis = await analyzeResults(searchResults);

  await analyzeCtx.emitData('analysis', analysis);

  // Step 3: Generate (with persistence)
  const generateCtx = createStreamingContext(supabase, runId, 'generate', {
    enabled: true,
    batchSize: 10,
    flushIntervalMs: 1000,
  });

  await generateCtx.emitReasoning('Generating response...');

  const openai = new OpenAI({
    apiKey: Deno.env.get('OPENAI_API_KEY'),
  });

  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `Context: ${JSON.stringify(searchResults)}\nAnalysis: ${JSON.stringify(analysis)}`,
        },
        ...(input.history || []),
        {
          role: 'user',
          content: input.message,
        },
      ],
      stream: true,
      max_tokens: 1000,
    });

    let fullResponse = '';
    let tokenCount = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        await generateCtx.emitText(delta);
        fullResponse += delta;
        tokenCount++;

        // Checkpoint every 50 tokens
        if (tokenCount % 50 === 0) {
          await generateCtx.checkpoint({
            partial_response: fullResponse,
            tokens_generated: tokenCount,
          });
        }
      }
    }

    // Finalize (flush remaining chunks)
    await generateCtx.finalize();

    return {
      response: fullResponse,
      metadata: {
        sources: searchResults.length,
        tokens: tokenCount,
      },
    };
  } catch (error) {
    // On error, finalize and save partial progress
    const partial = generateCtx.getStreamedText();
    await generateCtx.checkpoint({
      partial_response: partial,
      error: error.message,
    });
    await generateCtx.finalize();

    throw error;
  }
}

async function performSearch(query: string) {
  // Mock implementation
  return [
    { source: 'doc1', content: 'Result 1' },
    { source: 'doc2', content: 'Result 2' },
  ];
}

async function analyzeResults(results: any[]) {
  // Mock implementation
  return { relevance: 'high', confidence: 0.9 };
}
```

---

## 3. Frontend Component

### `app/chat/page.tsx`

```typescript
'use client';

import { useChat } from '@ai-sdk/react';
import { createBrowserClient } from '@supabase/ssr';
import { PgflowChatTransport } from '@/lib/pgflow-chat-transport-with-recovery';
import { useMemo, useState } from 'react';

export default function ChatPage() {
  const [customData, setCustomData] = useState<Record<string, any>>({});
  const [partialResponse, setPartialResponse] = useState<string | null>(null);

  // Initialize Supabase client
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  // Create transport with recovery options
  const transport = useMemo(
    () =>
      new PgflowChatTransport(supabase, 'streaming_chat', {
        streamTimeoutMs: 30000,
        enableChunkRecovery: true,
        showPartialOnTimeout: true,
        onStreamTimeout: (runId, partial) => {
          console.warn(`Stream timeout for ${runId}, partial: ${partial}`);
          setPartialResponse(partial);
        },
      }),
    [supabase]
  );

  // Use the chat hook
  const {
    messages,
    sendMessage,
    status,
    error,
    reload,
  } = useChat({
    transport,
    onData: (chunk) => {
      // Handle custom streaming data
      if (chunk.type.startsWith('data-')) {
        const key = chunk.type.replace('data-', '');
        setCustomData((prev) => ({ ...prev, [key]: chunk.data }));
      }

      // Handle partial response on timeout
      if (chunk.type === 'data-partial-response') {
        setPartialResponse(chunk.data.text);
      }
    },
    onError: (error) => {
      console.error('Chat error:', error);
    },
  });

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto p-4">
      {/* Header */}
      <div className="mb-4 pb-4 border-b">
        <h1 className="text-2xl font-bold">AI Chat with Recovery</h1>
        <p className="text-gray-600 text-sm">
          Powered by pgflow + Vercel AI SDK
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`p-4 rounded-lg ${
              message.role === 'user'
                ? 'bg-blue-100 ml-8'
                : 'bg-gray-100 mr-8'
            }`}
          >
            <div className="font-semibold mb-2">
              {message.role === 'user' ? '🧑 You' : '🤖 AI'}
            </div>
            <div className="whitespace-pre-wrap">{message.content}</div>

            {/* Show metadata if available */}
            {message.metadata && (
              <div className="text-xs text-gray-500 mt-2">
                {message.metadata.incomplete && (
                  <span className="text-orange-600">
                    ⚠️ Incomplete response
                  </span>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Partial response warning */}
        {partialResponse && (
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="font-semibold text-orange-800 mb-2">
              ⚠️ Response Interrupted
            </div>
            <div className="text-sm text-gray-700 mb-3">
              The AI's response was interrupted. Here's what was generated:
            </div>
            <div className="bg-white p-3 rounded text-sm">
              {partialResponse}
            </div>
            <button
              onClick={() => {
                reload();
                setPartialResponse(null);
              }}
              className="mt-3 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
            >
              🔄 Retry
            </button>
          </div>
        )}
      </div>

      {/* Progress Indicators */}
      {status === 'streaming' && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
            <span className="font-semibold text-blue-900">Processing...</span>
          </div>

          {/* Show intermediate progress */}
          {customData.reasoning && (
            <div className="text-sm text-gray-700">
              💭 {customData.reasoning}
            </div>
          )}

          {customData.search_results && (
            <div className="text-sm text-gray-700">
              🔍 Found {customData.search_results.count} results
            </div>
          )}

          {customData.analysis && (
            <div className="text-sm text-gray-700">
              📊 Analysis: {customData.analysis.relevance} relevance
            </div>
          )}

          {customData['step-complete'] && (
            <div className="text-sm text-green-700">
              ✓ Step completed: {customData['step-complete'].step}
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="font-semibold text-red-900 mb-1">Error</div>
          <div className="text-sm text-red-700">{error.message}</div>
          <button
            onClick={() => reload()}
            className="mt-2 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          const message = formData.get('message') as string;

          if (message.trim()) {
            sendMessage({ content: message });
            e.currentTarget.reset();
            setCustomData({});
            setPartialResponse(null);
          }
        }}
        className="flex gap-2"
      >
        <input
          name="message"
          type="text"
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Ask anything..."
          disabled={status === 'streaming'}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={status === 'streaming'}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'streaming' ? '⏳' : '📤'} Send
        </button>
      </form>
    </div>
  );
}
```

---

## 4. Testing Recovery Scenarios

### Test 1: Normal Flow
```
1. User sends message
2. Flow executes normally
3. All tokens stream via Realtime
4. Final output saved to database
5. Frontend displays complete response
✅ SUCCESS
```

### Test 2: Edge Function Timeout
```
1. User sends message
2. Flow starts streaming
3. Edge function times out at 50% (simulate by killing function)
4. Frontend detects timeout (no events for 30s)
5. Frontend queries database for stored chunks
6. Displays partial response with retry option
7. User clicks retry
8. Flow restarts and completes
✅ RECOVERED
```

### Test 3: Network Disconnection
```
1. User sends message
2. Flow streams 30% of tokens
3. User's network disconnects (close browser, lose WiFi)
4. Flow continues executing on server
5. All chunks stored in database
6. User reconnects
7. Frontend calls reconnectToStream()
8. Replays all 30% from database
9. Subscribes to live stream for remaining 70%
10. Displays complete response
✅ RECOVERED
```

### Test 4: Checkpoint Recovery
```
1. User sends long generation request (1000 tokens)
2. Flow checkpoints every 50 tokens
3. Edge function crashes at token 300
4. Frontend queries checkpoint_data
5. Finds checkpoint at token 250
6. Displays partial response
7. User retries
8. New flow continues from context (not exact token)
✅ PARTIAL RECOVERY
```

---

## 5. Performance Monitoring

```typescript
// Add to frontend
const [metrics, setMetrics] = useState({
  firstTokenMs: null,
  totalTokens: 0,
  averageLatencyMs: null,
});

useChat({
  transport,
  onData: (chunk) => {
    if (chunk.type === 'text-delta') {
      setMetrics(prev => ({
        firstTokenMs: prev.firstTokenMs ?? Date.now() - startTime,
        totalTokens: prev.totalTokens + 1,
        averageLatencyMs: (Date.now() - startTime) / (prev.totalTokens + 1),
      }));
    }
  },
});

// Display metrics
<div className="text-xs text-gray-500">
  First token: {metrics.firstTokenMs}ms |
  Total: {metrics.totalTokens} tokens |
  Avg latency: {metrics.averageLatencyMs?.toFixed(0)}ms/token
</div>
```

---

## 6. Cost Analysis

### Database Costs (Supabase)
```
Assumptions:
- 1000 chat responses per day
- 300 tokens per response (avg)
- 10 tokens per chunk (batched)

Storage:
- 1000 responses × 30 chunks × 100 bytes = 3 MB/day
- 90 MB/month
- Cost: ~$0 (well within free tier)

Realtime:
- 1000 responses × 30 chunks = 30,000 messages/day
- 900,000 messages/month
- Cost: ~$9/month ($10 per 1M messages)

Total: ~$9/month for 1000 daily conversations
```

### Comparison with API Route
```
API Route:
- Compute: Vercel Function invocations
- Bandwidth: SSE streaming
- Cost: ~$5-10/month for same volume

Verdict: Similar cost, frontend transport adds $9 Realtime cost
```

---

## 7. Production Checklist

- [ ] Enable RLS policies on streaming_chunks table
- [ ] Set up automatic chunk cleanup (24h retention)
- [ ] Configure appropriate timeouts per platform
- [ ] Add monitoring for timeout rates
- [ ] Set up alerts for high failure rates
- [ ] Test reconnection on mobile networks
- [ ] Optimize chunk batch size (balance latency vs writes)
- [ ] Add rate limiting per user
- [ ] Implement retry backoff strategy
- [ ] Add telemetry/analytics
- [ ] Load test with concurrent users
- [ ] Document edge runtime limits

---

## Conclusion

This implementation provides **production-grade reliability** for streaming AI chat with:

✅ **Real-time streaming** via Supabase Realtime
✅ **Chunk persistence** for recovery
✅ **Timeout detection** and graceful handling
✅ **Reconnection support** with chunk replay
✅ **Checkpoint system** for long operations
✅ **Partial response** display with retry
✅ **Type-safe** end-to-end
✅ **Cost-effective** (~$9/month for 1000 daily chats)

**This is viable for production use**, especially for multi-step AI pipelines like Perplexity, where:
- Intermediate progress is valuable
- Total latency is 30+ seconds
- Reliability > speed
- State persistence is critical
