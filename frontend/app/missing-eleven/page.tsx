'use client';

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useGameState, MAX_ATTEMPTS } from '@/lib/gameState';
import { fetchRandomMatch, submitGuess as submitGuessApi, fetchReveal, revealOnePlayer } from '@/lib/api';
import { filtersToParams } from '@/lib/filterParams';
import { hasActiveFilters } from '@/lib/filters';
import { useFilterOptions } from '@/lib/useFilterOptions';
import { revealMatches } from '@/lib/reveal';
import MatchInfo from '@/components/MatchInfo';
import TacticBoard from '@/components/TacticBoard';
import WordleModal from '@/components/WordleModal';
import GameComplete from '@/components/GameComplete';
import ScoreCounter from '@/components/ScoreCounter';
import FilterPanel from '@/components/FilterPanel';
import FilterEmptyState from '@/components/FilterEmptyState';
import { computeTotalScore } from '@/lib/scoring';
import FilterUrlSync from './FilterUrlSync';
import type { ShirtData, RevealPlayer, GameFilterParams } from '@/types';
import { EMPTY_FILTERS } from '@/types';
import type { ShirtGameData } from '@/lib/gameState';

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
    filters,
    setFilters,
  } = useGameState();

  const { options: filterOptions, loading: optionsLoading, error: optionsError, reload: reloadOptions } = useFilterOptions(filters);

  // Stable identity: FilterUrlSync's read effect keys on this callback.
  const handleFilters = useCallback((next: GameFilterParams) => setFilters(next), [setFilters]);

  // Entry gate: the URL is the single source of truth. An empty URL is the
  // pre-screen; any params mean the game has begun (a deep link). Initialized
  // false so the server's HTML and the first client render agree — the
  // pre-screen — then flipped once from the real location after hydration.
  // Never read window at render time (hydration mismatch) and never call
  // useSearchParams at page level (Next 16's missing-suspense-with-csr-bailout
  // is a build failure; FilterUrlSync under Suspense is the only reader).
  // Reload recomputes this from the URL: no session or storage flag exists.
  const [started, setStarted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot gate init after hydration; same pattern as FilterPanel's re-sync
    setStarted(new URLSearchParams(window.location.search).size > 0);
  }, []);

  const router = useRouter();
  const pathname = usePathname();

  // Start (pre-screen only): write the URL FIRST so the board's FilterUrlSync
  // mount-read sees the finished URL — D4-class ordering; reversing this wipes
  // the started filters the same way v1.1.3's D4 did. Both state updates
  // batch into one commit, so the fetch effect below runs once for this start.
  const handleStart = useCallback((next: GameFilterParams) => {
    const query = filtersToParams(next).toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    setStarted(true);
    setFilters(next);
  }, [router, pathname, setFilters]);

  const [confirmingSurrender, setConfirmingSurrender] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shirtsRef = useRef({ target: state.targetShirts, opponent: state.opponentShirts });

  // Keep the ref in sync with the latest shirts without triggering re-renders.
  useEffect(() => {
    shirtsRef.current = { target: state.targetShirts, opponent: state.opponentShirts };
  });

  const revealTeam = useCallback((players: RevealPlayer[], shirts: ShirtGameData[]) => {
    for (const { token, name } of revealMatches(players, shirts)) {
      revealName(token, name);
    }
  }, [revealName]);

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

        // Reveal names on unresolved shirts, matched per team to avoid
        // shirt-number collisions between the two lineups.
        revealTeam(picked.players, state.targetShirts);
        revealTeam(opposite.players, state.opponentShirts);

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
  }, [confirmingSurrender, state.match, state.teamSide, state.targetShirts, state.opponentShirts, revealTeam, surrender, setError]);

  const filterKey = filtersToParams(filters).toString();
  const fetchedKeyRef = useRef<string | null>(null);
  const matchSeqRef = useRef(0);

  // One shared path for every match fetch (mount, filter change, Play again,
  // Retry). The monotonic sequence ref discards stale responses: only the
  // newest request may write state, however the triggers raced.
  const loadMatch = useCallback(() => {
    const seq = ++matchSeqRef.current;
    setLoading(true);
    setError(null);
    fetchRandomMatch(filters)
      .then((response) => {
        if (seq !== matchSeqRef.current) return;
        if (response) startNewGame(response);
        // null: no match under these filters. That is not an error — the
        // options' `total === 0` drives the explained empty state instead
        // (v1.1.4). A thrown failure still lands in the catch below.
      })
      .catch((cause: unknown) => {
        if (seq !== matchSeqRef.current) return;
        setError(describeError(cause));
      })
      .finally(() => {
        if (seq === matchSeqRef.current) setLoading(false);
      });
  }, [filters, setLoading, setError, startNewGame]);

  // Load once for the initial filter key, and again whenever the canonical
  // key changes (a deep link's filters arrive via FilterUrlSync's read
  // dispatch). The fetched-key ref keeps the mount load singular; a later
  // filter change refetches through this same path instead of a second one.
  // Before the first start the guard returns early — the pre-screen fetches
  // nothing; Start changes both deps in one commit, and the ref keeps that
  // single.
  useEffect(() => {
    if (!started) return; // pre-screen: zero match requests until Start
    if (fetchedKeyRef.current === filterKey) return;
    fetchedKeyRef.current = filterKey;
    loadMatch();
  }, [started, filterKey, loadMatch]);

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
          // Populate names on unresolved shirts so the board and GameComplete
          // read shirt.name directly. Read from shirtsRef to avoid re-running
          // this effect when revealName updates the shirts.
          revealTeam(picked.players, shirtsRef.current.target);
          revealTeam(opposite.players, shirtsRef.current.opponent);
        })
        .catch((cause: unknown) => {
          setError(describeError(cause));
        });
    }
  }, [state.gameStatus, state.match, state.teamSide, setError, revealTeam]);

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

  // Every route back to the pre-screen — the sidebar's New puzzle, the
  // game-complete Play Again, and the error state's Change filters — resets
  // the board, clears the URL (the gate reads ANY params as "started"), and
  // re-arms the fetch-key ref so the next Start fetches again even under
  // identical filters. NEW_GAME wipes filters along with everything else
  // (initialState), so the applied set is reapplied right after: returning
  // to the gate must show it still selected. The panel remounts on return,
  // draft re-synced from it, sections collapsed.
  const handleNewPuzzle = useCallback(() => {
    const applied = filters;
    newGame();
    setFilters(applied);
    fetchedKeyRef.current = null;
    router.replace(pathname, { scroll: false });
    setStarted(false);
  }, [filters, newGame, setFilters, router, pathname]);

  const handleRetry = useCallback(() => {
    reloadOptions();
    loadMatch();
  }, [reloadOptions, loadMatch]);

  // Clear all from the empty state. The URL is the source of truth, so it must
  // be cleared here too: the empty state does not render FilterUrlSync, and
  // the board (which does) would otherwise re-read the stale filtered URL and
  // bounce straight back into the empty state. Write the URL first, then the
  // filters, matching handleStart's ordering.
  const handleClearFilters = useCallback(() => {
    router.replace(pathname, { scroll: false });
    setFilters({ ...EMPTY_FILTERS });
  }, [router, pathname, setFilters]);

  // Derive game complete state from gameStatus
  const isGameComplete = state.gameStatus === 'complete';

  // The empty state is keyed on a *successful* options response whose `total`
  // is zero for an active filter set — never on a failed match request. The
  // `!optionsLoading` guard stops the empty state flashing over a good board
  // while a new filter set's options are still in flight.
  const showEmptyState =
    filterOptions !== null &&
    !optionsLoading &&
    filterOptions.total === 0 &&
    hasActiveFilters(filters);

  const invertedSeasonRange =
    filters.seasonFrom !== null &&
    filters.seasonTo !== null &&
    filters.seasonFrom > filters.seasonTo;

  // An options failure is still a failure: surface it as the error state when
  // no match is on screen, so "the server is down" never reads as "no games".
  const displayError = state.error ?? (state.match ? null : optionsError);

  // Shared page chrome. The filter panel lives on the pre-screen only —
  // during the game there is no in-page filter access; New puzzle / Play
  // Again / Change filters all return to the gate instead. Unmounting the
  // panel for the game is deliberate: on return it remounts and re-syncs its
  // draft from the applied filters (sections start collapsed again).
  const shell = (content: ReactNode) => (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      {!started && (
        <FilterPanel
          open
          filters={filters}
          options={filterOptions}
          optionsLoading={optionsLoading}
          optionsError={optionsError}
          onApply={setFilters}
          onStart={handleStart}
        />
      )}
      {content}
    </div>
  );

  // Entry gate: before the first start there is no match, no error, and no
  // board — only the panel (forced open, Start inside) and the placeholder.
  // The board branch owns its own "Missing Eleven" h1; only one renders.
  if (!started) {
    return shell(
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-24 text-center md:px-6">
        <header className="w-full pb-8">
          <h1 className="font-display text-[clamp(40px,4.6vw,50px)] uppercase leading-[0.92] tracking-[-0.02em] text-ink">
            Missing Eleven
          </h1>
        </header>
        {/* An empty slot on the tactics board: dashed like a chalk outline,
            the arrow pointing up at the filters that fill it. */}
        <div className="w-full max-w-md rounded-xl border-2 border-dashed border-ink/25 px-6 py-10">
          <p aria-hidden="true" className="text-2xl leading-none text-ink/40">↑</p>
          <h2 className="mt-3 font-display text-2xl uppercase tracking-[0.08em] text-ink">
            Choose your match
          </h2>
          <p className="mt-3 text-sm text-ink/65">
            Expand a filter above and pick your clubs — or start with any match.
          </p>
          <p className="mt-4 text-xs uppercase tracking-[0.15em] text-ink/45">
            Press Start game when you&rsquo;re ready
          </p>
        </div>
      </div>,
    );
  }

  // Error state
  if (displayError) {
    return shell(
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-24 text-center md:px-6">
        <p className="text-lg font-semibold text-ink">Could not load the puzzle.</p>
        <p className="mt-2 max-w-sm text-sm text-ink/55">{displayError}</p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-lg bg-ink px-6 py-3 font-semibold text-chalk transition-colors hover:bg-flare focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare"
          >
            Try again
          </button>
          {/* No panel exists in-game, so the error state carries its own route
              back to the filters — the error itself is often a filter problem. */}
          <button
            type="button"
            onClick={handleNewPuzzle}
            className="text-sm text-ink/60 underline underline-offset-4 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare"
          >
            Change filters
          </button>
        </div>
      </div>,
    );
  }

  // Empty state: a successful options response says this combination matches
  // zero games. Distinct from the error state above, escapable via Clear all
  // (clears the filter set) and Adjust filters (returns to the panel with the
  // current selection intact).
  if (showEmptyState) {
    return shell(
      <FilterEmptyState
        filters={filters}
        invertedSeasonRange={invertedSeasonRange}
        onClearAll={handleClearFilters}
        onOpenFilters={handleNewPuzzle}
      />,
    );
  }

  // Loading state
  if (state.gameStatus === 'loading' || !state.match) {
    return shell(
      <div className="mx-auto flex w-full max-w-6xl items-center justify-center px-4 py-32 md:px-6">
        <p role="status" className="motion-safe:animate-pulse text-sm uppercase tracking-[0.15em] text-ink/55">
          Loading puzzle…
        </p>
      </div>,
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

  return shell(
    <>
      {/*
        The <Suspense> boundary is the fix for Next 16's
        missing-suspense-with-csr-bailout, which is a `next build` FAILURE
        ("Entire page /missing-eleven deopted into client-side rendering"),
        not a runtime warning — `next dev` will not show it. FilterUrlSync is
        the app's only reader of the URL search params and must stay below it.
        It intentionally lives only in this branch: its mount-time read re-syncs
        the URL after loading/error transitions (and is what Play again / Retry
        rely on), so it must NOT be hoisted into the always-mounted shell.
      */}
      <Suspense fallback={null}>
        <FilterUrlSync applied={filters} onFilters={handleFilters} />
      </Suspense>
      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,620px)] lg:items-start lg:gap-x-10">
        <aside className="flex flex-col gap-8 text-center lg:sticky lg:top-6 lg:items-start lg:text-left">
          <header className="w-full pb-4">
            <h1 className="w-full text-center font-display text-[clamp(40px,4.6vw,50px)] uppercase leading-[0.92] tracking-[-0.02em] text-ink">
              Missing Eleven
            </h1>
          </header>

          <MatchInfo match={state.match.game} />

          {state.gameStatus === 'playing' && (
            <ScoreCounter score={liveScore} />
          )}

          <div className="flex w-full flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-ink/65">Tap a shirt. Six tries per player.</p>
              {state.gameStatus === 'playing' && (
                <button
                  type="button"
                  onClick={handleSurrender}
                  className={`shrink-0 rounded-md px-2 py-2.5 text-xs underline font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare ${
                    confirmingSurrender
                      ? 'text-failed hover:bg-failed/10'
                      : 'text-ink/45 hover:text-ink'
                  }`}
                >
                  {confirmingSurrender ? 'Are you sure?' : 'Give up?'}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleNewPuzzle}
              className="w-full rounded-lg bg-ink px-5 py-3 font-semibold text-chalk transition-colors hover:bg-flare focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare"
            >
              New puzzle
            </button>
          </div>
        </aside>

        {/* Tactic board */}
        <section className="min-w-0" aria-label="Tactic board">
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
          onPlayAgain={handleNewPuzzle}
        />
      )}
    </>,
  );
}
