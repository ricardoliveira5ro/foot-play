import { isDailyKey } from '@/lib/daily';
import { EMPTY_STREAK, isStreakState, nextStreak, type StreakState } from './streak';

/**
 * The ONLY module in the project that names localStorage (§11 Rule 8).
 *
 * Everything else — the page, DailyEntry, tests — goes through the three
 * functions here. That is what makes the hydration constraint have exactly
 * one blast radius and what makes a v1.3.2 revert a pure code revert.
 */

/** O1 seam: bumping this invalidates the old shape with no migration. */
export const STORAGE_KEY = 'footplay.daily.v1';

/** window.localStorage when it exists, else null (server render). */
export function getDailyStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

/**
 * Read and validate the persisted streak. Never throws.
 *
 * - no storage (server render) → EMPTY_STREAK
 * - nothing stored → EMPTY_STREAK
 * - getItem throws (privacy mode) → EMPTY_STREAK
 * - corrupt JSON or an invalid shape → EMPTY_STREAK, and the entry is
 *   removed. Corrupt data is discarded, not repaired: a repaired value is a
 *   value we would then have to keep correct.
 */
export function loadStreak(storage?: Storage): StreakState {
  const target = storage ?? getDailyStorage();
  if (!target) return EMPTY_STREAK;
  let raw: string | null;
  try {
    raw = target.getItem(STORAGE_KEY);
  } catch {
    return EMPTY_STREAK;
  }
  if (raw === null) return EMPTY_STREAK;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isStreakState(parsed)) {
      target.removeItem(STORAGE_KEY);
      return EMPTY_STREAK;
    }
    return parsed;
  } catch {
    target.removeItem(STORAGE_KEY);
    return EMPTY_STREAK;
  }
}

/**
 * Compute the next state, persist it, return it.
 *
 * The key is validated here as belt-and-braces: the page passes
 * `state.dailyKey`, which came from `paramsToDailyKey` or `toDailyKey` and
 * is therefore already valid, but this function is total on its own.
 *
 * A setItem failure propagates. Swallowing it would let the UI claim a
 * streak that was never written; the page catches and degrades instead.
 */
export function recordCompletion(storage: Storage, key: string): StreakState {
  if (!isDailyKey(key)) {
    throw new Error(`recordCompletion requires a valid daily key, got ${String(key)}`);
  }
  const next = nextStreak(loadStreak(storage), key);
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
