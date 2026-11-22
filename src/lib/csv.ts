/**
 * CSV parsing and serialisation.
 *
 * Two concerns are kept together because both sides of the feature must agree:
 *
 * - **Parsing** follows RFC 4180: quoted fields, `""` escapes, embedded
 *   newlines and CRLF line endings. A UTF-8 BOM is stripped.
 * - **Writing** guards against spreadsheet formula injection: a cell that
 *   begins with `=`, `+`, `-`, `@`, a tab or a carriage return is prefixed with
 *   a single quote so Excel/Sheets store it as text.
 */

/** Leading characters that spreadsheet apps treat as a formula. */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'] as const;

/**
 * Neutralises spreadsheet formula injection in a single cell.
 *
 * Non-string values are stringified first; `null`/`undefined` become `''`.
 */
export function sanitizeCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (!text) return '';
  return FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))
    ? `'${text}`
    : text;
}

function quoteCell(value: unknown): string {
  const text = sanitizeCell(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Serialises a header row plus data rows to CSV.
 *
 * @param headers - Column names, written first.
 * @param rows - Data rows; each cell is sanitised and quoted as needed.
 * @param lineEnding - Defaults to `\n` so output is diff-friendly.
 */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
  lineEnding = '\n',
): string {
  const lines = [headers.map(quoteCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(quoteCell).join(','));
  }
  return lines.join(lineEnding);
}

/**
 * Parses CSV text into a matrix of strings.
 *
 * - Accepts `\n`, `\r\n` and lone `\r` line endings.
 * - Quoted fields may contain commas, quotes (`""`) and newlines.
 * - A trailing newline does not produce an empty trailing row; other blank
 *   lines are preserved so row numbering stays faithful to the input.
 *
 * @throws {Error} when a quoted field is never closed.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    throw new Error('CSV input ended inside a quoted field.');
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
