'use client';

import { useId } from 'react';
import type { CompetitionOption } from '@/lib/competitionFilters';

interface CompetitionMultiSelectProps {
  /** The complete, unfiltered competition universe from the server. */
  options: CompetitionOption[];
  /** The caller's selection; null means nothing selected. Never mutated here. */
  selected: string[] | null;
  /** Reports a toggle only — applying filters is the panel's Apply button. */
  onToggle: (id: string) => void;
  loading: boolean;
}

/**
 * Counted checkbox list for the Competition dimension.
 *
 * Deliberately simpler than `ClubMultiSelect`: 28 options in the server's
 * alphabetical order need neither search nor grouping. Counts are displayed
 * exactly as the server sent them — never recomputed, never used to hide or
 * disable an option.
 */
export default function CompetitionMultiSelect({
  options,
  selected,
  onToggle,
  loading,
}: Readonly<CompetitionMultiSelectProps>) {
  const uid = useId();
  const selectedSet = new Set(selected ?? []);

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink/65">
        Competition
      </legend>

      {loading ? (
        <output className="px-1 py-3 text-sm text-ink/55">
          Loading competition options…
        </output>
      ) : (
        <ul className="max-h-56 overflow-y-auto rounded-lg border border-ink/10 bg-paper/60 py-1 pr-1">
          {options.map((option) => {
            // Unique across the page (prefix + useId) and stable across
            // renders (useId), so label/htmlFor wiring cannot rot.
            const inputId = `filter-competition-${uid}-${option.id}`;
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
                  <span className="truncate">
                    {option.name} ({option.count})
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
