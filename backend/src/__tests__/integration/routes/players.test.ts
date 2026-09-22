import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../../app';

describe('GET /api/players', () => {
  it('returns 200 with matching players', async () => {
    const res = await request(app).get('/api/players').query({ name: 'messi' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 101, name: 'Lionel Messi' }]);
  });

  it('returns 400 when name is too short', async () => {
    const res = await request(app).get('/api/players').query({ name: 'ab' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PARAMETER');
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app).get('/api/players');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PARAMETER');
  });
});