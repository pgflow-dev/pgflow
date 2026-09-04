/**
 * PgflowChatTransport - Custom ChatTransport for Vercel AI SDK
 *
 * Connects useChat hook directly to pgflow client in the browser,
 * enabling real-time streaming via Supabase Realtime without API routes.
 */

import type { PgflowClient } from '@pgflow/client/browser';
import type { SupabaseClient } from '@supabase/supabase-js';

// AI SDK types (from @ai-sdk/react)
interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

type UIMessageChunk =
  | { type: 'start'; id: string }
  | { type: 'text-delta'; text: string }
  | { type: 'finish'; finishReason: string }
  | { type: 'error'; error: Error }
  | { type: 'data-reasoning'; data: any }
  | { type: 'data-search_results'; data: any }
  | { type: string; data?: any }; // Generic data chunks

interface ChatTransport<T extends UIMessage = UIMessage> {
  sendMessages(options: {
    trigger: 'submit-message' | 'regenerate-message';
    chatId: string;
    messageId: string | undefined;
    messages: T[];
    abortSignal: AbortSignal | undefined;
  }): Promise<ReadableStream<UIMessageChunk>>;

  reconnectToStream(options: {
    chatId: string;
  }): Promise<ReadableStream<UIMessageChunk> | null>;
}

// Pgflow streaming event types
interface BroadcastStepStreamEvent {
  event_type: 'step:stream';
  run_id: string;
  step_slug: string;
  stream_type: 'text' | 'data' | 'reasoning' | 'tool-input';
  chunk: any;
  index: number;
  timestamp: string;
}

/**
 * Custom ChatTransport that uses pgflow client for backend communication
 */
export class PgflowChatTransport implements ChatTransport<UIMessage> {
  private pgflowClient: PgflowClient | null = null;

  constructor(
    private supabase: SupabaseClient,
    private flowSlug: string,
    private options: {
      debug?: boolean;
      timeout?: number; // Default: 5 minutes
    } = {}
  ) {}

  /**
   * Lazy initialization of pgflow client
   */
  private async getPgflowClient(): Promise<PgflowClient> {
    if (!this.pgflowClient) {
      // Dynamic import to avoid bundling server-side code
      const { PgflowClient } = await import('@pgflow/client/browser');
      this.pgflowClient = new PgflowClient(this.supabase);
    }
    return this.pgflowClient;
  }

  /**
   * Send messages and stream response
   */
  async sendMessages(options: {
    trigger: 'submit-message' | 'regenerate-message';
    chatId: string;
    messageId: string | undefined;
    messages: UIMessage[];
    abortSignal: AbortSignal | undefined;
  }): Promise<ReadableStream<UIMessageChunk>> {
    const { messages, chatId, abortSignal } = options;
    const lastMessage = messages[messages.length - 1];

    if (this.options.debug) {
      console.log('[PgflowChatTransport] Sending messages:', {
        chatId,
        messageCount: messages.length,
        lastMessage: lastMessage.content.substring(0, 50),
      });
    }

    const pgflow = await this.getPgflowClient();

    return new ReadableStream<UIMessageChunk>({
      start: async (controller) => {
        try {
          // Check authentication
          const { data: { session } } = await this.supabase.auth.getSession();
          if (!session) {
            throw new Error('User must be authenticated to send messages');
          }

          // Start the pgflow flow
          const run = await pgflow.startFlow(
            this.flowSlug,
            {
              message: lastMessage.content,
              conversationId: chatId,
              userId: session.user.id,
              history: messages.slice(0, -1).map(m => ({
                role: m.role,
                content: m.content,
              })),
            },
            chatId // Use chatId as run_id for consistency
          );

          if (this.options.debug) {
            console.log('[PgflowChatTransport] Flow started:', run.run_id);
          }

          // Send start chunk
          controller.enqueue({
            type: 'start',
            id: run.run_id,
          });

          // Track cleanup functions
          const cleanups: Array<() => void> = [];

          // Listen to streaming events
          const unsubscribeStream = pgflow.onStepEvent((event: any) => {
            if (event.run_id !== run.run_id) return;

            // Handle streaming chunks
            if (event.event_type === 'step:stream') {
              const streamEvent = event as BroadcastStepStreamEvent;
              const chunks = this.mapStreamEventToChunks(streamEvent);

              if (this.options.debug) {
                console.log('[PgflowChatTransport] Stream chunk:', streamEvent);
              }

              chunks.forEach(chunk => controller.enqueue(chunk));
            }

            // Handle step completion (optional metadata)
            if (event.event_type === 'step:completed') {
              if (this.options.debug) {
                console.log('[PgflowChatTransport] Step completed:', event.step_slug);
              }
            }
          });
          cleanups.push(unsubscribeStream);

          // Listen to run completion/failure
          const unsubscribeRun = run.on('*', (runEvent: any) => {
            if (runEvent.event_type === 'run:completed') {
              if (this.options.debug) {
                console.log('[PgflowChatTransport] Run completed');
              }

              // Send finish chunk
              controller.enqueue({
                type: 'finish',
                finishReason: 'stop',
              });

              // Cleanup and close
              cleanups.forEach(cleanup => cleanup());
              controller.close();
            }

            if (runEvent.event_type === 'run:failed') {
              console.error('[PgflowChatTransport] Run failed:', runEvent.error_message);

              // Send error chunk
              controller.enqueue({
                type: 'error',
                error: new Error(runEvent.error_message),
              });

              // Cleanup and close
              cleanups.forEach(cleanup => cleanup());
              controller.close();
            }
          });
          cleanups.push(unsubscribeRun);

          // Handle abort signal
          if (abortSignal) {
            abortSignal.addEventListener('abort', () => {
              if (this.options.debug) {
                console.log('[PgflowChatTransport] Request aborted');
              }

              cleanups.forEach(cleanup => cleanup());
              controller.close();
            });
          }

          // Wait for completion with timeout
          const timeout = this.options.timeout || 5 * 60 * 1000;

          await run.waitForStatus('completed', {
            timeoutMs: timeout,
            signal: abortSignal,
          }).catch(async () => {
            // If not completed, check if failed
            try {
              await run.waitForStatus('failed', {
                timeoutMs: 1000,
                signal: abortSignal,
              });
            } catch {
              // Timeout - flow still running
              console.warn('[PgflowChatTransport] Flow timed out');
            }
          });

        } catch (error) {
          console.error('[PgflowChatTransport] Error:', error);
          controller.error(error);
        }
      },

      cancel() {
        if (this.options.debug) {
          console.log('[PgflowChatTransport] Stream cancelled');
        }
        // Cleanup handled by abort signal
      },
    });
  }

  /**
   * Reconnect to an interrupted stream
   */
  async reconnectToStream(options: {
    chatId: string;
  }): Promise<ReadableStream<UIMessageChunk> | null> {
    const { chatId } = options;

    if (this.options.debug) {
      console.log('[PgflowChatTransport] Reconnecting to stream:', chatId);
    }

    const pgflow = await this.getPgflowClient();

    // Try to get existing run
    const run = await pgflow.getRun(chatId);

    if (!run) {
      if (this.options.debug) {
        console.log('[PgflowChatTransport] No run found for reconnection');
      }
      return null;
    }

    // If already completed or failed, no stream to reconnect to
    if (run.status === 'completed' || run.status === 'failed') {
      if (this.options.debug) {
        console.log('[PgflowChatTransport] Run already finished:', run.status);
      }
      return null;
    }

    // Re-subscribe to events
    return new ReadableStream<UIMessageChunk>({
      start: async (controller) => {
        if (this.options.debug) {
          console.log('[PgflowChatTransport] Resuming stream for:', run.run_id);
        }

        // Same event handling as sendMessages
        const unsubscribe = run.on('*', (event: any) => {
          if (event.event_type === 'run:completed') {
            controller.enqueue({
              type: 'finish',
              finishReason: 'stop',
            });
            unsubscribe();
            controller.close();
          }

          if (event.event_type === 'run:failed') {
            controller.enqueue({
              type: 'error',
              error: new Error(event.error_message),
            });
            unsubscribe();
            controller.close();
          }
        });

        await run.waitForStatus('completed', {
          timeoutMs: this.options.timeout || 5 * 60 * 1000,
        }).catch(() => {
          // Ignore timeout - already handled
        });
      },
    });
  }

  /**
   * Map pgflow streaming events to AI SDK UIMessageChunk format
   */
  private mapStreamEventToChunks(
    event: BroadcastStepStreamEvent
  ): UIMessageChunk[] {
    switch (event.stream_type) {
      case 'text':
        // Text streaming (LLM tokens)
        return [{
          type: 'text-delta',
          text: event.chunk.text,
        }];

      case 'reasoning':
        // Reasoning/thinking process
        return [{
          type: 'data-reasoning',
          data: {
            step: event.step_slug,
            reasoning: event.chunk.reasoning,
          },
        }];

      case 'data':
        // Custom data (search results, progress, etc.)
        return [{
          type: `data-${event.chunk.key}`,
          data: event.chunk.data,
        }];

      case 'tool-input':
        // Tool execution (if supported by AI SDK)
        return [{
          type: 'tool-input-delta',
          // @ts-ignore - AI SDK may not have this type yet
          toolCallId: event.step_slug,
          toolName: event.chunk.toolName,
          argsTextDelta: JSON.stringify(event.chunk.input),
        }];

      default:
        console.warn('[PgflowChatTransport] Unknown stream type:', event.stream_type);
        return [];
    }
  }
}

/**
 * Factory function for easier usage
 */
export function createPgflowChatTransport(
  supabase: SupabaseClient,
  flowSlug: string,
  options?: {
    debug?: boolean;
    timeout?: number;
  }
): PgflowChatTransport {
  return new PgflowChatTransport(supabase, flowSlug, options);
}
