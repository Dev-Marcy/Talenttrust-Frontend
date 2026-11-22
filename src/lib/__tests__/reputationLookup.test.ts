import { lookupReputation, parseReputationLookup, ReputationLookupError } from '../reputationLookup';

const ADDRESS = 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H';

function response(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

function expectLookupError(error: unknown, kind: string) {
  expect(error).toBeInstanceOf(ReputationLookupError);
  expect((error as ReputationLookupError).kind).toBe(kind);
}

describe('parseReputationLookup', () => {
  it('returns a normalised result', () => {
    expect(
      parseReputationLookup(
        {
          score: 4.5,
          level: '  Expert ',
          lastUpdated: '2026-11-20T09:30:00Z',
          history: [
            { id: 'evt-1', type: 'Contract', summary: 'Completed 3 milestones', date: '2026-11-01' },
          ],
        },
        ADDRESS,
      ),
    ).toEqual({
      address: ADDRESS,
      score: 4.5,
      level: 'Expert',
      history: [
        { id: 'evt-1', type: 'Contract', summary: 'Completed 3 milestones', date: '2026-11-01' },
      ],
      lastUpdated: '2026-11-20T09:30:00Z',
    });
  });

  it('drops malformed history entries and invalid timestamps', () => {
    const result = parseReputationLookup(
      {
        score: 1,
        history: [
          { id: 'keep', type: 'Contract', summary: 'Paid out', date: '2026-11-01' },
          { id: '', type: 'Contract', summary: 'Paid out', date: '2026-11-01' },
          { id: 'bad-date', type: 'Contract', summary: 'Paid out', date: 'yesterday' },
          'not-an-object',
        ],
        lastUpdated: 'soon',
      },
      ADDRESS,
    );

    expect(result.history).toHaveLength(1);
    expect(result.level).toBe('Unrated');
    expect(result.lastUpdated).toBeUndefined();
  });

  it('clamps scores above the 0–5 scale', () => {
    expect(parseReputationLookup({ score: 9 }, ADDRESS).score).toBe(5);
  });

  it('rejects a payload without a numeric score', () => {
    try {
      parseReputationLookup({ score: '4.5' }, ADDRESS);
      throw new Error('expected parseReputationLookup to throw');
    } catch (error) {
      expectLookupError(error, 'invalid-response');
    }
  });
});

describe('lookupReputation', () => {
  it('rejects an invalid address without calling the network', async () => {
    const fetchImpl = jest.fn();

    await expect(
      lookupReputation('not-an-address', { baseUrl: 'https://api.example.test', fetchImpl }),
    ).rejects.toMatchObject({ kind: 'invalid-address' });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails fast with unconfigured when no API origin is set', async () => {
    await expect(
      lookupReputation(ADDRESS, { baseUrl: '', fetchImpl: jest.fn() }),
    ).rejects.toMatchObject({ kind: 'unconfigured' });
  });

  it('requests the documented lookup endpoint and parses the response', async () => {
    const fetchImpl = jest.fn(async () =>
      response({
        score: 3,
        level: 'Trusted Partner',
        history: [{ id: 'evt-1', type: 'Contract', summary: 'Milestone paid', date: '2026-10-01' }],
      }),
    );

    const result = await lookupReputation(`${ADDRESS.toLowerCase()} `, {
      baseUrl: 'https://api.example.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe(
      `https://api.example.test/api/reputation/lookup?address=${encodeURIComponent(ADDRESS)}`,
    );
    expect(result).toMatchObject({ address: ADDRESS, score: 3, level: 'Trusted Partner' });
  });

  it('maps HTTP failures to a service error', async () => {
    const fetchImpl = jest.fn(async () =>
      response({ error: 'indexer unavailable' }, { ok: false, status: 500 }),
    );

    try {
      await lookupReputation(ADDRESS, {
        baseUrl: 'https://api.example.test',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      throw new Error('expected lookupReputation to throw');
    } catch (error) {
      expectLookupError(error, 'service');
      expect((error as Error).message).toBe('indexer unavailable');
    }
  });

  it('maps a 404 to a friendly "not found" message', async () => {
    const fetchImpl = jest.fn(async () => response({}, { ok: false, status: 404 }));

    await expect(
      lookupReputation(ADDRESS, {
        baseUrl: 'https://api.example.test',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      kind: 'service',
      message: 'No reputation found for this address.',
    });
  });

  it('maps network failures to a network error', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(
      lookupReputation(ADDRESS, {
        baseUrl: 'https://api.example.test',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ kind: 'network' });
  });
});
