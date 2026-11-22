/**
 * `events.ts` is server-only (it is imported by a route handler), so this
 * suite runs in the node environment where TextDecoder and friends exist.
 *
 * @jest-environment node
 */
import { nativeToScVal, rpc } from '@stellar/stellar-sdk';
import {
  DEFAULT_EVENT_LIMIT,
  EVENT_LOOKBACK_LEDGERS,
  describeContractEvent,
  fetchRecentEvents,
  formatNativeValue,
  type EventsServer,
} from '../stellar/events';

const CONTRACT = 'CABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAFNSZ';
const ACCOUNT = 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H';

function makeEvent(overrides: Partial<rpc.Api.EventResponse> = {}): rpc.Api.EventResponse {
  return {
    id: 'evt-1',
    type: 'contract',
    ledger: 500,
    ledgerClosedAt: '2026-11-01T10:00:00Z',
    transactionIndex: 0,
    operationIndex: 0,
    txHash: 'deadbeef',
    contractId: CONTRACT,
    topic: [
      nativeToScVal('transfer', { type: 'symbol' }),
      nativeToScVal(ACCOUNT, { type: 'address' }),
    ],
    value: nativeToScVal(12345n, { type: 'i128' }),
    ...overrides,
  } as unknown as rpc.Api.EventResponse;
}

describe('formatNativeValue', () => {
  it('keeps bigint precision and hex-encodes bytes', () => {
    expect(formatNativeValue(9007199254740993n)).toBe('9007199254740993');
    expect(formatNativeValue(new Uint8Array([0x0a, 0xff]))).toBe('0aff');
    expect(formatNativeValue({ amount: 5n })).toBe('{"amount":"5"}');
    expect(formatNativeValue(null)).toBe('');
  });
});

describe('describeContractEvent', () => {
  it('decodes topics and value with the Stellar SDK', () => {
    const decoded = describeContractEvent(makeEvent());

    expect(decoded).toMatchObject({
      id: 'evt-1',
      ledger: 500,
      closedAt: '2026-11-01T10:00:00Z',
      txHash: 'deadbeef',
      contractId: CONTRACT,
      kind: 'transfer',
      topics: [ACCOUNT],
      actor: ACCOUNT,
      value: '12345',
      summary: `transfer · ${ACCOUNT} · 12345`,
    });
  });

  it('degrades to an "event" kind when the first topic is missing', () => {
    const decoded = describeContractEvent(makeEvent({ topic: [] }));

    expect(decoded.kind).toBe('event');
    expect(decoded.actor).toBeNull();
    expect(decoded.value).toBe('12345');
  });

  it('never throws on an undecodable value', () => {
    const decoded = describeContractEvent(
      makeEvent({ value: { not: 'scval' } as unknown as rpc.Api.EventResponse['value'] }),
    );

    expect(decoded.kind).toBe('transfer');
    expect(decoded.value).toBe('');
  });
});

describe('fetchRecentEvents', () => {
  function makeServer(
    events: rpc.Api.EventResponse[],
    sequence = 100_000,
  ): { server: EventsServer; getEvents: jest.Mock; getLatestLedger: jest.Mock } {
    const getEvents = jest.fn().mockResolvedValue({
      events,
      cursor: 'cursor',
      latestLedger: sequence,
      oldestLedger: 1,
      latestLedgerCloseTime: '2026-11-01T10:00:00Z',
      oldestLedgerCloseTime: '2026-01-01T00:00:00Z',
    });
    const getLatestLedger = jest.fn().mockResolvedValue({ sequence });

    return { server: { getEvents, getLatestLedger }, getEvents, getLatestLedger };
  }

  it('queries the contract filter over the default lookback window', async () => {
    const { server, getEvents } = makeServer([makeEvent()]);

    await fetchRecentEvents({ contractId: CONTRACT.toLowerCase(), server });

    expect(getEvents).toHaveBeenCalledWith({
      startLedger: 100_000 - EVENT_LOOKBACK_LEDGERS,
      filters: [{ type: 'contract', contractIds: [CONTRACT] }],
      limit: DEFAULT_EVENT_LIMIT,
    });
  });

  it('clamps the limit and honours an explicit start ledger', async () => {
    const { server, getEvents, getLatestLedger } = makeServer([]);

    await fetchRecentEvents({
      contractId: CONTRACT,
      startLedger: 42,
      limit: 5_000,
      server,
    });

    expect(getLatestLedger).not.toHaveBeenCalled();
    expect(getEvents).toHaveBeenCalledWith(
      expect.objectContaining({ startLedger: 42, limit: 100 }),
    );
  });

  it('returns events newest first', async () => {
    const older = makeEvent({ id: 'evt-old', ledger: 400 });
    const newer = makeEvent({ id: 'evt-new', ledger: 900 });
    const { server } = makeServer([older, newer]);

    const events = await fetchRecentEvents({ contractId: CONTRACT, server });

    expect(events.map((event) => event.id)).toEqual(['evt-new', 'evt-old']);
  });

  it('rejects non-contract ids before touching the network', async () => {
    const { server, getEvents } = makeServer([]);

    await expect(
      fetchRecentEvents({ contractId: 'contract-123', server }),
    ).rejects.toThrow('is not a Soroban contract address');

    expect(getEvents).not.toHaveBeenCalled();
  });

  it('propagates RPC failures to the caller', async () => {
    const server: EventsServer = {
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 10 }),
      getEvents: jest.fn().mockRejectedValue(new Error('rpc down')),
    };

    await expect(fetchRecentEvents({ contractId: CONTRACT, server })).rejects.toThrow('rpc down');
  });
});
