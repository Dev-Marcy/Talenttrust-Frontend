import Link from 'next/link';
import React from 'react';

export type EscrowCardProps = {
  /** Contract address (or internal contract id) the escrow belongs to. */
  contractId: string;
  /** Optional human label, e.g. the contract name. */
  title?: string;
  /** Optional status shown alongside the id. */
  status?: string;
};

function shorten(id: string): string {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

/**
 * Compact escrow summary card that links to the contract's activity timeline.
 */
export default function EscrowCard({ contractId, title, status }: EscrowCardProps) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Escrow</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-900">
        {title ?? `Contract ${shorten(contractId)}`}
      </h3>
      <p className="mt-1 break-all font-mono text-xs text-slate-500" title={contractId}>
        {contractId}
      </p>
      {status && (
        <p className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
          {status}
        </p>
      )}
      <Link
        href={`/contracts/${encodeURIComponent(contractId)}/activity`}
        className="mt-4 inline-flex rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      >
        View activity
      </Link>
    </article>
  );
}
