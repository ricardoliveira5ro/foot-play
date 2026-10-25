import type { DailyKey } from '@/lib/daily';

/**
 * The daily entry point.
 *
 * §6.2: daily is a MODE that sits alongside the difficulty modes, not an
 * option inside the filter panel. It therefore renders one button and no
 * controls, and it is offered by the page rather than by the filter panel.
 *
 * This component never touches the router and never touches storage. It asks
 * for a daily via onStartDaily; the URL is written by FilterUrlSync, which
 * is the app's only URL writer. That keeps the link copyable from the
 * address bar for free.
 */

export interface DailyEntryProps {
  /** The day key currently requested via ?daily=, or null in ordinary play. */
  dailyKey: DailyKey | null;
  /** Today's UTC day key, or null before the post-mount read has happened. */
  todayKey: DailyKey | null;
  /** True once the query string has been read. */
  urlReady: boolean;
  /** Request the daily puzzle. */
  onStartDaily: () => void;
}

/** '1 January 2026' — display only. Never fed back into a day key. */
function formatDay(key: DailyKey): string {
  const date = new Date(`${key}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export default function DailyEntry({ dailyKey, todayKey, urlReady, onStartDaily }: DailyEntryProps) {
  // Pre-hydration gate. Before the URL is read and before today's key is
  // known there is genuinely nothing to say, and rendering a placeholder
  // would be a value we would then have to keep correct. Rendering nothing
  // is what makes the first client paint identical to the server's.
  if (!urlReady || todayKey === null) return null;

  const playingToday = dailyKey === todayKey;

  if (playingToday) {
    return (
      <p className="text-xs text-ink/65">You are playing today&apos;s puzzle.</p>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <button
        type="button"
        onClick={onStartDaily}
        className="w-full rounded-lg border border-ink/20 px-5 py-3 font-semibold text-ink transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare"
      >
        Daily puzzle — {formatDay(todayKey)}
      </button>
      <p className="text-xs text-ink/55">One puzzle a day. Filters do not apply.</p>
    </div>
  );
}
