import React from 'react';
import StatusClient from './StatusClient';

export const metadata = {
  title: 'System status',
  description: 'Live deployment status of the TalentTrust escrow contract.',
};

export default function StatusPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">System status</h1>
          <p className="mt-1 text-sm text-slate-600">
            Current availability of the escrow contract as reported by Stellar RPC.
          </p>
        </div>
        <StatusClient />
      </div>
    </main>
  );
}
