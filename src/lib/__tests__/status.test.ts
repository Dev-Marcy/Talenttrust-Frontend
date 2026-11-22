import {
  checkContractHealth,
  fetchWithTimeout,
  StatusTimeoutError,
} from '../status';

function jsonResponse(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => payload,
  } as unknown as Response;
}

function neverResolvingFetch(): typeof fetch {
  return jest.fn(
    (_url: string, init?: Parameters<typeof fetch>[1]) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      }),
  ) as unknown as typeof fetch;
}

describe('fetchWithTimeout', () => {
  it('passes a signal through and resolves the response', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({})) as unknown as typeof fetch;

    const response = await fetchWithTimeout('/api/status/contract', {}, { fetchImpl });

    expect(response.ok).toBe(true);
    const init = (fetchImpl as unknown as jest.Mock).mock.calls[0][1] as Parameters<
      typeof fetch
    >[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('throws StatusTimeoutError when the deadline elapses', async () => {
    await expect(
      fetchWithTimeout('/slow', {}, { timeoutMs: 10, fetchImpl: neverResolvingFetch() }),
    ).rejects.toBeInstanceOf(StatusTimeoutError);
  });

  it('propagates a caller abort instead of reporting a timeout', async () => {
    const controller = new AbortController();
    const promise = fetchWithTimeout(
      '/slow',
      {},
      { timeoutMs: 10_000, signal: controller.signal, fetchImpl: neverResolvingFetch() },
    );

    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('checkContractHealth', () => {
  it('reports operational when the contract is deployed', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({
        status: {
          contractId: 'CABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAFNSZ',
          deployed: true,
          latestLedger: 1234,
          lastModifiedLedger: 1200,
          liveUntilLedger: 5000,
          checkedAt: '2026-11-22T09:00:00.000Z',
        },
      }),
    ) as unknown as typeof fetch;

    const health = await checkContractHealth({ fetchImpl });

    expect(health).toMatchObject({
      state: 'operational',
      deployed: true,
      latestLedger: 1234,
      lastModifiedLedger: 1200,
      liveUntilLedger: 5000,
      checkedAt: '2026-11-22T09:00:00.000Z',
    });
    expect(health.message).toBeUndefined();
  });

  it('reports degraded when the contract is not deployed', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({
        status: {
          contractId: 'CABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAFNSZ',
          deployed: false,
          latestLedger: 20,
          lastModifiedLedger: null,
          liveUntilLedger: null,
          checkedAt: '2026-11-22T09:00:00.000Z',
        },
      }),
    ) as unknown as typeof fetch;

    const health = await checkContractHealth({ fetchImpl });

    expect(health).toMatchObject({ state: 'degraded', deployed: false });
    expect(health.message).toContain('was not found');
  });

  it('surfaces the endpoint error message on a non-ok response', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ error: 'Contract status is not configured.' }, { ok: false, status: 503 }),
    ) as unknown as typeof fetch;

    const health = await checkContractHealth({ fetchImpl });

    expect(health).toMatchObject({ state: 'degraded', deployed: null });
    expect(health.message).toBe('Contract status is not configured.');
  });

  it('reports unavailable for a malformed payload', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ nope: true })) as unknown as typeof fetch;

    const health = await checkContractHealth({ fetchImpl });

    expect(health).toMatchObject({ state: 'unavailable', deployed: null });
    expect(health.message).toContain('unexpected response');
  });

  it('reports unavailable when the endpoint cannot be reached', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    const health = await checkContractHealth({ fetchImpl });

    expect(health).toMatchObject({ state: 'unavailable', deployed: null });
    expect(health.message).toBe('Could not reach the status endpoint.');
  });

  it('reports unavailable when the check times out', async () => {
    const health = await checkContractHealth({
      timeoutMs: 10,
      fetchImpl: neverResolvingFetch(),
    });

    expect(health.state).toBe('unavailable');
    expect(health.message).toBe('The status check timed out.');
  });
});
