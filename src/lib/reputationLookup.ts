/**
 * Reputation lookup client.
 *
 * The lookup UI never talks to the indexer directly: it calls this module,
 * which validates the address locally, issues one request through {@link api}
 * and validates the response shape before any of it reaches React.
 *
 * ## Response contract
 *
 * `GET {NEXT_PUBLIC_API_BASE_URL}/api/reputation/lookup?address=<address>`
 *
 * ```json
 * {
 *   "score": 4.5,
 *   "level": "Expert",
 *   "lastUpdated": "2026-11-20T09:30:00Z",
 *   "history": [
 *     { "id": "evt-1", "type": "Contract", "summary": "Completed 3 milestones", "date": "2026-11-01" }
 *   ]
 * }
 * ```
 *
 * `score` is required; `level`, `lastUpdated` and `history` are optional.
 * Unknown fields are ignored, malformed history entries are dropped, and a
 * missing/!numeric `score` fails the lookup with `kind: 'invalid-response'`
 * rather than rendering a misleading "0".
 *
 * When no API base URL is configured the lookup fails fast with
 * `kind: 'unconfigured'` — there is deliberately no fake/sample fallback.
 */

import type { ReputationEvent } from '@/types/domain';
import { ApiError, api } from './api';
import { normalizeAddress, validateAddress } from './stellar/address';

/** Path of the reputation lookup endpoint, relative to the API origin. */
export const REPUTATION_LOOKUP_PATH = '/api/reputation/lookup';

/** Highest score the reputation UI renders on its 0–5 scale. */
export const MAX_REPUTATION_SCORE = 5;

export type ReputationLookupResult = {
  /** Canonical (upper-case) address that was looked up. */
  address: string;
  /** Reputation score on the 0–5 scale. */
  score: number;
  /** Human-readable level, e.g. "Expert". */
  level: string;
  /** Verified events backing the score. May be empty. */
  history: ReputationEvent[];
  /** ISO-8601 timestamp of the last indexer update, when supplied. */
  lastUpdated?: string;
};

export type ReputationLookupErrorKind =
  | 'invalid-address'
  | 'unconfigured'
  | 'network'
  | 'timeout'
  | 'service'
  | 'invalid-response';

/** Error raised by {@link lookupReputation}; `kind` drives the UI message. */
export class ReputationLookupError extends Error {
  readonly kind: ReputationLookupErrorKind;

  constructor(message: string, kind: ReputationLookupErrorKind) {
    super(message);
    this.name = 'ReputationLookupError';
    this.kind = kind;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseHistoryEntry(value: unknown): ReputationEvent | null {
  if (!isRecord(value)) return null;

  const { id, type, summary, date } = value;
  if (
    typeof id !== 'string' ||
    !id ||
    typeof type !== 'string' ||
    !type ||
    typeof summary !== 'string' ||
    !summary ||
    typeof date !== 'string' ||
    Number.isNaN(Date.parse(date))
  ) {
    return null;
  }

  return { id, type, summary, date };
}

/**
 * Validates an untrusted lookup payload.
 *
 * @throws {ReputationLookupError} `kind: 'invalid-response'` when the payload
 *   is not an object or carries no usable numeric score.
 */
export function parseReputationLookup(
  payload: unknown,
  address: string,
): ReputationLookupResult {
  if (!isRecord(payload)) {
    throw new ReputationLookupError(
      'Reputation service returned an unexpected response.',
      'invalid-response',
    );
  }

  const { score } = payload;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) {
    throw new ReputationLookupError(
      'Reputation service returned an invalid score.',
      'invalid-response',
    );
  }

  const level =
    typeof payload.level === 'string' && payload.level.trim()
      ? payload.level.trim()
      : 'Unrated';

  const history = Array.isArray(payload.history)
    ? payload.history
        .map(parseHistoryEntry)
        .filter((event): event is ReputationEvent => event !== null)
    : [];

  const result: ReputationLookupResult = {
    address,
    score: Math.min(score, MAX_REPUTATION_SCORE),
    level,
    history,
  };

  if (typeof payload.lastUpdated === 'string' && !Number.isNaN(Date.parse(payload.lastUpdated))) {
    result.lastUpdated = payload.lastUpdated;
  }

  return result;
}

function toLookupError(error: unknown): ReputationLookupError {
  if (error instanceof ReputationLookupError) return error;

  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'timeout':
        return new ReputationLookupError(
          'The reputation service took too long to respond. Try again.',
          'timeout',
        );
      case 'http':
        return new ReputationLookupError(
          error.status === 404
            ? 'No reputation found for this address.'
            : error.message || 'The reputation service could not complete the lookup.',
          'service',
        );
      case 'invalid-response':
        return new ReputationLookupError(
          'The reputation service returned an unexpected response.',
          'invalid-response',
        );
      default:
        return new ReputationLookupError(
          'Could not reach the reputation service. Check your connection and try again.',
          'network',
        );
    }
  }

  return new ReputationLookupError(
    'Could not complete the reputation lookup.',
    'network',
  );
}

export type LookupReputationOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** API origin override; defaults to `NEXT_PUBLIC_API_BASE_URL`. */
  baseUrl?: string;
  /** Injectable fetch, used by tests. */
  fetchImpl?: typeof fetch;
};

/**
 * Looks up the on-chain reputation summary for a Stellar account address.
 *
 * @throws {ReputationLookupError} for invalid input, missing configuration,
 *   transport failures and malformed responses.
 */
export async function lookupReputation(
  rawAddress: string,
  options: LookupReputationOptions = {},
): Promise<ReputationLookupResult> {
  const address = normalizeAddress(rawAddress);

  if (!address) {
    throw new ReputationLookupError('Enter a Stellar address to look up.', 'invalid-address');
  }
  if (!validateAddress(address)) {
    throw new ReputationLookupError(
      'That is not a valid Stellar account address.',
      'invalid-address',
    );
  }

  const baseUrl = options.baseUrl ?? (process.env.NEXT_PUBLIC_API_BASE_URL ?? '');
  if (!baseUrl.trim()) {
    throw new ReputationLookupError(
      'Reputation lookups are not configured. Set NEXT_PUBLIC_API_BASE_URL to enable them.',
      'unconfigured',
    );
  }

  try {
    const payload = await api<unknown>(
      `${REPUTATION_LOOKUP_PATH}?address=${encodeURIComponent(address)}`,
      {
        signal: options.signal,
        timeoutMs: options.timeoutMs,
        baseUrl,
        fetchImpl: options.fetchImpl,
      },
    );

    return parseReputationLookup(payload, address);
  } catch (error) {
    throw toLookupError(error);
  }
}
