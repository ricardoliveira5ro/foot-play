'use client';

import { useReducer, useEffect, useCallback } from 'react';
import type { MatchResponse, ShirtData, ShirtState, TeamSide, LineupPlayer } from '@/types';
import { evaluateGuess } from './wordle';

const STORAGE_KEY = 'footplay-game-session';
const STORAGE_VERSION = 2; // Increment to force migration
const DEBOUNCE_MS = 300;
const MAX_ATTEMPTS = 6;

// --- Types ---

export type GameStatus = 'idle' | 'loading' | 'playing' | 'won' | 'lost';

export interface ShirtGameData extends ShirtData {
  /** Number of guess attempts made for this shirt */
  attempts: number;
  /** History of guess results for this shirt */
  guessHistory: ReturnType<typeof evaluateGuess>[];
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
  | { type: 'OPEN_SHIRT'; payload: number }
  | { type: 'CLOSE_SHIRT' }
  | { type: 'SUBMIT_GUESS'; payload: { playerId: number; guess: string; results: ReturnType<typeof evaluateGuess> } }
  | { type: 'RESTORE_SESSION'; payload: GameState }
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
  playerId: number,
  updates: Partial<ShirtGameData>
): ShirtGameData[] {
  return shirts.map(shirt => {
    if (shirt.playerId === playerId) {
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
      const shirtIndex = state.shirts.findIndex(s => s.playerId === action.payload);
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

      const { playerId, results } = action.payload;
      const shirtIndex = state.shirts.findIndex(s => s.playerId === playerId);
      if (shirtIndex === -1) return state;

      const shirt = state.shirts[shirtIndex];
      if (shirt.state === 'correct' || shirt.state === 'failed') return state;

      const isCorrect = results.every(r => r.result === 'correct');
      const newAttempts = shirt.attempts + 1;
      const isLastAttempt = newAttempts >= MAX_ATTEMPTS;

      let newShirtState: ShirtState;
      let newGameStatus: GameStatus = state.gameStatus;
      let shouldCloseModal = false;

      if (isCorrect) {
        newShirtState = 'correct';
        shouldCloseModal = true;
        // Check win condition
        const updatedShirts = updateShirtState(state.shirts, playerId, {
          state: newShirtState,
          attempts: newAttempts,
          guessHistory: [...shirt.guessHistory, results],
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
        const updatedShirts = updateShirtState(state.shirts, playerId, {
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
        const updatedShirts = updateShirtState(state.shirts, playerId, {
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

    case 'RESTORE_SESSION': {
      // Validate restored state
      if (!action.payload.match || action.payload.shirts.length === 0) {
        return initialState;
      }
      // Ensure all shirts have the new fields
      const shirtsWithDefaults = action.payload.shirts.map(s => ({
        ...s,
        attempts: s.attempts ?? 0,
        guessHistory: s.guessHistory ?? [],
      }));
      return {
        ...action.payload,
        shirts: shirtsWithDefaults,
        error: null,
      };
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

// --- LocalStorage Persistence ---

interface PersistedState {
  version: number;
  match: MatchResponse | null;
  teamSide: TeamSide;
  shirts: ShirtGameData[];
  activeShirtIndex: number | null;
  gameStatus: GameStatus;
  timestamp: number;
}

function serializeState(state: GameState): PersistedState {
  return {
    version: STORAGE_VERSION,
    match: state.match,
    teamSide: state.teamSide,
    shirts: state.shirts,
    activeShirtIndex: state.activeShirtIndex,
    gameStatus: state.gameStatus,
    timestamp: Date.now(),
  };
}

function deserializeState(data: unknown): GameState | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  
  // Version check - invalidate old sessions
  if (d.version !== STORAGE_VERSION) {
    return null;
  }
  
  if (
    typeof d.teamSide !== 'string' ||
    !Array.isArray(d.shirts) ||
    typeof d.gameStatus !== 'string' ||
    typeof d.timestamp !== 'number'
  ) {
    return null;
  }
  // Check if session is too old (24 hours)
  if (Date.now() - d.timestamp > 24 * 60 * 60 * 1000) {
    return null;
  }
  // Ensure shirts have required fields
  const shirts = (d.shirts as unknown[]).map(s => {
    const shirt = s as Record<string, unknown>;
    return {
      ...shirt,
      attempts: typeof shirt.attempts === 'number' ? shirt.attempts : 0,
      guessHistory: Array.isArray(shirt.guessHistory) ? shirt.guessHistory : [],
    };
  });
  return {
    match: d.match as MatchResponse | null,
    teamSide: d.teamSide as TeamSide,
    shirts: shirts as ShirtGameData[],
    activeShirtIndex: typeof d.activeShirtIndex === 'number' ? d.activeShirtIndex : null,
    gameStatus: d.gameStatus as GameStatus,
    error: null,
  };
}

function loadInitialState(): GameState {
  if (typeof window === 'undefined') return initialState;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return initialState;
    const parsed = JSON.parse(stored);
    const restored = deserializeState(parsed);
    return restored ?? initialState;
  } catch {
    return initialState;
  }
}

export function saveToLocalStorage(state: GameState): void {
  if (typeof window === 'undefined') return;
  try {
    const serialized = serializeState(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    // Ignore storage errors (private browsing, quota exceeded, etc.)
  }
}

export function loadFromLocalStorage(): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return deserializeState(parsed);
  } catch {
    return null;
  }
}

export function clearLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

// --- Hook ---

interface UseGameStateReturn {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  startNewGame: (match: MatchResponse) => void;
  selectTeam: (side: TeamSide) => void;
  openShirt: (playerId: number) => void;
  closeShirt: () => void;
  submitGuess: (playerId: number, guess: string, results: ReturnType<typeof evaluateGuess>) => void;
  newGame: () => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
}

export function useGameState(): UseGameStateReturn {
  const [state, dispatch] = useReducer(gameReducer, initialState, loadInitialState);

  // Debounced persistence
  useEffect(() => {
    if (state.gameStatus === 'idle' || state.gameStatus === 'loading') return;
    const timer = setTimeout(() => {
      saveToLocalStorage(state);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state]);

  // Action creators
  const startNewGame = useCallback((match: MatchResponse) => {
    dispatch({ type: 'SET_MATCH', payload: match });
  }, []);

  const selectTeam = useCallback((side: TeamSide) => {
    dispatch({ type: 'SELECT_TEAM', payload: side });
  }, []);

  const openShirt = useCallback((playerId: number) => {
    dispatch({ type: 'OPEN_SHIRT', payload: playerId });
  }, []);

  const closeShirt = useCallback(() => {
    dispatch({ type: 'CLOSE_SHIRT' });
  }, []);

  const submitGuess = useCallback((playerId: number, _guess: string, results: ReturnType<typeof evaluateGuess>) => {
    dispatch({ type: 'SUBMIT_GUESS', payload: { playerId, guess: _guess, results } });
  }, []);

  const newGame = useCallback(() => {
    clearLocalStorage();
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

// --- Utility: Evaluate guess and return detailed result ---

export interface GuessEvaluation {
  isCorrect: boolean;
  isFailed: boolean;
  results: ReturnType<typeof evaluateGuess>;
  attemptNumber: number;
  maxAttempts: number;
}

export function evaluatePlayerGuess(
  guess: string,
  targetName: string,
  currentAttempt: number,
  maxAttempts: number = MAX_ATTEMPTS
): GuessEvaluation {
  const results = evaluateGuess(guess, targetName);
  const isCorrect = results.every(r => r.result === 'correct');
  const isFailed = !isCorrect && currentAttempt >= maxAttempts - 1;
  return {
    isCorrect,
    isFailed,
    results,
    attemptNumber: currentAttempt,
    maxAttempts,
  };
}

export { MAX_ATTEMPTS };
