// @vitest-environment jsdom

/**
 * Characterization tests for the useGameState hook — drive each action
 * creator through renderHook + act() and assert the resulting state
 * transitions. The reducer logic itself is covered in gameState.test.ts;
 * this file exists to cover the hook's action-creator lines (341–404).
 *
 * Fixtures are duplicated from gameState.test.ts — an accepted tradeoff
 * (spec dev-7 R3.3) to avoid a shared fixture module inside the coverage
 * include glob.
 */

import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useGameState, initialState } from './gameState';
import type { GameResponse, LineupPlayer, GuessResult } from '@/types';

// --- Fixtures ---

function player(token: string, nameLength = 5): LineupPlayer {
  return {
    token,
    nameLength,
    wordBoundaries: [],
    shirtNumber: 10,
    position: 'ST',
    coords: { x: 50, y: 50 },
  };
}

function makeMatch(overrides?: Partial<GameResponse>): GameResponse {
  return {
    game: {
      gameId: 1,
      date: '2024-01-01',
      season: '2023/24',
      competition: 'Test League',
      homeClub: { clubId: 294, name: 'SL Benfica' }, // curated
      awayClub: { clubId: 999, name: 'Unknown FC' }, // not curated
      homeScore: 0,
      awayScore: 0,
      homeFormation: '4-3-3',
      awayFormation: '4-4-2',
    },
    homeLineup: [player('home-1'), player('home-2')],
    awayLineup: [player('away-1')],
    ...overrides,
  };
}

const wrongGuessResults: GuessResult[] = [{ letter: 'X', result: 'ABSENT' }];
const correctGuessResults: GuessResult[] = [{ letter: 'M', result: 'CORRECT' }];

// --- Tests ---

describe('useGameState', () => {
  it('starts in the initial state', () => {
    const { result } = renderHook(() => useGameState());
    expect(result.current.state).toEqual(initialState);
  });

  describe('startNewGame', () => {
    it('loads a match, picks the curated side, and transitions to playing', () => {
      const { result } = renderHook(() => useGameState());
      act(() => {
        result.current.startNewGame(makeMatch());
      });
      expect(result.current.state.match).toEqual(makeMatch());
      expect(result.current.state.teamSide).toBe('home');
      expect(result.current.state.targetShirts).toHaveLength(2);
      expect(result.current.state.opponentShirts).toHaveLength(1);
      expect(result.current.state.activeBoard).toBe('target');
      expect(result.current.state.gameStatus).toBe('playing');
      expect(result.current.state.error).toBeNull();
      expect(result.current.state.activeShirtIndex).toBeNull();
    });
  });

  describe('selectTeam', () => {
    it('swaps target/opponent shirts for the chosen side', () => {
      const { result } = renderHook(() => useGameState());
      act(() => {
        result.current.startNewGame(makeMatch());
      });
      act(() => {
        result.current.selectTeam('away');
      });
      expect(result.current.state.teamSide).toBe('away');
      expect(result.current.state.targetShirts).toHaveLength(1);
      expect(result.current.state.targetShirts[0].token).toBe('away-1');
      expect(result.current.state.opponentShirts).toHaveLength(2);
      expect(result.current.state.activeBoard).toBe('target');
      expect(result.current.state.activeShirtIndex).toBeNull();
    });
  });

  describe('toggleBoard', () => {
    it('flips the active board and resets the active shirt', () => {
      const { result } = renderHook(() => useGameState());
      act(() => {
        result.current.startNewGame(makeMatch());
      });
      act(() => {
        result.current.openShirt('home-1');
      });
      expect(result.current.state.activeBoard).toBe('target');
      expect(result.current.state.activeShirtIndex).toBe(0);
      act(() => {
        result.current.toggleBoard();
      });
      expect(result.current.state.activeBoard).toBe('opponent');
      expect(result.current.state.activeShirtIndex).toBeNull();
      act(() => {
        result.current.toggleBoard();
      });
      expect(result.current.state.activeBoard).toBe('target');
    });
  });

  describe('openShirt / closeShirt', () => {
    it('opens a resolvable shirt and closes it again', () => {
      const { result } = renderHook(() => useGameState());
      act(() => {
        result.current.startNewGame(makeMatch());
      });
      act(() => {
        result.current.openShirt('home-1');
      });
      expect(result.current.state.activeShirtIndex).toBe(0);
      act(() => {
        result.current.closeShirt();
      });
      expect(result.current.state.activeShirtIndex).toBeNull();
    });
  });

  describe('submitGuess', () => {
    it('marks a correct guess, stores the name, and closes the modal', () => {
      const { result } = renderHook(() => useGameState());
      act(() => {
        result.current.startNewGame(makeMatch());
      });
      act(() => {
        result.current.openShirt('home-1');
      });
      act(() => {
        result.current.submitGuess('home-1', correctGuessResults, true, 'Messi');
      });
      expect(result.current.state.targetShirts[0].state).toBe('correct');
      expect(result.current.state.targetShirts[0].name).toBe('Messi');
      expect(result.current.state.targetShirts[0].attempts).toBe(1);
      expect(result.current.state.targetShirts[0].guessHistory).toHaveLength(1);
      expect(result.current.state.targetShirts[0].correctLetters).toEqual(['M']);
      expect(result.current.state.activeShirtIndex).toBeNull();
      expect(result.current.state.gameStatus).toBe('playing');
    });

    it('marks a wrong guess as in-progress and keeps the modal open', () => {
      const { result } = renderHook(() => useGameState());
      act(() => {
        result.current.startNewGame(makeMatch());
      });
      act(() => {
        result.current.openShirt('home-1');
      });
      act(() => {
        result.current.submitGuess('home-1', wrongGuessResults, false);
      });
      expect(result.current.state.targetShirts[0].state).toBe('in-progress');
      expect(result.current.state.targetShirts[0].attempts).toBe(1);
      expect(result.current.state.targetShirts[0].guessHistory).toHaveLength(1);
      expect(result.current.state.activeShirtIndex).toBe(0);
      expect(result.current.state.gameStatus).toBe('playing');
    });
  });

  describe('revealName', () => {
    it('sets the revealed name on the matching token in both boards', () => {
      const { result } = renderHook(() => useGameState());
      act(() => {
        result.current.startNewGame(makeMatch());
      });
      act(() => {
        result.current.revealName('home-1', 'Messi');
      });
      expect(result.current.state.targetShirts[0].name).toBe('Messi');
      expect(result.current.state.targetShirts[1].name).toBeUndefined();
      expect(result.current.state.opponentShirts[0].name).toBeUndefined();
    });
  });

  describe('surrender', () => {
    it('completes the game and marks unresolved shirts as failed', () => {
      const { result } = renderHook(() => useGameState());
      act(() => {
        result.current.startNewGame(makeMatch());
      });
      act(() => {
        result.current.surrender();
      });
      expect(result.current.state.gameStatus).toBe('complete');
      expect(result.current.state.targetShirts.every(s => s.state === 'failed')).toBe(true);
      expect(result.current.state.opponentShirts.every(s => s.state === 'failed')).toBe(true);
    });
  });

  describe('newGame', () => {
    it('resets to the initial state', () => {
      const { result } = renderHook(() => useGameState());
      act(() => {
        result.current.startNewGame(makeMatch());
      });
      act(() => {
        result.current.newGame();
      });
      expect(result.current.state).toEqual(initialState);
    });
  });

  describe('setError', () => {
    it('sets the error and resets status to idle', () => {
      const { result } = renderHook(() => useGameState());
      act(() => {
        result.current.startNewGame(makeMatch());
      });
      act(() => {
        result.current.setError('Something went wrong');
      });
      expect(result.current.state.error).toBe('Something went wrong');
      expect(result.current.state.gameStatus).toBe('idle');
    });

    it('clears the error without changing the status', () => {
      const { result } = renderHook(() => useGameState());
      act(() => {
        result.current.setError('Something went wrong');
      });
      act(() => {
        result.current.setError(null);
      });
      expect(result.current.state.error).toBeNull();
      expect(result.current.state.gameStatus).toBe('idle');
    });
  });

  describe('setLoading', () => {
    it('sets status to loading when true', () => {
      const { result } = renderHook(() => useGameState());
      act(() => {
        result.current.setLoading(true);
      });
      expect(result.current.state.gameStatus).toBe('loading');
    });

    it('leaves the status unchanged when false', () => {
      const { result } = renderHook(() => useGameState());
      act(() => {
        result.current.setLoading(true);
      });
      act(() => {
        result.current.setLoading(false);
      });
      expect(result.current.state.gameStatus).toBe('loading');
    });
  });
});