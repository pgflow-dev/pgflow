/**
 * Example: Streaming Chat Flow for Vercel AI SDK Integration
 *
 * This flow demonstrates how to use pgflow with streaming context
 * to provide real-time updates to a frontend using Vercel AI SDK's useChat hook.
 *
 * Key Features:
 * - Streams LLM responses token-by-token
 * - Emits intermediate progress (reasoning, search results)
 * - Type-safe input/output
 * - Works with PgflowChatTransport on frontend
 */

import { Flow } from '@pgflow/dsl';
import type { StreamingContext } from '../helpers/streaming-context';
import { streamOpenAIResponse } from '../helpers/streaming-context';

// Mock implementations (replace with real implementations)
import { OpenAI } from 'openai';

/**
 * Flow input type
 */
interface ChatInput {
  message: string;
  conversationId: string;
  userId: string;
  history?: Array<{ role: string; content: string }>;
}

/**
 * Streaming chat flow
 */
export const StreamingChatFlow = new Flow<ChatInput>({
  slug: 'streaming_chat',
})

  /**
   * Step 1: Classify user intent
   * Shows reasoning to user
   */
  .step('classify_intent', async (input, ctx: { stream: StreamingContext }) => {
    // Show progress
    await ctx.stream.emitReasoning('Analyzing your message...');

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{
        role: 'user',
        content: `Classify the intent of this message in one word: "${input.message}"`
      }],
      temperature: 0,
    });

    const intent = response.choices[0]?.message?.content || 'general';

    // Emit the classification result
    await ctx.stream.emitData('intent', {
      classification: intent,
      confidence: 0.9,
    });

    return { intent };
  })

  /**
   * Step 2: Retrieve relevant context
   * Shows search progress to user
   */
  .step('retrieve_context', async (input, ctx: { stream: StreamingContext }) => {
    await ctx.stream.emitReasoning('Searching knowledge base...');

    // Simulate vector search (replace with real implementation)
    await new Promise(resolve => setTimeout(resolve, 500));

    const mockResults = [
      { id: '1', content: 'Document 1 content...', score: 0.95 },
      { id: '2', content: 'Document 2 content...', score: 0.87 },
      { id: '3', content: 'Document 3 content...', score: 0.76 },
    ];

    // Emit search results as they come in
    await ctx.stream.emitData('search_results', {
      count: mockResults.length,
      sources: mockResults.map(r => ({ id: r.id, score: r.score })),
    });

    return {
      context: mockResults.map(r => r.content).join('\n\n'),
      sources: mockResults,
    };
  })

  /**
   * Step 3: Generate streaming response
   * Streams LLM tokens in real-time
   */
  .step('generate_response', async (input, ctx: { stream: StreamingContext }) => {
    await ctx.stream.emitReasoning('Generating response...');

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Create streaming completion
    const stream = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant. Use the following context to answer the user's question:

Context:
${input.context}

Answer concisely and cite sources when possible.`
        },
        ...(input.history || []),
        {
          role: 'user',
          content: input.message,
        }
      ],
      stream: true,
      temperature: 0.7,
    });

    // Stream response through pgflow streaming context
    // Each token is emitted to frontend immediately
    const fullResponse = await streamOpenAIResponse(stream, ctx.stream);

    return {
      response: fullResponse,
      model: 'gpt-4',
      tokensUsed: fullResponse.split(' ').length * 1.3, // Rough estimate
    };
  })

  /**
   * Step 4: Format and finalize
   * Add metadata, citations, etc.
   */
  .step('finalize', async (input, ctx: { stream: StreamingContext }) => {
    // Add citations if sources were used
    const citations = input.sources.slice(0, 3).map((s: any, i: number) =>
      `[${i + 1}] Source ${s.id}`
    );

    await ctx.stream.emitData('citations', citations);

    return {
      response: input.response,
      citations,
      metadata: {
        intent: input.intent,
        sourcesUsed: input.sources.length,
        model: input.model,
        tokensUsed: input.tokensUsed,
      },
    };
  });

/**
 * Alternative: Simpler streaming chat without context retrieval
 */
export const SimpleStreamingChatFlow = new Flow<{
  message: string;
  conversationId: string;
}>({ slug: 'simple_streaming_chat' })

  .step('generate', async (input, ctx: { stream: StreamingContext }) => {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const stream = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: input.message }],
      stream: true,
    });

    const response = await streamOpenAIResponse(stream, ctx.stream);

    return { response };
  });

/**
 * Usage in Supabase Edge Function:
 *
 * ```typescript
 * import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
 * import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
 * import { StreamingChatFlow } from './flows/streaming-chat.ts';
 *
 * serve(async (req) => {
 *   const supabase = createClient(
 *     Deno.env.get('SUPABASE_URL')!,
 *     Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
 *   );
 *
 *   // Flow execution happens here
 *   // Streaming context is provided automatically by executor
 *
 *   return new Response('Flow started', { status: 200 });
 * });
 * ```
 */
