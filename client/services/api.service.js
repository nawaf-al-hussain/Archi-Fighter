const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

if (!import.meta.env.VITE_API_BASE_URL) {
  console.warn("[config] VITE_API_BASE_URL not set — falling back to localhost. This will not work in production.");
}

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Base fetch wrapper with retry on 5xx and network errors.
 * @param {string} path     - e.g. "/players"
 * @param {RequestInit} [options]
 * @param {string} [token]  - Bearer token if required
 * @returns {Promise<any>}
 */
export async function apiFetch(path, options = {}, token = null) {
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers ?? {}),
  };

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers,
      });

      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await sleep(INITIAL_DELAY_MS * 2 ** attempt);
        continue;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw Object.assign(new Error(body.error ?? `HTTP ${response.status}`), { status: response.status });
      }

      return response.json();
    } catch (err) {
      lastErr = err;
      // Network error (TypeError) — retry
      if (err instanceof TypeError && attempt < MAX_RETRIES) {
        await sleep(INITIAL_DELAY_MS * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
