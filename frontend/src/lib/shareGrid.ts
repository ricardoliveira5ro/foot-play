import { DIFFICULTY_CONFIG, type Difficulty } from './difficulty';
import { compareShirtPosition } from './positionOrder';
import type { ShirtGameData } from './gameState';

/**
 * The two states a share slot can be in.
 *
 * Deliberately not four. `ShirtState` has four members, but a share block
 * describes a *finished* result, and a shirt that is merely unsolved is not a
 * third kind of outcome — it is the same "did not get solved" as a shirt the
 * player ran out of attempts on. See the glyph decision in the plan's Global
 * Constraints: 🟩 correct, ⬛ everything else.
 */
export type SlotOutcome = 'correct' | 'failed';

/** One shirt's worth of the block. `team` says which half the slot belongs to. */
export interface ShareSlot {
  team: 'target' | 'opponent';
  state: SlotOutcome;
  shirtNumber: number | null;
}

/**
 * What a completed game hands the renderer. `opponentAttempted` is a
 * statement about play, not about mode: it is true when the player actually
 * guessed against the opponent half, which is what brings that half into
 * scope. It is the ONLY scope input — see `buildShareGrid`.
 */
export interface ShareGridInput {
  targetShirts: ShirtGameData[];
  opponentShirts: ShirtGameData[];
  difficulty: Difficulty;
  opponentAttempted: boolean;
  score: number;
}

/** A built, render-ready block. `slots` is target half then opponent half. */
export interface ShareGrid {
  slots: ShareSlot[];
  score: number;
  difficulty: Difficulty;
}

/**
 * Builds the block for a completed result.
 *
 * Scope: the target half always; the opponent half when the player attempted
 * it, and only then. Scope is a question about PLAY, not about mode, so
 * `DIFFICULTY_CONFIG.opponentRequired` is deliberately not read here (§7, RD4).
 * A required opponent was necessarily attempted, so for a finished game the
 * flag would give the same answer; but a *surrendered* Expert game with an
 * untouched opponent half is an 11-slot result (RD2), and the flag would claim
 * 22. Reading the mode answers the wrong question.
 *
 * Count: one slot per shirt in scope, whatever that number is. The 11 and 22
 * in the plan's case table are what the real call sites produce; this function
 * does not pad, truncate, or target them. A slot is never omitted — a shirt
 * in scope with no resolution still gets a slot (§7).
 *
 * Order: by shared position rank, target half before opponent half, so the
 * block reads in the same order as the game-over table above it.
 */
export function buildShareGrid(input: ShareGridInput): ShareGrid {
  const { targetShirts, opponentShirts, difficulty, opponentAttempted, score } = input;
  const opponentInScope = opponentAttempted;

  const toSlots = (shirts: ShirtGameData[], team: 'target' | 'opponent'): ShareSlot[] =>
    // Copy before sorting: the caller's array is game state and must not be
    // reordered underneath the game-over list.
    [...shirts].sort(compareShirtPosition).map((shirt) => ({
      team,
      // 'correct' is the only claim this makes. 'failed', 'default' and
      // 'in-progress' are all "not solved", and a non-terminal shirt renders
      // rather than throwing or being dropped (§7).
      state: shirt.state === 'correct' ? 'correct' : 'failed',
      shirtNumber: shirt.shirtNumber,
    }));

  return {
    slots: [...toSlots(targetShirts, 'target'), ...(opponentInScope ? toSlots(opponentShirts, 'opponent') : [])],
    score,
    difficulty,
  };
}

/** Correct shirt. The only slot that reads as solved. */
const GLYPH: Record<SlotOutcome, string> = {
  correct: '🟩', // U+1F7E9
  failed: '⬛',  // U+2B1B
};

/** One emoji line per half that is in scope, then the tally line. */
export function renderShareGrid(grid: ShareGrid): string {
  // Group by team rather than by position in `slots`, so the row order is a
  // property of this function and does not depend on how the grid was built.
  const rows = (['target', 'opponent'] as const)
    .map((team) => grid.slots.filter((slot) => slot.team === team))
    .filter((slots) => slots.length > 0)
    .map((slots) => slots.map((slot) => GLYPH[slot.state]).join(''));

  const { label, multiplier } = DIFFICULTY_CONFIG[grid.difficulty];
  // The score is the raw integer. The dialog localises its own display total,
  // but "1,234" in a monospace block is three characters wider than "1234" and
  // misaligns the tally line.
  rows.push(`${label} ×${multiplier} · ${grid.score}`);

  return rows.join('\n');
}

/**
 * The full share payload: title, block, and a link when one is supplied.
 * v1.4.2 copies this string verbatim, so an empty or absent link must not
 * leave a blank trailing line for the recipient to trip over.
 */
export function renderShareText(grid: ShareGrid, link: string | null): string {
  const lines = ['Missing Eleven', renderShareGrid(grid)];
  if (link !== null && link !== '') lines.push(link);
  return lines.join('\n');
}
