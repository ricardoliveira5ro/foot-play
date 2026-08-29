/**
 * Tests for the backend Wordle algorithm.
 * Ports the key cases from frontend/src/lib/wordle.test.ts.
 *
 * Run with: npx ts-node src/services/wordle.test.ts
 */

import { evaluateGuess, evaluateGuessWithResult } from './wordle';

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`FAIL: ${message}\n  Expected: ${expectedStr}\n  Actual:   ${actualStr}`);
  }
  console.log(`PASS: ${message}`);
}

function assertTrue(actual: boolean, message: string): void {
  if (!actual) {
    throw new Error(`FAIL: ${message} - expected true`);
  }
  console.log(`PASS: ${message}`);
}

function assertFalse(actual: boolean, message: string): void {
  if (actual) {
    throw new Error(`FAIL: ${message} - expected false`);
  }
  console.log(`PASS: ${message}`);
}

console.log('Running backend Wordle algorithm tests...\n');

// evaluateGuess("MESSI", "Messi") → all CORRECT
assertEqual(
  evaluateGuess('MESSI', 'Messi').map(r => r.result),
  ['CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT'],
  'MESSI vs Messi: all correct'
);

// evaluateGuess("MMMMM", "Messi") → CORRECT, ABSENT, ABSENT, ABSENT, ABSENT
assertEqual(
  evaluateGuess('MMMMM', 'Messi').map(r => r.result),
  ['CORRECT', 'ABSENT', 'ABSENT', 'ABSENT', 'ABSENT'],
  'MMMMM vs Messi: duplicate M handling'
);

// evaluateGuess("Pele", "Pelé") → all CORRECT
assertEqual(
  evaluateGuess('Pele', 'Pelé').map(r => r.result),
  ['CORRECT', 'CORRECT', 'CORRECT', 'CORRECT'],
  'Pele vs Pelé: diacritics handled'
);

// evaluateGuess("van dijk", "Van Dijk") → all CORRECT
assertEqual(
  evaluateGuess('van dijk', 'Van Dijk').map(r => r.result),
  ['CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT'],
  'van dijk vs Van Dijk: spaces handled'
);

// evaluateGuess("SPARE", "SPEAR") → S:CORRECT, P:CORRECT, A:PRESENT, R:PRESENT, E:PRESENT
assertEqual(
  evaluateGuess('SPARE', 'SPEAR').map(r => r.result),
  ['CORRECT', 'CORRECT', 'PRESENT', 'PRESENT', 'PRESENT'],
  'SPARE vs SPEAR: present letters'
);

// evaluateGuess("ALARM", "APPLE") → A:CORRECT, L:PRESENT, A:ABSENT, R:ABSENT, M:ABSENT
assertEqual(
  evaluateGuess('ALARM', 'APPLE').map(r => r.result),
  ['CORRECT', 'PRESENT', 'ABSENT', 'ABSENT', 'ABSENT'],
  'ALARM vs APPLE: duplicate A handling'
);

// evaluateGuess("Ron", "Ronaldo") → R:CORRECT, O:CORRECT, N:CORRECT, then ABSENT padding
const shortResult = evaluateGuess('Ron', 'Ronaldo');
assertEqual(shortResult.length, 7, 'Ron vs Ronaldo: result length matches target');
assertEqual(
  shortResult.map(r => r.result),
  ['CORRECT', 'CORRECT', 'CORRECT', 'ABSENT', 'ABSENT', 'ABSENT', 'ABSENT'],
  'Ron vs Ronaldo: correct letters then absent padding'
);

// evaluateGuess("Ronaldinho", "Ronaldo") → truncated to 7 results
const longResult = evaluateGuess('Ronaldinho', 'Ronaldo');
assertEqual(longResult.length, 7, 'Ronaldinho vs Ronaldo: result truncated to target length');

// letter field is uppercase (user choice, unlike frontend which keeps original case)
assertEqual(evaluateGuess('MESSI', 'Messi')[0].letter, 'M', 'letter field is uppercase');

// evaluateGuessWithResult("Messi", "Messi") → true
assertTrue(evaluateGuessWithResult('Messi', 'Messi').isCorrect, 'evaluateGuessWithResult: exact match');

// evaluateGuessWithResult("Messi", "Ronaldo") → false
assertFalse(evaluateGuessWithResult('Messi', 'Ronaldo').isCorrect, 'evaluateGuessWithResult: different names');

// Extra duplicate-handling case from the frontend test suite
assertEqual(
  evaluateGuess('MEESI', 'Messi').map(r => r.result),
  ['CORRECT', 'CORRECT', 'ABSENT', 'CORRECT', 'CORRECT'],
  'MEESI vs Messi: duplicate E handling'
);

// Duplicate-heavy case: guess "AX" vs target "XAXA".
// Frontend marks the first unmatched occurrence per guess letter (matched-index
// technique); the remaining target slots stay unmatched and become ABSENT.
assertEqual(
  evaluateGuess('AX', 'XAXA').map(r => r.result),
  ['PRESENT', 'PRESENT', 'ABSENT', 'ABSENT'],
  'AX vs XAXA: first-match-only present handling, remaining slots absent'
);

console.log('\n✅ All tests passed!');