import { describe, it, expect } from 'vitest';
import { toDailyKey, isDailyKey } from '../../lib/dailyKey';

describe('toDailyKey', () => {
  it('keys on UTC', () => {
    expect(toDailyKey(new Date('2026-03-01T00:00:00Z'))).toBe('2026-03-01');
    expect(toDailyKey(new Date('2026-02-28T23:59:59Z'))).toBe('2026-02-28');
  });
});

describe('isDailyKey', () => {
  it('accepts real dates including both dataset endpoints', () => {
    for (const good of ['2013-07-27', '2026-06-28', '2024-02-29', '2026-01-01']) {
      expect(isDailyKey(good)).toBe(true);
    }
  });
  it('rejects a date that does not exist', () => {
    for (const bad of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10']) {
      expect(isDailyKey(bad)).toBe(false);
    }
  });
  it('rejects a two-digit year that Date.UTC would remap', () => {
    expect(isDailyKey('26-01-01')).toBe(false);
    expect(isDailyKey('0099-01-01')).toBe(false);
  });
  it('rejects any other shape', () => {
    for (const bad of ['', '2026-1-1', '2026/01/01', 'today', null, undefined, 20260101]) {
      expect(isDailyKey(bad)).toBe(false);
    }
  });
});
