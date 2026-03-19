# Frontend Transport Approach - Summary

## What We Built

A **frontend-first integration** between pgflow and Vercel AI SDK's `useChat` hook, where:

1. **Pgflow client runs in the browser** (not in API routes)
2. **Custom ChatTransport** connects `useChat` → pgflow → Supabase Realtime
3. **Streaming context API** allows pgflow steps to emit incremental data
4. **No backend API routes needed** - everything flows through Supabase

## Why This Approach is Better

### ❌ What You DIDN'T Want (Backend API Route Pattern)

```
Frontend useChat
  ↓ HTTP POST
Backend API Route
  ↓ Uses pgflow client
  ↓ Transforms events to SSE
Frontend receives SSE
```

**Problems:**
- Backend API route needed
- Manual SSE formatting
- Extra network hop
- More code to maintain

### ✅ What You DO Want (Frontend Transport Pattern)

```
Frontend useChat + PgflowChatTransport
  ↓ Direct connection
Supabase Realtime (WebSocket)
  ↓ Broadcasts
Backend pgflow flows (Supabase Edge Functions)
  └─ ctx.stream.emitText(chunk)
```

**Benefits:**
- ✅ No API routes
- ✅ Native WebSocket streaming (Supabase Realtime)
- ✅ Simpler architecture
- ✅ Automatic reconnection
- ✅ RLS security built-in

## Key Components

### 1. Streaming Context API (Backend)

Allows pgflow steps to stream data:

```typescript
.step('generate', async (input, ctx) => {
  // Stream LLM tokens as they come
  for await (const chunk of llm.stream(prompt)) {
    await ctx.stream.emitText(chunk);  // ← Broadcasts to frontend
  }
  return { response: fullText };
})
```

**Events broadcast via Supabase Realtime:**
- `step:stream` event type
- Contains: `{ stream_type: 'text', chunk: { text: '...' } }`
- Received by frontend via WebSocket

### 2. PgflowChatTransport (Frontend)

Implements the `ChatTransport` interface from AI SDK:

```typescript
const transport = new PgflowChatTransport(supabase, 'streaming_chat');

const { messages, sendMessage, status } = useChat({
  transport, // ← Custom transport
});
```

**What it does:**
1. Starts pgflow flow when user sends message
2. Subscribes to Supabase Realtime channel
3. Receives `step:stream` events
4. Converts to AI SDK `UIMessageChunk` format
5. `useChat` automatically updates UI

### 3. Event Mapping

**Pgflow streaming events** → **AI SDK chunks:**

| Pgflow Event | AI SDK Chunk | Use Case |
|--------------|--------------|----------|
| `ctx.stream.emitText(chunk)` | `{ type: 'text-delta', text: chunk }` | LLM token streaming |
| `ctx.stream.emitReasoning(msg)` | `{ type: 'data-reasoning', data: msg }` | Show AI thinking |
| `ctx.stream.emitData(key, val)` | `{ type: 'data-{key}', data: val }` | Custom progress |

## Complete Flow Example

### Backend: Pgflow Flow

```typescript
export const ChatFlow = new Flow<{ message: string }>()

  .step('search', async (input, ctx) => {
    await ctx.stream.emitReasoning('Searching...');
    const results = await search(input.message);
    await ctx.stream.emitData('results', { count: results.length });
    return { results };
  })

  .step('generate', async (input, ctx) => {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [...],
      stream: true,
    });

    let fullText = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        await ctx.stream.emitText(delta);  // Stream each token
        fullText += delta;
      }
    }

    return { response: fullText };
  });
```

### Frontend: React Component

```typescript
'use client';

export default function Chat() {
  const [progress, setProgress] = useState({});

  const transport = useMemo(() => {
    const supabase = createClient(...);
    return new PgflowChatTransport(supabase, 'streaming_chat');
  }, []);

  const { messages, sendMessage, status } = useChat({
    transport,
    onData: (chunk) => {
      // Handle custom data
      if (chunk.type === 'data-results') {
        setProgress({ searchCount: chunk.data.count });
      }
    },
  });

  return (
    <div>
      {messages.map(m => <Message key={m.id} {...m} />)}

      {status === 'streaming' && (
        <div>
          Processing... {progress.searchCount} results found
        </div>
      )}

      <form onSubmit={(e) => {
        e.preventDefault();
        sendMessage({ content: e.target.message.value });
      }}>
        <input name="message" />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

## Implementation Requirements

### For Pgflow Core

**Need to add:**

1. **Event type**: `BroadcastStepStreamEvent`
   - Location: `pkgs/client/src/lib/types/events.ts`
   - Fields: `event_type: 'step:stream'`, `stream_type`, `chunk`, etc.

2. **Client method**: `onStepStreamEvent(callback)`
   - Location: `pkgs/client/src/lib/PgflowClient.ts`
   - Listens to streaming events globally

3. **Adapter update**: Handle `step:stream` events
   - Location: `pkgs/client/src/lib/adapters/SupabaseBroadcastAdapter.ts`
   - Parse and emit streaming events

4. **Streaming context**: `createStreamingContext(supabase, runId, stepSlug)`
   - Location: New package or in executor
   - Returns: `{ emitText, emitData, emitReasoning, emitToolInput }`

5. **Step executor**: Pass streaming context to step functions
   - Location: Wherever steps are executed
   - Modify signature: `step.execute(input, { stream, runId, stepSlug })`

### For Applications Using This

**Need to provide:**

1. Supabase project with Realtime enabled
2. RLS policies for security
3. Pgflow flows deployed (Supabase Edge Functions or self-hosted)
4. Frontend with `PgflowChatTransport` implementation

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│ FRONTEND (React)                                        │
│                                                         │
│  useChat({ transport: PgflowChatTransport })           │
│    │                                                    │
│    └─→ transport.sendMessages()                        │
│         │                                               │
│         └─→ pgflow.startFlow('chat', input)            │
│              │                                          │
│              └─→ Supabase Realtime Subscribe           │
│                   ↓ WebSocket                          │
└───────────────────┼─────────────────────────────────────┘
                    │
                    │ Broadcast Events
                    │
┌───────────────────┼─────────────────────────────────────┐
│                   ↓                                      │
│  SUPABASE DATABASE + REALTIME                           │
│                                                         │
│    Channel: pgflow:run:{run_id}                        │
│      ↑                                                  │
│      │ broadcast({ event: 'step:stream', payload })    │
│      │                                                  │
│  PGFLOW FLOWS (Edge Functions)                         │
│    │                                                    │
│    └─→ .step('generate', async (input, ctx) => {       │
│          for await (const chunk of llm.stream()) {     │
│            await ctx.stream.emitText(chunk); ──────────┘
│          }
│        })
└─────────────────────────────────────────────────────────┘
```

## Security Model

**RLS Policies:**

```sql
-- Users can only start their own flows
CREATE POLICY "users_start_own_flows"
ON flow_runs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can only read their own runs
CREATE POLICY "users_read_own_runs"
ON flow_runs FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Realtime RLS (enforced by Supabase)
-- Users automatically can only subscribe to channels for their runs
```

**Authentication Flow:**

1. User signs in via Supabase Auth
2. Frontend gets session token
3. `PgflowChatTransport` checks session before starting flows
4. RLS policies enforce access control at database level
5. Realtime channels inherit RLS permissions

## Performance Characteristics

**Latency:**

- **Token-to-display**: ~50-100ms (Supabase Realtime + WebSocket)
- **vs. SSE approach**: Similar (SSE is also ~50-100ms)
- **vs. HTTP polling**: Much faster (polling is 200ms+ minimum)

**Throughput:**

- Supabase Realtime: Thousands of concurrent connections per project
- Database writes: Each `emitText()` broadcasts (not writes to DB)
- No database bottleneck for streaming

**Cost:**

- Supabase Free Tier: 2GB database, 500MB bandwidth, Realtime included
- Pro: $25/mo for production workloads
- vs. API route approach: Similar (both need compute + database)

## Migration from API Routes

**If you have existing API routes:**

```typescript
// Before: Backend API route
export async function POST(req) {
  const { messages } = await req.json();
  const result = streamText({ model: openai('gpt-4'), messages });
  return result.toDataStreamResponse();
}

// After: Pgflow flow (deployed separately)
export const ChatFlow = new Flow()
  .step('generate', async (input, ctx) => {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: input.messages,
      stream: true,
    });
    return { response: await streamOpenAIResponse(stream, ctx.stream) };
  });

// Frontend changes from:
const { messages } = useChat({ api: '/api/chat' });

// To:
const transport = new PgflowChatTransport(supabase, 'chat_flow');
const { messages } = useChat({ transport });
```

**Migration strategy:**

1. Deploy pgflow flow to Supabase Edge Function
2. Test flow works independently
3. Create `PgflowChatTransport` in frontend
4. Switch `useChat` to use transport
5. Remove old API route

## Next Steps

### Phase 1: Prototype (You Can Do Now)

1. Copy `PgflowChatTransport` implementation to your project
2. Create a simple streaming flow manually
3. Test with `useChat` hook
4. Validate the approach works

### Phase 2: Pgflow Core Support (Requires Core Changes)

1. Add `BroadcastStepStreamEvent` type to client
2. Implement `onStepStreamEvent()` in `PgflowClient`
3. Update `SupabaseBroadcastAdapter` to handle streaming events
4. Create `StreamingContext` interface and implementation

### Phase 3: Production Ready (Polish)

1. Add TypeScript types package for streaming events
2. Create `@pgflow/ai-sdk` integration package
3. Add comprehensive tests
4. Document best practices
5. Create templates/examples

## Comparison with Alternatives

### vs. Backend API Routes (Original Design)

| Aspect | Frontend Transport | Backend API |
|--------|-------------------|-------------|
| **Architecture** | Browser → Supabase Realtime | Browser → API → Supabase |
| **Latency** | Lower (one less hop) | Higher |
| **Code Complexity** | Medium (need RLS) | Lower (traditional) |
| **Streaming** | Native (WebSocket) | Manual (SSE) |
| **Reconnection** | Automatic (Supabase) | Manual |
| **Security** | RLS policies | API middleware |

**Winner:** Frontend transport (simpler overall, leverages Supabase)

### vs. Pure AI SDK (No Pgflow)

| Aspect | Pgflow + AI SDK | AI SDK Alone |
|--------|----------------|--------------|
| **Workflow Orchestration** | ✅ Multi-step DAGs | ❌ Manual |
| **State Persistence** | ✅ Database-backed | ❌ Ephemeral |
| **Observability** | ✅ SQL queries | ❌ Logs only |
| **Complexity** | Higher (two systems) | Lower |
| **Time to Ship** | Slower (more setup) | Faster |

**Winner:** Depends on use case (pgflow for complex, AI SDK for simple)

## Conclusion

**This approach is ideal when:**

- ✅ You're building on Supabase already
- ✅ You need workflow orchestration (multi-step)
- ✅ State persistence is important
- ✅ You want to avoid managing API routes
- ✅ WebSocket streaming is acceptable

**Stick with API routes when:**

- ❌ You're not using Supabase
- ❌ You need server-side preprocessing
- ❌ Your team is unfamiliar with RLS
- ❌ You prefer traditional REST patterns

**The frontend transport pattern is the cleanest way to integrate pgflow with Vercel AI SDK, leveraging both systems' strengths without unnecessary complexity.**

---

## Files Created

1. **FRONTEND_TRANSPORT_DESIGN.md** - Complete technical design document
2. **examples/vercel-ai-sdk-integration/** - Example implementations:
   - `frontend/lib/pgflow-chat-transport.ts` - ChatTransport implementation
   - `backend/helpers/streaming-context.ts` - Streaming context API
   - `backend/flows/streaming-chat.example.ts` - Example flow
   - `frontend/components/chat.example.tsx` - Example React component
3. **INTEGRATION_VALUE_ASSESSMENT.md** - Honest assessment of use cases
4. **PGFLOW_VERCEL_AI_SDK_INTEGRATION.md** - Original comprehensive analysis

All committed to branch: `claude/explore-vercel-usechat-0pUZT`
