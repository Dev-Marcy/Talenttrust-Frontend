/**
 * Soroban contract event decoding and fetching.
 *
 * Decoding is deliberately done with `@stellar/stellar-sdk`'s `scValToNative`:
 * the XDR is never hand-rolled here, and no RPC field beyond the SDK's
 * documented `rpc.Api.EventResponse` is assumed.
 *
 * Everything in this module is server-side (a Next.js route handler calls
 * {@link fetchRecentEvents}) so the SDK never enters the browser bundle.
 */

import { rpc, scValToNative } from '@stellar/stellar-sdk';
import { isContractAddress } from './address';

/** Default Soroban RPC endpoint, overridable with `STELLAR_RPC_URL`. */
export const DEFAULT_RPC_URL =
  process.env.STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org';

/** Default maximum number of events returned by {@link fetchRecentEvents}. */
export const DEFAULT_EVENT_LIMIT = 20;

/** Hard ceiling for a single activity request. */
export const MAX_EVENT_LIMIT = 100;

/**
 * How far back to look when the caller does not supply a start ledger.
 * 17 280 ledgers ≈ 24 hours at the 5-second ledger close time Soroban uses.
 */
export const EVENT_LOOKBACK_LEDGERS = 17_280;

/** A single decoded contract event, ready for display. */
export type ActivityEvent = {
  /** Unique RPC event id. */
  id: string;
  /** Ledger sequence the event was emitted in. */
  ledger: number;
  /** ISO-8601 ledger close time, as reported by RPC. */
  closedAt: string;
  /** Transaction hash that produced the event. */
  txHash: string;
  /** Contract address the event belongs to, when RPC supplies one. */
  contractId: string | null;
  /** First topic rendered as text (e.g. `transfer`). */
  kind: string;
  /** Every remaining topic rendered as text, in order. */
  topics: string[];
  /** Address found among the topics, when there is one. */
  actor: string | null;
  /** Event value rendered as text (exact, untruncated). */
  value: string;
  /** One-line human summary: `kind · topics · value`. */
  summary: string;
};

/** The subset of `rpc.Server` this module needs; injectable for tests. */
export type EventsServer = {
  getLatestLedger(): Promise<{ sequence: number }>;
  getEvents(request: rpc.Api.GetEventsRequest): Promise<rpc.Api.GetEventsResponse>;
};

const ADDRESS_PATTERN = /^[GC][A-Z2-7]{55}$/;

/**
 * Renders an `scValToNative` result as display text without losing precision:
 * `bigint` values keep all digits, byte arrays become hex, and structures are
 * JSON-serialised with bigints stringified.
 */
export function formatNativeValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Uint8Array) {
    return Array.from(value)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  try {
    return JSON.stringify(value, (_key, nested) =>
      typeof nested === 'bigint' ? nested.toString() : nested,
    );
  } catch {
    return String(value);
  }
}

function decodeTopic(topic: unknown): string {
  try {
    return formatNativeValue(scValToNative(topic as never));
  } catch {
    return '';
  }
}

/**
 * Decodes one RPC event into an {@link ActivityEvent}.
 *
 * Unknown or undecodable topics degrade to `'event'` / `''` instead of
 * throwing, so one odd event can never blank the whole timeline.
 */
export function describeContractEvent(event: rpc.Api.EventResponse): ActivityEvent {
  const decodedTopics = (event.topic ?? []).map(decodeTopic);
  const [firstTopic, ...restTopics] = decodedTopics;

  let value: string;
  try {
    value = formatNativeValue(scValToNative(event.value));
  } catch {
    value = '';
  }

  const actor =
    decodedTopics.find((topic) => ADDRESS_PATTERN.test(topic)) ?? null;
  const kind = firstTopic || 'event';
  const summary = [kind, ...restTopics, value].filter(Boolean).join(' · ');

  return {
    id: event.id,
    ledger: event.ledger,
    closedAt: event.ledgerClosedAt,
    txHash: event.txHash,
    contractId: event.contractId?.toString() ?? null,
    kind,
    topics: restTopics,
    actor,
    value,
    summary,
  };
}

export type FetchRecentEventsOptions = {
  /** Soroban contract address to read events for. */
  contractId: string;
  /** Start ledger; defaults to `latest - EVENT_LOOKBACK_LEDGERS`. */
  startLedger?: number;
  /** Maximum events to request, clamped to {@link MAX_EVENT_LIMIT}. */
  limit?: number;
  /** RPC endpoint; defaults to {@link DEFAULT_RPC_URL}. */
  rpcUrl?: string;
  /** Pre-built server, injected by tests. */
  server?: EventsServer;
};

function createServer(rpcUrl: string): EventsServer {
  return new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
}

/**
 * Fetches the most recent events for `contractId`, newest first.
 *
 * @throws {Error} when `contractId` is not a Soroban contract address, or when
 *   the RPC call itself fails. Callers decide how to surface that.
 */
export async function fetchRecentEvents(
  options: FetchRecentEventsOptions,
): Promise<ActivityEvent[]> {
  const contractId = options.contractId.trim().toUpperCase();
  if (!isContractAddress(contractId)) {
    throw new Error(`"${options.contractId}" is not a Soroban contract address.`);
  }

  const limit = Math.min(
    Math.max(1, options.limit ?? DEFAULT_EVENT_LIMIT),
    MAX_EVENT_LIMIT,
  );
  const server = options.server ?? createServer(options.rpcUrl ?? DEFAULT_RPC_URL);

  let startLedger = options.startLedger;
  if (startLedger === undefined) {
    const latest = await server.getLatestLedger();
    startLedger = Math.max(1, latest.sequence - EVENT_LOOKBACK_LEDGERS);
  }

  const response = await server.getEvents({
    startLedger,
    filters: [{ type: 'contract', contractIds: [contractId] }],
    limit,
  });

  return (response.events ?? [])
    .map(describeContractEvent)
    .sort((left, right) => {
      if (right.ledger !== left.ledger) return right.ledger - left.ledger;
      return right.id.localeCompare(left.id);
    });
}
