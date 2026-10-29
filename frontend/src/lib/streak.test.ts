import { describe, it, expect } from 'vitest';
import { EMPTY_STREAK, daysBetween, nextStreak, hasPlayed, isStreakState } from './streak';

describe('daysBetween', () => {
  it.each([
    ['2025-12-31', '2026-01-01', 1],
    ['2026-01-31', '2026-02-01', 1],
    ['2026-01-01', '2026-01-03', 2],
    ['2024-02-28', '2024-03-01', 2],
    ['2026-02-28', '2026-03-01', 1],
    ['2024-02-29', '2025-03-01', 366],
  ])('daysBetween(%s, %s) === %i', (a, b, expected) => {
    expect(daysBetween(a, b)).toBe(expected);
  });
  it('is zero for the same day', () => {
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0);
  });
  it('is negative when b is before a', () => {
    expect(daysBetween('2026-01-03', '2026-01-01')).toBe(-2);
  });
});

describe('nextStreak', () => {
  it('first completion starts a streak of 1', () => {
    const next = nextStreak(EMPTY_STREAK, '2026-01-01');
    expect(next.current).toBe(1);
    expect(next.longest).toBe(1);
    expect(next.lastPlayedKey).toBe('2026-01-01');
    expect(next.playedKeys).toEqual(['2026-01-01']);
  });
  it('a consecutive day increments the streak', () => {
    const day1 = nextStreak(EMPTY_STREAK, '2026-01-01');
    const day2 = nextStreak(day1, '2026-01-02');
    expect(day2.current).toBe(2);
    expect(day2.longest).toBe(2);
    expect(day2.playedKeys).toEqual(['2026-01-01', '2026-01-02']);
  });
  it('a missed day resets current but keeps longest', () => {
    const day1 = nextStreak(EMPTY_STREAK, '2026-01-01');
    const day2 = nextStreak(day1, '2026-01-02');
    const day3 = nextStreak(day2, '2026-01-03');
    const missed = nextStreak(day3, '2026-01-06');
    expect(missed.current).toBe(1);
    expect(missed.longest).toBe(3);
    expect(missed.lastPlayedKey).toBe('2026-01-06');
  });
  it('recording the same day again is a reference no-op', () => {
    const day1 = nextStreak(EMPTY_STREAK, '2026-01-01');
    expect(nextStreak(day1, '2026-01-01')).toBe(day1);
  });
  it('never duplicates a key in playedKeys', () => {
    const day1 = nextStreak(EMPTY_STREAK, '2026-01-01');
    const day2 = nextStreak(day1, '2026-01-02');
    expect(day2.playedKeys).toEqual(['2026-01-01', '2026-01-02']);
  });
  it('a leap-day completion extends correctly and the next year is a miss', () => {
    const before = nextStreak(EMPTY_STREAK, '2024-02-28');
    const leap = nextStreak(before, '2024-02-29');
    expect(leap.current).toBe(2);
    const nextYear = nextStreak(leap, '2025-03-01');
    expect(nextYear.current).toBe(1);
    expect(nextYear.longest).toBe(2);
  });
  it('does not mutate its input state', () => {
    const input = { ...EMPTY_STREAK };
    const snapshot = JSON.stringify(input);
    nextStreak(input, '2026-01-01');
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('hasPlayed', () => {
  it('is true when today is in playedKeys', () => {
    const state = nextStreak(EMPTY_STREAK, '2026-01-01');
    expect(hasPlayed(state, '2026-01-01')).toBe(true);
  });
  it('is false when today is not in playedKeys', () => {
    const state = nextStreak(EMPTY_STREAK, '2026-01-01');
    expect(hasPlayed(state, '2026-01-02')).toBe(false);
  });
  it('is false for an empty streak', () => {
    expect(hasPlayed(EMPTY_STREAK, '2026-01-01')).toBe(false);
  });
});

describe('isStreakState', () => {
  it('accepts EMPTY_STREAK', () => {
    expect(isStreakState(EMPTY_STREAK)).toBe(true);
  });
  it('accepts a valid non-empty state', () => {
    expect(isStreakState({
      current: 2, longest: 2, lastPlayedKey: '2026-01-02', playedKeys: ['2026-01-01', '2026-01-02'],
    })).toBe(true);
  });
  it('rejects non-objects', () => {
    for (const bad of [null, undefined, 'x', 42, [], true]) {
      expect(isStreakState(bad)).toBe(false);
    }
  });
  it('rejects wrong field types', () => {
    expect(isStreakState({ current: '1', longest: 1, lastPlayedKey: null, playedKeys: [] })).toBe(false);
    expect(isStreakState({ current: 1, longest: 1, lastPlayedKey: '2026-01-01', playedKeys: 'x' })).toBe(false);
  });
  it('rejects negative or fractional counts', () => {
    expect(isStreakState({ current: -1, longest: 0, lastPlayedKey: null, playedKeys: [] })).toBe(false);
    expect(isStreakState({ current: 1.5, longest: 1, lastPlayedKey: '2026-01-01', playedKeys: ['2026-01-01'] })).toBe(false);
  });
  it('rejects an invalid day key', () => {
    expect(isStreakState({ current: 1, longest: 1, lastPlayedKey: '2026-02-30', playedKeys: ['2026-02-30'] })).toBe(false);
  });
  it('rejects longest < current', () => {
    expect(isStreakState({ current: 3, longest: 2, lastPlayedKey: '2026-01-03', playedKeys: ['2026-01-01', '2026-01-02', '2026-01-03'] })).toBe(false);
  });
  it('rejects current 0 with a lastPlayedKey', () => {
    expect(isStreakState({ current: 0, longest: 1, lastPlayedKey: '2026-01-01', playedKeys: ['2026-01-01'] })).toBe(false);
  });
  it('rejects a lastPlayedKey with no played keys', () => {
    expect(isStreakState({ current: 0, longest: 0, lastPlayedKey: '2026-01-01', playedKeys: [] })).toBe(false);
  });
  it('rejects longest smaller than current', () => {
    expect(isStreakState({ current: 2, longest: 1, lastPlayedKey: '2026-01-02', playedKeys: ['2026-01-01', '2026-01-02'] })).toBe(false);
  });
  it('rejects a lastPlayedKey that is not the last played key', () => {
    expect(isStreakState({ current: 1, longest: 1, lastPlayedKey: '2026-01-01', playedKeys: ['2026-01-02'] })).toBe(false);
  });
  it('rejects duplicate played keys', () => {
    expect(isStreakState({ current: 2, longest: 2, lastPlayedKey: '2026-01-02', playedKeys: ['2026-01-01', '2026-01-01'] })).toBe(false);
  });
  it('rejects current larger than the number of played days', () => {
    expect(isStreakState({ current: 3, longest: 3, lastPlayedKey: '2026-01-01', playedKeys: ['2026-01-01'] })).toBe(false);
  });
  it('rejects longest larger than the number of played days', () => {
    expect(isStreakState({ current: 2, longest: 3, lastPlayedKey: '2026-01-02', playedKeys: ['2026-01-01', '2026-01-02'] })).toBe(false);
  });
});
