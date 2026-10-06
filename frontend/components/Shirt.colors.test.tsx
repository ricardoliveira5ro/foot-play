// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Shirt from './Shirt';
import type { TeamColorEntry } from '../src/lib/teamColors';
import type { ShirtData } from '../types';

const shirt: ShirtData = {
  token: 'test-shirt',
  nameLength: 8,
  shirtNumber: 10,
  coords: { x: 50, y: 50 },
  state: 'default',
  wordBoundaries: [],
  position: 'ST',
  goals: 0,
  assists: 0,
  redCards: 0,
  isCaptain: false,
};

const colorsByPattern: Record<TeamColorEntry['pattern'], TeamColorEntry> = {
  solid: { primary: '#A50044', secondary: '#004D98', pattern: 'solid' },
  'stripes-v': { primary: '#A50044', secondary: '#004D98', pattern: 'stripes-v' },
  'stripes-h': { primary: '#A50044', secondary: '#004D98', pattern: 'stripes-h' },
  halves: { primary: '#A50044', secondary: '#004D98', pattern: 'halves' },
};

describe('Shirt colours', () => {
  it.each(Object.entries(colorsByPattern))('renders the %s pattern', (pattern, colors) => {
    render(<Shirt shirt={shirt} index={0} colors={colors} />);

    const button = screen.getByRole('button', { name: 'Shirt 10, tap to guess the player' });
    const shirtPath = button.querySelector('svg > path');
    expect(shirtPath).not.toBeNull();
    expect(shirtPath).toHaveAttribute('stroke', colors.secondary);

    if (pattern === 'stripes-v' || pattern === 'stripes-h') {
      expect(shirtPath).toHaveAttribute('fill', `url(#pattern-test-shirt-${pattern === 'stripes-v' ? 'v' : 'h'})`);
    } else {
      expect(shirtPath).toHaveAttribute('fill', colors.primary);
    }

    if (pattern === 'halves') {
      expect(button.querySelector('svg rect[fill="#004D98"]')).not.toBeNull();
    }
  });

  it('keeps the default fill and stroke when no team colours are provided', () => {
    render(<Shirt shirt={shirt} index={0} />);

    const shirtPath = screen.getByRole('button').querySelector('svg > path');
    expect(shirtPath).toHaveAttribute('fill', '#F8FAF8');
    expect(shirtPath).toHaveAttribute('stroke', '#101820');
  });
});
