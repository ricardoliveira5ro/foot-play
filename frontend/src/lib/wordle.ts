/**
 * Wordle algorithm for evaluating guesses against a target name.
 * Returns per-letter feedback: 'correct' | 'present' | 'absent'
 */

export type LetterResult = 'correct' | 'present' | 'absent';

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
      results[i] = { letter: guess[i], result: 'correct' };
      targetMatched[i] = true;
      guessProcessed[i] = true;
    }
  }
  
  // Second pass: mark present-but-wrong-position (orange)
  for (let i = 0; i < guessLength; i++) {
    if (guessProcessed[i]) continue;
    
    const guessChar = normalizedGuess[i];
    
    // Find first unmatched occurrence in target
    let foundIndex = -1;
    for (let j = 0; j < targetLength; j++) {
      if (!targetMatched[j] && normalizedTarget[j] === guessChar) {
        foundIndex = j;
        break;
      }
    }
    
    if (foundIndex !== -1) {
      results[i] = { letter: guess[i], result: 'present' };
      targetMatched[foundIndex] = true;
      guessProcessed[i] = true;
    }
  }
  
  // Third pass: remaining letters are absent (grey)
  for (let i = 0; i < guessLength; i++) {
    if (!guessProcessed[i]) {
      results[i] = { letter: guess[i], result: 'absent' };
    }
  }
  
  // Handle case where guess is shorter than target (pad with absent)
  // Or longer than target (extra letters are absent)
  while (results.length < targetLength) {
    results.push({ letter: '', result: 'absent' });
  }
  
  return results.slice(0, targetLength);
}

/**
 * Check if a guess is completely correct
 */
export function isCorrectGuess(guess: string, target: string): boolean {
  const results = evaluateGuess(guess, target);
  return results.every(r => r.result === 'correct');
}

/**
 * Get the target name length for input validation
 */
export function getTargetLength(target: string): number {
  return normalize(target).length;
}
