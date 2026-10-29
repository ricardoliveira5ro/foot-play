'use client';

import { useEffect, useState } from 'react';
import {
  formatUtcCountdown,
  msUntilNextUtcMidnight,
} from '@/lib/daily';
import { hasPlayed, EMPTY_STREAK, type StreakState } from '@/lib/streak';

/**
 * The daily entry point.
 *
 * §6.2: daily is a MODE that sits alongside the difficulty modes, not an
 * option inside the filter panel. This component never touches the router and
 * never touches storage. It asks for a daily via onStartDaily; the URL is
 * written by FilterUrlSync, which is the app's only URL writer. That keeps the
 * link copyable from the address bar for free.
 *
 * Two shapes:
 * - `hero` (pre-screen): the matchday ticket. The primary path into the game.
 * - `compact` (in-game aside): a status card while today's daily is on the
 *   board. The page does not render it during an ordinary match — the daily
 *   entry point belongs on the pre-screen only.
 */

export interface DailyEntryProps {
  /** The day key currently requested via ?daily=, or null in ordinary play. */
  dailyKey: string | null;
  /** Today's UTC day key, or null before the post-mount read has happened. */
  todayKey: string | null;
  /** True once the query string has been read. */
  urlReady: boolean;
  /**
   * v1.3.2: the persisted streak. Optional so the component renders
   * identically without storage (server, first paint, tests); the page
   * supplies it once the post-mount read has happened.
   */
  streak?: StreakState;
  /** Request the daily puzzle. */
  onStartDaily: () => void;
  variant?: 'hero' | 'compact';
}

/** '1 January 2026' — display only. Never fed back into a day key. */
function formatDay(key: string): string {
  const date = new Date(`${key}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Live countdown to the next UTC midnight. Null until the first effect runs,
 * which keeps the server and first client paint identical. The ticking value
 * is aria-hidden at its call sites; the static "Resets at 00:00 UTC" line is
 * what screen readers announce.
 */
function useCountdown(): string | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(msUntilNextUtcMidnight(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return remaining === null ? null : formatUtcCountdown(remaining);
}

function LiveDot({ tone }: Readonly<{ tone: 'flare' | 'turf' }>) {
  return (
    <span
      aria-hidden="true"
      className={`h-2 w-2 shrink-0 rounded-full motion-safe:animate-pulse ${
        tone === 'flare' ? 'bg-flare' : 'bg-turf-deep'
      }`}
    />
  );
}

/**
 * An empty 4-3-3: eleven dashed chalk outlines waiting to be named. This is
 * the signature of the card — it encodes the puzzle's actual shape rather
 * than decorating it. The right-hand third is deliberately open space.
 */
const FORMATION: ReadonlyArray<readonly [number, number]> = [
  [28, 80],
  [64, 26], [64, 62], [64, 98], [64, 134],
  [108, 44], [108, 80], [108, 116],
  [166, 34], [166, 80], [166, 126],
];

function PitchDiagram() {
  return (
    <svg
      viewBox="0 0 240 160"
      className="h-auto w-full text-chalk"
      role="img"
      aria-label="Empty 4-3-3 formation diagram"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5">
        <rect x="4" y="4" width="232" height="152" rx="3" />
        <line x1="120" y1="4" x2="120" y2="156" />
        <circle cx="120" cy="80" r="24" />
        <circle cx="120" cy="80" r="2.5" fill="currentColor" stroke="none" />
        <rect x="4" y="40" width="34" height="80" />
        <rect x="202" y="40" width="34" height="80" />
        <rect x="4" y="60" width="14" height="40" />
        <rect x="222" y="60" width="14" height="40" />
      </g>
      <g
        fill="currentColor"
        fillOpacity="0.06"
        stroke="currentColor"
        strokeOpacity="0.7"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      >
        {FORMATION.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="8" />
        ))}
      </g>
    </svg>
  );
}

/** Eleven empty shirts for narrow screens, where the pitch would crowd the CTA. */
function EmptyElevenRow() {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: 11 }, (_, index) => (
        <span
          key={index}
          className="h-2.5 w-2.5 rounded-full border border-chalk/50"
        />
      ))}
    </div>
  );
}

function Hero({
  todayKey,
  countdown,
  playingToday,
  playedToday,
  streak,
  onStartDaily,
}: Readonly<{
  todayKey: string;
  countdown: string | null;
  playingToday: boolean;
  playedToday: boolean;
  streak: StreakState;
  onStartDaily: () => void;
}>) {
  const hasHistory = streak.longest > 0;
  return (
    <section
      aria-labelledby="daily-heading"
      className="relative overflow-hidden rounded-2xl bg-turf-deep text-chalk shadow-sm"
    >
      <div className="relative grid gap-8 p-6 text-left sm:p-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-10">
        <div>
          <p className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-chalk/90">
            <LiveDot tone="flare" />
            <span>Today&rsquo;s eleven</span>
            <span aria-hidden="true" className="text-chalk/40">/</span>
            <time dateTime={todayKey}>{formatDay(todayKey)}</time>
          </p>

          {playingToday ? (
            <>
              <h2
                id="daily-heading"
                className="mt-4 max-w-xl font-display text-[clamp(32px,5vw,52px)] uppercase leading-[0.9] tracking-[-0.01em]"
              >
                You&rsquo;re playing today&rsquo;s puzzle.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-chalk/90">
                The eleven are on the board. The same puzzle for every player,
                worldwide.
              </p>
            </>
          ) : playedToday ? (
            <>
              <h2
                id="daily-heading"
                className="mt-4 max-w-xl font-display text-[clamp(32px,5vw,52px)] uppercase leading-[0.9] tracking-[-0.01em]"
              >
                You&rsquo;ve played today&rsquo;s puzzle.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-chalk/90">
                One result a day. A new eleven drops at 00:00 UTC.
              </p>
            </>
          ) : (
            <>
              <h2
                id="daily-heading"
                className="mt-4 max-w-xl font-display text-[clamp(34px,5.4vw,58px)] uppercase leading-[0.9] tracking-[-0.01em]"
              >
                The same eleven
                {' '}
                <span className="block">{'for everyone.'}</span>
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-chalk/90">
                One lineup a day. No filters. Find all eleven names.
              </p>
            </>
          )}

          <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
            {!playingToday && !playedToday && (
              <button
                type="button"
                onClick={onStartDaily}
                className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-flare px-6 py-3.5 text-base font-semibold text-ink transition-colors hover:bg-chalk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chalk sm:w-auto"
              >
                Play today&rsquo;s daily puzzle
                {' '}
                <span aria-hidden="true" className="transition-transform motion-safe:group-hover:translate-x-0.5">
                  {'→'}
                </span>
              </button>
            )}

            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-chalk/90">
                Next eleven in
              </p>
              <p
                aria-hidden="true"
                className="font-mono text-2xl font-semibold tabular-nums leading-tight text-chalk"
              >
                {countdown ?? '--:--:--'}
              </p>
              <p className="text-[11px] text-chalk/90">Resets at 00:00 UTC daily.</p>
            </div>
          </div>

          {hasHistory && (
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-chalk/90">
              Current streak: {streak.current} &middot; Longest: {streak.longest}
            </p>
          )}

        </div>

        <div className="hidden text-chalk/90 sm:block" aria-hidden="true">
          <PitchDiagram />
        </div>
        <div className="text-chalk/90 sm:hidden" aria-hidden="true">
          <EmptyElevenRow />
        </div>
      </div>
    </section>
  );
}

function Compact({
  countdown,
  playingToday,
  playedToday,
  streak,
  onStartDaily,
}: Readonly<{
  countdown: string | null;
  playingToday: boolean;
  playedToday: boolean;
  streak: StreakState;
  onStartDaily: () => void;
}>) {
  const hasHistory = streak.longest > 0;

  if (playingToday || playedToday) {
    return (
      <div className="w-full rounded-lg border border-turf-deep/25 bg-turf-deep/[0.06] px-4 py-3 text-left">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-turf-deep">
          <LiveDot tone="turf" />
          Today&rsquo;s eleven
        </p>
        <p className="mt-1.5 text-sm font-medium text-ink">
          {playingToday
            ? 'You’re playing today’s puzzle.'
            : 'You’ve played today’s puzzle.'}
        </p>
        <p className="mt-1 font-mono text-[11px] text-ink/60">
          Next in{' '}
          <span aria-hidden="true" className="tabular-nums text-ink/75">
            {countdown ?? '--:--:--'}
          </span>
        </p>
        {hasHistory && (
          <p className="mt-1 font-mono text-[11px] text-ink/60">
            Current streak: {streak.current} &middot; Longest: {streak.longest}
          </p>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onStartDaily}
      className="group w-full rounded-lg bg-turf-deep px-4 py-3 text-left text-chalk transition-colors hover:bg-turf-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-chalk/90">
        Today&rsquo;s eleven
      </span>
      <span className="mt-1 flex items-center justify-between gap-3 text-sm font-semibold">
        Play today&rsquo;s daily puzzle
        {' '}
        <span aria-hidden="true" className="transition-transform motion-safe:group-hover:translate-x-0.5">
          {'→'}
        </span>
      </span>
    </button>
  );
}

export default function DailyEntry({
  todayKey,
  urlReady,
  dailyKey,
  streak = EMPTY_STREAK,
  onStartDaily,
  variant = 'hero',
}: Readonly<DailyEntryProps>) {
  // Pre-hydration gate. Before the URL is read and before today's key is
  // known there is genuinely nothing to say, and rendering a placeholder
  // would be a value we would then have to keep correct. Rendering nothing
  // is what makes the first client paint identical to the server's.
  const countdown = useCountdown();
  if (!urlReady || todayKey === null) return null;

  const playingToday = dailyKey === todayKey;
  const playedToday = hasPlayed(streak, todayKey);

  if (variant === 'compact') {
    return (
      <Compact
        countdown={countdown}
        playingToday={playingToday}
        playedToday={playedToday}
        streak={streak}
        onStartDaily={onStartDaily}
      />
    );
  }

  return (
    <Hero
      todayKey={todayKey}
      countdown={countdown}
      playingToday={playingToday}
      playedToday={playedToday}
      streak={streak}
      onStartDaily={onStartDaily}
    />
  );
}
