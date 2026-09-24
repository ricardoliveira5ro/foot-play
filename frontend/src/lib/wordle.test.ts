/**
 * Test cases for the Wordle algorithm
 */

import { describe, it, expect } from 'vitest';
import { evaluateGuess, isCorrectGuess, getTargetLength, normalize, getCorrectLetters, getWordBoundaries } from './wordle';

describe('normalize', () => {
  it('lowercases uppercase input', () => {
    expect(normalize('MESSI')).toBe('messi');
  });

  it('lowercases mixed case input', () => {
    expect(normalize('Messi')).toBe('messi');
  });

  it('strips diacritics', () => {
    expect(normalize('Pelé')).toBe('pele');
  });

  it('removes spaces', () => {
    expect(normalize('Van Dijk')).toBe('vandijk');
  });

  it("removes apostrophes", () => {
    expect(normalize("O'Brien")).toBe('obrien');
  });

  it('removes hyphens', () => {
    expect(normalize('San-Jose')).toBe('sanjose');
  });
});

describe('getTargetLength', () => {
  it('returns length for a simple name', () => {
    expect(getTargetLength('Messi')).toBe(5);
  });

  it('returns length for a name with diacritics', () => {
    expect(getTargetLength('Pelé')).toBe(4);
  });

  it('returns length for a name with spaces', () => {
    expect(getTargetLength('Van Dijk')).toBe(7);
  });

  it("returns length for a name with an apostrophe", () => {
    expect(getTargetLength("O'Brien")).toBe(6);
  });
});

describe('evaluateGuess (spec cases)', () => {
  it('marks all letters correct for an exact match', () => {
    expect(evaluateGuess('MESSI', 'Messi').map(r => r.result)).toEqual([
      'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT',
    ]);
  });

  it('handles duplicate E correctly (MEESI vs Messi)', () => {
    // Note: The 4th letter (index 3) of both "meesi" and "messi" is 's', so it's correct, not present
    expect(evaluateGuess('MEESI', 'Messi').map(r => r.result)).toEqual([
      'CORRECT', 'CORRECT', 'ABSENT', 'CORRECT', 'CORRECT',
    ]);
  });

  it('handles duplicate M correctly (MMMMM vs Messi)', () => {
    expect(evaluateGuess('MMMMM', 'Messi').map(r => r.result)).toEqual([
      'CORRECT', 'ABSENT', 'ABSENT', 'ABSENT', 'ABSENT',
    ]);
  });

  it('is case insensitive (ronaldo vs Ronaldo)', () => {
    expect(evaluateGuess('ronaldo', 'Ronaldo').map(r => r.result)).toEqual([
      'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT',
    ]);
  });

  it('marks all absent for a completely different name', () => {
    expect(evaluateGuess('messi', 'Ronaldo').map(r => r.result)).toEqual([
      'ABSENT', 'ABSENT', 'ABSENT', 'ABSENT', 'ABSENT', 'ABSENT', 'ABSENT',
    ]);
  });
});

describe('evaluateGuess (diacritics)', () => {
  it('handles diacritics (Pele vs Pelé)', () => {
    expect(evaluateGuess('Pele', 'Pelé').map(r => r.result)).toEqual([
      'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT',
    ]);
  });
});

describe('evaluateGuess (spaces/hyphens)', () => {
  it('handles spaces (van dijk vs Van Dijk)', () => {
    expect(evaluateGuess('van dijk', 'Van Dijk').map(r => r.result)).toEqual([
      'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT',
    ]);
  });
});

describe('evaluateGuess (additional edge cases)', () => {
  it('pads a short guess to the target length', () => {
    const shortResult = evaluateGuess('Ron', 'Ronaldo');
    expect(shortResult.length).toBe(7);
    expect(shortResult[0].result).toBe('CORRECT');
    expect(shortResult[1].result).toBe('CORRECT');
    expect(shortResult[2].result).toBe('CORRECT');
  });

  it('truncates a long guess to the target length', () => {
    const longResult = evaluateGuess('Ronaldinho', 'Ronaldo');
    expect(longResult.length).toBe(7);
  });

  it('handles classic Wordle duplicate case (ALARM vs APPLE)', () => {
    const appleAlarm = evaluateGuess('ALARM', 'APPLE');
    expect(appleAlarm[0].result).toBe('CORRECT');
    expect(appleAlarm[1].result).toBe('PRESENT');
    expect(appleAlarm[2].result).toBe('ABSENT');
    expect(appleAlarm[3].result).toBe('ABSENT');
    expect(appleAlarm[4].result).toBe('ABSENT');
  });

  it('handles classic Wordle duplicate case (SPARE vs SPEAR)', () => {
    const spearSpare = evaluateGuess('SPARE', 'SPEAR');
    expect(spearSpare[0].result).toBe('CORRECT');
    expect(spearSpare[1].result).toBe('CORRECT');
    expect(spearSpare[2].result).toBe('PRESENT');
    expect(spearSpare[3].result).toBe('PRESENT');
    expect(spearSpare[4].result).toBe('PRESENT');
  });

  it('marks all correct for an exact match (BANANA vs BANANA)', () => {
    expect(evaluateGuess('BANANA', 'BANANA').map(r => r.result)).toEqual([
      'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT',
    ]);
  });

  it('handles a rearranged duplicate-heavy guess (ANANAB vs BANANA)', () => {
    // Every letter exists in the target, so every letter is PRESENT.
    const bananaTest = evaluateGuess('ANANAB', 'BANANA');
    expect(bananaTest.map(r => r.result)).toEqual([
      'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT',
    ]);
  });
});

describe('evaluateGuess (casing lock)', () => {
  it('preserves the original guess casing in the letter field', () => {
    // Frontend intentionally preserves the guess casing; the backend uppercases.
    expect(evaluateGuess('messi', 'Messi')[0].letter).toBe('m');
  });
});

describe('isCorrectGuess', () => {
  it('returns true for an exact match', () => {
    expect(isCorrectGuess('Messi', 'Messi')).toBe(true);
  });

  it('returns true for a case-insensitive match', () => {
    expect(isCorrectGuess('messi', 'Messi')).toBe(true);
  });

  it('returns true when only diacritics differ', () => {
    expect(isCorrectGuess('Pele', 'Pelé')).toBe(true);
  });

  it('returns false for different names', () => {
    expect(isCorrectGuess('Messi', 'Ronaldo')).toBe(false);
  });

  it('returns false for a too-short guess', () => {
    expect(isCorrectGuess('Mess', 'Messi')).toBe(false);
  });
});

describe('getCorrectLetters', () => {
  it('returns all null with no guesses', () => {
    expect(getCorrectLetters([], 'RAFAEL')).toEqual([null, null, null, null, null, null]);
  });

  it('returns all null for a wrong guess', () => {
    const wrongGuess1 = evaluateGuess('ALEXIS', 'RAFAEL');
    expect(getCorrectLetters([wrongGuess1], 'RAFAEL')).toEqual([null, null, null, null, null, null]);
  });

  it('fills all positions for a correct guess', () => {
    const correctGuess = evaluateGuess('RAFAEL', 'RAFAEL');
    expect(getCorrectLetters([correctGuess], 'RAFAEL')).toEqual(['R', 'A', 'F', 'A', 'E', 'L']);
  });

  it('fills only correct positions for a partial guess', () => {
    const partialGuess = evaluateGuess('RFAELI', 'RAFAEL');
    expect(getCorrectLetters([partialGuess], 'RAFAEL')).toEqual(['R', null, null, null, null, null]);
  });

  it('accumulates correct letters across guesses', () => {
    const guess1 = evaluateGuess('ALEXIS', 'RAFAEL');
    const guess2 = evaluateGuess('RAFAEL', 'RAFAEL');
    expect(getCorrectLetters([guess1, guess2], 'RAFAEL')).toEqual(['R', 'A', 'F', 'A', 'E', 'L']);
  });
});

describe('getWordBoundaries', () => {
  it('returns no boundaries for a single word', () => {
    expect(getWordBoundaries('Messi')).toEqual([]);
  });

  it('returns the boundary index for a space separator', () => {
    expect(getWordBoundaries('Nico Gaitan')).toEqual([4]);
  });

  it('does not shift the index for a diacritic', () => {
    expect(getWordBoundaries('Nico Gaitán')).toEqual([4]);
  });

  it("returns the boundary index for an apostrophe separator", () => {
    expect(getWordBoundaries("O'Brien")).toEqual([1]);
  });

  it('returns the boundary index for a hyphen separator', () => {
    expect(getWordBoundaries('San-Jose')).toEqual([3]);
  });

  it('returns the boundary index for De Bruyne', () => {
    expect(getWordBoundaries('De Bruyne')).toEqual([2]);
  });
});
