'use client';

/**
 * Live contract status panel.
 *
 * The check itself is real: `/api/status/contract` asks the Soroban RPC for the
 * contract's instance entry. This component only schedules checks and renders
 * the result, so it is equally usable with an injected checker in tests.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  checkContractHealth,
  type ContractHealth,
  type ContractHealthState,
} from '@/lib/status';

/** Default polling interval. */
export const STATUS_POLL_INTERVAL_MS = 60_000;

export interface StatusClientProps {
  /** Overrides the health check, used by tests. */
  checker?: (options: { signal: AbortSignal }) => Promise<ContractHealth>;
  /** Polling interval; `0` disables polling. */
  pollIntervalMs?: number;
}

const STATE_LABELS: Record<ContractHealthState, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  unavailable: 'Unavailable',
};

const STATE_CLASSES: Record<ContractHealthState, string> = {
  operational: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  degraded: 'bg-amber-50 text-amber-900 border-amber-200',
  unavailable: 'bg-rose-50 text-rose-800 border-rose-200',
};

function formatCheckedAt(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

export default function StatusClient({
  checker,
  pollIntervalMs = STATUS_POLL_INTERVAL_MS,
}: StatusClientProps) {
  const [health, setHealth] = useState<ContractHealth | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const runCheck = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setChecking(true);
    setError(null);

    try {
      const next = await (checker ?? checkContractHealth)({
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setHealth(next);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : 'The status check failed.',
      );
    } finally {
      if (!controller.signal.aborted) setChecking(false);
    }
  }, [checker]);

  useEffect(() => {
    void runCheck();
    return () => requestRef.current?.abort();
  }, [runCheck]);

  useEffect(() => {
    if (pollIntervalMs <= 0) return;
    const timer = setInterval(() => void runCheck(), pollIntervalMs);
    return () => clearInterval(timer);
  }, [pollIntervalMs, runCheck]);

  const state = health?.state ?? 'unavailable';
  const label = health ? STATE_LABELS[state] : checking ? 'Checking…' : 'Unknown';

  return (
    <section aria-labelledby="status-heading" className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="status-heading" className="text-lg font-semibold text-slate-900">
              Escrow contract
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Live check of the deployed contract instance over Soroban RPC.
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${
              health ? STATE_CLASSES[state] : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}
          >
            {label}
          </span>
        </div>

        <div aria-live="polite" className="sr-only">
          {health ? `Contract status: ${label}.` : 'Waiting for the first status check.'}
        </div>

        {health && (
          <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Deployed</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {health.deployed === null ? 'Unknown' : health.deployed ? 'Yes' : 'No'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Latest ledger</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {health.latestLedger ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Last modified</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {health.lastModifiedLedger ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Response time</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">{health.latencyMs} ms</dd>
            </div>
          </dl>
        )}

        {health?.message && (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {health.message}
          </p>
        )}

        {error && (
          <div role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <p className="font-semibold">Status check failed</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void runCheck()}
            disabled={checking}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            Check now
          </button>
          {health && (
            <p className="text-xs text-slate-500">
              Last checked{' '}
              <time dateTime={health.checkedAt}>{formatCheckedAt(health.checkedAt)}</time>
              {pollIntervalMs > 0 ? ` · refreshes every ${Math.round(pollIntervalMs / 1000)}s` : ''}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
