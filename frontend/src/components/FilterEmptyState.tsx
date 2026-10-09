'use client';

import { hasActiveFilters } from '@/lib/filters';
import type { GameFilterParams } from '@/types';

interface FilterEmptyStateProps {
  /** The applied filter set; used only to decide whether Clear all is offered. */
  filters: GameFilterParams;
  onClearAll: () => void;
  onOpenFilters: () => void;
  /** Derived once at the page level so the copy logic has one owner. */
  invertedSeasonRange: boolean;
}

/**
 * Presentational "your filter matched nothing" state, rendered in place of the
 * game board when the server reports `total === 0` for an active filter set.
 *
 * Deliberately never reached via a failed request: a 404 or a network failure
 * renders the error state instead, so the user is never told their filter is
 * at fault when the server is unreachable.
 */
export default function FilterEmptyState({
  filters,
  onClearAll,
  onOpenFilters,
  invertedSeasonRange,
}: Readonly<FilterEmptyStateProps>) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-24 text-center md:px-6"
    >
      <h2 className="font-display text-2xl uppercase tracking-[0.08em] text-ink">
        No games match these filters
      </h2>
      <p className="mt-3 max-w-md text-sm text-ink/65">
        {invertedSeasonRange
          ? 'Your season range starts after it ends, so nothing can match.'
          : 'None of the games in the dataset match this combination.'}
      </p>
      <p className="mt-2 max-w-md text-xs text-ink/50">
        Season filtering covers completed seasons only.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {hasActiveFilters(filters) && (
          <button
            type="button"
            onClick={onClearAll}
            className="rounded-lg bg-ink px-6 py-3 font-semibold text-chalk transition-colors hover:bg-flare focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare"
          >
            Clear all filters
          </button>
        )}
        <button
          type="button"
          onClick={onOpenFilters}
          className="text-sm text-ink/60 underline underline-offset-4 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare"
        >
          Adjust filters
        </button>
      </div>
    </div>
  );
}
