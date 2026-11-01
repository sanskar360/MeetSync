/**
 * MeetSync HTTP Client Wrapper
 * - Same-origin base (credentials: 'include' for HttpOnly session cookie)
 * - Parses JSON only when response Content-Type is JSON
 * - Standardized ApiError with FastAPI "detail" extraction
 * - Central 401 handling (triggers redirect to /login and clears state)
 */

export class ApiError extends Error {
  constructor(message, status, detail = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

// Global 401 handler registry
let unauthorizedCallback = null;

export function setUnauthorizedCallback(callback) {
  unauthorizedCallback = callback;
}

/**
 * Handle 401 Unauthorized responses centrally
 */
export function handle401() {
  if (unauthorizedCallback) {
    unauthorizedCallback();
  } else if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('meetsync:unauthorized'));
    // Redirect to login if not already on /login
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  }
}

/**
 * Perform an HTTP request with same-origin credentials and FastAPI error handling
 */
export async function http(endpoint, { body, headers = {}, method = 'GET', ...customConfig } = {}) {
  // Ensure same-origin path starts with slash or matches relative URL
  const url = endpoint.startsWith('http') ? endpoint : endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  const defaultHeaders = {
    Accept: 'application/json',
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...headers,
  };

  const config = {
    method,
    headers: defaultHeaders,
    credentials: 'include', // Strictly include HttpOnly session cookies
    ...customConfig,
  };

  if (body !== undefined) {
    config.body = isFormData ? body : JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, config);
  } catch (networkError) {
    throw new ApiError(
      networkError.message || 'Network error: could not connect to server',
      0,
      'NETWORK_FAILURE'
    );
  }

  // Parse response body based on Content-Type header
  const contentType = response.headers.get('content-type') || '';
  let data = null;

  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else if (contentType.includes('text/')) {
    data = await response.text();
  } else if (response.status !== 204) {
    // Other binary or stream responses
    data = await response.blob();
  }

  // Check response status
  if (!response.ok) {
    const status = response.status;
    let detail = data && typeof data === 'object' ? data.detail : null;
    let errorMessage = '';

    if (typeof detail === 'string') {
      errorMessage = detail;
    } else if (Array.isArray(detail)) {
      // FastAPI 422 validation errors array
      errorMessage = detail.map((err) => `${err.loc?.join('.')}: ${err.msg}`).join(', ');
    } else if (data?.message) {
      errorMessage = data.message;
    } else {
      errorMessage = `Request failed with status ${status}: ${response.statusText}`;
    }

    // Central 401 handling
    if (status === 401) {
      handle401();
    }

    throw new ApiError(errorMessage, status, detail);
  }

  return data;
}

http.get = (url, config = {}) => http(url, { ...config, method: 'GET' });
http.post = (url, body, config = {}) => http(url, { ...config, body, method: 'POST' });
http.patch = (url, body, config = {}) => http(url, { ...config, body, method: 'PATCH' });
http.delete = (url, config = {}) => http(url, { ...config, method: 'DELETE' });
http.upload = (url, formData, config = {}) => http(url, { ...config, body: formData, method: 'POST' });
