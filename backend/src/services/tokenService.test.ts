/**
 * Tests for the backend token service.
 * Follows the standalone pattern of wordle.test.ts: assert helpers +
 * console.log PASS/FAIL, run directly with ts-node.
 *
 * Run with: npx ts-node src/services/tokenService.test.ts
 */

// tokenService reads PLAYER_TOKEN_SECRET ONCE at module load and throws if it
// is missing. Static `import` statements are hoisted above this assignment in
// CommonJS emit, so load the module with require() AFTER setting the secret.
process.env.PLAYER_TOKEN_SECRET = 'test-secret-for-token-service';

// env must be set before module load; static import would hoist
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generatePlayerToken, resolvePlayerToken } = require('./tokenService') as typeof import('./tokenService');

// tokenService imports the prisma singleton from ../prisma. We stub the
// appearance model delegate before calling resolvePlayerToken so no real DB
// connection is needed.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('../prisma') as typeof import('../prisma');

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`FAIL: ${message}\n  Expected: ${expectedStr}\n  Actual:   ${actualStr}`);
  }
  console.log(`PASS: ${message}`);
}

function assertNotEqual<T>(actual: T, unexpected: T, message: string): void {
  const actualStr = JSON.stringify(actual);
  const unexpectedStr = JSON.stringify(unexpected);
  if (actualStr === unexpectedStr) {
    throw new Error(`FAIL: ${message}\n  Expected different from: ${unexpectedStr}\n  Actual:   ${actualStr}`);
  }
  console.log(`PASS: ${message}`);
}

function assertTrue(actual: boolean, message: string): void {
  if (!actual) {
    throw new Error(`FAIL: ${message} - expected true`);
  }
  console.log(`PASS: ${message}`);
}

console.log('Running backend token service tests...\n');

// generatePlayerToken determinism: same (gameId, playerId) → same token
assertEqual(
  generatePlayerToken(1, 4567),
  generatePlayerToken(1, 4567),
  'generatePlayerToken: deterministic for same (gameId, playerId)'
);

// Tokens differ across games
assertNotEqual(
  generatePlayerToken(1, 4567),
  generatePlayerToken(2, 4567),
  'generatePlayerToken: tokens differ across games'
);

// Tokens differ across players in the same game
assertNotEqual(
  generatePlayerToken(1, 4567),
  generatePlayerToken(1, 9999),
  'generatePlayerToken: tokens differ across players in the same game'
);

// Token is URL-safe: no +, /, = characters; ~22 chars (16-byte base64url)
const sampleToken = generatePlayerToken(1, 4567);
assertTrue(!/[+/=]/.test(sampleToken), 'generatePlayerToken: token is URL-safe (no +, /, =)');
assertEqual(sampleToken.length, 22, 'generatePlayerToken: token length is 22 chars (16-byte base64url)');

// resolvePlayerToken is async, so run the resolution tests inside an async
// IIFE and await each call.
(async () => {
  // resolvePlayerToken: valid token → correct playerId
  prisma.appearance.findMany = (async () => [{ playerId: 4567 }, { playerId: 9999 }]) as typeof prisma.appearance.findMany;
  assertEqual(
    await resolvePlayerToken(1, generatePlayerToken(1, 4567)),
    4567,
    'resolvePlayerToken: valid token resolves to its playerId'
  );

  // resolvePlayerToken: token from a different game → null
  prisma.appearance.findMany = (async () => [{ playerId: 4567 }, { playerId: 9999 }]) as typeof prisma.appearance.findMany;
  assertEqual(
    await resolvePlayerToken(1, generatePlayerToken(2, 4567)),
    null,
    'resolvePlayerToken: token from a different game resolves to null'
  );

  // resolvePlayerToken: garbage token (wrong content, correct 22-char length) → null
  prisma.appearance.findMany = (async () => [{ playerId: 4567 }, { playerId: 9999 }]) as typeof prisma.appearance.findMany;
  assertEqual(
    await resolvePlayerToken(1, 'aaaaaaaaaaaaaaaaaaaaaa'),
    null,
    'resolvePlayerToken: garbage token (correct length) resolves to null'
  );

  // resolvePlayerToken: wrong-length token → null, NOT a throw (regression for
  // the timingSafeEqual length guard)
  prisma.appearance.findMany = (async () => [{ playerId: 4567 }, { playerId: 9999 }]) as typeof prisma.appearance.findMany;
  assertEqual(
    await resolvePlayerToken(1, 'abc'),
    null,
    'resolvePlayerToken: wrong-length token resolves to null (does not throw)'
  );

  // resolvePlayerToken: empty appearances → null
  prisma.appearance.findMany = (async () => []) as typeof prisma.appearance.findMany;
  assertEqual(
    await resolvePlayerToken(1, generatePlayerToken(1, 4567)),
    null,
    'resolvePlayerToken: empty appearances resolves to null'
  );

  console.log('\n✅ All tests passed!');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
