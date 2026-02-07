/**
 * Production-Ready Streaming Context with Chunk Persistence
 *
 * This implementation provides:
 * - Real-time streaming via Supabase Realtime (fast, ephemeral)
 * - Chunk storage in database (durable, recoverable)
 * - Batch writes to reduce database overhead
 * - Recovery from edge function timeouts
 * - Checkpoint support for long-running operations
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface StreamingContext {
  /**
   * Emit text delta (for LLM token streaming)
   * Broadcasts via Realtime + stores in database
   */
  emitText(text: string): Promise<void>;

  /**
   * Emit custom data
   */
  emitData(key: string, data: any): Promise<void>;

  /**
   * Emit reasoning/thinking progress
   */
  emitReasoning(reasoning: string): Promise<void>;

  /**
   * Emit tool execution progress
   */
  emitToolInput(toolName: string, input: any): Promise<void>;

  /**
   * Save checkpoint (partial progress)
   * Useful for long-running operations that might timeout
   */
  checkpoint(data: any): Promise<void>;

  /**
   * Finalize streaming (flush remaining chunks)
   * Should be called when step completes or fails
   */
  finalize(): Promise<void>;

  /**
   * Get all streamed text so far
   */
  getStreamedText(): string;

  /**
   * Configure persistence settings
   */
  enablePersistence(options?: PersistenceOptions): void;
  disablePersistence(): void;
}

export interface PersistenceOptions {
  /**
   * Number of chunks to buffer before database write
   * Default: 10
   */
  batchSize?: number;

  /**
   * Maximum time to wait before flushing buffer (ms)
   * Default: 1000
   */
  flushIntervalMs?: number;

  /**
   * Whether to store chunks in database
   * Default: true
   */
  enabled?: boolean;
}

interface ChunkBuffer {
  run_id: string;
  step_slug: string;
  chunk_index: number;
  chunk_type: 'text' | 'data' | 'reasoning' | 'tool-input';
  chunk_data: any;
  created_at: string;
}

/**
 * Create a streaming context for a pgflow step
 */
export function createStreamingContext(
  supabase: SupabaseClient,
  runId: string,
  stepSlug: string,
  options?: PersistenceOptions
): StreamingContext {
  // Configuration
  const persistenceOptions: Required<PersistenceOptions> = {
    batchSize: options?.batchSize ?? 10,
    flushIntervalMs: options?.flushIntervalMs ?? 1000,
    enabled: options?.enabled ?? true,
  };

  // State
  let chunkIndex = 0;
  let chunkBuffer: ChunkBuffer[] = [];
  let lastFlushTime = Date.now();
  let streamedText = '';
  let flushInterval: NodeJS.Timeout | null = null;

  // Start periodic flush
  if (persistenceOptions.enabled) {
    flushInterval = setInterval(() => {
      if (Date.now() - lastFlushTime >= persistenceOptions.flushIntervalMs) {
        flushChunks().catch(console.error);
      }
    }, persistenceOptions.flushIntervalMs);
  }

  /**
   * Broadcast event via Supabase Realtime
   */
  async function broadcast(
    chunkType: string,
    chunk: any,
    index: number
  ): Promise<void> {
    const channel = supabase.channel(`pgflow:run:${runId}`);

    await channel.send({
      type: 'broadcast',
      event: 'step:stream',
      payload: {
        event_type: 'step:stream',
        run_id: runId,
        step_slug: stepSlug,
        stream_type: chunkType,
        chunk,
        index,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Buffer chunk for database write
   */
  function bufferChunk(
    chunkType: ChunkBuffer['chunk_type'],
    chunkData: any
  ): void {
    if (!persistenceOptions.enabled) return;

    chunkBuffer.push({
      run_id: runId,
      step_slug: stepSlug,
      chunk_index: chunkIndex,
      chunk_type: chunkType,
      chunk_data: chunkData,
      created_at: new Date().toISOString(),
    });
  }

  /**
   * Flush buffered chunks to database
   */
  async function flushChunks(): Promise<void> {
    if (chunkBuffer.length === 0) return;

    const chunksToWrite = [...chunkBuffer];
    chunkBuffer = []; // Clear buffer immediately
    lastFlushTime = Date.now();

    try {
      const { error } = await supabase
        .from('streaming_chunks')
        .insert(chunksToWrite);

      if (error) {
        console.error('Failed to persist chunks:', error);
        // Could implement retry logic here
      }
    } catch (err) {
      console.error('Error flushing chunks:', err);
    }
  }

  /**
   * Core emit function (used by all emit methods)
   */
  async function emit(
    chunkType: ChunkBuffer['chunk_type'],
    chunkData: any
  ): Promise<void> {
    const index = chunkIndex++;

    // 1. Broadcast via Realtime (fast, ephemeral)
    await broadcast(chunkType, chunkData, index);

    // 2. Buffer for database write (durable)
    bufferChunk(chunkType, chunkData);

    // 3. Auto-flush if buffer is full
    if (chunkBuffer.length >= persistenceOptions.batchSize) {
      await flushChunks();
    }
  }

  // Public API
  return {
    async emitText(text: string): Promise<void> {
      streamedText += text;
      await emit('text', { text });
    },

    async emitData(key: string, data: any): Promise<void> {
      await emit('data', { key, data });
    },

    async emitReasoning(reasoning: string): Promise<void> {
      await emit('reasoning', { reasoning });
    },

    async emitToolInput(toolName: string, input: any): Promise<void> {
      await emit('tool-input', { toolName, input });
    },

    async checkpoint(data: any): Promise<void> {
      // Flush all pending chunks first
      await flushChunks();

      // Update step with checkpoint data
      await supabase
        .from('flow_steps')
        .update({
          checkpoint_data: data,
          checkpoint_at: new Date().toISOString(),
        })
        .eq('run_id', runId)
        .eq('step_slug', stepSlug);
    },

    async finalize(): Promise<void> {
      // Flush remaining chunks
      await flushChunks();

      // Clear interval
      if (flushInterval) {
        clearInterval(flushInterval);
        flushInterval = null;
      }
    },

    getStreamedText(): string {
      return streamedText;
    },

    enablePersistence(options?: PersistenceOptions): void {
      Object.assign(persistenceOptions, options, { enabled: true });
    },

    disablePersistence(): void {
      persistenceOptions.enabled = false;
    },
  };
}

/**
 * Helper: Stream OpenAI response through streaming context
 */
export async function streamOpenAIResponse(
  stream: AsyncIterable<any>,
  ctx: StreamingContext
): Promise<string> {
  let fullResponse = '';

  try {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || '';
      if (delta) {
        await ctx.emitText(delta);
        fullResponse += delta;
      }
    }

    // Finalize to flush remaining chunks
    await ctx.finalize();

    return fullResponse;
  } catch (error) {
    // Finalize even on error
    await ctx.finalize();
    throw error;
  }
}

/**
 * Helper: Stream with timeout protection
 */
export async function streamWithTimeout<T>(
  streamFn: (ctx: StreamingContext) => Promise<T>,
  ctx: StreamingContext,
  timeoutMs: number = 25000
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Step timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([streamFn(ctx), timeoutPromise]);
    await ctx.finalize();
    return result;
  } catch (error) {
    // Save checkpoint with partial progress
    const partial = ctx.getStreamedText();
    if (partial) {
      await ctx.checkpoint({
        partial_response: partial,
        error: error.message,
        timed_out: true,
      });
    }

    await ctx.finalize();
    throw error;
  }
}

/**
 * Migration: Create streaming_chunks table
 */
export const STREAMING_CHUNKS_MIGRATION = `
-- Table for storing streaming chunks
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

-- Index for fast retrieval
CREATE INDEX IF NOT EXISTS idx_streaming_chunks_run_step
  ON streaming_chunks(run_id, step_slug, chunk_index);

-- RLS policies
ALTER TABLE streaming_chunks ENABLE ROW LEVEL SECURITY;

-- Users can read chunks for their own runs
CREATE POLICY "users_read_own_chunks"
  ON streaming_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM flow_runs
      WHERE flow_runs.run_id = streaming_chunks.run_id
        AND flow_runs.user_id = auth.uid()
    )
  );

-- Service role can insert chunks
CREATE POLICY "service_role_insert_chunks"
  ON streaming_chunks FOR INSERT
  WITH CHECK (true);

-- Auto-cleanup old chunks (optional)
CREATE OR REPLACE FUNCTION cleanup_old_streaming_chunks()
RETURNS void AS $$
BEGIN
  DELETE FROM streaming_chunks
  WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup (if pg_cron is available)
-- SELECT cron.schedule('cleanup-chunks', '0 2 * * *', 'SELECT cleanup_old_streaming_chunks()');
`;

/**
 * Add checkpoint_data column to flow_steps table
 */
export const CHECKPOINT_MIGRATION = `
-- Add checkpoint support to flow_steps
ALTER TABLE flow_steps
  ADD COLUMN IF NOT EXISTS checkpoint_data JSONB,
  ADD COLUMN IF NOT EXISTS checkpoint_at TIMESTAMPTZ;

-- Index for checkpoint queries
CREATE INDEX IF NOT EXISTS idx_flow_steps_checkpoint
  ON flow_steps(run_id, step_slug)
  WHERE checkpoint_data IS NOT NULL;
`;
