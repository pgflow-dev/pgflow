/**
 * PgflowChatTransport with Chunk Recovery
 *
 * This transport handles:
 * - Real-time streaming via Supabase Realtime
 * - Automatic recovery from disconnections
 * - Chunk replay from database on reconnection
 * - Edge function timeout detection and recovery
 * - Graceful handling of partial responses
 */

import { PgflowClient } from '@pgflow/client/browser';
import { SupabaseClient } from '@supabase/supabase-js';
import type {
  ChatTransport,
  UIMessage,
  UIMessageChunk,
} from '@ai-sdk/react';

interface StreamingChunk {
  id: number;
  run_id: string;
  step_slug: string;
  chunk_index: number;
  chunk_type: 'text' | 'data' | 'reasoning' | 'tool-input';
  chunk_data: any;
  created_at: string;
}

export interface PgflowChatTransportOptions {
  /**
   * Timeout for detecting stuck streams (ms)
   * Default: 30000 (30 seconds)
   */
  streamTimeoutMs?: number;

  /**
   * Enable chunk recovery from database
   * Default: true
   */
  enableChunkRecovery?: boolean;

  /**
   * Show partial responses on timeout
   * Default: true
   */
  showPartialOnTimeout?: boolean;

  /**
   * Callback when stream times out
   */
  onStreamTimeout?: (runId: string, partialText: string) => void;
}

export class PgflowChatTransport implements ChatTransport<UIMessage> {
  private pgflowClient: PgflowClient;

  constructor(
    private supabaseClient: SupabaseClient,
    private flowSlug: string,
    private options: PgflowChatTransportOptions = {}
  ) {
    // Initialize defaults
    this.options = {
      streamTimeoutMs: 30000,
      enableChunkRecovery: true,
      showPartialOnTimeout: true,
      ...options,
    };

    this.pgflowClient = new PgflowClient(supabaseClient);
  }

  async sendMessages(options: {
    trigger: 'submit-message' | 'regenerate-message';
    chatId: string;
    messageId: string | undefined;
    messages: UIMessage[];
    abortSignal: AbortSignal | undefined;
  }): Promise<ReadableStream<UIMessageChunk>> {
    const { messages, chatId, abortSignal } = options;
    const lastMessage = messages[messages.length - 1];

    return new ReadableStream({
      start: async (controller) => {
        let lastEventTime = Date.now();
        let timeoutCheckInterval: NodeJS.Timeout | null = null;
        let unsubscribers: Array<() => void> = [];

        try {
          // Start the pgflow flow
          const run = await this.pgflowClient.startFlow(
            this.flowSlug,
            {
              message: lastMessage.content,
              conversationId: chatId,
              history: messages.slice(0, -1).map((m) => ({
                role: m.role,
                content: m.content,
              })),
            },
            chatId // Use chatId as runId
          );

          // Send start chunk
          controller.enqueue({
            type: 'start',
            id: run.run_id,
          } as UIMessageChunk);

          // Track streamed text for partial response
          let streamedText = '';

          // Listen to streaming chunks
          const unsubscribeStream = this.pgflowClient.onStepEvent(
            async (event) => {
              if (event.run_id !== run.run_id) return;

              lastEventTime = Date.now(); // Reset timeout

              // Handle streaming chunks
              if (event.event_type === 'step:stream') {
                const streamEvent = event as any; // BroadcastStepStreamEvent
                const chunks = this.mapStreamEventToChunks(streamEvent);

                chunks.forEach((chunk) => {
                  controller.enqueue(chunk);

                  // Track text for partial response recovery
                  if (chunk.type === 'text-delta') {
                    streamedText += chunk.text;
                  }
                });
              }

              // Handle step completion
              if (event.event_type === 'step:completed') {
                controller.enqueue({
                  type: 'data-step-complete',
                  data: {
                    step: event.step_slug,
                    status: 'completed',
                  },
                } as UIMessageChunk);
              }

              // Handle step failure
              if (event.event_type === 'step:failed') {
                controller.enqueue({
                  type: 'data-step-failed',
                  data: {
                    step: event.step_slug,
                    error: event.error_message,
                  },
                } as UIMessageChunk);
              }
            }
          );
          unsubscribers.push(unsubscribeStream);

          // Listen to run events
          const unsubscribeRun = run.on('*', (runEvent) => {
            lastEventTime = Date.now(); // Reset timeout

            if (runEvent.event_type === 'run:completed') {
              // Send finish chunk
              controller.enqueue({
                type: 'finish',
                finishReason: 'stop',
              } as UIMessageChunk);

              // Cleanup
              this.cleanup(unsubscribers, timeoutCheckInterval);
              controller.close();
            }

            if (runEvent.event_type === 'run:failed') {
              // Send error chunk
              controller.enqueue({
                type: 'error',
                error: new Error(runEvent.error_message),
              } as UIMessageChunk);

              // Cleanup
              this.cleanup(unsubscribers, timeoutCheckInterval);
              controller.close();
            }
          });
          unsubscribers.push(unsubscribeRun);

          // Timeout detection
          timeoutCheckInterval = setInterval(async () => {
            const timeSinceLastEvent = Date.now() - lastEventTime;

            if (timeSinceLastEvent > this.options.streamTimeoutMs!) {
              console.warn(
                `Stream timeout detected for run ${run.run_id} (no events for ${timeSinceLastEvent}ms)`
              );

              // Clear interval
              clearInterval(timeoutCheckInterval!);

              // Try to recover
              const recovered = await this.recoverFromTimeout(
                run.run_id,
                streamedText,
                controller
              );

              if (!recovered) {
                // Failed to recover
                controller.enqueue({
                  type: 'error',
                  error: new Error(
                    'Stream timed out and recovery failed'
                  ),
                } as UIMessageChunk);
              }

              // Cleanup
              this.cleanup(unsubscribers, null);
              controller.close();
            }
          }, 5000); // Check every 5 seconds

          // Handle abort signal
          if (abortSignal) {
            abortSignal.addEventListener('abort', () => {
              this.cleanup(unsubscribers, timeoutCheckInterval);
              controller.close();
            });
          }

          // Wait for completion (with timeout)
          const completionPromise = run
            .waitForStatus('completed', {
              timeoutMs: 5 * 60 * 1000, // 5 minutes
              signal: abortSignal,
            })
            .catch(async () => {
              // Check if it failed
              await run.waitForStatus('failed', {
                timeoutMs: 1000,
                signal: abortSignal,
              });
            });

          await completionPromise;
        } catch (error) {
          this.cleanup(unsubscribers, timeoutCheckInterval);
          controller.error(error);
        }
      },

      cancel() {
        // Cleanup handled by abort signal
      },
    });
  }

  async reconnectToStream(options: {
    chatId: string;
  }): Promise<ReadableStream<UIMessageChunk> | null> {
    const { chatId } = options;

    try {
      // Get existing run
      const run = await this.pgflowClient.getRun(chatId);

      if (!run) return null;

      // If already in terminal state
      if (run.status === 'completed' || run.status === 'failed') {
        // Try to replay from stored chunks
        if (this.options.enableChunkRecovery) {
          return this.replayFromChunks(chatId, run);
        }
        return null;
      }

      // Still in progress - reconnect to live stream
      return new ReadableStream({
        start: async (controller) => {
          // 1. Fetch and replay stored chunks first
          if (this.options.enableChunkRecovery) {
            const replayed = await this.replayStoredChunks(
              chatId,
              controller
            );
            console.log(`Replayed ${replayed} chunks from database`);
          }

          // 2. Subscribe to new live chunks
          const unsubscribe = run.on('*', (event) => {
            if (event.event_type === 'run:completed') {
              controller.enqueue({
                type: 'finish',
                finishReason: 'stop',
              } as UIMessageChunk);
              unsubscribe();
              controller.close();
            }

            if (event.event_type === 'run:failed') {
              controller.enqueue({
                type: 'error',
                error: new Error(event.error_message),
              } as UIMessageChunk);
              unsubscribe();
              controller.close();
            }
          });

          // Wait for completion
          await run.waitForStatus('completed', {
            timeoutMs: 60000,
          });
        },
      });
    } catch (error) {
      console.error('Failed to reconnect to stream:', error);
      return null;
    }
  }

  /**
   * Map pgflow streaming events to AI SDK chunks
   */
  private mapStreamEventToChunks(event: any): UIMessageChunk[] {
    switch (event.stream_type) {
      case 'text':
        return [
          {
            type: 'text-delta',
            text: event.chunk.text,
          },
        ];

      case 'reasoning':
        return [
          {
            type: 'data-reasoning',
            data: event.chunk.reasoning,
          },
        ];

      case 'data':
        return [
          {
            type: `data-${event.chunk.key}`,
            data: event.chunk.data,
          },
        ];

      case 'tool-input':
        return [
          {
            type: 'tool-input-delta',
            toolCallId: event.step_slug,
            toolName: event.chunk.toolName,
            argsTextDelta: JSON.stringify(event.chunk.input),
          },
        ];

      default:
        return [];
    }
  }

  /**
   * Replay stored chunks from database
   */
  private async replayStoredChunks(
    runId: string,
    controller: ReadableStreamDefaultController<UIMessageChunk>
  ): Promise<number> {
    try {
      const { data: chunks, error } = await this.supabaseClient
        .from('streaming_chunks')
        .select('*')
        .eq('run_id', runId)
        .order('chunk_index');

      if (error) throw error;

      if (chunks && chunks.length > 0) {
        for (const chunk of chunks) {
          const uiChunks = this.mapStoredChunkToUIChunks(chunk);
          uiChunks.forEach((c) => controller.enqueue(c));
        }
      }

      return chunks?.length || 0;
    } catch (error) {
      console.error('Failed to replay chunks:', error);
      return 0;
    }
  }

  /**
   * Replay chunks for a completed run
   */
  private async replayFromChunks(
    runId: string,
    run: any
  ): Promise<ReadableStream<UIMessageChunk>> {
    return new ReadableStream({
      start: async (controller) => {
        // Replay all stored chunks
        await this.replayStoredChunks(runId, controller);

        // Send final status
        if (run.status === 'completed') {
          controller.enqueue({
            type: 'finish',
            finishReason: 'stop',
          } as UIMessageChunk);
        } else if (run.status === 'failed') {
          controller.enqueue({
            type: 'error',
            error: new Error(run.error_message),
          } as UIMessageChunk);
        }

        controller.close();
      },
    });
  }

  /**
   * Recover from stream timeout
   */
  private async recoverFromTimeout(
    runId: string,
    streamedText: string,
    controller: ReadableStreamDefaultController<UIMessageChunk>
  ): Promise<boolean> {
    try {
      // Check if we have chunks in database
      const { data: chunks } = await this.supabaseClient
        .from('streaming_chunks')
        .select('*')
        .eq('run_id', runId)
        .eq('chunk_type', 'text')
        .order('chunk_index');

      if (chunks && chunks.length > 0) {
        // We have stored chunks, emit them
        const fullText = chunks
          .map((c: any) => c.chunk_data.text)
          .join('');

        if (fullText.length > streamedText.length) {
          // We have more text in database
          const missingText = fullText.slice(streamedText.length);

          controller.enqueue({
            type: 'text-delta',
            text: missingText,
          } as UIMessageChunk);

          console.log(
            `Recovered ${missingText.length} characters from database`
          );
        }

        // Check step checkpoint for final output
        const { data: step } = await this.supabaseClient
          .from('flow_steps')
          .select('checkpoint_data, output, status')
          .eq('run_id', runId)
          .single();

        if (step?.checkpoint_data?.partial_response) {
          // Show partial response
          if (this.options.showPartialOnTimeout) {
            controller.enqueue({
              type: 'data-partial-response',
              data: {
                text: step.checkpoint_data.partial_response,
                reason: 'timeout',
              },
            } as UIMessageChunk);
          }

          // Notify callback
          this.options.onStreamTimeout?.(
            runId,
            step.checkpoint_data.partial_response
          );
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error('Recovery failed:', error);
      return false;
    }
  }

  /**
   * Map stored chunk to UI chunks
   */
  private mapStoredChunkToUIChunks(
    chunk: StreamingChunk
  ): UIMessageChunk[] {
    switch (chunk.chunk_type) {
      case 'text':
        return [
          {
            type: 'text-delta',
            text: chunk.chunk_data.text,
          },
        ];

      case 'reasoning':
        return [
          {
            type: 'data-reasoning',
            data: chunk.chunk_data.reasoning,
          },
        ];

      case 'data':
        return [
          {
            type: `data-${chunk.chunk_data.key}`,
            data: chunk.chunk_data.data,
          },
        ];

      default:
        return [];
    }
  }

  /**
   * Cleanup subscriptions and intervals
   */
  private cleanup(
    unsubscribers: Array<() => void>,
    interval: NodeJS.Timeout | null
  ): void {
    unsubscribers.forEach((unsub) => unsub());
    if (interval) clearInterval(interval);
  }
}
