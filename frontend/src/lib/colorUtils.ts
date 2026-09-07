/**
 * WCAG 2.1 relative luminance and text-contrast utilities for the
 * Missing Eleven mini-game. Used to pick a readable number color
 * (dark or light) against a given shirt background color.
 */

interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse a hex color string into 0-255 RGB channel values.
 * Supports both 3-digit (#RGB) and 6-digit (#RRGGBB) formats.
 * 3-digit values are expanded by doubling each digit (#ABC -> #AABBCC).
 */
function parseHex(hex: string): RGB {
  let value = hex.replace(/^#/, '');

  if (value.length === 3) {
    value = value
      .split('')
      .map((digit) => digit + digit)
      .join('');
  }

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);

  return { r, g, b };
}

/**
 * Compute WCAG 2.1 relative luminance for a hex color.
 * Returns a number between 0 (black) and 1 (white).
 */
function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);

  const linearize = (channel: number): number => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };

  const rLin = linearize(r);
  const gLin = linearize(g);
  const bLin = linearize(b);

  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * Pick a readable text color for a given background color.
 * Returns 'dark' for light backgrounds (luminance above the threshold) and
 * 'light' for dark backgrounds (luminance at or below the threshold).
 *
 * Threshold note: the task spec's draft threshold of 0.4 misclassifies light
 * sky blues as dark backgrounds (e.g. Man City #6CABDD has luminance 0.375,
 * Argentina #75AADB has 0.377 — both should get dark text). 0.35 keeps those
 * readable while still treating genuinely dark colors as light-text.
 */
export function getTextColor(backgroundColor: string): 'dark' | 'light' {
  return relativeLuminance(backgroundColor) > 0.35 ? 'dark' : 'light';
}
