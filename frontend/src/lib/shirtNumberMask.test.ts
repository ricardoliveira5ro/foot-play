import { describe, it, expect } from 'vitest';
import { maskedShirtNumber, shirtNumberAriaLabel } from './shirtNumberMask';

describe('maskedShirtNumber', () => {
  it('shows numbers in Easy and Normal', () => {
    for (const mode of ['easy', 'normal'] as const) {
      expect(maskedShirtNumber(mode, 9, 'default')).toBe(9);
      expect(maskedShirtNumber(mode, 9, 'in-progress')).toBe(9);
    }
  });

  it('hides unresolved numbers in Hard and Expert', () => {
    for (const mode of ['hard', 'expert'] as const) {
      expect(maskedShirtNumber(mode, 9, 'default')).toBeNull();
      expect(maskedShirtNumber(mode, 9, 'in-progress')).toBeNull();
    }
  });

  it('reveals the number after the shirt is resolved', () => {
    for (const mode of ['hard', 'expert'] as const) {
      expect(maskedShirtNumber(mode, 9, 'correct')).toBe(9);
      expect(maskedShirtNumber(mode, 9, 'failed')).toBe(9);
    }
  });

  it('preserves a genuinely missing number in every state and mode', () => {
    for (const mode of ['easy', 'normal', 'hard', 'expert'] as const) {
      for (const state of ['default', 'in-progress', 'correct', 'failed'] as const) {
        expect(maskedShirtNumber(mode, null, state)).toBeNull();
      }
    }
  });
});

describe('shirtNumberAriaLabel', () => {
  it('names a visible number plainly', () => {
    expect(shirtNumberAriaLabel('normal', 9, 'default')).toBe('9');
  });

  it('distinguishes a hidden number from a missing number', () => {
    expect(shirtNumberAriaLabel('hard', 9, 'default')).toBe('? (number hidden)');
    expect(shirtNumberAriaLabel('hard', null, 'default')).toBe('? (no number on record)');
    expect(shirtNumberAriaLabel('hard', null, 'default', true)).toBe('? (number hidden)');
  });

  it('uses the same masking labels in Expert', () => {
    expect(shirtNumberAriaLabel('expert', 4, 'default')).toBe('? (number hidden)');
    expect(shirtNumberAriaLabel('expert', null, 'default')).toBe('? (no number on record)');
  });

  it('describes missing numbers in Easy and Normal without claiming they are hidden', () => {
    expect(shirtNumberAriaLabel('easy', null, 'default')).toBe('? (no number on record)');
    expect(shirtNumberAriaLabel('normal', null, 'default')).toBe('? (no number on record)');
  });

  it('reports the real number after the shirt is resolved', () => {
    expect(shirtNumberAriaLabel('hard', 9, 'correct')).toBe('9');
    expect(shirtNumberAriaLabel('hard', 9, 'failed')).toBe('9');
    expect(shirtNumberAriaLabel('hard', null, 'failed')).toBe('? (no number on record)');
  });
});
