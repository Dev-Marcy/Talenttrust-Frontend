import {
  MAX_MILESTONES,
  MILESTONE_CSV_TEMPLATE,
  parseMilestoneCsv,
  toStroops,
} from '../milestoneImport';

describe('toStroops', () => {
  it('converts decimals to stroops without precision loss', () => {
    expect(toStroops('1.5')).toBe(15_000_000n);
    expect(toStroops('0.0000001')).toBe(1n);
    expect(toStroops(2500)).toBe(25_000_000_000n);
    expect(toStroops('9007199254740993')).toBe(90_071_992_547_409_930_000_000n);
  });

  it('rejects too many decimals, negatives and exponent notation', () => {
    expect(() => toStroops('1.12345678')).toThrow('at most 7 are allowed');
    expect(() => toStroops('-1')).toThrow('not a positive decimal amount');
    expect(() => toStroops('1e6')).toThrow('not a positive decimal amount');
  });

  it('honours a custom precision', () => {
    expect(toStroops('12.34', 2)).toBe(1234n);
  });
});

describe('parseMilestoneCsv', () => {
  it('parses the shipped template', () => {
    const { milestones, errors } = parseMilestoneCsv(MILESTONE_CSV_TEMPLATE);

    expect(errors).toEqual([]);
    expect(milestones).toEqual([
      {
        id: 'ms-import-1-project-kickoff',
        title: 'Project kickoff',
        payout: 2500,
        currency: 'USD',
        dueDate: 'Jun 1, 2026',
        status: 'Pending',
      },
    ]);
  });

  it('accepts reordered and differently-cased headers and optional columns', () => {
    const csv = 'Currency,TITLE,Payout\nxlm,Design handoff,1200.50';

    const { milestones, errors } = parseMilestoneCsv(csv);

    expect(errors).toEqual([]);
    expect(milestones[0]).toMatchObject({
      title: 'Design handoff',
      payout: 1200.5,
      currency: 'XLM',
      status: 'Pending',
    });
    expect(milestones[0].dueDate).toBeUndefined();
  });

  it('stamps the contract id when provided', () => {
    const { milestones } = parseMilestoneCsv(MILESTONE_CSV_TEMPLATE, {
      contractId: 'contract-7',
    });

    expect(milestones[0].contractId).toBe('contract-7');
  });

  it('reports missing headers once instead of per row', () => {
    const { milestones, errors } = parseMilestoneCsv('title,currency\nKickoff,USD');

    expect(milestones).toEqual([]);
    expect(errors).toEqual([{ row: 1, message: 'Missing required column: payout.' }]);
  });

  it('reports row-level validation errors with spreadsheet row numbers', () => {
    const csv = [
      'title,payout,currency,dueDate,status',
      'Good row,100,USD,"Jun 1, 2026",Pending',
      ',100,USD,,Pending',
      'Bad status,100,USD,,Nope',
      'Bad date,100,USD,yesterday,',
    ].join('\n');

    const { milestones, errors } = parseMilestoneCsv(csv);

    expect(milestones).toHaveLength(1);
    expect(errors).toEqual([
      { row: 3, message: 'Title is required' },
      { row: 4, message: 'Status must be one of: Pending, Active, Completed, Paid, Disputed' },
      { row: 5, message: 'Due date must be in the format "Jun 1, 2025"' },
    ]);
  });

  it('applies the shared 2-decimal payout rule to XLM rows too', () => {
    const { milestones, errors } = parseMilestoneCsv(
      'title,payout,currency\nToo precise,1.12345678,XLM',
    );

    expect(milestones).toEqual([]);
    expect(errors[0]).toMatchObject({ row: 2 });
    expect(errors[0].message).toBe('Payout must have at most 2 decimal places');
  });

  it(`rejects files with more than ${MAX_MILESTONES} rows`, () => {
    const rows = Array.from(
      { length: MAX_MILESTONES + 1 },
      (_, index) => `Milestone ${index},100,USD`,
    );
    const csv = ['title,payout,currency', ...rows].join('\n');

    const { milestones, errors } = parseMilestoneCsv(csv);

    expect(milestones).toEqual([]);
    expect(errors[0].message).toContain(`at most ${MAX_MILESTONES}`);
  });

  it('honours a custom row ceiling', () => {
    const csv = 'title,payout,currency\nOne,1,USD\nTwo,2,USD';

    expect(parseMilestoneCsv(csv, { maxMilestones: 1 }).errors[0].message).toContain('at most 1');
  });

  it('skips blank rows and reports an empty file', () => {
    expect(parseMilestoneCsv('title,payout,currency\n\n\n').milestones).toEqual([]);
    expect(parseMilestoneCsv('   ').errors).toEqual([{ row: 1, message: 'The CSV file is empty.' }]);
  });

  it('generates unique ids for duplicate titles', () => {
    const { milestones } = parseMilestoneCsv(
      'title,payout,currency\nSame,1,USD\nSame,2,USD',
    );

    expect(milestones.map((milestone) => milestone.id)).toEqual([
      'ms-import-1-same',
      'ms-import-2-same',
    ]);
  });
});
