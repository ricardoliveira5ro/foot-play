# v1.1.4 — Competition, Season, and the empty state (changelog)

**Status:** landed. This is the last patch in the v1.1 filter line, so this
document also closes out v1.1.

Plan: [`plan-v1.1.4-competition-season-empty-state.md`](./plan-v1.1.4-competition-season-empty-state.md).
Overview: [`overview.md`](./overview.md).

## What landed

- **Competition dimension.** `CompetitionMultiSelect` reuses the v1.1.3
  checkbox-list contract (with a compact, no-search shape — 28 options in
  alphabetical order) and the same draft-then-apply model. Its options and
  counts come straight from `FilterOptionsResponse.competitions`; the selected
  option keeps a non-zero count (R5 facet exclusion).
- **Season dimension.** `SeasonRange` is a single two-bound control over
  `seasonFrom` / `seasonTo`. Moving one bound past the other pushes it, so an
  inverted range is unreachable by interaction; a hand-edited inverted URL is
  left intact and explained by the empty state rather than silently swapped.
  The option universe is 2013–2025 as returned by the server — no 2026 (partial
  season) and no `null` are synthesised.
- **Filter empty state.** `FilterEmptyState` is a presentational `role="status"`
  region selected by `filterOptions.total === 0 && !optionsLoading &&
  hasActiveFilters(filters)`. It offers **Clear all filters** (fast escape to an
  unfiltered board) and **Adjust filters** (back to the pre-screen with the
  selection intact). It is keyed on a successful `total`, never on a failed
  match request, so the error state stays distinct.
- **Per-dimension clear.** `FilterSection` gains an optional `onClear` that
  renders a labelled clear button next to the chips for that dimension.

## Files

Added:

- `frontend/src/lib/competitionFilters.ts` (+ `.test.ts`)
- `frontend/src/components/CompetitionMultiSelect.tsx` (+ `.test.tsx`)
- `frontend/src/components/SeasonRange.tsx` (+ `.test.tsx`)
- `frontend/src/components/FilterEmptyState.tsx` (+ `.test.tsx`)

Modified:

- `frontend/src/components/FilterSection.tsx` — optional `onClear`.
- `frontend/src/components/FilterPanel.tsx` (+ `.test.tsx`) — wires the two new
  dimensions into the sections array.
- `frontend/app/missing-eleven/page.tsx` (+ `.test.tsx`) — mounts the empty
  state, surfaces an options failure as the error state when no match is on
  screen, and removes the old "No playable matches are available." error for a
  null match result.

No backend, schema, API, or dependency change.

## Deviations from the plan (recorded, deliberate)

1. **`normaliseSeasonRange(from, to, moved)` takes a third `moved` argument.**
   The plan sketched a two-argument signature; the third tells the helper which
   bound the user moved so it knows which direction to push. `'from'` pushes
   `to` up, `'to'` pushes `from` down.
2. **The active-dimension count is 3, not "four".** The plan's prose says the
   empty state counts "four active dimensions", but the frozen
   `countActiveFilters` (v1.1.1) counts team / competition / season. The patch
   uses the frozen 3 and does not change the helper.
3. **`FilterOptionRow` was not extracted.** The plan suggested a shared row
   component; extracting it would have touched the frozen v1.1.3
   `ClubMultiSelect`. `CompetitionMultiSelect` mirrors the row inline instead,
   keeping v1.1.3 untouched per criterion 1.
4. **`onClearAll` also clears the URL.** The plan wrote it as
   `setFilters(EMPTY_FILTERS)`. Because the empty state does not render
   `FilterUrlSync`, clearing only the state left the filtered URL in place, and
   the board's reader (mounted on the way back) would re-read it and bounce
   straight into the empty state again. `handleClearFilters` writes the URL
   first, then the filters — the same ordering as `handleStart`.
5. **`onOpenFilters` returns to the pre-screen.** The plan assumed an in-game
   panel with `setFiltersOpen(true)`. This page deliberately has no in-game
   panel, so **Adjust filters** reuses `handleNewPuzzle` and returns to the
   gate with the current selection preserved.
6. **An options failure is surfaced as the error state.** When no match is on
   screen, `displayError = state.error ?? optionsError`, so "the server is
   down" never reads as "no games match".

## Validation

Measured on the implementation branch (not asserted against a fixed count):

| Gate | Command | Result |
|---|---|---|
| Frontend suite | `cd frontend && npm run test:coverage` | 26 files, **449 tests passed** |
| New controls + empty state | `npx vitest run src/components/CompetitionMultiSelect.test.tsx src/components/SeasonRange.test.tsx src/components/FilterEmptyState.test.tsx src/lib/competitionFilters.test.ts` | green |
| Panel wiring | `npx vitest run src/components/FilterPanel.test.tsx` | 49 passed (v1.1.3 suites untouched) |
| Page mount | `npx vitest run app/missing-eleven/page.test.tsx` | 32 passed |
| Production build | `cd frontend && npm run build` | exit 0, 5 static pages |
| Types | `cd frontend && npx tsc --noEmit` | clean |
| Lint | `cd frontend && npm run lint` | 0 errors; 1 pre-existing warning in `GameComplete.test.tsx` (untouched by this patch) |
| Coverage | `npm run test:coverage` | statements 98.83%, branches 97.6%, functions 98.59%, lines 99.53% |
| No 2026 / null season | `grep -rn "2026" src/lib/competitionFilters.ts src/components/SeasonRange.tsx` | no output |
| No backend drift | `git diff --stat -- backend/ backend/prisma/` | empty |

### Live smoke (backend API, real database)

- `GET /api/matches/filter-options` → `total: 9689`, seasons **2013–2025** (no
  2026, no null), 28 competitions, 479 teams.
- Inverted range `?seasonFrom=2024&seasonTo=2020` → `total: 0` (the empty-state
  key).
- Narrow combination `?competitionIds=COPA&seasonFrom=2013&seasonTo=2013` →
  `total: 0`.
- R5 facet exclusion: `?competitionIds=L1` → `total: 442` and the selected
  `L1` option still reports `count: 442` (its own list does not collapse to 0).
- `GET /missing-eleven` served `200` with the pre-screen rendered.

The browser-interaction steps (apply all three dimensions, clear/adjust from the
empty state, stop the backend and confirm the error state) are exercised by the
32 `page.test.tsx` cases; no browser was available in the implementation
environment.

## Acceptance criteria

All 16 acceptance criteria in the plan are met. Criteria 1 (v1.1.3 untouched),
2–3 (empty keyed on `total`, error distinct), 5 (escapable), 8 (inverted range
explained), 9 (per-dimension clamping), 10 (R5 on the new dimensions), 11
(draft-then-apply), 12 (files under `src/components/`), 13 (accessibility), 14
(presentational `FilterEmptyState`), 15 (no backend/dependency change), and 16
(all gates clean) are each covered by a named test or the table above.
