'use client';

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { canContinueOpponent, useGameState, resolvedShirtCount } from '@/lib/gameState';
import { DAILY_DIFFICULTY, DIFFICULTY_CONFIG } from '@/lib/difficulty';
import { availableClues } from '@/lib/shirtBadges';
import DifficultySelector from '@/components/DifficultySelector';
import FinishButton from '@/components/FinishButton';
import { fetchRandomMatch, fetchDailyMatch, fetchLineup, submitGuess as submitGuessApi, fetchReveal, revealOnePlayer } from '@/lib/api';
import { filtersToParams, dailyToParams } from '@/lib/filterParams';
import { toDailyKey, isPlayableDaily, type DailyKey } from '@/lib/daily';
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
import DailyEntry from '@/components/DailyEntry';
import { computeTotalScore } from '@/lib/scoring';
import FilterUrlSync from './FilterUrlSync';
import type { ShirtData, LineupPlayer, RevealPlayer, GameFilterParams, TeamSide } from '@/types';
import { EMPTY_FILTERS } from '@/types';
import { targetSideForMatch, type ShirtGameData } from '@/lib/gameState';

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
    finishGame,
    continueOpponent,
    newGame,
    setError,
    setLoading,
    toggleBoard,
    filters,
    setFilters,
    setDifficulty,
    startDaily,
  } = useGameState();

  const resolvedCount = resolvedShirtCount(state.targetShirts, state.opponentShirts);

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
  // True once the query string has been read. On the pre-screen there is
  // nothing to read, so the mount effect below unlocks it immediately; on a
  // deep link FilterUrlSync's onReady unlocks it after its read dispatch has
  // landed. The load effect waits for this so a ?daily= link never fetches a
  // random match first.
  const [urlReady, setUrlReady] = useState(false);
  // `todayKey` is null on the server and on the first client render, and is
  // filled in by an effect. Computing it inline with `new Date()` would read
  // the clock during render, and a render that straddles 00:00:00 UTC would
  // produce different markup on the server than on the client.
  const [todayKey, setTodayKey] = useState<DailyKey | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot gate init after hydration; same pattern as FilterPanel's re-sync
    setTodayKey(toDailyKey(new Date()));
  }, []);
  useEffect(() => {
    const hasParams = new URLSearchParams(window.location.search).size > 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot gate init after hydration; same pattern as FilterPanel's re-sync
    setStarted(hasParams);
    // The pre-screen has no URL to read, so it is ready immediately. A deep
    // link waits for FilterUrlSync's onReady.
    if (!hasParams) setUrlReady(true);
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

  // FilterUrlSync's bridge. A null daily key is a NO-OP: leaving daily is
  // driven by NEW_GAME (New puzzle / Play again), never by a stale URL read.
  // The write effect removes ?daily= when the state clears.
  const handleDaily = useCallback((key: DailyKey | null) => {
    if (key !== null) startDaily(key);
  }, [startDaily]);
  const handleReady = useCallback(() => setUrlReady(true), []);

  // Start today's daily from the pre-screen entry. Write the URL first (the
  // board's FilterUrlSync mount-read must see the finished URL), then flip the
  // gate and the mode in one batched commit so the load effect runs once.
  const handleStartDaily = useCallback(() => {
    if (todayKey === null) return;
    const params = filtersToParams(filters);
    for (const [k, v] of dailyToParams(todayKey)) params.set(k, v);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setStarted(true);
    startDaily(todayKey);
  }, [todayKey, filters, router, pathname, startDaily]);

  const [confirmingSurrender, setConfirmingSurrender] = useState(false);
  const [isContinuingOpponent, setIsContinuingOpponent] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shirtsRef = useRef({ target: state.targetShirts, opponent: state.opponentShirts });

  // Keep the ref in sync with the latest shirts without triggering re-renders.
  useEffect(() => {
    shirtsRef.current = { target: state.targetShirts, opponent: state.opponentShirts };
  });

  const revealTeam = useCallback((players: RevealPlayer[], shirts: ShirtGameData[]) => {
    for (const { token, name, shirtNumber } of revealMatches(players, shirts)) {
      revealName(token, name, shirtNumber);
    }
  }, [revealName]);

  const handleSurrender = useCallback(async () => {
    if (confirmingSurrender) {
      // Second click — actually surrender
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmingSurrender(false);

      if (!state.match) return;

      try {
        const targetSide = state.teamSide;
        const opponentSide = targetSide === 'home' ? 'away' : 'home';
        const activeSide = state.opponentPhase ? opponentSide : targetSide;
        const activeShirts = state.opponentPhase ? state.opponentShirts : state.targetShirts;

        const activeReveal = await fetchReveal(state.match.game.gameId, activeSide);
        revealTeam(activeReveal.players, activeShirts);
        if (state.difficulty === 'expert') {
          const otherSide = state.opponentPhase ? targetSide : opponentSide;
          const otherShirts = state.opponentPhase ? state.targetShirts : state.opponentShirts;
          const otherReveal = await fetchReveal(state.match.game.gameId, otherSide);
          revealTeam(otherReveal.players, otherShirts);
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
  }, [confirmingSurrender, state.match, state.teamSide, state.targetShirts, state.opponentShirts, state.difficulty, revealTeam, surrender, setError]);

  const filterKey = `${filtersToParams(filters).toString()}|difficulty=${state.difficulty}`;
  const fetchedKeyRef = useRef<string | null>(null);
  const matchSeqRef = useRef(0);

  // One shared path for every match fetch (mount, filter change, Play again,
  // Retry). The monotonic sequence ref discards stale responses: only the
  // newest request may write state, however the triggers raced.
  const loadMatch = useCallback(() => {
    const seq = ++matchSeqRef.current;
    setLoading(true);
    setError(null);
    fetchRandomMatch(filters, state.difficulty)
      .then(async (response) => {
        if (seq !== matchSeqRef.current) return;
        if (response) {
          const side = targetSideForMatch(response);
          if (state.difficulty !== 'expert') {
            const targetKey = side === 'home' ? 'homeLineup' : 'awayLineup';
            if (response[targetKey].length === 0) {
              const targetLineup = await fetchLineup(response.game.gameId, side, state.difficulty);
              if (seq !== matchSeqRef.current) return;
              response = { ...response, targetSide: side, [targetKey]: targetLineup };
            } else {
              response = { ...response, targetSide: side };
            }
          } else {
            response = { ...response, targetSide: side };
          }
          startNewGame(response);
        }
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
  }, [filters, state.difficulty, setLoading, setError, startNewGame]);

  // The daily fetch mirrors loadMatch: same sequence ref, same loading/error
  // discipline, same startNewGame hand-off. It takes only a day key — there is
  // no parameter through which a filter could narrow it (§6.2).
  const loadDaily = useCallback((key: DailyKey) => {
    const seq = ++matchSeqRef.current;
    setLoading(true);
    setError(null);
    fetchDailyMatch(key)
      .then(async (response) => {
        if (seq !== matchSeqRef.current) return;
        const side = targetSideForMatch(response);
        const targetKey = side === 'home' ? 'homeLineup' : 'awayLineup';
        if (response[targetKey].length === 0) {
          const targetLineup = await fetchLineup(response.game.gameId, side, DAILY_DIFFICULTY);
          if (seq !== matchSeqRef.current) return;
          response = { ...response, targetSide: side, [targetKey]: targetLineup };
        } else {
          response = { ...response, targetSide: side };
        }
        startNewGame(response);
      })
      .catch((cause: unknown) => {
        if (seq !== matchSeqRef.current) return;
        setError(describeError(cause));
      })
      .finally(() => {
        if (seq === matchSeqRef.current) setLoading(false);
      });
  }, [setLoading, setError, startNewGame]);

  // The single owner of "which puzzle should be on the board". It replaces the
  // filter-key effect: every transition into "no game loaded" loads the right
  // one, so the handlers only have to reset state.
  //
  // The `urlReady` guard is load-bearing. Without it this effect runs on the
  // first commit of a ?daily= deep link, where its closure still has
  // `isDaily === false` even though FilterUrlSync has already dispatched
  // START_DAILY from a child effect, and a random match is fetched and then
  // thrown away — a visible flash of the wrong puzzle.
  //
  // The daily branch returns early on a filter change, which is the §6.2
  // guard: daily ignores filters entirely. This is the only filter-driven
  // fetch, so no second effect needs the same guard.
  useEffect(() => {
    if (!started || !urlReady) return;
    if (state.isDaily) {
      if (state.dailyKey === null || todayKey === null) return;
      const key = `daily:${state.dailyKey}`;
      if (fetchedKeyRef.current === key) return;
      fetchedKeyRef.current = key;
      if (!isPlayableDaily(state.dailyKey, todayKey)) {
        // §6.1: today's puzzle only. A shared link to a past day is not
        // playable and is never silently swapped for a different puzzle.
        // "Try again" (handleRetry) is the documented way out, and it leaves
        // daily mode.
        setError('That day’s puzzle is no longer available. Try again for a new puzzle.');
        return;
      }
      loadDaily(state.dailyKey);
      return;
    }
    if (fetchedKeyRef.current === filterKey) return;
    fetchedKeyRef.current = filterKey;
    loadMatch();
  }, [started, urlReady, state.isDaily, state.dailyKey, filterKey, todayKey, loadMatch, loadDaily, setError]);

  // Reveal only the side the player has actually finished. The opponent is
  // fetched only after Continue, and Expert retains its two-sided flow.
  useEffect(() => {
    if (state.gameStatus === 'complete' && state.match) {
      const sideToReveal: TeamSide = state.opponentPhase
        ? (state.teamSide === 'home' ? 'away' : 'home')
        : state.teamSide;
      fetchReveal(state.match.game.gameId, sideToReveal)
        .then((result) => {
          revealTeam(result.players, state.opponentPhase ? shirtsRef.current.opponent : shirtsRef.current.target);
        })
        .catch((cause: unknown) => {
          setError(describeError(cause));
        });
    }
  }, [state.gameStatus, state.match, state.teamSide, state.opponentPhase, setError, revealTeam]);

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
      submitGuess(activeShirt.token, response.results, response.isCorrect, response.name, response.shirtNumber);

      // If this was the last attempt and it failed, reveal the player's name
      const maxAttempts = DIFFICULTY_CONFIG[state.difficulty].attempts;
      const isLastAttempt = activeShirt.guessHistory.length + 1 >= maxAttempts;
      if (!response.isCorrect && isLastAttempt) {
        const reveal = await revealOnePlayer(state.match.game.gameId, activeShirt.token);
        revealName(activeShirt.token, reveal.name, reveal.shirtNumber);
      }
    } catch (cause: unknown) {
      setError(describeError(cause));
    }
    // Modal will close via state change if correct or failed
  }, [activeShirt, state.match, submitGuess, revealName, setError, state.difficulty]);

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
    // Returning to the pre-screen means there is no URL left to read.
    setUrlReady(true);
  }, [filters, newGame, setFilters, router, pathname]);

  const handleRetry = useCallback(() => {
    if (state.isDaily) {
      if (state.dailyKey === null || todayKey === null || !isPlayableDaily(state.dailyKey, todayKey)) {
        // The expired-link escape hatch: leaving daily also removes ?daily=
        // from the URL through FilterUrlSync's write effect, and the load
        // effect then fetches an ordinary match.
        newGame();
        fetchedKeyRef.current = null;
        return;
      }
      // "Try again" retries the SAME daily, not a different puzzle.
      setError(null);
      loadDaily(state.dailyKey);
      return;
    }
    reloadOptions();
    loadMatch();
  }, [state.isDaily, state.dailyKey, todayKey, newGame, setError, loadDaily, reloadOptions, loadMatch]);

  const handleContinueOpponent = useCallback(async () => {
    if (!state.match || state.opponentShirts.length > 0 || isContinuingOpponent) return;
    const side = state.teamSide === 'home' ? 'away' : 'home';
    setIsContinuingOpponent(true);
    try {
      const lineup = await fetchLineup(
        state.match.game.gameId,
        side,
        state.isDaily ? DAILY_DIFFICULTY : state.difficulty,
      );
      continueOpponent(lineup);
    } catch (cause: unknown) {
      setError(describeError(cause));
    } finally {
      setIsContinuingOpponent(false);
    }
  }, [state.match, state.teamSide, state.isDaily, state.difficulty, state.opponentShirts.length, isContinuingOpponent, continueOpponent, setError]);

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
  const isGameComplete = state.gameStatus === 'complete' || state.gameStatus === 'surrendered';

  // The empty state is keyed on a *successful* options response whose `total`
  // is zero for an active filter set — never on a failed match request. The
  // `!optionsLoading` guard stops the empty state flashing over a good board
  // while a new filter set's options are still in flight.
  const showEmptyState =
    !state.isDaily &&
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
  // Daily does not depend on filter options, so their failure must not mask a
  // perfectly good daily puzzle.
  const displayError = state.error ?? (state.match || state.isDaily ? null : optionsError);

  // Shared page chrome. The game has no in-page filter access; New puzzle /
  // Play again / Change filters all return to the gate instead, where the
  // panel remounts and re-syncs its draft from the applied filters.
  const shell = (content: ReactNode) => (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      {/*
        The <Suspense> boundary is the fix for Next 16's
        missing-suspense-with-csr-bailout, which is a `next build` FAILURE
        ("Entire page /missing-eleven deopted into client-side rendering"),
        not a runtime warning — `next dev` will not show it. FilterUrlSync is
        the app's only reader of the URL search params and must stay below it.

        It is mounted for every STARTED state — loading, error, empty and
        board — because its onReady is what unlocks the first load on a deep
        link. It is deliberately absent from the pre-screen, which has no URL
        to read; hoisting it into the always-mounted shell would make it read
        the URL before the player has started.
      */}
      {started && (
        <Suspense fallback={null}>
          <FilterUrlSync
            applied={filters}
            onFilters={handleFilters}
            daily={state.dailyKey}
            onDaily={handleDaily}
            onReady={handleReady}
          />
        </Suspense>
      )}
      {content}
    </div>
  );

  // Entry gate. The daily is the primary path and sits above the fold; the
  // custom match builder is the secondary path below it. The board branch owns
  // its own "Missing Eleven" h1; only one renders.
  if (!started) {
    return shell(
      <div className="mx-auto w-full max-w-5xl pb-12">
        <header className="pb-8 text-center">
          <h1 className="font-display text-[clamp(40px,4.6vw,50px)] uppercase leading-[0.92] tracking-[-0.02em] text-ink">
            Missing Eleven
          </h1>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50">
            A daily football lineup puzzle
          </p>
        </header>

        <DailyEntry
          dailyKey={state.dailyKey}
          todayKey={todayKey}
          urlReady={urlReady}
          onStartDaily={handleStartDaily}
          variant="hero"
        />

        <div className="mb-8 mt-12 flex items-center gap-4">
          <span aria-hidden="true" className="h-px flex-1 bg-ink/15" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink/50">
            Or build your own match
          </span>
          <span aria-hidden="true" className="h-px flex-1 bg-ink/15" />
        </div>

        <section aria-labelledby="custom-match-heading" className="mx-auto w-full max-w-3xl">
          <div className="mb-5 text-center">
            <h2 id="custom-match-heading" className="font-display text-3xl uppercase tracking-[0.06em] text-ink">
              Choose your match
            </h2>
            <p className="mt-2 text-sm text-ink/60">
              Pick a difficulty and narrow the fixture pool. Start when
              you&rsquo;re ready.
            </p>
          </div>
          <div className="space-y-4">
            <DifficultySelector value={state.difficulty} onChange={setDifficulty} />
            <FilterPanel
              open
              filters={filters}
              options={filterOptions}
              optionsLoading={optionsLoading}
              optionsError={optionsError}
              onApply={setFilters}
              onStart={handleStart}
            />
          </div>
        </section>
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
  const lineup = state.activeBoard === 'opponent' && state.opponentPhase
    ? state.opponentShirts
    : (activeTeamSide === 'home' ? state.match.homeLineup : state.match.awayLineup);
  const preview = activeTeamSide === 'home' ? state.match.homePreview : state.match.awayPreview;
  const formation = activeTeamSide === 'home' ? state.match.game.homeFormation : state.match.game.awayFormation;
  const teamName = (activeTeamSide === 'home' ? state.match.game.homeClub?.name : state.match.game.awayClub?.name) ?? 'Unknown team';
  const clubId = activeTeamSide === 'home' ? state.match.game.homeClub?.clubId : state.match.game.awayClub?.clubId;

  // Build shirts for the active board by merging lineup with game state
  const activeShirtsForBoard = state.activeBoard === 'target' ? state.targetShirts : state.opponentShirts;
  const visibleLineup: LineupPlayer[] = lineup.length > 0
    ? lineup
    : (state.activeBoard === 'opponent' ? (preview ?? []).map((entry, index) => ({
        token: `locked-preview-${index}`,
        nameLength: 0,
        wordBoundaries: [],
        shirtNumber: entry.shirtNumber,
        position: entry.position,
        coords: entry.coords,
        goals: 0,
        assists: 0,
        redCards: 0,
        isCaptain: false,
        hasFirstLetter: false,
      })) : []);
  const shirts: ShirtData[] = visibleLineup.map((entry) => {
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

  // Live score — recomputed after each guess from the current state.
  // The mode multiplier is applied here too, so the live counter and the
  // final dialog agree instead of the score jumping at the end of the game.
  const scoreBreakdown =
    (state.gameStatus === 'playing' || isGameComplete) && state.match
      ? computeTotalScore(
          state.targetShirts,
          state.opponentShirts,
          targetTeamName,
          opponentTeamName,
          DIFFICULTY_CONFIG[state.difficulty].multiplier,
        )
      : null;
  const liveScore = scoreBreakdown?.grandTotal ?? 0;

  return shell(
    <>
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

          {/* A sibling of the controls group, never a member of it: daily is a
              mode, not a filter variant (§6.2). In an ordinary match this is
              only a status card; the entry point stays on the pre-screen. */}
          {state.isDaily && (
            <DailyEntry
              dailyKey={state.dailyKey}
              todayKey={todayKey}
              urlReady={urlReady}
              onStartDaily={handleStartDaily}
              variant="compact"
            />
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
          {state.activeBoard === 'opponent' && !state.opponentPhase && state.difficulty !== 'expert' && !isGameComplete && (
            <p className="mb-3 rounded-md border border-ink/10 bg-paper px-3 py-2 text-center text-xs text-ink/65">
              Opponent lineup locked · finish {targetTeamName} to unlock the bonus round.
            </p>
          )}
          <TacticBoard
            teamName={teamName}
            formation={formation}
            shirts={shirts}
            difficulty={state.difficulty}
            onShirtClick={state.activeBoard === 'opponent' && !state.opponentPhase && state.difficulty !== 'expert' ? undefined : handleShirtClick}
            clubId={clubId}
            activeBoard={state.activeBoard}
            targetTeamName={targetTeamName}
            opponentTeamName={opponentTeamName}
            targetSolved={targetSolved}
            opponentSolved={opponentSolved}
            onToggleBoard={toggleBoard}
          />
        </section>
        {state.gameStatus === 'playing' && (
          <FinishButton
            difficulty={state.difficulty}
            resolved={resolvedCount}
            total={state.targetShirts.length + state.opponentShirts.length}
          onFinish={finishGame}
          />
        )}
      </div>

      {/* Wordle Modal */}
      {shouldShowModal && activeShirt && (
        <WordleModal
          nameLength={activeShirt.nameLength}
          wordBoundaries={activeShirt.wordBoundaries}
          shirtNumber={activeShirt.shirtNumber}
          shirtNumberHidden={activeShirt.shirtNumberHidden}
          position={activeShirt.position}
          guesses={guessHistory}
          maxAttempts={DIFFICULTY_CONFIG[state.difficulty].attempts}
          onGuess={handleGuess}
          onClose={handleModalClose}
          isGameOver={guessHistory.length >= DIFFICULTY_CONFIG[state.difficulty].attempts || guessHistory.some(g => g.every(r => r.result === 'CORRECT'))}
          isCorrect={guessHistory.some(g => g.every(r => r.result === 'CORRECT'))}
          difficulty={state.difficulty}
          clues={activeShirt ? availableClues(state.difficulty, activeShirt) : []}
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
          difficulty={state.difficulty}
          canContinueOpponent={canContinueOpponent(state)}
          onContinueOpponent={handleContinueOpponent}
          isContinuingOpponent={isContinuingOpponent}
          surrendered={state.gameStatus === 'surrendered'}
          targetRoundSurrendered={state.targetRoundSurrendered}
        />
      )}
    </>,
  );
}
