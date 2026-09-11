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

/** One earned match bonus. */
export interface BonusLine {
  name: string;
  points: number;
  description: string;
}

/** Full score breakdown for a game. */
export interface ScoreBreakdown {
  grandTotal: number;
  perPlayer: PerPlayerScore[];
  bonuses: BonusLine[];
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
 * Compute earned match bonuses.
 *
 * - Full House: every shirt resolved (correct or failed) → +500
 * - Clean Sweep: every shirt correct → +2000
 * - One-Try Wonders: 10+ shirts guessed correctly on the first try → +1000
 *
 * Bonuses stack. Each carries a name, points, and a short description.
 */
export function computeBonuses(
  totalShirts: number,
  correctCount: number,
  failedCount: number,
  firstTryCount: number,
): BonusLine[] {
  const bonuses: BonusLine[] = [];

  if (totalShirts > 0 && correctCount + failedCount === totalShirts) {
    bonuses.push({ name: 'Full House', points: 500, description: 'Every shirt resolved' });
  }

  if (totalShirts > 0 && correctCount === totalShirts) {
    bonuses.push({ name: 'Clean Sweep', points: 2000, description: 'Every shirt correct' });
  }

  if (firstTryCount >= 10) {
    bonuses.push({ name: 'One-Try Wonders', points: 1000, description: '10+ shirts guessed on the first try' });
  }

  return bonuses;
}

/**
 * Compute the full score breakdown for a game.
 *
 * Processes both shirt arrays into per-player scores, counts correct/failed/
 * first-try shirts across both arrays, computes bonuses, and sums everything
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

  const allShirts = [...targetShirts, ...opponentShirts];
  const correctCount = allShirts.filter(s => s.state === 'correct').length;
  const failedCount = allShirts.filter(s => s.state === 'failed').length;
  const firstTryCount = allShirts.filter(s => s.state === 'correct' && s.attempts === 1).length;

  const bonuses = computeBonuses(allShirts.length, correctCount, failedCount, firstTryCount);

  const playerPoints = perPlayer.reduce((sum, p) => sum + p.totalPoints, 0);
  const bonusPoints = bonuses.reduce((sum, b) => sum + b.points, 0);

  return {
    grandTotal: playerPoints + bonusPoints,
    perPlayer,
    bonuses,
  };
}
