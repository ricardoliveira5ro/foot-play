import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, type GameFilterParams } from '../../types';
import { filtersToParams, isValidGameFilters, paramsToFilters } from './filterParams';

describe('paramsToFilters', () => {
  it('returns EMPTY_FILTERS-shaped values for an empty query', () => {
    expect(paramsToFilters(new URLSearchParams())).toEqual(EMPTY_FILTERS);
  });

  it('ignores unknown keys', () => {
    expect(paramsToFilters(new URLSearchParams('daily=1'))).toEqual(EMPTY_FILTERS);
  });

  it('parses comma-separated team ids', () => {
    expect(paramsToFilters(new URLSearchParams('teamIds=1,2'))).toEqual({
      ...EMPTY_FILTERS,
      teamIds: [1, 2],
    });
  });

  it('ignores a legacy opponentIds key left over from the removed dimension', () => {
    expect(paramsToFilters(new URLSearchParams('opponentIds=3'))).toEqual(EMPTY_FILTERS);
  });

  it('tolerates whitespace and repeated commas in a list', () => {
    expect(paramsToFilters(new URLSearchParams('teamIds=%201%20,,2,%20'))).toMatchObject({ teamIds: [1, 2] });
  });

  it('drops non-integer ids and empty segments', () => {
    expect(paramsToFilters(new URLSearchParams('teamIds=1,2.5,nope,,3'))).toMatchObject({ teamIds: [1, 3] });
  });

  it('parses seasonFrom and seasonTo as inclusive bounds', () => {
    expect(paramsToFilters(new URLSearchParams('seasonFrom=2018&seasonTo=2022'))).toMatchObject({
      seasonFrom: 2018,
      seasonTo: 2022,
    });
  });

  it('coerces an out-of-range season to null and keeps the other bound', () => {
    expect(paramsToFilters(new URLSearchParams('seasonFrom=1999&seasonTo=2022'))).toMatchObject({
      seasonFrom: null,
      seasonTo: 2022,
    });
  });

  it('deduplicates ids while preserving order', () => {
    expect(paramsToFilters(new URLSearchParams('teamIds=2,1,2'))).toMatchObject({ teamIds: [2, 1] });
  });

  it('preserves seasonFrom greater than seasonTo rather than normalising it', () => {
    expect(paramsToFilters(new URLSearchParams('seasonFrom=2024&seasonTo=2018'))).toMatchObject({
      seasonFrom: 2024,
      seasonTo: 2018,
    });
  });

  it('parses a URL-encoded competition id', () => {
    expect(paramsToFilters(new URLSearchParams('competitionIds=LA%2DLIGA'))).toMatchObject({
      competitionIds: ['LA-LIGA'],
    });
  });

  it('drops zero and non-representable team ids', () => {
    expect(paramsToFilters(new URLSearchParams('teamIds=0,5'))).toMatchObject({ teamIds: [5] });
    expect(paramsToFilters(new URLSearchParams('teamIds=99999999999999999999,5'))).toMatchObject({ teamIds: [5] });
    expect(paramsToFilters(new URLSearchParams('teamIds=0'))).toEqual(EMPTY_FILTERS);
  });

  it('drops invalid competition ids, keeping the valid ones', () => {
    expect(paramsToFilters(new URLSearchParams('competitionIds=LL,not safe'))).toMatchObject({
      competitionIds: ['LL'],
    });
    expect(paramsToFilters(new URLSearchParams('competitionIds=not safe'))).toMatchObject({
      competitionIds: null,
    });
  });
});

describe('filtersToParams', () => {
  it('omits every unfiltered dimension', () => {
    expect(filtersToParams(EMPTY_FILTERS).toString()).toBe('');
  });

  it('serialises all four dimensions', () => {
    const filters: GameFilterParams = {
      teamIds: [1, 2],
      competitionIds: ['LA-LIGA'],
      seasonFrom: 2018,
      seasonTo: 2022,
    };
    expect(filtersToParams(filters).toString()).toBe(
      'teamIds=1%2C2&competitionIds=LA-LIGA&seasonFrom=2018&seasonTo=2022',
    );
  });

  it('round-trips through paramsToFilters', () => {
    const filters: GameFilterParams = {
      teamIds: [7, 9],
      competitionIds: ['PL'],
      seasonFrom: 2019,
      seasonTo: 2025,
    };
    expect(paramsToFilters(filtersToParams(filters))).toEqual(filters);
  });
});

describe('isValidGameFilters', () => {
  it('accepts EMPTY_FILTERS and a fully populated object', () => {
    expect(isValidGameFilters(EMPTY_FILTERS)).toBe(true);
    expect(isValidGameFilters({
      teamIds: [1], competitionIds: ['LL'], seasonFrom: 2013, seasonTo: 2025,
    })).toBe(true);
  });

  it('rejects a legacy object that still carries opponentIds', () => {
    expect(isValidGameFilters({ ...EMPTY_FILTERS, opponentIds: [2] })).toBe(false);
  });

  it('rejects a non-array teamIds, a non-integer id, and an out-of-range season', () => {
    expect(isValidGameFilters({ ...EMPTY_FILTERS, teamIds: '1' })).toBe(false);
    expect(isValidGameFilters({ ...EMPTY_FILTERS, teamIds: [1.5] })).toBe(false);
    expect(isValidGameFilters({ ...EMPTY_FILTERS, seasonFrom: 2012 })).toBe(false);
  });

  it('rejects an unknown extra key', () => {
    expect(isValidGameFilters({ ...EMPTY_FILTERS, daily: true })).toBe(false);
  });

  it('rejects non-object inputs', () => {
    expect(isValidGameFilters(null)).toBe(false);
    expect(isValidGameFilters('teamIds=1')).toBe(false);
    expect(isValidGameFilters([])).toBe(false);
  });
});

import { dailyToParams, paramsToDailyKey, DAILY_PARAM_KEY } from './filterParams';

describe('dailyToParams', () => {
  it('emits exactly one key', () => {
    expect(dailyToParams('2026-01-01').toString()).toBe('daily=2026-01-01');
  });
  it('uses the frozen key name', () => {
    expect(DAILY_PARAM_KEY).toBe('daily');
    expect(dailyToParams('2026-01-01').has('daily')).toBe(true);
  });
  it('emits nothing else, so it cannot clobber a filter param', () => {
    const params = dailyToParams('2026-01-01');
    expect([...params.keys()]).toEqual(['daily']);
  });
});

describe('paramsToDailyKey', () => {
  it('reads a valid key', () => {
    expect(paramsToDailyKey(new URLSearchParams('daily=2026-01-01'))).toBe('2026-01-01');
  });
  it('returns null when the param is absent', () => {
    expect(paramsToDailyKey(new URLSearchParams(''))).toBeNull();
    expect(paramsToDailyKey(new URLSearchParams('teamIds=7&seasonFrom=2020'))).toBeNull();
  });
  it('returns null for a malformed key rather than passing it through', () => {
    for (const bad of ['daily=2026-02-30', 'daily=2026-1-1', 'daily=today', 'daily=', 'daily=2026-13-01', 'daily=26-01-01']) {
      expect(paramsToDailyKey(new URLSearchParams(bad))).toBeNull();
    }
  });
  it('coexists with every filter param without being affected by them', () => {
    const params = new URLSearchParams('teamIds=7&competitionIds=Premier%20League&seasonFrom=2020&seasonTo=2022&daily=2026-03-01');
    expect(paramsToDailyKey(params)).toBe('2026-03-01');
    expect(params.get('teamIds')).toBe('7');
  });
  it('survives a merge round trip', () => {
    const merged = new URLSearchParams('teamIds=7&daily=2026-03-01');
    for (const [k, v] of dailyToParams('2026-03-01')) merged.set(k, v);
    expect(paramsToDailyKey(merged)).toBe('2026-03-01');
    expect(merged.toString()).toBe('teamIds=7&daily=2026-03-01');
  });
});

