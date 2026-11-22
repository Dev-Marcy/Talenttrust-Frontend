'use client';

/**
 * Escrow activity timeline.
 *
 * Renders the on-chain events for a Soroban contract as a chronological
 * timeline. Data comes from `/api/escrow/:contractId/activity` (decoded
 * server-side by `@stellar/stellar-sdk`), so this component never touches XDR.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityEvent } from '@/lib/stellar/events';

/** Fetches decoded events for a contract. Injectable for tests. */
export type ActivityFetcher = (
  contractId: string,
  options: { signal: AbortSignal },
) => Promise<ActivityEvent[]>;

export type EscrowActivityProps = {
  /** Soroban contract address to show activity for. */
  contractId: string;
  /** Overrides the default HTTP fetcher. */
  fetcher?: ActivityFetcher;
  /** Maximum events rendered. Defaults to 20. */
  limit?: number;
};

type LoadState = 'loading' | 'ready' | 'error';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseEvents(payload: unknown): ActivityEvent[] {
  if (!isRecord(payload) || !Array.isArray(payload.events)) {
    throw new Error('Activity response was not in the expected shape.');
  }

  return payload.events.filter(
    (event): event is ActivityEvent =>
      isRecord(event) &&
      typeof event.id === 'string' &&
      typeof event.ledger === 'number' &&
      typeof event.summary === 'string' &&
      typeof event.closedAt === 'string',
  );
}

const defaultFetcher: ActivityFetcher = async (contractId, { signal }) => {
  const response = await fetch(
    `/api/escrow/${encodeURIComponent(contractId)}/activity`,
    { signal, headers: { Accept: 'application/json' } },
  );

  if (!response.ok) {
    let message = 'Could not load contract activity.';
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body?.error === 'string' && body.error) message = body.error;
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new Error(message);
  }

  return parseEvents(await response.json());
};

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function EscrowActivity({
  contractId,
  fetcher,
  limit = 20,
}: EscrowActivityProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setState('loading');
    setErrorMessage(null);

    try {
      const next = await (fetcher ?? defaultFetcher)(contractId, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setEvents(next.slice(0, limit));
      setState('ready');
    } catch (error) {
      if (controller.signal.aborted) return;
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Could not load contract activity.',
      );
      setState('error');
    }
  }, [contractId, fetcher, limit]);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  return (
    <section
      aria-labelledby="escrow-activity-heading"
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="escrow-activity-heading" className="text-xl font-semibold text-slate-900">
          Escrow activity
        </h2>
        {state === 'ready' && (
          <p className="text-sm text-slate-500">
            {events.length} {events.length === 1 ? 'event' : 'events'}
          </p>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-600">
        On-chain events emitted by this contract, newest first.
      </p>

      <div aria-live="polite" className="sr-only">
        {state === 'loading'
          ? 'Loading contract activity.'
          : state === 'error'
            ? 'Contract activity failed to load.'
            : `${events.length} contract events loaded.`}
      </div>

      {state === 'loading' && (
        <ul aria-label="Loading contract activity" className="mt-6 space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <li
              key={index}
              className="h-20 animate-pulse rounded-2xl border border-slate-200 bg-slate-50"
              aria-hidden="true"
            />
          ))}
        </ul>
      )}

      {state === 'error' && (
        <div role="alert" className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p className="font-semibold">Activity unavailable</p>
          <p className="mt-1">{errorMessage}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-xl border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
          >
            Retry
          </button>
        </div>
      )}

      {state === 'ready' && events.length === 0 && (
        <p className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          No activity has been recorded for this contract in the recent ledger
          window.
        </p>
      )}

      {state === 'ready' && events.length > 0 && (
        <ol className="mt-6 space-y-4 border-l border-slate-200 pl-4">
          {events.map((event) => (
            <li key={event.id} className="relative rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <span
                aria-hidden="true"
                className="absolute -left-[1.4rem] top-6 h-2.5 w-2.5 rounded-full bg-blue-600"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-blue-800">
                  {event.kind}
                </span>
                <time dateTime={event.closedAt} className="text-xs text-slate-500">
                  {formatTimestamp(event.closedAt)}
                </time>
              </div>
              <p className="mt-2 break-words text-sm text-slate-900">{event.summary}</p>
              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <div className="flex gap-1">
                  <dt className="font-medium">Ledger</dt>
                  <dd>{event.ledger}</dd>
                </div>
                {event.actor && (
                  <div className="flex min-w-0 gap-1">
                    <dt className="font-medium">Actor</dt>
                    <dd className="truncate font-mono" title={event.actor}>
                      {event.actor}
                    </dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
