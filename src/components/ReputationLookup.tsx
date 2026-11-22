'use client';

/**
 * Reputation lookup.
 *
 * A standalone, self-contained search surface: enter a Stellar account
 * address, validate it locally, fetch the aggregate reputation summary and
 * show it with the events that back it. Successful lookups are remembered on
 * this device so they can be re-run in one click.
 *
 * The network call is injectable (`loader`) so the component can be tested
 * without a running API; the default goes through {@link lookupReputation}.
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ReputationLookupError,
  lookupReputation,
  type ReputationLookupResult,
} from '@/lib/reputationLookup';
import {
  clearReputationHistory,
  readReputationHistory,
  recordReputationLookup,
  removeReputationLookup,
  type ReputationHistoryEntry,
} from '@/lib/reputationHistory';
import { normalizeAddress, validateAddress } from '@/lib/stellar/address';

/** Fetches the reputation summary for a canonical address. */
export type ReputationLookupLoader = (
  address: string,
  options: { signal: AbortSignal },
) => Promise<ReputationLookupResult>;

export interface ReputationLookupProps {
  /**
   * Overrides the data source. Defaults to {@link lookupReputation}, which
   * calls the configured reputation API.
   */
  loader?: ReputationLookupLoader;
  /** Pre-fills the input (e.g. the connected wallet address). */
  initialAddress?: string;
  /** Called after a successful lookup, for callers that want the data too. */
  onResult?: (result: ReputationLookupResult) => void;
  /** Heading level for the section title. Defaults to `h2`. */
  headingLevel?: 2 | 3;
}

type LookupStatus = 'idle' | 'loading' | 'success' | 'error';

function shortAddress(address: string): string {
  return address.length > 12
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ReputationLookupError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Could not complete the reputation lookup.';
}

export default function ReputationLookup({
  loader,
  initialAddress = '',
  onResult,
  headingLevel = 2,
}: ReputationLookupProps) {
  const inputId = useId();
  const errorId = useId();
  const resultHeadingId = useId();

  const [address, setAddress] = useState(initialAddress);
  const [status, setStatus] = useState<LookupStatus>('idle');
  const [result, setResult] = useState<ReputationLookupResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [recent, setRecent] = useState<ReputationHistoryEntry[]>([]);

  const requestRef = useRef<AbortController | null>(null);
  const Heading = headingLevel === 3 ? 'h3' : 'h2';

  useEffect(() => {
    setRecent(readReputationHistory());
    return () => {
      requestRef.current?.abort();
    };
  }, []);

  const defaultLoader = useCallback<ReputationLookupLoader>(
    (value, options) => lookupReputation(value, { signal: options.signal }),
    [],
  );

  const runLookup = useCallback(
    async (rawAddress: string) => {
      const normalized = normalizeAddress(rawAddress);

      if (!validateAddress(normalized)) {
        setFieldError(
          normalized
            ? 'That is not a valid Stellar account address.'
            : 'Enter a Stellar address to look up.',
        );
        setStatus('idle');
        setResult(null);
        setErrorMessage(null);
        return;
      }

      setFieldError(null);
      setErrorMessage(null);
      setResult(null);
      setStatus('loading');

      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;

      try {
        const next = await (loader ?? defaultLoader)(normalized, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        setResult(next);
        setStatus('success');
        setRecent(
          recordReputationLookup({
            address: next.address,
            score: next.score,
            level: next.level,
          }),
        );
        onResult?.(next);
      } catch (error) {
        if (controller.signal.aborted) return;
        setStatus('error');
        setErrorMessage(toErrorMessage(error));
      }
    },
    [defaultLoader, loader, onResult],
  );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runLookup(address);
  };

  const handleRemove = (value: string) => {
    setRecent(removeReputationLookup(value));
  };

  const handleClear = () => {
    clearReputationHistory();
    setRecent([]);
  };

  const resultHistory = useMemo(() => result?.history ?? [], [result]);

  return (
    <section
      aria-labelledby={`${inputId}-heading`}
      className="w-full max-w-5xl mx-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <Heading
        id={`${inputId}-heading`}
        className="text-xl font-semibold text-slate-900"
      >
        Look up a reputation
      </Heading>
      <p className="mt-1 text-sm text-slate-600">
        Enter a Stellar account address to view its verified reputation summary.
        Lookups never expose personal metadata.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
            Stellar address
          </label>
          <input
            id={inputId}
            name="address"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? errorId : undefined}
            placeholder="G…"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          {fieldError && (
            <p id={errorId} role="alert" className="mt-2 text-sm text-rose-700">
              {fieldError}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={status === 'loading'}
          className="h-[38px] shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'loading' ? 'Looking up…' : 'Look up'}
        </button>
      </form>

      <div role="status" aria-live="polite" className="mt-4 min-h-[1.25rem] text-sm text-slate-600">
        {status === 'loading' ? 'Looking up reputation…' : ''}
      </div>

      {status === 'error' && errorMessage && (
        <div role="alert" className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p className="font-semibold">Lookup failed</p>
          <p className="mt-1">{errorMessage}</p>
          <button
            type="button"
            onClick={() => void runLookup(address)}
            className="mt-3 rounded-xl border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
          >
            Try again
          </button>
        </div>
      )}

      {status === 'success' && result && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h3 id={resultHeadingId} className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Result
          </h3>
          <p className="mt-2 break-all font-mono text-sm text-slate-900">{result.address}</p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Score</dt>
              <dd className="mt-1 text-2xl font-semibold text-slate-900">
                <span
                  role="meter"
                  aria-valuenow={result.score}
                  aria-valuemin={0}
                  aria-valuemax={5}
                  aria-label={`Reputation score ${result.score} out of 5`}
                >
                  {result.score}
                </span>
                <span className="ml-1 text-sm font-normal text-slate-500">/ 5</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Level</dt>
              <dd className="mt-1 text-lg font-semibold text-slate-900">{result.level}</dd>
            </div>
          </dl>
          {result.lastUpdated && (
            <p className="mt-3 text-xs text-slate-500">
              Updated <time dateTime={result.lastUpdated}>{result.lastUpdated}</time>
            </p>
          )}

          <h4 className="mt-5 text-sm font-semibold text-slate-800">Verified events</h4>
          {resultHistory.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">
              No verified events are available for this address yet.
            </p>
          ) : (
            <ol aria-labelledby={resultHeadingId} className="mt-2 space-y-2">
              {resultHistory.map((event) => (
                <li key={event.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-sm font-semibold text-slate-900">{event.type}</p>
                  <p className="text-sm text-slate-700">{event.summary}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    <time dateTime={event.date}>{event.date}</time>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      <div className="mt-6 border-t border-slate-200 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-800">Recent lookups</h3>
          {recent.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              Clear recent lookups
            </button>
          )}
        </div>

        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            Addresses you look up are remembered on this device for quick access.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {recent.map((entry) => (
              <li key={entry.address} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddress(entry.address);
                    void runLookup(entry.address);
                  }}
                  title={entry.address}
                  className="font-mono text-sm text-blue-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                >
                  {shortAddress(entry.address)}
                </button>
                <span className="text-xs text-slate-500">
                  {entry.level} · {entry.score}/5
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(entry.address)}
                  aria-label={`Remove ${entry.address} from recent lookups`}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
