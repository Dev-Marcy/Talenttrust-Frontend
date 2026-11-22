/**
 * `stellar/status.ts` is server-only (imported by a route handler), so this
 * suite runs in the node environment.
 *
 * @jest-environment node
 */
import { rpc } from '@stellar/stellar-sdk';
import { readContractStatus, type StatusServer } from '../stellar/status';

const CONTRACT = 'CABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAFNSZ';

function makeServer(
  entries: Array<{ lastModifiedLedgerSeq?: number; liveUntilLedgerSeq?: number }>,
  latestLedger = 1_000,
): { server: StatusServer; getLedgerEntries: jest.Mock } {
  const getLedgerEntries = jest.fn().mockResolvedValue({
    entries,
    latestLedger,
  } as unknown as rpc.Api.GetLedgerEntriesResponse);

  return { server: { getLedgerEntries }, getLedgerEntries };
}

describe('readContractStatus', () => {
  it('reports a deployed contract with its ledger metadata', async () => {
    const { server, getLedgerEntries } = makeServer(
      [{ lastModifiedLedgerSeq: 900, liveUntilLedgerSeq: 5_000 }],
      1_000,
    );

    const status = await readContractStatus({
      contractId: CONTRACT.toLowerCase(),
      server,
      now: () => new Date('2026-11-22T09:00:00.000Z'),
    });

    expect(status).toEqual({
      contractId: CONTRACT,
      deployed: true,
      latestLedger: 1_000,
      lastModifiedLedger: 900,
      liveUntilLedger: 5_000,
      checkedAt: '2026-11-22T09:00:00.000Z',
    });

    expect(getLedgerEntries).toHaveBeenCalledTimes(1);
    expect(getLedgerEntries.mock.calls[0][0]).toEqual(
      expect.objectContaining({ type: 'contractData' }),
    );
  });

  it('reports not deployed when the instance entry is missing', async () => {
    const { server } = makeServer([], 777);

    const status = await readContractStatus({ contractId: CONTRACT, server });

    expect(status).toMatchObject({
      deployed: false,
      latestLedger: 777,
      lastModifiedLedger: null,
      liveUntilLedger: null,
    });
  });

  it('rejects non-contract ids before calling the RPC', async () => {
    const { server, getLedgerEntries } = makeServer([]);

    await expect(
      readContractStatus({ contractId: 'contract-123', server }),
    ).rejects.toThrow('is not a Soroban contract address');

    expect(getLedgerEntries).not.toHaveBeenCalled();
  });

  it('propagates RPC failures', async () => {
    const server: StatusServer = {
      getLedgerEntries: jest.fn().mockRejectedValue(new Error('rpc unavailable')),
    };

    await expect(readContractStatus({ contractId: CONTRACT, server })).rejects.toThrow(
      'rpc unavailable',
    );
  });
});
