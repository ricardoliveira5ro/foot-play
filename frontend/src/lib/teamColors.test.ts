/**
 * Test cases for the static team color lookup.
 */

import { describe, it, expect } from 'vitest';
import { getTeamColors, DEFAULT_TEAM_COLORS } from './teamColors';

describe('getTeamColors', () => {
  it('returns the default colors for null', () => {
    expect(getTeamColors(null)).toBe(DEFAULT_TEAM_COLORS);
  });

  it('returns the default colors for undefined', () => {
    expect(getTeamColors(undefined)).toBe(DEFAULT_TEAM_COLORS);
  });

  it('returns the exact entry for a known club id', () => {
    expect(getTeamColors(131)).toEqual({
      primary: '#A50044',
      secondary: '#004D98',
      pattern: 'stripes-v',
    });
  });

  it('includes numberOutline for entries that define it', () => {
    expect(getTeamColors(13)).toEqual({
      primary: '#CB3524',
      secondary: '#FFFFFF',
      pattern: 'stripes-v',
      numberOutline: true,
    });
  });

  it('returns the default colors for an unknown id', () => {
    expect(getTeamColors(999999)).toBe(DEFAULT_TEAM_COLORS);
  });

  it('returns the exact entry for a second known id (national team)', () => {
    expect(getTeamColors(3300)).toEqual({
      primary: '#E42518',
      secondary: '#0D6938',
      pattern: 'solid',
    });
  });
});