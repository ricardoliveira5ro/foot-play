import { describe, it, expect } from 'vitest';
import { toClubOptions, groupClubOptions, filterClubOptions, toggleId } from './clubFilters';
import type { FilterOptionGroup } from './clubFilters';

function group(overrides: Partial<FilterOptionGroup> & { id: number }): FilterOptionGroup {
  return { name: `Club ${overrides.id}`, isNationalTeam: false, count: 0, ...overrides };
}

describe('toClubOptions', () => {
  it('joins counts to names', () => {
    const names = new Map([[294, 'SL Benfica'], [31, 'FC Porto']]);
    const options = toClubOptions([group({ id: 294, count: 42 }), group({ id: 31, count: 7 })], names);
    expect(options).toEqual([
      { id: 294, name: 'SL Benfica', isNationalTeam: false, count: 42 },
      { id: 31, name: 'FC Porto', isNationalTeam: false, count: 7 },
    ]);
  });

  it('keeps a club whose name is missing from the map, with a visible fallback name', () => {
    const options = toClubOptions([group({ id: 294, name: undefined, count: 3 })], new Map());
    expect(options).toEqual([
      { id: 294, name: 'Club 294', isNationalTeam: false, count: 3 },
    ]);
  });

  it('does not drop an option whose name cannot be resolved', () => {
    const options = toClubOptions([group({ id: 77, name: '', count: 0 })], new Map());
    expect(options).toHaveLength(1);
    expect(options[0].name).toBe('Club 77');
  });

  it('preserves isNationalTeam', () => {
    const options = toClubOptions([group({ id: 5, isNationalTeam: true })], new Map());
    expect(options[0].isNationalTeam).toBe(true);
  });

  it("preserves the server's order and does not re-sort", () => {
    const options = toClubOptions(
      [group({ id: 9 }), group({ id: 2 }), group({ id: 5 })],
      new Map(),
    );
    expect(options.map((o) => o.id)).toEqual([9, 2, 5]);
  });

  it('returns an empty array for an empty group list', () => {
    expect(toClubOptions([], new Map())).toEqual([]);
  });
});

describe('groupClubOptions', () => {
  it('splits clubs from national teams', () => {
    const { clubs, nationalTeams } = groupClubOptions([
      { id: 1, name: 'SL Benfica', isNationalTeam: false, count: 4 },
      { id: 2, name: 'Portugal', isNationalTeam: true, count: 2 },
    ]);
    expect(clubs.map((o) => o.id)).toEqual([1]);
    expect(nationalTeams.map((o) => o.id)).toEqual([2]);
  });

  it('keeps the input order within each group', () => {
    const { clubs, nationalTeams } = groupClubOptions([
      { id: 3, name: 'C', isNationalTeam: false, count: 0 },
      { id: 9, name: 'N9', isNationalTeam: true, count: 0 },
      { id: 1, name: 'A', isNationalTeam: false, count: 0 },
      { id: 8, name: 'N8', isNationalTeam: true, count: 0 },
    ]);
    expect(clubs.map((o) => o.id)).toEqual([3, 1]);
    expect(nationalTeams.map((o) => o.id)).toEqual([9, 8]);
  });

  it('returns two empty groups for an empty list', () => {
    expect(groupClubOptions([])).toEqual({ clubs: [], nationalTeams: [] });
  });
});

describe('filterClubOptions', () => {
  const options = [
    { id: 294, name: 'SL Benfica', isNationalTeam: false, count: 10 },
    { id: 31, name: 'FC Porto', isNationalTeam: false, count: 8 },
    { id: 123, name: 'Independiente Medellín', isNationalTeam: false, count: 2 },
  ];

  it('returns everything for an empty or whitespace-only query', () => {
    expect(filterClubOptions(options, '')).toBe(options);
    expect(filterClubOptions(options, '   ')).toBe(options);
  });

  it('matches case-insensitively', () => {
    expect(filterClubOptions(options, 'BENFICA').map((o) => o.id)).toEqual([294]);
    expect(filterClubOptions(options, 'benfica').map((o) => o.id)).toEqual([294]);
  });

  it('matches on a substring, not a prefix', () => {
    expect(filterClubOptions(options, 'porto').map((o) => o.id)).toEqual([31]); // mid-name match, not a prefix
    expect(filterClubOptions(options, 'rt').map((o) => o.id)).toEqual([31]); // embedded substring
    expect(filterClubOptions(options, 'fica').map((o) => o.id)).toEqual([294]); // suffix match
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(filterClubOptions(options, '  benfica  ').map((o) => o.id)).toEqual([294]);
  });

  it('does not mutate the input array', () => {
    const before = [...options];
    filterClubOptions(options, 'porto');
    expect(options).toEqual(before);
  });

  it('strips diacritics so "medellin" matches "Medellín"', () => {
    expect(filterClubOptions(options, 'medellin').map((o) => o.id)).toEqual([123]);
  });

  // Real club names from scripts/data/clubs.csv — the data the control will see.
  it.each([
    ['asociacion', 'Asociación Deportivo Pasto'],
    ['velez sarsfield', 'Club Atlético Vélez Sársfield'],
    ['djurgardens', 'Djurgårdens Idrottsförening'],
    ['medellin', 'Independiente Medellín'],
  ])('strips diacritics for the real fixture name "%s"', (query, name) => {
    const fixture = [{ id: 1, name, isNationalTeam: false, count: 1 }];
    expect(filterClubOptions(fixture, query).map((o) => o.name)).toEqual([name]);
  });
});

describe('toggleId', () => {
  it('adds an absent id', () => {
    expect(toggleId([1, 2], 3)).toEqual([1, 2, 3]);
  });

  it('adds to a null list', () => {
    expect(toggleId(null, 7)).toEqual([7]);
  });

  it('removes a present id', () => {
    expect(toggleId([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it('returns null when the last id is removed', () => {
    expect(toggleId([5], 5)).toBeNull();
  });

  it('preserves the order of existing ids when adding', () => {
    expect(toggleId([9, 2, 5], 7)).toEqual([9, 2, 5, 7]);
  });

  it('does not mutate the input', () => {
    const list = [1, 2];
    toggleId(list, 3);
    expect(list).toEqual([1, 2]);
    toggleId(list, 1);
    expect(list).toEqual([1, 2]);
  });

  it('deduplicates an id that is somehow already present', () => {
    expect(toggleId([5, 5, 5], 5)).toBeNull();
    expect(toggleId([5, 5], 7)).toEqual([5, 7]);
  });
});
