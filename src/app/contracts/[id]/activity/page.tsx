import Link from 'next/link';
import React from 'react';
import Breadcrumbs from '@/components/Breadcrumbs';
import EscrowActivity from '@/components/escrow/EscrowActivity';
import EscrowCard from '@/components/escrow/EscrowCard';
import { isContractAddress, normalizeAddress } from '@/lib/stellar/address';
import { isValidContractId } from '@/lib/validateContractId';

type ContractActivityPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * Escrow activity page for a contract.
 *
 * On-chain events are only available for Soroban contract addresses, so ids
 * that are not `C…` addresses (local/demo contracts) get an explanatory card
 * instead of an empty timeline.
 */
export default async function ContractActivityPage({ params }: ContractActivityPageProps) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id ?? '');
  const normalized = normalizeAddress(decodedId);
  const isSorobanContract = isContractAddress(normalized);
  const isValid = isValidContractId(decodedId);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <Breadcrumbs
            items={[
              { label: 'Dashboard', href: '/' },
              { label: 'Contracts', href: '/contracts' },
              { label: `#${decodedId}`, href: `/contracts/${encodeURIComponent(decodedId)}` },
              { label: 'Activity' },
            ]}
          />
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            Contract activity
          </h1>
          <p className="mt-1 break-all font-mono text-sm text-slate-600">{decodedId}</p>
          <Link
            href={`/contracts/${encodeURIComponent(decodedId)}`}
            className="mt-4 inline-flex rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            Back to contract
          </Link>
        </div>

        {!isValid ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800" role="alert">
            <p className="font-semibold">Unknown contract</p>
            <p className="mt-1">This contract id is not valid.</p>
          </div>
        ) : isSorobanContract ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <EscrowActivity contractId={normalized} />
            <EscrowCard contractId={normalized} />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">No on-chain activity</h2>
              <p className="mt-2">
                Activity timelines are read from the Soroban RPC and are only
                available for contract addresses that start with{' '}
                <span className="font-mono">C</span>. This contract uses a local
                identifier.
              </p>
            </div>
            <EscrowCard contractId={normalized} />
          </div>
        )}
      </div>
    </main>
  );
}
