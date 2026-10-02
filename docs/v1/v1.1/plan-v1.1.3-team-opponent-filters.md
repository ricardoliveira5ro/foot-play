# Team & Opponent Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first visible filtering lands — two multi-select controls, Team and Opponent, rendered as searchable, grouped, counted checkbox lists inside a collapsible filter panel. Counts are read from the single grouped query built in v1.1.1 and are **never recomputed while the user edits**; the panel keeps a draft selection and commits it on Apply, which is what makes "a count describes the applied filter set, not the one being typed" structurally true rather than a thing to remember.

**Architecture:** Two new components under `frontend/src/components/`. `ClubMultiSelect` is the single control used for both dimensions — Team and Opponent differ only in their label, the option field they read, and the callback they call, so implementing them separately would duplicate a ~500-row list renderer for a two-line prop difference. `FilterPanel` owns the panel chrome, the draft-vs-applied split, and the Apply/Clear actions. The panel is a pure function of `options`, `filters`, and two callbacks; it fetches nothing and computes no counts.

**Tech Stack:** TypeScript, React 19, Tailwind (matching the existing `frontend/components/` idiom), Vitest + jsdom + Testing Library + `userEvent`, `useDeferredValue` for the search box.

---

## Global Constraints

- **This patch renders Team and Opponent only.** Competition, Season, and the empty state belong to v1.1.4. The panel must not contain a stub for either.
- **Counts must not be recomputed on toggle. Ever.** `useFilterOptions` is keyed on the *applied* filter set (v1.1.2 Task 2). The panel therefore holds its selection in local draft state and calls `setFilters` **only** from the Apply button. If any control calls `setFilters` directly, R5 is violated and the count under the user's cursor changes mid-edit. This is the single most important constraint in the patch; the tests in Task 2 exist to prove it.
- **The option universe is unfiltered and always complete.** v1.1.1 derives option lists from the unfiltered `club.findMany` / `competition.findMany`, so all ~500 clubs are present on every request, including those whose count is 0. A control that filters its option list by "has count > 0" would be **wrong**: it hides exactly the options the user needs in order to escape a too-narrow filter. Never filter the list by count.
- **A zero-count option is visible, enabled, and selectable.** It shows its count as `0`, which is honest information, not a bug to hide. R5 exists precisely so this case is reachable and explicable rather than silently absent.
- **The Opponent list is the same clubs as the Team list.** The backend returns the same option universe under `teams` and `opponents`; only the counts differ, because the two facets exclude different dimensions. Render both from the same component and the same universe.
- **A team may be both a selected Team and a selected Opponent.** Nothing prevents it and nothing should. With OR-within-dimension semantics, selecting Benfica as a Team and Porto as both a Team and an Opponent yields the games where Benfica faced Porto *or* Porto played someone else — which is what "and Porto is in the fixtures" means to a user. Do not add mutual-exclusion logic; it would be surprising and it is not in the spec.
- **New components go in `frontend/src/components/`, not `frontend/components/`.** `frontend/vitest.config.ts` aliases `@` to `frontend/src` (`:19`) and provides one explicit extra alias for `@/components/TeamTabBar` (`:20-22`) because that file lives outside `src`. A new component in `frontend/components/` would need its own alias entry to be testable, and every future filter component would need another. Put these in `src/components/` and `@/components/FilterPanel` resolves in both Next and Vitest with no config change. This is why `frontend/src/components/` already holds `GameComplete` and `WordleModal`.
- **Counts are numbers from the server, never derived client-side.** Do not compute a count by multiplying or summing other numbers in the component. R1: a wrong count is worse than a missing one, and a client-side derivation is unverified by definition.
- **The panel must not remount on filter change.** Remounting resets the draft selection and closes the panel, which means a user who applies a filter and then tweaks it loses their place. Key nothing on `filters`; keep the panel mounted in the page tree and control its visibility with a boolean.
- **Accessibility is a requirement, not a finish.** Every checkbox gets a real `<input type="checkbox">` with a stable `id` and a bound `<label htmlFor>`. The two lists are `<fieldset>` + `<legend>`. The search input has a `<label>`, not a placeholder as its only accessible name. The panel toggle is a `<button aria-expanded>` controlling a region with `aria-label`. Use `userEvent` in the tests and query by role and accessible name — never by CSS class or test id, so the tests fail if the semantics regress.
- **Or semantics.** Within one dimension, selected values are OR-ed; across dimensions, AND-ed. The UI must reflect that: toggling a second Team never deselects the first. The reducer and the backend already do this (v1.1.1 Tasks 5–6); the UI just must not get it wrong.
- **The panel is closed by default and its state is not persisted.** A user landing on a deep-linked filtered URL sees a panel showing the active filter count, not an open panel they did not open.
- **No new dependencies.** Tailwind and `@testing-library/user-event` are already present (`frontend/src/components/GameComplete.test.tsx:5`).
- **`R1` and `R5` are v1.1-local constraint IDs, not roadmap §8 risks.** Both are declared in `plan-v1.1.1-filter-foundation.md`, whose Global Constraints carry the namespace note governing every `R#` in this line — read it before citing one. `R7`, cited below, is the exception: a roadmap §8 risk.
- **TDD mode: advisory_active.** Test first for all testable logic; red → green → refactor; report the commands and results.
- **No backend, schema, or API changes in this patch.** v1.1.1 owns the wire format; this patch consumes `FilterOptionsResponse` as-is.

---

### Task 1: Add the pure club-list helpers

**Files:**
- Create: `frontend/src/lib/clubFilters.ts`
- Create: `frontend/src/lib/clubFilters.test.ts`

**Interfaces:**
- Consumes: `FilterOptionsResponse`, `FilterOptionGroup` from v1.1.1.
- Produces:
  ```ts
  export interface ClubOption { id: number; name: string; isNationalTeam: boolean; count: number }
  export function toClubOptions(groups: FilterOptionGroup[], names: Map<number, string>): ClubOption[]
  export function groupClubOptions(options: ClubOption[]): { clubs: ClubOption[]; nationalTeams: ClubOption[] }
  export function filterClubOptions(options: ClubOption[], query: string): ClubOption[]
  export function toggleId(list: number[] | null, id: number): number[] | null
  ```

**Steps:**

- [ ] **Step 1.1: Write the failing test.**

  Create `frontend/src/lib/clubFilters.test.ts`. Pure, node environment, no DOM:

  ```ts
  describe('toClubOptions', () => {
    it('joins counts to names', ...);
    it('keeps a club whose name is missing from the map, with a visible fallback name', ...);
    it('preserves isNationalTeam', ...);
    it('preserves the server's order and does not re-sort', ...);
    it('returns an empty array for an empty group list', ...);
  });

  describe('groupClubOptions', () => {
    it('splits clubs from national teams', ...);
    it('keeps the input order within each group', ...);
    it('returns two empty groups for an empty list', ...);
  });

  describe('filterClubOptions', () => {
    it('returns everything for an empty or whitespace-only query', ...);
    it('matches case-insensitively', ...);
    it('matches on a substring, not a prefix', ...);
    it('ignores surrounding whitespace in the query', ...);
    it('does not mutate the input array', ...);
    it('strips diacritics so "Benfica" matches "Benfíca"', ...);
  });

  describe('toggleId', () => {
    it('adds an absent id', ...);
    it('removes a present id', ...);
    it('returns null when the last id is removed', ...);
    it('preserves the order of existing ids when adding', ...);
    it('does not mutate the input', ...);
    it('deduplicates an id that is somehow already present', ...);
  });
  ```

  Three of these are more than routine:
  - *"returns `null` when the last id is removed"* is what makes "no teams selected" serialise to an absent URL key rather than `?teamIds=`. Getting it wrong leaves an empty key in the address bar forever.
  - *"matches on a substring, not a prefix"* pins the search behaviour, which is otherwise an arbitrary implementation choice that a user will notice immediately.
  - *"strips diacritics"* — Portuguese club and competition names are full of them, and `normalize('NFD').replace(/\p{Diacritic}/gu, '')` is what makes "Sao Paulo" find "São Paulo". Test the real fixture names from the seeded data, not invented ones.

- [ ] **Step 1.2: Run it and confirm red.**

  ```bash
  cd frontend && npx vitest run src/lib/clubFilters.test.ts
  ```

- [ ] **Step 1.3: Implement.**

  ```ts
  export function toClubOptions(groups: FilterOptionGroup[], names: Map<number, string>): ClubOption[] {
    return groups.map((g) => ({
      id: g.id,
      name: names.get(g.id) ?? `Club ${g.id}`,   // visible fallback, never an empty label
      isNationalTeam: g.isNationalTeam,
      count: g.count,
    }));
  }
  ```

  The fallback name matters for accessibility and for the user: a checkbox labelled with an empty string is unusable with a screen reader, and `#294` is at least findable. **Do not drop unresolvable options** — that would silently hide a selectable team.

  `toggleId` returns a new array and `null` for empty, per the tests. `filterClubOptions` returns the input array unchanged for an empty query rather than a copy, which is safe because the result is only read.

- [ ] **Step 1.4: Verify green, and check the diacritic case against real names.**

  ```bash
  cd frontend && npx vitest run src/lib/clubFilters.test.ts
  ```

  Pull three real club names from the seed and add them as explicit `it.each` cases so the helper is tested against the data it will actually see.

- [ ] **Step 1.5: Commit.**

  ```bash
  git add frontend/src/lib/clubFilters.ts frontend/src/lib/clubFilters.test.ts
  git commit -m "feat: add pure club option grouping, search, and toggle helpers"
  ```

---

### Task 2: Add the `ClubMultiSelect` control

**Files:**
- Create: `frontend/src/components/ClubMultiSelect.tsx`
- Create: `frontend/src/components/ClubMultiSelect.test.tsx`

**Interfaces:**
- Consumes: the `ClubOption` helpers from Task 1.
- Produces:
  ```tsx
  export default function ClubMultiSelect(props: {
    legend: string;                        // "Team" | "Opponent"
    inputIdPrefix: string;                 // stable id namespace, e.g. 'filter-team'
    options: ClubOption[];
    selected: number[] | null;
    onToggle: (id: number) => void;
    loading: boolean;
  }): JSX.Element;
  ```
  A controlled component. It owns only the search box's text; selection is entirely the caller's.

**Steps:**

- [ ] **Step 2.1: Read the existing component idiom.**

  ```bash
  cd frontend && sed -n '1,40p' components/TeamTabBar.tsx
  cd frontend && sed -n '1,30p' src/components/GameComplete.test.tsx
  ```

  Match the prop-comment style, the Tailwind scale, the `aria-label` conventions, and the `// @vitest-environment jsdom` + `userEvent` test pattern already in the repo. Do not introduce a CSS-in-JS or CSS-module approach the repo does not already use.

- [ ] **Step 2.2: Write the failing test.**

  ```tsx
  // @vitest-environment jsdom
  import { render, screen, within } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import ClubMultiSelect from './ClubMultiSelect';

  it('renders one checkbox per option with a real label', ...);
  it('shows the count next to every option, including a zero count', ...);
  it('keeps a zero-count option visible, enabled, and selectable', ...);   // R5
  it('renders nothing for a zero-count option other than the 0 label', ...);
  it('splits options into Clubs and National teams under two fieldsets', ...);
  it('checks the boxes for every selected id', ...);
  it('calls onToggle with the clicked id and nothing else', ...);
  it('never disables a checkbox, whatever the count', ...);
  it('filters by the search box and does not clear the selection', ...);
  it('restores the full list when the search box is cleared', ...);
  it('shows an explicit empty message when the search matches nothing', ...);
  it('shows a loading state and no checkboxes while options are loading', ...);
  it('gives every checkbox a unique, stable id', ...);
  it('exposes the legend as the fieldset accessible name', ...);
  it('is reachable by getByRole with an accessible name', ...);
  ```

  Three of these carry real weight:
  - *"calls `onToggle` with the clicked id and nothing else"* is how the Apply-only contract is enforced from below. If the component ever started calling an `onApply`, this test fails.
  - *"never disables a checkbox, whatever the count"* is the R5 requirement stated as a failing assertion. Someone will eventually try to `disabled={count === 0}` as a kindness; this test is the reason they cannot.
  - *"gives every checkbox a unique, stable id"* guards the `htmlFor` wiring, which silently rots the moment two lists render on one page — which is exactly what the panel does.

- [ ] **Step 2.2b: Run it and confirm red.**

  ```bash
  cd frontend && npx vitest run src/components/ClubMultiSelect.test.tsx
  ```

- [ ] **Step 2.3: Implement.**

  ```tsx
  'use client';
  import { useDeferredValue, useId, useState } from 'react';
  import { groupClubOptions, filterClubOptions } from '@/lib/clubFilters';

  export default function ClubMultiSelect({ legend, inputIdPrefix, options, selected, onToggle, loading }: Props) {
    const [query, setQuery] = useState('');
    const deferredQuery = useDeferredValue(query);
    const uid = useId();
    const groups = groupClubOptions(options);
    const matches = (o: ClubOption[]) => filterClubOptions(o, deferredQuery);
    const clubs = matches(groups.clubs);
    const nationalTeams = matches(groups.nationalTeams);
    const selectedSet = new Set(selected ?? []);
    ...
  }
  ```

  Notes:
  - `useDeferredValue` on the query keeps typing responsive over a ~500-row list. With the list this small a plain `useState` would also work, so this is a cheap headroom buy rather than a fix for a measured problem — say so in a comment rather than implying it is required.
  - `useId` gives SSR-stable ids; combined with `inputIdPrefix` the rendered id is `${inputIdPrefix}-${uid}-${option.id}`, which is unique across the two lists on the page and stable across renders.
  - Render a `<fieldset>` per group with a `<legend>`, even when a group is empty. An empty `<select>` or a bare "none" string is worse for a screen reader than an empty labelled group.
  - The "no matches" message replaces the search results only — the search box and the Clear-search affordance must remain, or the user is stuck in a filtered view with no way out.
  - The count is rendered as text inside the `<label>`, so it is part of the accessible name (`Porto (42)`). That is intended: a screen-reader user needs the count to choose, and putting it outside the label would hide it.
  - **Do not `disabled` a zero-count checkbox.** Render it identically apart from the number.

- [ ] **Step 2.4: Verify green.**

  ```bash
  cd frontend && npx vitest run src/components/ClubMultiSelect.test.tsx
  ```

- [ ] **Step 2.5: Commit.**

  ```bash
  git add frontend/src/components/ClubMultiSelect.tsx frontend/src/components/ClubMultiSelect.test.tsx
  git commit -m "feat: add the searchable counted club multi-select"
  ```

---

### Task 3: Add the `FilterPanel` with draft-then-apply

**Files:**
- Create: `frontend/src/components/FilterPanel.tsx`
- Create: `frontend/src/components/FilterPanel.test.tsx`

**Interfaces:**
- Consumes: `ClubMultiSelect` (Task 2), `toClubOptions` / `toggleId` (Task 1), `FilterOptionsResponse` and `GameFilterParams` (v1.1.1).
- Produces:
  ```tsx
  export default function FilterPanel(props: {
    open: boolean;
    onToggleOpen: () => void;
    filters: GameFilterParams;                 // the APPLIED set
    options: FilterOptionsResponse | null;
    optionsLoading: boolean;
    optionsError: string | null;
    onApply: (next: GameFilterParams) => void;
  }): JSX.Element;
  ```
  This patch supplies the two club dimensions and their names; Task 4 mounts it.

**Steps:**

- [ ] **Step 3.1: Write the failing test.**

  ```tsx
  // @vitest-environment jsdom
  it('renders a toggle button showing how many filters are active', ...);
  it('reports aria-expanded correctly and toggles', ...);
  it('renders the Team and Opponent lists when open', ...);
  it('renders nothing but the toggle when closed', ...);
  it('does not call onApply when a checkbox is toggled', ...);          // ← the R5 contract
  it('calls onApply with the updated draft only when Apply is pressed', ...);
  it('calls onApply with EMPTY_FILTERS when Clear all is pressed', ...);
  it('does not re-read counts while the draft is being edited', ...);     // options identity must not change
  it('resets the draft to the applied filters after a successful apply', ...);
  it('keeps the draft after an apply that changed nothing', ...);
  it('preserves the draft selections the user made before opening', ...);
  it('toggling a second team keeps the first selected (OR semantics)', ...);
  it('shows the options error without hiding the toggle', ...);
  it('disables Apply when the draft equals the applied filters', ...);
  it('does not remount the panel when filters change', ...);
  ```

  The first three R5-contract tests are the reason this task exists:
  - *"does not call `onApply` when a checkbox is toggled"* proves the count shown under the cursor cannot change mid-edit. If this test has to be weakened to make something pass, the Apply-button design is wrong and should be reconsidered rather than the test relaxed.
  - *"does not re-read counts while the draft is being edited"* asserts that `options` — the object the panel renders counts from — keeps the same identity across a toggle. A new object identity on every toggle means something upstream re-fetched, which is the exact R5 violation.
  - *"keeps the draft after an apply that changed nothing"* guards the no-op path: applying an unchanged draft must not close the panel or clear the user's place.

  For *"does not remount the panel when filters change"*, render with a changed `filters` prop and assert the search box text and open state survive.

- [ ] **Step 3.2: Run it and confirm red.**

  ```bash
  cd frontend && npx vitest run src/components/FilterPanel.test.tsx
  ```

- [ ] **Step 3.3: Implement.**

  ```tsx
  'use client';
  import { useEffect, useMemo, useState } from 'react';
  import ClubMultiSelect from './ClubMultiSelect';
  import { toClubOptions, toggleId } from '@/lib/clubFilters';

  export default function FilterPanel({ open, onToggleOpen, filters, options, optionsLoading, optionsError, onApply }: Props) {
    const [draft, setDraft] = useState<GameFilterParams>(filters);

    // Re-sync the draft when the APPLIED set changes underneath us (deep link,
    // Clear all, Back button) — but not when the user is mid-edit.
    useEffect(() => { setDraft(filters); }, [filters]);

    const clubNames = useMemo(() => new Map(clubOptions.map(c => [c.id, c.name])), [clubOptions]);
    const teamOptions   = toClubOptions(options?.teams ?? [],     clubNames);
    const opponentOptions = toClubOptions(options?.opponents ?? [], clubNames);
    ...
  }
  ```

  The `useEffect` on `[filters]` is the subtle part and needs a comment. It re-syncs the draft when the *applied* set changes from outside — a deep link, the Back button, Clear all — but it cannot fire while the user is editing, because editing only touches `draft` and `filters` is a prop that does not change until Apply. That asymmetry is the mechanism, and it is worth one sentence in the code so the next person does not "fix" the dependency array into a loop.

  The `clubNames` map is built from a merged universe: `new Map([...teamOptions, ...opponentOptions].map(c => [c.id, c.name]))`. Both arrays carry the same universe with different counts, so one of them is sufficient as a name source; building it from the union costs nothing and is robust to a future backend that returns a narrower list in one of them.

  The panel's actions:
  - **Apply** → `onApply(draft)`, then `onToggleOpen()` to close. Disabled when `filtersEqual(draft, filters)` — the same helper v1.1.2 built.
  - **Clear all** → `onApply(EMPTY_FILTERS)`. One button, not one per dimension, in this patch. Per-dimension clear chips are a v1.1.4 refinement, not a v1.1.3 requirement.
  - **Active count** on the toggle button → `hasActiveFilters(filters) ? countOfActiveDimensions(filters) : 0`. Count *dimensions*, not selected values, so "Team ×3" does not read as a filter count of 9. Write that reasoning in a comment; the alternative looks equally plausible.

- [ ] **Step 3.4: Verify green.**

  ```bash
  cd frontend && npx vitest run src/components/FilterPanel.test.tsx
  ```

- [ ] **Step 3.5: Commit.**

  ```bash
  git add frontend/src/components/FilterPanel.tsx frontend/src/components/FilterPanel.test.tsx
  git commit -m "feat: add the filter panel with a draft-then-apply selection model"
  ```

---

### Task 4: Mount the panel on the page

**Files:**
- Modify: `frontend/app/missing-eleven/page.tsx`
- Modify: `frontend/app/missing-eleven/page.test.tsx`

**Interfaces:**
- Consumes: `FilterPanel` (Task 3), `filters` / `setFilters` / `useFilterOptions` (v1.1.2 Task 2).
- Produces: the panel, mounted once, closed by default, above the game board.

**Steps:**

- [ ] **Step 4.1: Write the failing page test.**

  Add to the existing `frontend/app/missing-eleven/page.test.tsx`:

  ```tsx
  it('renders the filter panel toggle', ...);
  it('starts closed', ...);
  it('opens and shows the Team and Opponent lists', ...);
  it('applies a Team selection and refetches the match under the new filters', ...);
  it('shows the new URL after applying', ...);
  it('preserves the applied selection when the panel is reopened', ...);
  it('clears all filters and reloads the unfiltered match', ...);
  it('does not fetch a new match when the user only edits the draft', ...);
  it('keeps the panel mounted across a filter change', ...);
  ```

  The eighth test is the integration-level restatement of the R5 contract: editing a draft must not trigger a match fetch. Together with the Task 3 unit test, this pins the behaviour at both levels.

- [ ] **Step 4.2: Run and confirm red.**

  ```bash
  cd frontend && npx vitest run app/missing-eleven/page.test.tsx
  ```

- [ ] **Step 4.3: Mount the panel.**

  In `frontend/app/missing-eleven/page.tsx`:
  - add `const [filtersOpen, setFiltersOpen] = useState(false);`
  - the v1.1.2 Task 2 hook call already exposes `options`, `optionsLoading`, and `optionsError`; pass them straight through;
  - render `<FilterPanel open={filtersOpen} onToggleOpen={...} filters={filters} options={filterOptions} optionsLoading={optionsLoading} optionsError={optionsError} onApply={setFilters} />` above the game board;
  - `onApply` is `setFilters` directly, so the existing v1.1.2 chain (reducer → URL write → match refetch → options refetch) runs unchanged. **No new plumbing.**

  Do not wrap the page in a new provider or context. `useGameState` and `useFilterOptions` are already plain hooks in the page, and introducing context now would be a refactor this patch does not need.

  Placement decision: render the panel **above** `MatchInfo`, not inside it. `MatchInfo` is a presentational component with a fixed prop list; putting a control inside it forces either a prop or a context, both of which are worse than one line in the page.

- [ ] **Step 4.4: Verify green, then run everything.**

  ```bash
  cd frontend && npx vitest run app/missing-eleven/ src/components/ src/lib/
  cd frontend && npm run test
  ```

- [ ] **Step 4.5: Commit.**

  ```bash
  git add frontend/app/missing-eleven/page.tsx frontend/app/missing-eleven/page.test.tsx
  git commit -m "feat: mount the team and opponent filter panel"
  ```

---

### Task 5: Validate the patch end to end

**Files:**
- Create: `docs/v1/v1.1/CHANGELOG-v1.1.3.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a changelog recording the commands run, their results, and the build output.

**Steps:**

- [ ] **Step 5.1: Run the full frontend suite with coverage.**

  ```bash
  cd frontend && npm run test:coverage
  ```

- [ ] **Step 5.2: Run a production build.**

  ```bash
  cd frontend && npm run build
  ```

  Required, not optional. The page tree changed, and the `missing-suspense-with-csr-bailout` failure from v1.1.2 is only ever visible here.

- [ ] **Step 5.3: Live-smoke the counts against the server.**

  With the app running:

  ```bash
  # capture the raw option list and pick a real club id
  curl -s 'http://localhost:3000/api/matches/filter-options'
  ```

  Then in the browser:
  1. open the panel, note the count on a few clubs;
  2. **tick a checkbox and confirm the counts do not change** — this is the R5 check, and it is the one that fails if the Apply-only model was bypassed;
  3. press Apply, confirm the address bar gains `?teamIds=…`, the counts update, and a new match loads;
  4. confirm the selected team still shows a non-zero count in the list — a selected option reading `0` means the facet exclusion is inverted;
  5. go Back, confirm the filter is gone and the unfiltered list is back;
  6. filter to a combination with no games, confirm the page does **not** say "Something went wrong" (v1.1.4 adds the real empty state) and does not throw in the console;
  7. confirm a diacritic search works: type `sao` and confirm `São Paulo` appears.

- [ ] **Step 5.4: Confirm the two lists are genuinely independent.**

  Select Porto as a Team and Porto as an Opponent in the same draft. Both must remain checked. If one unchecks the other, OR-within-dimension is broken in the UI.

- [ ] **Step 5.5: Write the changelog and commit.**

  ```bash
  git add docs/v1/v1.1/CHANGELOG-v1.1.3.md
  git commit -m "docs: add v1.1.3 changelog and validation evidence"
  ```

## Acceptance criteria

1. This patch renders **Team and Opponent only**. Competition, Season, and the empty state belong to v1.1.4; their absence here is correct, not incomplete.
2. `ClubMultiSelect` is the **single** control used for both dimensions. Team and Opponent differ only in label, the option field they read, and the callback they call — a second, near-identical multiselect is a defect.
3. Counts are never recomputed on toggle. Toggling an option reads the numbers v1.1.1 already returned; `grep -rn "count" frontend/src/components/ClubMultiSelect.tsx` finds rendering only, no arithmetic.
4. Counts are **numbers from the server**, never derived client-side. A client-side `options.length` or filtered-count fallback is a defect.
5. The option universe is unfiltered and always complete: every club in the response is listed, regardless of the current selection, so a selected value does not vanish from its own list.
6. A zero-count option is **visible, enabled, and selectable**. Hiding or disabling it would make a filter that returns nothing unreachable to fix.
7. The Opponent list is the same clubs as the Team list, read from the `opponents` key.
8. A club may be simultaneously a selected Team and a selected Opponent. The two dimensions are independent; coupling them is a defect.
9. Both controls use the draft-then-apply contract from v1.1.1: edits land in a local draft and the URL/state change only on Apply.
10. The panel **does not remount** on filter change — the user's in-progress search text and scroll position survive a fetch. `key` is not derived from the filter state.
11. New components live in `frontend/src/components/`, not `frontend/components/`, so Vitest's flat `@` alias resolves them identically to the App Router.
12. Accessibility is a requirement, not a finish: the trigger is a real `button` with `aria-expanded` and `aria-controls`; each option is a labelled `input[type=checkbox]` reachable by keyboard; the grouped list is announced; focus is visible.
13. The panel is closed by default, and its open/closed state is not persisted to storage or the URL.
14. No new dependencies, and no backend, schema, or API change in this patch.
15. `npm run test`, `npm run build`, `npx tsc --noEmit`, and `npm run lint` are all clean, and every new suite is collected. No suite is asserted against a fixed count — it is measured and recorded, per `docs/v1/v1.2/overview.md:209`.

## Validation

| Check | Command | Pass signal |
|---|---|---|
| Frontend suite | `cd frontend && npm run test` | every file green; count measured and recorded, not asserted |
| The new components | `cd frontend && npx vitest run src/components/ClubMultiSelect.test.tsx src/components/FilterPanel.test.tsx src/lib/clubFilters.test.ts` | every case green |
| The page mount | `cd frontend && npx vitest run app/missing-eleven/page.test.tsx` | the panel renders and Apply reaches the URL |
| Production build | `cd frontend && npm run build` | no output |
| Types | `cd frontend && npx tsc --noEmit` | no output |
| Lint | `cd frontend && npm run lint` | no output |
| Counts are rendered, not computed | `grep -n "length\|filter(" frontend/src/components/ClubMultiSelect.tsx` | no client-side count arithmetic |
| One control, not two | `grep -rln "checkbox" frontend/src/components` | only `ClubMultiSelect.tsx` (plus the panel composing it) |
| Components resolve under the `@` alias | `grep -rn "from '@/components/TeamTabBar'" frontend/src/components` | resolves — the same import form the App Router uses |
| No backend drift | `git diff --stat -- backend/` | empty — this patch is frontend-only |
| The include was not re-narrowed (R7) | `grep -n "include:" frontend/vitest.config.ts` | unchanged from v1.1.1 |

## Risks

| Risk | Mitigation |
|---|---|
| **Counts recomputed on toggle**, so selecting a filter silently changes every other count and the list reshuffles under the cursor. | Counts are read from the single grouped query and never recomputed (criteria 3–4). The unfiltered, complete option universe (criterion 5) is what makes a recompute unnecessary; the panel test asserts the rendered counts are the server's. |
| **The panel remounts on filter change**, discarding the user's search text mid-typing. | `key` is not derived from filter state (criterion 10), and the panel test asserts draft state survives an Apply → refetch cycle. |
| **A zero-count option is hidden or disabled**, stranding the user on a filter that returns nothing with no way to widen it. | Zero-count options stay visible, enabled, and selectable (criterion 6), asserted by name in `ClubMultiSelect.test.tsx`. |
| **A second multiselect is added for Opponent**, and the two drift. | One control, two configurations (criterion 2), with the grep gate listing every file rendering a checkbox list. |
| **New components land in `frontend/components/`**, where Vitest cannot see them — a suite that reports green while asserting nothing. | The architecture note fixes the location, and `grep -rn "from '@/components/TeamTabBar'"` demonstrates the import form that resolves in both runners. |
| **The two dimensions become coupled**, so selecting a team filters the team list to that team and the user cannot select a second one. | Independence is asserted in both directions (criterion 8); a club may hold both roles simultaneously. |
| **Accessibility is treated as a finish**, leaving a keyboard user unable to reach an option. | Criterion 12 is a list of checkable properties, each asserted in `ClubMultiSelect.test.tsx`; the panel trigger's `aria-expanded`/`aria-controls` pair is named rather than implied. |

**Escalate before proceeding if:** the counts v1.1.1 returns cannot support an unfiltered, complete option universe for one of the dimensions — for example if a facet legitimately returns a truncated list. That would contradict R5 and the grouped-query decision, and the fix belongs upstream in v1.1.1 rather than in a client-side recomputation here.
