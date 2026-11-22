/**
 * Milestone CSV import.
 *
 * A CSV is only a transport format here: every row goes through the same
 * `validateMilestone` validator the creation form uses, so imported data can
 * never bypass a rule the UI enforces. Nothing is written to storage by this
 * module — it returns validated `Milestone` records for the caller to persist.
 *
 * ## Format
 *
 * ```
 * title,payout,currency,dueDate,status
 * Project kickoff,2500,USD,"Jun 1, 2026",Pending
 * ```
 *
 * `title`, `payout` and `currency` are required; `dueDate` and `status` are
 * optional. Header names are case-insensitive and may appear in any order.
 */

import type { Milestone } from '@/types/domain';
import { parseCsv, toCsv } from './csv';
import { validateMilestone } from './validateMilestone';

/** Maximum number of milestones accepted in a single import. */
export const MAX_MILESTONES = 100;

/** Canonical column order used by the downloadable template. */
export const MILESTONE_CSV_HEADERS = [
  'title',
  'payout',
  'currency',
  'dueDate',
  'status',
] as const;

const REQUIRED_HEADERS = ['title', 'payout', 'currency'] as const;

/** A ready-to-edit CSV template with one example row. */
export const MILESTONE_CSV_TEMPLATE = toCsv(
  [...MILESTONE_CSV_HEADERS],
  [['Project kickoff', '2500', 'USD', 'Jun 1, 2026', 'Pending']],
);

/** A problem found in the CSV, addressed to the 1-based line in the file. */
export type MilestoneCsvError = {
  /** 1-based row number as shown in a spreadsheet (header is row 1). */
  row: number;
  message: string;
};

export type MilestoneImportResult = {
  milestones: Milestone[];
  errors: MilestoneCsvError[];
};

export type ParseMilestoneCsvOptions = {
  /** Stamped onto every imported milestone. */
  contractId?: string;
  /** Prefix for generated ids; defaults to `ms-import`. */
  idPrefix?: string;
  /** Overrides {@link MAX_MILESTONES} (useful for tests). */
  maxMilestones?: number;
};

/** Stellar amounts carry 7 decimal places (1 XLM = 10 000 000 stroops). */
export const STROOPS_DECIMALS = 7;

/**
 * Converts a decimal amount to its smallest unit (stroops by default).
 *
 * Uses `bigint` so no precision is lost for large amounts. Rejects negative
 * values, exponent notation and more fractional digits than the currency
 * supports.
 *
 * @example toStroops('1.5') // 15000000n
 */
export function toStroops(
  amount: string | number,
  decimals: number = STROOPS_DECIMALS,
): bigint {
  const text = String(amount).trim();

  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new Error(`"${text}" is not a positive decimal amount.`);
  }

  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals) {
    throw new Error(
      `Amount has ${fraction.length} decimal places; at most ${decimals} are allowed.`,
    );
  }

  const scale = BigInt(10) ** BigInt(decimals);
  return BigInt(whole) * scale + BigInt(fraction.padEnd(decimals, '0') || '0');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'milestone';
}

/**
 * Parses and validates milestone CSV text.
 *
 * Returns every valid milestone plus per-row errors. If the header row is
 * missing required columns, no milestones are returned and a single row-1
 * error explains what is missing. Row-level problems do not discard the valid
 * rows — the caller decides whether to import a partial set.
 */
export function parseMilestoneCsv(
  text: string,
  options: ParseMilestoneCsvOptions = {},
): MilestoneImportResult {
  const maxMilestones = options.maxMilestones ?? MAX_MILESTONES;
  const idPrefix = options.idPrefix ?? 'ms-import';
  const errors: MilestoneCsvError[] = [];

  let rows: string[][];
  try {
    rows = parseCsv(text);
  } catch (error) {
    return {
      milestones: [],
      errors: [
        {
          row: 1,
          message: error instanceof Error ? error.message : 'CSV could not be parsed.',
        },
      ],
    };
  }

  // Drop trailing blank lines but keep interior ones so row numbers stay true.
  while (rows.length > 0 && rows[rows.length - 1].every((cell) => cell.trim() === '')) {
    rows.pop();
  }

  if (rows.length === 0) {
    return { milestones: [], errors: [{ row: 1, message: 'The CSV file is empty.' }] };
  }

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    return {
      milestones: [],
      errors: [
        {
          row: 1,
          message: `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`,
        },
      ],
    };
  }

  const dataRows = rows.slice(1);
  if (dataRows.length > maxMilestones) {
    return {
      milestones: [],
      errors: [
        {
          row: 1,
          message: `A single import can contain at most ${maxMilestones} milestones; this file has ${dataRows.length}.`,
        },
      ],
    };
  }

  const columnIndex = (name: string) => headers.indexOf(name.toLowerCase());
  const valueAt = (row: string[], name: string) => (row[columnIndex(name)] ?? '').trim();

  const milestones: Milestone[] = [];

  dataRows.forEach((row, index) => {
    const rowNumber = index + 2;

    if (row.every((cell) => cell.trim() === '')) {
      return;
    }

    const title = valueAt(row, 'title');
    const payout = valueAt(row, 'payout');
    const currency = valueAt(row, 'currency').toUpperCase();
    const dueDate = columnIndex('dueDate') === -1 ? '' : valueAt(row, 'dueDate');
    const status = columnIndex('status') === -1 ? '' : valueAt(row, 'status');

    const validationErrors = validateMilestone({
      title,
      payout,
      currency,
      dueDate: dueDate || undefined,
      status: status || undefined,
    });

    if (validationErrors.length > 0) {
      validationErrors.forEach((validationError) => {
        errors.push({ row: rowNumber, message: validationError.message });
      });
      return;
    }

    milestones.push({
      id: `${idPrefix}-${rowNumber - 1}-${slugify(title)}`,
      title,
      payout: Number(payout),
      currency,
      ...(dueDate ? { dueDate } : {}),
      status: (status || 'Pending') as Milestone['status'],
      ...(options.contractId ? { contractId: options.contractId } : {}),
    });
  });

  return { milestones, errors };
}
