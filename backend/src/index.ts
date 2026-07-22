import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.BACKEND_PORT ? parseInt(process.env.BACKEND_PORT, 10) : 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});

export default app;
