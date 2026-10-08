# Team & Opponent Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first visible filtering lands — two multi-select controls, Team and Opponent, rendered as searchable, grouped, counted checkbox lists inside a collapsible filter panel. Counts are read from the single grouped query built in v1.1.1 and are **never recomputed while the user edits**; the panel keeps a draft selection and commits it on Apply, which is what makes "a count describes the applied filter set, not the one being typed" structurally true rather than a thing to remember. An append to this same patch adds the **entry-gate pre-screen**: on an empty URL the page renders the filter panel and a placeholder instead of auto-loading a match, and the game begins only when the user starts it — deep links keep their one-click contract, and everything after the first start behaves as originally specified.

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
- **The panel is closed by default in-game, and its state is not persisted.** A user landing on a deep-linked filtered URL sees a panel showing the active filter count, not an open panel they did not open. The pre-screen is the sole exception: while the game has not started the panel renders forced open — the Start action lives inside it, and hiding the toggle makes it unreachable.
- **The game does not auto-start on an empty URL.** `started` is a page-level boolean initialized once from `location.search`: non-empty → started (a deep link; today's flow runs untouched), empty → the pre-screen, where no match fetch, no skeleton, and no board render. Reload recomputes `started` from the URL — the URL stays the single source of truth and no session or storage flag exists.
- **On the pre-screen, Apply becomes Start.** The panel's primary button reads "Start game" while `started === false` and "Apply" once running, both through the same handler: commit the draft exactly as Task 3 defines, then start. There is no second Start button and no alternative path into the game.
- **Start writes the URL before the board can mount (D4-class ordering).** `router.replace(filtersToParams(draft))` runs before `started` flips; the loading branch keeps the board — and with it `FilterUrlSync` — unmounted until the fetch resolves, so `FilterUrlSync`'s mount-time read sees a URL that already matches state and is idempotent. An empty-draft Start replaces with `''`, whose mount-read yields the `null` state already holds. Reversing this order wipes the started filters — the same failure class as the v1.1.3 D4 revision.
- **Exactly one fetch per start, zero before it.** The match-fetch effect keys on `[started, filterKey]` with a skip-unless-started guard and `fetchedKeyRef` as the dedupe: the pre-screen never fetches, Start fetches once even when both deps change in the same commit, a deep-linked mount fetches once as today, and a mid-game Apply fetches once as today.
- **Entry gate only: everything after the first start is unchanged.** Mid-game Apply still writes the URL and swaps the match live; Play again, Retry, surrender, and the completion overlay are untouched. The pre-screen gates entry, not re-filtering.
- **A zero-count Start is not the empty state.** Starting with a filter combination that matches nothing renders today's neutral "no playable matches" message, not v1.1.4's explanatory empty state and never an error — that consumer belongs to v1.1.4.
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

---

### Task 6: Add the entry-gate pre-screen

**Files:**
- Modify: `frontend/src/components/FilterPanel.tsx`
- Modify: `frontend/src/components/FilterPanel.test.tsx`
- Modify: `frontend/app/missing-eleven/page.tsx`
- Modify: `frontend/app/missing-eleven/page.test.tsx`

**Interfaces:**
- Consumes: `FilterPanel` (Task 3), `filtersToParams` (`frontend/src/lib/filterParams.ts`), `useGameState`'s `filters` / `setFilters` (v1.1.2 Task 1), `FilterUrlSync`'s mount-read contract (v1.1.2 — untouched).
- Produces:
  ```tsx
  // FilterPanel gains exactly one optional prop. Existing callers keep
  // today's behaviour by not passing it.
  onStart?: (next: GameFilterParams) => void;
  // present → start mode: primary button reads "Start game", is never
  //           disabled, the panel toggle is hidden, and pressing it calls
  //           onStart(draft) and nothing else (the panel stays open).
  // absent  → Apply mode, byte-for-byte today's behaviour.
  // Page:
  const [started, setStarted] = useState(false);        // flipped from location.search on mount
  function handleStart(next: GameFilterParams): void;   // URL write → gate flip → setFilters
  ```

**Steps:**

- [ ] **Step 6.1: Extend the `FilterPanel` test harness and write the failing start-mode tests.**

  In `frontend/src/components/FilterPanel.test.tsx`:

  1. Add `onStart` to the config interface:

  ```tsx
  interface PanelConfig {
    filters?: GameFilterParams;
    open?: boolean;
    options?: FilterOptionsResponse | null;
    optionsLoading?: boolean;
    optionsError?: string | null;
    onApply?: (next: GameFilterParams) => void;
    onToggleOpen?: () => void;
    onStart?: (next: GameFilterParams) => void;
  }
  ```

  2. Thread it through `renderPanel`. Absence must survive the harness — passing `onStart` to an Apply-mode panel would silently flip it into start mode and make every existing test assert the wrong mode. The only changes to the function are the two starred lines; everything else (including `rerenderPanel`, which spreads `{...base}`) is unchanged, because `{...base}` now carries `onStart` whenever it was configured:

  ```tsx
  function renderPanel(config: PanelConfig = {}) {
    const onApply = config.onApply ?? vi.fn();
    const onToggleOpen = config.onToggleOpen ?? vi.fn();
    const onStart = config.onStart;                      // ← new: undefined unless configured
    const base = {
      open: config.open ?? false,
      onToggleOpen,
      filters: config.filters ?? (EMPTY_FILTERS as GameFilterParams),
      options: config.options === undefined ? options : config.options,
      optionsLoading: config.optionsLoading ?? false,
      optionsError: config.optionsError ?? null,
      onApply,
      ...(onStart ? { onStart } : {}),                   // ← new: absence must survive
    };
    const view = render(<FilterPanel {...base} />);
    return {
      ...view,
      onApply,
      onToggleOpen,
      onStart,                                           // ← new
      rerenderPanel: (next: PanelConfig = {}) =>
        view.rerender(
          <FilterPanel
            {...base}
            {...(next.filters !== undefined ? { filters: next.filters } : {})}
            {...(next.open !== undefined ? { open: next.open } : {})}
            {...(next.options !== undefined ? { options: next.options } : {})}
            {...(next.optionsLoading !== undefined ? { optionsLoading: next.optionsLoading } : {})}
            {...(next.optionsError !== undefined ? { optionsError: next.optionsError } : {})}
          />,
        ),
    };
  }
  ```

  3. Append this describe block at the end of the file, after the existing `describe('FilterPanel', ...)`:

  ```tsx
  describe('FilterPanel start mode', () => {
    it('reads "Start game" instead of "Apply"', () => {
      renderPanel({ open: true, onStart: vi.fn() });
      expect(screen.getByRole('button', { name: 'Start game' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
    });

    it('never disables Start game, even when the draft equals the applied filters', () => {
      renderPanel({ open: true, filters: filtersOf({ teamIds: [294] }), onStart: vi.fn() });
      // Apply is armed by a change; Start is always armed — starting with
      // nothing selected (or with the deep-link set as-is) is legal.
      expect(screen.getByRole('button', { name: 'Start game' })).not.toBeDisabled();
    });

    it('calls onStart with the draft and nothing else when Start game is pressed', async () => {
      const user = userEvent.setup();
      const panel = renderPanel({ open: true, onStart: vi.fn() });
      await user.click(screen.getByRole('checkbox', { name: 'SL Benfica (42)' }));
      expect(panel.onStart).not.toHaveBeenCalled();           // toggling starts nothing
      await user.click(screen.getByRole('button', { name: 'Start game' }));
      expect(panel.onStart).toHaveBeenCalledTimes(1);
      expect(panel.onStart).toHaveBeenCalledWith(filtersOf({ teamIds: [294] }));
      expect(panel.onApply).not.toHaveBeenCalled();           // start is not an apply
      expect(panel.onToggleOpen).not.toHaveBeenCalled();      // the page decides when it closes
    });

    it('hides the panel toggle in start mode so Start cannot become unreachable', () => {
      renderPanel({ open: true, onStart: vi.fn() });
      expect(screen.queryByRole('button', { name: /^Filters/ })).toBeNull();
      expect(screen.getByRole('region', { name: 'Filters' })).toBeVisible();
    });

    it('still routes Clear all through onApply in start mode', async () => {
      const user = userEvent.setup();
      const panel = renderPanel({ open: true, filters: filtersOf({ teamIds: [294] }), onStart: vi.fn() });
      await user.click(screen.getByRole('button', { name: 'Clear all' }));
      expect(panel.onApply).toHaveBeenCalledWith(EMPTY_FILTERS);
      expect(panel.onStart).not.toHaveBeenCalled();
    });
  });
  ```

- [ ] **Step 6.2: Run it and confirm red.**

  ```bash
  cd frontend && npx vitest run src/components/FilterPanel.test.tsx
  ```

  Expected: the five new `start mode` cases fail (no button named `Start game`, toggle still rendered), the 18 existing cases still green.

- [ ] **Step 6.3: Implement start mode in `FilterPanel`.**

  Three changes, nothing else — the draft logic, the re-sync effect, and Clear all are untouched:

  1. Add the prop to the interface, above `onApply`:

  ```tsx
    /** Called only by Apply and Clear all — never by a checkbox toggle. */
    onApply: (next: GameFilterParams) => void;
    /**
   * Present on the pre-screen only: commits the draft AND starts the game.
   * When set, the primary button reads "Start game", is never disabled, the
   * panel toggle is hidden (so the panel cannot close before Start is
   * reachable), and the panel stays open — the page decides when it closes.
   */
  onStart?: (next: GameFilterParams) => void;
  ```

  2. Destructure it and derive the mode; rewrite the `apply` function:

  ```tsx
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
    ...
    const apply = () => {
      if (onStart) {
        onStart(draft);   // commit + start in one call; the gate is the page's
        return;
      }
      onApply(draft);
      onToggleOpen();
    };
  ```

  3. Wrap the toggle `<button>` in `{!startMode && ( ... )}` (the region below keeps its `hidden={!open}` exactly as it is — the page forces `open` on the pre-screen), and replace the primary button's label and disabled check:

  ```tsx
          <button
            type="button"
            onClick={apply}
            disabled={!startMode && !draftChanged}
            className="flex-1 rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-chalk transition-colors hover:bg-flare focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare disabled:cursor-not-allowed disabled:opacity-40"
          >
            {startMode ? 'Start game' : 'Apply'}
          </button>
  ```

  Also update the component's doc comment (lines 24–30) with one sentence: `When onStart is present (the pre-screen) the panel runs in start mode: "Start game" replaces Apply, the toggle is hidden, and the panel never closes itself.`

- [ ] **Step 6.4: Verify green.**

  ```bash
  cd frontend && npx vitest run src/components/FilterPanel.test.tsx
  ```

  Expected: all cases green (18 existing + 5 new).

- [ ] **Step 6.5: Re-anchor the page test harness and write the failing pre-screen tests.**

  In `frontend/app/missing-eleven/page.test.tsx`:

  1. `setUrl` must mirror the real location, because the gate reads `window.location.search` exactly once on mount — in the real app the mocked params and the location are the same thing:

  ```tsx
  function setUrl(query: string) {
    mockUseSearchParams.mockReturnValue(new URLSearchParams(query) as never);
    // The gate reads window.location.search on mount, so the test location
    // must mirror the mocked params — in the real app the two are one thing.
    window.history.replaceState(null, '', query ? `/missing-eleven?${query}` : '/missing-eleven');
  }
  ```

  2. Add a `mirrorReplace` helper directly below `setUrl`. `router.replace` is mocked, so it does not move the location by itself; the Start test needs the real ordering (URL write → fetch) to be observable:

  ```tsx
  // Keep window.location (and the useSearchParams mock) in step with what
  // router.replace writes, exactly as the real router does — the Start test
  // asserts the D4-class ordering this produces.
  function mirrorReplace() {
    mockReplace.mockImplementation((href: string) => {
      const url = new URL(href, 'http://localhost');
      setUrl(url.search.replace(/^\?/, ''));
    });
  }
  ```

  3. Hoist the `clubOptions` fixture: cut the whole `const clubOptions: FilterOptionsResponse = { ... };` block from inside `describe('missing-eleven page filter panel', ...)` and paste it at file scope beside `emptyOptions` (values unchanged), so the pre-screen describe can share it.

  4. Append this describe at the end of the file:

  ```tsx
  describe('missing-eleven pre-screen gate', () => {
    beforeEach(() => {
      mockFetchFilterOptions.mockResolvedValue(clubOptions);
    });

    it('renders the pre-screen on an empty URL and fetches no match', async () => {
      render(<MissingElevenPage />);

      expect(screen.getByRole('heading', { level: 1, name: 'Missing Eleven' })).toBeTruthy();
      expect(screen.getByRole('heading', { level: 2, name: 'Choose your match' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Start game' })).not.toBeDisabled();
      expect(screen.queryByRole('button', { name: 'New puzzle' })).toBeNull();
      expect(screen.queryByText('Loading puzzle…')).toBeNull();

      // Options still load on the pre-screen (Start with a pick needs them)…
      await waitFor(() => expect(mockFetchFilterOptions).toHaveBeenCalled());
      // …but the match itself must not be requested before Start.
      expect(mockFetchRandomMatch).not.toHaveBeenCalled();
    });

    it('forces the panel open with its toggle hidden until the game starts', async () => {
      render(<MissingElevenPage />);

      expect(screen.queryByRole('button', { name: /^Filters/ })).toBeNull();
      const region = screen.getByRole('region', { name: 'Filters' });
      expect(region).toBeVisible();
      await waitFor(() =>
        expect(within(region).getByRole('checkbox', { name: /FC Porto \(7\)/ })).toBeTruthy(),
      );
    });

    it('starts the game: URL first, exactly one fetch, pre-screen gone', async () => {
      mirrorReplace();
      const user = userEvent.setup();
      render(<MissingElevenPage />);
      await waitFor(() => expect(screen.getByRole('checkbox', { name: /FC Porto \(7\)/ })).toBeTruthy());
      await user.click(screen.getByRole('checkbox', { name: /FC Porto \(7\)/ }));
      await user.click(screen.getByRole('button', { name: 'Start game' }));

      await waitFor(() => expect(mockFetchRandomMatch).toHaveBeenCalledTimes(1));
      expect(mockFetchRandomMatch).toHaveBeenCalledWith(
        expect.objectContaining({ teamIds: [31] }),
      );
      // D4-class ordering: the URL write lands before the board's fetch.
      expect(mockReplace.mock.invocationCallOrder[0]).toBeLessThan(
        mockFetchRandomMatch.mock.invocationCallOrder[0],
      );
      expect(String(mockReplace.mock.calls[0][0])).toContain('teamIds=31');

      await screen.findByRole('button', { name: 'New puzzle' });
      // Exactly one — the board-remount FilterUrlSync read was idempotent.
      expect(mockFetchRandomMatch).toHaveBeenCalledTimes(1);
      expect(mockReplace.mock.calls).toHaveLength(1);
      expect(screen.queryByRole('button', { name: 'Start game' })).toBeNull();
      expect(screen.queryByRole('region', { name: 'Filters' })).toBeNull(); // panel closed in-game
    });

    it('starts with an empty draft: URL stays empty and one fetch still fires', async () => {
      mirrorReplace();
      const user = userEvent.setup();
      render(<MissingElevenPage />);

      await user.click(screen.getByRole('button', { name: 'Start game' }));

      await waitFor(() => expect(mockFetchRandomMatch).toHaveBeenCalledTimes(1));
      expect(mockReplace).toHaveBeenCalledWith('/missing-eleven', { scroll: false });
      await screen.findByRole('button', { name: 'New puzzle' });
      expect(mockFetchRandomMatch).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('button', { name: 'Start game' })).toBeNull();
    });

    it('draft edits on the pre-screen start nothing', async () => {
      const user = userEvent.setup();
      render(<MissingElevenPage />);
      await waitFor(() => expect(screen.getByRole('checkbox', { name: /FC Porto \(7\)/ })).toBeTruthy());
      await user.click(screen.getByRole('checkbox', { name: /FC Porto \(7\)/ }));

      expect(screen.getByRole('button', { name: 'Start game' })).not.toBeDisabled();
      expect(mockFetchRandomMatch).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('Clear all on the pre-screen clears the draft without starting', async () => {
      const user = userEvent.setup();
      render(<MissingElevenPage />);
      await waitFor(() => expect(screen.getByRole('checkbox', { name: /FC Porto \(7\)/ })).toBeTruthy());
      await user.click(screen.getByRole('checkbox', { name: /FC Porto \(7\)/ }));
      await user.click(screen.getByRole('button', { name: 'Clear all' }));

      await waitFor(() => expect(screen.getByRole('checkbox', { name: /FC Porto \(7\)/ })).not.toBeChecked());
      expect(screen.getByRole('button', { name: 'Start game' })).toBeTruthy();
      expect(mockFetchRandomMatch).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('auto-starts a deep-linked URL with no pre-screen', async () => {
      setUrl('teamIds=7');
      render(<MissingElevenPage />);

      await waitFor(() =>
        expect(mockFetchRandomMatch).toHaveBeenLastCalledWith(
          expect.objectContaining({ teamIds: [7] }),
        ),
      );
      expect(screen.queryByRole('button', { name: 'Start game' })).toBeNull();
      await screen.findByRole('button', { name: 'New puzzle' });
    });
  });
  ```

- [ ] **Step 6.6: Run it and confirm red.**

  ```bash
  cd frontend && npx vitest run app/missing-eleven/page.test.tsx
  ```

  Expected: the seven `pre-screen gate` cases fail (no `Start game` button exists yet); the 19 existing cases still pass — the gate has not been implemented, so the old auto-start behaviour is still in force.

- [ ] **Step 6.7: Implement the gate in `frontend/app/missing-eleven/page.tsx`.**

  Four additions plus one branch, all before the error branch:

  1. Import the router hooks alongside the React imports:

  ```tsx
  import { usePathname, useRouter } from 'next/navigation';
  ```

  2. Declare the gate right after the `filtersOpen` state (line ~48):

  ```tsx
  // Entry gate: the URL is the single source of truth. An empty URL is the
  // pre-screen; any params mean the game has begun (a deep link). Initialized
  // false so the server's HTML and the first client render agree — the
  // pre-screen — then flipped once from the real location after hydration.
  // Never read window at render time (hydration mismatch) and never call
  // useSearchParams at page level (Next 16's missing-suspense-with-csr-bailout
  // is a build failure; FilterUrlSync under Suspense is the only reader).
  // Reload recomputes this from the URL: no session or storage flag exists.
  const [started, setStarted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot gate init after hydration; same pattern as FilterPanel's re-sync
    setStarted(new URLSearchParams(window.location.search).size > 0);
  }, []);
  ```

  3. The start handler, directly below it (`router` / `pathname` from the imports in 1):

  ```tsx
  const router = useRouter();
  const pathname = usePathname();

  // Start (pre-screen only): write the URL FIRST so the board's FilterUrlSync
  // mount-read sees the finished URL — D4-class ordering; reversing this wipes
  // the started filters the same way v1.1.3's D4 did. Both state updates
  // batch into one commit, so the fetch effect below runs once for this start.
  const handleStart = useCallback((next: GameFilterParams) => {
    const query = filtersToParams(next).toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    setStarted(true);
    setFilters(next);
  }, [router, pathname, setFilters]);
  ```

  4. Gate the existing fetch effect (lines 135–139):

  ```tsx
  useEffect(() => {
    if (!started) return; // pre-screen: zero match requests until Start
    if (fetchedKeyRef.current === filterKey) return;
    fetchedKeyRef.current = filterKey;
    loadMatch();
  }, [started, filterKey, loadMatch]);
  ```

  The comment above the effect (lines 131–134) gains one sentence: `Before the first start the guard returns early — the pre-screen fetches nothing; Start changes both deps in one commit, and the ref keeps that single.`

  5. Wire the shell (lines 232–245) — `open` is forced while unstarted, and `onStart` is only present before the first start:

  ```tsx
      <FilterPanel
        open={!started || filtersOpen}
        onToggleOpen={handleToggleFiltersOpen}
        filters={filters}
        options={filterOptions}
        optionsLoading={optionsLoading}
        optionsError={optionsError}
        onApply={setFilters}
        onStart={started ? undefined : handleStart}
      />
  ```

  6. Insert the pre-screen branch **before** the error branch (`if (state.error)`, line 248). While unstarted there is no match, no error, and no board, so nothing else may render:

  ```tsx
  // Entry gate: before the first start there is no match, no error, and no
  // board — only the panel (forced open, Start inside) and the placeholder.
  // The board branch owns its own "Missing Eleven" h1; only one renders.
  if (!started) {
    return shell(
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-24 text-center md:px-6">
        <header className="w-full pb-8">
          <h1 className="font-display text-[clamp(40px,4.6vw,50px)] uppercase leading-[0.92] tracking-[-0.02em] text-ink">
            Missing Eleven
          </h1>
        </header>
        {/* An empty slot on the tactics board: dashed like a chalk outline,
            the arrow pointing up at the filters that fill it. */}
        <div className="w-full max-w-md rounded-xl border-2 border-dashed border-ink/25 px-6 py-10">
          <p aria-hidden="true" className="text-2xl leading-none text-ink/40">↑</p>
          <h2 className="mt-3 font-display text-2xl uppercase tracking-[0.08em] text-ink">
            Choose your match
          </h2>
          <p className="mt-3 text-sm text-ink/65">
            Pick a team or an opponent in the filters above — or start with any match.
          </p>
          <p className="mt-4 text-xs uppercase tracking-[0.15em] text-ink/45">
            Press Start game when you&rsquo;re ready
          </p>
        </div>
      </div>,
    );
  }
  ```

  `&rsquo;` rather than a raw apostrophe: `eslint-config-next` enables `react/no-unescaped-entities`, which flags `'` in JSX text. The placeholder uses only tokens the page already uses (`font-display`, `ink`, `paper` scale); no new class, font, or dependency.

- [ ] **Step 6.8: Re-anchor the existing page tests the gate invalidated.**

  Inventory — every test below assumed "empty URL auto-starts". Their contracts are unchanged; only their fixture moves to a deep link (`criterion 19`), or their assertion inverts to the new gate:

  1. `it('does not fetch again when an equal filter set is re-dispatched')` — start from a deep link and re-dispatch an equal deep link; the contract (equal filter set → no refetch) is identical:

  ```tsx
  it('does not fetch again when an equal filter set is re-dispatched', async () => {
    setUrl('teamIds=7');
    const { rerender } = render(<MissingElevenPage />);
    await waitFor(() =>
      expect(mockFetchRandomMatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ teamIds: [7] }),
      ),
    );
    const callsAfterMount = mockFetchRandomMatch.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    // 'daily=1' is not a filter key: 'teamIds=7&daily=1' parses to the same
    // filter set — the reducer no-op keeps the canonical key, and therefore
    // the fetch, unchanged.
    setUrl('teamIds=7&daily=1');
    rerender(<MissingElevenPage />);

    expect(mockFetchRandomMatch.mock.calls.length).toBe(callsAfterMount);
  });
  ```

  The `waitFor` on the `teamIds=[7]` call (rather than on `New puzzle`) is what makes the count deterministic: it waits until the deep link's FilterUrlSync dispatch has already triggered its fetch, so nothing can increase the count after it is captured.

  2. `it('renders a neutral empty message when fetchRandomMatch resolves null')` — add `setUrl('teamIds=7');` as the first line (without it the gate never opens and the fetch never runs).

  3. `it('renders an error when fetchRandomMatch throws')` — add `setUrl('teamIds=7');` as the first line, same reason.

  4. The whole `describe('missing-eleven page filter panel')` block exercises in-game behaviour (`criterion 19`), so anchor it once in its `beforeEach`:

  ```tsx
  beforeEach(() => {
    // These tests exercise in-game behaviour with an EMPTY applied set (their
    // original contract). 'daily=1' is not a filter key: it opens the gate
    // (non-empty location) while parsing to the empty filter set, so drafts
    // start empty and no FilterUrlSync re-dispatch refetches mid-test.
    setUrl('daily=1');
    mockFetchFilterOptions.mockResolvedValue(clubOptions);
  });
  ```

  `daily=1`, not a filter-carrying query: these tests assert draft-level facts (`teamIds[0] === 31` after ticking Porto, a single fetch across a draft edit) that only hold when the applied set starts empty — a `teamIds=7` base would make every draft `[7, 31]` and add a FilterUrlSync re-dispatch fetch mid-test. (`setUrl` order is safe: the file-level `beforeEach` runs first and resets to `''`, so this line wins. The two tests that call `setUrl` themselves — `clears all filters…` and the two that pass `teamIds=31` before Apply — still override it.)

  No other test changes: the remaining wiring tests already pass `setUrl('teamIds=7')` (or another query) and therefore auto-start exactly as before.

- [ ] **Step 6.9: Verify green, then run everything.**

  ```bash
  cd frontend && npx vitest run app/missing-eleven/
  cd frontend && npm run test
  ```

  Expected: the whole `app/missing-eleven/` directory green — `page.test.tsx` at 19 existing + 7 new cases, `FilterUrlSync` suite untouched and green — and the full suite green with its total count measured (record it for Task 7).

- [ ] **Step 6.10: Commit.**

  ```bash
  git add frontend/src/components/FilterPanel.tsx frontend/src/components/FilterPanel.test.tsx frontend/app/missing-eleven/page.tsx frontend/app/missing-eleven/page.test.tsx
  git commit -m "feat: add the entry-gate pre-screen to the missing-eleven page"
  ```

---

### Task 7: Re-validate the patch end to end

**Files:**
- Modify: `CHANGELOG.md` (root — the v1.1.3 section added by Task 5)

**Interfaces:**
- Consumes: everything from Task 6.
- Produces: the v1.1.3 changelog updated with the pre-screen's validation evidence.

**Steps:**

- [ ] **Step 7.1: Run the full frontend suite with coverage.**

  ```bash
  cd frontend && npm run test:coverage
  ```

  Record the measured file count, test count, and coverage percentages — they go into the changelog below. If the runner fails writing to `/tmp` (the machine has leaked coverage scratch files before), retry with `TMPDIR="$HOME/.cache/footplay-tmp"` prefixed to the command.

- [ ] **Step 7.2: Run a production build.**

  ```bash
  cd frontend && npm run build
  ```

  Required, not optional: the page tree changed again. Pass signal — clean output, `/missing-eleven` prerendered, no `missing-suspense-with-csr-bailout`. The gate deliberately reads `window.location` in an effect instead of calling `useSearchParams` at page level, and this command is what proves that choice.

- [ ] **Step 7.3: Types and lint.**

  ```bash
  cd frontend && npx tsc --noEmit
  cd frontend && npm run lint
  ```

  Both must produce no output beyond the pre-existing warning in `GameComplete.test.tsx`. If `npm run lint` reports the `react-hooks/set-state-in-effect` directive from Step 6.7 as *unused*, remove just that directive line (keep the comment) and re-run; if the rule fires instead, the directive is already in place.

- [ ] **Step 7.4: Run the grep gates.**

  ```bash
  grep -rn "localStorage\|sessionStorage" frontend/app/missing-eleven/   # no output — criterion 20: the URL is the only flag
  grep -n "useSearchParams" frontend/app/missing-eleven/page.tsx          # no output — FilterUrlSync under Suspense stays the only reader
  grep -n "length\|filter(" frontend/src/components/ClubMultiSelect.tsx  # rendering only, no count arithmetic
  grep -rln "checkbox" frontend/src/components                           # only ClubMultiSelect + FilterPanel composing it
  git diff --stat -- backend/                                            # empty — frontend-only patch
  grep -n "include:" frontend/vitest.config.ts                           # unchanged from v1.1.1
  ```

- [ ] **Step 7.5: Append the evidence to the root changelog and commit.**

  In `CHANGELOG.md`, inside the existing `## v1.1.3 — Team & Opponent filters` section: add the first bullet to `### Added`, and the two bullets below the existing ones in `### Validation`. Replace every `«…»` with the value printed by the matching command in Steps 7.1–7.4.

  Added:

  ```markdown
  - **Entry-gate pre-screen** — an empty URL no longer auto-loads a match: the
    page renders the filter panel (forced open, toggle hidden, primary button
    reading **Start game**) and a placeholder that points at it. `started` is
    a page-level flag recomputed from `location.search` on every load, so the
    URL stays the single source of truth and no session or storage flag
    exists. Start commits the draft, writes the URL *before* the board mounts
    (D4-class ordering — `FilterUrlSync`'s mount read stays idempotent), then
    opens the gate: exactly one match fetch, zero before it. Any URL with
    params auto-starts exactly as before, and once running, Apply, Play again,
    Retry, and surrender are untouched — the gate changes entry, not play.
  ```

  Validation:

  ```markdown
  - Pre-screen append: `npm run test` measured at «N» files / «M» tests, all
    green — page suite «P» (7 new gate cases; 3 existing cases re-anchored
    from the empty URL to a deep-link fixture so their original contract is
    still asserted) and `FilterPanel` «F» (5 start-mode cases). Coverage
    «S»% statements / «B»% branches / «L»% lines.
  - `npm run build` clean — no `missing-suspense-with-csr-bailout`, the gate
    reading `window.location` in an effect rather than `useSearchParams` at
    page level; `npx tsc --noEmit` and `npm run lint` clean (pre-existing
    `GameComplete.test.tsx` warning aside). Grep gates: no
    `localStorage`/`sessionStorage` under `missing-eleven/`, no page-level
    `useSearchParams`, no count arithmetic, `backend/` diff empty. The gate's
    jsdom contracts: an empty mount fetches nothing; Start writes the URL
    before the board's first fetch and fires exactly one request (empty draft
    included); a deep-linked fixture starts with no pre-screen; draft edits
    and Clear all start nothing. Browser click-through remains a manual
    oracle.
  ```

  ```bash
  git add CHANGELOG.md
  git commit -m "docs: append pre-screen validation evidence to the v1.1.3 changelog"
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
13. The panel is closed by default **once the game is running**, and its open/closed state is never persisted to storage or the URL. On the pre-screen it is forced open with its toggle hidden, so the Start action is always reachable.
14. No new dependencies, and no backend, schema, or API change in this patch.
15. `npm run test`, `npm run build`, `npx tsc --noEmit`, and `npm run lint` are all clean, and every new suite is collected. No suite is asserted against a fixed count — it is measured and recorded, per `docs/v1/v1.2/overview.md:209`.
16. First visit with an empty URL renders the pre-screen and performs **no** match fetch until Start is pressed — no skeleton, no board, no request.
17. Start commits the draft, writes the URL **before** the board mounts, flips `started`, and triggers exactly one match fetch — including the empty-draft case, where the URL stays empty and one fetch still fires.
18. A URL with params auto-starts exactly as today: v1.1.2's landing contract and the whole `FilterUrlSync` suite pass unchanged.
19. Once started, mid-game Apply, Play again, Retry, and surrender behave exactly as before this append — the gate changes entry, not play.
20. Reloading with an empty URL returns to the pre-screen. No session or storage flag survives; the URL is the only thing that decides.
21. On the pre-screen the panel is forced open with its toggle hidden, the primary button reads "Start game", and the board area shows the placeholder — one path into the game, no second Start.

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
| The gate, at page level | `cd frontend && npx vitest run app/missing-eleven/page.test.tsx` | empty mount fetches nothing; Start writes the URL, then fetches once; the deep-linked fixture starts with no pre-screen |
| `FilterUrlSync` contract intact | `cd frontend && npx vitest run app/missing-eleven/` | the whole directory green — the mount-order read is unchanged |

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
| **`FilterUrlSync` wipes the started filters** by reading the stale (empty) URL at mount — the D4 failure class recurring at a new call site. | Start writes the URL before `started` flips, so the mount-read is idempotent; a page test asserts the params reach the URL before the board appears and that the request carries them. |
| **Start double-fetches**, because `started` and `filterKey` change in the same commit. | One effect keyed on `[started, filterKey]`, with `fetchedKeyRef` dedupe and a skip-unless-started guard (criterion 17); the test asserts a single request. |
| **The pre-screen is a dead end** — the user closes the panel and Start disappears with it. | The toggle is hidden while `started === false` (criterion 21); the panel cannot close before the game starts. |
| **Existing auto-fetch tests are re-anchored silently**, leaving a behavior change with a green suite that no longer asserts the old contract anywhere. | Task 6 inventories every page test that assumes an empty-URL auto-fetch and re-anchors it to a deep-link fixture or inverts it to assert no-fetch; the full suite runs at Task 7. |

**Escalate before proceeding if:** the counts v1.1.1 returns cannot support an unfiltered, complete option universe for one of the dimensions — for example if a facet legitimately returns a truncated list. That would contradict R5 and the grouped-query decision, and the fix belongs upstream in v1.1.1 rather than in a client-side recomputation here. **Escalate likewise if:** the match-fetch effect cannot be keyed on `[started, filterKey]` without either dropping the deep link's initial fetch or double-fetching on Start — that would mean `FilterUrlSync`'s mount contract and the gate cannot coexist as designed, and the URL-write ordering rule above needs revisiting before code is written.
