'use client';

import { useEffect, useId, useState } from 'react';
import ClubMultiSelect from './ClubMultiSelect';
import { toClubOptions, toggleId } from '@/lib/clubFilters';
import { hasActiveFilters, countActiveFilters } from '@/lib/filters';
import { filtersEqual } from '@/lib/filtersEqual';
import { EMPTY_FILTERS, type FilterOptionsResponse, type GameFilterParams } from '@/types';

interface FilterPanelProps {
  /** Controlled open/closed state — not persisted anywhere. */
  open: boolean;
  onToggleOpen: () => void;
  /** The APPLIED filter set. The panel never mutates it directly. */
  filters: GameFilterParams;
  /** Server options for the applied set (v1.1.1/v1.1.2); counts come as-is. */
  options: FilterOptionsResponse | null;
  optionsLoading: boolean;
  optionsError: string | null;
  /** Called only by Apply and Clear all — never by a checkbox toggle. */
  onApply: (next: GameFilterParams) => void;
  /**
   * Present on the pre-screen only: commits the draft AND starts the game.
   * When set, the primary button reads "Start game", is never disabled, the
   * panel toggle is hidden (so the panel cannot close before Start is
   * reachable), and the panel stays open — the page decides when it closes.
   */
  onStart?: (next: GameFilterParams) => void;
}

/**
 * Collapsible filter panel with a draft-then-apply selection model.
 *
 * Every edit lands in local `draft` state; `onApply` fires only from the
 * Apply / Clear all buttons. That is what keeps the counts (which are keyed
 * on the *applied* set) from changing while the user is editing — R5.
 * When `onStart` is present (the pre-screen) the panel runs in start mode:
 * "Start game" replaces Apply, the toggle is hidden, and the panel never
 * closes itself.
 */
export default function FilterPanel({
  open,
  onToggleOpen,
  filters,
  options,
  optionsLoading,
  optionsError,
  onApply,
  onStart,
}: FilterPanelProps) {
  const startMode = onStart !== undefined;
  const [draft, setDraft] = useState<GameFilterParams>(filters);
  const panelId = useId();

  // Re-sync the draft when the APPLIED set changes underneath us (deep link,
  // Clear all, Back button) — but not while the user is editing: editing only
  // touches `draft`, and `filters` is a prop that cannot change until Apply.
  // That asymmetry is the mechanism; do not "simplify" this dependency.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(filters);
  }, [filters]);

  // Both facets carry the same club universe with different counts; the
  // merged map is a name source robust to either list being narrower.
  const teams = options?.teams ?? [];
  const opponents = options?.opponents ?? [];
  const clubNames = new Map<number, string>(
    [...teams, ...opponents].map((club) => [club.id, club.name]),
  );
  const teamOptions = toClubOptions(teams, clubNames);
  const opponentOptions = toClubOptions(opponents, clubNames);

  const toggleTeam = (id: number) =>
    setDraft((current) => ({ ...current, teamIds: toggleId(current.teamIds, id) }));
  const toggleOpponent = (id: number) =>
    setDraft((current) => ({ ...current, opponentIds: toggleId(current.opponentIds, id) }));

  const apply = () => {
    if (onStart) {
      onStart(draft);   // commit + start in one call; the gate is the page's
      return;
    }
    onApply(draft);
    onToggleOpen();
  };

  const clearAll = () => {
    // Reset the draft directly: when the applied set is already empty (the
    // pre-screen, or a previous Clear all) onApply(EMPTY) is a no-op upstream
    // and the [filters] re-sync never fires — the button would clear nothing
    // the user can see. In-game the re-sync lands the same value anyway.
    setDraft({ ...EMPTY_FILTERS });
    onApply({ ...EMPTY_FILTERS });
  };

  // Count active *dimensions*, not selected values: Team x3 + Opponent x1
  // reads as 2 filters, not 4 — the alternative (selected-value count) looks
  // equally plausible and misreports the filter set.
  const activeCount = hasActiveFilters(filters) ? countActiveFilters(filters) : 0;
  const draftChanged = !filtersEqual(draft, filters);

  return (
    <div className="w-full">
      {/* Start mode hides the toggle: the pre-screen forces the panel open,
          and a closable panel would make Start game unreachable. */}
      {!startMode && (
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-ink/15 bg-paper px-4 py-3 text-sm font-semibold text-ink transition-colors hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare"
        >
          <span>Filters{activeCount > 0 ? ` (${activeCount})` : ''}</span>
          <span aria-hidden="true" className="text-ink/50">
            {open ? '▲' : '▼'}
          </span>
        </button>
      )}

      {/* Always mounted (hidden when closed) so the panel never remounts on a
          filter change: an in-progress search and the draft survive. */}
      <div id={panelId} role="region" aria-label="Filters" hidden={!open} className="mt-3">
        {optionsError && (
          <p role="alert" className="mb-3 rounded-md border border-failed/40 bg-failed/10 px-3 py-2 text-sm text-failed">
            {optionsError}
          </p>
        )}

        <div className="flex flex-col gap-4">
          <ClubMultiSelect
            legend="Team"
            inputIdPrefix="filter-team"
            options={teamOptions}
            selected={draft.teamIds}
            onToggle={toggleTeam}
            loading={optionsLoading}
          />
          <ClubMultiSelect
            legend="Opponent"
            inputIdPrefix="filter-opponent"
            options={opponentOptions}
            selected={draft.opponentIds}
            onToggle={toggleOpponent}
            loading={optionsLoading}
          />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={apply}
            disabled={!startMode && !draftChanged}
            className="flex-1 rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-chalk transition-colors hover:bg-flare focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare disabled:cursor-not-allowed disabled:opacity-40"
          >
            {startMode ? 'Start game' : 'Apply'}
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-lg border border-ink/20 px-4 py-2.5 text-sm font-medium text-ink/70 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare"
          >
            Clear all
          </button>
        </div>
      </div>
    </div>
  );
}
