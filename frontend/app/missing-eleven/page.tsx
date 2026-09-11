'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameState, MAX_ATTEMPTS } from '@/lib/gameState';
import { fetchRandomMatch, submitGuess as submitGuessApi, fetchReveal, revealOnePlayer } from '@/lib/api';
import MatchInfo from '@/components/MatchInfo';
import TacticBoard from '@/components/TacticBoard';
import WordleModal from '@/components/WordleModal';
import GameComplete from '@/components/GameComplete';
import ScoreCounter from '@/components/ScoreCounter';
import { computeTotalScore } from '@/lib/scoring';
import type { ShirtData, RevealPlayer } from '@/types';

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
    revealName,
    surrender,
    newGame,
    setError,
    setLoading,
    toggleBoard,
  } = useGameState();

  const [revealedPlayers, setRevealedPlayers] = useState<RevealPlayer[]>([]);
  const [confirmingSurrender, setConfirmingSurrender] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSurrender = useCallback(async () => {
    if (confirmingSurrender) {
      // Second click — actually surrender
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmingSurrender(false);

      if (!state.match) return;

      try {
        const pickedSide = state.teamSide;
        const oppositeSide = pickedSide === 'home' ? 'away' : 'home';

        // Reveal both teams
        const [picked, opposite] = await Promise.all([
          fetchReveal(state.match.game.gameId, pickedSide),
          fetchReveal(state.match.game.gameId, oppositeSide),
        ]);
        setRevealedPlayers([...picked.players, ...opposite.players]);

        // Reveal names on all unresolved shirts
        const allRevealed = [...picked.players, ...opposite.players];
        const allShirts = [...state.targetShirts, ...state.opponentShirts];
        for (const player of allRevealed) {
          const shirt = allShirts.find(s => s.shirtNumber === player.shirtNumber && s.state !== 'correct');
          if (shirt) {
            revealName(shirt.token, player.name);
          }
        }

        // Mark game as complete
        surrender();
      } catch (cause: unknown) {
        setError(describeError(cause));
      }
    } else {
      // First click — show confirmation
      setConfirmingSurrender(true);
      confirmTimerRef.current = setTimeout(() => {
        setConfirmingSurrender(false);
      }, 4000);
    }
  }, [confirmingSurrender, state.match, state.teamSide, state.targetShirts, state.opponentShirts, revealName, surrender, setError]);

  // Initialize game on mount (no localStorage restore — fixes hydration mismatch)
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Fetch revealed names when the game completes (both teams in parallel)
  useEffect(() => {
    if (state.gameStatus === 'complete' && state.match) {
      const pickedSide = state.teamSide;
      const oppositeSide = pickedSide === 'home' ? 'away' : 'home';
      
      Promise.all([
        fetchReveal(state.match.game.gameId, pickedSide),
        fetchReveal(state.match.game.gameId, oppositeSide),
      ])
        .then(([picked, opposite]) => {
          setRevealedPlayers([...picked.players, ...opposite.players]);
        })
        .catch((cause: unknown) => {
          setError(describeError(cause));
        });
    }
  }, [state.gameStatus, state.match, state.teamSide, setError]);

  // Cleanup confirm timer on unmount
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  // Derive active shirts array from the state
  const activeShirtsArray = state.activeBoard === 'target' ? state.targetShirts : state.opponentShirts;

  const activeShirtIndex = state.activeShirtIndex;
  const shouldShowModal = 
    activeShirtIndex !== null && 
    activeShirtsArray[activeShirtIndex] &&
    (activeShirtsArray[activeShirtIndex].state === 'default' || activeShirtsArray[activeShirtIndex].state === 'in-progress');

  const activeShirt = shouldShowModal ? activeShirtsArray[activeShirtIndex!] : null;
  const guessHistory = activeShirt?.guessHistory ?? [];

  const handleShirtClick = useCallback((token: string) => {
    const shirtsArr = state.activeBoard === 'target' ? state.targetShirts : state.opponentShirts;
    const shirt = shirtsArr.find(s => s.token === token);
    if (!shirt) return;
    if (shirt.state === 'correct' || shirt.state === 'failed') return;
    if (state.gameStatus !== 'playing') return;
    openShirt(token);
  }, [state.targetShirts, state.opponentShirts, state.activeBoard, state.gameStatus, openShirt]);

  const handleModalClose = useCallback(() => {
    closeShirt();
  }, [closeShirt]);

  const handleGuess = useCallback(async (guess: string) => {
    if (!activeShirt || !state.match) return;

    try {
      const response = await submitGuessApi(state.match.game.gameId, activeShirt.token, guess);
      submitGuess(activeShirt.token, response.results, response.isCorrect, response.name);

      // If this was the last attempt and it failed, reveal the player's name
      const isLastAttempt = activeShirt.guessHistory.length + 1 >= MAX_ATTEMPTS;
      if (!response.isCorrect && isLastAttempt) {
        const reveal = await revealOnePlayer(state.match.game.gameId, activeShirt.token);
        revealName(activeShirt.token, reveal.name);
      }
    } catch (cause: unknown) {
      setError(describeError(cause));
    }
    // Modal will close via state change if correct or failed
  }, [activeShirt, state.match, submitGuess, revealName, setError]);

  const handlePlayAgain = useCallback(() => {
    setRevealedPlayers([]);
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
  const isGameComplete = state.gameStatus === 'complete';

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

  // Determine which side is active based on the board
  const activeTeamSide = state.activeBoard === 'target' ? state.teamSide : (state.teamSide === 'home' ? 'away' : 'home');
  const lineup = activeTeamSide === 'home' ? state.match.homeLineup : state.match.awayLineup;
  const formation = activeTeamSide === 'home' ? state.match.game.homeFormation : state.match.game.awayFormation;
  const teamName = (activeTeamSide === 'home' ? state.match.game.homeClub?.name : state.match.game.awayClub?.name) ?? 'Unknown team';
  const clubId = activeTeamSide === 'home' ? state.match.game.homeClub?.clubId : state.match.game.awayClub?.clubId;

  // Build shirts for the active board by merging lineup with game state
  const activeShirtsForBoard = state.activeBoard === 'target' ? state.targetShirts : state.opponentShirts;
  const shirts: ShirtData[] = lineup.map((entry) => {
    const existing = activeShirtsForBoard.find(s => s.token === entry.token);
    return existing
      ? { ...entry, state: existing.state, guessHistory: existing.guessHistory, name: existing.name }
      : { ...entry, state: 'default' as const, guessHistory: [] };
  });

  // Team names for the tab bar
  const targetTeamName = (state.teamSide === 'home' ? state.match.game.homeClub?.name : state.match.game.awayClub?.name) ?? 'Home';
  const opponentTeamName = (state.teamSide === 'home' ? state.match.game.awayClub?.name : state.match.game.homeClub?.name) ?? 'Away';

  // Solved counts for progress pills
  const targetSolved = state.targetShirts.filter(s => s.state === 'correct').length;
  const opponentSolved = state.opponentShirts.filter(s => s.state === 'correct').length;

  // Live score — recomputed after each guess from the current state
  const scoreBreakdown =
    (state.gameStatus === 'playing' || state.gameStatus === 'complete') && state.match
      ? computeTotalScore(state.targetShirts, state.opponentShirts, targetTeamName, opponentTeamName)
      : null;
  const liveScore = scoreBreakdown?.grandTotal ?? 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-14">
      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,620px)] lg:items-start lg:gap-x-12 lg:gap-y-8">
        <header className="lg:col-start-1 lg:row-start-1">
          <h1 className="font-display text-[clamp(40px,6vw,64px)] uppercase leading-[0.95] text-ink">
            Missing Eleven
          </h1>
        </header>

        <div className="lg:col-start-1 lg:row-start-2">
          <MatchInfo match={state.match.game} />
        </div>

        {state.gameStatus === 'playing' && (
          <div className="lg:col-start-1 lg:row-start-3">
            <ScoreCounter score={liveScore} />
          </div>
        )}

        {/* Tactic Board section */}
        <section className="lg:col-start-2 lg:row-start-1 lg:row-span-4" aria-label="Tactic board">
          <TacticBoard
            teamName={teamName}
            formation={formation}
            shirts={shirts}
            onShirtClick={handleShirtClick}
            clubId={clubId}
            activeBoard={state.activeBoard}
            targetTeamName={targetTeamName}
            opponentTeamName={opponentTeamName}
            targetSolved={targetSolved}
            opponentSolved={opponentSolved}
            onToggleBoard={toggleBoard}
          />
        </section>

        <aside className="flex flex-col items-center gap-4 text-center lg:col-start-1 lg:row-start-4 lg:items-start lg:text-left">
          <p className="text-sm text-ink/70">Tap a shirt. Six tries per player.</p>
          <button
            type="button"
            onClick={handlePlayAgain}
            className="rounded-lg bg-ink px-6 py-3 font-semibold text-chalk transition-colors hover:bg-flare focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare"
          >
            New Puzzle
          </button>
          {state.gameStatus === 'playing' && (
            <button
              type="button"
              onClick={handleSurrender}
              className={`rounded-lg border px-6 py-3 font-semibold text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare ${
                confirmingSurrender
                  ? 'border-failed/40 text-failed hover:bg-failed/10'
                  : 'border-ink/20 text-ink/50 hover:border-ink/40 hover:text-ink/70'
              }`}
            >
              {confirmingSurrender ? 'Are you sure?' : 'Give up?'}
            </button>
          )}
        </aside>
      </div>

      {/* Wordle Modal */}
      {shouldShowModal && activeShirt && (
        <WordleModal
          nameLength={activeShirt.nameLength}
          wordBoundaries={activeShirt.wordBoundaries}
          shirtNumber={activeShirt.shirtNumber}
          position={activeShirt.position}
          guesses={guessHistory}
          maxAttempts={MAX_ATTEMPTS}
          onGuess={handleGuess}
          onClose={handleModalClose}
          isGameOver={guessHistory.length >= MAX_ATTEMPTS || guessHistory.some(g => g.every(r => r.result === 'CORRECT'))}
          isCorrect={guessHistory.some(g => g.every(r => r.result === 'CORRECT'))}
        />
      )}

      {/* Game Complete Overlay */}
      {isGameComplete && (
        <GameComplete
          match={state.match.game}
          targetShirts={state.targetShirts}
          opponentShirts={state.opponentShirts}
          targetTeamName={targetTeamName}
          opponentTeamName={opponentTeamName}
          revealedPlayers={revealedPlayers}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </div>
  );
}
