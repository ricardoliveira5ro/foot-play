import { describe, it, expect, vi } from 'vitest';
import { generatePlayerToken } from '../../services/tokenService';

describe('generatePlayerToken', () => {
  it('is deterministic for the same (gameId, playerId)', () => {
    expect(generatePlayerToken(1, 4567)).toBe(generatePlayerToken(1, 4567));
  });

  it('differs across games', () => {
    expect(generatePlayerToken(1, 4567)).not.toBe(generatePlayerToken(2, 4567));
  });

  it('differs across players in the same game', () => {
    expect(generatePlayerToken(1, 4567)).not.toBe(generatePlayerToken(1, 9999));
  });

  it('is URL-safe (no +, /, =)', () => {
    expect(generatePlayerToken(1, 4567)).not.toMatch(/[+/=]/);
  });

  it('is 22 chars (16-byte base64url)', () => {
    expect(generatePlayerToken(1, 4567)).toHaveLength(22);
  });
});

describe('PLAYER_TOKEN_SECRET requirement', () => {
  it('throws when the secret is missing at module load', async () => {
    const prev = process.env.PLAYER_TOKEN_SECRET;
    delete process.env.PLAYER_TOKEN_SECRET;
    vi.resetModules();
    await expect(import('../../services/tokenService')).rejects.toThrow(
      'PLAYER_TOKEN_SECRET is required but missing from environment'
    );
    process.env.PLAYER_TOKEN_SECRET = prev;
  });
});