# Frontend Transport: Edge Cases, Viability & Recovery Strategies

## Your Understanding is Correct ✅

Yes, you've got it exactly right:

1. **Unified Chunk Interface**: AI SDK uses a single `UIMessageChunk` union type with different `type` fields
2. **Bi-directional Conversion**:
   - Pgflow events (Supabase Realtime) → AI SDK chunks (frontend receives)
   - AI responses in steps → Supabase Realtime events → AI SDK chunks (full cycle)

```typescript
// In pgflow step (backend)
for await (const token of openai.stream()) {
  await ctx.stream.emitText(token); // → Supabase Realtime event
}

// Supabase broadcasts: { event_type: 'step:stream', chunk_type: 'text', chunk: { text: token } }

// PgflowChatTransport (frontend)
onStepStreamEvent((event) => {
  controller.enqueue({
    type: 'text-delta',    // ← AI SDK chunk type
    text: event.chunk.text,
  });
});

// useChat displays token in UI
```

---

## Critical Edge Case: Edge Runtime Shutdown Mid-Stream

### The Problem You Identified 🔴

**Scenario:**
```
1. Edge function executes final step 'generate_response'
2. LLM streams 80% of response via Supabase Realtime
3. Edge runtime hits timeout (Vercel Edge: 25s max) or crashes
4. Step never completes → No step:completed event
5. Run never completes → No run:completed event
6. Final output NOT saved to database
```

**What the user sees:**
```
AI: "Based on my analysis, I recommend you should invest in renewable ener"
[stops mid-sentence]
[stuck in "streaming..." state forever]
```

**Why this is devastating:**
- ❌ Partial response is useless
- ❌ Can't retry (don't know where it stopped)
- ❌ Database has no record of output
- ❌ User's message is lost
- ❌ Frontend stuck in limbo

**You're absolutely right: Without intervention, this is UNRECOVERABLE.**

---

## Root Causes

### 1. **Ephemeral Streaming Events**

Supabase Realtime broadcasts are **not durable**:
```typescript
// This broadcast is gone forever once sent
await supabase.channel(`pgflow:run:${runId}`).send({
  type: 'broadcast',
  event: 'step:stream',
  payload: { chunk: 'Hello' }, // ← Ephemeral, not stored
});
```

If client disconnects or edge function dies:
- Those chunks are **lost**
- Cannot be replayed
- Cannot be recovered

### 2. **Step Output Depends on Completion**

Pgflow's architecture:
```typescript
// Step function returns final output
const output = await stepFunction(input, ctx);

// ONLY saved to database when step completes successfully
await supabase
  .from('flow_steps')
  .update({ status: 'completed', output })
  .eq('step_id', stepId);
```

If edge function dies before return:
- Output is **never saved**
- Database shows step as "started"
- No way to reconstruct final output from streamed chunks

### 3. **Edge Runtime Timeouts are Aggressive**

| Platform | Max Duration |
|----------|--------------|
| Vercel Edge | 25 seconds |
| Cloudflare Workers | 30 seconds (free), 15 min (paid) |
| Supabase Edge Functions | 120 seconds |
| AWS Lambda@Edge | 30 seconds |

LLM responses can easily take 30+ seconds:
- GPT-4: ~20-30 tokens/sec
- 600 token response = 20-30 seconds
- ⚠️ Dangerously close to timeout

---

## Solution 1: Store Chunks as They Stream (Recommended)

### Architecture: Dual-Write Pattern

Write chunks to **both** Realtime (fast) and Database (durable):

```typescript
// Backend: Enhanced streaming context
export function createStreamingContext(supabase, runId, stepSlug) {
  const chunkBuffer = [];
  let chunkIndex = 0;

  return {
    async emitText(text: string) {
      // 1. Broadcast immediately (fast, ephemeral)
      await supabase.channel(`pgflow:run:${runId}`).send({
        type: 'broadcast',
        event: 'step:stream',
        payload: {
          run_id: runId,
          step_slug: stepSlug,
          chunk_type: 'text',
          chunk_index: chunkIndex,
          chunk: { text },
        },
      });

      // 2. Buffer for database write (durable)
      chunkBuffer.push({
        run_id: runId,
        step_slug: stepSlug,
        chunk_index: chunkIndex++,
        chunk_type: 'text',
        chunk_data: { text },
        created_at: new Date(),
      });

      // 3. Batch insert every 10 chunks or 1 second
      if (chunkBuffer.length >= 10 || shouldFlush()) {
        await this.flushChunks();
      }
    },

    async flushChunks() {
      if (chunkBuffer.length === 0) return;

      await supabase
        .from('streaming_chunks')
        .insert([...chunkBuffer]);

      chunkBuffer.length = 0; // Clear buffer
    },

    // Called when step completes (or on error)
    async finalize() {
      await this.flushChunks(); // Flush remaining chunks
    },
  };
}
```

### Database Schema

```sql
CREATE TABLE streaming_chunks (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES flow_runs(run_id),
  step_slug TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_type TEXT NOT NULL, -- 'text' | 'data' | 'reasoning'
  chunk_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(run_id, step_slug, chunk_index)
);

CREATE INDEX idx_streaming_chunks_run_step
  ON streaming_chunks(run_id, step_slug, chunk_index);

-- RLS policy
CREATE POLICY "users_read_own_chunks"
  ON streaming_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM flow_runs
      WHERE flow_runs.run_id = streaming_chunks.run_id
        AND flow_runs.user_id = auth.uid()
    )
  );
```

### Recovery: Frontend Reconnection

```typescript
// PgflowChatTransport.reconnectToStream()
async reconnectToStream(options: { chatId: string }) {
  const run = await this.pgflowClient.getRun(chatId);

  if (!run) return null;

  return new ReadableStream({
    start: async (controller) => {
      // 1. Fetch stored chunks from database
      const { data: chunks } = await this.supabase
        .from('streaming_chunks')
        .select('*')
        .eq('run_id', chatId)
        .order('chunk_index');

      // 2. Replay all chunks
      for (const chunk of chunks || []) {
        controller.enqueue({
          type: 'text-delta',
          text: chunk.chunk_data.text,
        });
      }

      // 3. Subscribe to new live chunks
      if (run.status === 'started') {
        // Still streaming, subscribe to Realtime
        const unsubscribe = this.pgflowClient.onStepStreamEvent((event) => {
          if (event.run_id === chatId && event.chunk_index > chunks.length) {
            controller.enqueue(this.mapStreamEventToChunk(event));
          }
        });

        // Wait for completion
        await run.waitForStatus('completed');
        unsubscribe();
      }

      // 4. If completed, get final output
      if (run.status === 'completed') {
        controller.enqueue({
          type: 'finish',
          finishReason: 'stop',
        });
      }

      controller.close();
    },
  });
}
```

### Recovery: Edge Shutdown Scenario

**Scenario:**
```
1. Edge function streams 200 chunks via Realtime
2. Edge function dies at chunk 200
3. No step:completed event
```

**What happens:**

1. **Database has chunks 0-200** (durable storage)
2. **Frontend detects timeout** (no events for 30s)
3. **Frontend triggers recovery:**
   ```typescript
   // Detect stuck streaming
   if (status === 'streaming' && noEventsSince(30000)) {
     // Check database directly
     const { data: chunks } = await supabase
       .from('streaming_chunks')
       .select('*')
       .eq('run_id', runId)
       .order('chunk_index');

     if (chunks && chunks.length > 0) {
       // We have partial response!
       const partialText = chunks.map(c => c.chunk_data.text).join('');

       // Show to user with indication
       setMessages([
         ...messages,
         {
           role: 'assistant',
           content: partialText,
           metadata: {
             incomplete: true,
             error: 'Response generation was interrupted',
             canRetry: true,
           },
         },
       ]);

       // Offer retry
       showRetryButton();
     }
   }
   ```

4. **User can retry** with context preserved

---

## Solution 2: Checkpoint Pattern (Intermediate Outputs)

Don't wait until the end to save output - checkpoint during streaming:

```typescript
.step('generate_response', async (input, ctx) => {
  let fullResponse = '';
  let checkpointCounter = 0;

  for await (const chunk of llm.stream(prompt)) {
    // Stream to frontend
    await ctx.stream.emitText(chunk);
    fullResponse += chunk;

    // Checkpoint every 50 tokens
    checkpointCounter++;
    if (checkpointCounter % 50 === 0) {
      await ctx.checkpoint({
        partial_response: fullResponse,
        tokens_generated: checkpointCounter,
      });
    }
  }

  return { response: fullResponse };
})
```

**Backend implementation:**
```typescript
// In streaming context
async checkpoint(data: any) {
  // Update step with partial output
  await supabase
    .from('flow_steps')
    .update({
      checkpoint_data: data,
      checkpoint_at: new Date(),
    })
    .eq('run_id', this.runId)
    .eq('step_slug', this.stepSlug);
}
```

**Recovery:**
```typescript
// If edge function dies, frontend can recover checkpoint
const step = run.step('generate_response');
if (step.checkpoint_data?.partial_response) {
  // Show partial response to user
  displayPartialResponse(step.checkpoint_data.partial_response);

  // Ask if they want to retry or continue
  askUserToRetry();
}
```

---

## Solution 3: Two-Phase Commit (Optimistic + Confirmed)

Show streamed content immediately, but mark as "pending" until confirmed:

```typescript
// Frontend state
const [messages, setMessages] = useState([]);
const [pendingChunks, setPendingChunks] = useState('');

// As chunks arrive
onStepStreamEvent((event) => {
  if (event.chunk_type === 'text') {
    setPendingChunks(prev => prev + event.chunk.text);

    // Show immediately (optimistic)
    setMessages(prev => [
      ...prev.slice(0, -1),
      {
        ...prev[prev.length - 1],
        content: pendingChunks + event.chunk.text,
        status: 'streaming', // ← Marked as unconfirmed
      },
    ]);
  }
});

// When step completes
run.step('generate').on('completed', (event) => {
  // Mark as confirmed
  setMessages(prev => [
    ...prev.slice(0, -1),
    {
      ...prev[prev.length - 1],
      content: event.output.response, // ← Final confirmed output from DB
      status: 'completed', // ← Confirmed
    },
  ]);
  setPendingChunks('');
});

// If step fails
run.step('generate').on('failed', () => {
  // Discard optimistic updates
  setMessages(prev => [
    ...prev.slice(0, -1),
    {
      ...prev[prev.length - 1],
      content: pendingChunks,
      status: 'failed',
      canRetry: true,
    },
  ]);
});
```

---

## Solution 4: Hybrid Approach (Recommended for Production)

**Different strategies for different step types:**

### Type A: Non-Streaming Steps (Most steps)
```typescript
// No per-token streaming needed
.step('search', async (input, ctx) => {
  await ctx.stream.emitReasoning('Searching knowledge base...');

  const results = await search(input.message);

  // Emit complete result when done
  await ctx.stream.emitData('search_results', {
    count: results.length,
    preview: results.slice(0, 3),
  });

  // Output saved to database on completion
  return { results };
})
```

**Recovery:** Easy! Step output is in database.

### Type B: Streaming Steps with Persistence
```typescript
// LLM streaming with chunk storage
.step('generate', async (input, ctx) => {
  // Enable automatic chunk persistence
  ctx.stream.enablePersistence({ batchSize: 10 });

  let fullResponse = '';
  for await (const token of llm.stream()) {
    await ctx.stream.emitText(token); // Broadcasts + stores
    fullResponse += token;
  }

  // Final output saved to database
  return { response: fullResponse };
})
```

**Recovery:** Can replay from stored chunks OR use final output.

### Type C: Fire-and-Forget Steps (Analytics, Logging)
```typescript
// Don't block on these
.step('log_analytics', async (input, ctx) => {
  // Fire and forget - don't care if it fails
  await ctx.stream.emitData('analytics', { event: 'response_generated' });

  return { logged: true };
})
```

---

## Latency Analysis

### Per-Token Streaming Latency

**Backend API Route (Direct SSE):**
```
Token from OpenAI: 0ms
  ↓
Write to response stream: +1ms
  ↓
Network to client: +10-30ms
  ↓
useChat receives: +1ms
  ↓
React render: +16ms
---
Total: ~28-48ms per token
```

**Frontend Transport (via Supabase Realtime):**
```
Token from OpenAI: 0ms
  ↓
ctx.stream.emitText(): +2ms
  ↓
Supabase broadcast send: +10-30ms
  ↓
Supabase Realtime routing: +50-150ms ⚠️
  ↓
WebSocket to client: +10-30ms
  ↓
PgflowChatTransport: +2ms
  ↓
useChat receives: +1ms
  ↓
React render: +16ms
---
Total: ~91-231ms per token
```

**Verdict:** Frontend transport is **3-5x slower** due to Supabase Realtime overhead.

### Mitigation: Batch Tokens

```typescript
// Batch tokens to reduce events
async emitText(text: string) {
  this.textBuffer += text;

  // Emit every 5 tokens OR every 100ms
  const tokenCount = this.textBuffer.split(/\s+/).length;
  const timeSinceLastEmit = Date.now() - this.lastEmit;

  if (tokenCount >= 5 || timeSinceLastEmit > 100) {
    await this.broadcast('text', { text: this.textBuffer });
    this.textBuffer = '';
    this.lastEmit = Date.now();
  }
}
```

**Result:**
- Reduces events by 80% (1 event per 5 tokens instead of 5 events)
- Latency for first token: ~100-200ms
- Subsequent tokens appear in batches every 100ms
- Much more reasonable!

---

## Edge Runtime Timeout Strategies

### Strategy 1: Step Timeout Limits

Configure per-step timeouts and handle gracefully:

```typescript
.step('generate', async (input, ctx) => {
  // Set max execution time
  ctx.setTimeout(20000); // 20 seconds

  try {
    const response = await withTimeout(
      streamLLMResponse(input, ctx),
      20000
    );
    return { response };
  } catch (error) {
    if (error.name === 'TimeoutError') {
      // Gracefully handle timeout
      const partial = ctx.getStreamedContent();

      // Save partial result
      await ctx.checkpoint({ partial_response: partial });

      // Let user know
      throw new Error('Response generation timed out. Partial response saved.');
    }
    throw error;
  }
})
```

### Strategy 2: Chunked Generation

Break long generations into multiple steps:

```typescript
// Instead of one long streaming step
.step('generate_part_1', async (input, ctx) => {
  const partial = await llm.generate({ max_tokens: 200 });
  await ctx.stream.emitText(partial);
  return { partial };
})
.step('generate_part_2', async (input, ctx) => {
  const continuation = await llm.generate({
    prompt: input.partial + '...',
    max_tokens: 200
  });
  await ctx.stream.emitText(continuation);
  return { response: input.partial + continuation };
})
```

**Advantages:**
- Each step is short (under timeout)
- Progress saved between steps
- Can recover from any step failure

### Strategy 3: Streaming Platforms with Longer Timeouts

| Platform | Timeout | Streaming Support | Recommendation |
|----------|---------|-------------------|----------------|
| Vercel Edge | 25s | ❌ Too short | Don't use for LLM streaming |
| Cloudflare Workers | 15min (paid) | ✅ Good | Good choice |
| Supabase Edge Functions | 120s | ✅ Decent | Works for most cases |
| AWS Lambda | 15min | ✅ Good | Good but more complex |
| Self-hosted | Unlimited | ✅ Best | Full control |

**Recommendation:** Use Supabase Edge Functions (120s timeout) or self-hosted workers for LLM streaming steps.

---

## Viability Assessment

### ✅ **VIABLE** for These Use Cases:

**1. Multi-Step Pipelines (Your Use Case!)**
```typescript
// Perplexity-style research assistant
.step('expand_query', ...) // 2 seconds
.step('search_sources', ...) // 5 seconds
.step('rerank', ...) // 3 seconds
.step('extract', ...) // 4 seconds
.step('synthesize', ...) // 15 seconds → stream this
```

**Why it works:**
- Most steps don't need fine-grained streaming
- Only final synthesis step streams tokens
- Intermediate progress is valuable (user sees each step)
- Total time is long (30s+), so Realtime latency doesn't matter
- **Steps 1-4 outputs saved before step 5 streams**

**2. Tool Calling / Multi-Agent**
```typescript
.step('route_to_agent', ...) // Decide which agent
.step('agent_1_research', ...) // First agent works
.step('agent_2_analyze', ...) // Second agent works
.step('synthesize', ...) // Combine results → stream
```

**Why it works:**
- Each agent's output is durably stored
- Can retry individual agents if they fail
- Streaming is optional (can emit complete results)

### ⚠️ **PROBLEMATIC** for These Use Cases:

**1. Real-Time Chat (ChatGPT-style)**
```typescript
// User expects instant token-by-token streaming
.step('generate', async (input, ctx) => {
  for await (const token of llm.stream()) {
    await ctx.stream.emitText(token); // Too slow via Realtime
  }
})
```

**Problems:**
- Supabase Realtime adds 50-150ms per token
- User perceives lag (especially on mobile)
- Traditional SSE API route is 3x faster

**Solution:** Use backend API route pattern for simple chat.

**2. Voice Assistants**
- Latency is critical (need <50ms)
- Frontend transport is too slow
- Use WebRTC or direct streaming

### ❌ **NOT VIABLE** for These Use Cases:

**1. High-Volume / Cost-Sensitive**
- Supabase Realtime pricing: $10/month per 1M messages
- 1 LLM response = 100-500 tokens = 100-500 Realtime messages
- 1000 responses/day = 150k messages = ~$1.50/day = $45/month just for Realtime
- Database writes for chunk storage add more cost

**2. Guaranteed Delivery**
- Realtime is "best effort," not guaranteed
- Chunks can be lost if Realtime has issues
- Critical applications should use API routes + database persistence

---

## Recommended Architecture Decision Tree

```
Do you have multi-step workflows (3+ steps)?
├─ YES → Continue
└─ NO → Use backend API route (simpler)

Do most steps need token-by-token streaming?
├─ YES → Use backend API route (lower latency)
└─ NO → Continue

Do you need intermediate progress visibility?
├─ YES → Continue
└─ NO → Use backend API route (simpler)

Is latency <100ms per token critical?
├─ YES → Use backend API route
└─ NO → Continue

Can you afford Supabase Realtime costs?
├─ YES → Use frontend transport with stored chunks ✅
└─ NO → Use backend API route

Are you okay with chunk storage overhead?
├─ YES → Use frontend transport with stored chunks ✅
└─ NO → Use frontend transport with step outputs only
```

---

## Production-Ready Implementation Plan

### Phase 1: Proof of Concept (No Chunk Storage)
- Implement basic PgflowChatTransport
- Stream only step completion events (not tokens)
- Test with multi-step pipeline
- Measure latency and user experience

### Phase 2: Add Chunk Storage (If Needed)
- Add `streaming_chunks` table
- Implement dual-write in `createStreamingContext`
- Add reconnection logic with chunk replay
- Test edge function shutdown recovery

### Phase 3: Optimize Performance
- Implement token batching (5 tokens per event)
- Add chunk buffer/flush strategy
- Monitor Supabase Realtime costs
- Optimize database writes

### Phase 4: Production Hardening
- Add comprehensive error handling
- Implement retry logic
- Add monitoring/observability
- Load testing
- Cost analysis

---

## Conclusion

### Is Frontend Transport Viable?

**YES**, but with important caveats:

✅ **Perfect for:**
- Multi-step AI pipelines (Perplexity-style)
- Tool calling / multi-agent workflows
- Apps where intermediate progress matters
- Non-latency-critical applications

⚠️ **Requires care for:**
- Token-by-token streaming (need chunk storage)
- Edge runtime timeouts (need checkpointing)
- Cost management (Realtime + DB writes)

❌ **Avoid for:**
- Simple request/response chat (use API route)
- Ultra-low latency requirements
- High-volume / cost-sensitive apps

### Your Edge Shutdown Concern is Valid ✅

**Without chunk storage:** Unrecoverable data loss
**With chunk storage:** Fully recoverable

**Recommendation:**
Implement the **hybrid approach**:
1. Start without chunk storage (simpler, test viability)
2. Add chunk storage for critical streaming steps
3. Use checkpointing for long-running steps
4. Monitor edge function durations and timeout rates

This gives you the benefits of frontend transport (no API routes, real-time progress) with recovery guarantees (chunk storage, checkpoints) when you need them.
