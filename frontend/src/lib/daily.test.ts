import { describe, it, expect } from 'vitest';
import { toDailyKey, isDailyKey, selectDailyGameId, dailyHash32, isPlayableDaily } from './daily';

describe('toDailyKey', () => {
  it('keys on the UTC calendar date, not the local one', () => {
    expect(toDailyKey(new Date('2026-03-01T00:00:00Z'))).toBe('2026-03-01');
    expect(toDailyKey(new Date('2026-02-28T23:59:59Z'))).toBe('2026-02-28');
  });
  it('rolls over at 00:00:00 UTC and one millisecond earlier does not', () => {
    expect(toDailyKey(new Date('2026-03-01T00:00:00Z'))).not.toBe(toDailyKey(new Date('2026-02-28T23:59:59.999Z')));
  });
  it('is unaffected by the host timezone', () => {
    // Both instants are constructed with an explicit Z so the test is
    // timezone-independent regardless of where CI runs.
    expect(toDailyKey(new Date('2026-01-01T00:30:00Z'))).toBe('2026-01-01');
    expect(toDailyKey(new Date('2026-01-01T23:30:00Z'))).toBe('2026-01-01');
  });
});

describe('isDailyKey', () => {
  it('accepts real calendar dates', () => {
    expect(isDailyKey('2026-01-01')).toBe(true);
    expect(isDailyKey('2024-02-29')).toBe(true);   // leap year
    expect(isDailyKey('2013-07-27')).toBe(true);   // first date in the dataset
    expect(isDailyKey('2026-06-28')).toBe(true);   // last date in the dataset
  });
  it('rejects a day that does not exist by rolling forward', () => {
    expect(isDailyKey('2026-02-30')).toBe(false);  // -> 2026-03-02
    expect(isDailyKey('2025-02-29')).toBe(false);  // 2025 is not a leap year -> 2025-03-01
  });
  it('rejects a month that overflows the year', () => {
    expect(isDailyKey('2026-13-01')).toBe(false);  // -> 2027-01-01
    expect(isDailyKey('2026-00-10')).toBe(false);
  });
  it('rejects a two-digit year, which Date.UTC would remap to 19xx', () => {
    expect(isDailyKey('26-01-01')).toBe(false);
    expect(isDailyKey('0099-01-01')).toBe(false);
  });
  it('rejects any other shape', () => {
    for (const bad of ['', '2026-1-1', '2026/01/01', '2026-01-01T00:00:00Z', 'today', null, undefined, 20260101, {}]) {
      expect(isDailyKey(bad)).toBe(false);
    }
  });
});

describe('selectDailyGameId', () => {
  // Canonical fixture table — mirrored verbatim in
  // backend/src/__tests__/unit/dailySelection.test.ts (Task 3.5).
  const CANDIDATES = [101, 102, 103, 104, 105];

  it.each([
    ['2026-01-01', 104],
    ['2026-01-02', 103],
    ['2026-03-01', 102],
    ['2025-12-31', 101],
    ['2026-06-28', 103],
  ])('maps %s to game %i', (key, expected) => {
    expect(selectDailyGameId(CANDIDATES, key)).toBe(expected);
  });

  it('returns the same id for the same day every time', () => {
    const first = selectDailyGameId(CANDIDATES, '2026-01-01');
    for (let i = 0; i < 50; i += 1) expect(selectDailyGameId(CANDIDATES, '2026-01-01')).toBe(first);
  });
  it('is independent of the input order', () => {
    expect(selectDailyGameId([105, 101, 104, 102, 103], '2026-01-01')).toBe(104);
    expect(selectDailyGameId([103, 105, 102, 104, 101], '2026-01-01')).toBe(104);
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
  it('always returns a member of the candidate set, over many days', () => {
    const wide = Array.from({ length: 97 }, (_, i) => 1000 + i * 7);
    for (let day = 1; day <= 28; day += 1) {
      const key = `2026-01-${String(day).padStart(2, '0')}`;
      expect(wide).toContain(selectDailyGameId(wide, key));
    }
  });
  it('throws on an empty candidate set rather than returning undefined', () => {
    expect(() => selectDailyGameId([], '2026-01-01')).toThrow(/at least one candidate/);
  });
});

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
  it('always returns an unsigned 32-bit integer', () => {
    for (const k of ['2026-01-01', '1970-01-01', '9999-12-31']) {
      const h = dailyHash32(k);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(4294967295);
    }
  });
});

describe('isPlayableDaily', () => {
  it('is true only for today (§6.1: no catch-up, no playing yesterday)', () => {
    expect(isPlayableDaily('2026-01-01', '2026-01-01')).toBe(true);
    expect(isPlayableDaily('2025-12-31', '2026-01-01')).toBe(false);
    expect(isPlayableDaily('2026-01-02', '2026-01-01')).toBe(false);
    expect(isPlayableDaily(null, '2026-01-01')).toBe(false);
  });
});
