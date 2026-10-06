import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, type GameFilterParams } from '../../types';
import { countActiveFilters, hasActiveFilters, matchesGameFilters } from './filters';

const game = {
  game: {
    homeClub: { clubId: 7, name: 'Home FC' },
    awayClub: { clubId: 9, name: 'Away FC' },
    competition: 'La Liga',
    season: '2023/2024',
  },
  filterMetadata: { teamId: 7, opponentId: 9, competitionId: 'LL', season: 2023 },
};

describe('matchesGameFilters', () => {
  it('matches an empty filter set', () => {
    expect(matchesGameFilters(EMPTY_FILTERS, game)).toBe(true);
  });

  it('matches every selected filter dimension', () => {
    const filters: GameFilterParams = {
      teamIds: [7], opponentIds: [9], competitionIds: ['LL'], seasonFrom: 2023, seasonTo: 2025,
    };
    expect(matchesGameFilters(filters, game)).toBe(true);
  });

  it('rejects a non-matching team or opponent', () => {
    expect(matchesGameFilters({ ...EMPTY_FILTERS, teamIds: [9] }, game)).toBe(false);
    expect(matchesGameFilters({ ...EMPTY_FILTERS, opponentIds: [7] }, game)).toBe(false);
  });

  it('rejects a non-matching competition or season', () => {
    expect(matchesGameFilters({ ...EMPTY_FILTERS, competitionIds: ['PL'] }, game)).toBe(false);
    expect(matchesGameFilters({ ...EMPTY_FILTERS, seasonFrom: 2024 }, game)).toBe(false);
  });

  it('returns false when the game value has no usable metadata', () => {
    expect(matchesGameFilters({ ...EMPTY_FILTERS, teamIds: [7] }, null)).toBe(false);
  });
});

describe('hasActiveFilters and countActiveFilters', () => {
  it('is false for EMPTY_FILTERS and empty arrays', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, teamIds: [] })).toBe(false);
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
  });

  it('counts active dimensions rather than selected values', () => {
    const filters: GameFilterParams = {
      ...EMPTY_FILTERS,
      teamIds: [1, 2, 3],
      seasonFrom: 2020,
    };
    expect(hasActiveFilters(filters)).toBe(true);
    expect(countActiveFilters(filters)).toBe(2);
  });
});
