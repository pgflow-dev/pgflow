# BROADCAST.md

This guide explains how to set up Supabase Realtime broadcast functionality for real-time messaging between database and clients, based on the working implementation in `/broadcast-test/` and lessons learned from debugging pgflow integration tests.

## Overview

Supabase Realtime broadcast enables low-latency messaging using **Phoenix PubSub** (not database polling). The system works as follows:

- **Database to Client**: `realtime.send()` calls trigger immediate Phoenix PubSub broadcasts to subscribed clients
- **Client to Client**: Send messages between connected clients via channels  
- **Client to Database**: Send messages from clients that can trigger database functions

**IMPORTANT**: The `realtime.messages` table is used only for persistence/audit purposes. Broadcast delivery uses Phoenix PubSub for immediate real-time communication.

## Key Components

### 1. Supabase Configuration

Essential settings in `supabase/config.toml`:

```toml
[realtime]
enabled = true

[api]
enabled = true
port = 54321
schemas = ["public", "graphql_public"]

[db]
port = 54322
```

### 2. Database Setup

#### Enable Realtime Schema

The `realtime.send()` function is automatically available when Supabase is running locally.

#### Create Tables with RLS

```sql
-- Example table for storing messages
CREATE TABLE public.demo_messages (
    id BIGSERIAL PRIMARY KEY,
    message TEXT NOT NULL,
    user_name TEXT DEFAULT 'Anonymous',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.demo_messages ENABLE ROW LEVEL SECURITY;

-- Create policies for anon/authenticated users
CREATE POLICY "Anyone can read demo messages" ON public.demo_messages
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "Anyone can insert demo messages" ON public.demo_messages
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);
```

#### Database-to-Client Broadcasting

**Automatic Broadcasts via Triggers:**

```sql
-- Function to broadcast when records are inserted
CREATE OR REPLACE FUNCTION public.broadcast_new_message()
RETURNS TRIGGER AS $$
BEGIN
    -- Send broadcast using realtime.send function
    PERFORM realtime.send(
        jsonb_build_object(
            'id', NEW.id,
            'message', NEW.message,
            'user_name', NEW.user_name,
            'created_at', NEW.created_at,
            'action', 'new_message'
        ),
        'new-message',  -- event name
        'test-room',    -- topic/channel name
        false           -- public broadcast (false = private to channel)
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that fires after INSERT
CREATE TRIGGER trigger_broadcast_new_message
    AFTER INSERT ON public.demo_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.broadcast_new_message();
```

**Manual Broadcasts from Functions:**

```sql
-- Function to manually send broadcasts
CREATE OR REPLACE FUNCTION public.send_test_broadcast(
    test_message TEXT DEFAULT 'Hello from database!'
)
RETURNS void AS $$
BEGIN
    PERFORM realtime.send(
        jsonb_build_object(
            'message', test_message,
            'timestamp', NOW(),
            'source', 'manual_function',
            'random_number', floor(random() * 1000)
        ),
        'test-broadcast',  -- event name
        'test-room',       -- topic/channel name
        false              -- public broadcast
    );
END;
$$ LANGUAGE plpgsql;
```

### 3. Client Setup (JavaScript/Browser)

#### Initialize Supabase Client

```javascript
// Configuration for local development
const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// Initialize client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

#### Subscribe to Channel and Listen for Broadcasts

```javascript
const CHANNEL_NAME = 'test-room';

// Create channel
const channel = supabase.channel(CHANNEL_NAME);

// Listen for all broadcast events
channel.on('broadcast', { event: '*' }, (payload) => {
  console.log('Received broadcast:', payload.event, payload.payload);
});

// Listen for specific event types
channel.on('broadcast', { event: 'new-message' }, (payload) => {
  console.log('New message:', payload.payload);
});

// Subscribe to channel
channel.subscribe((status) => {
  if (status === 'SUBSCRIBED') {
    console.log('Connected to channel');
  } else if (status === 'CHANNEL_ERROR') {
    console.log('Failed to connect to channel');
  }
});
```

#### Send Broadcasts from Client

```javascript
// Send message to other clients
const testPayload = {
  message: 'Hello from browser!',
  timestamp: new Date().toISOString(),
  user: 'Client User',
};

channel
  .send({
    type: 'broadcast',
    event: 'test-message',
    payload: testPayload,
  })
  .then(() => {
    console.log('Message sent successfully');
  })
  .catch((error) => {
    console.error('Failed to send message:', error);
  });
```

## Real-Time Event Flow

### Database → Client Flow

1. **Trigger Event**: Database record insertion/update triggers function
2. **realtime.send()**: Function calls `realtime.send()` with payload
3. **Channel Delivery**: Supabase Realtime delivers message to subscribed clients
4. **Client Reception**: Browser/app receives message via channel subscription

### Client → Client Flow

1. **Client Send**: One client calls `channel.send()`
2. **Realtime Relay**: Supabase Realtime relays message to other subscribed clients
3. **Client Reception**: Other clients receive message via channel subscription

## Testing the Setup

### 1. Start Supabase

```bash
cd broadcast-test/
npx supabase start
```

### 2. Open Client Interface

Open `index.html` in browser and click "Connect to Channel"

### 3. Test Database Broadcasts

Open Supabase Studio (http://127.0.0.1:54323) → SQL Editor:

```sql
-- Manual broadcast
SELECT public.send_test_broadcast('Hello from Studio!');

-- Automatic broadcast via trigger
INSERT INTO public.demo_messages (message, user_name)
VALUES ('New message from Studio', 'SQL User');
```

### 4. Test Client Broadcasts

Use the "Send Test Message" button in the HTML interface

## Common Use Cases

### Real-Time Notifications

```sql
-- Notify when important events happen
CREATE OR REPLACE FUNCTION notify_user_action()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM realtime.send(
        jsonb_build_object(
            'user_id', NEW.user_id,
            'action', TG_OP,
            'timestamp', NOW()
        ),
        'user-activity',
        'notifications',
        false
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Live Dashboard Updates

```sql
-- Broadcast metrics changes
CREATE OR REPLACE FUNCTION broadcast_metrics_update()
RETURNS void AS $$
DECLARE
    metrics_data JSONB;
BEGIN
    -- Calculate current metrics
    SELECT jsonb_build_object(
        'total_users', (SELECT COUNT(*) FROM users),
        'active_sessions', (SELECT COUNT(*) FROM active_sessions),
        'updated_at', NOW()
    ) INTO metrics_data;

    -- Broadcast to dashboard
    PERFORM realtime.send(
        metrics_data,
        'metrics-update',
        'dashboard',
        false
    );
END;
$$ LANGUAGE plpgsql;
```

### Collaborative Features

```sql
-- Broadcast document changes
CREATE OR REPLACE FUNCTION broadcast_document_change()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM realtime.send(
        jsonb_build_object(
            'document_id', NEW.document_id,
            'change_type', TG_OP,
            'user_id', NEW.modified_by,
            'content', NEW.content
        ),
        'document-changed',
        'collaboration',
        false
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Important Notes

### Security Considerations

- **RLS Policies**: Always enable Row Level Security on tables
- **Channel Access**: Consider implementing channel-level authorization
- **Payload Size**: Keep broadcast payloads small for better performance

### Performance Tips

- **Channel Naming**: Use descriptive, consistent channel names
- **Event Types**: Use specific event names rather than generic ones
- **Payload Structure**: Keep JSON payloads minimal and well-structured

### Error Handling

```javascript
// Always handle subscription errors
channel.subscribe((status) => {
    switch (status) {
        case 'SUBSCRIBED':
            console.log('Successfully connected');
            break;
        case 'CHANNEL_ERROR':
            console.error('Failed to connect to channel');
            break;
        case 'TIMED_OUT':
            console.error('Connection timed out');
            break;
        case 'CLOSED':
            console.log('Channel closed');
            break;
    }
});

// Handle send failures
channel.send({...}).catch((error) => {
    console.error('Failed to send message:', error);
});
```

## Critical Issues and Solutions

### JSON Serialization Error

**Problem**: `BadMapError` with JSON string payload in Realtime logs.

**Cause**: Double-serialization when using `JSON.stringify()` with postgres driver.

**❌ Incorrect**:
```javascript
await sql`SELECT realtime.send(${JSON.stringify(payload)}::jsonb, 'event', 'topic', false)`;
```

**✅ Correct**:  
```javascript
await sql`SELECT realtime.send(${payload}::jsonb, 'event', 'topic', false)`;
```

The postgres driver handles JSON serialization automatically. Using `JSON.stringify()` causes double-serialization.

### Channel Subscription Issues

**Problem**: Channel shows `SUBSCRIBED` but receives no events.

**Cause**: Incorrect `channel.on()` method signature for Supabase client v2.

**❌ Incorrect**:
```javascript
channel.on('broadcast', handler);  // Missing event filter
```

**✅ Correct**:
```javascript
channel.on('broadcast', { event: '*' }, handler);  // With event filter
```

### No RLS Policies or Manual Grants Required

**Important**: Unlike some documentation suggests, basic broadcast functionality does NOT require:
- Manual grants of SELECT/DELETE permissions to `supabase_realtime` role
- RLS policies on `realtime.messages` table
- Custom partition management

These are only needed for advanced authorization scenarios.

## Troubleshooting

### Common Issues
1. **BadMapError in logs**: Fix JSON serialization (see above)
2. **No events received**: Check `channel.on()` signature (see above)  
3. **Channel not connecting**: Verify Supabase URL and anon key
4. **Realtime not enabled**: Check `[realtime] enabled = true` in config.toml

### Debug Commands
```sql
-- Test realtime.send function directly
SELECT realtime.send('{"test": "message"}'::jsonb, 'test-event', 'test-topic', false);

-- Check if messages are being stored (for audit/debug only)
SELECT * FROM realtime.messages ORDER BY inserted_at DESC LIMIT 5;
```

### Debug Strategy
1. **Check Realtime container logs**: `docker logs supabase_realtime_[project] --since 2m`
2. **Look for BadMapError**: Usually indicates JSON serialization issues
3. **Verify channel subscription**: Should show `SUBSCRIBED` status
4. **Test with simple payload**: Start with basic object like `{test: 'message'}`

This setup provides a complete real-time messaging system using Supabase Realtime broadcasts, enabling seamless communication between your database and connected clients.
