import { http } from './http';

/**
 * Authentication API Service
 *
 * Session management:
 * - Stored in HttpOnly cookie named `meetsync_session` (set by backend on OAuth callback).
 * - No sensitive tokens stored in browser localStorage or sessionStorage.
 * - All requests include `credentials: 'include'` (set in http.js) to send the cookie.
 *
 * Backend UserResponse shape (GET /api/auth/me):
 *   {
 *     "id":              "uuid",
 *     "google_sub":      "google-oauth2|...",
 *     "email":           "user@example.com",
 *     "name":            "Alex Mercer",
 *     "profile_picture": "https://lh3.googleusercontent.com/..."
 *   }
 *
 * Note: AuthContext.normalizeUser() maps this to consistent `name`/`full_name`
 * and `profile_picture`/`avatar_url` aliases so UI components are insulated from
 * any future field renames.
 */

/**
 * Restores the current authenticated user's profile.
 * Returns UserResponse: { id, google_sub, email, name, profile_picture }
 * Throws ApiError with status 401 when no active session cookie exists.
 */
export async function getCurrentUser() {
  return http.get('/api/auth/me');
}

/**
 * Initiates Google OAuth login flow.
 * Returns OAuthLoginResponse: { authorization_url, state }
 *
 * AuthContext handles the browser redirect to `authorization_url`.
 * Google redirects back to the backend callback, which sets the session cookie
 * and redirects the browser to `/` (the dashboard).
 */
export async function loginWithGoogle() {
  return http.get('/api/auth/google/login');
}

/**
 * Logs out the current session.
 *
 * Attempts server-side cookie invalidation via POST /api/auth/logout.
 * If the endpoint is unavailable or returns an error, the function resolves
 * successfully so AuthContext can always proceed with client-side cleanup
 * (queryClient.clear() + user state reset + redirect to /login).
 *
 * Never throws — logout must always succeed from the client's perspective.
 */
export async function logout() {
  try {
    return await http.post('/api/auth/logout');
  } catch {
    // Backend /logout endpoint may not exist yet or may fail — always resolve
    // so AuthContext proceeds with local session teardown unconditionally.
    return { success: true };
  }
}
