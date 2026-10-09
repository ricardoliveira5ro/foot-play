import { describe, expect, it } from 'vitest';
import {
  SEASON_MAX,
  SEASON_MIN,
  clampSeason,
  normaliseSeasonRange,
  toCompetitionOptions,
  toggleCompetition,
} from './competitionFilters';

describe('toCompetitionOptions', () => {
  it('joins counts to names', () => {
    const groups = [
      { id: 'PL', count: 120 },
      { id: 'LL', count: 80 },
    ];
    const names = new Map([
      ['PL', 'Premier League'],
      ['LL', 'La Liga'],
    ]);
    expect(toCompetitionOptions(groups, names)).toEqual([
      { id: 'PL', name: 'Premier League', count: 120 },
      { id: 'LL', name: 'La Liga', count: 80 },
    ]);
  });

  it('keeps an unresolvable competition with a visible fallback label', () => {
    const result = toCompetitionOptions([{ id: 'UNKNOWN', count: 0 }], new Map());
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('UNKNOWN');
    expect(result[0].name).toContain('UNKNOWN');
    expect(result[0].count).toBe(0);
  });

  it('returns an empty array for no groups', () => {
    expect(toCompetitionOptions([], new Map())).toEqual([]);
  });
});

describe('toggleCompetition', () => {
  it('adds an absent id', () => {
    expect(toggleCompetition(['PL'], 'LL')).toEqual(['PL', 'LL']);
    expect(toggleCompetition(null, 'LL')).toEqual(['LL']);
  });

  it('removes a present id', () => {
    expect(toggleCompetition(['PL', 'LL'], 'PL')).toEqual(['LL']);
  });

  it('returns null when the last id is removed', () => {
    expect(toggleCompetition(['PL'], 'PL')).toBeNull();
  });

  it('preserves order and does not mutate the input', () => {
    const input = ['PL', 'LL'];
    expect(toggleCompetition(input, 'SA')).toEqual(['PL', 'LL', 'SA']);
    expect(input).toEqual(['PL', 'LL']);
  });
});

describe('clampSeason', () => {
  it('keeps 2013 and 2025', () => {
    expect(clampSeason(SEASON_MIN)).toBe(2013);
    expect(clampSeason(SEASON_MAX)).toBe(2025);
  });

  it('clamps below 2013 to null', () => {
    expect(clampSeason(1999)).toBeNull();
  });

  it('clamps above 2025 to null', () => {
    expect(clampSeason(2026)).toBeNull();
  });

  it('keeps null as null', () => {
    expect(clampSeason(null)).toBeNull();
  });

  it('clamps a non-integer to null', () => {
    expect(clampSeason(2013.5)).toBeNull();
    expect(clampSeason(Number.NaN)).toBeNull();
  });
});

describe('normaliseSeasonRange', () => {
  it('leaves a valid range untouched', () => {
    expect(normaliseSeasonRange(2018, 2022)).toEqual({ from: 2018, to: 2022 });
  });

  it('leaves a half-open range untouched', () => {
    expect(normaliseSeasonRange(2018, null)).toEqual({ from: 2018, to: null });
    expect(normaliseSeasonRange(null, 2022)).toEqual({ from: null, to: 2022 });
  });

  it('pushes `to` up when `from` is raised past it', () => {
    expect(normaliseSeasonRange(2022, 2020, 'from')).toEqual({ from: 2022, to: 2022 });
    expect(normaliseSeasonRange(2022, 2020)).toEqual({ from: 2022, to: 2022 });
  });

  it('pushes `from` down when `to` is lowered below it', () => {
    expect(normaliseSeasonRange(2022, 2020, 'to')).toEqual({ from: 2020, to: 2020 });
  });

  it('does nothing when one bound is null', () => {
    expect(normaliseSeasonRange(null, null)).toEqual({ from: null, to: null });
    expect(normaliseSeasonRange(2022, null, 'to')).toEqual({ from: 2022, to: null });
  });

  it('produces a non-inverted range for every input in 2011..2027', () => {
    for (let from = 2011; from <= 2027; from++) {
      for (let to = 2011; to <= 2027; to++) {
        const result = normaliseSeasonRange(from, to);
        expect(result.from && result.to ? result.from <= result.to : true).toBe(true);
      }
    }
  });
});
