'use client';

import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { usePathname } from 'next/navigation';

interface LoadingState {
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
}

const LoadingStateContext = createContext<LoadingState>({
  isLoading: false,
  setLoading: () => { /* Default implementation */ },
});

export const useLoadingState = () => useContext(LoadingStateContext);

export function LoadingStateProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const pathname = usePathname();

  // Reset loading state when pathname changes
  useEffect(() => {
    setIsLoading(false);
  }, [pathname]);

  const setLoading = (loading: boolean) => {
    setIsLoading(loading);
  };

  return (
    <LoadingStateContext.Provider value={{ isLoading, setLoading }}>
      {children}
    </LoadingStateContext.Provider>
  );
}