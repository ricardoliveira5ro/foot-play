import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

const urlFile = path.resolve(__dirname, '.test-db-url');

export default async function setup(): Promise<() => Promise<void>> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:16').start();
  const url = container.getConnectionUri();

  // Apply migrations. prisma.config.ts loads .env.development via dotenv, but
  // dotenv never overrides an already-set env var, so our test URL wins.
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '../../..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  // Seed BEFORE writing the URL file: this process must set the env var itself
  // because the prisma singleton reads it at module load.
  process.env.DATABASE_URL = url;
  const { seed } = await import('./seed');
  await seed();

  // Hand the URL to test workers (globalSetup runs in a separate process).
  fs.writeFileSync(urlFile, url);

  return async () => {
    fs.rmSync(urlFile, { force: true });
    await container.stop();
  };
}