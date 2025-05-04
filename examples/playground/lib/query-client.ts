'use client';

import { QueryClient } from '@tanstack/react-query';

// Create a client
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't refetch on window focus since we'll update via WebSockets
      refetchOnWindowFocus: false,
      // Retry up to 3 times with increasing delay
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      // Consider data stale immediately
      staleTime: 0,
      // Keep cache for 5 minutes
      gcTime: 1000 * 60 * 5,
    },
  },
});