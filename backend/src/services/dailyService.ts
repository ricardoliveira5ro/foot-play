import { Prisma } from '../generated/prisma/client';
import { prisma } from '../prisma';
import { completeLineupsWhere } from '../lib/lineupCompleteness';
import { getMatchById, type GameWithRelations } from './matchService';
import { selectDailyGameId } from '../lib/dailySelection';

/**
 * Every game a player can actually finish, ascending by id.
 *
 * Interpolation order matters: the alias `g` declared by
 * completeLineupsWhere() must be introduced before the predicate is used.
 *
 * Why the whole list rather than a SQL OFFSET/LIMIT: the frozen contract
 * puts the selection in a pure function of the candidate ids, and having the
 * server run that exact function means there is one implementation of the
 * rule in the request path rather than two that must agree. ~9.7k integers is
 * roughly 60 KB of JSON per daily page load. This is NOT the §3.2 / R4 memory
 * exposure, which is about accumulating a map over ~1.27M event rows; a
 * short id array is two orders of magnitude smaller and is discarded
 * immediately.
 */
export async function getEligibleGameIds(): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ gameId: number }[]>(Prisma.sql`
    SELECT g."gameId" AS "gameId"
    FROM "Game" g
    WHERE ${completeLineupsWhere()}
    ORDER BY g."gameId" ASC
  `);
  return rows.map((row) => row.gameId);
}

/**
 * The puzzle for a day key.
 *
 * Throws NOT_FOUND/404 when the eligible pool is empty, which means the
 * database is unseeded — an operational failure, not a per-day one. A
 * particular day can never have zero candidates: the pool is the whole
 * eligible dataset and the day key selects from it.
 */
export async function getDailyMatch(key: string): Promise<GameWithRelations> {
  const candidates = await getEligibleGameIds();

  if (candidates.length === 0) {
    throw Object.assign(new Error('No playable games available for the daily puzzle'), {
      code: 'NOT_FOUND',
      status: 404,
    });
  }

  const gameId = selectDailyGameId(candidates, key);
  const game = await getMatchById(gameId);

  if (!game) {
    // Unreachable while the pool and the id lookup read the same table, but
    // a 500 here is a lie and a null return is a crash. Refuse explicitly.
    throw Object.assign(new Error(`Daily game ${gameId} disappeared between selection and load`), {
      code: 'NOT_FOUND',
      status: 404,
    });
  }

  return game;
}
