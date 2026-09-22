import { describe, it, expect } from 'vitest';
import { normalize, evaluateGuess, evaluateGuessWithResult, getWordBoundaries } from '../../services/wordle';

describe('normalize', () => {
  it('lowercases and strips diacritics, spaces, hyphens, apostrophes', () => {
    expect(normalize('Pelé')).toBe('pele');
    expect(normalize('Van Dijk')).toBe('vandijk');
    expect(normalize("O'Brien")).toBe('obrien');
    expect(normalize('San-Jose')).toBe('sanjose');
  });
});

describe('evaluateGuess', () => {
  it('marks all letters CORRECT on exact match', () => {
    expect(evaluateGuess('MESSI', 'Messi').map(r => r.result)).toEqual(['CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT']);
  });

  it('handles duplicate letters in guess (MMMMM vs Messi)', () => {
    expect(evaluateGuess('MMMMM', 'Messi').map(r => r.result)).toEqual(['CORRECT', 'ABSENT', 'ABSENT', 'ABSENT', 'ABSENT']);
  });

  it('handles diacritics (Pele vs Pelé)', () => {
    expect(evaluateGuess('Pele', 'Pelé').map(r => r.result)).toEqual(['CORRECT', 'CORRECT', 'CORRECT', 'CORRECT']);
  });

  it('handles spaces (van dijk vs Van Dijk)', () => {
    expect(evaluateGuess('van dijk', 'Van Dijk').map(r => r.result)).toEqual(['CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT']);
  });

  it('marks PRESENT letters (SPARE vs SPEAR)', () => {
    expect(evaluateGuess('SPARE', 'SPEAR').map(r => r.result)).toEqual(['CORRECT', 'CORRECT', 'PRESENT', 'PRESENT', 'PRESENT']);
  });

  it('handles duplicate A (ALARM vs APPLE)', () => {
    expect(evaluateGuess('ALARM', 'APPLE')).toEqual([
      { letter: 'A', result: 'CORRECT' },
      { letter: 'L', result: 'PRESENT' },
      { letter: 'A', result: 'ABSENT' },
      { letter: 'R', result: 'ABSENT' },
      { letter: 'M', result: 'ABSENT' },
    ]);
  });

  it('produces one entry per guess position (NANI vs Ruiz)', () => {
    expect(evaluateGuess('NANI', 'Ruiz')).toEqual([
      { letter: 'N', result: 'ABSENT' },
      { letter: 'A', result: 'ABSENT' },
      { letter: 'N', result: 'ABSENT' },
      { letter: 'I', result: 'PRESENT' },
    ]);
  });

  it('pads short guesses to target length (Ron vs Ronaldo)', () => {
    const result = evaluateGuess('Ron', 'Ronaldo');
    expect(result).toHaveLength(7);
    expect(result.map(r => r.result)).toEqual(['CORRECT', 'CORRECT', 'CORRECT', 'ABSENT', 'ABSENT', 'ABSENT', 'ABSENT']);
  });

  it('truncates long guesses to target length (Ronaldinho vs Ronaldo)', () => {
    expect(evaluateGuess('Ronaldinho', 'Ronaldo')).toHaveLength(7);
  });

  it('returns uppercase letters', () => {
    expect(evaluateGuess('MESSI', 'Messi')[0].letter).toBe('M');
  });

  it('handles duplicate E (MEESI vs Messi)', () => {
    expect(evaluateGuess('MEESI', 'Messi').map(r => r.result)).toEqual(['CORRECT', 'CORRECT', 'ABSENT', 'CORRECT', 'CORRECT']);
  });

  it('first-match-only present handling (AX vs XAXA)', () => {
    expect(evaluateGuess('AX', 'XAXA').map(r => r.result)).toEqual(['PRESENT', 'PRESENT', 'ABSENT', 'ABSENT']);
  });
});

describe('evaluateGuessWithResult', () => {
  it('isCorrect true on exact match', () => {
    expect(evaluateGuessWithResult('Messi', 'Messi').isCorrect).toBe(true);
  });

  it('isCorrect false on mismatch', () => {
    expect(evaluateGuessWithResult('Messi', 'Ronaldo').isCorrect).toBe(false);
  });
});

describe('getWordBoundaries', () => {
  it('returns empty for single word', () => {
    expect(getWordBoundaries('Messi')).toEqual([]);
  });

  it('space separator', () => {
    expect(getWordBoundaries('Nico Gaitan')).toEqual([4]);
  });

  it('diacritic does not shift index', () => {
    expect(getWordBoundaries('Nico Gaitán')).toEqual([4]);
  });

  it('apostrophe separator', () => {
    expect(getWordBoundaries("O'Brien")).toEqual([1]);
  });

  it('hyphen separator', () => {
    expect(getWordBoundaries('San-Jose')).toEqual([3]);
  });

  it('De Bruyne', () => {
    expect(getWordBoundaries('De Bruyne')).toEqual([2]);
  });

  it('consecutive separators do not push duplicate boundaries', () => {
    expect(getWordBoundaries('Nico  Gaitan')).toEqual([4]);
  });

  it('combining diacritic marks are skipped without shifting index', () => {
    expect(getWordBoundaries('Nico Gaita\u0301n')).toEqual([4]);
  });
});