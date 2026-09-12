import { describe, it, expect } from 'vitest';
import { generatePlayerToken, resolvePlayerToken } from '../../services/tokenService';

describe('resolvePlayerToken', () => {
  it('resolves a valid token to its playerId', async () => {
    expect(await resolvePlayerToken(1, generatePlayerToken(1, 101))).toBe(101);
  });

  it('returns null for a token from a different game', async () => {
    expect(await resolvePlayerToken(1, generatePlayerToken(2, 101))).toBeNull();
  });

  it('returns null for a garbage token of correct length', async () => {
    expect(await resolvePlayerToken(1, 'aaaaaaaaaaaaaaaaaaaaaa')).toBeNull();
  });

  it('returns null for a wrong-length token (no throw)', async () => {
    expect(await resolvePlayerToken(1, 'abc')).toBeNull();
  });

  it('returns null when the game has no appearances', async () => {
    expect(await resolvePlayerToken(3, generatePlayerToken(3, 101))).toBeNull();
  });
});