/**
 * Deterministic daily-puzzle primitives.
 *
 * TIMEZONE RULE: the day key is the UTC calendar date and the rollover is
 * 00:00:00 UTC. See docs/v1/v1.3/plan-v1.3.1-daily-puzzle.md for why a
 * local-timezone key would make the puzzle unshareable. This matches
 * backend/src/services/matchService.ts:56, which also derives a day key with
 * toISOString().slice(0, 10). Note the deliberate difference from
 * frontend/src/components/GameComplete.tsx:26, which parses
 * `${date}T00:00:00` as LOCAL time — that is display formatting, not key
 * derivation, and the two must not be confused.
 *
 * Everything in this module is pure. There is no Math.random and no
 * Date.now() in this file, and a test asserts the selection is stable across
 * repeated calls.
 */

/** Canonical day key for "today" in the project's agreed timezone. */
export type DailyKey = string; // 'YYYY-MM-DD'

const DAILY_KEY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** UTC calendar date of an instant, as 'YYYY-MM-DD'. */
export function toDailyKey(date: Date): DailyKey {
  return date.toISOString().slice(0, 10);
}

/**
 * True when `value` is a real calendar date in 'YYYY-MM-DD' form.
 *
 * The round-trip is what makes this total. A regex alone accepts
 * '2026-02-30' and '2025-02-29'; decomposing the components through
 * Date.UTC and re-serialising proves the date exists. The `year < 1000`
 * guard covers the other Date.UTC quirk: years 0-99 are remapped into the
 * 1900s, so '0099-01-01' would otherwise silently validate as '1999-01-01'.
 */
export function isDailyKey(value: unknown): value is DailyKey {
  if (typeof value !== 'string' || !DAILY_KEY_SHAPE.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1000) return false;
  return toDailyKey(new Date(Date.UTC(year, month - 1, day))) === value;
}

/**
 * FNV-1a, 32-bit, returned unsigned.
 *
 * Deliberately trivial: a short, well-known, stable hash whose output is
 * quoted verbatim in the fixture tables of both test suites, so a drift in
 * either copy is caught by a failing number rather than by a reviewer
 * noticing a changed puzzle.
 */
export function dailyHash32(key: string): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * The daily game for a day key: a pure function of the candidate id set and
 * the key. Order-independent, so the caller does not need ORDER BY and the
 * server and the client cannot disagree because of row order.
 *
 * Throws on an empty candidate set. "There is no puzzle" is not a number,
 * and the caller — the daily service — maps the throw to a 404, which is
 * the honest response to an unseeded database.
 */
export function selectDailyGameId(candidates: number[], key: DailyKey): number {
  if (candidates.length === 0) {
    throw new Error('selectDailyGameId requires at least one candidate game id');
  }
  const ordered = [...candidates].sort((a, b) => a - b);
  return ordered[dailyHash32(key) % ordered.length];
}

/**
 * §6.1: today's puzzle only. Miss a day and the streak resets — there is no
 * catch-up and no playing yesterday. A shared link to a past day is not
 * playable and is never silently swapped for a different puzzle.
 */
export function isPlayableDaily(requested: DailyKey | null, today: DailyKey): boolean {
  return requested !== null && requested === today;
}

/**
 * Milliseconds from `now` until the next UTC midnight — the real scarcity
 * behind the daily card's countdown. Date.UTC normalises the day overflow
 * (month end, leap day, year end), so no calendar arithmetic is duplicated
 * here.
 */
export function msUntilNextUtcMidnight(now: Date): number {
  const nextMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.max(0, nextMidnight - now.getTime());
}

/**
 * 'HH:MM:SS' for a countdown. Rounds up so the display reaches 00:00:00 at
 * the rollover rather than one second early. Never negative.
 */
export function formatUtcCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}
