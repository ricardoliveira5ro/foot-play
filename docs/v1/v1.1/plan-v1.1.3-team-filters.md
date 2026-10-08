# Team Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first visible filtering lands — a multi-select control for Team, rendered as a searchable, grouped, counted checkbox list inside a collapsible filter panel. Counts are read from the single grouped query built in v1.1.1 and are **never recomputed while the user edits**; the panel keeps a draft selection and commits it on Apply, which is what makes "a count describes the applied filter set, not the one being typed" structurally true rather than a thing to remember. An append to this same patch adds the **entry-gate pre-screen**: on an empty URL the page renders the filter panel and a placeholder instead of auto-loading a match, and the game begins only when the user starts it — deep links keep their one-click contract, and everything after the first start behaves as originally specified. A final append (Tasks 14–15) removes the **Opponent dimension** end to end — frontend, backend, and wire contract — after it proved confusing and redundant UX: the panel renders Team only, `GameFilterParams` carries four fields, `filter-options` returns four keys, no SQL mentions `opponentTeamId`, and legacy `?opponentIds=` bookmarks converge to the current contract instead of lingering.

**Architecture:** Two components under `frontend/src/components/`. `ClubMultiSelect` renders the panel's list — it was originally configured twice (Team and Opponent differing only in label, option field, and callback), and Task 14 leaves the single Team configuration standing, so no second, near-identical renderer can drift from it. `FilterPanel` owns the panel chrome, the draft-vs-applied split, and the Apply/Clear actions. The panel is a pure function of `options`, `filters`, and two callbacks; it fetches nothing and computes no counts.

**Tech Stack:** TypeScript, React 19, Tailwind (matching the existing `frontend/components/` idiom), Vitest + jsdom + Testing Library + `userEvent`, `useDeferredValue` for the search box.

---

## Global Constraints

- **This patch renders Team only.** The Opponent dimension is removed by Task 14. Competition, Season, and the empty state belong to v1.1.4. The panel must not contain a stub for either.
- **Counts must not be recomputed on toggle. Ever.** `useFilterOptions` is keyed on the *applied* filter set (v1.1.2 Task 2). The panel therefore holds its selection in local draft state and calls `setFilters` **only** from the Apply button. If any control calls `setFilters` directly, R5 is violated and the count under the user's cursor changes mid-edit. This is the single most important constraint in the patch; the tests in Task 2 exist to prove it.
- **The option universe is unfiltered and always complete.** v1.1.1 derives option lists from the unfiltered `club.findMany` / `competition.findMany`, so all ~500 clubs are present on every request, including those whose count is 0. A control that filters its option list by "has count > 0" would be **wrong**: it hides exactly the options the user needs in order to escape a too-narrow filter. Never filter the list by count.
- **A zero-count option is visible, enabled, and selectable.** It shows its count as `0`, which is honest information, not a bug to hide. R5 exists precisely so this case is reachable and explicable rather than silently absent.
- **The Opponent dimension is removed end to end (Task 14).** No `opponentIds` in `GameFilterParams`, no `opponents` key in `FilterOptionsResponse`, no `opponentWhere` or opponent CTE in the backend, no second section in the panel, no `opponents` in the mock. The removal is vertical, not cosmetic: a grep for the dimension outside gameplay surfaces and historical docs finds only the `LEGACY_FILTER_KEYS` convergence entry and the tests that assert the absence.
- **Legacy `?opponentIds=` bookmarks converge, they do not strand.** The key parses to nothing (the pre-screen gate then starts the game unfiltered — an empty draft is a legal start), and `FilterUrlSync`'s first canonical write actively deletes it via `LEGACY_FILTER_KEYS`, so shared URLs from before the removal clean themselves instead of carrying dead params forever.
- **Gameplay keeps its opponent.** `Game.opponentTeamId`, the seed's opponent choice, the opponent board, opponent shirts, tabs, scoring, and the opponent bonus are untouched — the filter dimension is what goes. Confusing the two is the one way this task could cause real damage.
- **New components go in `frontend/src/components/`, not `frontend/components/`.** `frontend/vitest.config.ts` aliases `@` to `frontend/src` (`:19`) and provides one explicit extra alias for `@/components/TeamTabBar` (`:20-22`) because that file lives outside `src`. A new component in `frontend/components/` would need its own alias entry to be testable, and every future filter component would need another. Put these in `src/components/` and `@/components/FilterPanel` resolves in both Next and Vitest with no config change. This is why `frontend/src/components/` already holds `GameComplete` and `WordleModal`.
- **Counts are numbers from the server, never derived client-side.** Do not compute a count by multiplying or summing other numbers in the component. R1: a wrong count is worse than a missing one, and a client-side derivation is unverified by definition.
- **The panel must not remount on filter change.** Remounting resets the draft selection and closes the panel, which means a user who applies a filter and then tweaks it loses their place. Key nothing on `filters`; keep the panel mounted in the page tree and control its visibility with a boolean.
- **Accessibility is a requirement, not a finish.** Every checkbox gets a real `<input type="checkbox">` with a stable `id` and a bound `<label htmlFor>`. The list is `<fieldset>` + `<legend>`. The search input has a `<label>`, not a placeholder as its only accessible name. The panel toggle is a `<button aria-expanded>` controlling a region with `aria-label`. Use `userEvent` in the tests and query by role and accessible name — never by CSS class or test id, so the tests fail if the semantics regress.
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
- **No schema changes in this patch.** v1.1.1 owns the wire format's foundations; this patch consumes `FilterOptionsResponse` as-is until Task 14, which is the patch's **one deliberate API contract change**: dropping the `opponents` key from that response and `opponentIds` from the filter params. The Prisma schema and `opponentTeamId` column stay exactly as they are.

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

### Task 8: Make the filter sections collapsible (approved amendment)

Recorded mid-patch after user testing: the panel opened with both ~500-row lists at once. The approved design (brainstorming Q&A, 2026-10-08): sections inside the Filters panel, collapsed everywhere including the pre-screen, count on the collapsed header, extracted `FilterSection` component. Contract: criteria 22–26.

**Test inventory (written first, red → green):**

- `FilterPanel.test.tsx` gains a `sectionHeader`/`expandSection` helper (headers read `Team` or `Team (N)`), the existing checkbox/search interactions expand their section first, and a new `describe('FilterPanel sections')` covers: both collapsed when open; independent expand/collapse with `aria-expanded` flipping; header count following the draft and resetting on Clear all; collapse keeping search text and selection; expand state surviving panel close/reopen; start mode starting collapsed with Start reachable; Clear all not touching expand state.
- `page.test.tsx` gains the same helpers; the in-game describe asserts both sections collapsed after opening the panel, the pre-screen describe asserts both collapsed with the toggle hidden and checkboxes invisible until expanded, and every checkbox interaction expands its section first. The old `getByText('Team')` panel assertions became role queries — DTL's `getByText` does not filter `hidden` elements, so the hidden legend made the text ambiguous.

**Implementation:**

- `FilterSection.tsx` (new): header `button` with `aria-expanded`/`aria-controls`, `Label (N)` count (bare label when 0, the panel's `Filters (N)` convention), `▲`/`▼` glyph matching the panel toggle, and a `hidden`-attributed body so the content stays mounted but out of the accessibility tree and focus order.
- `FilterPanel.tsx`: local `openSections` state (`{ team: false, opponent: false }`) — component-local only, never URL or storage; a two-entry `sections` config (id, label, draft count, body) maps to `FilterSection`, so v1.1.4 appends one entry per new dimension; the footer (Apply / Start game / Clear all) stays outside the sections.
- `ClubMultiSelect.tsx`: optional `hideLegend` renders the legend `sr-only` — the section header owns the visible label while the fieldset keeps its accessible name (group queries and `Search {legend}` wiring unchanged). Default `false`, so other callers are untouched.
- `page.tsx` placeholder copy: “Expand a filter above and pick your clubs — or start with any match.”

### Task 9: Re-validate after the sections amendment

Measured (2026-10-08, all after the amendment):

- `npx vitest run` — **22 files, 370 tests, all green** (was 363): `FilterPanel` 31 (7 new section cases), page suite 26 (contracts re-anchored, none removed).
- `npx vitest run --coverage` — 98.69% statements / 97.54% branches / 98.33% functions / 99.47% lines (681/690 statements).
- `npm run build` — clean on Next.js 16.3.4 (Turbopack), `/missing-eleven` still static, no `missing-suspense-with-csr-bailout`.
- `npx tsc --noEmit` — exit 0; `npm run lint` — 0 errors, the one pre-existing `GameComplete.test.tsx` warning.
- Greps unchanged from Task 7: no storage flags, no page-level `useSearchParams`, `backend/` diff empty, Vitest `include` untouched, checkbox renderers still `ClubMultiSelect` + tests (FilterSection renders no checkbox).

### Task 10: Remove the in-game filter panel (approved amendment)

Recorded after user testing of Tasks 6–8: once the game is running there is no reason to expose the filter surface — filters are chosen up front, and every new game should cross the pre-screen. The approved design (Q&A, 2026-10-08): the panel renders on the pre-screen only; **every** new-game path (sidebar New puzzle, game-complete Play Again, and the error state, which needs its own route back now that no panel exists in-game) returns there. Contract: amended criteria 13 and 19, new criteria 27–29.

**Test inventory (written first, red → green):**

- `page.test.tsx`: the 10-case in-game `missing-eleven page filter panel` describe (toggle, open/close, Apply, Clear all, reopen, draft, mounted-across-Apply contracts) is replaced by 4 cases — no `Filters` toggle/region/checkboxes while playing; New puzzle → pre-screen with no fetch, URL cleared, and `Team (1)` collapsed on return; Start after New puzzle fetches exactly once more under the same filters; Play Again (via surrender → GameComplete) takes the same route. The wiring describe's Play-again test becomes the New-puzzle contract; a fifth case covers the error state's **Change filters** button.
- Count-based assertions baseline after the deep-link mount settles: the gate starts before `FilterUrlSync`'s board-mount read lands the URL filters, so a deep link legitimately fetches twice (empty, then filtered) — pre-existing branch-layout behavior that Task 6's gate made visible; tests now wait for the second fetch before capturing `callsBefore` instead of racing it.
- `FilterPanel.test.tsx` gains one case: start mode renders and starts with **no** `onToggleOpen` handler at all (the pre-screen omits it).

**Implementation:**

- `page.tsx`: `filtersOpen`/`handleToggleFiltersOpen` deleted; `shell` renders `FilterPanel` only when `!started` (`open`, `onStart` always, no `onToggleOpen`). One `handleNewPuzzle` callback serves all three exits: `newGame()` to drop the board, then **reapply the captured applied filters** (`NEW_GAME` returns `initialState`, which wipes `filters` too — without the reapply the panel would reopen empty), then `fetchedKeyRef.current = null` (or Start under identical filters would dedupe itself into silence), `router.replace(pathname, { scroll: false })` (any params mean "started"), `setStarted(false)`.
- `page.tsx` error branch: secondary **Change filters** button (text-button style under the primary Try again) wired to `handleNewPuzzle` — without it the error state, now panel-less, would be a dead end when the filters themselves are the problem.
- `FilterPanel.tsx`: `onToggleOpen` becomes optional (`onToggleOpen?.()` in apply) — start mode never reaches it (the toggle renders only in apply mode), so the pre-screen simply omits the prop.

### Task 11: Re-validate after the in-game removal

Measured (2026-10-08, all after the removal):

- `npx vitest run` — **22 files, 366 tests, all green** (was 370): `FilterPanel` 32 (+1 handlerless start-mode case), page suite 21 (10 in-game panel cases → 4 contract cases, one wiring case re-anchored).
- `npx vitest run --coverage` — 98.69% statements / 97.54% branches / 98.33% functions / 99.47% lines (681/690 statements).
- `npm run build` — clean on Next.js 16.3.4 (Turbopack), `/missing-eleven` still static, no `missing-suspense-with-csr-bailout`.
- `npx tsc --noEmit` — exit 0; `npm run lint` — 0 errors, the one pre-existing `GameComplete.test.tsx` warning.
- Greps unchanged: no storage flags, no page-level `useSearchParams`, `backend/` diff empty, Vitest `include` untouched; `filtersOpen`/`handleToggleFiltersOpen`/`handlePlayAgain` no longer exist anywhere.

### Task 12: Selected-value chips on section headers (approved amendment)

Recorded after the sections landed: a collapsed header counts a selection but does not name it, so undoing one value means expanding the section and hunting the checkbox. The approved design (brainstorming Q&A, 2026-10-08; layout amended same day at user request): one chip per draft selection in a wrapping row **below** the section header — the disclosure button always fills the row — in **both** dimensions, removed via the chip's X — and no cap: the chip row wraps onto more lines instead of hiding values behind "+N more". Contract: criteria 30–31.

**Test inventory (written first, red → green):**

- `FilterPanel.test.tsx` gains a `describe('FilterPanel selected chips')` with 7 cases: chip name under `Label (N)` with the X proven to sit **outside** the disclosure button and after it in DOM order (the strict header-name regex matching at all is the proof of the former; nested buttons are invalid HTML); X editing the draft only — no `onApply`, Apply re-disarmed when the draft returns to the applied set, checkbox mirrored; one chip per selection removed independently; opponent chips labelled against their dimension; `#id` fallback for a draft id outside the option universe (stale deep link); focus handed to the section header after removal (the X unmounts with its chip); start mode removing chips without starting.
- `page.test.tsx` gains one pre-screen integration case: select → chip visible with no fetch and no `replace` → X → chip gone, still no fetch or URL write.

**Implementation:**

- `FilterSection.tsx`: new optional `chips` (`{ id, name }[]`) and `onRemoveChip` props. The disclosure button stays full-width exactly as before; chips render in their own `mt-2 flex flex-wrap items-center gap-2` row **below** it — outside the button (nested buttons are invalid HTML) and wrapping onto extra lines when there are many. Each chip is a bordered pill with a truncating name (`max-w-[12rem]`) and an X `button` labelled `Remove {name} from {label}`; removal calls the handler then refocuses the header button so keyboard focus does not drop to `<body>`.
- `FilterPanel.tsx`: `nameFor` reads the existing merged `clubNames` map (robust to either facet list being narrower) with a `#id` fallback; each section entry maps its draft ids through it and passes `toggleTeam`/`toggleOpponent` as the removal handler — the same toggle semantics as the checkbox, so the two controls can never disagree.

### Task 13: Re-validate after the chips amendment

Measured (2026-10-08, all after the amendment):

- `npx vitest run` — **22 files, 374 tests, all green** (was 366): `FilterPanel` 39 (7 new chip cases), page suite 22 (+1 pre-screen chip integration).
- `npx vitest run --coverage` — 98.71% statements / 97.58% branches / 98.38% functions / 99.48% lines (up from 98.69 / 97.54 / 98.33 / 99.47).
- `npm run build` — clean on Next.js 16.3.4 (Turbopack), `/missing-eleven` still static, no `missing-suspense-with-csr-bailout`.
- `npx tsc --noEmit` — exit 0; `npm run lint` — 0 errors, the one pre-existing `GameComplete.test.tsx` warning.
- Greps unchanged: no storage flags, no page-level `useSearchParams`, `backend/` diff empty, Vitest `include` untouched; the strict header-name regex (`^Team( \(\d+\))?$`) still resolves in both suites — the chips stayed outside the disclosure button.

### Task 14: Remove the Opponent dimension end to end (approved amendment)

Recorded after the chips landed: the Opponent filter proved confusing and redundant UX (brainstorming Q&A, 2026-10-08; Approach A full vertical removal approved same day). The file this plan lives in was renamed from `plan-v1.1.3-team-opponent-filters.md` to `plan-v1.1.3-team-filters.md` — v1.1.3 is unreleased, so the filename follows the final contract, and `CHANGELOG.md` plus `.superpowers/sdd/progress.md` were updated to the new path. Contract: criteria 1, 2, 7, 8, 9, 22, 23, 30 (amended) and the new absence criterion 7.

**Test inventory (written first, red → green):**

- Frontend: `filterParams.test.ts` (legacy `opponentIds` ignored on parse, four-dimension serialisation, round-trip, `isValidGameFilters` rejecting a legacy object that still carries `opponentIds`); `filtersEqual.test.ts` (all fixtures at four fields); `filters.test.ts` (dimensions/metadata tests reworded away from opponent fallbacks; `FILTER_PARAM_KEYS` looped over `['daily', 'unknownKey', 'opponentIds']` as ignored keys); `FilterPanel.test.tsx` (no Opponent section/header/group at all — asserted via `queryByRole('button', { name: /^Opponent/ })` and `queryByRole('group', { name: 'Opponent' })` — single-section start/expand/collapse, `Filters (1)` count, Clear-all fixture at four fields, opponent-chip case deleted, legend examples reworded); `page.test.tsx` (pre-screen asserts no Opponent button where both sections were collapsed); `FilterUrlSync.test.tsx` (parse expectation at four fields, **new** legacy-strip case: write deletes `opponentIds` while preserving `daily` and writing `teamIds`); `mockFilters.test.ts`, `useFilterOptions.hook.test.ts`, `gameState.test.ts` (reducer fixtures at four fields), `ClubMultiSelect.test.tsx` (legend examples reworded to a neutral second list).
- Backend: `filterQuery.test.ts` (no `opponentWhere` import, four-field fixture, combined SQL asserted **not** to contain `opponentTeamId`, plus a legacy-object case proving no opponent SQL even when a cast object carries `opponentIds`); `filterService.test.ts` and `routes/filterOptions.test.ts` (response key list without `opponents`, `not.toHaveProperty('opponents')`, **new** legacy case: `?opponentIds=999` behaves as unfiltered, total 1); `routes/matches.test.ts` and `matchService.test.ts` (fixtures and queries at four fields); `filterServiceGuard.test.ts` (fixture).

**Implementation:**

- Frontend: `types/index.ts` (`GameFilterParams` 5→4 fields, `EMPTY_FILTERS`, `FilterOptionsResponse` drops `opponents`); `filterParams.ts` (`FILTER_KEYS` 5→4, parse/serialise/validate drop the field, new `LEGACY_FILTER_KEYS = ['opponentIds']` export); `filters.ts` (opponent clause, opponent fallback resolution in metadata, and both count helpers); `filtersEqual.ts`; `FilterPanel.tsx` (second section entry, `toggleOpponent`, `opponentOptions`, merged-name map collapses to the Team universe); `lib/api.ts` guard; `lib/mockData.ts` (mock facet + fixture); `lib/clubFilters.ts` comments; `FilterUrlSync.tsx` (write loop deletes `LEGACY_FILTER_KEYS` after `FILTER_PARAM_KEYS`).
- Backend: `lib/filterQuery.ts` (`GameFilterParams`, `FilterDimension` drops `'opponent'`, `opponentWhere` deleted, both where-builders drop the clause); `services/filterService.ts` (response interface, `RawFilterCounts`, opponents CTE, `json_build_object` key, counts map, return value); `services/matchService.ts` (`EMPTY_GAME_FILTERS`); `routes/matches.ts` (`parseGameFilterParams` stops reading `opponentIds` — the query param is now simply unknown and ignored). **No Prisma schema change.**
- Gameplay untouched by construction: `Game.opponentTeamId`, the seed, opponent board/shirts/tabs, scoring, `GameComplete`, `gameState` shirt arrays.

### Task 15: Re-validate after the removal

Measured (2026-10-08, all after the removal):

- Frontend `npx vitest run` — **22 files, 375 tests, all green** (was 374; +1 legacy URL-strip case, opponent-chip case deleted, absence cases added). `npx vitest run --coverage` — 98.69% statements / 97.49% branches / 98.36% functions / 99.47% lines.
- Backend `npm test` — **23 files, 336 tests, all green**. `npm run test:coverage` — 99.85% statements / 99.23% branches / 100% functions / 99.82% lines (above the 95% thresholds).
- `npx tsc --noEmit` — exit 0 in both packages; `npm run lint` — 0 errors (the one pre-existing `GameComplete.test.tsx` warning); `npm run build` — clean on Next.js 16.3.4, `/missing-eleven` still static.
- Absence greps: no `opponentIds`/`opponents` outside gameplay surfaces, the `LEGACY_FILTER_KEYS` convergence entry, the tests asserting the absence, seed-domain code, and historical docs; no `opponentWhere` anywhere; Prisma schema diff empty.
- Plan-file rename re-points the spec lines in `CHANGELOG.md` and `.superpowers/sdd/progress.md` (no dangling `team-opponent-filters` references outside the v1.0.1 archive diff and historical docs).

## Acceptance criteria

1. This patch renders **Team only** — the Opponent dimension is removed end to end (Task 14). Competition, Season, and the empty state belong to v1.1.4; their absence here is correct, not incomplete.
2. `ClubMultiSelect` is the **single** multiselect control, rendering the panel's only list (Team). A second, near-identical multiselect — for any dimension — is a defect; the one-control architecture is what Task 14's removal collapses onto without leaving a dormant twin.
3. Counts are never recomputed on toggle. Toggling an option reads the numbers v1.1.1 already returned; `grep -rn "count" frontend/src/components/ClubMultiSelect.tsx` finds rendering only, no arithmetic.
4. Counts are **numbers from the server**, never derived client-side. A client-side `options.length` or filtered-count fallback is a defect.
5. The option universe is unfiltered and always complete: every club in the response is listed, regardless of the current selection, so a selected value does not vanish from its own list.
6. A zero-count option is **visible, enabled, and selectable**. Hiding or disabling it would make a filter that returns nothing unreachable to fix.
7. **The Opponent dimension is absent from the contract.** `GameFilterParams` and `EMPTY_FILTERS` carry exactly four fields; `FilterOptionsResponse` returns `teams`, `competitions`, `seasons`, `total` — no `opponents` key anywhere in the response or its runtime guard; no frontend or backend source file outside gameplay references `opponentIds`; and the panel renders no Opponent header, section, or group. The absence is asserted by tests on both sides (parse ignores the legacy key, SQL built from a legacy object never mentions `opponentTeamId`, `?opponentIds=` on the API behaves as unfiltered, the response `not.toHaveProperty('opponents')`).
8. **The removal is vertical, not cosmetic, and legacy URLs converge.** Parse, validation, URL serialisation, SQL builders, the grouped CTE, the response shape, the panel, and the mock all drop the dimension together; `FilterUrlSync` actively deletes a stale `opponentIds` param on the first canonical write (`LEGACY_FILTER_KEYS`), so old bookmarks clean themselves instead of carrying dead params forever — while gameplay's opponent surfaces (`Game.opponentTeamId`, the opponent board, shirts, tabs, scoring) remain untouched.
9. The control uses the draft-then-apply contract from v1.1.1: edits land in a local draft and the URL/state change only on Apply.
10. The panel **does not remount** on filter change — the user's in-progress search text and scroll position survive a fetch. `key` is not derived from the filter state.
11. New components live in `frontend/src/components/`, not `frontend/components/`, so Vitest's flat `@` alias resolves them identically to the App Router.
12. Accessibility is a requirement, not a finish: the trigger is a real `button` with `aria-expanded` and `aria-controls`; each option is a labelled `input[type=checkbox]` reachable by keyboard; the grouped list is announced; focus is visible.
13. The panel renders **only on the pre-screen** — forced open with its toggle hidden, so the Start action is always reachable. Once the game is running it does not render at all (no toggle, no region, no checkboxes), and its open/closed state is never persisted to storage or the URL.
14. No new dependencies, and no backend, schema, or API change in this patch.
15. `npm run test`, `npm run build`, `npx tsc --noEmit`, and `npm run lint` are all clean, and every new suite is collected. No suite is asserted against a fixed count — it is measured and recorded, per `docs/v1/v1.2/overview.md:209`.
16. First visit with an empty URL renders the pre-screen and performs **no** match fetch until Start is pressed — no skeleton, no board, no request.
17. Start commits the draft, writes the URL **before** the board mounts, flips `started`, and triggers exactly one match fetch — including the empty-draft case, where the URL stays empty and one fetch still fires.
18. A URL with params auto-starts exactly as today: v1.1.2's landing contract and the whole `FilterUrlSync` suite pass unchanged.
19. Once started, Retry and surrender behave exactly as before this append — the gate changes entry, not play. Play again and the sidebar's New puzzle instead return to the pre-screen, and mid-game Apply no longer exists: filter changes happen only from the pre-screen (criteria 27–29).
20. Reloading with an empty URL returns to the pre-screen. No session or storage flag survives; the URL is the only thing that decides.
21. On the pre-screen the panel is forced open with its toggle hidden, the primary button reads "Start game", and the board area shows the placeholder — one path into the game, no second Start.
22. Each dimension is a collapsible section inside the panel with its own disclosure button (`aria-expanded`/`aria-controls`) — one section today (Team); v1.1.4 appends its dimensions the same way. It starts collapsed — on the pre-screen too — and the footer (Apply / Start game / Clear all) sits outside the section, always reachable regardless of what is collapsed.
23. Disclosure state is component-local: it survives opening/closing the panel, resets on reload, and never lands in the URL or storage.
24. A collapsed section's header carries the draft selection count in the panel's `Label (N)` convention (bare label when 0); the count tracks the draft, not the applied set, so it always agrees with the checkboxes you would see on expand.
25. Section bodies stay mounted while collapsed (`hidden` attribute), so search text and checkbox selections survive a collapse; hidden content stays out of the accessibility tree and the keyboard focus order.
26. `ClubMultiSelect`'s legend is visually hidden only when wrapped by a section header (`hideLegend`); the fieldset keeps its accessible name, and the default rendering (no wrapper) is unchanged.
27. While the game runs there is **no filter surface**: no `Filters` toggle, no panel region, no checkboxes anywhere on the page. The panel exists solely on the pre-screen (criterion 13).
28. Every new-game path — the sidebar **New puzzle**, the game-complete **Play Again**, and the error state's **Change filters** button — returns to the pre-screen: board reset, URL cleared (the gate reads any params as "started"), and no match fetch until Start is pressed again. The applied filters survive the round trip: the panel reopens with them selected, sections collapsed.
29. Start after a return fetches even under identical filters — the fetch-key ref is re-armed by the return handler. The handler reapplies the captured filter set immediately after `NEW_GAME`, because the reducer's `initialState` wipes `filters` along with the rest of the state; without that reapply the panel would reopen empty.
30. Each section header shows every draft selection as a removable chip — the club name plus an X — in a wrapping row **below** its `Label (N)` header. The disclosure button always fills the row; chips sit outside it, never inside (nested buttons are invalid HTML), and the chip row wraps onto more lines rather than capping or hiding values. The X edits the draft only — no Apply, no fetch, no URL write — using the same toggle semantics as the matching checkbox, and keyboard focus moves to the section header after removal so it does not drop to `<body>`. A draft id with no matching option renders as `#id` instead of vanishing.
31. Chip removal behaves identically in start mode: the draft, count, and chip row update together, and Start game still requires its explicit press — removing the last chip never starts anything.

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
| No schema drift | `git diff --stat -- backend/prisma/` | empty — the removal touches query builders and services only |
| The opponent removal is vertical, not cosmetic | `grep -rn "opponentIds\|opponentWhere\|\.opponents" frontend/src frontend/app frontend/lib frontend/types backend/src` (gameplay files excluded) | only `LEGACY_FILTER_KEYS` and the tests asserting the absence remain |
| Legacy `?opponentIds=` converges | `cd frontend && npx vitest run app/missing-eleven/FilterUrlSync.test.tsx src/lib/filterParams.test.ts` | parse ignores the key; the write deletes it while preserving unrelated params; a legacy object fails `isValidGameFilters` |
| The API dropped the key and ignores the param | `cd backend && npx vitest run src/__tests__/integration` | `filter-options` key list has no `opponents`, `?opponentIds=999` still returns total 1, random selection ignores the param |
| Gameplay opponent untouched | `git diff --stat -- frontend/src/lib/gameState.ts frontend/src/components/GameComplete.tsx frontend/src/lib/scoring.ts backend/prisma/` | empty |
| The include was not re-narrowed (R7) | `grep -n "include:" frontend/vitest.config.ts` | unchanged from v1.1.1 |
| The gate, at page level | `cd frontend && npx vitest run app/missing-eleven/page.test.tsx` | empty mount fetches nothing; Start writes the URL, then fetches once; the deep-linked fixture starts with no pre-screen |
| `FilterUrlSync` contract intact | `cd frontend && npx vitest run app/missing-eleven/` | the whole directory green — the mount-order read is unchanged |
| Collapsible sections | `cd frontend && npx vitest run src/components/FilterPanel.test.tsx` | the `FilterPanel sections` describe green — collapsed default, independent toggles, draft count, state survival, footer reachable |
| No filters in-game, one loop back | `cd frontend && npx vitest run app/missing-eleven/page.test.tsx` | no `Filters` toggle/region while playing; New puzzle, Play Again, and Change filters each land on the pre-screen without fetching; Start after a return refetches the same filters |
| Selected-value chips | `cd frontend && npx vitest run src/components/FilterPanel.test.tsx` | the `FilterPanel selected chips` describe green — name under the header, draft-only removal with Apply re-disarmed, `#id` fallback, focus handoff, start mode unchanged; the strict header-name regex still resolves and the X follows the button in DOM order (chips below, outside the button) |
| Frontend suite after the removal | `cd frontend && npm run test && npx tsc --noEmit && npm run lint && npm run build` | every file green (count measured, not asserted); `tsc` exit 0; lint 0 errors; `next build` clean |
| Backend suite after the removal | `cd backend && npm test && npx tsc --noEmit && npm run test:coverage` | every file green (count measured, not asserted); `tsc` exit 0; coverage above the 95% thresholds |

## Risks

| Risk | Mitigation |
|---|---|
| **Counts recomputed on toggle**, so selecting a filter silently changes every other count and the list reshuffles under the cursor. | Counts are read from the single grouped query and never recomputed (criteria 3–4). The unfiltered, complete option universe (criterion 5) is what makes a recompute unnecessary; the panel test asserts the rendered counts are the server's. |
| **The panel remounts on filter change**, discarding the user's search text mid-typing. | `key` is not derived from filter state (criterion 10), and the panel test asserts draft state survives an Apply → refetch cycle. |
| **A zero-count option is hidden or disabled**, stranding the user on a filter that returns nothing with no way to widen it. | Zero-count options stay visible, enabled, and selectable (criterion 6), asserted by name in `ClubMultiSelect.test.tsx`. |
| **The Opponent removal is cosmetic**, dropping the section while the backend still parses or SQL-filters on `opponentIds` — two contracts disagreeing silently. | The removal is vertical and asserted on both sides (criterion 7): the grep gate covers every non-gameplay source file, the backend tests assert no `opponentTeamId` SQL and no `opponents` response key, and `?opponentIds=999` proves the param is inert at the route. |
| **Legacy `?opponentIds=` URLs keep the key forever** (or worse, keep filtering), so shared bookmarks from before the removal strand users on a dead dimension. | `paramsToFilters` ignores the key, `isValidGameFilters` rejects objects carrying it, and `FilterUrlSync` deletes it on the first canonical write via `LEGACY_FILTER_KEYS` (criteria 7–8); each half has its own test. |
| **New components land in `frontend/components/`**, where Vitest cannot see them — a suite that reports green while asserting nothing. | The architecture note fixes the location, and `grep -rn "from '@/components/TeamTabBar'"` demonstrates the import form that resolves in both runners. |
| **Accessibility is treated as a finish**, leaving a keyboard user unable to reach an option. | Criterion 12 is a list of checkable properties, each asserted in `ClubMultiSelect.test.tsx`; the panel trigger's `aria-expanded`/`aria-controls` pair is named rather than implied. |
| **`FilterUrlSync` wipes the started filters** by reading the stale (empty) URL at mount — the D4 failure class recurring at a new call site. | Start writes the URL before `started` flips, so the mount-read is idempotent; a page test asserts the params reach the URL before the board appears and that the request carries them. |
| **Start double-fetches**, because `started` and `filterKey` change in the same commit. | One effect keyed on `[started, filterKey]`, with `fetchedKeyRef` dedupe and a skip-unless-started guard (criterion 17); the test asserts a single request. |
| **The pre-screen is a dead end** — the user closes the panel and Start disappears with it. | The toggle is hidden while `started === false` (criterion 21); the panel cannot close before the game starts. |
| **Existing auto-fetch tests are re-anchored silently**, leaving a behavior change with a green suite that no longer asserts the old contract anywhere. | Task 6 inventories every page test that assumes an empty-URL auto-fetch and re-anchors it to a deep-link fixture or inverts it to assert no-fetch; the full suite runs at Task 7. |
| **Collapsed sections hide a selection**, so the user opens every section to discover what is set. | The header carries the draft count in the `Label (N)` convention (criterion 24) and the panel toggle keeps the applied dimension count; both are asserted by the sections suite. |
| **The footer becomes unreachable** because it lives inside a collapsible region — the pre-screen dead-end returning at one level down. | Apply / Start game / Clear all render outside the sections (criterion 22), asserted visible with everything collapsed in `FilterPanel.test.tsx`. |
| **The error state becomes a dead end** once no panel exists in-game: a bad filter set can only be retried forever. | The error branch carries its own **Change filters** button back to the pre-screen (criterion 28), clicked in the page suite; Try again keeps its retry semantics. |
| **`NEW_GAME` wipes the applied filters** (`initialState`), so the pre-screen reopens empty and the user loses their selection. | The return handler reapplies the captured set in the same batch (criterion 29); the page suite asserts `Team (1)` survives New puzzle. |
| **Start after a return fetches nothing**, because `fetchedKeyRef` still holds the key the identical filters produced before. | The return handler nulls the ref (criterion 29); the page suite asserts exactly one additional request carrying the same filters. |

**Escalate before proceeding if:** the counts v1.1.1 returns cannot support an unfiltered, complete option universe for one of the dimensions — for example if a facet legitimately returns a truncated list. That would contradict R5 and the grouped-query decision, and the fix belongs upstream in v1.1.1 rather than in a client-side recomputation here. **Escalate likewise if:** the match-fetch effect cannot be keyed on `[started, filterKey]` without either dropping the deep link's initial fetch or double-fetching on Start — that would mean `FilterUrlSync`'s mount contract and the gate cannot coexist as designed, and the URL-write ordering rule above needs revisiting before code is written.
