const BASE_URL = "http://localhost:3000/api/v1";

/**
 * Base fetch wrapper.
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

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw Object.assign(new Error(body.error ?? `HTTP ${response.status}`), { status: response.status });
  }

  return response.json();
}
