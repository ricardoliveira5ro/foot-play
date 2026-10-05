// @vitest-environment jsdom

/**
 * Shirt badge rendering (v1.0.3).
 *
 * This file lives under `src/` on purpose: `frontend/vitest.config.ts:16`
 * collects tests only from the `src` tree, so a test beside
 * `frontend/components/Shirt.tsx` would never execute — the same silent
 * gap that has kept `frontend/components/Shirt.colors.test.tsx` unrun to
 * this day (R7). Widening that include is v1.1.1's job.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Shirt from '../../components/Shirt';
import type { ShirtData } from '@/types';

function makeShirt(overrides: Partial<ShirtData> = {}): ShirtData {
  return {
    token: 'shirt-1',
    nameLength: 5,
    wordBoundaries: [],
    shirtNumber: 10,
    position: 'ST',
    coords: { x: 50, y: 50 },
    state: 'default',
    goals: 0,
    assists: 0,
    redCards: 0,
    isCaptain: false,
    ...overrides,
  };
}

function renderShirt(overrides: Partial<ShirtData> = {}) {
  const { container } = render(<Shirt shirt={makeShirt(overrides)} index={0} />);
  const button = container.querySelector('button');
  if (!button) throw new Error('Shirt did not render a button');
  return { container, button };
}

function badgeOrder(container: HTMLElement): (string | null)[] {
  return [...container.querySelectorAll('[data-badge]')].map((el) => el.getAttribute('data-badge'));
}

function badgeRowOrder(container: HTMLElement): (string | null)[] {
  const row = container.querySelector('[data-badge-row]');
  return row
    ? [...row.querySelectorAll('[data-badge], [data-state-badge]')].map(
        (el) => el.getAttribute('data-badge') ?? el.getAttribute('data-state-badge'),
      )
    : [];
}

describe('Shirt badges', () => {
  it('renders no badge and no badge wording when the game has no event data', () => {
    const { container, button } = renderShirt({ goals: 0, redCards: 0 });
    expect(container.querySelectorAll('[data-badge]')).toHaveLength(0);
    expect(button.getAttribute('aria-label')).toBe('Shirt 10, tap to guess the player');
  });

  it('renders one scorer badge per goal and names the total', () => {
    const { container, button } = renderShirt({ goals: 2, redCards: 0 });
    expect(badgeOrder(container)).toEqual(['scorer', 'scorer']);
    expect(button.getAttribute('aria-label')).toBe(
      'Shirt 10, tap to guess the player, scored 2 goals in this match',
    );
  });

  it('renders a send-off badge for a dismissal and names it', () => {
    const { container, button } = renderShirt({ goals: 0, redCards: 1 });
    expect(badgeOrder(container)).toEqual(['sent-off']);
    expect(button.getAttribute('aria-label')).toBe(
      'Shirt 10, tap to guess the player, sent off in this match',
    );
  });

  it('renders both badges, scorer first, and names both', () => {
    const { container, button } = renderShirt({ goals: 1, redCards: 1 });
    expect(badgeOrder(container)).toEqual(['scorer', 'sent-off']);
    expect(button.getAttribute('aria-label')).toBe(
      'Shirt 10, tap to guess the player, scored in this match, sent off in this match',
    );
  });

  it('renders each goal badge before the send-off badge', () => {
    const { container, button } = renderShirt({ goals: 2, redCards: 1 });
    expect(badgeOrder(container)).toEqual(['scorer', 'scorer', 'sent-off']);
    expect(button.getAttribute('aria-label')).toBe(
      'Shirt 10, tap to guess the player, scored 2 goals in this match, sent off in this match',
    );
  });

  it('renders three scorer badges for a hat-trick and names the total', () => {
    const { container, button } = renderShirt({ goals: 3, redCards: 0 });
    expect(container.querySelectorAll('[data-badge="scorer"]')).toHaveLength(3);
    expect(button.getAttribute('aria-label')).toBe(
      'Shirt 10, tap to guess the player, scored 3 goals in this match',
    );
  });

  it('keeps the badges on an in-progress shirt and names them', () => {
    const { container, button } = renderShirt({ state: 'in-progress', goals: 1, redCards: 0 });
    expect(badgeOrder(container)).toEqual(['scorer']);
    expect(button.getAttribute('aria-label')).toBe(
      'Shirt 10, guessing in progress, scored in this match',
    );
  });

  it('keeps the badges on a correct shirt and names them', () => {
    const { container, button } = renderShirt({
      state: 'correct',
      name: 'Neuer',
      goals: 0,
      redCards: 1,
    });
    expect(badgeOrder(container)).toEqual(['sent-off']);
    expect(badgeRowOrder(container)).toEqual(['sent-off', 'correct']);
    expect(button.getAttribute('aria-label')).toBe(
      'Shirt 10, guessed correctly: Neuer, sent off in this match',
    );
  });

  it('keeps the badges on a failed shirt and names them', () => {
    const { container, button } = renderShirt({ state: 'failed', goals: 1, redCards: 0 });
    expect(badgeOrder(container)).toEqual(['scorer']);
    expect(badgeRowOrder(container)).toEqual(['scorer', 'failed']);
    expect(button.getAttribute('aria-label')).toBe(
      'Shirt 10, not guessed, scored in this match',
    );
  });

  it('keeps a five-goal row and the correct mark together', () => {
    const { container, button } = renderShirt({ state: 'correct', goals: 5 });
    expect(badgeRowOrder(container)).toEqual([
      'scorer',
      'scorer',
      'scorer',
      'scorer',
      'scorer',
      'correct',
    ]);
    expect(button.getAttribute('aria-label')).toBe(
      'Shirt 10, guessed correctly, scored 5 goals in this match',
    );
  });

  it('keeps the existing null-shirt-number accessible name', () => {
    const { button } = renderShirt({ shirtNumber: null, goals: 1, redCards: 0 });
    expect(button.getAttribute('aria-label')).toBe(
      'Shirt ?, tap to guess the player, scored in this match',
    );
  });
});
