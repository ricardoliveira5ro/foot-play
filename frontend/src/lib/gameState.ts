'use client';

import { useReducer, useCallback } from 'react';
import type { MatchResponse, ShirtData, ShirtState, TeamSide, LineupPlayer, GuessResult } from '@/types';

const MAX_ATTEMPTS = 6;

// --- Types ---

export type GameStatus = 'idle' | 'loading' | 'playing' | 'won' | 'lost';

export interface ShirtGameData extends ShirtData {
  /** Number of guess attempts made for this shirt */
  attempts: number;
  /** History of guess results for this shirt */
  guessHistory: GuessResult[][];
}

export interface GameState {
  match: MatchResponse | null;
  teamSide: TeamSide;
  shirts: ShirtGameData[];
  activeShirtIndex: number | null;
  gameStatus: GameStatus;
  error: string | null;
}

export type GameAction =
  | { type: 'SET_MATCH'; payload: MatchResponse }
  | { type: 'SELECT_TEAM'; payload: TeamSide }
  | { type: 'OPEN_SHIRT'; payload: string }
  | { type: 'CLOSE_SHIRT' }
  | { type: 'SUBMIT_GUESS'; payload: { token: string; results: GuessResult[]; isCorrect: boolean; name?: string } }
  | { type: 'NEW_GAME' }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_LOADING'; payload: boolean };

// --- Initial State ---

const initialState: GameState = {
  match: null,
  teamSide: 'home',
  shirts: [],
  activeShirtIndex: null,
  gameStatus: 'idle',
  error: null,
};

// --- Helpers ---

function pickSide(response: MatchResponse): TeamSide {
  if (response.homeLineup.length === 0 && response.awayLineup.length === 0) {
    throw new Error('This match has no lineup data.');
  }
  const preferred: TeamSide = Math.random() < 0.5 ? 'home' : 'away';
  const preferredLineup = preferred === 'home' ? response.homeLineup : response.awayLineup;
  return preferredLineup.length > 0 ? preferred : preferred === 'home' ? 'away' : 'home';
}

function createShirts(lineup: LineupPlayer[]): ShirtGameData[] {
  return lineup.map(entry => ({
    ...entry,
    state: 'default' as ShirtState,
    attempts: 0,
    guessHistory: [],
  }));
}

function updateShirtState(
  shirts: ShirtGameData[],
  token: string,
  updates: Partial<ShirtGameData>
): ShirtGameData[] {
  return shirts.map(shirt => {
    if (shirt.token === token) {
      return { ...shirt, ...updates };
    }
    return shirt;
  });
}

function checkWinCondition(shirts: ShirtGameData[]): boolean {
  return shirts.every(shirt => shirt.state === 'correct');
}

// --- Reducer ---

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_MATCH': {
      const side = pickSide(action.payload);
      const lineup = side === 'home' ? action.payload.homeLineup : action.payload.awayLineup;
      return {
        ...state,
        match: action.payload,
        teamSide: side,
        shirts: createShirts(lineup),
        gameStatus: 'playing',
        error: null,
        activeShirtIndex: null,
      };
    }

    case 'SELECT_TEAM': {
      if (!state.match) return state;
      const lineup = action.payload === 'home' ? state.match.homeLineup : state.match.awayLineup;
      return {
        ...state,
        teamSide: action.payload,
        shirts: createShirts(lineup),
        activeShirtIndex: null,
      };
    }

    case 'OPEN_SHIRT': {
      const shirtIndex = state.shirts.findIndex(s => s.token === action.payload);
      if (shirtIndex === -1) return state;
      const shirt = state.shirts[shirtIndex];
      if (shirt.state === 'correct' || shirt.state === 'failed') return state;
      return {
        ...state,
        activeShirtIndex: shirtIndex,
      };
    }

    case 'CLOSE_SHIRT': {
      return {
        ...state,
        activeShirtIndex: null,
      };
    }

    case 'SUBMIT_GUESS': {
      if (!state.match || state.gameStatus !== 'playing') return state;

      const { token, results, isCorrect, name } = action.payload;
      const shirtIndex = state.shirts.findIndex(s => s.token === token);
      if (shirtIndex === -1) return state;

      const shirt = state.shirts[shirtIndex];
      if (shirt.state === 'correct' || shirt.state === 'failed') return state;

      const newAttempts = shirt.attempts + 1;
      const isLastAttempt = newAttempts >= MAX_ATTEMPTS;

      let newShirtState: ShirtState;
      let newGameStatus: GameStatus = state.gameStatus;
      let shouldCloseModal = false;

      if (isCorrect) {
        newShirtState = 'correct';
        shouldCloseModal = true;
        // Check win condition
        const updatedShirts = updateShirtState(state.shirts, token, {
          state: newShirtState,
          attempts: newAttempts,
          guessHistory: [...shirt.guessHistory, results],
          name,
        });
        if (checkWinCondition(updatedShirts)) {
          newGameStatus = 'won';
        }
        return {
          ...state,
          shirts: updatedShirts,
          gameStatus: newGameStatus,
          activeShirtIndex: shouldCloseModal ? null : state.activeShirtIndex,
        };
      } else if (isLastAttempt) {
        // Failed - no more attempts
        newShirtState = 'failed';
        shouldCloseModal = true;
        const updatedShirts = updateShirtState(state.shirts, token, {
          state: newShirtState,
          attempts: newAttempts,
          guessHistory: [...shirt.guessHistory, results],
        });
        // Immediate loss on first failed shirt
        newGameStatus = 'lost';
        return {
          ...state,
          shirts: updatedShirts,
          gameStatus: newGameStatus,
          activeShirtIndex: null,
        };
      } else {
        // In progress - more attempts remaining
        newShirtState = 'in-progress';
        const updatedShirts = updateShirtState(state.shirts, token, {
          state: newShirtState,
          attempts: newAttempts,
          guessHistory: [...shirt.guessHistory, results],
        });
        return {
          ...state,
          shirts: updatedShirts,
          activeShirtIndex: state.activeShirtIndex,
        };
      }
    }

    case 'NEW_GAME': {
      return initialState;
    }

    case 'SET_ERROR': {
      return {
        ...state,
        error: action.payload,
        gameStatus: action.payload ? 'idle' : state.gameStatus,
      };
    }

    case 'SET_LOADING': {
      return {
        ...state,
        gameStatus: action.payload ? 'loading' : state.gameStatus,
      };
    }

    default:
      return state;
  }
}

// --- Hook ---

interface UseGameStateReturn {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  startNewGame: (match: MatchResponse) => void;
  selectTeam: (side: TeamSide) => void;
  openShirt: (token: string) => void;
  closeShirt: () => void;
  submitGuess: (token: string, results: GuessResult[], isCorrect: boolean, name?: string) => void;
  newGame: () => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
}

export function useGameState(): UseGameStateReturn {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  // Action creators
  const startNewGame = useCallback((match: MatchResponse) => {
    dispatch({ type: 'SET_MATCH', payload: match });
  }, []);

  const selectTeam = useCallback((side: TeamSide) => {
    dispatch({ type: 'SELECT_TEAM', payload: side });
  }, []);

  const openShirt = useCallback((token: string) => {
    dispatch({ type: 'OPEN_SHIRT', payload: token });
  }, []);

  const closeShirt = useCallback(() => {
    dispatch({ type: 'CLOSE_SHIRT' });
  }, []);

  const submitGuess = useCallback((token: string, results: GuessResult[], isCorrect: boolean, name?: string) => {
    dispatch({ type: 'SUBMIT_GUESS', payload: { token, results, isCorrect, name } });
  }, []);

  const newGame = useCallback(() => {
    dispatch({ type: 'NEW_GAME' });
  }, []);

  const setError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: error });
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: loading });
  }, []);

  return {
    state,
    dispatch,
    startNewGame,
    selectTeam,
    openShirt,
    closeShirt,
    submitGuess,
    newGame,
    setError,
    setLoading,
  };
}

export { MAX_ATTEMPTS };
