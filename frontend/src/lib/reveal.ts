import type { RevealPlayer } from '../../types';
import type { ShirtGameData } from './gameState';

/** One shirt that a revealed name should be written to. */
export interface RevealMatch {
  token: string;
  name: string;
}

/**
 * Pair each revealed player with the shirt that actually holds him.
 *
 * The join key is the opaque per-game `token`, which is unique by
 * construction. It is NOT `shirtNumber`: `Appearance.number` is `Int?`
 * (backend/prisma/schema.prisma:70) and `getRevealAppearances` orders with
 * `nulls: 'last'`, so players without a number are an expected state. Two of
 * them in one game collide on `===` and the second name overwrites the
 * first, leaving the other shirt blank.
 *
 * Pure: the input shirts are never mutated. The caller dispatches the
 * result, so this function has no knowledge of the reducer.
 *
 * Order-independent: the result is emitted in shirt order, not player order,
 * so the order of the reveal array cannot change the output.
 */
export function revealMatches(
  players: RevealPlayer[],
  shirts: ShirtGameData[],
): RevealMatch[] {
  const matches: RevealMatch[] = [];
  for (const shirt of shirts) {
    if (shirt.state === 'correct') continue;
    const player = players.find((p) => p.token === shirt.token);
    if (player) matches.push({ token: shirt.token, name: player.name });
  }
  return matches;
}
