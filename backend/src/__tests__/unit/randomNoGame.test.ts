import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../services/matchService', () => ({
  getRandomMatch: vi.fn().mockResolvedValue(null),
  buildMatchResponse: vi.fn(),
  getMatchById: vi.fn(),
  getPlayerNameForAppearance: vi.fn(),
  getRevealAppearances: vi.fn(),
  hasCompleteLineups: vi.fn(),
}));

import { app } from '../../app';

describe('GET /api/matches/random when the service resolves no match', () => {
  it('returns 404 with the route-level message', async () => {
    const res = await request(app).get('/api/matches/random?teamIds=999');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'No matches available', code: 'NOT_FOUND' });
  });
});
