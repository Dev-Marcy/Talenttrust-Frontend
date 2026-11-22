/**
 * Status helpers for the `/status` page.
 *
 * Two responsibilities:
 *  - {@link fetchWithTimeout}: fetch with a hard deadline that never leaves a
 *    request hanging, while still honouring a caller-supplied abort signal.
 *  - {@link checkContractHealth}: turn the `/api/status/contract` response into
 *    a small, display-ready health object.
 */

import type { ContractStatus } from './stellar/status';

/** Default deadline for a status probe. */
export const STATUS_TIMEOUT_MS = 8_000;

/** Path of the contract status endpoint. */
export const CONTRACT_STATUS_PATH = '/api/status/contract';

/** Raised when a status request exceeds its deadline. */
export class StatusTimeoutError extends Error {
  constructor(message = 'The status request timed out.') {
    super(message);
    this.name = 'StatusTimeoutError';
  }
}

export type FetchWithTimeoutOptions = {
  timeoutMs?: number;
  /** Caller-owned signal; aborting it aborts the request. */
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

/**
 * `fetch` with a deadline.
 *
 * @throws {StatusTimeoutError} when `timeoutMs` elapses first.
 * @throws {DOMException} `AbortError` when the caller's signal aborts.
 */
export async function fetchWithTimeout(
  url: string,
  init: Parameters<typeof fetch>[1] = {},
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const { timeoutMs = STATUS_TIMEOUT_MS, signal, fetchImpl } = options;
  const fetchFn = fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);

  if (!fetchFn) {
    throw new Error('No fetch implementation is available.');
  }

  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort);

  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new StatusTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

export type ContractHealthState = 'operational' | 'degraded' | 'unavailable';

/** Health snapshot rendered by the status page. */
export type ContractHealth = {
  state: ContractHealthState;
  /** `null` when the contract status could not be determined. */
  deployed: boolean | null;
  latestLedger?: number;
  lastModifiedLedger?: number | null;
  liveUntilLedger?: number | null;
  /** ISO-8601 timestamp of this check. */
  checkedAt: string;
  /** Round-trip time in milliseconds. */
  latencyMs: number;
  /** Human-readable explanation for a non-operational state. */
  message?: string;
};

export type CheckContractHealthOptions = {
  url?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  now?: () => Date;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStatus(payload: unknown): ContractStatus | null {
  if (!isRecord(payload) || !isRecord(payload.status)) return null;

  const status = payload.status;
  if (typeof status.deployed !== 'boolean' || typeof status.latestLedger !== 'number') {
    return null;
  }

  return status as unknown as ContractStatus;
}

/**
 * Probes the contract status endpoint and classifies the result.
 *
 * - `operational` — contract instance entry found.
 * - `degraded` — endpoint answered but the contract is not deployed, or the
 *   endpoint reported a problem.
 * - `unavailable` — the request failed (network, timeout, malformed body).
 *
 * Never throws; transport problems are part of the returned health.
 */
export async function checkContractHealth(
  options: CheckContractHealthOptions = {},
): Promise<ContractHealth> {
  const url = options.url ?? CONTRACT_STATUS_PATH;
  const startedAt = Date.now();
  const checkedAt = () => (options.now?.() ?? new Date()).toISOString();

  try {
    const response = await fetchWithTimeout(
      url,
      { headers: { Accept: 'application/json' }, cache: 'no-store' },
      {
        timeoutMs: options.timeoutMs,
        signal: options.signal,
        fetchImpl: options.fetchImpl,
      },
    );

    const latencyMs = Date.now() - startedAt;

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message =
        isRecord(payload) && typeof payload.error === 'string' && payload.error
          ? payload.error
          : `Status endpoint returned HTTP ${response.status}.`;
      return { state: 'degraded', deployed: null, checkedAt: checkedAt(), latencyMs, message };
    }

    const status = readStatus(payload);
    if (!status) {
      return {
        state: 'unavailable',
        deployed: null,
        checkedAt: checkedAt(),
        latencyMs,
        message: 'Status endpoint returned an unexpected response.',
      };
    }

    return {
      state: status.deployed ? 'operational' : 'degraded',
      deployed: status.deployed,
      latestLedger: status.latestLedger,
      lastModifiedLedger: status.lastModifiedLedger ?? null,
      liveUntilLedger: status.liveUntilLedger ?? null,
      checkedAt: status.checkedAt || checkedAt(),
      latencyMs,
      ...(status.deployed
        ? {}
        : { message: 'The contract instance was not found in the current ledger.' }),
    };
  } catch (error) {
    return {
      state: 'unavailable',
      deployed: null,
      checkedAt: checkedAt(),
      latencyMs: Date.now() - startedAt,
      message:
        error instanceof StatusTimeoutError
          ? 'The status check timed out.'
          : 'Could not reach the status endpoint.',
    };
  }
}
