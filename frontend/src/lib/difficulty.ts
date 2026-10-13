/**
 * The v1.2 mode table (roadmap §5.1), written once.
 *
 * Every other decision in the v1.2 patches reads this table: the attempt
 * budget, the clue set, the shirt-number mask, the opponent requirement and
 * the scoring multiplier. Adding a mode means adding a row here and nothing
 * else until its own patch lands.
 */

export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';

export interface DifficultyConfig {
  /** Guesses allowed per shirt. */
  attempts: number;
  /** Applied per shirt to both sides of the score (§5.3, v1.2.5). */
  multiplier: number;
  showShirtNumber: boolean;
  showFirstLetter: boolean;
  showScorersClue: boolean;
  showCaptainClue: boolean;
  /** Expert must resolve all 22 shirts before Finish is available (§5.2). */
  opponentRequired: boolean;
  /** Display name in the selector. */
  label: string;
}

export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: {
    attempts: 6, multiplier: 0.5, showShirtNumber: true,
    showFirstLetter: true, showScorersClue: true, showCaptainClue: true,
    opponentRequired: false, label: 'Easy',
  },
  normal: {
    attempts: 6, multiplier: 1, showShirtNumber: true,
    showFirstLetter: false, showScorersClue: true, showCaptainClue: true,
    opponentRequired: false, label: 'Normal',
  },
  hard: {
    attempts: 6, multiplier: 2, showShirtNumber: false,
    showFirstLetter: false, showScorersClue: false, showCaptainClue: false,
    opponentRequired: false, label: 'Hard',
  },
  expert: {
    attempts: 3, multiplier: 3, showShirtNumber: false,
    showFirstLetter: false, showScorersClue: false, showCaptainClue: false,
    opponentRequired: true, label: 'Expert',
  },
};

/**
 * Modes offered in the UI, in ascending order. A mode is offered only once
 * the patch implementing its rules has shipped: v1.2.2 offers Easy and
 * Normal, v1.2.3 appends Hard, and v1.2.4 appends Expert.
 */
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard', 'expert'];

export const DEFAULT_DIFFICULTY: Difficulty = 'normal';
