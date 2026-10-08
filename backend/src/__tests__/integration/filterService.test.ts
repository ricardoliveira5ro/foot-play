import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../prisma';
import { createCompleteGame, seed } from '../setup/seed';
import { getFilterOptions } from '../../services/filterService';
import type { GameFilterParams } from '../../lib/filterQuery';

const EMPTY_FILTERS: GameFilterParams = {
  teamIds: null,
  competitionIds: null,
  seasonFrom: null,
  seasonTo: null,
};

describe('getFilterOptions', () => {
  beforeAll(async () => {
    await prisma.club.createMany({
      data: [
        { clubId: 3, name: 'Test National', isNationalTeam: true },
        { clubId: 4, name: 'Test Other', isNationalTeam: null },
      ],
    });
    await createCompleteGame({ gameId: 6, homeClubId: 1, awayClubId: 3, season: 2013 });
    await createCompleteGame({ gameId: 7, homeClubId: 3, awayClubId: 2, season: 2025 });
    await createCompleteGame({ gameId: 8, homeClubId: 1, awayClubId: 3, season: 2026 });
    await createCompleteGame({ gameId: 9, homeClubId: 1, awayClubId: 2, season: null });
  });

  afterAll(async () => {
    await seed();
  });

  it('returns every dimension plus a total for the empty filter set in one grouped query', async () => {
    const querySpy = vi.spyOn(prisma, '$queryRaw');
    const options = await getFilterOptions(EMPTY_FILTERS);

    expect(Object.keys(options).sort()).toEqual(['competitions', 'seasons', 'teams', 'total']);
    // The Opponent dimension was removed from the contract entirely.
    expect(options).not.toHaveProperty('opponents');
    expect(options.total).toBe(5);
    expect(querySpy).toHaveBeenCalledTimes(1);
    querySpy.mockRestore();
  });

  it('counts every club, including national teams, with isNationalTeam set', async () => {
    const options = await getFilterOptions(EMPTY_FILTERS);

    expect(options.teams).toEqual([
      { id: 1, name: 'Test FC', count: 4, isNationalTeam: false },
      { id: 3, name: 'Test National', count: 1, isNationalTeam: true },
      { id: 4, name: 'Test Other', count: 0, isNationalTeam: false },
      { id: 2, name: 'Test United', count: 0, isNationalTeam: false },
    ]);
  });

  it('never returns an incomplete game in any count', async () => {
    const options = await getFilterOptions(EMPTY_FILTERS);

    expect(options.total).toBe(5);
    expect(options.teams.reduce((sum, option) => sum + option.count, 0)).toBe(5);
  });

  it('applies seasonFrom and seasonTo inclusively', async () => {
    const options = await getFilterOptions({ ...EMPTY_FILTERS, seasonFrom: 2013, seasonTo: 2024 });

    expect(options.total).toBe(2);
    expect(options.teams.find(({ id }) => id === 1)?.count).toBe(2);
  });

  it('excludes the selected dimension from its own counts', async () => {
    const options = await getFilterOptions({ ...EMPTY_FILTERS, teamIds: [1] });

    expect(options.total).toBe(4);
    expect(options.teams.reduce((sum, option) => sum + option.count, 0)).toBe(5);
  });

  it('returns numeric zero counts when nothing matches', async () => {
    const options = await getFilterOptions({
      ...EMPTY_FILTERS,
      teamIds: [999],
    });

    expect(options.total).toBe(0);
    // Facet exclusion: the teams facet omits the team dimension, so its
    // counts mirror the unfiltered universe; every other facet narrows to
    // nothing under a team id no game matches.
    expect(options.teams.reduce((sum, option) => sum + option.count, 0)).toBe(5);
    for (const option of [...options.competitions, ...options.seasons]) {
      expect(option.count).toBe(0);
    }
  });

  it('omits null seasons from the seasons dimension', async () => {
    const options = await getFilterOptions(EMPTY_FILTERS);

    expect(options.seasons.every(({ season }) => Number.isInteger(season))).toBe(true);
  });

  it('never returns a season outside 2013–2025', async () => {
    const options = await getFilterOptions(EMPTY_FILTERS);

    expect(options.seasons.map(({ season }) => season)).toEqual([2013, 2024, 2025]);
  });

  it('keeps team totals equal to total when unfiltered and at least total when selected', async () => {
    const unfiltered = await getFilterOptions(EMPTY_FILTERS);
    const selected = await getFilterOptions({ ...EMPTY_FILTERS, teamIds: [1] });

    expect(unfiltered.teams.reduce((sum, option) => sum + option.count, 0)).toBe(unfiltered.total);
    expect(selected.teams.reduce((sum, option) => sum + option.count, 0)).toBeGreaterThanOrEqual(selected.total);
  });
});
