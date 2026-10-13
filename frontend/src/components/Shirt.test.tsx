// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Shirt from '../../components/Shirt';
import type { ShirtData } from '../../types';

const base: ShirtData = {
  token: 'tok-1',
  nameLength: 5,
  wordBoundaries: [],
  shirtNumber: 9,
  position: 'ST',
  coords: { x: 50, y: 50 },
  state: 'default',
  goals: 1,
  assists: 0,
  redCards: 0,
  isCaptain: false,
  hasFirstLetter: true,
  firstLetter: 'A',
};

function renderShirt(overrides: Partial<ShirtData> = {}, difficulty?: 'easy' | 'normal' | 'hard' | 'expert') {
  return render(<Shirt shirt={{ ...base, ...overrides }} index={0} difficulty={difficulty} />);
}

describe('Shirt number masking', () => {
  it('shows the number in Normal and by default', () => {
    renderShirt({}, 'normal');
    expect(screen.getByTestId('shirt-number').textContent).toBe('9');
  });

  it('defaults to Normal when no mode is given', () => {
    render(<Shirt shirt={base} index={0} />);
    expect(screen.getByTestId('shirt-number').textContent).toBe('9');
  });

  it('shows a question mark instead of the number in Hard', () => {
    renderShirt({}, 'hard');
    expect(screen.getByTestId('shirt-number').textContent).toBe('?');
    expect(screen.getByTestId('shirt-number').textContent).not.toContain('9');
  });

  it.each(['correct', 'failed'] as const)('reveals the number in Hard when %s', (state) => {
    renderShirt({ state, name: 'Someone' }, 'hard');
    expect(screen.getByTestId('shirt-number').textContent).toBe('9');
  });

  it('renders no number element for a player with no number on record', () => {
    renderShirt({ shirtNumber: null }, 'normal');
    expect(screen.queryByTestId('shirt-number')).toBeNull();
  });

  it('distinguishes a Hard-masked shirt from a numberless shirt accessibly', () => {
    const { unmount } = renderShirt({}, 'hard');
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('? (number hidden)');
    unmount();
    renderShirt({ shirtNumber: null }, 'hard');
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('? (no number on record)');
  });

  it('keeps clue icons and text out of Hard mode while preserving red-card decoration', () => {
    renderShirt({ redCards: 1 }, 'hard');
    const button = screen.getByRole('button');
    expect(button.textContent).not.toMatch(/scorer|captain|first letter/i);
    expect(button.querySelector('[data-badge="scorer"]')).toBeNull();
    expect(button.querySelector('[data-badge="sent-off"]')).not.toBeNull();
  });
});
