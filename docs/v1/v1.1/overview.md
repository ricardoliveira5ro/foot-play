# v1.1 — Filters (overview)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player narrow 10,219 matches down to one they can actually finish — by team, competition, and season — with every option labelled by how many games it would leave, and with "nothing matches" presented as an explained outcome instead of a blank board.

**Architecture:** Four patches, strictly ordered, each of which makes the next one possible. v1.1.1 makes selecting an unplayable game **structurally impossible** and ships the endpoint that returns runtime option lists *with* post-filter counts in a single grouped query. v1.1.2 makes the URL the single source of truth for the filter set, with the counts fixed at the moment a filter set is applied. v1.1.3 and v1.1.4 only render: they consume a frozen wire format and a frozen state contract, and neither touches the backend.

**Tech Stack:** TypeScript, Prisma 7 (`$queryRaw` with `Prisma.sql` fragments, PostgreSQL `json_build_object`), Express, Next.js 16 / React 19, Tailwind 4, Vitest + jsdom + Testing Library.

---

> **Ratified decisions are not decided here.** Roadmap [§9.1](../roadmap-v1.md#91-ratified-decisions) is authoritative for every decision the owner has closed; a plan's preflight **verifies** the ratified answer and never re-decides it. Where a plan and that table disagree, the table wins and the plan is the defect. A question the table does not cover is still an escalation.

---

## The four patches

| Patch | What lands | Files it adds | Rollback to |
|---|---|---|---|
| **v1.1.1** — `plan-v1.1.1-filter-foundation.md` | `hasCompleteLineups()` and a re-usable completeness SQL predicate, applied to random-match selection so the 530 unplayable games are unreachable. `GET /api/matches/filter-options` returning runtime option lists **and** post-filter counts from **one** grouped statement. Autocomplete `name`/`displayName` symmetry fix (R6). R7: the frontend vitest `include` is widened to enumerate `src/**`, `components/**`, `tests/**` **and `app/**`**, and the shadowed `frontend/vitest.config.mts` is deleted. Frozen `GameFilterParams` in `frontend/types/index.ts` + the pure URL helpers in `frontend/src/lib/filterParams.ts` and the pure predicates in `frontend/src/lib/filters.ts`. **No filter control is rendered.** | `backend/src/lib/lineupCompleteness.ts`, `backend/src/lib/filterQuery.ts`, `backend/src/services/filterService.ts`, 4 backend test files, `frontend/src/lib/filterParams.ts`, `frontend/src/lib/filters.ts`, 2 frontend test files | v1.0.x |
| **v1.1.2** — `plan-v1.1.2-filter-url-state.md` | `GameState.filters` + `SET_FILTERS`, a `FilterUrlSync` bridge that is the app's only `useSearchParams` reader and sits below a `<Suspense>` boundary, and a `useFilterOptions` hook with a stale-response guard. A deep link loads the filters in its URL. **Still no filter control.** | `frontend/src/lib/filtersEqual.ts`, `frontend/src/lib/useFilterOptions.ts`, `frontend/app/missing-eleven/FilterUrlSync.tsx`, 4 frontend test files | v1.1.1 |
| **v1.1.3** — `plan-v1.1.3-team-filters.md` | `ClubMultiSelect` and `FilterPanel` with a draft-then-apply selection model — searchable, grouped into Clubs and National teams, every option carrying its count; collapsible section, entry-gate pre-screen, no in-game panel, selected-value chips. The **Opponent dimension is removed end to end** (UI, URL key, SQL, response key) with legacy `?opponentIds=` bookmarks converging. | `frontend/src/lib/clubFilters.ts`, `frontend/src/components/ClubMultiSelect.tsx`, `frontend/src/components/FilterPanel.tsx`, 3 frontend test files | v1.1.2 |
| **v1.1.4** — `plan-v1.1.4-competition-season-empty-state.md` | `CompetitionMultiSelect`, `SeasonRange`, and `FilterEmptyState` — the last dimension and the last missing outcome. | `frontend/src/lib/competitionFilters.ts`, `frontend/src/components/CompetitionMultiSelect.tsx`, `frontend/src/components/SeasonRange.tsx`, `frontend/src/components/FilterEmptyState.tsx`, 4 frontend test files | v1.1.3 |

**Rollback chain is strict and one-directional:** v1.1.4 → v1.1.3 → v1.1.2 → v1.1.1 → v1.0.x. Every revert is a code revert with **no data repair and no reverse migration**, because v1.1 adds no schema change at all. v1.1.1 is the only patch that touches the backend, and its sole data-facing change is a read predicate.

---

## Data flow

```
Game + Appearance  (10,219 games; 530 have an empty opponent lineup)
      │
      │  v1.1.1  completeLineupsWhere()   ← ONE place the rule is written
      │          11 starting_lineup appearances on the game's OWN homeClubId
      │          AND 11 on its OWN awayClubId
      v
playable game set
      │
      ├──► v1.1.1  getRandomMatch()  →  one random match
      │             fetchRandomMatch(filters)  ← v1.1.1
      v
      └──► v1.1.1  ONE grouped statement  ──────────────────────────►  FilterOptionsResponse
                   teams / competitions / seasons                      { id, count, isNationalTeam }
                   + total, all from one database snapshot            { id, count }
                                                                            { season, count }
      │                                    (option universe is UNFILTERED,
      │                                     only the counts are filtered)
      v
v1.1.2   FilterUrlSync  ◄── ?teamIds=&competitionIds=&seasonFrom=&seasonTo=…
      │      │  read                                    write
      │      ▼                                          ▲
      │   GameState.filters  ◄──── SET_FILTERS ──────────┘
      │        │
      │        └──► useFilterOptions(filters)  →  re-read once per APPLIED set
      ▼
v1.1.3 / v1.1.4   FilterPanel  ──►  ClubMultiSelect ×2, CompetitionMultiSelect, SeasonRange
      │            draft-then-Apply: counts never move while the panel is open
      ▼
FilterEmptyState   when filterOptions.total === 0 && hasActiveFilters(filters)
```

---

## The five decisions that bind all four patches

**1. The completeness rule is written exactly once, and it cannot be a Prisma `where`.**
A game is playable only when **both** sides have exactly 11 `starting_lineup` appearances, correlated to *that game's own* `homeClubId` / `awayClubId`. Prisma 7 cannot express this: `AppearanceListRelationFilter` is `{ every, some, none }` with no count comparison (`backend/src/generated/prisma/models/Appearance.ts:466-470`), and `AppearanceWhereInput` has `gameId` / `clubId` as plain `IntFilter`s that cannot reach the parent `Game` (`backend/src/generated/prisma/models/Game.ts:334`). So `completeLineupsWhere()` returns a `Prisma.Sql` fragment, not `Prisma.GameWhereInput` — the name is preserved, the return type is corrected. This is a **flagged deviation from the frozen contract**, detailed in the v1.1.1 plan, and it is the one thing in v1.1 that needs `lead`'s ratification before Task 4 is started.

**2. All four numbers come from one statement, and the option universe is deliberately unfiltered.**
§4.5 requires the per-option counts and the total to be computed in a *single grouped query* at the moment the filter set is applied. Four separate `groupBy` calls would each observe a different database snapshot, and a count inconsistent with the results is worse than no count. So v1.1.1 builds one statement with five CTEs and returns a single `json_build_object` row; v1.1.3's Opponent removal drops the `opponents` CTE, leaving four (`teams`, `competitions`, `seasons`, `total_base`) and four `json_build_object` keys. Each facet's CTE **excludes its own dimension's filter**, so a selected option still shows a non-zero count instead of a self-referential `0`. Separately, the option *lists* come from unfiltered queries: deriving them from the filtered CTE would hide exactly the zero-count options the user needs in order to escape a too-narrow filter.

**3. Draft-then-apply is the mechanism, not a UI preference.**
§4.5 rejects per-option counts that recompute on every toggle, because every number on screen would be stale between clicks. `useFilterOptions` keys on the *applied* set; the panel holds a draft and calls `setFilters` only from Apply. This makes "the counts do not change while the panel is open" a structural property rather than something to remember, and the invariant is asserted at both the component and page level.

**4. The empty state is driven by `total`, never by a failure.**
`filterOptions.total === 0 && hasActiveFilters(filters) && !optionsLoading` selects the empty state. A 404 could equally mean a routing bug or a database outage, and telling a user their filter is at fault when the server is down is the exact "wrong instead of absent" inversion §4.5 forbids. The error path stays untouched, and the two states are tested to be distinct — including one test that stops the backend and asserts the *error* state appears. This matters more than usual here: **13 of 28 competitions have ≤35 games** (R8), and **one of the 25 curated teams has zero qualifying games** (R9), so the empty state is reachable on day one, not hypothetical.

**5. Season means completed seasons, and the 2026 gap is stated rather than hidden.**
`Game.season` is nullable, the 2026 season is partial (data runs to 2026-06-28), and no row carries `season = 2026`. The option list is derived from the distinct values the server returns, so it shows 2013–2025 and nothing else. A user who wants "2025–2026" cannot express it, so the empty state says *"Season filtering covers completed seasons only"*. The alternative — synthesising a 2026 option, widening the bound, or treating season and match date as interchangeable — would all be inventing data the owner does not have.

---

## Frozen interfaces

Downstream patches and later versions import these by name. Do not rename or reorder them. Additions are marked.

```ts
// backend/src/lib/lineupCompleteness.ts                                  // v1.1.1
export const LINEUP_SIZE = 11;
export const STARTING_LINEUP = 'starting_lineup';
export function hasCompleteLineups(
  game: Pick<GameWithRelations, 'appearances' | 'homeClubId' | 'awayClubId'>,
): boolean;
export function completeLineupsWhere(): Prisma.Sql;   // ← see decision 1; the frozen
                                                        //   return type was GameWhereInput

// backend/src/services/matchService.ts                                   // v1.1.1
export type GameWithRelations;                          // additive export of an existing local type

// backend/src/lib/filterQuery.ts                                         // v1.1.1
export function teamWhere(ids: number[]): Prisma.Sql;
export function competitionWhere(ids: string[]): Prisma.Sql;
export function seasonWhere(from: number | null, to: number | null): Prisma.Sql;
export function allFiltersWhere(filters: GameFilters): Prisma.Sql;
export function filtersExcluding(filters: GameFilters, omit: Dimension): Prisma.Sql;

// backend/src/services/filterService.ts                                  // v1.1.1
export interface FilterOptionGroup { id: number; count: number; isNationalTeam: boolean }
export interface FilterOptionsResponse {
  teams: FilterOptionGroup[];
  competitions: { id: string; count: number }[];
  seasons: { season: number; count: number }[];
  total: number;
}
export async function getFilterOptions(filters: GameFilters): Promise<FilterOptionsResponse>;

// GET /api/matches/filter-options   registered ABOVE /:id                  // v1.1.1

// frontend/types/index.ts  (additive: the filter types join the wire shapes)  // v1.1.1
export type GameFilterParams = {
  teamIds: number[] | null;
  competitionIds: string[] | null;
  seasonFrom: number | null;
  seasonTo: number | null;
};
export const EMPTY_FILTERS: Readonly<GameFilterParams>;

// frontend/src/lib/filterParams.ts                                         // v1.1.1
export function paramsToFilters(params: URLSearchParams): GameFilterParams;
export function filtersToParams(filters: GameFilterParams): URLSearchParams;
export function isValidGameFilters(value: unknown): value is GameFilterParams;
export const FILTER_PARAM_KEYS: readonly string[];        // added in v1.1.2

// frontend/src/lib/filters.ts                                              // v1.1.1
export function hasActiveFilters(filters: GameFilterParams): boolean;

// frontend/lib/api.ts                                                    // v1.1.1
export function fetchFilterOptions(filters: GameFilterParams): Promise<FilterOptionsResponse>;
export function fetchRandomMatch(filters: GameFilterParams): Promise<GameResponse | null>;
//   fetchRandomMatch KEEPS ITS EXISTING NAME; only the parameter and the return
//   type change. The contract draft called it getRandomMatch, but every GET in
//   api.ts follows the fetchX prefix and three call sites already exist.

// frontend/src/lib/gameState.ts                                          // v1.1.2
//   GameState gains: filters: GameFilterParams
//   GameAction gains: | { type: 'SET_FILTERS'; payload: GameFilterParams }
//   useGameState() additionally returns: filters, setFilters

// frontend/src/lib/filtersEqual.ts                                        // v1.1.2
export function filtersEqual(a: GameFilterParams, b: GameFilterParams): boolean;

// frontend/src/lib/useFilterOptions.ts                                    // v1.1.2
export function useFilterOptions(filters: GameFilterParams): UseFilterOptionsReturn;

// frontend/app/missing-eleven/FilterUrlSync.tsx                           // v1.1.2
export default function FilterUrlSync(props: {
  applied: GameFilterParams;
  onFilters: (filters: GameFilterParams) => void;
}): null;                                        // the app's ONLY useSearchParams reader
```

---

## Validation order

Run the gates in this order; each patch's own plan has the per-step detail.

| # | Gate | Command | Expected |
|---|---|---|---|
| 1 | Backend full suite | `cd backend && npm run test:coverage` | 95% lines / branches / functions / statements maintained |
| 2 | Backend types + lint | `cd backend && npx tsc --noEmit && npm run lint` | exit 0 |
| 3 | **Frontend production build** | `cd frontend && npm run build` | exit 0 — `missing-suspense-with-csr-bailout` is a **build failure**, and `next dev` never shows it |
| 4 | Frontend full suite | `cd frontend && npm run test:coverage` | all pass |
| 5 | Frontend types + lint | `cd frontend && npx tsc --noEmit && npm run lint` | exit 0 |
| 6 | **vitest include never re-narrowed** | `git diff HEAD~1 -- frontend/vitest.config.ts` | no `-` line removing a `components/**` or `tests/**` entry |
| 7 | **No filter UI in v1.1.1/v1.1.2** | `git diff v1.1.1..v1.1.2 -- frontend/src/components/ frontend/components/` | empty |
| 8 | **No frontend-only count derivation** | `grep -rn "count" frontend/src/components/ClubMultiSelect.tsx` | only the rendered `option.count` — no arithmetic |
| 9 | **No disabled zero-count option** | `grep -rn "disabled" frontend/src/components/ClubMultiSelect.tsx` | no output |
| 10 | **No recompute on toggle** | `grep -rn "setFilters\|onApply" frontend/src/components/ClubMultiSelect.tsx` | no output — the control cannot commit |
| 11 | **Only one URL reader** | `grep -rln "useSearchParams" frontend/app/ frontend/src/` | `FilterUrlSync.tsx` only |
| 12 | **Backend untouched by v1.1.3/v1.1.4** | `git diff --stat v1.1.1..HEAD -- backend/ backend/prisma/` | empty |
| 13 | **Season bounds hold** | `set -o pipefail; curl -s localhost:3000/api/matches/filter-options \| grep -o '"season":[0-9]*' \| sort -u` | 2013–2025, no `null`, no 2026 |
| 14 | **Empty ≠ error** | live: stop the backend, retry a filtered load | the **error** state, not the empty state |
| 15 | **Deep link survives load** | live: `?teamIds=<id>&seasonFrom=1999` | canonical URL settles; `seasonFrom` dropped; game loads |

Gates 6–12 are cheap greps that catch the ways this feature can silently violate its own contract. Run them every time. Gate 3 in particular is not optional: the `Suspense` failure is invisible in dev.

---

## Out of scope for v1.1

- **Home / away filter** (§4.3, rejected: needs a fourth dimension for a distinction most players do not care about).
- **A result filter** such as "only games I won" (§4.3, rejected: there is no "I").
- **A minimum-goals filter** (§4.3, rejected: depends on event data that is currently 100% empty, per §1.1).
- **Hardcoded or client-derived option lists.** §4.2 requires every option list to be read from the database at runtime, so an owner's dataset expansion flows through with no release.
- **The `/missing-eleven` naming and rating work — and it is nobody's job in v1.x.** An earlier draft of the v1.0 overview's "Out of scope" section assigned this to "v1.1.3", which contradicted §4.4, where v1.1.3 is the Team multi-select. **This is now decided at the source**: the roadmap's **§10 Out of scope** table records it as excluded from v1.x, because no patch table (§3, §4.4, §5.6, §6.3, §7) assigns naming or rating to any patch. It is unowned by decision, not unowned by oversight — adopting it needs a **new patch with its own plan**, not a slot in an existing one, and a v1.1 implementer should not pick it up on the strength of a stale cross-reference.
- **Any `Appearance` or `Game` index, and any migration.** v1.1.1 needs only the `@@index([gameId])` that already exists (`backend/prisma/schema.prisma:83`).
- **Difficulty modes, multipliers, or clue scoring** (v1.2.x). v1.2 must render and score correctly with filters present but never applied.
- **The shareable daily link** (v1.3). v1.1.2 builds the URL mechanism it reuses; v1.1 deliberately preserves unrelated query params so `?daily=` can coexist with the filter keys.
- **Any change to `fetchRandomMatch`'s name, `LineupPlayer`'s v1.0.2 fields, or the seed's `run_seed` gate.**

---

## Handoff to v1.2 and v1.3

1. **`GameFilterParams` and the four URL keys** — v1.3's shareable daily link composes with these. `FILTER_PARAM_KEYS` plus the delete-then-merge in `FilterUrlSync` is the mechanism that keeps `?daily=` alive across a filter write; reuse it rather than re-deriving the query string. (`LEGACY_FILTER_KEYS` handles one-time cleanup of the removed `opponentIds` key; do not add to it without a deprecation record.)
2. **`useFilterOptions`'s key-is-`filtersToParams(...)` pattern** — any future refetch-on-change hook needs the same canonical-string keying, or it will refetch on every equal-but-new object.
3. **The count contract** — counts are static values for the applied filter set, and `total` counts the whole AND. A v1.2 screen that wants "how many games will this leave" reads `FilterOptionsResponse`; it must not derive a number from another number.
4. **The completeness predicate is a hard prerequisite, not an optimisation** — 530 of 10,219 games are unplayable. Any future feature that selects a game (a daily link in v1.3, a share in v1.4) must go through `getRandomMatch` or carry `completeLineupsWhere()` itself.

---

## Risks

| Risk | Impact | Where it is handled |
|---|---|---|
| **R6 — autocomplete suggests a name that is not the answer** | Wrong suggestions; 92% of players mismatch, and for 19% the display name is not even a substring of the name | v1.1.1 Task 7, in all three places the expression is needed, plus the mock — the asymmetry is the bug, not one endpoint |
| **R7 — tests under `frontend/components/**` are silently not collected** | A green run with zero real coverage | v1.1.1 Task 1 widens the include and deletes the shadowed `.mts` in the same commit; gate 6 |
| **`completeLineupsWhere` cannot be a `Prisma.GameWhereInput`** | The frozen signature is unimplementable; shipping a weaker predicate would be a silent correctness hole | Decision 1, plus a flagged escalation — **v1.1.1 Task 4 does not start until `lead` ratifies** |
| R8 — empty filter results are common | 13 of 28 competitions have ≤35 games; 4 have exactly one season. A narrow combination looks like a bug | Decision 4: the empty state is driven by `total`, is escapable, and is tested against the error state |
| R9 — one curated team has zero qualifying games | A 0-count option on day one | §4.5: rendered with its count visible and **not** disabled; gates 9 and 10 forbid the alternative |
| Four correlated subqueries per `Game` row across four CTEs | Slow counts on a 4 GB box as the dataset grows | `@@index([gameId])` already exists; one statement, one round trip. Revisit only if a measurement shows it matters — **do not add an index**, R4 forbids it here |
| A second `useSearchParams` reader appears | The `Suspense` boundary is defeated and `next build` fails | Decision 1 in the v1.1.2 plan; gate 11 |
| Two URL writers appear | Echo loop, history spam, filters that fight the user | One owner (`FilterUrlSync`); v1.1.2 Global Constraints forbid a second |
| Counts drift from results between writes | A count that lies | One statement, one snapshot; the R5 invariant is asserted both in the backend test and in the live smoke |
