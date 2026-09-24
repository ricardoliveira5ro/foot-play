/**
 * Wordle algorithm for evaluating guesses against a target name.
 * Returns per-letter feedback: 'CORRECT' | 'PRESENT' | 'ABSENT'
 */

export type LetterResult = 'CORRECT' | 'PRESENT' | 'ABSENT';

export interface GuessResult {
  letter: string;
  result: LetterResult;
}

/**
 * Normalize a string for comparison:
 * - lowercase
 * - strip diacritics
 * - remove special characters (spaces, hyphens, apostrophes)
 */
export function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[\s\-']/g, ''); // remove spaces, hyphens, apostrophes
}

/**
 * Return the normalized indices where a word separator (space, hyphen,
 * apostrophe) occurs in the original name. These are positions in the
 * normalized (lowercased, diacritics-stripped, separators-removed) string
 * where a visual gap should be rendered. E.g. "Nico Gaitan" -> [4].
 */
export function getWordBoundaries(name: string): number[] {
  const boundaries: number[] = [];
  let normalizedIndex = 0;
  for (const char of name) {
    if (char === ' ' || char === '-' || char === "'") {
      if (boundaries[boundaries.length - 1] !== normalizedIndex) {
        boundaries.push(normalizedIndex);
      }
    } else if (/[\u0300-\u036f]/.test(char)) {
      continue; // combining diacritic mark — does not advance normalized index
    } else {
      normalizedIndex++;
    }
  }
  return boundaries;
}

/**
 * Mark guess position i as CORRECT.
 * NOTE: mutates the shared tracking arrays (results, targetMatched,
 * guessProcessed) in place.
 */
function markCorrectPass(
  i: number,
  guess: string,
  results: GuessResult[],
  targetMatched: boolean[],
  guessProcessed: boolean[]
): void {
  results[i] = { letter: guess[i], result: 'CORRECT' };
  targetMatched[i] = true;
  guessProcessed[i] = true;
}

/**
 * Mark guess position i as PRESENT against target position foundIndex.
 * NOTE: mutates the shared tracking arrays (results, targetMatched,
 * guessProcessed) in place.
 */
function markPresentPass(
  i: number,
  guess: string,
  foundIndex: number,
  results: GuessResult[],
  targetMatched: boolean[],
  guessProcessed: boolean[]
): void {
  results[i] = { letter: guess[i], result: 'PRESENT' };
  targetMatched[foundIndex] = true;
  guessProcessed[i] = true;
}

/**
 * Mark guess position i as ABSENT.
 * NOTE: mutates the shared results array in place.
 */
function markAbsentPass(i: number, guess: string, results: GuessResult[]): void {
  results[i] = { letter: guess[i], result: 'ABSENT' };
}

/**
 * Find the first unmatched target position holding guessChar, or -1.
 */
function findUnmatchedTargetIndex(
  guessChar: string,
  normalizedTarget: string,
  targetMatched: boolean[]
): number {
  for (let j = 0; j < normalizedTarget.length; j++) {
    if (!targetMatched[j] && normalizedTarget[j] === guessChar) {
      return j;
    }
  }
  return -1;
}

/**
 * Evaluate a guess against a target name using Wordle rules.
 * 
 * Algorithm:
 * 1. Normalize both strings
 * 2. First pass: mark correct positions (green)
 * 3. Second pass: mark present-but-wrong-position (orange), respecting duplicate counts
 * 4. Remaining letters: absent (grey)
 * 
 * Duplicate handling: If a letter appears twice in guess but once in target,
 * only one gets "present". Priority: correct > present left-to-right.
 */
export function evaluateGuess(guess: string, target: string): GuessResult[] {
  const normalizedGuess = normalize(guess);
  const normalizedTarget = normalize(target);
  
  const targetLength = normalizedTarget.length;
  const guessLength = normalizedGuess.length;
  
  // Initialize results array
  const results: GuessResult[] = [];
  
  // Track which target letters have been matched
  const targetMatched = new Array(targetLength).fill(false);
  // Track which guess letters have been processed
  const guessProcessed = new Array(guessLength).fill(false);
  
  // First pass: mark correct positions (green)
  for (let i = 0; i < Math.min(guessLength, targetLength); i++) {
    if (normalizedGuess[i] === normalizedTarget[i]) {
      markCorrectPass(i, guess, results, targetMatched, guessProcessed);
    }
  }
  
  // Second pass: mark present-but-wrong-position (orange)
  for (let i = 0; i < guessLength; i++) {
    if (guessProcessed[i]) continue;
    
    const foundIndex = findUnmatchedTargetIndex(normalizedGuess[i], normalizedTarget, targetMatched);
    
    if (foundIndex !== -1) {
      markPresentPass(i, guess, foundIndex, results, targetMatched, guessProcessed);
    }
  }
  
  // Third pass: remaining letters are absent (grey)
  for (let i = 0; i < guessLength; i++) {
    if (!guessProcessed[i]) {
      markAbsentPass(i, guess, results);
    }
  }
  
  // Handle case where guess is shorter than target (pad with absent)
  // Or longer than target (extra letters are absent)
  while (results.length < targetLength) {
    results.push({ letter: '', result: 'ABSENT' });
  }
  
  return results.slice(0, targetLength);
}

/**
 * Check if a guess is completely correct
 */
export function isCorrectGuess(guess: string, target: string): boolean {
  const results = evaluateGuess(guess, target);
  return results.every(r => r.result === 'CORRECT');
}

/**
 * Get the target name length for input validation
 */
export function getTargetLength(target: string): number {
  return normalize(target).length;
}

/**
 * Extract correct-position letters from guess history.
 * Returns an array of length normalize(target).length with:
 * - The letter (uppercase) if any guess marked that position as 'correct'
 * - null if no guess has correctly identified that position
 */
export function getCorrectLetters(
  guesses: GuessResult[][],
  target: string,
): (string | null)[] {
  const len = getTargetLength(target);
  const result: (string | null)[] = new Array(len).fill(null);

  for (const guess of guesses) {
    for (let i = 0; i < Math.min(guess.length, len); i++) {
      if (guess[i].result === 'CORRECT' && guess[i].letter) {
        result[i] = guess[i].letter.toUpperCase();
      }
    }
  }

  return result;
}

/**
 * Extract correct-position letters from guess history by known length.
 * Same as getCorrectLetters but does not require the target name — used
 * when the frontend only knows the normalized name length (server-side
 * validation).
 */
export function getCorrectLettersByLength(
  guesses: GuessResult[][],
  length: number,
): (string | null)[] {
  const result: (string | null)[] = new Array(length).fill(null);

  for (const guess of guesses) {
    for (let i = 0; i < Math.min(guess.length, length); i++) {
      if (guess[i].result === 'CORRECT' && guess[i].letter) {
        result[i] = guess[i].letter.toUpperCase();
      }
    }
  }

  return result;
}
