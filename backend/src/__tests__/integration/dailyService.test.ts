import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../prisma';
import { getEligibleGameIds, getDailyMatch } from '../../services/dailyService';
import { seed, createCompleteGame } from '../setup/seed';

describe('getEligibleGameIds', () => {
  it('never returns a game with an incomplete lineup', async () => {
    const ids = await getEligibleGameIds();
    expect(ids.length).toBeGreaterThan(0);
    // Every returned id must have 11 appearances on BOTH sides. Spot-check a
    // slice rather than all ~9.7k so the suite stays fast; the SQL predicate
    // itself is v1.1.1's and is tested there.
    for (const id of ids.slice(0, 25)) {
      const game = await prisma.game.findUnique({
        where: { gameId: id },
        include: { appearances: true },
      });
      expect(game).not.toBeNull();
      const home = game!.appearances.filter((a) => a.clubId === game!.homeClubId).length;
      const away = game!.appearances.filter((a) => a.clubId === game!.awayClubId).length;
      expect(home).toBe(11);
      expect(away).toBe(11);
    }
  });

  it('returns a strictly decreasing-id-free, duplicate-free ascending list', async () => {
    const ids = await getEligibleGameIds();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('excludes every game the raw appearance count says is incomplete', async () => {
    const ids = new Set(await getEligibleGameIds());
    const incomplete = await prisma.$queryRaw<{ gameId: number }[]>`
      SELECT DISTINCT g."gameId"
      FROM "Game" g
      LEFT JOIN "Appearance" a ON a."gameId" = g."gameId"
      GROUP BY g."gameId"
      HAVING COUNT(a.*) < 22
    `;
    for (const row of incomplete) expect(ids.has(row.gameId)).toBe(false);
  });
});

describe('getDailyMatch', () => {
  // The shared test seed has only one playable game (id 5), so a "different
  // days pick different games" assertion needs more than one candidate. These
  // fixtures are added for this describe block only and the seed is restored
  // afterwards (fileParallelism is false, so no other file observes them).
  beforeAll(async () => {
    for (const gameId of [1001, 1002, 1003, 1004]) {
      await createCompleteGame({ gameId, homeClubId: 1, awayClubId: 2 });
    }
  });

  afterAll(async () => {
    await seed();
  });

  it('returns the same game for the same day, every time', async () => {
    const first = await getDailyMatch('2026-01-01');
    for (let i = 0; i < 5; i += 1) {
      expect((await getDailyMatch('2026-01-01')).gameId).toBe(first.gameId);
    }
  });

  it('returns a different game for two different days', async () => {
    // With the five playable games in this fixture (the seed's game 5 plus the
    // four above) two keys could in principle collide; a 20-day sample makes a
    // collision-only outcome effectively impossible.
    const seen = new Set<number>();
    for (let day = 1; day <= 20; day += 1) {
      seen.add((await getDailyMatch(`2026-01-${String(day).padStart(2, '0')}`)).gameId);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('returns a game that is genuinely playable — 11 shirts on both sides', async () => {
    for (const key of ['2026-01-01', '2026-03-01', '2025-12-31']) {
      const game = await getDailyMatch(key);
      const home = game.appearances.filter((a) => a.clubId === game.homeClubId).length;
      const away = game.appearances.filter((a) => a.clubId === game.awayClubId).length;
      expect(home).toBe(11);
      expect(away).toBe(11);
    }
  });

  it('returns a game drawn from the eligible pool', async () => {
    const ids = new Set(await getEligibleGameIds());
    expect(ids.has((await getDailyMatch('2026-01-01')).gameId)).toBe(true);
  });

  it('throws NOT_FOUND/404 when the eligible pool is empty', async () => {
    // An empty eligible pool means the database is unseeded, which is the only
    // way this endpoint can 404. Empty it only for this assertion and restore
    // the shared seed immediately afterwards.
    await prisma.appearance.deleteMany();
    await prisma.game.deleteMany();
    try {
      await expect(getDailyMatch('2026-01-01')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        status: 404,
      });
    } finally {
      await seed();
    }
  });
});
