/**
 * Pure mapping from game_events.csv vocabulary to a single event type.
 *
 * No database, no I/O, no Prisma — every function here is a plain
 * string-in/type-out so the vocabulary can be frozen by unit tests alone.
 *
 * R2 (roadmap §3.3): the source `description` column is free text whose
 * variants differ in *spacing*, not in substance. Every comparison is made
 * against the normalized form, so `Red card`, `Red  card` and `  RED CARD `
 * are one value. Do not add a comparison anywhere in this file that skips
 * normalizeDescription().
 *
 * The measured `type` column is plural and capitalised. Two traps this file
 * must never reintroduce: `includes('red')` matches ", Scored" (Sco-RED), and
 * `includes('2.')` matches tournament goal numbering. Both are anchored or
 * type-gated below, and both have a regression test.
 */

/** Ordered event-type enum derived from the source CSV's type/description columns. */
export type ParsedEventType =
  | 'goal'
  | 'own_goal'
  | 'penalty'
  | 'shootout_goal'
  | 'yellow_card'
  | 'second_yellow'
  | 'red_card'
  | 'substitution'
  | 'other';

/** One raw row of game_events.csv, as read by the seed. */
export interface EventCsvRow {
  game_id: string;
  player_id: string;
  type: string;
  description: string;
  minute?: string;
  /** The assister's id on a goal row. Drives A1; absent means "no assist". */
  player_assist_id?: string;
}

/**
 * Collapse whitespace runs and trim, so CSV spacing variants compare equal.
 */
export function normalizeDescription(description: string): string {
  return description.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Every sending-off description string measured in game_events.csv.
 *
 * GENERATED — do not hand-edit. Regenerate with:
 *   npm run data-pipeline && npm run measure-events -w backend -- --apply
 * The two sentinels below are the write region; the tool replaces only what
 * is between them, and refuses to run if either one is missing.
 *
 * Both direct reds and second-yellow dismissals live here: they are
 * *dismissals*, and a matcher that only recognises the literal `Red card`
 * silently drops every second yellow. Measured: 9,897 direct reds across 14
 * distinct descriptions and 9,742 second yellows across 19 — 33 total.
 */
// --- BEGIN MEASURED ---
export const MEASURED_SENDING_OFF_DESCRIPTIONS: string[] = [
  "Red card",
  "Red card  , Abuse",
  "Red card  , Dissent",
  "Red card  , Foul",
  "Red card  , Handball",
  "Red card  , Mass confrontation",
  "Red card  , Professional foul",
  "Red card  , Repeated Foul",
  "Red card  , Serious foul",
  "Red card  , Tactical foul",
  "Red card  , Taking of shirt",
  "Red card  , Time wasting",
  "Red card  , Unsporting behaviour",
  "Red card  , Violent conduct",
  "Second yellow",
  "Second yellow  , Abuse",
  "Second yellow  , Climbing fence",
  "Second yellow  , Dissent",
  "Second yellow  , Diving",
  "Second yellow  , Foul",
  "Second yellow  , Handball",
  "Second yellow  , Mass confrontation",
  "Second yellow  , Professional foul",
  "Second yellow  , Repeated Foul",
  "Second yellow  , Serious foul",
  "Second yellow  , Shooting ball",
  "Second yellow  , Tactical foul",
  "Second yellow  , Taking of shirt",
  "Second yellow  , Taking off shirt",
  "Second yellow  , Time wasting",
  "Second yellow  , Unsporting behaviour",
  "Second yellow  , Violent conduct",
  "Second yellow  , Wall distance",
];
  // --- END MEASURED ---

/** Normalized forms, so every lookup in this file compares normalized keys. */
const SENDING_OFF = new Set(
  MEASURED_SENDING_OFF_DESCRIPTIONS.map((description) => normalizeDescription(description)),
);

/** True when the normalized description denotes a sending-off (direct red OR second yellow). */
export function isSendingOffDescription(description: string): boolean {
  return SENDING_OFF.has(normalizeDescription(description));
}

/** True when the normalized description denotes a penalty-shootout goal (excluded per O3). */
export function isShootoutDescription(description: string): boolean {
  return normalizeDescription(description).includes('shootout');
}

/** True when the normalized description denotes an own goal (O5: recognized, not counted). */
export function isOwnGoalDescription(description: string): boolean {
  const normalized = normalizeDescription(description);
  // The hyphen is the spelling the file actually uses (", Own-goal"); the
  // spaced and underscored variants are kept so a future dump that changes
  // punctuation is still matched.
  return (
    normalized.includes('own-goal') ||
    normalized.includes('own goal') ||
    normalized.includes('own_goal')
  );
}

/**
 * A dismissal that came from a second yellow. Order matters: the sending-off
 * set is checked first, so this only ever runs on a measured dismissal.
 *
 * Anchored, because a bare `includes('2.')` also matches tournament goal
 * numbering (", 2. Goal of the Season …"), which is not a dismissal.
 */
function isSecondYellowDescription(description: string): boolean {
  return /^second yellow\b/.test(normalizeDescription(description));
}

/**
 * A goal converted from a penalty.
 *
 * Anchored to the leading `", penalty"` slot: every non-Cards description is
 * prefixed with `", "`, and a goal's *assist reason* may also mention a
 * penalty ("… Assist: , Penalty: Fouled player"), which is not a penalty goal.
 *
 * `normalizedDescription` is the caller's already-normalized form, as
 * classifyEvent produces it. Named explicitly so a future caller passing a
 * raw description gets a type error rather than silently case-sensitive
 * matching — this file's header rule is that every comparison normalizes.
 *
 * The `type === 'penalty'` disjunct is defensive tolerance for the retired
 * singular token, not a real vocabulary: the measurement proves penalty goals
 * arrive as `type = Goals` with a leading ", Penalty". It is safe because the
 * failure direction for an unknown token is `'other'`, not a wrong count.
 */
const PENALTY_GOAL = /^,\s*penalty\b/;

function isPenaltyGoal(type: string, normalizedDescription: string): boolean {
  return type === 'penalty' || PENALTY_GOAL.test(normalizedDescription);
}

/**
 * Classify one event row.
 *
 * The measured `type` column is plural and capitalised — exactly
 * `Cards` | `Goals` | `Substitutions` | `Shootout` — so every comparison is
 * made against the normalized (lower-cased) form. `description` carries the
 * detail but is NOT a reliable type signal: no description contains the word
 * "shootout", "substituted" is never written out, and "2." is card numbering.
 *
 * Where the measured data gives no answer the row becomes 'other', which no
 * column is incremented for — the seed's failure direction is absent, never
 * wrong.
 */
export function classifyEvent(row: EventCsvRow): ParsedEventType {
  const type = normalizeDescription(row.type);
  const description = normalizeDescription(row.description);

  if (isSendingOffDescription(description)) {
    return isSecondYellowDescription(description) ? 'second_yellow' : 'red_card';
  }
  if (type === 'own_goal' || isOwnGoalDescription(description)) return 'own_goal';
  // O3 keys off the type: no measured description contains "shootout".
  if (type === 'shootout' || isShootoutDescription(description)) return 'shootout_goal';
  if (type === 'cards') return description.includes('yellow') ? 'yellow_card' : 'red_card';
  if (type === 'substitutions' || description.includes('substituted')) return 'substitution';
  if (isPenaltyGoal(type, description)) return 'penalty';
  if (type === 'goals' || type === 'goal') return 'goal';
  return 'other';
}
