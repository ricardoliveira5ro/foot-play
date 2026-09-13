import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../../app';
import { prisma } from '../../../prisma';
import { seed } from '../../setup/seed';

describe('GET /api/matches/random', () => {
  it('returns 200 with a full match response', async () => {
    const res = await request(app).get('/api/matches/random');
    expect(res.status).toBe(200);
    expect(res.body.game.gameId).toBeGreaterThan(0);
    expect(Array.isArray(res.body.homeLineup)).toBe(true);
    expect(Array.isArray(res.body.awayLineup)).toBe(true);
  });

  it('returns 404 when no matches exist', async () => {
    await prisma.appearance.deleteMany();
    await prisma.game.deleteMany();
    const res = await request(app).get('/api/matches/random');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'No matches available', code: 'NOT_FOUND' });
    await seed();
  });
});

describe('GET /api/matches/:id', () => {
  it('returns 200 for a valid id', async () => {
    const res = await request(app).get('/api/matches/1');
    expect(res.status).toBe(200);
    expect(res.body.game.gameId).toBe(1);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get('/api/matches/999');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Match not found', code: 'NOT_FOUND' });
  });

  it('returns 400 for non-numeric id', async () => {
    const res = await request(app).get('/api/matches/abc');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PARAMETER');
  });

  it('returns 400 for negative id', async () => {
    const res = await request(app).get('/api/matches/-1');
    expect(res.status).toBe(400);
  });

  it('returns 400 for fractional id', async () => {
    const res = await request(app).get('/api/matches/1.5');
    expect(res.status).toBe(400);
  });
});