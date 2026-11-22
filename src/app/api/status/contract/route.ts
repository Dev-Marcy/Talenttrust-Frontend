import { NextResponse } from 'next/server';
import { isContractAddress, normalizeAddress } from '@/lib/stellar/address';
import { readContractStatus } from '@/lib/stellar/status';

/** Status must always be read live, never served from a cache. */
export const dynamic = 'force-dynamic';

/**
 * `GET /api/status/contract`
 *
 * Reads the deployed contract's instance ledger entry over Soroban RPC and
 * returns `{ status }`. Responds `503` when no contract is configured and
 * `502` when the RPC itself fails.
 */
export async function GET() {
  const contractId = normalizeAddress(process.env.STELLAR_CONTRACT_ID ?? '');

  if (!isContractAddress(contractId)) {
    return NextResponse.json(
      {
        error:
          'Contract status is not configured. Set STELLAR_CONTRACT_ID to the deployed contract address.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const status = await readContractStatus({ contractId });
    return NextResponse.json(
      { status },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          'Could not read the contract status from the Stellar RPC. Try again shortly.',
      },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
