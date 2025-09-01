import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { signInAnonymously, getCurrentUser, type AuthState, type AuthStatus } from '../utils/supabase/auth';

interface AuthContextType extends AuthStatus {
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthWrapper');
  }
  return context;
};

interface AuthWrapperProps {
  children: React.ReactNode;
}

export const AuthWrapper: React.FC<AuthWrapperProps> = ({ children }) => {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    state: 'unauthenticated',
    user: null,
    error: null,
  });

  const attemptAuthentication = async () => {
    setAuthStatus(prev => ({ ...prev, state: 'authenticating', error: null }));

    // First, check if we already have a user
    const currentUser = await getCurrentUser();
    
    if (currentUser.user && !currentUser.error) {
      setAuthStatus({
        state: 'authenticated',
        user: currentUser.user,
        error: null,
      });
      return;
    }

    // If no current user, try anonymous sign-in
    const { user, error } = await signInAnonymously();
    
    if (user) {
      setAuthStatus({
        state: 'authenticated',
        user,
        error: null,
      });
    } else {
      // Handle graceful degradation - still show content but with error
      setAuthStatus({
        state: 'unauthenticated',
        user: null,
        error: error || 'Authentication failed',
      });
    }
  };

  const refresh = async () => {
    await attemptAuthentication();
  };

  useEffect(() => {
    attemptAuthentication();
  }, []);

  const contextValue: AuthContextType = {
    ...authStatus,
    refresh,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};