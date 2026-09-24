/**
 * Test cases for the WCAG 2.1 color contrast utility.
 */

import { describe, it, expect } from 'vitest';
import { getTextColor } from './colorUtils';

describe('getTextColor', () => {
  it('returns dark text for a white background', () => {
    expect(getTextColor('#FFFFFF')).toBe('dark');
  });

  it('returns light text for a black background', () => {
    expect(getTextColor('#000000')).toBe('light');
  });

  it('returns light text for Barcelona red', () => {
    expect(getTextColor('#A50044')).toBe('light');
  });

  it('returns dark text for Man City sky blue', () => {
    expect(getTextColor('#6CABDD')).toBe('dark');
  });

  it('expands 3-digit #FFF like #FFFFFF', () => {
    expect(getTextColor('#FFF')).toBe(getTextColor('#FFFFFF'));
  });

  it('expands 3-digit #000 like #000000', () => {
    expect(getTextColor('#000')).toBe(getTextColor('#000000'));
  });
});
