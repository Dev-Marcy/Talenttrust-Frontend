import { NextResponse } from 'next/server';
import { isContractAddress, normalizeAddress } from '@/lib/stellar/address';
import { fetchRecentEvents } from '@/lib/stellar/events';

/** Always hit the RPC live; contract activity is never cached by the route. */
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ contractId: string }> };

/**
 * `GET /api/escrow/:contractId/activity`
 *
 * Returns `{ contractId, events }` for the contract, newest first.
 * Responds `400` for a non-Soroban id and `502` when the RPC call fails.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { contractId } = await context.params;
  const normalized = normalizeAddress(contractId);

  if (!isContractAddress(normalized)) {
    return NextResponse.json(
      {
        error:
          'Activity is only available for Soroban contract addresses (C…).',
      },
      { status: 400 },
    );
  }

  try {
    const events = await fetchRecentEvents({ contractId: normalized });
    return NextResponse.json(
      { contractId: normalized, events },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          'Could not load contract activity from the Stellar RPC. Try again shortly.',
      },
      { status: 502 },
    );
  }
}
