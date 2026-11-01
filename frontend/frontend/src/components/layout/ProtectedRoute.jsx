import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { ErrorState } from '@/components/ui/ErrorState';
import { Loader2 } from 'lucide-react';

/**
 * ProtectedRoute
 * - Redirects signed-out users (401 / unauthenticated) to /login
 * - Handles 403 Forbidden with an Access Denied screen and NO retry loops
 */
export function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading, error } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-app flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary-50 dark:bg-primary-950 flex items-center justify-center text-primary shadow-sm">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
          <p className="text-sm font-semibold text-content-secondary tracking-wide">
            Authenticating MeetSync...
          </p>
        </div>
      </div>
    );
  }

  // 403 Forbidden: per Master Context, show access message and do NOT retry or loop
  if (error?.status === 403) {
    return (
      <div className="min-h-screen bg-surface-app flex items-center justify-center p-4">
        <ErrorState
          status={403}
          title="Access Restricted"
          message={error?.message || "You do not have authorization to view this area."}
          showBackHome={false}
          onRetry={null} // No retry loop for 403
        />
      </div>
    );
  }

  // 401 Unauthorized / Signed-out: redirect to /login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children ? children : <Outlet />;
}
