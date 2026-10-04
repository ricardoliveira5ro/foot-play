import { describe, it, expect } from 'vitest';
import { prisma } from '../../prisma';

/**
 * The v1.1 filter columns. This list is CLOSED — adding an index is a
 * change to this array, not to schema.prisma alone.
 */
const REQUIRED_INDEXES = [
  'Game_season_idx',
  'Game_date_idx',
  'Game_targetTeamId_idx',
] as const;

describe('Game filter indexes', () => {
  it('creates an index for every filter column', async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'Game'
    `;
    const names = rows.map((row) => row.indexname);
    for (const expected of REQUIRED_INDEXES) {
      expect(names).toContain(expected);
    }
  });

  it('keeps the pre-existing competition index', async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'Game'
    `;
    expect(rows.map((row) => row.indexname)).toContain('Game_competitionId_idx');
  });
});
