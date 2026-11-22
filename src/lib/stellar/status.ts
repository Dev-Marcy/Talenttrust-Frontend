/**
 * Contract status check.
 *
 * The status page reports the state of the deployed escrow contract using the
 * contract's real ledger entry over Soroban RPC — not a hardcoded "operational".
 * "Deployed" means the contract instance entry currently exists in the ledger,
 * which is exactly what `getLedgerEntries` on the contract footprint answers.
 *
 * The SDK supplies the footprint (`Contract#getFootprint`) and parses the XDR,
 * so no ledger key or response field is hand-constructed here.
 */

import { Contract, rpc, xdr } from '@stellar/stellar-sdk';
import { isContractAddress, normalizeAddress } from './address';

/** Default Soroban RPC endpoint, overridable with `STELLAR_RPC_URL`. */
export const DEFAULT_RPC_URL =
  process.env.STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org';

/** Snapshot of a contract's on-chain deployment state. */
export type ContractStatus = {
  contractId: string;
  /** `true` when the contract instance ledger entry exists. */
  deployed: boolean;
  /** Latest ledger known to the RPC at check time. */
  latestLedger: number;
  /** Ledger in which the instance entry was last modified, when present. */
  lastModifiedLedger: number | null;
  /** Ledger at which the instance entry expires, when the RPC reports it. */
  liveUntilLedger: number | null;
  /** ISO-8601 timestamp of this check. */
  checkedAt: string;
};

/** The subset of `rpc.Server` used here; injectable for tests. */
export type StatusServer = {
  getLedgerEntries(...keys: xdr.LedgerKey[]): Promise<rpc.Api.GetLedgerEntriesResponse>;
};

export type ReadContractStatusOptions = {
  contractId: string;
  rpcUrl?: string;
  server?: StatusServer;
  /** Clock override, for deterministic tests. */
  now?: () => Date;
};

/**
 * Builds the ledger key for a contract's instance entry.
 *
 * @throws {Error} when `contractId` is not a valid contract address.
 */
export function contractFootprint(contractId: string): xdr.LedgerKey {
  return new Contract(contractId).getFootprint();
}

/**
 * Reads the contract's deployment status from Soroban RPC.
 *
 * @throws {Error} for an invalid contract id, or when the RPC call fails.
 *   A missing entry is *not* an error: it resolves with `deployed: false`.
 */
export async function readContractStatus(
  options: ReadContractStatusOptions,
): Promise<ContractStatus> {
  const contractId = normalizeAddress(options.contractId);

  if (!isContractAddress(contractId)) {
    throw new Error(`"${options.contractId}" is not a Soroban contract address.`);
  }

  const server: StatusServer =
    options.server ??
    new rpc.Server(options.rpcUrl ?? DEFAULT_RPC_URL, {
      allowHttp: (options.rpcUrl ?? DEFAULT_RPC_URL).startsWith('http://'),
    });

  const response = await server.getLedgerEntries(contractFootprint(contractId));
  const entry = response.entries?.[0];

  return {
    contractId,
    deployed: Boolean(entry),
    latestLedger: response.latestLedger,
    lastModifiedLedger: entry?.lastModifiedLedgerSeq ?? null,
    liveUntilLedger: entry?.liveUntilLedgerSeq ?? null,
    checkedAt: (options.now?.() ?? new Date()).toISOString(),
  };
}
