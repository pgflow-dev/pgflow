'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface FlowRunStore {
  runIds: Set<string>;
  addRunId: (runId: string) => void;
  hasRunId: (runId: string) => boolean;
  removeRunId: (runId: string) => void;
}

const FlowRunStoreContext = createContext<FlowRunStore>({
  runIds: new Set(),
  addRunId: () => {},
  hasRunId: () => false,
  removeRunId: () => {},
});

export const useFlowRunStore = () => useContext(FlowRunStoreContext);

export function FlowRunStoreProvider({ children }: { children: ReactNode }) {
  // Store the Set in state and force re-renders when it changes
  const [runIds, setRunIds] = useState(() => new Set<string>());

  const addRunId = useCallback((runId: string) => {
    setRunIds(prevSet => {
      const newSet = new Set(prevSet);
      newSet.add(runId);
      console.log('FlowRunStore: Adding run ID', runId, 'Total runs:', newSet.size);
      return newSet;
    });
  }, []);

  const hasRunId = useCallback((runId: string) => {
    const exists = runIds.has(runId);
    console.log('FlowRunStore: Checking run ID', runId, 'Exists:', exists, 'Total runs:', runIds.size);
    return exists;
  }, [runIds]);

  const removeRunId = useCallback((runId: string) => {
    setRunIds(prevSet => {
      const newSet = new Set(prevSet);
      newSet.delete(runId);
      console.log('FlowRunStore: Removing run ID', runId, 'Total runs:', newSet.size);
      return newSet;
    });
  }, []);

  return (
    <FlowRunStoreContext.Provider value={{ runIds, addRunId, hasRunId, removeRunId }}>
      {children}
    </FlowRunStoreContext.Provider>
  );
}