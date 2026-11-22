/**
 * Recently viewed reputation profiles, persisted on this device.
 *
 * Storage is best-effort: `safeStorage` already swallows quota/private-mode
 * failures, and every entry is re-validated on read so a corrupt or
 * hand-edited value can never crash the lookup page.
 *
 * Only public, aggregate data is stored — address, score, level, timestamp.
 * No history events, notes or personal metadata are persisted.
 */

import { getItem, removeItem, setItem } from './safeStorage';
import { normalizeAddress, validateAddress } from './stellar/address';

/** localStorage key holding the recent-lookup list. */
export const REPUTATION_HISTORY_KEY = 'talenttrust.reputation.recentLookups';

/** Maximum number of recent lookups kept on device. */
export const MAX_REPUTATION_HISTORY = 8;

export type ReputationHistoryEntry = {
  /** Canonical (upper-case) Stellar account address. */
  address: string;
  /** Score at the time of the lookup. */
  score: number;
  /** Level label at the time of the lookup. */
  level: string;
  /** ISO-8601 timestamp of the lookup. */
  lookedUpAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseEntry(value: unknown): ReputationHistoryEntry | null {
  if (!isRecord(value)) return null;

  const address = normalizeAddress(
    typeof value.address === 'string' ? value.address : '',
  );
  if (!validateAddress(address)) return null;

  const { score, level, lookedUpAt } = value;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) return null;
  if (typeof level !== 'string' || !level.trim()) return null;
  if (typeof lookedUpAt !== 'string' || Number.isNaN(Date.parse(lookedUpAt))) return null;

  return { address, score, level: level.trim(), lookedUpAt };
}

/**
 * Reads the recent-lookup list, newest first.
 *
 * Invalid entries are dropped. Storage failures and unparseable JSON yield an
 * empty list rather than throwing.
 */
export function readReputationHistory(): ReputationHistoryEntry[] {
  const raw = getItem(REPUTATION_HISTORY_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(parseEntry)
      .filter((entry): entry is ReputationHistoryEntry => entry !== null)
      .slice(0, MAX_REPUTATION_HISTORY);
  } catch {
    return [];
  }
}

/**
 * Records a successful lookup, moving an existing entry for the same address
 * to the front instead of duplicating it.
 *
 * @returns The list as it now stands in memory (newest first). The returned
 *   value is accurate even if the underlying write was rejected.
 */
export function recordReputationLookup(
  entry: Omit<ReputationHistoryEntry, 'address' | 'lookedUpAt'> & {
    address: string;
    lookedUpAt?: string;
  },
): ReputationHistoryEntry[] {
  const address = normalizeAddress(entry.address);
  if (!validateAddress(address)) return readReputationHistory();

  const nextEntry: ReputationHistoryEntry = {
    address,
    score: entry.score,
    level: entry.level.trim() || 'Unrated',
    lookedUpAt: entry.lookedUpAt ?? new Date().toISOString(),
  };

  const remaining = readReputationHistory().filter(
    (existing) => existing.address !== address,
  );
  const next = [nextEntry, ...remaining].slice(0, MAX_REPUTATION_HISTORY);

  setItem(REPUTATION_HISTORY_KEY, JSON.stringify(next));
  return next;
}

/**
 * Removes one address from the recent list.
 *
 * @returns The remaining entries.
 */
export function removeReputationLookup(address: string): ReputationHistoryEntry[] {
  const target = normalizeAddress(address);
  const next = readReputationHistory().filter((entry) => entry.address !== target);
  setItem(REPUTATION_HISTORY_KEY, JSON.stringify(next));
  return next;
}

/** Removes every stored lookup. */
export function clearReputationHistory(): void {
  removeItem(REPUTATION_HISTORY_KEY);
}
