import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getCurrentUser, logout as apiLogout, loginWithGoogle as apiLoginWithGoogle } from '@/api/auth';
import { setUnauthorizedCallback } from '@/api/http';
import { queryClient } from '@/lib/queryClient';

const AuthContext = createContext(null);

/**
 * Normalizes the backend UserResponse to a consistent shape for UI components.
 *
 * Backend `GET /api/auth/me` returns UserResponse:
 *   { id, google_sub, email, name, profile_picture }
 *
 * This normalizer:
 * - Ensures `name` and `full_name` always resolve (handles either field)
 * - Ensures `profile_picture` and `avatar_url` always resolve (handles either field)
 * - Absorbs `google_sub` transparently so components never see undefined
 */
function normalizeUser(userData) {
  if (!userData) return null;
  const displayName = userData.name || userData.full_name || '';
  const photo = userData.profile_picture || userData.avatar_url || null;

  return {
    ...userData,
    // Canonical name fields
    name: displayName,
    full_name: displayName,
    // Canonical avatar fields
    profile_picture: photo,
    avatar_url: photo,
    // Expose google_sub transparently (comes from backend UserResponse)
    google_sub: userData.google_sub || null,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * Clears all TanStack Query cache entries.
   * Called on logout and on forced 401 to prevent stale data from a previous
   * session being served to the next user who logs in on the same browser tab.
   */
  const clearQueryCache = useCallback(() => {
    queryClient.clear();
  }, []);

  // Restore session on app load by querying GET /api/auth/me
  const restoreSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const userData = await getCurrentUser();
      setUser(normalizeUser(userData));
    } catch (err) {
      setUser(null);
      // 401 is expected when no active HttpOnly cookie session exists — not an error
      if (err.status !== 401) {
        setError(err);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();

    // Central 401 handling: clear query cache, clear user state, redirect to /login
    setUnauthorizedCallback(() => {
      clearQueryCache();
      setUser(null);
    });

    const handleUnauthorizedEvent = () => {
      clearQueryCache();
      setUser(null);
    };

    window.addEventListener('meetsync:unauthorized', handleUnauthorizedEvent);

    return () => {
      window.removeEventListener('meetsync:unauthorized', handleUnauthorizedEvent);
    };
  }, [restoreSession, clearQueryCache]);

  /**
   * Initiates Google OAuth: calls GET /api/auth/google/login
   * Returns { authorization_url, state } — redirects browser to Google OAuth.
   * After Google callback, the backend sets the meetsync_session HttpOnly cookie
   * and redirects to `/`. AuthProvider's restoreSession then picks up the session.
   */
  const loginWithGoogle = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiLoginWithGoogle();
      if (response?.authorization_url) {
        window.location.href = response.authorization_url;
      }
    } catch (err) {
      setError(err);
      setIsLoading(false);
      throw err;
    }
  };

  /**
   * Logout: calls POST /api/auth/logout, clears TanStack Query cache,
   * nulls user state, then redirects to /login.
   *
   * Query cache is cleared BEFORE nulling user state to ensure no stale
   * data is served between the logout and redirect.
   */
  const logout = async () => {
    setIsLoading(true);
    try {
      await apiLogout();
    } catch {
      // Continue clearing local state regardless of server response
    } finally {
      // Clear all cached query data before clearing user identity
      clearQueryCache();
      setUser(null);
      setIsLoading(false);
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
  };

  const value = {
    user,
    isLoading,
    isAuthenticated: Boolean(user),
    error,
    loginWithGoogle,
    logout,
    restoreSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
