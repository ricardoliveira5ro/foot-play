import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';

// The app module reads NODE_ENV at import time to decide between the no-op
// middleware (test) and the morgan logger (everything else). Re-importing the
// module with a non-test NODE_ENV exercises the logger branch.
describe('app with production NODE_ENV', () => {
  afterEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
  });

  it('mounts the logger middleware when NODE_ENV is not test', async () => {
    process.env.NODE_ENV = 'production';
    vi.resetModules();
    const { app } = await import('../../app');
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});