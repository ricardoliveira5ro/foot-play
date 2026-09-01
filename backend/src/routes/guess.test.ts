/**
 * Tests for the guess router, focusing on the anti-cheat-safe single-player
 * reveal endpoint POST /api/guess/reveal-one.
 *
 * Follows the standalone pattern of tokenService.test.ts: assert helpers +
 * console.log PASS/FAIL, run directly with ts-node.
 *
 * Run with: npx ts-node src/routes/guess.test.ts
 */

// guess.ts -> matchService -> tokenService reads PLAYER_TOKEN_SECRET ONCE at
// module load and throws if it is missing. Static `import` statements are
// hoisted above this assignment in CommonJS emit, so load the module with
// require() AFTER setting the secret.
process.env.PLAYER_TOKEN_SECRET = 'test-secret-for-guess-router';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const express = require('express') as typeof import('express');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require('http') as typeof import('http');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('../prisma') as typeof import('../prisma');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const guessRouter = require('./guess').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generatePlayerToken } = require('../services/tokenService') as typeof import('../services/tokenService');

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`FAIL: ${message}\n  Expected: ${expectedStr}\n  Actual:   ${actualStr}`);
  }
  console.log(`PASS: ${message}`);
}

interface HttpResponse {
  status: number;
  data: unknown;
}

/** POST a JSON body to a running server and collect the JSON response. */
function postJson(port: number, path: string, body: unknown): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        host: 'localhost',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let data: unknown = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            data = raw;
          }
          resolve({ status: res.statusCode ?? 0, data });
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

console.log('Running guess router tests...\n');

(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/guess', guessRouter);

  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const port = (server.address() as { port: number }).port;

  try {
    // --- POST /api/guess/reveal-one ---

    // Valid token resolves to a single player name (only the name is returned).
    prisma.appearance.findMany = (async () => [{ playerId: 4567 }]) as unknown as typeof prisma.appearance.findMany;
    prisma.appearance.findFirst = (async () => ({
      player: { displayName: 'Kevin De Bruyne', name: 'Kevin De Bruyne' },
    })) as unknown as typeof prisma.appearance.findFirst;

    const okRes = await postJson(port, '/api/guess/reveal-one', {
      gameId: 1,
      token: generatePlayerToken(1, 4567),
    });
    assertEqual(okRes.status, 200, 'reveal-one: valid token returns 200');
    assertEqual(okRes.data, { name: 'Kevin De Bruyne' }, 'reveal-one: returns ONLY the single player name');

    // Unknown token -> 404, no name leaked.
    prisma.appearance.findMany = (async () => []) as unknown as typeof prisma.appearance.findMany;
    prisma.appearance.findFirst = (async () => null) as unknown as typeof prisma.appearance.findFirst;

    const notFoundRes = await postJson(port, '/api/guess/reveal-one', { gameId: 1, token: 'unknown-token' });
    assertEqual(notFoundRes.status, 404, 'reveal-one: unknown token returns 404');
    assertEqual(
      notFoundRes.data,
      { error: 'Player not found', code: 'NOT_FOUND' },
      'reveal-one: 404 body has no name'
    );

    // Missing gameId -> 400.
    const missingGameRes = await postJson(port, '/api/guess/reveal-one', { token: 'some-token' });
    assertEqual(missingGameRes.status, 400, 'reveal-one: missing gameId returns 400');

    // Missing token -> 400.
    const missingTokenRes = await postJson(port, '/api/guess/reveal-one', { gameId: 1 });
    assertEqual(missingTokenRes.status, 400, 'reveal-one: missing token returns 400');

    console.log('\n✅ All tests passed!');
  } finally {
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
