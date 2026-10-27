import { describe, it, expect } from 'vitest';
import { dailyHash32, selectDailyGameId } from '../../lib/dailySelection';

// CANONICAL FIXTURE — identical to the table in
// frontend/src/lib/daily.test.ts. If you change one, change both, and say so
// in the changelog: a change here silently republishes every day's puzzle.
const CANDIDATES = [101, 102, 103, 104, 105];

describe('dailyHash32', () => {
  it.each([
    ['2026-01-01', 2049302883],
    ['2026-01-02', 2066080502],
    ['2026-03-01', 2731745201],
    ['2025-12-31', 2670561445],
    ['2026-06-28', 3118212717],
    ['2013-07-27', 1811984445],
  ])('hashes %s to %i', (key, expected) => {
    expect(dailyHash32(key)).toBe(expected);
  });
  it('is always an unsigned 32-bit integer', () => {
    for (const k of ['2026-01-01', '1970-01-01', '9999-12-31']) {
      const h = dailyHash32(k);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(4294967295);
    }
  });
});

describe('selectDailyGameId', () => {
  it.each([
    ['2026-01-01', 104],
    ['2026-01-02', 103],
    ['2026-03-01', 102],
    ['2025-12-31', 101],
    ['2026-06-28', 103],
  ])('maps %s to game %i', (key, expected) => {
    expect(selectDailyGameId(CANDIDATES, key)).toBe(expected);
  });
  it('is independent of input order', () => {
    expect(selectDailyGameId([105, 101, 104, 102, 103], '2026-01-01')).toBe(104);
  });
  it('does not mutate its candidates argument', () => {
    const input = [105, 101, 103];
    const copy = [...input];
    selectDailyGameId(input, '2026-01-01');
    expect(input).toEqual(copy);
  });
  it('returns the only candidate when there is exactly one', () => {
    expect(selectDailyGameId([777], '2026-01-01')).toBe(777);
  });
  it('always returns a member of the candidate set', () => {
    const wide = Array.from({ length: 97 }, (_, i) => 1000 + i * 7);
    for (let day = 1; day <= 28; day += 1) {
      expect(wide).toContain(selectDailyGameId(wide, `2026-01-${String(day).padStart(2, '0')}`));
    }
  });
  it('throws on an empty candidate set', () => {
    expect(() => selectDailyGameId([], '2026-01-01')).toThrow(/at least one candidate/);
  });
});
