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
    expect(res.body).toEqual({ status: 'ok', version: 'unknown', commit: 'unknown' });
  });
});

// The health route reads APP_VERSION / GIT_SHA per request, so these cases
// need no database and stay in the unit suite.
describe('GET /api/health version reporting', () => {
  const ENV_KEYS = ['APP_VERSION', 'GIT_SHA'] as const;

  afterEach(() => {
    ENV_KEYS.forEach((key) => {
      delete process.env[key];
    });
  });

  it('falls back to "unknown" when APP_VERSION and GIT_SHA are absent', async () => {
    const { app } = await import('../../app');
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', version: 'unknown', commit: 'unknown' });
  });

  it('reports the injected APP_VERSION and GIT_SHA', async () => {
    process.env.APP_VERSION = '0.2.3';
    process.env.GIT_SHA = 'ebd7b88';

    const { app } = await import('../../app');
    const res = await request(app).get('/api/health');
    expect(res.body).toEqual({ status: 'ok', version: '0.2.3', commit: 'ebd7b88' });
  });

  it('treats an empty or whitespace-only env var as absent', async () => {
    process.env.APP_VERSION = '   ';
    process.env.GIT_SHA = '';

    const { app } = await import('../../app');
    const res = await request(app).get('/api/health');
    expect(res.body).toEqual({ status: 'ok', version: 'unknown', commit: 'unknown' });
  });

  // The endpoint is how a running instance is identified, so an `undefined`
  // field would leave it unidentifiable. JSON.stringify drops undefined-valued
  // keys entirely, which would silently reshape the payload. Checked in both
  // the fully-absent and the half-configured state, which are the two cases
  // where a naive `process.env.X` read would leak `undefined`.
  it.each([
    ['no env vars set', undefined, undefined],
    ['only APP_VERSION set', '0.2.3', undefined],
    ['only GIT_SHA set', undefined, 'ebd7b88'],
  ])('never reports an undefined field (%s)', async (_label, appVersion, gitSha) => {
    if (appVersion !== undefined) process.env.APP_VERSION = appVersion;
    if (gitSha !== undefined) process.env.GIT_SHA = gitSha;

    const { app } = await import('../../app');
    const res = await request(app).get('/api/health');

    expect(Object.keys(res.body).sort()).toEqual(['commit', 'status', 'version']);
    Object.entries(res.body).forEach(([field, value]) => {
      expect(value, `field "${field}" must not be undefined`).not.toBeUndefined();
      expect(typeof value, `field "${field}" must be a string`).toBe('string');
    });
  });
});
