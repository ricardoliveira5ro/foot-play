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
 * Badges for one shirt, ordered: 'scorer' before 'sent-off'.
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

  if (input.goals > 0) badges.push('scorer');
  if (input.redCards > 0) badges.push('sent-off');

  return badges;
}
