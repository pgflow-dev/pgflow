import React, { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { signInAnonymously, getCurrentUser, type AuthState } from '../utils/supabase/auth';

interface AuthDemoProps {
  showDetails?: boolean;
}

export const AuthDemo: React.FC<AuthDemoProps> = ({ showDetails = false }) => {
  const [state, setState] = useState<AuthState>('unauthenticated');
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  const attemptAuthentication = async () => {
    setState('authenticating');
    setError(null);

    // First, check if we already have a user
    const currentUser = await getCurrentUser();
    
    if (currentUser.user && !currentUser.error) {
      setState('authenticated');
      setUser(currentUser.user);
      return;
    }

    // If no current user, try anonymous sign-in
    const { user: newUser, error: authError } = await signInAnonymously();
    
    if (newUser) {
      setState('authenticated');
      setUser(newUser);
      setError(null);
    } else {
      // Handle graceful degradation
      setState('unauthenticated');
      setUser(null);
      setError(authError || 'Authentication failed');
    }
  };

  useEffect(() => {
    attemptAuthentication();
  }, []);

  const getStatusColor = (state: AuthState) => {
    switch (state) {
      case 'authenticated':
        return '#22c55e'; // green
      case 'authenticating':
        return '#f59e0b'; // amber
      case 'unauthenticated':
        return '#ef4444'; // red
      default:
        return '#6b7280'; // gray
    }
  };

  const getStatusText = (state: AuthState) => {
    switch (state) {
      case 'authenticated':
        return 'Authenticated';
      case 'authenticating':
        return 'Authenticating...';
      case 'unauthenticated':
        return 'Not Authenticated';
      default:
        return 'Unknown';
    }
  };

  return (
    <div>
      <div style={{ 
        padding: '12px', 
        border: '1px solid #e5e7eb', 
        borderRadius: '6px', 
        backgroundColor: '#f9fafb',
        fontSize: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: getStatusColor(state),
            }}
          />
          <span style={{ fontWeight: '500' }}>
            Auth Status: {getStatusText(state)}
          </span>
          {error && (
            <button
              onClick={attemptAuthentication}
              style={{
                padding: '2px 8px',
                fontSize: '12px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          )}
        </div>
        
        {showDetails && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
            {user && (
              <div>User ID: {user.id}</div>
            )}
            {error && (
              <div style={{ color: '#ef4444', marginTop: '4px' }}>
                Error: {error}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <div style={{
          padding: '1.5rem',
          border: '2px dashed #e5e7eb',
          borderRadius: '8px',
          backgroundColor: '#fafafa',
          textAlign: 'center'
        }}>
          <h2 style={{ marginTop: 0, color: '#374151' }}>Demo Area</h2>
          <p style={{ margin: '0.5rem 0', color: '#6b7280' }}>
            Future pgflow demo components will be added here. The authentication system is now ready 
            to support authenticated Supabase interactions for showcasing pgflow functionality.
          </p>
          <p style={{ color: '#6b7280', fontSize: '14px', margin: '0.5rem 0' }}>
            This page demonstrates client-side authentication using React islands in Astro, 
            with graceful degradation when Supabase credentials are not configured.
          </p>
        </div>
      </div>
    </div>
  );
};