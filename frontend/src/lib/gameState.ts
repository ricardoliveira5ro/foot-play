'use client';

import { useReducer, useCallback } from 'react';
import type { GameResponse, ShirtData, ShirtState, TeamSide, LineupPlayer, GuessResult } from '@/types';
import { CURATED_TEAM_IDS } from '@/lib/curatedTeams';

const MAX_ATTEMPTS = 6;

// --- Types ---

export type GameStatus = 'idle' | 'loading' | 'playing' | 'complete';

export interface ShirtGameData extends ShirtData {
  /** Number of guess attempts made for this shirt */
  attempts: number;
  /** History of guess results for this shirt */
  guessHistory: GuessResult[][];
  /** Unique letters that received a CORRECT result across all guesses */
  correctLetters: string[];
}

export interface GameState {
  match: GameResponse | null;
  teamSide: TeamSide;
  /** 11 shirts for the picked team */
  targetShirts: ShirtGameData[];
  /** 11 shirts for the other team */
  opponentShirts: ShirtGameData[];
  /** Which board is displayed */
  activeBoard: 'target' | 'opponent';
  activeShirtIndex: number | null;
  gameStatus: GameStatus;
  error: string | null;
}

export type GameAction =
  | { type: 'SET_MATCH'; payload: GameResponse }
  | { type: 'SELECT_TEAM'; payload: TeamSide }
  | { type: 'TOGGLE_BOARD' }
  | { type: 'OPEN_SHIRT'; payload: string }
  | { type: 'CLOSE_SHIRT' }
  | { type: 'SUBMIT_GUESS'; payload: { token: string; results: GuessResult[]; isCorrect: boolean; name?: string } }
  | { type: 'REVEAL_NAME'; payload: { token: string; name: string } }
  | { type: 'SURRENDER' }
  | { type: 'NEW_GAME' }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_LOADING'; payload: boolean };

// --- Initial State ---

export const initialState: GameState = {
  match: null,
  teamSide: 'home',
  targetShirts: [],
  opponentShirts: [],
  activeBoard: 'target',
  activeShirtIndex: null,
  gameStatus: 'idle',
  error: null,
};

// --- Helpers ---

function pickSide(response: GameResponse): TeamSide {
  if (response.homeLineup.length === 0 && response.awayLineup.length === 0) {
    throw new Error('This match has no lineup data.');
  }

  const homeCurated = response.game.homeClub ? CURATED_TEAM_IDS.has(response.game.homeClub.clubId) : false;
  const awayCurated = response.game.awayClub ? CURATED_TEAM_IDS.has(response.game.awayClub.clubId) : false;

  // Prefer the curated side so the displayed team is always a curated team/nation.
  // If both (or neither) are curated, fall back to random for variety.
  let preferred: TeamSide;
  if (homeCurated && !awayCurated) {
    preferred = 'home';
  } else if (awayCurated && !homeCurated) {
    preferred = 'away';
  } else {
    preferred = crypto.getRandomValues(new Uint32Array(1))[0] % 2 === 0 ? 'home' : 'away';
  }

  const preferredLineup = preferred === 'home' ? response.homeLineup : response.awayLineup;
  if (preferredLineup.length > 0) return preferred;
  return preferred === 'home' ? 'away' : 'home';
}

function createShirts(lineup: LineupPlayer[]): ShirtGameData[] {
  return lineup.map(entry => ({
    ...entry,
    state: 'default' as ShirtState,
    attempts: 0,
    guessHistory: [],
    correctLetters: [],
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

function checkGameComplete(target: ShirtGameData[], opponent: ShirtGameData[]): boolean {
  const all = [...target, ...opponent];
  return all.length > 0 && all.every(s => s.state === 'correct' || s.state === 'failed');
}

/** Lineup swap for a chosen side: target = chosen side, opponent = the other. */
function lineupsForSide(
  match: GameResponse,
  side: TeamSide
): { targetLineup: LineupPlayer[]; opponentLineup: LineupPlayer[] } {
  const targetLineup = side === 'home' ? match.homeLineup : match.awayLineup;
  const opponentLineup = side === 'home' ? match.awayLineup : match.homeLineup;
  return { targetLineup, opponentLineup };
}

/** Deduplicate CORRECT letters from a guess against the existing set. */
function collectCorrectLetters(results: GuessResult[], existing: string[]): string[] {
  const correctLettersFromGuess = results
    .filter(r => r.result === 'CORRECT')
    .map(r => r.letter);
  return [...new Set([...existing, ...correctLettersFromGuess])];
}

/** Next shirt state after a guess: correct, failed on the last attempt, or in-progress. */
function nextShirtState(isCorrect: boolean, isLastAttempt: boolean): ShirtState {
  if (isCorrect) return 'correct';
  if (isLastAttempt) return 'failed';
  return 'in-progress';
}

/** Full SUBMIT_GUESS handling — extracted so the reducer case stays thin. */
function handleSubmitGuess(state: GameState, action: Extract<GameAction, { type: 'SUBMIT_GUESS' }>): GameState {
  if (!state.match || state.gameStatus !== 'playing') return state;

  const { token, results, isCorrect, name } = action.payload;
  const activeShirts = state.activeBoard === 'target' ? state.targetShirts : state.opponentShirts;
  const shirtIndex = activeShirts.findIndex(s => s.token === token);
  if (shirtIndex === -1) return state;

  const shirt = activeShirts[shirtIndex];
  if (shirt.state === 'correct' || shirt.state === 'failed') return state;

  const newAttempts = shirt.attempts + 1;
  const isLastAttempt = newAttempts >= MAX_ATTEMPTS;
  const newShirtState = nextShirtState(isCorrect, isLastAttempt);
  const shouldCloseModal = newShirtState === 'correct' || newShirtState === 'failed';

  const updatedActiveShirts = updateShirtState(activeShirts, token, {
    state: newShirtState,
    attempts: newAttempts,
    guessHistory: [...shirt.guessHistory, results],
    correctLetters: collectCorrectLetters(results, shirt.correctLetters),
    ...(isCorrect ? { name } : {}),
  });

  const updatedTarget = state.activeBoard === 'target' ? updatedActiveShirts : state.targetShirts;
  const updatedOpponent = state.activeBoard === 'opponent' ? updatedActiveShirts : state.opponentShirts;

  // Only end the game when ALL shirts on both boards are resolved.
  const isComplete = checkGameComplete(updatedTarget, updatedOpponent);

  return {
    ...state,
    targetShirts: updatedTarget,
    opponentShirts: updatedOpponent,
    gameStatus: isComplete ? 'complete' : state.gameStatus,
    activeShirtIndex: shouldCloseModal ? null : state.activeShirtIndex,
  };
}

/** Full SELECT_TEAM handling — extracted so the reducer case stays thin. */
function handleSelectTeam(state: GameState, action: Extract<GameAction, { type: 'SELECT_TEAM' }>): GameState {
  if (!state.match) return state;
  const { targetLineup, opponentLineup } = lineupsForSide(state.match, action.payload);
  return {
    ...state,
    teamSide: action.payload,
    targetShirts: createShirts(targetLineup),
    opponentShirts: createShirts(opponentLineup),
    activeBoard: 'target',
    activeShirtIndex: null,
  };
}

/** Full OPEN_SHIRT handling — extracted so the reducer case stays thin. */
function handleOpenShirt(state: GameState, action: Extract<GameAction, { type: 'OPEN_SHIRT' }>): GameState {
  const activeShirts = state.activeBoard === 'target' ? state.targetShirts : state.opponentShirts;
  const shirtIndex = activeShirts.findIndex(s => s.token === action.payload);
  if (shirtIndex === -1) return state;
  const shirt = activeShirts[shirtIndex];
  if (shirt.state === 'correct' || shirt.state === 'failed') return state;
  return {
    ...state,
    activeShirtIndex: shirtIndex,
  };
}

/** Full REVEAL_NAME handling — extracted so the reducer case stays thin. */
function handleRevealName(state: GameState, action: Extract<GameAction, { type: 'REVEAL_NAME' }>): GameState {
  const reveal = (shirts: ShirtGameData[]) =>
    shirts.map(s => (s.token === action.payload.token ? { ...s, name: action.payload.name } : s));
  return {
    ...state,
    targetShirts: reveal(state.targetShirts),
    opponentShirts: reveal(state.opponentShirts),
  };
}

/** Full SURRENDER handling — extracted so the reducer case stays thin. */
function handleSurrender(state: GameState): GameState {
  if (state.gameStatus !== 'playing') return state;

  const markFailed = (shirts: ShirtGameData[]) =>
    shirts.map(s => (s.state === 'correct' ? s : { ...s, state: 'failed' as ShirtState }));

  return {
    ...state,
    gameStatus: 'complete',
    targetShirts: markFailed(state.targetShirts),
    opponentShirts: markFailed(state.opponentShirts),
  };
}

/** Full SET_ERROR handling — extracted so the reducer case stays thin. */
function handleSetError(state: GameState, error: string | null): GameState {
  return {
    ...state,
    error,
    gameStatus: error ? 'idle' : state.gameStatus,
  };
}

/** Full SET_LOADING handling — extracted so the reducer case stays thin. */
function handleSetLoading(state: GameState, loading: boolean): GameState {
  return {
    ...state,
    gameStatus: loading ? 'loading' : state.gameStatus,
  };
}

// --- Reducer ---

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_MATCH': {
      const side = pickSide(action.payload);
      const { targetLineup, opponentLineup } = lineupsForSide(action.payload, side);
      return {
        ...state,
        match: action.payload,
        teamSide: side,
        targetShirts: createShirts(targetLineup),
        opponentShirts: createShirts(opponentLineup),
        activeBoard: 'target',
        gameStatus: 'playing',
        error: null,
        activeShirtIndex: null,
      };
    }

    case 'SELECT_TEAM': {
      return handleSelectTeam(state, action);
    }

    case 'TOGGLE_BOARD': {
      return {
        ...state,
        activeBoard: state.activeBoard === 'target' ? 'opponent' : 'target',
        activeShirtIndex: null,
      };
    }

    case 'OPEN_SHIRT': {
      return handleOpenShirt(state, action);
    }

    case 'CLOSE_SHIRT': {
      return {
        ...state,
        activeShirtIndex: null,
      };
    }

    case 'SUBMIT_GUESS': {
      return handleSubmitGuess(state, action);
    }

    case 'REVEAL_NAME': {
      return handleRevealName(state, action);
    }

    case 'SURRENDER': {
      return handleSurrender(state);
    }

    case 'NEW_GAME': {
      return initialState;
    }

    case 'SET_ERROR': {
      return handleSetError(state, action.payload);
    }

    case 'SET_LOADING': {
      return handleSetLoading(state, action.payload);
    }

    default:
      return state;
  }
}

// --- Hook ---

interface UseGameStateReturn {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  startNewGame: (match: GameResponse) => void;
  selectTeam: (side: TeamSide) => void;
  toggleBoard: () => void;
  openShirt: (token: string) => void;
  closeShirt: () => void;
  submitGuess: (token: string, results: GuessResult[], isCorrect: boolean, name?: string) => void;
  revealName: (token: string, name: string) => void;
  surrender: () => void;
  newGame: () => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
}

export function useGameState(): UseGameStateReturn {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  // Action creators
  const startNewGame = useCallback((match: GameResponse) => {
    dispatch({ type: 'SET_MATCH', payload: match });
  }, []);

  const selectTeam = useCallback((side: TeamSide) => {
    dispatch({ type: 'SELECT_TEAM', payload: side });
  }, []);

  const toggleBoard = useCallback(() => {
    dispatch({ type: 'TOGGLE_BOARD' });
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

  const revealName = useCallback((token: string, name: string) => {
    dispatch({ type: 'REVEAL_NAME', payload: { token, name } });
  }, []);

  const surrender = useCallback(() => {
    dispatch({ type: 'SURRENDER' });
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
    toggleBoard,
    openShirt,
    closeShirt,
    submitGuess,
    revealName,
    surrender,
    newGame,
    setError,
    setLoading,
  };
}

export { MAX_ATTEMPTS };