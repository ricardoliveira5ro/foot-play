import { describe, it, expect, vi, beforeEach } from 'vitest';
import { errorHandler } from '../../middleware/errorHandler';
import { asyncHandler } from '../../middleware/asyncHandler';

function mockRes() {
  const res: any = { statusCode: 200 };
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('asyncHandler', () => {
  it('calls next when the handler rejects', async () => {
    const err = new Error('boom');
    const handler = asyncHandler(async () => { throw err; });
    const next = vi.fn();
    handler({} as any, {} as any, next);
    await Promise.resolve();
    expect(next).toHaveBeenCalledWith(err);
  });

  it('does not call next when the handler resolves', async () => {
    const handler = asyncHandler(async () => 'ok');
    const next = vi.fn();
    handler({} as any, {} as any, next);
    await Promise.resolve();
    expect(next).not.toHaveBeenCalled();
  });
});

describe('errorHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('maps 400 to INVALID_PARAMETER with err.message', () => {
    const res = mockRes();
    const err = Object.assign(new Error('Bad param'), { status: 400 });
    errorHandler(err, {} as any, res, vi.fn() as any);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Bad param', code: 'INVALID_PARAMETER' });
  });

  it('maps 404 to NOT_FOUND', () => {
    const res = mockRes();
    const err = Object.assign(new Error('Missing'), { status: 404 });
    errorHandler(err, {} as any, res, vi.fn() as any);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing', code: 'NOT_FOUND' });
  });

  it('defaults to 500 INTERNAL_ERROR with generic message', () => {
    const res = mockRes();
    errorHandler(new Error('secret detail'), {} as any, res, vi.fn() as any);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  });

  it('uses statusCode when status is absent', () => {
    const res = mockRes();
    const err = Object.assign(new Error('Teapot'), { statusCode: 418 });
    errorHandler(err, {} as any, res, vi.fn() as any);
    expect(res.status).toHaveBeenCalledWith(418);
    expect(res.json).toHaveBeenCalledWith({ error: 'Teapot', code: 'INTERNAL_ERROR' });
  });

  it('falls back to generic message when err.message is empty', () => {
    const res = mockRes();
    const err = Object.assign(new Error(), { status: 400 });
    errorHandler(err, {} as any, res, vi.fn() as any);
    expect(res.json).toHaveBeenCalledWith({ error: 'Something went wrong', code: 'INVALID_PARAMETER' });
  });

  it('logs the stack outside production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    errorHandler(new Error('boom'), {} as any, res, vi.fn() as any);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    process.env.NODE_ENV = prev;
  });

  it('does not log the stack in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    errorHandler(new Error('boom'), {} as any, res, vi.fn() as any);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    process.env.NODE_ENV = prev;
  });
});

describe('logger', () => {
  it('is a function in both dev and production modes', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    vi.resetModules();
    const devLogger = (await import('../../middleware/logger')).logger;
    expect(typeof devLogger).toBe('function');

    process.env.NODE_ENV = 'production';
    vi.resetModules();
    const prodLogger = (await import('../../middleware/logger')).logger;
    expect(typeof prodLogger).toBe('function');

    process.env.NODE_ENV = prev;
  });
});