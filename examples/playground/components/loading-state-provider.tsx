'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface LoadingState {
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
}

const LoadingStateContext = createContext<LoadingState>({
  isLoading: false,
  setLoading: () => {},
});

export const useLoadingState = () => useContext(LoadingStateContext);

export function LoadingStateProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);

  const setLoading = (loading: boolean) => {
    setIsLoading(loading);
  };

  return (
    <LoadingStateContext.Provider value={{ isLoading, setLoading }}>
      {children}
    </LoadingStateContext.Provider>
  );
}