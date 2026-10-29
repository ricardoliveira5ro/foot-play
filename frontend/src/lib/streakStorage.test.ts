import { describe, it, expect } from 'vitest';
import { STORAGE_KEY, loadStreak, recordCompletion, getDailyStorage } from './streakStorage';
import { EMPTY_STREAK } from './streak';

/** Minimal in-memory Storage. Enough for every assertion in this file. */
function createStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    clear: () => { map.clear(); },
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => { map.delete(key); },
    setItem: (key: string, value: string) => { map.set(key, String(value)); },
  } as Storage;
}

describe('loadStreak', () => {
  it('returns EMPTY_STREAK when storage is undefined (server render)', () => {
    expect(loadStreak()).toBe(EMPTY_STREAK);
  });
  it('returns EMPTY_STREAK when nothing is stored', () => {
    expect(loadStreak(createStorage())).toEqual(EMPTY_STREAK);
  });
  it('reads a valid stored state', () => {
    const storage = createStorage({
      [STORAGE_KEY]: JSON.stringify({ current: 2, longest: 2, lastPlayedKey: '2026-01-02', playedKeys: ['2026-01-01', '2026-01-02'] }),
    });
    expect(loadStreak(storage)).toEqual({ current: 2, longest: 2, lastPlayedKey: '2026-01-02', playedKeys: ['2026-01-01', '2026-01-02'] });
  });
  it('returns EMPTY_STREAK and removes corrupt JSON', () => {
    const storage = createStorage({ [STORAGE_KEY]: '{not json' });
    expect(loadStreak(storage)).toEqual(EMPTY_STREAK);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });
  it('returns EMPTY_STREAK and removes an invalid shape', () => {
    const storage = createStorage({
      [STORAGE_KEY]: JSON.stringify({ current: 1, longest: 1, lastPlayedKey: '2026-02-30', playedKeys: ['2026-02-30'] }),
    });
    expect(loadStreak(storage)).toEqual(EMPTY_STREAK);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });
  it('returns EMPTY_STREAK when getItem throws', () => {
    const throwing = { getItem: () => { throw new Error('denied'); } } as unknown as Storage;
    expect(loadStreak(throwing)).toEqual(EMPTY_STREAK);
  });
});

describe('recordCompletion', () => {
  it('writes the new state under STORAGE_KEY and returns it', () => {
    const storage = createStorage();
    const next = recordCompletion(storage, '2026-01-01');
    expect(next.current).toBe(1);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual(next);
  });
  it('extends a stored streak', () => {
    const storage = createStorage({
      [STORAGE_KEY]: JSON.stringify({ current: 1, longest: 1, lastPlayedKey: '2025-12-31', playedKeys: ['2025-12-31'] }),
    });
    const next = recordCompletion(storage, '2026-01-01');
    expect(next.current).toBe(2);
    expect(next.longest).toBe(2);
  });
  it('is idempotent for the same day', () => {
    const storage = createStorage({
      [STORAGE_KEY]: JSON.stringify({ current: 1, longest: 1, lastPlayedKey: '2026-01-01', playedKeys: ['2026-01-01'] }),
    });
    const first = recordCompletion(storage, '2026-01-01');
    const second = recordCompletion(storage, '2026-01-01');
    expect(second).toEqual(first);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual(first);
  });
  it('throws for a key isDailyKey would reject', () => {
    expect(() => recordCompletion(createStorage(), '2026-02-30' as never)).toThrow(/daily key/i);
  });
  it('propagates a setItem failure rather than lying about persistence', () => {
    const failing = { setItem: () => { throw new Error('quota'); } } as unknown as Storage;
    expect(() => recordCompletion(failing, '2026-01-01')).toThrow(/quota/);
  });
});

describe('getDailyStorage', () => {
  it('returns null when there is no window (node/server render)', () => {
    expect(getDailyStorage()).toBeNull();
  });
});
