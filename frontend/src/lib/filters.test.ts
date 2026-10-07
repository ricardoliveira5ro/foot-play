import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, type GameFilterParams } from '../../types';
import { countActiveFilters, hasActiveFilters, matchesGameFilters } from './filters';
import { FILTER_PARAM_KEYS, paramsToFilters } from './filterParams';

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

describe('matchesGameFilters metadata fallbacks', () => {
  const clubs = {
    homeClub: { clubId: 7, name: 'Home FC' },
    awayClub: { clubId: 9, name: 'Away FC' },
  };

  it('treats a wrapperless record as its own filter metadata', () => {
    const flat = { ...clubs, targetTeamId: 7, opponentTeamId: 9, competitionId: 'LL', season: 2023 };
    expect(matchesGameFilters({ ...EMPTY_FILTERS, teamIds: [7] }, flat)).toBe(true);
    expect(matchesGameFilters({ ...EMPTY_FILTERS, teamIds: [9] }, flat)).toBe(false);
  });

  it('reads metadata nested inside the game record', () => {
    const wrapped = {
      game: {
        ...clubs,
        targetTeamId: 7,
        opponentTeamId: 9,
        competitionId: 'LL',
        season: 2023,
        filterMetadata: { season: 2023 },
      },
    };
    expect(matchesGameFilters({ ...EMPTY_FILTERS, teamIds: [7] }, wrapped)).toBe(true);
    expect(matchesGameFilters({ ...EMPTY_FILTERS, opponentIds: [9] }, wrapped)).toBe(true);
    expect(matchesGameFilters({ ...EMPTY_FILTERS, opponentIds: [7] }, wrapped)).toBe(false);
    expect(matchesGameFilters({ ...EMPTY_FILTERS, competitionIds: ['LL'] }, wrapped)).toBe(true);
  });

  it('uses the away club as the opponent when no opponent id exists anywhere', () => {
    const bare = { game: { ...clubs } };
    expect(matchesGameFilters({ ...EMPTY_FILTERS, opponentIds: [9] }, bare)).toBe(true);
    expect(matchesGameFilters({ ...EMPTY_FILTERS, opponentIds: [7] }, bare)).toBe(false);
    expect(matchesGameFilters({ ...EMPTY_FILTERS, teamIds: [7] }, bare)).toBe(true);
    expect(matchesGameFilters({ ...EMPTY_FILTERS, teamIds: [11] }, bare)).toBe(false);
    expect(matchesGameFilters({ ...EMPTY_FILTERS, competitionIds: ['LL'] }, bare)).toBe(false);
    expect(matchesGameFilters({ ...EMPTY_FILTERS, seasonTo: 2025 }, bare)).toBe(false);
  });

  it('parses the record-level season value in every supported shape', () => {
    const withSeason = (season: unknown) => ({ game: { ...clubs, season } });
    expect(matchesGameFilters({ ...EMPTY_FILTERS, seasonFrom: 2023 }, withSeason('2023/2024'))).toBe(true);
    expect(matchesGameFilters({ ...EMPTY_FILTERS, seasonFrom: 2023 }, withSeason('later'))).toBe(false);
    expect(matchesGameFilters({ ...EMPTY_FILTERS, seasonFrom: 2023 }, withSeason(2023))).toBe(true);
    expect(matchesGameFilters({ ...EMPTY_FILTERS, seasonTo: 2025 }, withSeason(2023.5))).toBe(false);
    expect(matchesGameFilters({ ...EMPTY_FILTERS, seasonTo: 2023 }, withSeason(2024))).toBe(false);

    // Metadata exists but omits season, so parseSeason sees the raw record value.
    const metaWithoutSeason = { game: { ...clubs, season: 2023, filterMetadata: { teamId: 7 } } };
    expect(matchesGameFilters({ ...EMPTY_FILTERS, seasonFrom: 2023 }, metaWithoutSeason)).toBe(true);
  });

  it('rejects a non-string competition id', () => {
    const numeric = { game: { ...clubs, competitionId: 42 } };
    expect(matchesGameFilters({ ...EMPTY_FILTERS, competitionIds: ['LL'] }, numeric)).toBe(false);
  });

  it('falls back to club ids when metadata ids are not integers', () => {
    const odd = { game: { ...clubs, filterMetadata: { teamId: 1.5, opponentId: 1.5 } } };
    expect(matchesGameFilters({ ...EMPTY_FILTERS, teamIds: [7] }, odd)).toBe(true);
    expect(matchesGameFilters({ ...EMPTY_FILTERS, opponentIds: [9] }, odd)).toBe(true);
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

describe('FILTER_PARAM_KEYS', () => {
  it('has no duplicates', () => {
    expect(new Set(FILTER_PARAM_KEYS).size).toBe(FILTER_PARAM_KEYS.length);
  });

  it('lists exactly the keys that paramsToFilters reads', () => {
    // Populate every key at once: the result's own fields are the dimensions
    // paramsToFilters reads, so they must correspond 1:1 with FILTER_PARAM_KEYS.
    const all = new URLSearchParams(
      FILTER_PARAM_KEYS.map((k) => [k, k === 'teamIds' || k === 'opponentIds' ? '7' : k === 'competitionIds' ? 'LL' : '2020']),
    );
    expect(Object.keys(paramsToFilters(all)).sort()).toEqual([...FILTER_PARAM_KEYS].sort());

    // And each individual key, fed alone, must actually change the result —
    // a key listed but never read (or read but unlisted) fails here.
    const baseline = paramsToFilters(new URLSearchParams());
    for (const key of FILTER_PARAM_KEYS) {
      const probe = paramsToFilters(new URLSearchParams([[key, key === 'teamIds' || key === 'opponentIds' ? '7' : key === 'competitionIds' ? 'LL' : '2020']]));
      expect(probe, `key ${key} is not read by paramsToFilters`).not.toEqual(baseline);
    }
  });

  it('does not contain keys that paramsToFilters ignores', () => {
    const baseline = paramsToFilters(new URLSearchParams());
    for (const key of ['daily', 'unknownKey']) {
      expect(paramsToFilters(new URLSearchParams([[key, '1']]))).toEqual(baseline);
      expect(FILTER_PARAM_KEYS).not.toContain(key);
    }
  });
});
