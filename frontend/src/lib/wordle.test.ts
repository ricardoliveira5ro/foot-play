/**
 * Test cases for the Wordle algorithm
 */

import { evaluateGuess, isCorrectGuess, getTargetLength, normalize, getCorrectLetters } from './wordle';

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

console.log('Running Wordle algorithm tests...\n');

// Test normalize function
console.log('--- Normalize tests ---');
assertEqual(normalize('MESSI'), 'messi', 'normalize: uppercase');
assertEqual(normalize('Messi'), 'messi', 'normalize: mixed case');
assertEqual(normalize('Pelé'), 'pele', 'normalize: diacritics');
assertEqual(normalize('Van Dijk'), 'vandijk', 'normalize: spaces');
assertEqual(normalize('O\'Brien'), 'obrien', 'normalize: apostrophe');
assertEqual(normalize('San-Jose'), 'sanjose', 'normalize: hyphen');

// Test getTargetLength
console.log('\n--- Target length tests ---');
assertEqual(getTargetLength('Messi'), 5, 'getTargetLength: Messi');
assertEqual(getTargetLength('Pelé'), 4, 'getTargetLength: Pelé');
assertEqual(getTargetLength('Van Dijk'), 7, 'getTargetLength: Van Dijk');
assertEqual(getTargetLength('O\'Brien'), 6, 'getTargetLength: O\'Brien');

// Test evaluateGuess - basic cases from spec
console.log('\n--- evaluateGuess tests (spec cases) ---');

// evaluateGuess("MESSI", "Messi") → all correct
assertEqual(
  evaluateGuess('MESSI', 'Messi').map(r => r.result),
  ['CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT'],
  'MESSI vs Messi: all correct'
);

// evaluateGuess("MEESI", "Messi") → M:correct, E:correct, E:absent, S:correct, I:correct
// Note: The 4th letter (index 3) of both "meesi" and "messi" is 's', so it's correct, not present
assertEqual(
  evaluateGuess('MEESI', 'Messi').map(r => r.result),
  ['CORRECT', 'CORRECT', 'ABSENT', 'CORRECT', 'CORRECT'],
  'MEESI vs Messi: duplicate E handling (S at pos 3 matches)'
);

// evaluateGuess("MMMMM", "Messi") → M:correct, M:absent, M:absent, M:absent, M:absent
assertEqual(
  evaluateGuess('MMMMM', 'Messi').map(r => r.result),
  ['CORRECT', 'ABSENT', 'ABSENT', 'ABSENT', 'ABSENT'],
  'MMMMM vs Messi: duplicate M handling'
);

// evaluateGuess("ronaldo", "Ronaldo") → all correct (case-insensitive)
assertEqual(
  evaluateGuess('ronaldo', 'Ronaldo').map(r => r.result),
  ['CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT'],
  'ronaldo vs Ronaldo: case insensitive'
);

// evaluateGuess("messi", "Ronaldo") → all absent
assertEqual(
  evaluateGuess('messi', 'Ronaldo').map(r => r.result),
  ['ABSENT', 'ABSENT', 'ABSENT', 'ABSENT', 'ABSENT', 'ABSENT', 'ABSENT'],
  'messi vs Ronaldo: all absent'
);

// Test diacritics handling
console.log('\n--- Diacritics tests ---');
assertEqual(
  evaluateGuess('Pele', 'Pelé').map(r => r.result),
  ['CORRECT', 'CORRECT', 'CORRECT', 'CORRECT'],
  'Pele vs Pelé: diacritics handled'
);

// Test spaces/hyphens handling
console.log('\n--- Spaces/hyphens tests ---');
assertEqual(
  evaluateGuess('van dijk', 'Van Dijk').map(r => r.result),
  ['CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT'],
  'van dijk vs Van Dijk: spaces handled'
);

// Additional edge cases
console.log('\n--- Additional edge cases ---');

// Test with shorter guess
const shortResult = evaluateGuess('Ron', 'Ronaldo');
assertEqual(shortResult.length, 7, 'Short guess: result length matches target');
assertEqual(shortResult[0].result, 'CORRECT', 'Short guess: first letter correct');
assertEqual(shortResult[1].result, 'CORRECT', 'Short guess: second letter correct');
assertEqual(shortResult[2].result, 'CORRECT', 'Short guess: third letter correct');

// Test with longer guess
const longResult = evaluateGuess('Ronaldinho', 'Ronaldo');
assertEqual(longResult.length, 7, 'Long guess: result length matches target');

// Classic Wordle duplicate handling test cases
// Target: "APPLE", Guess: "ALARM"
// A: correct, L: present, A: absent (already matched), R: absent, M: absent
const appleAlarm = evaluateGuess('ALARM', 'APPLE');
assertEqual(appleAlarm[0].result, 'CORRECT', 'ALARM vs APPLE: A correct');
assertEqual(appleAlarm[1].result, 'PRESENT', 'ALARM vs APPLE: L present');
assertEqual(appleAlarm[2].result, 'ABSENT', 'ALARM vs APPLE: second A absent');
assertEqual(appleAlarm[3].result, 'ABSENT', 'ALARM vs APPLE: R absent');
assertEqual(appleAlarm[4].result, 'ABSENT', 'ALARM vs APPLE: M absent');

// Target: "SPEAR", Guess: "SPARE"
// S: correct, P: correct, A: present, R: present, E: present
const spearSpare = evaluateGuess('SPARE', 'SPEAR');
assertEqual(spearSpare[0].result, 'CORRECT', 'SPARE vs SPEAR: S correct');
assertEqual(spearSpare[1].result, 'CORRECT', 'SPARE vs SPEAR: P correct');
assertEqual(spearSpare[2].result, 'PRESENT', 'SPARE vs SPEAR: A present');
assertEqual(spearSpare[3].result, 'PRESENT', 'SPARE vs SPEAR: R present');
assertEqual(spearSpare[4].result, 'PRESENT', 'SPARE vs SPEAR: E present');

// Target: "BANANA", Guess: "BANANA" - all correct
assertEqual(
  evaluateGuess('BANANA', 'BANANA').map(r => r.result),
  ['CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT'],
  'BANANA vs BANANA: all correct'
);

// Target: "BANANA", Guess: "BANANA" with different arrangement
// Target: "BANANA" (b,a,n,a,n,a), Guess: "ANANAB" (a,n,a,n,a,b)
// pos 0: a vs b = absent (but a exists in target)
// pos 1: n vs a = absent (but n exists)
// pos 2: a vs n = absent
// pos 3: n vs a = absent
// pos 4: a vs n = absent
// pos 5: b vs a = absent
// Actually let's trace through properly
const bananaTest = evaluateGuess('ANANAB', 'BANANA');
console.log('ANANAB vs BANANA:', bananaTest.map(r => r.result));

// Test isCorrectGuess
console.log('\n--- isCorrectGuess tests ---');
assertTrue(isCorrectGuess('Messi', 'Messi'), 'isCorrectGuess: exact match');
assertTrue(isCorrectGuess('messi', 'Messi'), 'isCorrectGuess: case insensitive');
assertTrue(isCorrectGuess('Pele', 'Pelé'), 'isCorrectGuess: diacritics');
assertFalse(isCorrectGuess('Messi', 'Ronaldo'), 'isCorrectGuess: different names');
assertFalse(isCorrectGuess('Mess', 'Messi'), 'isCorrectGuess: too short');

// --- getCorrectLetters tests ---
console.log('\n--- getCorrectLetters tests ---');

// No guesses → all null
assertEqual(
  getCorrectLetters([], 'RAFAEL'),
  [null, null, null, null, null, null],
  'getCorrectLetters: no guesses returns all null'
);

// One wrong guess → all null
const wrongGuess1 = evaluateGuess('ALEXIS', 'RAFAEL');
assertEqual(
  getCorrectLetters([wrongGuess1], 'RAFAEL'),
  [null, null, null, null, null, null],
  'getCorrectLetters: wrong guess returns all null'
);

// One correct guess → all filled
const correctGuess = evaluateGuess('RAFAEL', 'RAFAEL');
assertEqual(
  getCorrectLetters([correctGuess], 'RAFAEL'),
  ['R', 'A', 'F', 'A', 'E', 'L'],
  'getCorrectLetters: correct guess fills all'
);

// Partial correct → mix of letters and null
const partialGuess = evaluateGuess('RFAELI', 'RAFAEL');
assertEqual(
  getCorrectLetters([partialGuess], 'RAFAEL'),
  ['R', null, null, null, null, null],
  'getCorrectLetters: only correct positions filled'
);

// Multiple guesses → accumulates correct letters
const guess1 = evaluateGuess('ALEXIS', 'RAFAEL');
const guess2 = evaluateGuess('RAFAEL', 'RAFAEL');
assertEqual(
  getCorrectLetters([guess1, guess2], 'RAFAEL'),
  ['R', 'A', 'F', 'A', 'E', 'L'],
  'getCorrectLetters: accumulates across guesses'
);

console.log('\n✅ All tests passed!');
