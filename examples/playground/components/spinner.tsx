'use client';

import { useLoadingState } from './loading-state-provider';

export function Spinner() {
  const { isLoading } = useLoadingState();

  if (!isLoading) return null;

  return (
    <div className="flex items-center px-3 py-1.5 bg-primary/10 rounded-md">
      <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full mr-2" 
        aria-label="Loading" 
        role="status"
      />
      <span className="text-xs text-primary font-medium">Processing...</span>
    </div>
  );
}