import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../../app';

describe('GET /api/matches/filter-options', () => {
  it('returns options and counts for the unfiltered request', async () => {
    const response = await request(app).get('/api/matches/filter-options');

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(['competitions', 'opponents', 'seasons', 'teams', 'total']);
    expect(response.body.total).toBe(1);
    expect(response.body.teams.find((option: { id: number }) => option.id === 1).count).toBe(1);
  });

  it('applies all four dimensions with AND across dimensions', async () => {
    const response = await request(app).get(
      '/api/matches/filter-options?teamIds=1&opponentIds=2&competitionIds=TEST-COMP&seasonFrom=2024&seasonTo=2024',
    );

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
  });

  it.each([
    { name: 'ORs values within a dimension', query: 'teamIds=1,2' },
    { name: 'tolerates whitespace and ignores non-integer team ids', query: 'teamIds=%201,nope,,2%20' },
    { name: 'ignores an unparseable season and returns 200', query: 'seasonFrom=2024x' },
  ])('$name', async ({ query }) => {
    const response = await request(app).get(`/api/matches/filter-options?${query}`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
  });

  it('clamps seasons outside 2013–2025', async () => {
    const lower = await request(app).get('/api/matches/filter-options?seasonTo=2012');
    const upper = await request(app).get('/api/matches/filter-options?seasonFrom=2026');

    expect(lower.body.total).toBe(0);
    expect(upper.body.total).toBe(0);
  });

  it('ignores unknown query keys and unsafe competition identifiers', async () => {
    const unknown = await request(app).get('/api/matches/filter-options?daily=1');
    const unsafe = await request(app).get('/api/matches/filter-options?competitionIds=TEST-COMP,not%20safe');

    expect(unknown.body.total).toBe(1);
    expect(unsafe.body.total).toBe(1);
  });

  it.each([
    { name: 'drops non-representable team ids but keeps the valid ones', query: 'teamIds=1,99999999999999999999' },
    { name: 'treats a non-numeric team id list as unfiltered', query: 'teamIds=abc' },
    { name: 'drops unsafe competition identifiers', query: 'competitionIds=!!!' },
    { name: 'treats an unrepresentable season as unfiltered', query: 'seasonFrom=99999999999999999999' },
  ])('$name', async ({ query }) => {
    const response = await request(app).get(`/api/matches/filter-options?${query}`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
  });

  it('never returns a count derived from an incomplete game', async () => {
    const response = await request(app).get('/api/matches/filter-options?teamIds=1,2');

    expect(response.body.total).toBe(1);
    expect(response.body.teams.reduce((sum: number, option: { count: number }) => sum + option.count, 0)).toBe(1);
  });

  it('does not collide with the :id route', async () => {
    const response = await request(app).get('/api/matches/filter-options');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('seasons');
  });
});
