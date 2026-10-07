'use client';

import { useDeferredValue, useId, useState } from 'react';
import { filterClubOptions, groupClubOptions, type ClubOption } from '@/lib/clubFilters';

interface ClubMultiSelectProps {
  /** Dimension label — "Team" or "Opponent". */
  legend: string;
  /** Stable id namespace (e.g. 'filter-team'); must differ per rendered list. */
  inputIdPrefix: string;
  /** The complete, unfiltered option universe from the server. */
  options: ClubOption[];
  /** The caller's selection; null means nothing selected. Never mutated here. */
  selected: number[] | null;
  /** Reports a toggle only — applying filters is the panel's Apply button. */
  onToggle: (id: number) => void;
  loading: boolean;
}

/**
 * Searchable, grouped, counted checkbox list for one club dimension.
 * Renders Team and Opponent alike; the caller supplies the label, the
 * options, and the toggle callback. Counts are displayed exactly as the
 * server sent them — never recomputed, never used to hide or disable an
 * option.
 */
export default function ClubMultiSelect({
  legend,
  inputIdPrefix,
  options,
  selected,
  onToggle,
  loading,
}: ClubMultiSelectProps) {
  const [query, setQuery] = useState('');
  // useDeferredValue keeps typing responsive over a ~500-row list. At this
  // size plain state would also work — cheap headroom, not a measured fix.
  const deferredQuery = useDeferredValue(query);
  const uid = useId();
  const searchId = `${inputIdPrefix}-search-${uid}`;
  const selectedSet = new Set(selected ?? []);

  const { clubs, nationalTeams } = groupClubOptions(options);
  const visibleClubs = filterClubOptions(clubs, deferredQuery);
  const visibleNational = filterClubOptions(nationalTeams, deferredQuery);
  const searching = deferredQuery.trim().length > 0;
  const noMatches = searching && visibleClubs.length === 0 && visibleNational.length === 0;

  const renderOption = (option: ClubOption) => {
    // Unique across the two lists on the page (prefix + useId) and stable
    // across renders (useId), so label/htmlFor wiring cannot rot.
    const inputId = `${inputIdPrefix}-${uid}-${option.id}`;
    return (
      <li key={option.id}>
        <label
          htmlFor={inputId}
          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink transition-colors hover:bg-ink/5 focus-within:bg-ink/5"
        >
          <input
            type="checkbox"
            id={inputId}
            checked={selectedSet.has(option.id)}
            onChange={() => onToggle(option.id)}
            className="h-4 w-4 shrink-0 accent-flare"
          />
          <span className="truncate">{option.name} ({option.count})</span>
        </label>
      </li>
    );
  };

  const groupClass =
    'mb-2 rounded-lg border border-ink/10 bg-paper/60 px-2 pb-1.5 pt-1';
  const legendClass =
    'px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink/55';

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink/65">
        {legend}
      </legend>

      <div className="mb-3 flex items-center gap-2">
        <label htmlFor={searchId} className="sr-only">
          Search {legend}
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Type to filter ${legend.toLowerCase()}s`}
          className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-flare"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="shrink-0 rounded-md px-2 py-2 text-xs font-medium text-ink/60 underline transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare"
          >
            Clear search
          </button>
        )}
      </div>

      {loading ? (
        <p role="status" className="px-1 py-3 text-sm text-ink/55">
          Loading {legend.toLowerCase()} options…
        </p>
      ) : noMatches ? (
        <p role="status" className="px-1 py-3 text-sm text-ink/55">
          No clubs match “{deferredQuery.trim()}”.
        </p>
      ) : (
        <>
          {/* Both groups render even when empty: an unlabelled gap is worse
              for a screen reader than an empty labelled group. */}
          <fieldset className={groupClass}>
            <legend className={legendClass}>Clubs</legend>
            <ul className="max-h-56 overflow-y-auto pr-1">
              {visibleClubs.map(renderOption)}
            </ul>
          </fieldset>
          <fieldset className={groupClass}>
            <legend className={legendClass}>National teams</legend>
            <ul className="max-h-40 overflow-y-auto pr-1">
              {visibleNational.map(renderOption)}
            </ul>
          </fieldset>
        </>
      )}
    </fieldset>
  );
}
