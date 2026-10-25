import { describe, it, expect, vi, afterEach } from 'vitest';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; vi.resetModules(); vi.unstubAllEnvs(); });

describe('fetchDailyMatch — real branch', () => {
  it('requests /api/matches/daily with the date and returns the GameResponse', async () => {
    vi.stubEnv('NEXT_PUBLIC_USE_MOCK_API', '');
    vi.resetModules();
    const { fetchDailyMatch } = await import('@/lib/api');
    const payload = { game: { gameId: 42 }, homeLineup: [], awayLineup: [] };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchDailyMatch('2026-01-01')).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/matches/daily?date=2026-01-01'));
  });

  it('sends only the date — no filter params can narrow a daily (§6.2)', async () => {
    vi.stubEnv('NEXT_PUBLIC_USE_MOCK_API', '');
    vi.resetModules();
    const { fetchDailyMatch } = await import('@/lib/api');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ game: { gameId: 1 }, homeLineup: [], awayLineup: [] }) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await fetchDailyMatch('2026-03-01');
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('date=2026-03-01');
    expect(url).not.toContain('teamIds');
    expect(url).not.toContain('competitionIds');
    expect(url).not.toContain('seasonFrom');
  });

  it('throws a named error on 404 so the page can distinguish it', async () => {
    vi.stubEnv('NEXT_PUBLIC_USE_MOCK_API', '');
    vi.resetModules();
    const { fetchDailyMatch } = await import('@/lib/api');
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }) as unknown as typeof fetch;
    await expect(fetchDailyMatch('2026-01-01')).rejects.toThrow(/404/);
  });

  it('throws on a 400 for a malformed date rather than returning a wrong puzzle', async () => {
    vi.stubEnv('NEXT_PUBLIC_USE_MOCK_API', '');
    vi.resetModules();
    const { fetchDailyMatch } = await import('@/lib/api');
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, statusText: 'Bad Request' }) as unknown as typeof fetch;
    await expect(fetchDailyMatch('nonsense' as never)).rejects.toThrow(/400/);
  });
});

describe('fetchDailyMatch — mock branch', () => {
  it('is deterministic for the same day', async () => {
    vi.stubEnv('NEXT_PUBLIC_USE_MOCK_API', 'true');
    vi.resetModules();
    const { fetchDailyMatch } = await import('@/lib/api');
    const first = await fetchDailyMatch('2026-01-01');
    const second = await fetchDailyMatch('2026-01-01');
    expect(second.game.gameId).toBe(first.game.gameId);
  });

  it('returns a mock match that exists in MOCK_MATCHES', async () => {
    vi.stubEnv('NEXT_PUBLIC_USE_MOCK_API', 'true');
    vi.resetModules();
    const { fetchDailyMatch } = await import('@/lib/api');
    const { default: MOCK_MATCHES } = await import('@/lib/mockData');
    const res = await fetchDailyMatch('2026-03-01');
    expect(MOCK_MATCHES.some((m) => m.game.gameId === res.game.gameId)).toBe(true);
  });
});
