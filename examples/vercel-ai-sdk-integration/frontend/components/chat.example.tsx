/**
 * Example: Chat Component using Pgflow + Vercel AI SDK
 *
 * Demonstrates how to use PgflowChatTransport with useChat hook
 * for a fully functional streaming chat interface.
 */

'use client';

import { useChat } from '@ai-sdk/react';
import { createPgflowChatTransport } from '../lib/pgflow-chat-transport';
import { createBrowserClient } from '@supabase/ssr';
import { useMemo, useState, useEffect } from 'react';

/**
 * Custom data from streaming events
 */
interface ChatData {
  intent?: {
    classification: string;
    confidence: number;
  };
  search_results?: {
    count: number;
    sources: Array<{ id: string; score: number }>;
  };
  citations?: string[];
  reasoning?: {
    step: string;
    reasoning: string;
  };
}

export default function ChatExample() {
  const [customData, setCustomData] = useState<ChatData>({});
  const [reasoning, setReasoning] = useState<string>('');

  // Initialize Supabase client
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  // Create pgflow chat transport
  const transport = useMemo(() => {
    return createPgflowChatTransport(supabase, 'streaming_chat', {
      debug: process.env.NODE_ENV === 'development',
      timeout: 5 * 60 * 1000, // 5 minutes
    });
  }, [supabase]);

  // Use the chat hook with our custom transport
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    status,
    error,
    data,
  } = useChat({
    transport,
    onData: (chunk) => {
      // Handle custom streaming data
      if (chunk.type === 'data-intent') {
        setCustomData(prev => ({ ...prev, intent: chunk.data }));
      } else if (chunk.type === 'data-search_results') {
        setCustomData(prev => ({ ...prev, search_results: chunk.data }));
      } else if (chunk.type === 'data-citations') {
        setCustomData(prev => ({ ...prev, citations: chunk.data }));
      } else if (chunk.type === 'data-reasoning') {
        setReasoning(chunk.data.reasoning);
      }
    },
    onFinish: () => {
      // Clear reasoning when done
      setReasoning('');
      setCustomData({});
    },
    onError: (error) => {
      console.error('Chat error:', error);
    },
  });

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn('User not authenticated. Please sign in.');
        // Optionally redirect to login
      }
    };
    checkAuth();
  }, [supabase]);

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-4 shadow-lg">
        <h1 className="text-2xl font-bold">Pgflow AI Chat</h1>
        <p className="text-sm opacity-90">Powered by Vercel AI SDK + Pgflow</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <p className="text-lg mb-2">👋 Welcome!</p>
            <p>Ask me anything. I'll show you my thought process as I work.</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white shadow-md border border-gray-200'
              }`}
            >
              <div className="text-xs font-semibold mb-1 opacity-70">
                {message.role === 'user' ? 'You' : 'AI Assistant'}
              </div>
              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
          </div>
        ))}

        {/* Streaming progress indicators */}
        {status === 'streaming' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <div className="animate-spin h-4 w-4 border-2 border-yellow-500 border-t-transparent rounded-full"></div>
              <div className="font-semibold text-yellow-800">Processing...</div>
            </div>

            {/* Show reasoning */}
            {reasoning && (
              <div className="text-sm text-gray-700 mb-2">
                💭 {reasoning}
              </div>
            )}

            {/* Show intent classification */}
            {customData.intent && (
              <div className="text-sm text-gray-600 mb-1">
                ✓ Intent: <span className="font-medium">{customData.intent.classification}</span>
                {' '}({Math.round(customData.intent.confidence * 100)}% confidence)
              </div>
            )}

            {/* Show search results */}
            {customData.search_results && (
              <div className="text-sm text-gray-600 mb-1">
                ✓ Found {customData.search_results.count} relevant sources
              </div>
            )}

            {/* Show citations */}
            {customData.citations && customData.citations.length > 0 && (
              <div className="text-sm text-gray-600">
                ✓ Added {customData.citations.length} citations
              </div>
            )}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="font-semibold text-red-800 mb-1">Error</div>
            <div className="text-sm text-red-600">{error.message}</div>
          </div>
        )}
      </div>

      {/* Input form */}
      <div className="border-t bg-white p-4 shadow-lg">
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="Type your message..."
            disabled={status === 'streaming'}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={status === 'streaming' || !input.trim()}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {status === 'streaming' ? (
              <span className="flex items-center space-x-2">
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                <span>Sending...</span>
              </span>
            ) : (
              'Send'
            )}
          </button>
        </form>

        {/* Status indicator */}
        <div className="mt-2 text-xs text-gray-500 flex items-center space-x-2">
          <div className={`h-2 w-2 rounded-full ${
            status === 'ready' ? 'bg-green-500' :
            status === 'streaming' ? 'bg-yellow-500' :
            status === 'error' ? 'bg-red-500' :
            'bg-gray-500'
          }`}></div>
          <span>
            {status === 'ready' && 'Ready'}
            {status === 'streaming' && 'AI is thinking...'}
            {status === 'submitted' && 'Submitting...'}
            {status === 'error' && 'Error occurred'}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Simpler example without custom data handling
 */
export function SimpleChatExample() {
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const transport = useMemo(() => {
    return createPgflowChatTransport(supabase, 'simple_streaming_chat');
  }, [supabase]);

  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    transport,
  });

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="space-y-4 mb-4">
        {messages.map((msg) => (
          <div key={msg.id} className={msg.role === 'user' ? 'text-right' : ''}>
            <div className={`inline-block p-3 rounded ${
              msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          className="flex-1 border rounded px-3 py-2"
          placeholder="Type a message..."
          disabled={status === 'streaming'}
        />
        <button
          type="submit"
          disabled={status === 'streaming'}
          className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
