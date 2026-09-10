import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export const api = axios.create({
  baseURL,
  // Sends the httpOnly refresh cookie. Required, because the client cannot
  // read that cookie itself — only the browser can attach it.
  withCredentials: true,
});

/*
 * The access token lives in a module variable, NOT in localStorage.
 *
 * localStorage is readable by any script on the page, so one XSS bug hands
 * an attacker a token they can exfiltrate and reuse. A module variable dies
 * with the tab. The cost is that a page refresh loses it — which is fine,
 * because the refresh cookie can silently mint a new one on boot (see
 * AuthContext.bootstrap).
 */
let accessToken = null;
export const setAccessToken = (token) => {
  accessToken = token;
};
export const getAccessToken = () => accessToken;

// Attach the token to every outgoing request.
api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

/*
 * Called when refreshing itself fails, i.e. the session is genuinely over.
 * AuthContext registers a handler that clears state and routes to /login.
 */
let onSessionExpired = () => {};
export const setSessionExpiredHandler = (fn) => {
  onSessionExpired = fn;
};

/*
 * Single in-flight refresh. If a dashboard fires five requests at once and
 * all five come back 401, we must not send five refresh calls: they would
 * race, and because the server rotates the refresh token on every use, the
 * later ones would present a token that was just replaced and get logged
 * out. Instead the first 401 starts the refresh and the rest await the same
 * promise.
 */
let refreshPromise = null;

function refreshAccessToken() {
  if (!refreshPromise) {
    // A bare axios call, not `api` — going through the instance would run
    // this response interceptor again on failure and recurse.
    refreshPromise = axios
      .post(`${baseURL}/auth/refresh`, {}, { withCredentials: true })
      .then((res) => {
        setAccessToken(res.data.accessToken);
        return res.data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/*
 * THE RETRY INTERCEPTOR
 *
 * Flow: request 401s -> refresh the access token -> replay the original
 * request with the new token -> the caller's await resolves with real data
 * and never knows the token had expired.
 *
 * THE INFINITE LOOP THIS HAS TO AVOID
 *
 * The naive version is "on 401, refresh, then retry". If the retry also
 * 401s — expired refresh token, revoked session, deactivated account — the
 * interceptor sees another 401 and refreshes and retries again, forever.
 * Every failure becomes an infinite request storm against the API.
 *
 * Three guards, each closing a different door:
 *
 *   1. config._retry — a flag stamped on the request config before replaying
 *      it. A replayed request that 401s again is rejected outright. This is
 *      the guard that bounds recursion to exactly one retry per request.
 *
 *   2. The auth endpoints are excluded. A 401 from /auth/login means "wrong
 *      password" and from /auth/refresh means "your session is over" —
 *      neither is fixable by refreshing, and refreshing on a failed refresh
 *      is the tightest possible loop.
 *
 *   3. The shared refreshPromise. Not a loop guard as such, but it stops N
 *      concurrent 401s from becoming N competing refreshes.
 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;

    // Network failure or non-401: nothing to do here.
    if (!response || response.status !== 401 || !config) {
      return Promise.reject(error);
    }

    // Guard 2 — never try to refresh a failed auth call.
    const isAuthCall = config.url?.includes('/auth/');
    // Guard 1 — this request has already been retried once.
    if (isAuthCall || config._retry) {
      if (!isAuthCall) onSessionExpired();
      return Promise.reject(error);
    }

    config._retry = true;

    try {
      const token = await refreshAccessToken();   // Guard 3 — deduplicated
      config.headers.Authorization = `Bearer ${token}`;
      return api(config); // replay the original request, transparently
    } catch (refreshError) {
      onSessionExpired();
      return Promise.reject(refreshError);
    }
  }
);

/** Normalises the API's error shape for display. */
export const errorMessage = (err) =>
  err?.response?.data?.error || err?.message || 'Something went wrong';
