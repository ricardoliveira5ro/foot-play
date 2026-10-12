/**
 * Which badges a shirt renders (v1.0.3).
 *
 * Pure and React-free on purpose: v1.2's Easy and Normal modes read this to
 * decide whether the scorers clue is available, without importing the Shirt
 * component or duplicating the rule.
 *
 * §3.1 graceful degradation. The database columns default to 0 and there is
 * no null, no unknown and no provenance flag, so "this game has no event
 * data" and "this player did not score" are the same value. Degradation is
 * therefore per GAME and uniform across all 22 shirts: a game seeded before
 * v1.0.1 returns [] for every shirt, and that is the correct answer, not a
 * bug. Do not add an availability flag here — the UI cannot ask.
 */
export type ShirtBadge = 'scorer' | 'sent-off';

/**
 * Badges for one shirt, ordered: one 'scorer' per goal before 'sent-off'.
 *
 * Always [] for a game with no event data — the per-game degradation rule.
 *
 * Note the asymmetry carried from v1.0.1: the scorer badge is a scored clue
 * in Easy and Normal, while the send-off badge is decoration in every mode
 * (O5). This function cannot tell them apart beyond their name, and must
 * not be used to decide either.
 */
export function badgesForShirt(input: { goals: number; redCards: number }): ShirtBadge[] {
  const badges: ShirtBadge[] = [];

  for (let goal = 0; goal < input.goals; goal += 1) badges.push('scorer');
  if (input.redCards > 0) badges.push('sent-off');

  return badges;
}

import { DIFFICULTY_CONFIG, type Difficulty } from './difficulty';

export type ShirtClue = 'first-letter' | 'scorers' | 'captain' | 'shirt-number';

/** The subset of an appearance row that can carry a clue. */
export interface ClueShirt {
  goals: number;
  /** Accepted for structural symmetry with the appearance row. Never a clue:
   *  the send-off icon is decoration in every mode (§5.1, O5). */
  redCards: number;
  isCaptain: boolean;
  hasFirstLetter: boolean;
}

/** Fixed display order. The caller may sort, but the policy returns this. */
const CLUE_ORDER: readonly ShirtClue[] = ['first-letter', 'scorers', 'captain', 'shirt-number'];

/**
 * The clues a shirt actually shows, in a given mode.
 *
 * The mode's flags say which clues are *permitted*; the shirt's data says
 * which *exist*. Intersecting the two is what makes degradation automatic:
 * a game with no event rows yields fewer clues instead of an error, and the
 * 227 captain-less games (§5.5) yield no captain clue rather than a broken
 * one.
 *
 * `shirt-number` is the odd one out: it is config-only, because this input
 * deliberately carries no `shirtNumber`. In `hard` and `expert` it is still
 * returned — those modes *hide* the number (§5.1), they do not remove it
 * from the data, and v1.2.3 masks it at render time. So its presence here
 * means "this shirt has a number to show or mask", never "show the number".
 */
export function availableClues(mode: Difficulty, shirt: ClueShirt): ShirtClue[] {
  const config = DIFFICULTY_CONFIG[mode];
  const present: Record<ShirtClue, boolean> = {
    'first-letter': shirt.hasFirstLetter,
    scorers: shirt.goals > 0,
    captain: shirt.isCaptain === true,
    'shirt-number': true,
  };
  const permitted: Record<ShirtClue, boolean> = {
    'first-letter': config.showFirstLetter,
    scorers: config.showScorersClue,
    captain: config.showCaptainClue,
    'shirt-number': config.showShirtNumber || !config.showShirtNumber,
  };
  return CLUE_ORDER.filter((clue) => permitted[clue] && present[clue]);
}
