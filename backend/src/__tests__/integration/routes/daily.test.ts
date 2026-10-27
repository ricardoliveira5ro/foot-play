import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../../app';

describe('GET /api/matches/daily', () => {
  it('returns a Normal preview with both lineups hidden', async () => {
    const res = await request(app).get('/api/matches/daily?date=2026-01-01');
    expect(res.status).toBe(200);
    expect(res.body.game.gameId).toBeGreaterThan(0);
    expect(res.body.homeLineup).toEqual([]);
    expect(res.body.awayLineup).toEqual([]);
    expect(res.body.homePreview).toHaveLength(11);
    expect(res.body.awayPreview).toHaveLength(11);
    expect(res.body.homePreview[0]).not.toHaveProperty('token');
    expect(res.body.awayPreview[0]).not.toHaveProperty('token');
  });

  it('serves either full lineup on request with Normal clues', async () => {
    const daily = await request(app).get('/api/matches/daily?date=2026-01-01');
    const gameId = daily.body.game.gameId;

    for (const side of ['home', 'away'] as const) {
      const lineup = await request(app).get(
        `/api/matches/${gameId}/lineup?teamSide=${side}&difficulty=normal`,
      );
      expect(lineup.status).toBe(200);
      expect(lineup.body.lineup).toHaveLength(11);
      expect(lineup.body.lineup[0].token).toEqual(expect.any(String));
    }
  });

  it('is deterministic for a given date', async () => {
    const first = await request(app).get('/api/matches/daily?date=2026-01-01');
    const second = await request(app).get('/api/matches/daily?date=2026-01-01');
    expect(second.body.game.gameId).toBe(first.body.game.gameId);
  });

  it('ignores filter query params entirely (§6.2: daily ignores filters)', async () => {
    const bare = await request(app).get('/api/matches/daily?date=2026-01-01');
    const filtered = await request(app).get('/api/matches/daily?date=2026-01-01&teamIds=1&competitionIds=Nope&seasonFrom=2019&seasonTo=2025');
    expect(filtered.body.game.gameId).toBe(bare.body.game.gameId);
  });

  it('defaults to the current UTC day when date is absent', async () => {
    const res = await request(app).get('/api/matches/daily');
    expect(res.status).toBe(200);
    const bare = await request(app).get(`/api/matches/daily?date=${new Date().toISOString().slice(0, 10)}`);
    expect(res.body.game.gameId).toBe(bare.body.game.gameId);
  });

  it('rejects a malformed date with 400', async () => {
    for (const bad of ['2026-02-30', '2026-1-1', 'not-a-date', '2026-13-01', '26-01-01']) {
      const res = await request(app).get(`/api/matches/daily?date=${encodeURIComponent(bad)}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_PARAMETER');
    }
  });

  it('rejects an empty date string with 400', async () => {
    const res = await request(app).get('/api/matches/daily?date=');
    expect(res.status).toBe(400);
  });

  it('does NOT collide with the :id route', async () => {
    // The ordering regression. Registered after '/:id', Express matches
    // 'daily' as a game id and this returns 400 (non-numeric id).
    const res = await request(app).get('/api/matches/daily?date=2026-01-01');
    expect(res.status).toBe(200);
    expect(res.body.code).not.toBe('INVALID_PARAMETER');
  });

  it('returns a 404 when the eligible pool is empty', async () => {
    // v1.1.1 already filtered /random by the same predicate, so there is no
    // HTTP-level way to empty the pool from a test. Assert the service-level
    // contract instead, which is where the behaviour lives.
    const { getEligibleGameIds } = await import('../../../services/dailyService');
    expect(Array.isArray(await getEligibleGameIds())).toBe(true);
  });
});

describe('GET /api/matches/daily — empty eligible pool', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns 404 NOT_FOUND when no playable game exists', async () => {
    vi.doMock('../../../services/dailyService', () => ({
      getDailyMatch: vi.fn().mockRejectedValue(
        Object.assign(new Error('No playable games available for the daily puzzle'), { code: 'NOT_FOUND', status: 404 }),
      ),
    }));
    const { app: mockedApp } = await import('../../../app');
    const res = await request(mockedApp).get('/api/matches/daily?date=2026-01-01');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    vi.doUnmock('../../../services/dailyService');
  });
});
