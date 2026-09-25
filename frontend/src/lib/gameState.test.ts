/**
 * Characterization tests for the gameReducer — written against the CURRENT
 * implementation (before the cognitive-complexity refactor). Any change in
 * behavior after the refactor will fail here.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { gameReducer, initialState, MAX_ATTEMPTS } from './gameState';
import type { GameState, GameAction } from './gameState';
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

function playingState(): GameState {
  return gameReducer(initialState, { type: 'SET_MATCH', payload: makeMatch() });
}

function openShirt(state: GameState, token: string): GameState {
  return gameReducer(state, { type: 'OPEN_SHIRT', payload: token });
}

function wrongGuess(token: string, results: GuessResult[] = [{ letter: 'X', result: 'ABSENT' }]) {
  return { type: 'SUBMIT_GUESS' as const, payload: { token, results, isCorrect: false } };
}

function correctGuess(token: string, name = 'Messi') {
  return {
    type: 'SUBMIT_GUESS' as const,
    payload: {
      token,
      results: [{ letter: 'M', result: 'CORRECT' as const }],
      isCorrect: true,
      name,
    },
  };
}

/**
 * Control the CSPRNG coin flip in `pickSide`: an even value picks 'home',
 * an odd value picks 'away' (mirrors the old `Math.random() < 0.5` mock).
 */
function mockCoinFlip(value: number) {
  vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
    (array as Uint32Array)[0] = value;
    return array;
  });
}

// --- Tests ---

describe('gameReducer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('SET_MATCH', () => {
    it('picks the curated home side deterministically and builds shirts', () => {
      const state = gameReducer(initialState, { type: 'SET_MATCH', payload: makeMatch() });
      expect(state.teamSide).toBe('home');
      expect(state.match).toEqual(makeMatch());
      expect(state.targetShirts).toHaveLength(2);
      expect(state.opponentShirts).toHaveLength(1);
      expect(state.targetShirts[0]).toMatchObject({
        token: 'home-1',
        state: 'default',
        attempts: 0,
        guessHistory: [],
        correctLetters: [],
      });
      expect(state.activeBoard).toBe('target');
      expect(state.gameStatus).toBe('playing');
      expect(state.error).toBeNull();
      expect(state.activeShirtIndex).toBeNull();
    });

    it('throws when both lineups are empty', () => {
      const empty = makeMatch({ homeLineup: [], awayLineup: [] });
      expect(() => gameReducer(initialState, { type: 'SET_MATCH', payload: empty })).toThrow(
        'This match has no lineup data.'
      );
    });

    it('picks home when both clubs are curated and the coin flip is even', () => {
      mockCoinFlip(0);
      const bothCurated = makeMatch({
        game: { ...makeMatch().game, awayClub: { clubId: 281, name: 'Manchester City' } },
      });
      const state = gameReducer(initialState, { type: 'SET_MATCH', payload: bothCurated });
      expect(state.teamSide).toBe('home');
    });

    it('picks away when both clubs are curated and the coin flip is odd', () => {
      mockCoinFlip(1);
      const bothCurated = makeMatch({
        game: { ...makeMatch().game, awayClub: { clubId: 281, name: 'Manchester City' } },
      });
      const state = gameReducer(initialState, { type: 'SET_MATCH', payload: bothCurated });
      expect(state.teamSide).toBe('away');
    });

    it('picks home when neither club is curated and the coin flip is even', () => {
      mockCoinFlip(0);
      const neitherCurated = makeMatch({
        game: {
          ...makeMatch().game,
          homeClub: { clubId: 998, name: 'Team A' },
          awayClub: { clubId: 997, name: 'Team B' },
        },
      });
      const state = gameReducer(initialState, { type: 'SET_MATCH', payload: neitherCurated });
      expect(state.teamSide).toBe('home');
    });

    it('picks away when neither club is curated and the coin flip is odd', () => {
      mockCoinFlip(1);
      const neitherCurated = makeMatch({
        game: {
          ...makeMatch().game,
          homeClub: { clubId: 998, name: 'Team A' },
          awayClub: { clubId: 997, name: 'Team B' },
        },
      });
      const state = gameReducer(initialState, { type: 'SET_MATCH', payload: neitherCurated });
      expect(state.teamSide).toBe('away');
    });

    it('falls back to the non-curated side when the curated home side has no lineup', () => {
      // Home is curated (294) and preferred, but its lineup is empty — pickSide
      // must fall back to the away side instead of returning an empty board.
      const match = makeMatch({ homeLineup: [], awayLineup: [player('away-1')] });
      const state = gameReducer(initialState, { type: 'SET_MATCH', payload: match });
      expect(state.teamSide).toBe('away');
      expect(state.targetShirts).toHaveLength(1);
      expect(state.targetShirts[0].token).toBe('away-1');
      expect(state.opponentShirts).toHaveLength(0);
    });

    it('falls back to the non-curated side when the curated away side has no lineup', () => {
      // Away is curated (281) and preferred, but its lineup is empty — pickSide
      // must fall back to the home side instead of returning an empty board.
      const match = makeMatch({
        game: {
          ...makeMatch().game,
          homeClub: { clubId: 998, name: 'Team A' },
          awayClub: { clubId: 281, name: 'Manchester City' },
        },
        homeLineup: [player('home-1')],
        awayLineup: [],
      });
      const state = gameReducer(initialState, { type: 'SET_MATCH', payload: match });
      expect(state.teamSide).toBe('home');
      expect(state.targetShirts).toHaveLength(1);
      expect(state.targetShirts[0].token).toBe('home-1');
      expect(state.opponentShirts).toHaveLength(0);
    });

    it('returns the state unchanged for an unknown action type', () => {
      const state = playingState();
      const next = gameReducer(state, { type: 'UNKNOWN' } as unknown as GameAction);
      expect(next).toBe(state);
    });
  });

  describe('SELECT_TEAM', () => {
    it('rebuilds shirts for the chosen side and resets board state', () => {
      const state = playingState(); // teamSide 'home', target 2 shirts, opponent 1 shirt
      const next = gameReducer(state, { type: 'SELECT_TEAM', payload: 'away' });
      expect(next.teamSide).toBe('away');
      expect(next.targetShirts).toHaveLength(1);
      expect(next.opponentShirts).toHaveLength(2);
      expect(next.targetShirts[0].token).toBe('away-1');
      expect(next.activeBoard).toBe('target');
      expect(next.activeShirtIndex).toBeNull();
      expect(next.gameStatus).toBe(state.gameStatus); // unchanged
    });

    it('is a no-op without a match', () => {
      const next = gameReducer(initialState, { type: 'SELECT_TEAM', payload: 'away' });
      expect(next).toBe(initialState);
    });
  });

  describe('TOGGLE_BOARD', () => {
    it('flips the active board and resets the active shirt', () => {
      const state = openShirt(playingState(), 'home-1');
      expect(state.activeBoard).toBe('target');
      expect(state.activeShirtIndex).toBe(0);
      const next = gameReducer(state, { type: 'TOGGLE_BOARD' });
      expect(next.activeBoard).toBe('opponent');
      expect(next.activeShirtIndex).toBeNull();
    });

    it('flips back to target', () => {
      const state = gameReducer(playingState(), { type: 'TOGGLE_BOARD' });
      expect(state.activeBoard).toBe('opponent');
      const next = gameReducer(state, { type: 'TOGGLE_BOARD' });
      expect(next.activeBoard).toBe('target');
    });
  });

  describe('OPEN_SHIRT', () => {
    it('opens a resolvable shirt on the active board', () => {
      const state = gameReducer(playingState(), { type: 'OPEN_SHIRT', payload: 'home-1' });
      expect(state.activeShirtIndex).toBe(0);
    });

    it('is a no-op for an unknown token', () => {
      const state = playingState();
      const next = gameReducer(state, { type: 'OPEN_SHIRT', payload: 'unknown' });
      expect(next).toBe(state);
    });

    it('is a no-op for a resolved shirt', () => {
      let state = openShirt(playingState(), 'home-1');
      state = gameReducer(state, correctGuess('home-1'));
      expect(state.targetShirts[0].state).toBe('correct');
      const next = gameReducer(state, { type: 'OPEN_SHIRT', payload: 'home-1' });
      expect(next).toBe(state);
    });
  });

  describe('CLOSE_SHIRT', () => {
    it('clears the active shirt index', () => {
      const state = openShirt(playingState(), 'home-1');
      expect(state.activeShirtIndex).toBe(0);
      const next = gameReducer(state, { type: 'CLOSE_SHIRT' });
      expect(next.activeShirtIndex).toBeNull();
    });
  });

  describe('SUBMIT_GUESS', () => {
    it('marks a correct guess as correct, stores the name, and closes the modal', () => {
      const state = openShirt(playingState(), 'home-1');
      const next = gameReducer(state, correctGuess('home-1', 'Messi'));
      expect(next.targetShirts[0].state).toBe('correct');
      expect(next.targetShirts[0].name).toBe('Messi');
      expect(next.targetShirts[0].attempts).toBe(1);
      expect(next.targetShirts[0].guessHistory).toHaveLength(1);
      expect(next.targetShirts[0].correctLetters).toEqual(['M']);
      expect(next.activeShirtIndex).toBeNull();
      expect(next.gameStatus).toBe('playing');
    });

    it('marks a wrong guess as in-progress and keeps the modal open', () => {
      const state = openShirt(playingState(), 'home-1');
      const next = gameReducer(state, wrongGuess('home-1'));
      expect(next.targetShirts[0].state).toBe('in-progress');
      expect(next.targetShirts[0].attempts).toBe(1);
      expect(next.targetShirts[0].guessHistory).toHaveLength(1);
      expect(next.activeShirtIndex).toBe(0);
      expect(next.gameStatus).toBe('playing');
    });

    it('marks a wrong guess on the last attempt as failed and closes the modal', () => {
      let state = openShirt(playingState(), 'home-1');
      for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
        state = gameReducer(state, wrongGuess('home-1'));
      }
      expect(state.targetShirts[0].attempts).toBe(MAX_ATTEMPTS - 1);
      expect(state.targetShirts[0].state).toBe('in-progress');
      const next = gameReducer(state, wrongGuess('home-1'));
      expect(next.targetShirts[0].state).toBe('failed');
      expect(next.targetShirts[0].attempts).toBe(MAX_ATTEMPTS);
      expect(next.activeShirtIndex).toBeNull();
    });

    it('deduplicates correct letters across guesses', () => {
      let state = openShirt(playingState(), 'home-1');
      state = gameReducer(state, {
        type: 'SUBMIT_GUESS',
        payload: {
          token: 'home-1',
          results: [
            { letter: 'M', result: 'CORRECT' },
            { letter: 'X', result: 'ABSENT' },
          ],
          isCorrect: false,
        },
      });
      expect(state.targetShirts[0].correctLetters).toEqual(['M']);
      const next = gameReducer(state, {
        type: 'SUBMIT_GUESS',
        payload: {
          token: 'home-1',
          results: [
            { letter: 'M', result: 'CORRECT' },
            { letter: 'E', result: 'CORRECT' },
          ],
          isCorrect: false,
        },
      });
      expect(next.targetShirts[0].correctLetters).toEqual(['M', 'E']);
    });

    it('is a no-op without a match', () => {
      const next = gameReducer(initialState, wrongGuess('home-1'));
      expect(next).toBe(initialState);
    });

    it('is a no-op when the game is not playing', () => {
      const state = { ...playingState(), gameStatus: 'complete' as const };
      const next = gameReducer(state, wrongGuess('home-1'));
      expect(next).toBe(state);
    });

    it('is a no-op for an unknown token', () => {
      const state = openShirt(playingState(), 'home-1');
      const next = gameReducer(state, wrongGuess('unknown'));
      expect(next).toBe(state);
    });

    it('is a no-op for a resolved shirt', () => {
      let state = openShirt(playingState(), 'home-1');
      state = gameReducer(state, correctGuess('home-1'));
      const next = gameReducer(state, wrongGuess('home-1'));
      expect(next).toBe(state);
    });

    it('stays playing when only one board is fully resolved', () => {
      let state = playingState();
      // Resolve both home shirts (target board) — away board still unresolved.
      state = gameReducer(state, { type: 'OPEN_SHIRT', payload: 'home-1' });
      state = gameReducer(state, correctGuess('home-1'));
      state = gameReducer(state, { type: 'OPEN_SHIRT', payload: 'home-2' });
      state = gameReducer(state, correctGuess('home-2'));
      expect(state.targetShirts.every(s => s.state === 'correct')).toBe(true);
      expect(state.opponentShirts.some(s => s.state !== 'correct' && s.state !== 'failed')).toBe(true);
      expect(state.gameStatus).toBe('playing');
    });

    it('completes only when all shirts on both boards are resolved', () => {
      let state = playingState();
      // Resolve the target board (home shirts).
      for (const token of ['home-1', 'home-2']) {
        state = gameReducer(state, { type: 'OPEN_SHIRT', payload: token });
        state = gameReducer(state, correctGuess(token));
      }
      // Switch to the opponent board and resolve it too.
      state = gameReducer(state, { type: 'TOGGLE_BOARD' });
      state = gameReducer(state, { type: 'OPEN_SHIRT', payload: 'away-1' });
      state = gameReducer(state, correctGuess('away-1'));
      expect(state.gameStatus).toBe('complete');
    });
  });

  describe('REVEAL_NAME', () => {
    it('sets the name on the matching token in both boards', () => {
      const state = playingState();
      const next = gameReducer(state, { type: 'REVEAL_NAME', payload: { token: 'home-1', name: 'Messi' } });
      expect(next.targetShirts[0].name).toBe('Messi');
      expect(next.targetShirts[1].name).toBeUndefined();
      expect(next.opponentShirts[0].name).toBeUndefined();
    });
  });

  describe('SURRENDER', () => {
    it('completes the game and marks non-correct shirts as failed', () => {
      const state = playingState();
      const next = gameReducer(state, { type: 'SURRENDER' });
      expect(next.gameStatus).toBe('complete');
      expect(next.targetShirts.every(s => s.state === 'failed')).toBe(true);
      expect(next.opponentShirts.every(s => s.state === 'failed')).toBe(true);
    });

    it('keeps correct shirts correct when surrendering', () => {
      let state = openShirt(playingState(), 'home-1');
      state = gameReducer(state, correctGuess('home-1'));
      const next = gameReducer(state, { type: 'SURRENDER' });
      expect(next.gameStatus).toBe('complete');
      expect(next.targetShirts[0].state).toBe('correct');
      expect(next.targetShirts[1].state).toBe('failed');
    });

    it('is a no-op when not playing', () => {
      const state = { ...playingState(), gameStatus: 'complete' as const };
      const next = gameReducer(state, { type: 'SURRENDER' });
      expect(next).toBe(state);
    });
  });

  describe('NEW_GAME', () => {
    it('returns the initial state', () => {
      const state = playingState();
      const next = gameReducer(state, { type: 'NEW_GAME' });
      expect(next).toEqual(initialState);
    });
  });

  describe('SET_ERROR', () => {
    it('sets the error and resets status to idle', () => {
      const state = playingState();
      const next = gameReducer(state, { type: 'SET_ERROR', payload: 'Something went wrong' });
      expect(next.error).toBe('Something went wrong');
      expect(next.gameStatus).toBe('idle');
    });

    it('clears the error without changing the status', () => {
      const state = { ...playingState(), error: 'Something went wrong', gameStatus: 'idle' as const };
      const next = gameReducer(state, { type: 'SET_ERROR', payload: null });
      expect(next.error).toBeNull();
      expect(next.gameStatus).toBe('idle');
    });
  });

  describe('SET_LOADING', () => {
    it('sets status to loading when true', () => {
      const state = { ...initialState, gameStatus: 'idle' as const };
      const next = gameReducer(state, { type: 'SET_LOADING', payload: true });
      expect(next.gameStatus).toBe('loading');
    });

    it('leaves the status unchanged when false', () => {
      const state = { ...initialState, gameStatus: 'loading' as const };
      const next = gameReducer(state, { type: 'SET_LOADING', payload: false });
      expect(next.gameStatus).toBe('loading');
    });
  });
});