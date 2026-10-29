import { isDailyKey } from '@/lib/daily';

/**
 * Daily-puzzle streak state.
 *
 * Pure arithmetic, no storage, no DOM, no clock. The storage adapter
 * (streakStorage.ts) is the only module that touches browser storage; this
 * module is what it validates and what it persists.
 *
 * TIMEZONE RULE: every key is a UTC calendar day (v1.3.1). daysBetween is
 * integer arithmetic on epoch days, which is exact because UTC has no DST.
 */

export interface StreakState {
  /** Consecutive days played up to and including lastPlayedKey. */
  current: number;
  /** The longest current has ever been. */
  longest: number;
  /** The day key of the most recent completion, or null before the first. */
  lastPlayedKey: string | null;
  /** Every day key ever completed, in completion order. O1 gate. */
  playedKeys: string[];
}

/** The state before anything has been played. Frozen; never mutate it. */
export const EMPTY_STREAK: Readonly<StreakState> = Object.freeze({
  current: 0,
  longest: 0,
  lastPlayedKey: null,
  playedKeys: [],
});

/**
 * Whole days from a to b. Negative when b is before a.
 *
 * No Date.parse: the keys are decomposed with explicit slice and rebuilt
 * through Date.UTC(year, month - 1, day), the same rule isDailyKey froze in
 * v1.3.1. A day is always 86,400,000 ms because UTC has no DST.
 */
export function daysBetween(a: string, b: string): number {
  const aEpoch = Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)));
  const bEpoch = Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10)));
  return (bEpoch - aEpoch) / 86_400_000;
}

/**
 * The state after completing `completedKey`.
 *
 * Idempotent: recording the same day twice returns the input state by
 * reference, which is the O1 "one result per day" guarantee at the
 * arithmetic level. A gap of more than one day resets `current` to 1 but
 * never lowers `longest`. `playedKeys` grows in completion order and never
 * contains a duplicate.
 */
export function nextStreak(state: StreakState, completedKey: string): StreakState {
  if (state.lastPlayedKey === completedKey) return state;
  const current = state.lastPlayedKey === null
    ? 1
    : daysBetween(state.lastPlayedKey, completedKey) === 1
      ? state.current + 1
      : 1;
  const playedKeys = state.playedKeys.includes(completedKey)
    ? state.playedKeys
    : [...state.playedKeys, completedKey];
  return {
    current,
    longest: Math.max(state.longest, current),
    lastPlayedKey: completedKey,
    playedKeys,
  };
}

/** True when todayKey is in playedKeys — the O1 already-played-today gate. */
export function hasPlayed(state: StreakState, todayKey: string): boolean {
  return state.playedKeys.includes(todayKey);
}

/**
 * Shape + invariant validator for a persisted StreakState.
 *
 * Every rule here is a rule loadStreak enforces: a stored value that fails
 * any of these is corrupt and is removed, not repaired. The invariants are
 * the ones nextStreak maintains, so a value that passes this validator is
 * one nextStreak could have produced.
 */
export function isStreakState(value: unknown): value is StreakState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const s = value as Record<string, unknown>;
  if (typeof s.current !== 'number' || !Number.isInteger(s.current) || s.current < 0) return false;
  if (typeof s.longest !== 'number' || !Number.isInteger(s.longest) || s.longest < 0) return false;
  if (s.lastPlayedKey !== null && !isDailyKey(s.lastPlayedKey)) return false;
  if (!Array.isArray(s.playedKeys) || !s.playedKeys.every((k) => isDailyKey(k))) return false;
  if (new Set(s.playedKeys).size !== s.playedKeys.length) return false;
  if (s.longest < s.current) return false;
  if (s.current > s.playedKeys.length) return false;
  if (s.longest > s.playedKeys.length) return false;
  if (s.current === 0 && s.lastPlayedKey !== null) return false;
  if (s.playedKeys.length === 0 && s.lastPlayedKey !== null) return false;
  if (s.playedKeys.length > 0 && s.lastPlayedKey !== s.playedKeys[s.playedKeys.length - 1]) return false;
  return true;
}
