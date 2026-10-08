import { describe, expect, it } from 'vitest';
import {
  allFiltersWhere,
  competitionWhere,
  filtersExcluding,
  seasonWhere,
  teamWhere,
  type GameFilterParams,
} from '../../lib/filterQuery';

const emptyFilters: GameFilterParams = {
  teamIds: null,
  competitionIds: null,
  seasonFrom: null,
  seasonTo: null,
};

describe('filter query builders', () => {
  it('returns empty SQL for unfiltered dimensions', () => {
    expect(teamWhere([]).text).toBe('');
    expect(competitionWhere([]).text).toBe('');
    expect(seasonWhere(null, null).text).toBe('');
  });

  it('parameterizes a single team id without a stray comma', () => {
    const where = teamWhere([12]);

    expect(where.text).toContain('g."targetTeamId" IN ($1)');
    expect(where.values).toEqual([12]);
  });

  it('parameterizes multiple ids and competition identifiers', () => {
    const teams = teamWhere([12, 14]);
    const competitions = competitionWhere(['LL', 'PL']);

    expect(teams.values).toEqual([12, 14]);
    expect(teams.text).toContain('IN ($1,$2)');
    expect(competitions.values).toEqual(['LL', 'PL']);
    expect(competitions.text).toContain('g."competitionId" IN ($1,$2)');
  });

  it('parameterizes an inclusive season range', () => {
    const where = seasonWhere(2018, 2024);

    expect(where.text).toContain('g."season" >= $1');
    expect(where.text).toContain('g."season" <= $2');
    expect(where.values).toEqual([2018, 2024]);
  });

  it('keeps an inverted season range as an impossible inclusive condition', () => {
    const where = seasonWhere(2025, 2013);

    expect(where.text).toContain('g."season" >= $1');
    expect(where.text).toContain('g."season" <= $2');
    expect(where.values).toEqual([2025, 2013]);
  });

  it('combines all dimensions and omits only the requested facet', () => {
    const filters: GameFilterParams = {
      teamIds: [1],
      competitionIds: ['LL'],
      seasonFrom: 2020,
      seasonTo: 2024,
    };
    const all = allFiltersWhere(filters);
    const withoutTeam = filtersExcluding(filters, 'team');

    expect(all.values).toEqual([1, 'LL', 2020, 2024]);
    expect(all.text).toContain('targetTeamId');
    expect(all.text).toContain('competitionId');
    expect(all.text).toContain('season');
    // The Opponent dimension was removed — no clause may mention its column.
    expect(all.text).not.toContain('opponentTeamId');
    expect(withoutTeam.values).toEqual(['LL', 2020, 2024]);
    expect(withoutTeam.text).not.toContain('targetTeamId');
  });

  it('builds no opponent SQL even when a legacy object carries opponentIds', () => {
    const legacy = { ...emptyFilters, opponentIds: [2] } as unknown as GameFilterParams;

    expect(allFiltersWhere(legacy).text).not.toContain('opponentTeamId');
    expect(filtersExcluding(legacy, 'team').text).not.toContain('opponentTeamId');
  });

  it('returns empty SQL when all filters are unset', () => {
    expect(allFiltersWhere(emptyFilters).text).toBe('');
    expect(filtersExcluding(emptyFilters, 'season').text).toBe('');
  });
});
