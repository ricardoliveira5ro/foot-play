# Filter URL State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The URL becomes the single source of truth for the active filter set. On load, a hand-typed or shared filter URL produces exactly that filter set; when the applied filter set changes, the URL is rewritten, a new match is fetched under the new filters, and the filter options are re-read so their counts describe the newly applied set. **This patch still renders no filter control** — v1.1.1 and v1.1.2 together build the entire state, fetch, and URL contract that v1.1.3 and v1.1.4 only render.

**Architecture:** Three additions. `GameState` gains a `filters` field and a `SET_FILTERS` action whose reducer branch is a structural no-op when the incoming filters equal the current ones — that single property is what breaks the URL↔state echo loop. A `'use client'` `FilterUrlSync` component sits below a `<Suspense>` boundary and is the **only** place in the app that calls `useSearchParams`, which is what keeps the production build green under Next 16's `missing-suspense-with-csr-bailout` rule. A `useFilterOptions` hook owns the filter-options fetch, including the stale-response guard, so v1.1.3 renders a prop instead of owning request logic.

**Tech Stack:** TypeScript, Next 16 App Router (`useSearchParams`, `useRouter`, `usePathname`, `Suspense`), React 19, Vitest + jsdom + Testing Library + `renderHook`.

---

## Global Constraints

- **This patch renders zero filter UI.** The page's appearance must be byte-identical before and after this patch. If a checkbox appears, the task is not done.
- **`useSearchParams()` is called in exactly one file.** `FilterUrlSync` and nothing else. This is both the Suspense fix and a testability boundary: a component that is the sole reader of the URL is trivial to unit-test, and every other component stays a pure function of props and state.
- **Next 16 `missing-suspense-with-csr-bailout` is a build failure, not a runtime warning.** `frontend/app/missing-eleven/page.tsx:1` is `'use client'` and is statically rendered. A Client Component that calls `useSearchParams()` without a `<Suspense>` parent makes `next build` fail outright with *"Entire page /missing-eleven deopted into client-side rendering"*. The `<Suspense>` boundary is mandatory, and `npm run build` is a required gate in Task 5 — not optional polish.
- **The `useSearchParams()` result is assignable to the frozen `paramsToFilters(params: URLSearchParams)` signature, and this is deliberate.** In Next 16 the hook returns `ReadonlyURLSearchParams`, declared as `class ReadonlyURLSearchParams extends URLSearchParams` with only `set`/`append`/`delete`/`sort` narrowed away. Structural assignability therefore holds, and the frozen signature needs no widening. Add a one-line comment recording this, because the next reader will assume it needs a cast and will add one.
- **Writes must not start before the read completes.** The page's URL-write effect must be inert until `FilterUrlSync` has dispatched the initial filters. Without that gate, on first render `state.filters` is still `EMPTY_FILTERS` while the URL already carries `?teamIds=7`, and the write effect strips the user's own filters out of the address bar before the read effect can dispatch them. This is a real ordering bug, not a theoretical one, and Step 3.3's test exists to pin it.
- **The canonical filter string is the single key for both the URL and the fetches.** Use `filtersToParams(filters).toString()` as the effect dependency. It is already canonical (deduped, order-preserving, unfiltered dimensions omitted), so one string drives the query string, the match request, and the options request. Introducing a second serialisation — a `JSON.stringify`, or an array of ids in the deps — is how the URL and the request drift apart.
- **`router.replace`, not `router.push`.** A filter change must not add a history entry; the Back button should leave the page, not walk backwards through every checkbox the user ticked. Pass `{ scroll: false }` so the page does not jump to the top on every change. Both options are documented in the installed Next 16 `use-router` reference.
- **Unrelated query params must survive.** v1.3 adds `?daily=` to this same page, and `daily` mode is orthogonal to filtering. `filtersToParams` returns **only** the five filter keys, so building the href from it alone would silently delete `?daily=` and any future param. The page therefore starts from the live `searchParams`, deletes the five known filter keys, and merges the new values in. `FILTER_PARAM_KEYS` is exported for exactly this and is an **additive** export, not a rename.
- **Never pass an unvalidated string to `router.replace`.** The installed Next 16 `use-router` reference warns about this directly. Every value placed in the query string is produced by `filtersToParams` from a `GameFilterParams` that has already passed through `paramsToFilters` — parsed, deduped, range-clamped, and re-encoded via `URLSearchParams`. Do not hand-build a query string with template literals anywhere in this patch; if you need a value that is not in `GameFilterParams`, it does not belong in the URL yet.
- **The reducer never fetches.** `SET_FILTERS` is a pure state transition. Fetching from inside a reducer is a side effect during render and is a defect. All requests are owned by the page's effects.
- **Every one of the three existing `fetchRandomMatch()` call sites must be updated.** `frontend/app/missing-eleven/page.tsx:91` (mount), `:183` (`handlePlayAgain`), and `:198` (`handleRetry`) each become filter-aware. Missing the latter two produces the most annoying possible bug: filters look applied, then silently reset the moment the player asks for another game. Step 3.4's test asserts all three.
- **`fetchRandomMatch` now returns `GameResponse | null`.** v1.1.1 changed the return type so that "no match for this filter set" is a value rather than an exception. Every call site must handle `null` distinctly from a thrown error, because v1.1.4 renders the two states completely differently. Collapsing them into one `catch` is the defect this constraint exists to prevent.
- **Stale responses must be discarded.** A user changing filters faster than the network can answer will have several match requests in flight. Only the newest may write state. Use a monotonic sequence ref, matching the pattern already used at `frontend/app/missing-eleven/page.tsx:129-131` for the revealed-name fetch. An `AbortController` is the better tool if `requestJson` in `frontend/lib/api.ts` is extended to accept a `signal`; if it is not, the sequence ref is correct and sufficient.
- **No new dependencies, and no Prisma or backend changes in this patch.** Backend work landed in v1.1.1.
- **TDD mode: advisory_active.** Test first for all testable logic; red → green → refactor; report the commands and results.
- **Frontend coverage** is measured over `src/**` only (`frontend/vitest.config.ts` `coverage.include`). Every new module under `src/` needs a test, or it dilutes the numbers.

---

### Task 1: Add `filters` to the game state

**Files:**
- Modify: `frontend/src/lib/gameState.ts` (`GameState`, `GameAction`, `initialState`, `gameReducer`, `useGameState`, `UseGameStateReturn`)
- Modify: `frontend/src/lib/gameState.test.ts`
- Create: `frontend/src/lib/filtersEqual.ts`
- Create: `frontend/src/lib/filtersEqual.test.ts`

**Interfaces:**
- Consumes: `EMPTY_FILTERS` and `GameFilterParams` from v1.1.1 Task 8.
- Produces:
  - `GameState.filters: GameFilterParams`, initialised to `EMPTY_FILTERS`.
  - `GameAction` gains `| { type: 'SET_FILTERS'; payload: GameFilterParams }`.
  - `export function filtersEqual(a: GameFilterParams, b: GameFilterParams): boolean` — a pure structural comparison, order-insensitive on the three id lists and strict on the two season bounds.
  - `useGameState()` additionally returns `filters` and `setFilters`.

**Steps:**

- [ ] **Step 1.1: Write the failing `filtersEqual` test.**

  Create `frontend/src/lib/filtersEqual.test.ts`. Pure, node environment, no DOM:

  ```ts
  it('is true for two EMPTY_FILTERS', ...);
  it('is true for identical filters', ...);
  it('is false when any single dimension differs', ...);            // it.each over the 5 dims
  it('ignores id order: [1,2] equals [2,1]', ...);
  it('does not mutate its arguments', ...);
  it('distinguishes null from an empty array', ...);                 // [] !== null
  it('distinguishes seasonFrom 2019 from seasonTo 2019', ...);
  ```

  The order-insensitivity and null-vs-empty cases are the two that matter. Without order-insensitivity the echo loop in Task 3 re-fires on every navigation, and without the null/empty distinction `?teamIds=` (which parses to `null`) would be treated as a change on every render.

- [ ] **Step 1.2: Run it and confirm red.**

  ```bash
  cd frontend && npx vitest run src/lib/filtersEqual.test.ts 2>&1 | tail -20
  ```

- [ ] **Step 1.3: Implement `filtersEqual`.**

  ```ts
  import type { GameFilterParams } from '@/types';

  const sameIds = (a: number[] | null, b: number[] | null): boolean => {
    if (a === null || b === null) return a === b;
    if (a.length !== b.length) return false;
    const sa = [...a].sort((x, y) => x - y);
    const sb = [...b].sort((x, y) => x - y);
    return sa.every((v, i) => v === sb[i]);
  };

  const sameStrings = (a: string[] | null, b: string[] | null): boolean => { /* same shape */ };

  export function filtersEqual(a: GameFilterParams, b: GameFilterParams): boolean {
    return sameIds(a.teamIds, b.teamIds)
      && sameIds(a.opponentIds, b.opponentIds)
      && sameStrings(a.competitionIds, b.competitionIds)
      && a.seasonFrom === b.seasonFrom
      && a.seasonTo === b.seasonTo;
  }
  ```

  Sorting copies rather than sorting in place, and the test above pins that. `idList` equality is genuinely value-based, not reference-based: `paramsToFilters` builds a fresh array on every call, so reference comparison would make every dispatch a "change".

- [ ] **Step 1.4: Write the failing reducer tests.**

  In `frontend/src/lib/gameState.test.ts`, add:

  ```ts
  describe('SET_FILTERS', () => {
    it('sets filters on an idle state', ...);
    it('is a no-op when the filters are structurally equal', ...);   // returns the SAME object reference
    it('is a no-op for EMPTY_FILTERS on an empty state', ...);
    it('does not reset the current match, shirts or score', ...);
    it('does not change gameStatus', ...);
    it('applies a genuine change', ...);
  });

  it('initialises filters to EMPTY_FILTERS', ...);
  ```

  The third case in the first block is the important one: a filter change **must not** discard a game already in progress. v1.1.2's page effect deliberately fetches a new match when filters change, but the reducer's job is only to record the filters; the page then decides what to do with the existing game. If the reducer cleared the match, a mid-game filter change would destroy the board.

  The no-op case must assert **reference** equality of the returned state object, not just value equality of the fields. The whole point of the branch is to let the page skip work, and reference stability is what makes that skip possible.

- [ ] **Step 1.5: Run and confirm red.**

  ```bash
  cd frontend && npx vitest run src/lib/gameState.test.ts 2>&1 | tail -20
  ```

- [ ] **Step 1.6: Implement the state change.**

  In `frontend/src/lib/gameState.ts`:
  - add `filters: GameFilterParams;` to `GameState` with a doc comment: *"The applied filter set. Owned by the URL via `FilterUrlSync`; never mutated in place."*
  - add `filters: EMPTY_FILTERS` to `initialState`.
  - add the action to the `GameAction` union.
  - add the reducer branch, **first** in the switch so its no-op is obvious:
    ```ts
    case 'SET_FILTERS': {
      if (filtersEqual(state.filters, action.payload)) return state;
      return { ...state, filters: action.payload };
    }
    ```
  - add `filters: state.filters` and `setFilters` to `UseGameStateReturn` and the hook's return, with `setFilters` wrapped in `useCallback` and a stable identity — the page's effects key on it, and an unstable identity re-runs them every render.

  Do **not** add a `CLEAR_FILTERS` action. `SET_FILTERS` with `EMPTY_FILTERS` already covers it, and two actions for one transition is how the two drift apart.

- [ ] **Step 1.7: Verify green, and that the existing state suite is unaffected.**

  ```bash
  cd frontend && npx vitest run src/lib/gameState.test.ts src/lib/filtersEqual.test.ts 2>&1 | tail -25
  ```

  Every pre-existing `gameState.test.ts` case must still pass unchanged. The new state field must be inert for callers that do not use it.

- [ ] **Step 1.8: Commit.**

  ```bash
  git add frontend/src/lib/gameState.ts frontend/src/lib/gameState.test.ts frontend/src/lib/filtersEqual.ts frontend/src/lib/filtersEqual.test.ts
  git commit -m "feat: add filter state and SET_FILTERS to the game reducer"
  ```

---

### Task 2: Add the `useFilterOptions` hook

**Files:**
- Create: `frontend/src/lib/useFilterOptions.ts`
- Create: `frontend/src/lib/useFilterOptions.hook.test.ts`

**Interfaces:**
- Consumes: `fetchFilterOptions` and `GameFilterParams` from v1.1.1, `filtersEqual` from Task 1.
- Produces:
  ```ts
  export interface UseFilterOptionsReturn {
    options: FilterOptionsResponse | null;
    loading: boolean;
    error: string | null;
    reload: () => void;
  }
  export function useFilterOptions(filters: GameFilterParams): UseFilterOptionsReturn
  ```
  The hook fetches once per **applied** filter set. It must not refetch while the user is mid-edit, because v1.1.3 keeps a draft selection separate from the applied one.

**Steps:**

- [ ] **Step 2.1: Read the existing hook-test pattern.**

  ```bash
  cd frontend && sed -n '1,40p' src/lib/gameState.hook.test.ts
  ```

  Note the `// @vitest-environment jsdom` first line and the `renderHook` usage. Reuse both exactly; do not add a new testing style.

- [ ] **Step 2.2: Write the failing test.**

  ```tsx
  // @vitest-environment jsdom
  import { renderHook, waitFor, act } from '@testing-library/react';
  import { useFilterOptions } from './useFilterOptions';
  import { fetchFilterOptions } from '@/lib/api';

  vi.mock('@/lib/api', () => ({ fetchFilterOptions: vi.fn() }));

  it('fetches once on mount with the given filters', ...);
  it('does not refetch when the filters are structurally equal', ...);   // rerender with a new object, same values
  it('refetches when a filter genuinely changes', ...);
  it('exposes loading true while in flight and false after', ...);
  it('ignores a stale response that resolves after a newer request', ...); // the race guard
  it('exposes an error without clearing previously loaded options', ...);
  it('leaves options null before the first response', ...);
  it('does not convert a thrown error into empty counts', ...);            // R1: a wrong count is worse than none
  ```

  The stale-response test is the one that earns the hook its existence. Resolve the **second** request first, then the first, and assert the state reflects the second. Implement it with deferred promises you resolve by hand, not `setTimeout` — a timer-based race test is flaky and will fail on a loaded CI box for reasons unrelated to the code.

  The last test is R1 expressed in the client: if `fetchFilterOptions` rejects, the hook must surface `error` and leave `options` as it was. Defaulting to `{ teams: [], opponents: [], competitions: [], seasons: [], total: 0 }` would render "0 results" to the user, which is a **wrong count** — the exact failure R1 forbids.

- [ ] **Step 2.3: Run and confirm red.**

  ```bash
  cd frontend && npx vitest run src/lib/useFilterOptions.hook.test.ts 2>&1 | tail -20
  ```

- [ ] **Step 2.4: Implement the hook.**

  ```ts
  export function useFilterOptions(filters: GameFilterParams): UseFilterOptionsReturn {
    const [options, setOptions] = useState<FilterOptionsResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [nonce, setNonce] = useState(0);
    const seqRef = useRef(0);

    const key = filtersToParams(filters).toString();  // the canonical serialisation

    useEffect(() => {
      const seq = ++seqRef.current;
      let cancelled = false;
      setLoading(true);
      setError(null);
      fetchFilterOptions(filters)
        .then((next) => { if (seq === seqRef.current) setOptions(next); })
        .catch((cause: unknown) => {
          if (seq === seqRef.current) setError(describeError(cause));
        })
        .finally(() => { if (seq === seqRef.current) setLoading(false); });
      return () => { cancelled = true; };
    }, [key, nonce]);   // `key`, not `filters`: filtersEqual says equal-but-new objects must not refetch

    const reload = useCallback(() => setNonce((n) => n + 1), []);
    return { options, loading, error, reload };
  }
  ```

  Notes that matter:
  - The effect depends on `key` (a string) rather than on `filters` (an object). A fresh-but-equal object from `paramsToFilters` must not refetch, and a string key gives that for free. This is the hook-level counterpart of the reducer's no-op branch.
  - `filters` is still read inside the effect and therefore captured in the closure. Because the effect only re-runs when `key` changes, the captured `filters` is always the one `key` was derived from. Add a comment saying so, because the missing `filters` in the dependency array will otherwise look like a bug to `eslint react-hooks/exhaustive-deps` and to the next reader. If the repo's lint runs `exhaustive-deps` as an error, use the pattern the page already uses at `page.tsx:100-102` — a targeted `// eslint-disable-next-line react-hooks/exhaustive-deps` with the reason inline — rather than adding `filters` back and defeating the guard.
  - The `cancelled` flag is belt-and-braces alongside `seq`; `seq` alone is sufficient. Keep only `seq` and drop `cancelled` — two guards for one condition is one guard too many, and the coverage gate will flag the unreachable line.
  - `reload` exists for v1.1.3's "Apply" button if a manual refresh is ever needed; it costs one line and one `useState` now rather than a signature change later.

- [ ] **Step 2.5: Verify green, with coverage on the new file.**

  ```bash
  cd frontend && npx vitest run src/lib/useFilterOptions.hook.test.ts --coverage 2>&1 | tail -30
  ```

- [ ] **Step 2.6: Commit.**

  ```bash
  git add frontend/src/lib/useFilterOptions.ts frontend/src/lib/useFilterOptions.hook.test.ts
  git commit -m "feat: add the useFilterOptions hook with a stale-response guard"
  ```

---

### Task 3: Make the page filter-aware

**Files:**
- Create: `frontend/app/missing-eleven/FilterUrlSync.tsx`
- Create: `frontend/app/missing-eleven/FilterUrlSync.test.tsx`
- Create: `frontend/app/missing-eleven/page.test.tsx`
- Modify: `frontend/app/missing-eleven/page.tsx`

**Interfaces:**
- Consumes: `paramsToFilters`, `filtersToParams`, `EMPTY_FILTERS`, `GameFilterParams` (v1.1.1); `filtersEqual` (Task 1); `useFilterOptions` (Task 2); `fetchRandomMatch` (v1.1.1).
- Produces:
  ```tsx
  // app/missing-eleven/FilterUrlSync.tsx
  export default function FilterUrlSync(props: {
    applied: GameFilterParams;
    onFilters: (filters: GameFilterParams) => void;
  }): null;
  ```
  `FilterUrlSync` renders `null`, holds no state, and is the app's **only** caller of `useSearchParams`. It owns **both** directions of the URL: it reads the query string into `onFilters`, and it writes `applied` back to the query string. One owner, not two — a second reader or a second writer is exactly how the echo loop appears.
  Also: `export const FILTER_PARAM_KEYS: readonly string[]` in `frontend/src/lib/filterParams.ts` — **additive** export listing the five URL keys, for the merge logic.

**Steps:**

- [ ] **Step 3.1: Write the failing `FilterUrlSync` test.**

  ```tsx
  // @vitest-environment jsdom
  import { render, waitFor } from '@testing-library/react';
  import { useSearchParams } from 'next/navigation';

  vi.mock('next/navigation', () => ({ useSearchParams: vi.fn(), useRouter: vi.fn(), usePathname: vi.fn() }));

  it('parses the URL into filters and reports them once', ...);
  it('re-reports when the URL changes', ...);
  it('reports EMPTY_FILTERS for an empty query string', ...);
  it('does not write to the URL on the first pass', ...);          // the Task 3.3 ordering race
  it('writes applied filters to the URL once they are reported', ...);
  it('preserves an unrelated ?daily= param when writing', ...);
  it('removes a filter key entirely when its dimension is cleared', ...);
  it('calls router.replace, not router.push, with scroll disabled', ...);
  it('does not navigate when the URL is already canonical', ...);
  it('renders nothing', ...);
  ```

  The ordering test is the whole point of this file. *"does not write to the URL on the first pass"* observes the `ready` gate directly: with the hook mocked to return `?teamIds=7`, the first render must not call `router.replace` with an href that has dropped `teamIds`. If the gate is ever removed, that test fails — and no other test in the suite would notice, because the damage is a URL that briefly loses the user's filters before settling.

  For *"re-reports when the URL changes"*, make `useSearchParams` return a new `URLSearchParams` and rerender. Key the effect on `searchParams.toString()`, not on the `searchParams` object — the object identity changes on every navigation even when the query is identical, and keying on it would re-dispatch on every unrelated route change.

- [ ] **Step 3.2: Run and confirm red.**

  ```bash
  cd frontend && npx vitest run app/missing-eleven/FilterUrlSync.test.tsx 2>&1 | tail -20
  ```

  Note the path: this test lives under `app/`, and **Task 1 of v1.1.1 is what makes `app/**` collectable** — the frozen include it produces enumerates four roots, and the fourth is `'app/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'` (`docs/v1/v1.1/plan-v1.1.1-filter-foundation.md:52`). Neither `src/**` nor `tests/**` matches `app/**`, so without that fourth entry this file is never run and the suite still reports green. Before writing, confirm the entry is actually present:

  ```bash
  grep -n "app/\*\*" frontend/vitest.config.ts
  ```

  One hit, and it is an `include` entry. If it is missing, **stop and report** — v1.1.1 owns the include list and is the blocker, not this patch. Do **not** add the entry here, and do **not** move tests out of `app/` to make an existing glob match: colocated tests are where a maintainer will look for them, and a second patch editing the include is how the list silently diverges.

- [ ] **Step 3.3: Implement `FilterUrlSync`.**

  One component, one reader, one writer, two effects, and one internal `ready` ref that sequences them:

  ```tsx
  'use client';
  import { useEffect, useRef } from 'react';
  import { usePathname, useRouter, useSearchParams } from 'next/navigation';
  import { filtersToParams, paramsToFilters, FILTER_PARAM_KEYS } from '@/types';
  import type { GameFilterParams } from '@/types';

  export default function FilterUrlSync({ applied, onFilters }: Props) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    // ReadonlyURLSearchParams extends URLSearchParams, so this is structurally
    // sound and needs no cast. Do not add one.
    const key = searchParams.toString();
    const readyRef = useRef(false);

    // 1. read: report the URL's filters, then unlock writes
    useEffect(() => {
      onFilters(paramsToFilters(new URLSearchParams(key)));
      readyRef.current = true;
    }, [key, onFilters]);

    // 2. write: reflect the applied filters, merging over the live query
    useEffect(() => {
      if (!readyRef.current) return;              // never write before the first read
      const next = new URLSearchParams(key);
      for (const k of FILTER_PARAM_KEYS) next.delete(k);
      for (const [k, v] of filtersToParams(applied)) next.set(k, v);
      const href = next.size ? `${pathname}?${next}` : pathname;
      if (href === (key ? `${pathname}?${key}` : pathname)) return;   // already canonical
      router.replace(href, { scroll: false });
    }, [applied, key, router, pathname]);

    return null;
  }
  ```

  Four properties this shape guarantees, each with a test in Step 3.1:
  1. `readyRef` gates the write, so a hand-typed `?teamIds=7` is read before anything can remove it;
  2. the href-equality early return makes the write idempotent, so canonical-URL normalisation happens at most once and can never loop;
  3. `router.replace` keeps the Back button meaningful and `{ scroll: false }` stops the page jumping;
  4. `FILTER_PARAM_KEYS` is deleted before the merge, so clearing a dimension removes its key instead of leaving `?teamIds=` behind — and `?daily=` survives, because it was never in the delete list.

  Effects run in declaration order, so the read effect sets `readyRef` before the write effect of the same commit evaluates it. That ordering is load-bearing and is why the read effect is written first; do not hoist it.

  `onFilters` must be a stable `useCallback` identity from the page, or the read effect re-runs every render and re-dispatches forever.

- [ ] **Step 3.4: Write the failing page test.**

  ```tsx
  // @vitest-environment jsdom
  it('loads a match for the filters in the URL on mount', ...);
  it('fetches a new match when the applied filters change', ...);
  it('does not fetch again when an equal filter object is dispatched', ...);
  it('rewrites the URL when the applied filters change', ...);
  it('does NOT strip a deep-linked filter from the URL on load', ...);   // the readyRef gate
  it('preserves an unrelated ?daily= param when rewriting', ...);
  it('omits the filter params entirely when all filters are cleared', ...);
  it('does not push a new history entry when filters change', ...);         // router.replace
  it('passes the current filters to the match fetch on Play again', ...);
  it('passes the current filters to the match fetch on Retry', ...);
  it('renders the empty state slot when fetchRandomMatch resolves null', ...);
  it('renders an error when fetchRandomMatch throws', ...);
  ```

  Three of these are the patch's real regression guards:
  - *"does NOT rewrite the URL before the initial filters are read"* is the ordering bug described in Global Constraints;
  - *"preserves an unrelated `?daily=`"* is the v1.3 forward-compatibility requirement, tested a patch early so it cannot regress;
  - the two *"passes the current filters … on Play again / Retry"* cases cover the call sites at `page.tsx:183` and `:198`, which are exactly the two that are easy to forget.

  Mock `next/navigation` (`useSearchParams`, `useRouter`, `usePathname`) and `@/lib/api` at the top of the file. `vi.mock` is already the pattern in `frontend/src/lib/useFilterOptions.hook.test.ts`.

- [ ] **Step 3.5: Run and confirm red.**

  ```bash
  cd frontend && npx vitest run app/missing-eleven/page.test.tsx 2>&1 | tail -25
  ```

- [ ] **Step 3.6: Wire the page.**

  In `frontend/app/missing-eleven/page.tsx`, four changes and nothing else:

  **(a) Destructure the new hook values** alongside the existing `useGameState()` result: `filters`, `setFilters`. Add `const { options: filterOptions, loading: optionsLoading, error: optionsError } = useFilterOptions(filters);` — declare it even though nothing renders `filterOptions` yet, and mark it `// consumed by v1.1.3` so it is obviously not dead code. Run it now so the request lifecycle is exercised and tested in this patch rather than when a component starts depending on it.

  **(b) Add the `Suspense` boundary and the bridge.**

  ```tsx
  import { Suspense } from 'react';
  import FilterUrlSync from './FilterUrlSync';

  const handleFilters = useCallback((next: GameFilterParams) => setFilters(next), [setFilters]);

  // ... in the returned JSX, near the top of the page body:
  <Suspense fallback={null}>
    <FilterUrlSync applied={filters} onFilters={handleFilters} />
  </Suspense>
  ```

  `fallback={null}` is correct here: the bridge renders nothing, so any visible fallback would be a flash of layout. **This `<Suspense>` is the fix for the `missing-suspense-with-csr-bailout` build failure and must not be removed.** Add the build-error text to a comment so nobody "simplifies" it away after seeing one successful build.

  The page itself must **not** call `useSearchParams` — it would be a second reader, and it is unnecessary now that `FilterUrlSync` owns the write. The `urlReady` state described in the earlier draft of this step does not exist; the gate is the internal `readyRef` inside `FilterUrlSync`.

  **(c) Nothing else moves the URL.**

  The only URL write in the app is the second effect in `FilterUrlSync`. Do not add a `router.replace` in the page, and do not add one in the reducer or in a hook. Two writers is the echo loop.

  **(d) Update all three `fetchRandomMatch` call sites.**

  `:91` (mount), `:183` (`handlePlayAgain`), `:198` (`handleRetry`) each become `fetchRandomMatch(filters)` and each handles the `null` return. For this patch, `null` may render nothing and set a neutral message; v1.1.4 replaces that with the real empty state. Leaving `null` to fall into the existing `.catch` is a defect, because the existing `.catch` sets a generic "Something went wrong" error, which would tell the user their network failed when in fact their filter combination simply has no games.

  The mount effect currently has an empty dependency array with an `eslint-disable` for `exhaustive-deps` and the comment `// Only run once on mount`. **That assumption is now false** — a deep link must fetch the URL's filters. Replace it with an effect keyed on the canonical filter key plus a "has the first load happened" ref, so the mount load happens once and a later filter change triggers a refetch through the same path rather than through a duplicated one.

- [ ] **Step 3.7: Verify green, then run the whole suite.**

  ```bash
  cd frontend && npx vitest run app/missing-eleven/ 2>&1 | tail -30
  cd frontend && npm run test 2>&1 | tail -30
  ```

  Every pre-existing test must still pass. This patch changes the mount fetch, so a regression here shows up as a pre-existing failure — do not "fix" it by relaxing the old test.

- [ ] **Step 3.8: Commit.**

  ```bash
  git add frontend/app/missing-eleven/FilterUrlSync.tsx frontend/app/missing-eleven/FilterUrlSync.test.tsx frontend/app/missing-eleven/page.test.tsx frontend/app/missing-eleven/page.tsx frontend/src/lib/filterParams.ts frontend/vitest.config.ts
  git commit -m "feat: drive the filter set from the URL on the missing-eleven page"
  ```

---

### Task 4: Add `FILTER_PARAM_KEYS` and its guard test

**Files:**
- Modify: `frontend/src/lib/filterParams.ts`
- Modify: `frontend/src/lib/filters.test.ts`

**Interfaces:**
- Consumes: the five filter keys used by `paramsToFilters` and `filtersToParams`.
- Produces: `export const FILTER_PARAM_KEYS: readonly string[]` — **additive**.

**Steps:**

- [ ] **Step 4.1: Write the failing test first.**

  In `frontend/src/lib/filters.test.ts`, add:

  ```ts
  it('FILTER_PARAM_KEYS lists exactly the keys that paramsToFilters reads', () => {
    // Reflect over paramsToFilters: feed it one populated key at a time and
    // assert exactly one of them changes the result, and that the changed
    // key is in FILTER_PARAM_KEYS
  });

  it('FILTER_PARAM_KEYS has no duplicates', ...);
  ```

  The reflection test is what stops a sixth filter dimension from being added to `paramsToFilters` without being added to `FILTER_PARAM_KEYS`, which is the failure mode that would make one filter sticky in the URL forever.

- [ ] **Step 4.2: Run and confirm red.**

  ```bash
  cd frontend && npx vitest run src/lib/filters.test.ts 2>&1 | tail -20
  ```

- [ ] **Step 4.3: Implement.**

  ```ts
  export const FILTER_PARAM_KEYS: readonly string[] = Object.freeze([
    'teamIds', 'opponentIds', 'competitionIds', 'seasonFrom', 'seasonTo',
  ]);
  ```

- [ ] **Step 4.4: Verify green and commit.**

  ```bash
  cd frontend && npx vitest run src/lib/filters.test.ts 2>&1 | tail -20
  cd frontend && npx vitest run src/lib/ app/ 2>&1 | tail -20
  git add frontend/src/lib/filterParams.ts frontend/src/lib/filters.test.ts
  git commit -m "feat: export FILTER_PARAM_KEYS and guard it against drift"
  ```

---

### Task 5: Validate the patch end to end

**Files:**
- Create: `docs/v1/v1.1/CHANGELOG-v1.1.2.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a changelog recording the commands run, their results, and the build output.

**Steps:**

- [ ] **Step 5.1: Run the full frontend suite with coverage.**

  ```bash
  cd frontend && npm run test 2>&1 | tail -40
  cd frontend && npm run test:coverage 2>&1 | tail -40
  ```

- [ ] **Step 5.2: Run a production build. This is the gate for the `Suspense` work.**

  ```bash
  cd frontend && npm run build 2>&1 | tail -40
  ```

  Expected: a clean build. If it fails with `missing-suspense-with-csr-bailout` or *"Entire page /missing-eleven deopted into client-side rendering"*, the `<Suspense>` boundary in Task 3.6(b) is missing or sits above rather than below `FilterUrlSync`, and the whole patch is not done. **`next dev` does not surface this; only `next build` does.** Do not accept a passing dev server as evidence.

- [ ] **Step 5.3: Live-smoke the URL contract by hand.**

  With the app running:

  ```bash
  # 1. deep link with filters — the page must load a match matching them
  open 'http://localhost:3000/missing-eleven?teamIds=<real club id>&seasonFrom=2020&seasonTo=2022'
  # 2. a hand-typed, messy but valid query must be normalised exactly once
  open 'http://localhost:3000/missing-eleven?teamIds=<id>,,  <id2> &seasonFrom=1999'
  #    expect: the address bar settles to a canonical form, seasonFrom dropped (outside 2013-2025),
  #    and the game it loads matches what remains
  # 3. a filter combination with no games must NOT say "Something went wrong"
  open 'http://localhost:3000/missing-eleven?teamIds=999999'
  #    expect: no network-error message (v1.1.4 adds the real empty state)
  # 4. Back after a filter change must leave the page, not undo the filter
  ```

  Check 2 is the one that catches an off-by-one in the `ready` gate: if the address bar comes back **empty** after a moment, the write ran before the read and the user's filters were destroyed.

- [ ] **Step 5.4: Confirm the page looks unchanged.**

  Compare the rendered page against the pre-patch build. No new control, no new banner, no changed spacing. The only permitted visual difference is none.

- [ ] **Step 5.5: Write the changelog and commit.**

  ```bash
  git add docs/v1/v1.1/CHANGELOG-v1.1.2.md
  git commit -m "docs: add v1.1.2 changelog and validation evidence"
  ```
