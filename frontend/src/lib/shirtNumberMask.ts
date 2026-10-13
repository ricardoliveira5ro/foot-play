import { DIFFICULTY_CONFIG, type Difficulty } from './difficulty';
import type { ShirtState } from '../../types';

function isResolved(state: ShirtState): boolean {
  return state === 'correct' || state === 'failed';
}

/** Return the shirt number to render without changing the underlying data. */
export function maskedShirtNumber(
  mode: Difficulty,
  shirtNumber: number | null,
  state: ShirtState,
): number | null {
  if (shirtNumber === null) return null;
  if (DIFFICULTY_CONFIG[mode].showShirtNumber || isResolved(state)) return shirtNumber;
  return null;
}

/** Accessible text distinguishing a withheld number from one absent in the data. */
export function shirtNumberAriaLabel(
  mode: Difficulty,
  shirtNumber: number | null,
  state: ShirtState,
  shirtNumberHidden = false,
): string {
  const display = maskedShirtNumber(mode, shirtNumber, state);
  if (display !== null) return String(display);
  if (shirtNumberHidden || shirtNumber !== null) return '? (number hidden)';
  return '? (no number on record)';
}
