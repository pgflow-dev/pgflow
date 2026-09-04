/**
 * Streaming Context for Pgflow Steps
 *
 * Allows pgflow flow steps to emit incremental data (text chunks, progress updates)
 * that are broadcast to connected clients via Supabase Realtime.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Streaming event broadcast via Supabase Realtime
 */
export interface BroadcastStepStreamEvent {
  event_type: 'step:stream';
  run_id: string;
  step_slug: string;
  stream_type: 'text' | 'data' | 'reasoning' | 'tool-input';
  chunk: any;
  index: number;
  timestamp: string;
}

/**
 * Streaming context provided to step functions
 */
export interface StreamingContext {
  /**
   * Emit a generic streaming chunk
   */
  emit(type: 'text' | 'data' | 'reasoning' | 'tool-input', chunk: any): Promise<void>;

  /**
   * Emit text delta (for LLM streaming)
   */
  emitText(text: string): Promise<void>;

  /**
   * Emit custom data with a key
   */
  emitData(key: string, data: any): Promise<void>;

  /**
   * Emit reasoning/thinking process
   */
  emitReasoning(reasoning: string): Promise<void>;

  /**
   * Emit tool execution progress
   */
  emitToolInput(toolName: string, input: any): Promise<void>;
}

/**
 * Create a streaming context for a pgflow step
 *
 * @param supabase - Supabase client
 * @param runId - Flow run ID
 * @param stepSlug - Step slug
 * @param options - Configuration options
 * @returns StreamingContext instance
 */
export function createStreamingContext(
  supabase: SupabaseClient,
  runId: string,
  stepSlug: string,
  options: {
    debug?: boolean;
    batchDelayMs?: number; // Delay between broadcasts (rate limiting)
  } = {}
): StreamingContext {
  let chunkIndex = 0;
  let lastBroadcastTime = 0;

  /**
   * Broadcast a streaming event to Supabase Realtime
   */
  const broadcast = async (
    streamType: 'text' | 'data' | 'reasoning' | 'tool-input',
    chunk: any
  ): Promise<void> => {
    // Rate limiting (optional)
    if (options.batchDelayMs) {
      const now = Date.now();
      const elapsed = now - lastBroadcastTime;
      if (elapsed < options.batchDelayMs) {
        await new Promise(resolve => setTimeout(resolve, options.batchDelayMs - elapsed));
      }
      lastBroadcastTime = Date.now();
    }

    const event: BroadcastStepStreamEvent = {
      event_type: 'step:stream',
      run_id: runId,
      step_slug: stepSlug,
      stream_type: streamType,
      chunk,
      index: chunkIndex++,
      timestamp: new Date().toISOString(),
    };

    if (options.debug) {
      console.log('[StreamingContext] Broadcasting:', event);
    }

    try {
      // Broadcast to the run's channel
      const channel = supabase.channel(`pgflow:run:${runId}`);

      await channel.send({
        type: 'broadcast',
        event: 'step:stream',
        payload: event,
      });

      if (options.debug) {
        console.log('[StreamingContext] Broadcast successful');
      }
    } catch (error) {
      console.error('[StreamingContext] Broadcast error:', error);
      // Don't throw - streaming errors shouldn't fail the step
    }
  };

  return {
    emit: async (type, chunk) => {
      await broadcast(type, chunk);
    },

    emitText: async (text: string) => {
      await broadcast('text', { text });
    },

    emitData: async (key: string, data: any) => {
      await broadcast('data', { key, data });
    },

    emitReasoning: async (reasoning: string) => {
      await broadcast('reasoning', { reasoning });
    },

    emitToolInput: async (toolName: string, input: any) => {
      await broadcast('tool-input', { toolName, input });
    },
  };
}

/**
 * Helper: Stream OpenAI response through streaming context
 *
 * @example
 * ```typescript
 * const stream = await openai.chat.completions.create({
 *   model: 'gpt-4',
 *   messages: [...],
 *   stream: true,
 * });
 *
 * const fullText = await streamOpenAIResponse(stream, ctx.stream);
 * return { response: fullText };
 * ```
 */
export async function streamOpenAIResponse(
  stream: AsyncIterable<any>,
  ctx: StreamingContext
): Promise<string> {
  let fullResponse = '';

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content || '';
    if (delta) {
      await ctx.emitText(delta);
      fullResponse += delta;
    }
  }

  return fullResponse;
}

/**
 * Helper: Stream Vercel AI SDK streamText through streaming context
 *
 * @example
 * ```typescript
 * const result = streamText({
 *   model: openai('gpt-4'),
 *   prompt: input.message,
 * });
 *
 * const fullText = await streamAISDKResponse(result, ctx.stream);
 * return { response: fullText };
 * ```
 */
export async function streamAISDKResponse(
  result: { textStream: AsyncIterable<string> },
  ctx: StreamingContext
): Promise<string> {
  let fullText = '';

  for await (const chunk of result.textStream) {
    await ctx.emitText(chunk);
    fullText += chunk;
  }

  return fullText;
}
