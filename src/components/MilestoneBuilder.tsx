'use client';

/**
 * Bulk milestone builder: paste or upload a CSV, review the parsed rows, then
 * import them. Parsing and validation live in `@/lib/milestoneImport` so the
 * same rules apply regardless of where the CSV came from.
 *
 * Nothing is persisted here — `onImport` receives validated milestones and the
 * caller decides how to save them.
 */

import React, { useMemo, useRef, useState } from 'react';
import type { Milestone } from '@/types/domain';
import {
  MAX_MILESTONES,
  MILESTONE_CSV_TEMPLATE,
  parseMilestoneCsv,
  type MilestoneImportResult,
} from '@/lib/milestoneImport';

export interface MilestoneBuilderProps {
  /** Receives the validated milestones to persist. */
  onImport: (milestones: Milestone[]) => void;
  /** Stamped onto every imported milestone. */
  contractId?: string;
  /** Overrides the per-import row ceiling. */
  maxMilestones?: number;
  /** Id prefix for generated milestones (tests use a fixed value). */
  idPrefix?: string;
}

const PREVIEW_ROWS = 5;

export default function MilestoneBuilder({
  onImport,
  contractId,
  maxMilestones = MAX_MILESTONES,
  idPrefix,
}: MilestoneBuilderProps) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<MilestoneImportResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const hasErrors = (result?.errors.length ?? 0) > 0;
  const importable = result?.milestones ?? [];
  const canImport = importable.length > 0 && !hasErrors;

  const previewRows = useMemo(() => importable.slice(0, PREVIEW_ROWS), [importable]);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const contents = await file.text();
      setText(contents);
      setFileName(file.name);
      setResult(null);
      setNotice(null);
    } catch {
      setNotice('That file could not be read. Try pasting the CSV instead.');
    }
  };

  const handlePreview = () => {
    setNotice(null);
    setResult(parseMilestoneCsv(text, { contractId, maxMilestones, idPrefix }));
  };

  const handleImport = () => {
    if (!canImport) return;
    onImport(importable);
    setNotice(
      `Imported ${importable.length} milestone${importable.length === 1 ? '' : 's'}.`,
    );
    setText('');
    setFileName(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([MILESTONE_CSV_TEMPLATE], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'milestones-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      aria-labelledby="milestone-builder-heading"
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="milestone-builder-heading" className="text-lg font-semibold text-slate-900">
            Import milestones from CSV
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Columns: <code className="font-mono text-xs">title, payout, currency, dueDate, status</code>.
            Up to {maxMilestones} rows per import.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          Download template
        </button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="milestone-csv-file" className="block text-sm font-medium text-slate-700">
            Upload CSV file
          </label>
          <input
            ref={fileInputRef}
            id="milestone-csv-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void handleFile(event)}
            className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold"
          />
          {fileName && <p className="mt-1 text-xs text-slate-500">{fileName}</p>}
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="milestone-csv-text" className="block text-sm font-medium text-slate-700">
          Or paste CSV
        </label>
        <textarea
          id="milestone-csv-text"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setResult(null);
            setNotice(null);
          }}
          rows={6}
          spellCheck={false}
          placeholder={MILESTONE_CSV_TEMPLATE}
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handlePreview}
          disabled={!text.trim()}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          Preview import
        </button>
        <button
          type="button"
          onClick={handleImport}
          disabled={!canImport}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          {importable.length > 0
            ? `Import ${importable.length} milestone${importable.length === 1 ? '' : 's'}`
            : 'Import milestones'}
        </button>
        {result && (
          <p className="text-sm text-slate-600">
            {importable.length} ready
            {hasErrors ? `, ${result.errors.length} problem${result.errors.length === 1 ? '' : 's'}` : ''}
          </p>
        )}
      </div>

      <div role="status" aria-live="polite" className="mt-3 text-sm text-slate-700">
        {notice}
      </div>

      {result && hasErrors && (
        <div role="alert" className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p className="font-semibold">Fix these rows before importing</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {result.errors.slice(0, 20).map((error, index) => (
              <li key={`${error.row}-${index}`}>
                Row {error.row}: {error.message}
              </li>
            ))}
          </ul>
          {result.errors.length > 20 && (
            <p className="mt-2">…and {result.errors.length - 20} more.</p>
          )}
          <p className="mt-2 text-xs">
            Rows are numbered as they appear in a spreadsheet, with the header on
            row 1.
          </p>
        </div>
      )}

      {result && importable.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">
              Parsed milestones, first {Math.min(PREVIEW_ROWS, importable.length)} shown
            </caption>
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="py-2 pr-4">Title</th>
                <th scope="col" className="py-2 pr-4">Payout</th>
                <th scope="col" className="py-2 pr-4">Currency</th>
                <th scope="col" className="py-2 pr-4">Due date</th>
                <th scope="col" className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((milestone) => (
                <tr key={milestone.id} className="border-b border-slate-100 text-slate-800">
                  <td className="py-2 pr-4">{milestone.title}</td>
                  <td className="py-2 pr-4">{milestone.payout}</td>
                  <td className="py-2 pr-4">{milestone.currency}</td>
                  <td className="py-2 pr-4">{milestone.dueDate ?? '—'}</td>
                  <td className="py-2">{milestone.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {importable.length > PREVIEW_ROWS && (
            <p className="mt-2 text-xs text-slate-500">
              …and {importable.length - PREVIEW_ROWS} more.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
