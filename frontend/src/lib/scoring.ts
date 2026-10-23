import type { ShirtGameData } from './gameState';

/** Score for one shirt. */
export interface PerPlayerScore {
  token: string;
  shirtNumber: number | null;
  team: string;
  attempts: number;
  correct: boolean;
  /** Letter-based points (failed shirts only; 0 for correct shirts). */
  letterPoints: number;
  /** Total points for this shirt. */
  totalPoints: number;
  /** Mode multiplier applied to this line. 1 when no mode is in play. */
  multiplier: number;
}

/** Full score breakdown for a game. */
export interface ScoreBreakdown {
  grandTotal: number;
  perPlayer: PerPlayerScore[];
}

const BASE_CORRECT_SCORE = 1000;
const ATTEMPT_PENALTY = 200;
const MIN_CORRECT_SCORE = 100;
const LETTER_SCORE_MAX = 150;

/**
 * Score a single shirt.
 *
 * Correct guess: starts at 1000 and decreases by 200 per attempt beyond the
 * first, with a floor of 100 (1st = 1000, 2nd = 800, ..., 6th+ = 100).
 *
 * Failed guess: partial credit — ratio of unique correct letters to total
 * letters in the name, multiplied by 150 and rounded to the nearest whole
 * number. Zero letters found earns 0; all letters found earns 150. Guards
 * against division by zero when the name has no letters (returns 0).
 *
 * The `multiplier` scales BOTH branches — a correct guess and a failed one
 * are worth the same factor more or less. It defaults to 1, so callers that
 * do not care about difficulty modes keep the unmultiplied scores.
 */
export function scorePlayer(
  attempts: number,
  correct: boolean,
  uniqueCorrectLetters: number,
  totalLetters: number,
  multiplier: number = 1,
): number {
  if (correct) {
    // The floor is part of the BASE, not of the result: a shirt that has
    // bottomed out at 100 is worth 50 in Easy and 300 in Expert. Applying
    // the floor after scaling would flatten the bottom of the range and
    // make the multiplier invisible exactly where it matters.
    const base = Math.max(
      BASE_CORRECT_SCORE - (Math.max(attempts, 1) - 1) * ATTEMPT_PENALTY,
      MIN_CORRECT_SCORE,
    );
    return Math.round(base * multiplier);
  }

  if (totalLetters === 0) return 0;
  // `uniqueCorrectLetters` is the count of DISTINCT correct letters, so a
  // letter guessed correctly in three attempts is still worth one. The
  // multiplier scales the credit; it does not change what counts.
  return Math.round((uniqueCorrectLetters / totalLetters) * LETTER_SCORE_MAX * multiplier);
}

/**
 * Compute the full score breakdown for a game.
 *
 * Processes both shirt arrays into per-player scores and sums everything
 * into the grand total. The `multiplier` (the difficulty mode's scoring
 * factor) is applied to every line and defaults to 1.
 */
export function computeTotalScore(
  targetShirts: ShirtGameData[],
  opponentShirts: ShirtGameData[],
  targetTeamName: string,
  opponentTeamName: string,
  multiplier: number = 1,
): ScoreBreakdown {
  const processTeam = (shirts: ShirtGameData[], team: string): PerPlayerScore[] =>
    shirts.map(shirt => {
      const correct = shirt.state === 'correct';
      const letterPoints = correct
        ? 0
        : scorePlayer(shirt.attempts, false, shirt.correctLetters.length, shirt.nameLength, multiplier);
      const totalPoints = correct
        ? scorePlayer(shirt.attempts, true, 0, 0, multiplier)
        : letterPoints;

      return {
        token: shirt.token,
        shirtNumber: shirt.shirtNumber,
        team,
        attempts: shirt.attempts,
        correct,
        letterPoints,
        totalPoints,
        multiplier,
      };
    });

  const targetScores = processTeam(targetShirts, targetTeamName);
  const opponentScores = processTeam(opponentShirts, opponentTeamName);
  const perPlayer = [...targetScores, ...opponentScores];

  // The lines are already scaled, so the total is a plain sum — scaling it
  // again would apply the multiplier twice.
  const playerPoints = perPlayer.reduce((sum, p) => sum + p.totalPoints, 0);

  return {
    grandTotal: playerPoints,
    perPlayer,
  };
}

/**
 * Render a scoring multiplier for display: 2 -> "2", 0.5 -> "0.5".
 * Shared by the grand-total badge and the per-line badge so the two never
 * format the same number differently.
 */
export function formatMultiplier(multiplier: number): string {
  return String(Number(multiplier.toFixed(2)));
}
