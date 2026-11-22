import { resetCache } from '../safeStorage';
import {
  MAX_REPUTATION_HISTORY,
  REPUTATION_HISTORY_KEY,
  clearReputationHistory,
  readReputationHistory,
  recordReputationLookup,
  removeReputationLookup,
} from '../reputationHistory';

const ADDRESS_A = 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H';
const ADDRESS_B = 'GABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQHGPC';
const INVALID_ADDRESS = 'GNOTAREALADDRESS';

describe('reputationHistory', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetCache();
  });

  it('starts empty', () => {
    expect(readReputationHistory()).toEqual([]);
  });

  it('records a lookup and returns it newest first', () => {
    expect(
      recordReputationLookup({
        address: ADDRESS_A,
        score: 4.5,
        level: 'Expert',
        lookedUpAt: '2026-11-01T10:00:00.000Z',
      }),
    ).toEqual([
      { address: ADDRESS_A, score: 4.5, level: 'Expert', lookedUpAt: '2026-11-01T10:00:00.000Z' },
    ]);

    const entries = recordReputationLookup({
      address: ADDRESS_B,
      score: 2,
      level: 'Active Contributor',
      lookedUpAt: '2026-11-02T10:00:00.000Z',
    });

    expect(entries.map((entry) => entry.address)).toEqual([ADDRESS_B, ADDRESS_A]);
    expect(readReputationHistory()).toEqual(entries);
  });

  it('normalises addresses and de-duplicates by address', () => {
    recordReputationLookup({ address: ADDRESS_A, score: 1, level: 'Newcomer' });
    const entries = recordReputationLookup({
      address: `  ${ADDRESS_A.toLowerCase()}  `,
      score: 3,
      level: 'Trusted Partner',
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ address: ADDRESS_A, score: 3 });
  });

  it('caps the stored list at MAX_REPUTATION_HISTORY', () => {
    const entries = Array.from({ length: MAX_REPUTATION_HISTORY + 4 }, (_, index) => ({
      address: ADDRESS_A,
      score: index,
      level: 'Level',
      lookedUpAt: `2026-11-01T10:00:0${index}.000Z`,
    }));
    window.localStorage.setItem(REPUTATION_HISTORY_KEY, JSON.stringify(entries));

    expect(readReputationHistory()).toHaveLength(MAX_REPUTATION_HISTORY);
  });

  it('ignores corrupt JSON instead of throwing', () => {
    window.localStorage.setItem(REPUTATION_HISTORY_KEY, '{not-json');
    expect(readReputationHistory()).toEqual([]);
  });

  it('drops invalid stored entries but keeps valid ones', () => {
    window.localStorage.setItem(
      REPUTATION_HISTORY_KEY,
      JSON.stringify([
        { address: ADDRESS_A, score: 4, level: 'Expert', lookedUpAt: '2026-11-01T10:00:00.000Z' },
        { address: INVALID_ADDRESS, score: 4, level: 'Expert', lookedUpAt: '2026-11-01T10:00:00.000Z' },
        { address: ADDRESS_B, score: 'high', level: 'Expert', lookedUpAt: '2026-11-01T10:00:00.000Z' },
        { address: ADDRESS_B, score: 2, level: 'Contributor', lookedUpAt: 'not-a-date' },
      ]),
    );

    expect(readReputationHistory()).toEqual([
      { address: ADDRESS_A, score: 4, level: 'Expert', lookedUpAt: '2026-11-01T10:00:00.000Z' },
    ]);
  });

  it('ignores recording an invalid address', () => {
    expect(recordReputationLookup({ address: INVALID_ADDRESS, score: 1, level: 'X' })).toEqual([]);
  });

  it('removes a single entry and clears the list', () => {
    recordReputationLookup({ address: ADDRESS_A, score: 1, level: 'Newcomer' });
    recordReputationLookup({ address: ADDRESS_B, score: 2, level: 'Contributor' });

    expect(removeReputationLookup(ADDRESS_A).map((entry) => entry.address)).toEqual([ADDRESS_B]);

    clearReputationHistory();
    expect(readReputationHistory()).toEqual([]);
  });
});
