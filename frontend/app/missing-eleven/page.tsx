'use client';

import { useCallback, useEffect } from 'react';
import { useGameState, evaluatePlayerGuess, MAX_ATTEMPTS } from '@/lib/gameState';
import { fetchRandomMatch } from '@/lib/api';
import MatchInfo from '@/components/MatchInfo';
import TacticBoard from '@/components/TacticBoard';
import WordleModal from '@/components/WordleModal';
import GameComplete from '@/components/GameComplete';
import type { ShirtData } from '@/types';

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Something went wrong.';
}

export default function MissingElevenPage() {
  const {
    state,
    startNewGame,
    openShirt,
    closeShirt,
    submitGuess,
    newGame,
    setError,
    setLoading,
  } = useGameState();

  // Initialize game on mount or restore from localStorage
  useEffect(() => {
    if (state.gameStatus === 'idle' && !state.match) {
      setLoading(true);
      fetchRandomMatch()
        .then((response) => {
          startNewGame(response);
        })
        .catch((cause: unknown) => {
          setError(describeError(cause));
        })
        .finally(() => {
          setLoading(false);
        });
    } else if (state.gameStatus === 'playing' && state.match) {
      // Game restored from localStorage
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Derive modal state directly from game state - no local state needed
  const activeShirtIndex = state.activeShirtIndex;
  const shouldShowModal = 
    activeShirtIndex !== null && 
    state.shirts[activeShirtIndex] &&
    (state.shirts[activeShirtIndex].state === 'default' || state.shirts[activeShirtIndex].state === 'in-progress');

  const activeShirt = shouldShowModal ? state.shirts[activeShirtIndex!] : null;
  const activeShirtState = activeShirt ? state.shirts.find(s => s.playerId === activeShirt.playerId) : null;
  const guessHistory = activeShirtState?.guessHistory ?? [];

  const handleShirtClick = useCallback((playerId: number) => {
    const shirt = state.shirts.find(s => s.playerId === playerId);
    if (!shirt) return;
    if (shirt.state === 'correct' || shirt.state === 'failed') return;
    if (state.gameStatus !== 'playing') return;
    openShirt(playerId);
  }, [state.shirts, state.gameStatus, openShirt]);

  const handleModalClose = useCallback(() => {
    closeShirt();
  }, [closeShirt]);

  const handleGuess = useCallback((guess: string) => {
    if (!activeShirt) return;
    
    // Find the shirt in state to get current attempts
    const shirtInState = state.shirts.find(s => s.playerId === activeShirt.playerId);
    const currentAttempts = shirtInState?.attempts ?? 0;
    
    const evaluation = evaluatePlayerGuess(guess, activeShirt.displayName, currentAttempts);
    
    submitGuess(activeShirt.playerId, guess, evaluation.results);
    
    // Modal will close via state change if correct or failed
  }, [activeShirt, state.shirts, submitGuess]);

  const handlePlayAgain = useCallback(() => {
    newGame();
    // Fetch new match
    setLoading(true);
    fetchRandomMatch()
      .then((response) => {
        startNewGame(response);
      })
      .catch((cause: unknown) => {
        setError(describeError(cause));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [newGame, startNewGame, setLoading, setError]);

  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    fetchRandomMatch()
      .then((response) => {
        startNewGame(response);
      })
      .catch((cause: unknown) => {
        setError(describeError(cause));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [startNewGame, setLoading, setError]);

  // Derive game complete state from gameStatus
  const isGameComplete = state.gameStatus === 'won' || state.gameStatus === 'lost';

  // Error state
  if (state.error) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-24 text-center md:px-6">
        <p className="text-lg font-semibold text-ink">Could not load the puzzle.</p>
        <p className="mt-2 max-w-sm text-sm text-ink/55">{state.error}</p>
        <button
          type="button"
          onClick={handleRetry}
          className="mt-6 rounded-lg bg-ink px-6 py-3 font-semibold text-chalk transition-colors hover:bg-flare focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare"
        >
          Try again
        </button>
      </div>
    );
  }

  // Loading state
  if (state.gameStatus === 'loading' || !state.match) {
    return (
      <div className="mx-auto flex w-full max-w-6xl items-center justify-center px-4 py-32 md:px-6">
        <p role="status" className="motion-safe:animate-pulse text-sm uppercase tracking-[0.15em] text-ink/55">
          Loading puzzle…
        </p>
      </div>
    );
  }

  const lineup = state.teamSide === 'home' ? state.match.homeLineup : state.match.awayLineup;
  const formation = state.teamSide === 'home' ? state.match.match.homeFormation : state.match.match.awayFormation;
  const teamName =
    (state.teamSide === 'home' ? state.match.match.homeClub?.name : state.match.match.awayClub?.name) ?? 'Unknown team';
  const shirts: ShirtData[] = lineup.map((entry) => {
    const existing = state.shirts.find(s => s.playerId === entry.playerId);
    return existing ? { ...entry, state: existing.state } : { ...entry, state: 'default' as const };
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-14">
      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,620px)] lg:items-start lg:gap-x-12 lg:gap-y-8">
        <header className="lg:col-start-1 lg:row-start-1">
          <h1 className="font-display text-[clamp(40px,6vw,64px)] uppercase leading-[0.95] text-ink">
            Missing Eleven
          </h1>
        </header>

        <div className="lg:col-start-1 lg:row-start-2">
          <MatchInfo match={state.match.match} />
        </div>

        <section className="lg:col-start-2 lg:row-start-1 lg:row-span-3" aria-label="Tactic board">
          <TacticBoard
            teamName={teamName}
            formation={formation}
            shirts={shirts}
            onShirtClick={handleShirtClick}
          />
        </section>

        <aside className="flex flex-col items-center gap-4 text-center lg:col-start-1 lg:row-start-3 lg:items-start lg:text-left">
          <p className="text-sm text-ink/70">Tap a shirt. Six tries per player.</p>
          <button
            type="button"
            onClick={handlePlayAgain}
            className="rounded-lg bg-ink px-6 py-3 font-semibold text-chalk transition-colors hover:bg-flare focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare"
          >
            New Puzzle
          </button>
        </aside>
      </div>

      {/* Wordle Modal */}
      {shouldShowModal && activeShirt && (
        <WordleModal
          targetName={activeShirt.displayName}
          shirtNumber={activeShirt.shirtNumber}
          position={activeShirt.position}
          guesses={guessHistory}
          maxAttempts={MAX_ATTEMPTS}
          onGuess={handleGuess}
          onClose={handleModalClose}
          isGameOver={guessHistory.length >= MAX_ATTEMPTS || guessHistory.some(g => g.every(r => r.result === 'correct'))}
          isCorrect={guessHistory.some(g => g.every(r => r.result === 'correct'))}
        />
      )}

      {/* Game Complete Overlay */}
      {isGameComplete && (
        <GameComplete
          isWin={state.gameStatus === 'won'}
          match={state.match.match}
          teamSide={state.teamSide}
          shirts={state.shirts}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </div>
  );
}
