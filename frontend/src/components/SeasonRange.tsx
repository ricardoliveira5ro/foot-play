'use client';

import { useId } from 'react';
import {
  SEASON_MAX,
  SEASON_MIN,
  clampSeason,
  normaliseSeasonRange,
} from '@/lib/competitionFilters';

interface SeasonRangeProps {
  from: number | null;
  to: number | null;
  onFromChange: (value: number | null) => void;
  onToChange: (value: number | null) => void;
  /** The distinct seasons the server reports; drives only the datalist hint. */
  seasons: { season: number; count: number }[];
  loading: boolean;
}

/** Parses a number-input string; empty and non-numeric both mean "any". */
function parseBound(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  return /^-?\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/**
 * Two-bound numeric control for the Season dimension.
 *
 * One control, not two independent filters: an empty box means "unbounded on
 * that side". Moving one bound past the other pushes the other with it, so an
 * inverted range is unreachable by interaction even though the URL can still
 * express one. Out-of-range and non-integer entries report `null`, matching
 * v1.1.1's `paramsToFilters` coercion.
 */
export default function SeasonRange({
  from,
  to,
  onFromChange,
  onToChange,
  seasons,
  loading,
}: Readonly<SeasonRangeProps>) {
  const uid = useId();
  const fromId = `filter-season-from-${uid}`;
  const toId = `filter-season-to-${uid}`;
  const listId = `filter-season-list-${uid}`;

  const commitFrom = (raw: string) => {
    const range = normaliseSeasonRange(clampSeason(parseBound(raw)), to, 'from');
    onFromChange(range.from);
    if (range.to !== to) onToChange(range.to);
  };

  const commitTo = (raw: string) => {
    const range = normaliseSeasonRange(from, clampSeason(parseBound(raw)), 'to');
    onToChange(range.to);
    if (range.from !== from) onFromChange(range.from);
  };

  const inputClass =
    'w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-flare';

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink/65">
        Season
      </legend>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor={fromId} className="mb-1 block text-xs text-ink/65">
            Season from
          </label>
          <input
            id={fromId}
            type="number"
            inputMode="numeric"
            min={SEASON_MIN}
            max={SEASON_MAX}
            list={listId}
            placeholder="Any"
            aria-label="Season from"
            value={from ?? ''}
            onChange={(event) => commitFrom(event.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex-1">
          <label htmlFor={toId} className="mb-1 block text-xs text-ink/65">
            Season to
          </label>
          <input
            id={toId}
            type="number"
            inputMode="numeric"
            min={SEASON_MIN}
            max={SEASON_MAX}
            list={listId}
            placeholder="Any"
            aria-label="Season to"
            value={to ?? ''}
            onChange={(event) => commitTo(event.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <datalist id={listId}>
        {seasons.map((option) => (
          <option key={option.season} value={option.season} />
        ))}
      </datalist>
      {loading && (
        <output className="mt-2 block px-1 text-sm text-ink/55">Loading seasons…</output>
      )}
      <p className="mt-2 text-xs text-ink/50">Leave a box empty for any season.</p>
    </fieldset>
  );
}
