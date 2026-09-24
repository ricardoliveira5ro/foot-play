import dotenv from 'dotenv';
import path from 'node:path';

if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../../.env.development') });
}

import { app } from './app';

const port = process.env.BACKEND_PORT ? Number.parseInt(process.env.BACKEND_PORT, 10) : 4000;

app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
});