/**
 * Minimal JSON API client.
 *
 * The app has no HTTP layer of its own, so this module defines the one
 * contract every browser-side caller uses: JSON in, JSON out, with an
 * explicit timeout, typed failures and no `fetch` global assumptions
 * (the implementation is injectable for tests and for non-browser callers).
 *
 * Base URL resolution:
 *   1. an explicit `baseUrl` option,
 *   2. `process.env.NEXT_PUBLIC_API_BASE_URL`,
 *   3. the empty string, meaning "same origin".
 */

export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'invalid-response';

/** Error thrown by {@link api} for every non-success outcome. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** HTTP status code, present when `kind === 'http'`. */
  readonly status: number | undefined;

  constructor(message: string, kind: ApiErrorKind, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

/** Default request timeout in milliseconds. */
export const DEFAULT_API_TIMEOUT_MS = 10_000;

export type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Plain object serialised as JSON (or `undefined` for no body). */
  body?: unknown;
  headers?: Record<string, string>;
  /** Caller-owned signal; aborting it aborts the request. */
  signal?: AbortSignal;
  timeoutMs?: number;
  baseUrl?: string;
  /** Injectable fetch implementation, defaulting to the global. */
  fetchImpl?: typeof fetch;
};

/**
 * Resolves the API origin the app should talk to.
 *
 * Returns `''` (same origin) when nothing is configured, so callers can use
 * relative paths without special-casing.
 */
export function resolveApiBaseUrl(explicit?: string): string {
  if (explicit !== undefined) return explicit.replace(/\/+$/, '');
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, '');
}

/**
 * Performs a JSON request and resolves with the parsed body.
 *
 * - Rejects with {@link ApiError} on abort/timeout, network failure or a
 *   non-2xx response.
 * - `204 No Content` resolves with `undefined`.
 * - The response is parsed as JSON; unparseable successful responses reject
 *   with `kind: 'invalid-response'`.
 */
export async function api<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    headers = {},
    signal,
    timeoutMs = DEFAULT_API_TIMEOUT_MS,
    baseUrl,
    fetchImpl,
  } = options;

  const fetchFn = fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetchFn) {
    throw new ApiError('No fetch implementation is available', 'network');
  }

  const url = `${resolveApiBaseUrl(baseUrl)}${path}`;
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort);

  try {
    const response = await fetchFn(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      let message = `Request failed with status ${response.status}`;
      try {
        const payload = (await response.json()) as { error?: unknown };
        if (typeof payload?.error === 'string' && payload.error) {
          message = payload.error;
        }
      } catch {
        // A non-JSON error body is expected for some proxies; keep the default.
      }
      throw new ApiError(message, 'http', response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiError('Response body was not valid JSON', 'invalid-response');
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) {
      throw new ApiError(`Request timed out after ${timeoutMs}ms`, 'timeout');
    }
    if (signal?.aborted) {
      throw new ApiError('Request was cancelled', 'network');
    }
    throw new ApiError(
      error instanceof Error ? error.message : 'Network request failed',
      'network',
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}
