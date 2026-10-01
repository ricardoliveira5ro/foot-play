# Competition, Season & Empty State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The filter panel becomes complete — Competition and Season join Team and Opponent, and a filter combination that matches no games produces an explanatory empty state instead of an error. The empty state is driven by the `total` that v1.1.1's single grouped query already returns, which is what makes R5's "total" field load-bearing rather than decorative.

**Architecture:** Two new controls, both pure and both following the v1.1.3 draft-then-apply contract, plus one presentational `FilterEmptyState`. `CompetitionMultiSelect` reuses the same checkbox-list shape as `ClubMultiSelect` but without search or grouping, because 28 options in alphabetical order need neither. `SeasonRange` is a two-bound numeric control that pushes the opposite bound rather than allowing an inverted range. The empty state is a sibling of the game board, selected by `filterOptions.total === 0 && hasActiveFilters(filters)` — deliberately **not** by a 404, so that "your filter matched nothing" and "the server is down" can never render the same thing.

**Tech Stack:** TypeScript, React 19, Tailwind, Vitest + jsdom + Testing Library + `userEvent`, Next 16 App Router.

---

## Global Constraints

- **This patch renders Competition, Season, and the empty state. It does not change the Team/Opponent behaviour** except to add a per-dimension clear affordance. Any regression in v1.1.3's counts, search, or grouping is a defect here.
- **The empty state is keyed on `filterOptions.total === 0`, not on the match request failing.** `fetchRandomMatch` returning `null` and the options request reporting `total: 0` are two independent confirmations of the same fact; the options number is used because it arrives from the single grouped query and is exact by construction. A 404 could equally mean a routing bug, a proxy failure, or a database outage, and collapsing any of those into "no games match your filters" is precisely the "absent, not wrong" inversion the roadmap forbids.
- **`total` counts games with **all** filters applied. It is not a per-dimension number and must not be presented as one.** The empty-state copy should say the *combination* matched nothing, not that any one filter is at fault.
- **A 404 or a network failure must still render the error state, not the empty state.** The two states are visually and textually distinct, and each has its own test. If a future change makes them share a branch, the user is told their filter is at fault when the server is down.
- **The empty state must be escapable.** It offers "Clear all filters" and, when the panel is closed, the panel toggle. A dead end here is the worst outcome of the whole v1.1 line, because the user has a URL that permanently shows an empty page.
- **Season options stop at 2025, and the data runs to 2026-06-28.** `Game.season` is nullable, the 2026 season is partial, and no row carries `season = 2026`. The season option list is derived from the distinct `season` values the server returns, so it shows 2013–2025 and nothing else. **This is a real limitation, not a bug to paper over:** a user who wants "2025–2026" cannot express it, and the copy must not imply that the season filter covers the partial 2026 season. Do not synthesise a 2026 option, do not widen the bound, and do not treat season and match date as interchangeable. v1.1.1's bounds of 2013–2025 stay exactly as they are.
- **`seasonFrom > seasonTo` yields zero results and is explained — it is never silently normalised.** v1.1.1 and v1.1.2 both preserve an inverted range. `SeasonRange` additionally makes it unreachable by UI interaction: moving one bound past the other pushes the other with it. So the only way to reach the inverted state is a hand-edited URL, and when that happens the empty state explains it specifically.
- **`paramsToFilters` clamps out-of-range bounds to `null` per dimension** (v1.1.1 Task 8). So `?seasonFrom=1999` reaches the app as "no lower bound", not as an error and not as 1999. The `SeasonRange` control must therefore render `null` as "any", and a user who typed 1999 sees the box empty. That is the specified behaviour; do not "fix" it by re-throwing the value into the input.
- **The season bounds are a range, not two independent filters.** There is no `seasonFrom` XOR `seasonTo` path in the UI: leaving one box empty means "unbounded on that side", which the backend renders as no condition at all. The control must communicate that an empty box is not a zero and not a wildcard the user has to think about — use a placeholder like "Any" and an explicit `aria-label`.
- **Draft-then-apply continues to hold.** Season and Competition changes, like Team and Opponent, update the draft and are committed only by Apply. Changing a season bound must not trigger a match fetch. The same Task 3 test from v1.1.3 keeps this honest; add the season-specific version.
- **Counts for the competition and season dimensions obey the same R5 facet exclusion as the club dimensions.** With a competition selected, the competition list must not collapse to `0` for the selected entry. This is v1.1.1 Task 5's invariant, already tested backend-side; add the live check to the smoke test.
- **New components go in `frontend/src/components/`.** Same reasoning as v1.1.3: `@/components/X` must resolve in Vitest without a per-file alias.
- **Accessibility:** `<fieldset>`/`<legend>` for the competition group; the two season inputs each get a real `<label>` and `aria-label` stating which bound it is; the empty state is a `role="status"` region so it is announced when it replaces the board.
- **No backend, schema, or API changes.** `FilterOptionsResponse` already carries `competitions`, `seasons`, and `total`. This patch is a consumer.
- **TDD mode: advisory_active.** Test first for all testable logic; red → green → refactor; report the commands and results.

---

### Task 1: Add the competition option helpers

**Files:**
- Create: `frontend/src/lib/competitionFilters.ts`
- Create: `frontend/src/lib/competitionFilters.test.ts`

**Interfaces:**
- Consumes: `FilterOptionsResponse` from v1.1.1.
- Produces:
  ```ts
  export interface CompetitionOption { id: string; name: string; count: number }
  export function toCompetitionOptions(
    groups: { id: string; count: number }[],
    names: Map<string, string>,
  ): CompetitionOption[]
  export function toggleCompetition(list: string[] | null, id: string): string[] | null
  export const SEASON_MIN = 2013;
  export const SEASON_MAX = 2025;
  export function clampSeason(value: number | null): number | null
  export function normaliseSeasonRange(from: number | null, to: number | null): { from: number | null; to: number | null }
  ```

**Steps:**

- [ ] **Step 1.1: Write the failing test.**

  Create `frontend/src/lib/competitionFilters.test.ts`. Pure, node environment:

  ```ts
  describe('toCompetitionOptions', () => {
    it('joins counts to names', ...);
    it('keeps an unresolvable competition with a visible fallback label', ...);
    it('returns an empty array for no groups', ...);
  });

  describe('toggleCompetition', () => {
    it('adds an absent id', ...);
    it('removes a present id', ...);
    it('returns null when the last id is removed', ...);
    it('preserves order and does not mutate the input', ...);
  });

  describe('clampSeason', () => {
    it('keeps 2013 and 2025', ...);
    it('clamps below 2013 to null', ...);
    it('clamps above 2025 to null', ...);
    it('keeps null as null', ...);
    it('clamps a non-integer to null', ...);
  });

  describe('normaliseSeasonRange', () => {
    it('leaves a valid range untouched', ...);
    it('leaves a half-open range untouched', ...);
    it('pushes `to` up when `from` is raised past it', ...);
    it('pushes `from` down when `to` is lowered below it', ...);
    it('does nothing when one bound is null', ...);
    it('produces a non-inverted range for every input in 2011..2027', ...);   // exhaustive
  });
  ```

  The exhaustive range test is the one worth writing by hand: loop `from` and `to` over every value in `2011..2027` and assert the result is never inverted. A property test over a bounded domain is cheap here and catches the off-by-one that a hand-picked case list will miss.

  The *name* of `clampSeason`'s null-return is worth pausing on. Returning `null` for out-of-range matches v1.1.1's `paramsToFilters` coercion, which is what makes the URL and the control agree. Returning the clamped boundary (2013 for 1999) would be a different, also-defensible product decision, but it would contradict the already-written and already-tested v1.1.1 behaviour. **Consistency wins; the control and the URL must not disagree about what 1999 means.**

- [ ] **Step 1.2: Run it and confirm red.**

  ```bash
  cd frontend && npx vitest run src/lib/competitionFilters.test.ts
  ```

- [ ] **Step 1.3: Implement.**

  ```ts
  export const SEASON_MIN = 2013;
  export const SEASON_MAX = 2025;

  export function clampSeason(value: number | null): number | null {
    if (value === null || !Number.isInteger(value)) return null;
    return value < SEASON_MIN || value > SEASON_MAX ? null : value;
  }

  export function normaliseSeasonRange(from: number | null, to: number | null) {
    if (from === null || to === null) return { from, to };
    if (from > to) {
      // The caller knows which bound the user just moved; this helper is only
      // for the 'from wins' case. See the control's onChange for the mirror.
      return { from, to: from };
    }
    return { from, to };
  }
  ```

  Because the two directions of the correction depend on *which* bound moved, the control should call `normaliseSeasonRange` from its `onFromChange` and the mirrored form from its `onToChange` rather than relying on this function to guess. Write that intent in the doc comment; a helper that appears to handle both cases but actually only handles one is a trap.

- [ ] **Step 1.4: Verify green and commit.**

  ```bash
  cd frontend && npx vitest run src/lib/competitionFilters.test.ts
  git add frontend/src/lib/competitionFilters.ts frontend/src/lib/competitionFilters.test.ts
  git commit -m "feat: add competition and season range helpers"
  ```

---

### Task 2: Add the `CompetitionMultiSelect` and `SeasonRange` controls

**Files:**
- Create: `frontend/src/components/CompetitionMultiSelect.tsx`
- Create: `frontend/src/components/CompetitionMultiSelect.test.tsx`
- Create: `frontend/src/components/SeasonRange.tsx`
- Create: `frontend/src/components/SeasonRange.test.tsx`

**Interfaces:**
- Consumes: Task 1's helpers; `FilterOptionGroup` counts from v1.1.1.
- Produces:
  ```tsx
  // CompetitionMultiSelect
  export default function CompetitionMultiSelect(props: {
    options: CompetitionOption[];
    selected: string[] | null;
    onToggle: (id: string) => void;
    loading: boolean;
  }): JSX.Element;

  // SeasonRange
  export default function SeasonRange(props: {
    from: number | null;
    to: number | null;
    onFromChange: (value: number | null) => void;
    onToChange: (value: number | null) => void;
    seasons: { season: number; count: number }[];
    loading: boolean;
  }): JSX.Element;
  ```

**Steps:**

- [ ] **Step 2.1: Write the failing `CompetitionMultiSelect` test.**

  ```tsx
  // @vitest-environment jsdom
  it('renders one checkbox per competition with a real label', ...);
  it('shows the count next to every competition', ...);
  it('keeps a zero-count competition visible, enabled, and selectable', ...);
  it('checks the boxes for every selected id', ...);
  it('calls onToggle with the clicked id', ...);
  it('is sorted by name via the server order, not re-sorted locally', ...);
  it('has no search box', ...);                          // 28 options do not need one
  it('is reachable by getByRole with an accessible name', ...);
  it('shows a loading state while options load', ...);
  ```

  The last one to check is the first: confirm the server's `competition.findMany` already orders by `name` (v1.1.1 Task 5), and assert the component renders in the order given rather than imposing a second sort. Two sorts, in the wrong order, is how a Portuguese locale ends up alphabetised by the wrong rule.

- [ ] **Step 2.2: Write the failing `SeasonRange` test.**

  ```tsx
  // @vitest-environment jsdom
  it('renders two labelled numeric inputs, from and to', ...);
  it('shows an empty box for a null bound with an "Any" placeholder', ...);
  it('reports the typed value on change', ...);
  it('reports null when the box is cleared', ...);
  it('pushes the `to` bound up when `from` is raised past it', ...);
  it('pushes the `from` bound down when `to` is lowered below it', ...);
  it('never renders an inverted range after an interaction', ...);
  it('rejects a value outside 2013-2025 by reporting null', ...);
  it('rejects a non-numeric entry by reporting null', ...);
  it('offers the available seasons as a datalist hint', ...);
  it('names each input for a screen reader ("Season from", "Season to")', ...);
  it('does not disable an empty bound', ...);
  ```

  The inverted-range tests are the reason this control exists as a component rather than two raw inputs: a user must be unable to build `from=2024&to=2020` by clicking, even though the URL can still express it.

  `type="number"` with `min`/`max` attributes gives free browser validation, but it does **not** prevent a typed value being reported, so the component must still clamp in its `onChange`. The tests above are what prove the component, rather than the browser, is doing the clamping.

- [ ] **Step 2.3: Run both and confirm red.**

  ```bash
  cd frontend && npx vitest run src/components/CompetitionMultiSelect.test.tsx src/components/SeasonRange.test.tsx
  ```

- [ ] **Step 2.4: Implement both controls.**

  `CompetitionMultiSelect` mirrors `ClubMultiSelect`'s markup — `<fieldset>`/`<legend>`, `<input type="checkbox">` with a stable `id` and a bound `<label>` holding name and count — with no search input and no grouping. Share the row markup by extracting a small `FilterOptionRow` used by both v1.1.3 and v1.1.4 components; three near-identical copies of a checkbox row is where they start diverging. Extraction is in-scope here, refactoring the v1.1.3 file is in-scope here, and a new shared file is fine — the constraint is about *not* renaming frozen exports, not about avoiding refactors.

  `SeasonRange` renders two inputs with `min={SEASON_MIN}` / `max={SEASON_MAX}`, `inputMode="numeric"`, placeholder "Any", and a `<datalist>` populated from the `seasons` prop so a user can see which seasons actually exist without guessing. The `onChange` handlers parse, `clampSeason`, and call `normaliseSeasonRange` in the correct direction.

- [ ] **Step 2.5: Verify green and commit.**

  ```bash
  cd frontend && npx vitest run src/components/
  git add frontend/src/components/CompetitionMultiSelect.tsx frontend/src/components/CompetitionMultiSelect.test.tsx frontend/src/components/SeasonRange.tsx frontend/src/components/SeasonRange.test.tsx
  git commit -m "feat: add competition and season range filter controls"
  ```

---

### Task 3: Add the `FilterEmptyState`

**Files:**
- Create: `frontend/src/components/FilterEmptyState.tsx`
- Create: `frontend/src/components/FilterEmptyState.test.tsx`

**Interfaces:**
- Consumes: `GameFilterParams` and `hasActiveFilters` from v1.1.1.
- Produces:
  ```tsx
  export default function FilterEmptyState(props: {
    filters: GameFilterParams;
    onClearAll: () => void;
    onOpenFilters: () => void;
    invertedSeasonRange: boolean;
  }): JSX.Element;
  ```
  Pure and presentational. It receives `invertedSeasonRange` as a flag rather than re-deriving it, so the copy logic has one owner.

**Steps:**

- [ ] **Step 3.1: Write the failing test.**

  ```tsx
  // @vitest-environment jsdom
  it('is a status region so it is announced when it replaces the board', ...);
  it('says the combination matched no games', ...);
  it('does not blame any single filter', ...);
  it('offers Clear all filters', ...);
  it('offers a way to reopen the filter panel', ...);
  it('calls onClearAll when Clear all is pressed', ...);
  it('calls onOpenFilters when the panel shortcut is pressed', ...);
  it('explains an inverted season range specifically', ...);
  it('does not mention the season range otherwise', ...);
  it('does not offer Clear all when no filter is active', ...);
  ```

  *"does not blame any single filter"* is the one with a real product decision inside it. With four dimensions in an AND, the honest statement is that the **combination** is too narrow. A copy line that says "no games for Benfica" is wrong whenever the season bound is what emptied the result, which is most of the time. Assert on the copy string so a future edit cannot regress it into a single-dimension claim.

  *"does not mention the season range otherwise"* matters because the copy must not imply the season filter covers the partial 2026 season, per Global Constraints.

- [ ] **Step 3.2: Run it and confirm red.**

  ```bash
  cd frontend && npx vitest run src/components/FilterEmptyState.test.tsx
  ```

- [ ] **Step 3.3: Implement.**

  ```tsx
  export default function FilterEmptyState({ filters, onClearAll, onOpenFilters, invertedSeasonRange }: Props) {
    return (
      <div role="status" aria-live="polite" className="...">
        <h2>No games match these filters</h2>
        <p>
          {invertedSeasonRange
            ? 'Your season range starts after it ends, so nothing can match.'
            : 'None of the games in the dataset match this combination.'}
        </p>
        <p className="text-sm text-gray-500">
          Season filtering covers completed seasons only.
        </p>
        <button onClick={onClearAll}>Clear all filters</button>
        <button onClick={onOpenFilters}>Adjust filters</button>
      </div>
    );
  }
  ```

  The "Season filtering covers completed seasons only" line is required, not decoration. Without it, a user who selects a range ending in 2025 and knows there are 2026 games on the site concludes the filter is broken.

  The two actions are deliberately different: **Clear all** is the fast escape, **Adjust filters** reopens the panel with the current selection intact. Offering only the first loses the user's selection; offering only the second makes the common case slow.

- [ ] **Step 3.4: Verify green and commit.**

  ```bash
  cd frontend && npx vitest run src/components/FilterEmptyState.test.tsx
  git add frontend/src/components/FilterEmptyState.tsx frontend/src/components/FilterEmptyState.test.tsx
  git commit -m "feat: add the filter empty state with an escape hatch"
  ```

---

### Task 4: Wire both controls into the panel

**Files:**
- Modify: `frontend/src/components/FilterPanel.tsx`
- Modify: `frontend/src/components/FilterPanel.test.tsx`

**Interfaces:**
- Consumes: Task 2 and Task 3 components, `toCompetitionOptions`, `normaliseSeasonRange`.
- Produces: the completed panel.

**Steps:**

- [ ] **Step 4.1: Write the failing tests.**

  Add to `frontend/src/components/FilterPanel.test.tsx`:

  ```tsx
  it('renders all four dimensions when open', ...);
  it('renders Club sections for Team and National teams for Opponent only', ...);
  it('does not group the competition list', ...);
  it('renders the season bounds with the current applied values', ...);
  it('does not call onApply when a competition is toggled', ...);
  it('does not call onApply when a season bound is edited', ...);
  it('applies competition and season changes together on one Apply', ...);
  it('clears only the season dimension from a per-dimension clear', ...);
  it('clears only competitions from a per-dimension clear', ...);
  it('counts four active dimensions on the toggle when all are set', ...);
  it('updates the toggle count after an apply', ...);
  it('keeps the previous dimensions when one is cleared', ...);
  ```

  The three "does not call onApply" tests are the v1.1.3 R5 contract extended to the new dimensions, and they are the ones most likely to be violated by a copy-paste of the competition handler. The "clears only the season dimension" pair is the check that a per-dimension clear resets two fields and not the whole draft.

- [ ] **Step 4.2: Run and confirm red.**

  ```bash
  cd frontend && npx vitest run src/components/FilterPanel.test.tsx
  ```

- [ ] **Step 4.3: Implement.**

  In `FilterPanel`:
  - add `draft.competitionIds` and the two season bounds to the draft handlers, using `toggleCompetition` and `normaliseSeasonRange`;
  - render `CompetitionMultiSelect` and `SeasonRange` after the two club lists;
  - add a per-dimension clear row (an `×` button per active dimension) beside each section. Each clears **only its own dimension** and must never call `onApply` — it is a draft edit like any other;
  - extend the active-dimension count to all four.

  Pass `options.competitions` and `options.seasons` straight down. Do not reshape them into a club-like shape; the two dimensions have genuinely different option types and forcing them into one would be the abstraction this patch exists to avoid.

- [ ] **Step 4.4: Verify green and commit.**

  ```bash
  cd frontend && npx vitest run src/components/FilterPanel.test.tsx
  git add frontend/src/components/FilterPanel.tsx frontend/src/components/FilterPanel.test.tsx
  git commit -m "feat: add competition and season dimensions to the filter panel"
  ```

---

### Task 5: Mount the empty state on the page

**Files:**
- Modify: `frontend/app/missing-eleven/page.tsx`
- Modify: `frontend/app/missing-eleven/page.test.tsx`

**Interfaces:**
- Consumes: `FilterEmptyState` (Task 3), `useFilterOptions` (v1.1.2).
- Produces: the board / empty-state switch on the page.

**Steps:**

- [ ] **Step 5.1: Write the failing page tests.**

  ```tsx
  it('shows the empty state when total is 0 and a filter is active', ...);
  it('does not show the empty state when total is 0 and no filter is active', ...);
  it('shows the error state, not the empty state, when the request throws', ...);
  it('shows the error state when optionsError is set', ...);
  it('does not flash the empty state while options are loading', ...);
  it('hides the game board while the empty state is shown', ...);
  it('restores the board after Clear all', ...);
  it('restores the board after adjusting the filters', ...);
  it('explains an inverted season range in the URL', ...);
  it('does not show the empty state while a match is still on screen', ...);   // total>0 but board visible
  ```

  The sixth test is the subtle one. During the transition after Apply, the old match is still rendered while the new options are in flight. Showing the empty state over a perfectly good board would be a visible flash on every filter change. The empty state must require `total === 0 && !optionsLoading && hasActiveFilters`.

  The ninth test pins that the two signals are not redundant: a match can be on screen while `total` is recomputed for a *different* filter set mid-flight, and the board must win until the empty state is actually confirmed.

- [ ] **Step 5.2: Run and confirm red.**

  ```bash
  cd frontend && npx vitest run app/missing-eleven/page.test.tsx
  ```

- [ ] **Step 5.3: Implement the switch.**

  ```tsx
  const showEmptyState =
    filterOptions !== null &&
    !optionsLoading &&
    filterOptions.total === 0 &&
    hasActiveFilters(filters);
  ```

  Then in the JSX, render `showEmptyState ? <FilterEmptyState … /> : <existing board … />`.

  The inverted-range flag is derived once, at the page level, from `filters.seasonFrom > filters.seasonTo` and passed down. Deriving it inside `FilterEmptyState` as well would be duplicated logic that can drift; the component takes it as a prop for exactly that reason.

  `onClearAll` is `() => setFilters(EMPTY_FILTERS)` and `onOpenFilters` is `() => setFiltersOpen(true)`. Both reuse existing wiring — no new state.

  **Do not change the error path.** A thrown request still renders the existing error state, and the two must never share a branch. That is the whole point of the `total`-based signal.

- [ ] **Step 5.4: Verify green, then run everything.**

  ```bash
  cd frontend && npx vitest run app/missing-eleven/ src/components/ src/lib/
  cd frontend && npm run test
  ```

- [ ] **Step 5.5: Commit.**

  ```bash
  git add frontend/app/missing-eleven/page.tsx frontend/app/missing-eleven/page.test.tsx
  git commit -m "feat: render the filter empty state instead of an error"
  ```

---

### Task 6: Validate the v1.1 line end to end

**Files:**
- Create: `docs/v1/v1.1/CHANGELOG-v1.1.4.md`
- Modify: `docs/v1/v1.1/overview.md` (mark the line complete)

**Interfaces:**
- Consumes: everything above.
- Produces: the v1.1 close-out changelog.

**Steps:**

- [ ] **Step 6.1: Run the full frontend suite with coverage and a production build.**

  ```bash
  cd frontend && npm run test:coverage
  cd frontend && npm run build
  ```

- [ ] **Step 6.2: Live-smoke all four dimensions.**

  ```bash
  curl -s 'http://localhost:3000/api/matches/filter-options'
  ```

  In the browser:
  1. apply a Team, a Competition, and a season range together; confirm all four counts are plausible and the match respects all three;
  2. confirm the competition list does **not** collapse to `0` for a selected competition (R5 on the new dimension);
  3. drag `seasonFrom` above `seasonTo`; confirm the `to` box follows and no inverted range is ever rendered;
  4. hand-edit the URL to `?seasonFrom=2024&seasonTo=2020`; confirm the empty state appears **and** specifically explains the inverted range;
  5. hand-edit to `?seasonFrom=1999`; confirm it is treated as no lower bound and the page loads normally;
  6. set a range ending in 2025; confirm the copy says season filtering covers completed seasons only, and that no 2026 option appears anywhere;
  7. construct a filter combination with no games; confirm the empty state, not an error, and that both **Clear all** and **Adjust filters** work;
  8. stop the backend and repeat; confirm the **error** state appears, not the empty state.

  Step 8 is the one that proves the two states are genuinely distinct. Skipping it means the patch has shipped a UI that blames the user's filter for a server outage.

- [ ] **Step 6.3: Confirm no backend or schema drift.**

  ```bash
  git diff --stat v1.1.1..HEAD -- backend/ backend/prisma/
  ```

  Expected: empty. This patch consumes the v1.1.1 wire format unchanged.

- [ ] **Step 6.4: Write the changelog, update the overview, and commit.**

  ```bash
  git add docs/v1/v1.1/CHANGELOG-v1.1.4.md docs/v1/v1.1/overview.md
  git commit -m "docs: close out the v1.1 filter line"
  ```

## Acceptance criteria

1. This patch renders **Competition, Season, and the empty state**. It does not change the Team/Opponent behaviour frozen in v1.1.3; the v1.1.3 suites stay green untouched.
2. The empty state is keyed on `filterOptions.total === 0`, **not** on the match request failing. A successful response whose `total` is zero shows the empty state; an empty state reached because of an error is a defect.
3. A 404 or a network failure still renders the **error** state, not the empty state. The two are distinguished by the request outcome, and the tests cover both.
4. `total` counts games that pass the **completeness predicate**, so a zero here means "no complete game matches", never "no game exists at all".
5. The empty state is **escapable**: a clear-filters action returns the user to an unfiltered list without a page reload.
6. Season options stop at **2025**; the data runs to 2026-06-28 and 2026 is partial. No `null` season option is offered, and season is never treated as equivalent to a date.
7. Season is a **range**, not two independent filters: `seasonFrom` and `seasonTo` are one control (`SeasonRange`) and one serialized pair.
8. `seasonFrom > seasonTo` yields zero results and is **explained** in the empty state. It is never silently normalised or swapped, because swapping would show games the user did not ask for.
9. `paramsToFilters` clamps an out-of-range bound to `null` **per dimension**, so one bad bound does not discard the other filters.
10. Competition and Season obey the same R5 facet exclusion as the club dimensions: selecting one does not collapse its own list to zeros.
11. Draft-then-apply continues to hold for both new controls, exactly as in v1.1.3 — no dimension writes on toggle.
12. New components live in `frontend/src/components/`, not `frontend/components/`.
13. Accessibility holds for both new controls and for the empty state's actions: labelled inputs, `aria-expanded`/`aria-controls` on each trigger, and keyboard-reachable clear/apply actions.
14. `FilterEmptyState` is presentational — it renders what it is given and calls back; it does not fetch or read filter state.
15. No backend, schema, or API change in this patch, and no new dependencies.
16. `npm run test`, `npm run build`, `npx tsc --noEmit`, and `npm run lint` are all clean, and every new suite is collected. No suite is asserted against a fixed count — it is measured and recorded, per `docs/v1/v1.2/overview.md:209`.

## Validation

| Check | Command | Pass signal |
|---|---|---|
| Frontend suite | `cd frontend && npm run test` | every file green; count measured and recorded, not asserted |
| The new controls and the empty state | `cd frontend && npx vitest run src/components/CompetitionMultiSelect.test.tsx src/components/SeasonRange.test.tsx src/components/FilterEmptyState.test.tsx src/lib/competitionFilters.test.ts` | every case green |
| The panel wiring | `cd frontend && npx vitest run src/components/FilterPanel.test.tsx` | both controls present and obeying draft-then-apply |
| The page mount | `cd frontend && npx vitest run app/missing-eleven/page.test.tsx` | empty state appears on `total === 0` and the error state still appears on failure |
| Production build | `cd frontend && npm run build` | no output |
| Types | `cd frontend && npx tsc --noEmit` | no output |
| Lint | `cd frontend && npm run lint` | no output |
| No 2026 or null season option is offered | `grep -rn "2026" frontend/src/lib/competitionFilters.ts frontend/src/components/SeasonRange.tsx` | no output |
| The range is one control | `grep -rn "seasonFrom" frontend/src/components/SeasonRange.tsx` | both bounds handled in the one component |
| The v1.1.3 suites are untouched | `cd frontend && npx vitest run src/components/ClubMultiSelect.test.tsx src/components/FilterPanel.test.tsx` | still green |
| No backend drift | `git diff --stat -- backend/` | empty — this patch is frontend-only |
| The include was not re-narrowed (R7) | `grep -n "include:" frontend/vitest.config.ts` | unchanged from v1.1.1 |

## Risks

| Risk | Mitigation |
|---|---|
| **The empty state is shown for the wrong reason** — a network failure or 404 renders "no games match" when the truth is that the app cannot reach the backend. | The empty state is keyed on a successful response with `total === 0` (criteria 2–3), and both branches are asserted in `page.test.tsx`. Keying on request failure would be the defect. |
| **An inverted season range is silently normalised**, so `seasonFrom > seasonTo` shows games the user did not ask for instead of explaining the problem. | Zero results plus an explanation is the required behaviour (criterion 8); the swap-and-render approach is ruled out explicitly because it answers a different question than the one asked. |
| **A partial 2026 season is offered as a filter**, so users select a competition-year that appears empty. | The bound is frozen at 2025 in the constraints, the option list is asserted against it, and the grep gate makes a stray `2026` visible in the two files that could introduce it. |
| **One bad bound discards the whole filter set**, so a single malformed `seasonFrom` silently clears Team and Opponent too. | Clamping is **per dimension** (criterion 9), asserted by a test that supplies one out-of-range bound alongside valid club selections. |
| **A facet collapses to zeros** for competition or season, making an applied filter impossible to widen. | R5 applies to the new dimensions exactly as it does to the club dimensions (criterion 10), and the panel test covers both new controls. |
| **The panel's behaviour for Team/Opponent regresses** while the new controls are wired in. | v1.1.3 is frozen and its suites are re-run as a gate (criterion 1); a change to `ClubMultiSelect` is out of scope for this patch. |
| **The empty state becomes a dead end** on a filter combination the user cannot easily unpick. | Escapability is a criterion, not an enhancement (criterion 5), asserted through the clear action rather than inferred from markup. |

**Escalate before proceeding if:** the `total` v1.1.1 returns cannot be distinguished from a failed request at the point the page decides which state to render — for example if a partial response omits `total`. That would mean the empty state has no sound key, and the fix belongs upstream in v1.1.1's response contract rather than in a client-side guess here.
