# Vercel AI SDK Integration with Pgflow

This example demonstrates how to use **pgflow client in the frontend** as a custom `ChatTransport` for Vercel AI SDK's `useChat` hook, with streaming support.

## Architecture

```
Frontend (React)
  ├─ useChat({ transport: PgflowChatTransport })
  └─ PgflowClient (browser) → Supabase Realtime
                                      ↕
Backend (Supabase Edge Functions)
  └─ Pgflow Flows with streaming context
      └─ ctx.stream.emitText(chunk)
```

## Features

- ✅ **Frontend pgflow client** - Direct Supabase connection, no API routes
- ✅ **Streaming responses** - LLM tokens streamed in real-time via Supabase Realtime
- ✅ **Type-safe** - Full TypeScript support end-to-end
- ✅ **Progress indicators** - Show intermediate workflow steps
- ✅ **Auto-reconnection** - Supabase handles network failures
- ✅ **RLS security** - Database policies enforce access control

## Quick Start

### 1. Install Dependencies

```bash
npm install @pgflow/client @pgflow/dsl @ai-sdk/react ai @supabase/supabase-js
```

### 2. Create Streaming Flow

See `./backend/flows/streaming-chat.ts` for a complete example.

```typescript
import { Flow } from '@pgflow/dsl';

export const ChatFlow = new Flow<{ message: string }>({ slug: 'streaming_chat' })
  .step('generate', async (input, ctx) => {
    // Stream LLM response
    for await (const chunk of llm.stream(input.message)) {
      await ctx.stream.emitText(chunk);
    }
    return { response: fullText };
  });
```

### 3. Set Up Frontend Transport

See `./frontend/lib/pgflow-chat-transport.ts` for implementation.

```typescript
import { PgflowChatTransport } from './lib/pgflow-chat-transport';

const transport = new PgflowChatTransport(supabase, 'streaming_chat');

const { messages, sendMessage } = useChat({ transport });
```

## File Structure

```
examples/vercel-ai-sdk-integration/
├── README.md (this file)
├── backend/
│   ├── flows/
│   │   └── streaming-chat.ts          # Example flow with streaming
│   ├── helpers/
│   │   ├── streaming-context.ts       # Streaming context implementation
│   │   └── openai-adapter.ts          # OpenAI streaming helper
│   └── types/
│       └── streaming-events.ts        # TypeScript types for events
├── frontend/
│   ├── lib/
│   │   └── pgflow-chat-transport.ts   # Custom ChatTransport implementation
│   ├── components/
│   │   └── chat.tsx                   # Example chat UI
│   └── hooks/
│       └── use-pgflow-chat.ts         # React hook wrapper
└── supabase/
    └── migrations/
        └── 001_streaming_support.sql  # Database setup
```

## How It Works

### 1. Backend: Streaming Context

Flows receive a `StreamingContext` that allows emitting incremental data:

```typescript
.step('generate', async (input, ctx) => {
  // ctx.stream is the streaming context
  await ctx.stream.emitText('Hello');
  await ctx.stream.emitText(' world');

  return { response: 'Hello world' };
})
```

Events are broadcast via Supabase Realtime to connected clients.

### 2. Frontend: PgflowChatTransport

The custom transport:
- Starts pgflow flows when messages are sent
- Subscribes to streaming events via Supabase Realtime
- Converts pgflow events → AI SDK `UIMessageChunk`s
- Handles reconnection automatically

```typescript
const transport = new PgflowChatTransport(supabase, 'streaming_chat');

// useChat automatically uses the transport
const { messages, sendMessage, status } = useChat({ transport });
```

### 3. Event Flow

```
1. User sends message
   → useChat calls transport.sendMessages()

2. Transport starts pgflow flow
   → pgflow.startFlow('streaming_chat', { message })

3. Backend flow executes
   → ctx.stream.emitText('chunk')
   → Broadcasts to Supabase channel

4. Frontend receives event
   → BroadcastStepStreamEvent
   → Mapped to UIMessageChunk { type: 'text-delta', text: 'chunk' }
   → useChat updates UI
```

## Next Steps

See the implementation files in `./backend` and `./frontend` for complete examples.

For production use, you'll need to:
1. Implement the streaming context in pgflow executor
2. Add RLS policies for security
3. Deploy flows to Supabase Edge Functions
4. Configure Supabase Realtime channels
