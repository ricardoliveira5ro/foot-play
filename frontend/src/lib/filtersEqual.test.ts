import { describe, it, expect } from 'vitest';
import { filtersEqual } from './filtersEqual';
import { EMPTY_FILTERS } from '../../types';

describe('filtersEqual', () => {
  it('is true for two EMPTY_FILTERS', () => {
    expect(filtersEqual(EMPTY_FILTERS, EMPTY_FILTERS)).toBe(true);
  });

  it('is true for identical filters', () => {
    const filters = {
      teamIds: [1, 2],
      competitionIds: ['PL', 'CL'],
      seasonFrom: 2020,
      seasonTo: 2024,
    };
    expect(filtersEqual(filters, { ...filters })).toBe(true);
  });

  it('is false when any single dimension differs', () => {
    const base = {
      teamIds: [1],
      competitionIds: ['PL'],
      seasonFrom: 2020,
      seasonTo: 2024,
    };

    // teamIds differs
    expect(filtersEqual(base, { ...base, teamIds: [2] })).toBe(false);
    // competitionIds differs
    expect(filtersEqual(base, { ...base, competitionIds: ['CL'] })).toBe(false);
    // seasonFrom differs
    expect(filtersEqual(base, { ...base, seasonFrom: 2021 })).toBe(false);
    // seasonTo differs
    expect(filtersEqual(base, { ...base, seasonTo: 2023 })).toBe(false);
  });

  it('ignores id order: [1,2] equals [2,1]', () => {
    const a = {
      teamIds: [1, 2],
      competitionIds: ['PL', 'CL'],
      seasonFrom: 2020,
      seasonTo: 2024,
    };
    const b = {
      teamIds: [2, 1],
      competitionIds: ['CL', 'PL'],
      seasonFrom: 2020,
      seasonTo: 2024,
    };
    expect(filtersEqual(a, b)).toBe(true);
  });

  it('does not mutate its arguments', () => {
    const a = {
      teamIds: [3, 1, 2],
      competitionIds: ['CL', 'PL'],
      seasonFrom: 2020,
      seasonTo: 2024,
    };
    const aCopy = JSON.parse(JSON.stringify(a));
    const b = {
      teamIds: [2, 3, 1],
      competitionIds: ['PL', 'CL'],
      seasonFrom: 2020,
      seasonTo: 2024,
    };
    const bCopy = JSON.parse(JSON.stringify(b));

    filtersEqual(a, b);

    expect(a).toEqual(aCopy);
    expect(b).toEqual(bCopy);
  });

  it('distinguishes null from an empty array', () => {
    const withNull = {
      teamIds: null,
      competitionIds: null,
      seasonFrom: null,
      seasonTo: null,
    };
    const withEmpty = {
      teamIds: [],
      competitionIds: [],
      seasonFrom: null,
      seasonTo: null,
    };
    expect(filtersEqual(withNull, withEmpty)).toBe(false);
  });

  it('distinguishes seasonFrom 2019 from seasonTo 2019', () => {
    const a = {
      teamIds: null,
      competitionIds: null,
      seasonFrom: 2019,
      seasonTo: null,
    };
    const b = {
      teamIds: null,
      competitionIds: null,
      seasonFrom: null,
      seasonTo: 2019,
    };
    expect(filtersEqual(a, b)).toBe(false);
  });
});
