import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './middleware/logger';
import matchesRouter from './routes/matches';
import playersRouter from './routes/players';
import guessRouter from './routes/guess';

const app = express();
const port = process.env.BACKEND_PORT ? parseInt(process.env.BACKEND_PORT, 10) : 4000;

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000' }));
app.use(express.json());
app.use(logger);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// API routes
app.use('/api/matches', matchesRouter);
app.use('/api/players', playersRouter);
app.use('/api/guess', guessRouter);

// 404 catch-all Unknown routes
app.use((_req, res) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' }));

app.use(errorHandler);

// Start server
app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});

export default app;
