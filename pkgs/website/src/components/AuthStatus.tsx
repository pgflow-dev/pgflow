import React from 'react';
import { useAuth } from './AuthWrapper';

interface AuthStatusProps {
  showDetails?: boolean;
}

export const AuthStatus: React.FC<AuthStatusProps> = ({
  showDetails = false,
}) => {
  const { state, user, error, refresh } = useAuth();

  const getStatusColor = (state: string) => {
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

  const getStatusText = (state: string) => {
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
    <div
      style={{
        padding: '12px',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        backgroundColor: '#f9fafb',
        fontSize: '14px',
      }}
    >
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
            onClick={refresh}
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
          {user && <div>User ID: {user.id}</div>}
          {error && (
            <div style={{ color: '#ef4444', marginTop: '4px' }}>
              Error: {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
