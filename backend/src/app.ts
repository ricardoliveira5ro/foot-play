import express from 'express';
import cors from 'cors';

import { errorHandler } from './middleware/errorHandler';
import { logger } from './middleware/logger';

import matchesRouter from './routes/matches';
import playersRouter from './routes/players';
import guessRouter from './routes/guess';

export const app = express();

// Do not disclose the Express version via the X-Powered-By header.
app.disable('x-powered-by');

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000' }));
app.use(express.json());
// Skip request logging under test to keep output clean.
app.use(process.env.NODE_ENV === 'test' ? (_req, _res, next) => next() : logger);

// Health check
//
// Deploy-time contract: the deploy pipeline injects APP_VERSION (SemVer, no
// `v` prefix — the tag carries the prefix) and GIT_SHA (full commit SHA) as
// container environment variables. Both are optional so local dev and tests
// never break, but neither is ever faked from disk: when a variable is absent
// we report the literal string UNKNOWN. Importing a version from
// package.json instead would make a broken injection look like a healthy,
// correctly-versioned instance, which is exactly the silent lie this endpoint
// exists to prevent.
const UNKNOWN = 'unknown';

/** Reads an env var, treating unset and empty/whitespace values as absent. */
const readEnv = (name: string): string => {
  const value = process.env[name];
  return value !== undefined && value.trim() !== '' ? value.trim() : UNKNOWN;
};

// Read per request rather than at import time so the values stay overridable
// in tests and follow any later mutation of process.env.
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: readEnv('APP_VERSION'),
    commit: readEnv('GIT_SHA'),
  });
});

// API routes
app.use('/api/matches', matchesRouter);
app.use('/api/players', playersRouter);
app.use('/api/guess', guessRouter);

// 404 catch-all Unknown routes
app.use((_req, res) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' }));

app.use(errorHandler);
