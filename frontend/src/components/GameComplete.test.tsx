// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GameComplete from './GameComplete';
import type { Game, ShirtState } from '@/types';
import type { ShirtGameData } from '@/lib/gameState';
import type { Difficulty } from '@/lib/difficulty';

// --- Fixtures ---

function makeMatch(overrides: Partial<Game> = {}): Game {
  return {
    gameId: 1,
    date: '2024-01-01',
    season: '2023/24',
    competition: 'Test League',
    homeClub: { clubId: 294, name: 'SL Benfica' },
    awayClub: { clubId: 999, name: 'Unknown FC' },
    homeScore: 2,
    awayScore: 1,
    homeFormation: '4-3-3',
    awayFormation: '4-4-2',
    ...overrides,
  };
}

function makeShirt(overrides: Partial<ShirtGameData> = {}): ShirtGameData {
  return {
    token: 'shirt-1',
    nameLength: 5,
    wordBoundaries: [],
    shirtNumber: 10,
    position: 'ST',
    coords: { x: 50, y: 50 },
    state: 'default',
    attempts: 0,
    guessHistory: [],
    correctLetters: [],
    goals: 0,
    assists: 0,
    redCards: 0,
    isCaptain: false,
    hasFirstLetter: true,
    ...overrides,
  };
}

interface RenderOptions {
  match?: Game;
  targetShirts?: ShirtGameData[];
  opponentShirts?: ShirtGameData[];
  targetTeamName?: string;
  opponentTeamName?: string;
  onPlayAgain?: () => void;
  difficulty?: Difficulty;
}

/**
 * A full solved lineup. `attempts: 1` matters: the opponent section label
 * reads whether the opponent half was actually attempted, so a "solved"
 * shirt must carry a real attempt.
 */
function solvedShirts(prefix = 't'): ShirtGameData[] {
  return Array.from({ length: 11 }, (_, i) =>
    makeShirt({ token: `${prefix}${i}`, state: 'correct', attempts: 1, shirtNumber: i + 1 }),
  );
}

function renderGameComplete(options: RenderOptions = {}) {
  const onPlayAgain = options.onPlayAgain ?? vi.fn();
  const result = render(
    <GameComplete
      match={options.match ?? makeMatch()}
      targetShirts={options.targetShirts ?? [makeShirt()]}
      opponentShirts={options.opponentShirts ?? []}
      targetTeamName={options.targetTeamName ?? 'Target FC'}
      opponentTeamName={options.opponentTeamName ?? 'Opponent FC'}
      onPlayAgain={onPlayAgain}
      difficulty={options.difficulty}
    />
  );
  return { ...result, onPlayAgain };
}

// --- Tests ---

describe('GameComplete', () => {
  it('opens the dialog as a modal on mount', () => {
    renderGameComplete();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('open');
  });

  it('closes the dialog on unmount', () => {
    const { unmount } = renderGameComplete();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('open');
    unmount();
    expect(dialog).not.toHaveAttribute('open');
  });

  it('renders "Perfect Score!" when every shirt is correct', () => {
    renderGameComplete({
      targetShirts: [makeShirt({ token: 't1', state: 'correct' })],
      opponentShirts: [makeShirt({ token: 'o1', state: 'correct' })],
    });
    expect(screen.getByRole('heading', { name: 'Perfect Score!' })).toBeInTheDocument();
  });

  it('renders "Game Over" with the correct/failed counts', () => {
    renderGameComplete({
      targetShirts: [
        makeShirt({ token: 't1', state: 'correct' }),
        makeShirt({ token: 't2', state: 'failed' }),
        makeShirt({ token: 't3', state: 'default' }),
      ],
    });
    expect(screen.getByRole('heading', { name: 'Game Over' })).toBeInTheDocument();
    expect(screen.getByLabelText('Correct')).toBeInTheDocument();
  });

  it('renders the score, team names, competition, and formatted date', () => {
    renderGameComplete();
    expect(screen.getByText('2 – 1')).toBeInTheDocument();
    expect(screen.getByText('SL Benfica')).toBeInTheDocument();
    expect(screen.getByText('Unknown FC')).toBeInTheDocument();
    expect(screen.getByText('Test League')).toBeInTheDocument();
    expect(screen.getByText('1 January 2024')).toBeInTheDocument();
  });

  it('renders the raw date string when the date is invalid', () => {
    renderGameComplete({ match: makeMatch({ date: 'not-a-date' }) });
    expect(screen.getByText('not-a-date')).toBeInTheDocument();
  });

  it('falls back to the season when the date is null', () => {
    renderGameComplete({ match: makeMatch({ date: null }) });
    expect(screen.getByText('2023/24')).toBeInTheDocument();
  });

  it('falls back to Home/Away when clubs are missing', () => {
    renderGameComplete({ match: makeMatch({ homeClub: null, awayClub: null }) });
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Away')).toBeInTheDocument();
  });

  it('renders only the competition when date and season are missing', () => {
    renderGameComplete({ match: makeMatch({ date: null, season: null }) });
    expect(screen.getByText('Test League')).toBeInTheDocument();
  });

  it('omits the date/competition block when both are missing', () => {
    renderGameComplete({ match: makeMatch({ date: null, season: null, competition: null }) });
    expect(screen.queryByText('Test League')).not.toBeInTheDocument();
    expect(screen.queryByText('2023/24')).not.toBeInTheDocument();
  });

  it('sorts player rows by position order', () => {
    renderGameComplete({
      targetShirts: [
        makeShirt({ token: 'st', position: 'ST', shirtNumber: 9 }),
        makeShirt({ token: 'gk', position: 'GK', shirtNumber: 1 }),
        makeShirt({ token: 'cb', position: 'CB', shirtNumber: 4 }),
      ],
    });
    const numbers = screen.getAllByLabelText(/^Shirt /).map((el) => el.textContent);
    expect(numbers).toEqual(['1', '4', '9']);
  });

  it('sorts unknown positions last', () => {
    renderGameComplete({
      targetShirts: [
        makeShirt({ token: 'libero', position: 'Libero', shirtNumber: 5 }),
        makeShirt({ token: 'gk', position: 'GK', shirtNumber: 1 }),
      ],
    });
    const numbers = screen.getAllByLabelText(/^Shirt /).map((el) => el.textContent);
    expect(numbers).toEqual(['1', '5']);
  });

  it('renders position labels with fallbacks for unknown and missing positions', () => {
    renderGameComplete({
      targetShirts: [
        makeShirt({ token: 'cf', position: 'CF', shirtNumber: 9 }),
        makeShirt({ token: 'libero', position: 'Libero', shirtNumber: 5 }),
        makeShirt({ token: 'none', position: null, shirtNumber: 1 }),
      ],
    });
    expect(screen.getByText('ST')).toBeInTheDocument(); // CF maps to ST
    expect(screen.getByText('Libero')).toBeInTheDocument();
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('renders ? for a missing shirt number', () => {
    renderGameComplete({
      targetShirts: [makeShirt({ token: 't1', shirtNumber: null })],
    });
    expect(screen.getByLabelText('Shirt ?')).toBeInTheDocument();
  });

  it('shows names for resolved shirts and — for unresolved ones', () => {
    renderGameComplete({
      targetShirts: [
        makeShirt({ token: 't1', state: 'correct', shirtNumber: 10, name: 'Lionel Messi' }),
        makeShirt({ token: 't2', state: 'failed', shirtNumber: 11, name: 'Cristiano Ronaldo' }),
        makeShirt({ token: 't3', state: 'default', shirtNumber: 12 }),
      ],
    });
    expect(screen.getByText('Lionel Messi')).toBeInTheDocument();
    expect(screen.getByText('Cristiano Ronaldo')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(1);
  });

  it('shows — when a resolved shirt has no name', () => {
    renderGameComplete({
      targetShirts: [
        makeShirt({ token: 't1', state: 'correct', shirtNumber: 10 }),
        makeShirt({ token: 't2', state: 'failed', shirtNumber: 11 }),
      ],
    });
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('renders Correct and Failed aria badges', () => {
    renderGameComplete({
      targetShirts: [
        makeShirt({ token: 't1', state: 'correct', shirtNumber: 10 }),
        makeShirt({ token: 't2', state: 'failed', shirtNumber: 11 }),
      ],
    });
    expect(screen.getByLabelText('Correct')).toBeInTheDocument();
    expect(screen.getByLabelText('Failed')).toBeInTheDocument();
  });

  it('switches to the opponent tab on click', async () => {
    const user = userEvent.setup();
    renderGameComplete({
      targetShirts: [makeShirt({ token: 't1', shirtNumber: 10 })],
      opponentShirts: [makeShirt({ token: 'o1', shirtNumber: 20 })],
    });
    expect(screen.getByLabelText('Shirt 10')).toBeInTheDocument();
    expect(screen.queryByLabelText('Shirt 20')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Switch to Opponent FC lineup/ }));

    expect(screen.getByLabelText('Shirt 20')).toBeInTheDocument();
    expect(screen.queryByLabelText('Shirt 10')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Switch to Target FC lineup/ }));

    expect(screen.getByLabelText('Shirt 10')).toBeInTheDocument();
    expect(screen.queryByLabelText('Shirt 20')).not.toBeInTheDocument();
  });

  it('sorts mixed known, unknown, and missing positions', () => {
    renderGameComplete({
      targetShirts: [
        makeShirt({ token: 'n', position: null, shirtNumber: 7 }),
        makeShirt({ token: 'u', position: 'Libero', shirtNumber: 5 }),
        makeShirt({ token: 'k', position: 'GK', shirtNumber: 1 }),
      ],
    });
    const numbers = screen.getAllByLabelText(/^Shirt /).map((el) => el.textContent);
    expect(numbers).toEqual(['1', '7', '5']);
  });

  it('calls onPlayAgain when Play Again is clicked', async () => {
    const user = userEvent.setup();
    const { onPlayAgain } = renderGameComplete();
    await user.click(screen.getByRole('button', { name: 'Play Again' }));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
  });

  it('prevents default on cancel (Escape) without crashing', () => {
    renderGameComplete();
    const dialog = screen.getByRole('dialog');
    const cancelEvent = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancelEvent);
    expect(cancelEvent.defaultPrevented).toBe(true);
  });
});

describe('mode multiplier', () => {
  it('shows the multiplier next to the grand total', () => {
    renderGameComplete({ difficulty: 'hard' });
    expect(screen.getByTestId('grand-total-multiplier').textContent).toBe('×2');
  });

  it('shows the multiplier on each per-shirt line', () => {
    renderGameComplete({ difficulty: 'expert', targetShirts: solvedShirts('t') });
    const badges = screen.getAllByTestId('per-player-multiplier');
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(badge.textContent).toBe('×3');
    }
  });

  it('shows no multiplier badge in Normal', () => {
    renderGameComplete({ difficulty: 'normal', targetShirts: solvedShirts('t') });
    expect(screen.queryByTestId('grand-total-multiplier')).toBeNull();
    expect(screen.queryAllByTestId('per-player-multiplier')).toHaveLength(0);
  });

  it('labels the opponent an optional bonus in Easy, Normal and Hard', async () => {
    const user = userEvent.setup();
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const { unmount } = renderGameComplete({
        difficulty,
        opponentShirts: solvedShirts('opp'),
      });

      await user.click(screen.getByRole('tab', { name: /Switch to Opponent FC lineup/ }));

      expect(screen.getByTestId('opponent-section-label').textContent ?? '').toMatch(
        /optional bonus/i,
      );
      unmount();
    }
  });

  it('labels the opponent required in Expert', async () => {
    const user = userEvent.setup();
    renderGameComplete({ difficulty: 'expert', opponentShirts: solvedShirts('opp') });

    await user.click(screen.getByRole('tab', { name: /Switch to Opponent FC lineup/ }));

    const label = screen.getByTestId('opponent-section-label').textContent ?? '';
    expect(label).toMatch(/required/i);
    expect(label).not.toMatch(/optional/i);
  });

  it('says the opponent was not played when the half was never touched', async () => {
    const user = userEvent.setup();
    const untouched = Array.from({ length: 11 }, (_, i) => makeShirt({ token: `o${i}` }));
    renderGameComplete({ difficulty: 'normal', opponentShirts: untouched });

    await user.click(screen.getByRole('tab', { name: /Switch to Opponent FC lineup/ }));

    expect(screen.getByTestId('opponent-section-label').textContent ?? '').toMatch(
      /not played this game/i,
    );
  });
});


describe('share block', () => {
  const eleven = (prefix: string, state: ShirtState = 'default'): ShirtGameData[] =>
    Array.from({ length: 11 }, (_, i) =>
      makeShirt({ token: `${prefix}-${i}`, shirtNumber: i + 1, position: null, state })
    );

  it('renders the block with 11 slots when the opponent was not attempted', () => {
    renderGameComplete({
      targetShirts: eleven('t', 'correct'),
      opponentShirts: [],
      difficulty: 'normal',
    });
    // 11000 = 11 correct shirts × 1000 (scorePlayer's base, which attempts: 0
    // does not reduce). This is the end-to-end check that the block carries
    // scoreBreakdown.grandTotal rather than something re-derived.
    expect(screen.getByRole('img', { name: /share grid/i }).textContent).toBe(
      '🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩\nNormal ×1 · 11000'
    );
  });

  it('renders 22 slots when the opponent has attempts', () => {
    renderGameComplete({
      targetShirts: eleven('t', 'correct'),
      opponentShirts: eleven('o', 'failed').map((shirt, i) => ({ ...shirt, attempts: 2, token: `o-${i}` })),
      difficulty: 'normal',
    });
    const lines = (screen.getByRole('img', { name: /share grid/i }).textContent ?? '').split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩');
    expect(lines[1]).toBe('⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛');
    expect(lines[2]).toContain('Normal ×1 · ');
  });

  it('treats an opponent half with no attempts as out of scope', () => {
    // The surrender case: the opponent half exists in state but was never
    // played, so a game that never touched it is an 11-slot result.
    renderGameComplete({
      targetShirts: eleven('t', 'failed'),
      opponentShirts: eleven('o', 'default'),
      difficulty: 'hard',
    });
    const text = screen.getByRole('img', { name: /share grid/i }).textContent ?? '';
    expect(text.split('\n')).toHaveLength(2);
    expect(text.split('\n')[0]).toBe('⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛');
  });

  it('renders 11 slots for expert when the opponent was never attempted', () => {
    // RD2 at the component seam: the flag is derived from the shirts, so an
    // untouched opponent half yields one row whatever the mode requires.
    renderGameComplete({
      targetShirts: eleven('t', 'correct'),
      opponentShirts: eleven('o', 'default'),
      difficulty: 'expert',
    });
    const text = screen.getByRole('img', { name: /share grid/i }).textContent ?? '';
    expect(text.split('\n')).toHaveLength(2);
    expect(text.split('\n')[0]).toBe('🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩');
  });

  it('renders 22 slots for an expert surrender that put attempts in the opponent half', () => {
    // The case §7 row 4's label exists to exclude, and the reason the row is
    // qualified "opponent untouched". Surrender does not make the opponent half
    // out of scope — `attempts > 0` does, or does not. Same mode, same way the
    // game ended, opposite flag, 22 slots.
    renderGameComplete({
      targetShirts: eleven('t', 'correct'),
      opponentShirts: eleven('o', 'default').map((shirt, i) => ({ ...shirt, attempts: 1, token: `o-${i}` })),
      difficulty: 'expert',
    });
    const text = screen.getByRole('img', { name: /share grid/i }).textContent ?? '';
    expect(text.split('\n')).toHaveLength(3);
    expect(text.split('\n')[2]).toContain('Expert ×3 · ');
  });

  it('carries the mode label and multiplier in the tally line', () => {
    renderGameComplete({
      targetShirts: eleven('t', 'correct'),
      opponentShirts: [],
      difficulty: 'hard',
    });
    // The multiplier and the score are asserted separately and loosely on
    // purpose. `DIFFICULTY_CONFIG.hard.multiplier` is 2 and v1.2.5 has already
    // scaled `grandTotal` by it, so the exact total is scoring's assertion to
    // make, not this one. What v1.4.1 owns is that the mode and its
    // multiplier are read from the table and shown.
    expect(screen.getByRole('img', { name: /share grid/i }).textContent).toContain('Hard ×2 · ');
  });

  it('places the block between the match summary and Play Again', () => {
    const { container } = renderGameComplete({
      targetShirts: eleven('t', 'correct'),
      opponentShirts: [],
      difficulty: 'normal',
    });
    const block = screen.getByRole('img', { name: /share grid/i });
    const again = screen.getByRole('button', { name: 'Play Again' });
    // Node.DOCUMENT_POSITION_FOLLOWING === 4: the block sits after the summary
    // and before the control, so the dialog ends on the thing to press.
    expect(
      block.compareDocumentPosition(again) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(container.querySelector('pre')).toBe(block);
  });

  it('keeps the block selectable and monospace', () => {
    renderGameComplete({ targetShirts: eleven('t', 'correct'), opponentShirts: [] });
    const block = screen.getByRole('img', { name: /share grid/i });
    expect(block.tagName).toBe('PRE');
    expect(block.className).toContain('font-mono');
    expect(block.className).toContain('select-text');
  });

  it('renders no clipboard control in v1.4.1', () => {
    renderGameComplete({ targetShirts: eleven('t', 'correct'), opponentShirts: [] });
    expect(screen.queryByRole('button', { name: /copy/i })).toBeNull();
  });

  it('describes the block for a screen reader with a plain-language label', () => {
    renderGameComplete({
      targetShirts: eleven('t', 'correct'),
      opponentShirts: [],
      difficulty: 'normal',
    });
    // role="img" with a text alternative: the emoji themselves would otherwise
    // be read as a run of unpronounceable squares.
    expect(screen.getByRole('img', { name: 'Share grid' })).toBeTruthy();
  });
});
