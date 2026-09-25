// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GameComplete from './GameComplete';
import type { Game, ShirtData } from '@/types';
import type { ShirtGameData } from '@/lib/gameState';

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
