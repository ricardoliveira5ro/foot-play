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
 */
export function scorePlayer(
  attempts: number,
  correct: boolean,
  uniqueCorrectLetters: number,
  totalLetters: number,
): number {
  if (correct) {
    return Math.max(BASE_CORRECT_SCORE - (Math.max(attempts, 1) - 1) * ATTEMPT_PENALTY, MIN_CORRECT_SCORE);
  }

  if (totalLetters === 0) return 0;
  return Math.round((uniqueCorrectLetters / totalLetters) * LETTER_SCORE_MAX);
}

/**
 * Compute the full score breakdown for a game.
 *
 * Processes both shirt arrays into per-player scores and sums everything
 * into the grand total.
 */
export function computeTotalScore(
  targetShirts: ShirtGameData[],
  opponentShirts: ShirtGameData[],
  targetTeamName: string,
  opponentTeamName: string,
): ScoreBreakdown {
  const processTeam = (shirts: ShirtGameData[], team: string): PerPlayerScore[] =>
    shirts.map(shirt => {
      const correct = shirt.state === 'correct';
      const letterPoints = correct
        ? 0
        : scorePlayer(shirt.attempts, false, shirt.correctLetters.length, shirt.nameLength);
      const totalPoints = correct
        ? scorePlayer(shirt.attempts, true, 0, 0)
        : letterPoints;

      return {
        token: shirt.token,
        shirtNumber: shirt.shirtNumber,
        team,
        attempts: shirt.attempts,
        correct,
        letterPoints,
        totalPoints,
      };
    });

  const targetScores = processTeam(targetShirts, targetTeamName);
  const opponentScores = processTeam(opponentShirts, opponentTeamName);
  const perPlayer = [...targetScores, ...opponentScores];

  const playerPoints = perPlayer.reduce((sum, p) => sum + p.totalPoints, 0);

  return {
    grandTotal: playerPoints,
    perPlayer,
  };
}
