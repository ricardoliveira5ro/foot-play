/**
 * Test cases for the WCAG 2.1 color contrast utility.
 */

import { getTextColor } from './colorUtils';

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`FAIL: ${message}\n  Expected: ${expectedStr}\n  Actual:   ${actualStr}`);
  }
  console.log(`PASS: ${message}`);
}

console.log('Running colorUtils tests...\n');

// --- getTextColor tests ---
console.log('--- getTextColor tests ---');

assertEqual(getTextColor('#FFFFFF'), 'dark', 'getTextColor: white background -> dark text');
assertEqual(getTextColor('#000000'), 'light', 'getTextColor: black background -> light text');
assertEqual(getTextColor('#A50044'), 'light', 'getTextColor: Barcelona red -> light text');
assertEqual(getTextColor('#6CABDD'), 'dark', 'getTextColor: Man City sky blue -> dark text');

// 3-digit hex expansion (#RGB -> #RRGGBB) must behave like the 6-digit form
assertEqual(getTextColor('#FFF'), getTextColor('#FFFFFF'), 'getTextColor: 3-digit #FFF expands to #FFFFFF');
assertEqual(getTextColor('#000'), getTextColor('#000000'), 'getTextColor: 3-digit #000 expands to #000000');

console.log('\n✅ All tests passed!');
