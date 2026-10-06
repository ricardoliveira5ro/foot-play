import { describe, expect, it } from 'vitest';
import {
  getMockFilterOptions,
  getMockRandomMatch,
  MOCK_FILTER_OPTIONS,
  searchMockPlayers,
} from '../../lib/mockData';
import { EMPTY_FILTERS } from '../../types';

describe('mock filter parity', () => {
  it('keeps unfiltered team and opponent option counts consistent with total', () => {
    expect(MOCK_FILTER_OPTIONS.total).toBe(2);
    expect(MOCK_FILTER_OPTIONS.teams.reduce((sum, option) => sum + option.count, 0)).toBe(2);
    expect(MOCK_FILTER_OPTIONS.opponents.reduce((sum, option) => sum + option.count, 0)).toBe(2);
  });

  it('excludes a selected dimension from its own counts', () => {
    const options = getMockFilterOptions({ ...EMPTY_FILTERS, teamIds: [281] });

    expect(options.total).toBe(1);
    expect(options.teams.find(({ id }) => id === 281)?.count).toBe(1);
    expect(options.opponents.find(({ id }) => id === 985)?.count).toBe(1);
  });

  it('returns null instead of an unrelated match when no mock game matches', () => {
    expect(getMockRandomMatch({ ...EMPTY_FILTERS, seasonFrom: 2024 })).toBeNull();
  });

  it('searches mock players by the resolved display name', () => {
    expect(searchMockPlayers('lionel')).toEqual([{ id: 310, name: 'Lionel Messi' }]);
  });
});
