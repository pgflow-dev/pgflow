import { supabase, isSupabaseConfigured } from './client';
import type { User } from '@supabase/supabase-js';

export type AuthState = 'unauthenticated' | 'authenticating' | 'authenticated';

export interface AuthStatus {
  state: AuthState;
  user: User | null;
  error: string | null;
}

export const signInAnonymously = async (): Promise<{ user: User | null; error: string | null }> => {
  if (!isSupabaseConfigured || !supabase) {
    return { 
      user: null, 
      error: 'Supabase not configured - running in demo mode' 
    };
  }

  try {
    const { data, error } = await supabase.auth.signInAnonymously();
    
    if (error) {
      console.error('Anonymous sign-in error:', error);
      return { user: null, error: error.message };
    }

    return { user: data.user, error: null };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown authentication error';
    console.error('Authentication error:', err);
    return { user: null, error: errorMessage };
  }
};

export const getCurrentUser = async (): Promise<{ user: User | null; error: string | null }> => {
  if (!isSupabaseConfigured || !supabase) {
    return { 
      user: null, 
      error: 'Supabase not configured - running in demo mode' 
    };
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      console.error('Get user error:', error);
      return { user: null, error: error.message };
    }

    return { user, error: null };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error getting user';
    console.error('Get user error:', err);
    return { user: null, error: errorMessage };
  }
};