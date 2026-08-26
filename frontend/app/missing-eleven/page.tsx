'use client';

import { useCallback, useEffect, useState } from 'react';
import MatchInfo from '@/components/MatchInfo';
import TacticBoard from '@/components/TacticBoard';
import { fetchRandomMatch } from '@/lib/api';
import type { MatchResponse, ShirtData, ShirtState, TeamSide } from '@/types';

type Status = 'loading' | 'ready' | 'error';

/** TEMPORARY demo interaction: each click cycles a shirt through all states. */
const STATE_CYCLE: readonly ShirtState[] = ['default', 'in-progress', 'correct', 'failed'];

function cycleState(current: ShirtState): ShirtState {
  const next = (STATE_CYCLE.indexOf(current) + 1) % STATE_CYCLE.length;
  return STATE_CYCLE[next];
}

/** Randomly pick the side to play; throws when a match has no lineups at all. */
function pickSide(response: MatchResponse): TeamSide {
  if (response.homeLineup.length === 0 && response.awayLineup.length === 0) {
    throw new Error('This match has no lineup data.');
  }
  const preferred: TeamSide = Math.random() < 0.5 ? 'home' : 'away';
  const preferredLineup = preferred === 'home' ? response.homeLineup : response.awayLineup;
  return preferredLineup.length > 0 ? preferred : preferred === 'home' ? 'away' : 'home';
}

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Something went wrong.';
}

export default function MissingElevenPage() {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<MatchResponse | null>(null);
  const [side, setSide] = useState<TeamSide>('home');
  const [shirtStates, setShirtStates] = useState<Record<number, ShirtState>>({});
  const [error, setError] = useState<string | null>(null);

  // Event handler: resets to the loading state synchronously, then fetches.
  const startNewPuzzle = useCallback(() => {
    setStatus('loading');
    setError(null);
    fetchRandomMatch()
      .then((response) => {
        setData(response);
        setSide(pickSide(response));
        setShirtStates({});
        setStatus('ready');
      })
      .catch((cause: unknown) => {
        setError(describeError(cause));
        setStatus('error');
      });
  }, []);

  // Initial load on mount. State updates happen inside promise callbacks,
  // never synchronously in the effect body; `cancelled` guards late replies.
  useEffect(() => {
    let cancelled = false;
    fetchRandomMatch()
      .then((response) => {
        if (cancelled) {
          return;
        }
        setData(response);
        setSide(pickSide(response));
        setShirtStates({});
        setStatus('ready');
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setError(describeError(cause));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleShirtClick = useCallback((playerId: number) => {
    setShirtStates((previous) => ({
      ...previous,
      [playerId]: cycleState(previous[playerId] ?? 'default'),
    }));
  }, []);

  if (status === 'error') {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-24 text-center md:px-6">
        <p className="text-lg font-semibold text-ink">Could not load the puzzle.</p>
        <p className="mt-2 max-w-sm text-sm text-ink/55">{error}</p>
        <button
          type="button"
          onClick={() => startNewPuzzle()}
          className="mt-6 rounded-lg bg-ink px-6 py-3 font-semibold text-chalk transition-colors hover:bg-flare focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare"
        >
          Try again
        </button>
      </div>
    );
  }

  if (status === 'loading' || !data) {
    return (
      <div className="mx-auto flex w-full max-w-6xl items-center justify-center px-4 py-32 md:px-6">
        <p role="status" className="motion-safe:animate-pulse text-sm uppercase tracking-[0.15em] text-ink/55">
          Loading puzzle…
        </p>
      </div>
    );
  }

  const lineup = side === 'home' ? data.homeLineup : data.awayLineup;
  const formation = side === 'home' ? data.match.homeFormation : data.match.awayFormation;
  const teamName =
    (side === 'home' ? data.match.homeClub?.name : data.match.awayClub?.name) ?? 'Unknown team';
  const shirts: ShirtData[] = lineup.map((entry) => ({
    ...entry,
    state: shirtStates[entry.playerId] ?? 'default',
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-14">
      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,620px)] lg:items-start lg:gap-x-12 lg:gap-y-8">
        <header className="lg:col-start-1 lg:row-start-1">
          <h1 className="font-display text-[clamp(40px,6vw,64px)] uppercase leading-[0.95] text-ink">
            Missing Eleven
          </h1>
        </header>

        <div className="lg:col-start-1 lg:row-start-2">
          <MatchInfo match={data.match} />
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
            onClick={() => startNewPuzzle()}
            className="rounded-lg bg-ink px-6 py-3 font-semibold text-chalk transition-colors hover:bg-flare focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare"
          >
            New puzzle
          </button>
        </aside>
      </div>
    </div>
  );
}
