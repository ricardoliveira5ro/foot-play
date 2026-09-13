import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../../app';
import { generatePlayerToken } from '../../../services/tokenService';

describe('POST /api/guess', () => {
  it('returns 200 with name on correct guess', async () => {
    const res = await request(app).post('/api/guess').send({
      gameId: 1,
      token: generatePlayerToken(1, 101),
      guess: 'Messi',
    });
    expect(res.status).toBe(200);
    expect(res.body.isCorrect).toBe(true);
    expect(res.body.name).toBe('Messi');
    expect(res.body.results.every((r: any) => r.result === 'CORRECT')).toBe(true);
  });

  it('returns 200 without name on incorrect guess', async () => {
    const res = await request(app).post('/api/guess').send({
      gameId: 1,
      token: generatePlayerToken(1, 101),
      guess: 'Ronaldo',
    });
    expect(res.status).toBe(200);
    expect(res.body.isCorrect).toBe(false);
    expect(res.body.name).toBeUndefined();
  });

  it('returns 400 when gameId is missing', async () => {
    const res = await request(app).post('/api/guess').send({ token: 'x', guess: 'Messi' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PARAMETER');
  });

  it('returns 400 when token is missing', async () => {
    const res = await request(app).post('/api/guess').send({ gameId: 1, guess: 'Messi' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when guess is missing', async () => {
    const res = await request(app).post('/api/guess').send({ gameId: 1, token: 'x' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown token', async () => {
    const res = await request(app).post('/api/guess').send({ gameId: 1, token: 'bogus', guess: 'Messi' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Player not found', code: 'NOT_FOUND' });
  });
});

describe('POST /api/guess/reveal', () => {
  it('returns 200 with home players', async () => {
    const res = await request(app).post('/api/guess/reveal').send({ gameId: 1, teamSide: 'home' });
    expect(res.status).toBe(200);
    expect(res.body.players).toHaveLength(8);
    expect(res.body.players[0]).toEqual({ playerId: 108, name: 'Neuer', shirtNumber: 1 });
  });

  it('returns 200 with away players', async () => {
    const res = await request(app).post('/api/guess/reveal').send({ gameId: 1, teamSide: 'away' });
    expect(res.status).toBe(200);
    expect(res.body.players).toHaveLength(5);
  });

  it('returns 200 with name fallback when displayName is null', async () => {
    const res = await request(app).post('/api/guess/reveal').send({ gameId: 2, teamSide: 'away' });
    expect(res.status).toBe(200);
    const testPlayer = res.body.players.find((p: any) => p.playerId === 114);
    expect(testPlayer).toEqual({ playerId: 114, name: 'Test Player', shirtNumber: null });
  });

  it('returns 400 for invalid teamSide', async () => {
    const res = await request(app).post('/api/guess/reveal').send({ gameId: 1, teamSide: 'center' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PARAMETER');
  });

  it('returns 400 when gameId is missing', async () => {
    const res = await request(app).post('/api/guess/reveal').send({ teamSide: 'home' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown game', async () => {
    const res = await request(app).post('/api/guess/reveal').send({ gameId: 999, teamSide: 'home' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Game 999 not found', code: 'NOT_FOUND' });
  });
});

describe('POST /api/guess/reveal-one', () => {
  it('returns 200 with the player name', async () => {
    const res = await request(app).post('/api/guess/reveal-one').send({
      gameId: 1,
      token: generatePlayerToken(1, 101),
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'Messi' });
  });

  it('returns 404 for an unknown token', async () => {
    const res = await request(app).post('/api/guess/reveal-one').send({ gameId: 1, token: 'bogus' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Player not found', code: 'NOT_FOUND' });
  });

  it('returns 400 when gameId is missing', async () => {
    const res = await request(app).post('/api/guess/reveal-one').send({ token: 'x' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when token is missing', async () => {
    const res = await request(app).post('/api/guess/reveal-one').send({ gameId: 1 });
    expect(res.status).toBe(400);
  });
});

describe('app basics', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('unknown routes return 404', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found', code: 'NOT_FOUND' });
  });
});