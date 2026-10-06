import { describe, it, expect } from 'vitest';
import { prisma } from '../../prisma';

describe('test database', () => {
  it('is reachable and seeded', async () => {
    const players = await prisma.player.count();
    expect(players).toBe(36);
    const games = await prisma.game.count();
    expect(games).toBe(4);
  });
});
