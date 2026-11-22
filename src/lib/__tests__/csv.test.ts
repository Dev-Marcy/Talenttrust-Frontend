import { parseCsv, sanitizeCell, toCsv } from '../csv';

describe('parseCsv', () => {
  it('parses simple rows with a trailing newline', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles quoted fields, escaped quotes and embedded newlines', () => {
    const csv = 'title,notes\n"Kickoff, phase 1","He said ""go"""\n"Two\nlines",plain';

    expect(parseCsv(csv)).toEqual([
      ['title', 'notes'],
      ['Kickoff, phase 1', 'He said "go"'],
      ['Two\nlines', 'plain'],
    ]);
  });

  it('accepts CRLF and lone CR line endings and strips a BOM', () => {
    expect(parseCsv('\uFEFFa,b\r\n1,2\r3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('preserves interior blank lines and empty fields', () => {
    expect(parseCsv('a,,c\n\n1,2,3')).toEqual([
      ['a', '', 'c'],
      [''],
      ['1', '2', '3'],
    ]);
  });

  it('throws when a quoted field is left open', () => {
    expect(() => parseCsv('a,b\n"unterminated,2')).toThrow(
      'CSV input ended inside a quoted field.',
    );
  });
});

describe('sanitizeCell', () => {
  it('prefixes values a spreadsheet would treat as formulas', () => {
    expect(sanitizeCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(sanitizeCell('+1')).toBe("'+1");
    expect(sanitizeCell('-2')).toBe("'-2");
    expect(sanitizeCell('@cmd')).toBe("'@cmd");
    expect(sanitizeCell('\tindent')).toBe("'\tindent");
  });

  it('leaves ordinary text and empty values alone', () => {
    expect(sanitizeCell('Milestone')).toBe('Milestone');
    expect(sanitizeCell(null)).toBe('');
    expect(sanitizeCell(undefined)).toBe('');
    expect(sanitizeCell(0)).toBe('0');
  });
});

describe('toCsv', () => {
  it('quotes cells containing separators, quotes or newlines', () => {
    expect(
      toCsv(['title', 'notes'], [['Kickoff, phase 1', 'He said "go"'], ['Two\nlines', 'plain']]),
    ).toBe(
      'title,notes\n"Kickoff, phase 1","He said ""go"""\n"Two\nlines",plain',
    );
  });

  it('neutralises formula injection on write', () => {
    expect(toCsv(['title'], [['=cmd|calc']])).toBe("title\n'=cmd|calc");
  });
});
