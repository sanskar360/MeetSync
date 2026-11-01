import { QueryClient } from '@tanstack/react-query';

/**
 * Shared TanStack Query client instance.
 *
 * Exported as a singleton so that AuthContext can call queryClient.clear()
 * on logout / forced 401 without needing to thread the client through props.
 *
 * App.jsx imports this same instance and passes it into <QueryClientProvider>.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Per spec: 401, 403, and 404 must never retry automatically.
        if (error?.status === 401 || error?.status === 403 || error?.status === 404) {
          return false;
        }
        return failureCount < 2;
      },
      staleTime: 1000 * 60 * 2, // 2 minutes
    },
  },
});
