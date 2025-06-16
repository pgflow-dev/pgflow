'use client';

import React, { createContext, useContext, useRef, ReactNode } from 'react';
import { PgflowClient } from '@pgflow/client';
import { createClient } from '@/utils/supabase/client';

const PgflowClientContext = createContext<PgflowClient | null>(null);

export function PgflowClientProvider({ children }: { children: ReactNode }) {
  // Use a ref to ensure the client instance is stable across renders
  const clientRef = useRef<PgflowClient | null>(null);
  
  if (!clientRef.current) {
    const supabase = createClient();
    clientRef.current = new PgflowClient(supabase);
  }
  
  return (
    <PgflowClientContext.Provider value={clientRef.current}>
      {children}
    </PgflowClientContext.Provider>
  );
}

export function usePgflowClient() {
  const client = useContext(PgflowClientContext);
  if (!client) {
    throw new Error('usePgflowClient must be used within PgflowClientProvider');
  }
  return client;
}