import fs from 'fs';
import path from 'path';

// Runs in every test worker BEFORE any test file imports prisma/tokenService.
const urlFile = path.resolve(__dirname, '.test-db-url');
if (fs.existsSync(urlFile)) {
  process.env.DATABASE_URL = fs.readFileSync(urlFile, 'utf8').trim();
}

// tokenService reads this at module load and throws if missing.
process.env.PLAYER_TOKEN_SECRET = 'test-secret-for-vitest';