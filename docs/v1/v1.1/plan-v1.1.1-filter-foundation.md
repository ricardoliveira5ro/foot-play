# Filter Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** v1.1 becomes structurally incapable of filtering its way to a broken game. This patch adds the shared completeness rule, applies it to the unfiltered request path, ships the `GET /api/matches/filter-options` endpoint that returns runtime option lists *with* post-filter counts, resolves the `name` / `displayName` asymmetry between the backend and the mock, and repairs the frontend test harness so v1.1.2–v1.1.4 can ship tested UI. **No filter control is rendered in this patch.**

**Architecture:** Two new pure modules. `backend/src/lib/lineupCompleteness.ts` owns the rule exactly once: `hasCompleteLineups()` is a pure function over an already-loaded game, and `completeLineupsWhere()` returns the reusable `Prisma.Sql` predicate that both the random-match query and the filter-options query interpolate. `backend/src/lib/filterQuery.ts` owns the single grouped SQL statement that produces all five numbers (`teams`, `opponents`, `competitions`, `seasons`, `total`) in **one row and one round trip**, so the counts can never disagree with each other. On the frontend, the frozen contract's two pure helper modules are created and unit-tested with no React and no network, so v1.1.2 can build URL state on top of them: `frontend/src/lib/filterParams.ts` (`paramsToFilters`, `filtersToParams`, `isValidGameFilters`) and `frontend/src/lib/filters.ts` (`matchesGameFilters`, `hasActiveFilters`, `countActiveFilters`). The shared filter *types* (`GameFilterParams`, `FilterOption`, `SeasonOption`, `TeamOption`, `FilterOptionsResponse`, `GameFilters`, `EMPTY_FILTERS`) live in `frontend/types/index.ts`, not in a module, because they are wire shapes and `frontend/types/` is already where every other wire shape in this repo lives. The test file for a module sits beside that module, so `filterParams.test.ts` and `filters.test.ts` are both under `frontend/src/lib/`.

**Tech Stack:** TypeScript, Prisma 7 (`$queryRaw` with `Prisma.sql` fragments, PostgreSQL `json_build_object`), Vitest + Testcontainers (backend coverage gate 95% on all four metrics, `backend/vitest.config.ts:26-30`), Next 16 App Router, jsdom + Testing Library.

---

## Global Constraints

- **This patch renders zero filter UI.** v1.1.1 ships types, pure helpers, a service, a route, an API client, and mocks. The first visible control lands in v1.1.3. A checkbox in this patch is a defect.
- **CONTRACT DEVIATION #1 — `completeLineupsWhere` return type is `Prisma.Sql`, not `Prisma.GameWhereInput`.** The locked interface specified `Prisma.GameWhereInput`, which is **provably impossible** for this rule, and the plan escalates rather than ships a weakened predicate. Proof from the generated client in this repo:
  - `backend/src/generated/prisma/models/Game.ts:334` — `appearances?: Prisma.AppearanceListRelationFilter`
  - `backend/src/generated/prisma/models/Appearance.ts:466-470` — that type is exactly `{ every?, some?, none? }`. There is **no `_count` / `_count.gte` relation filter** in Prisma 7. Confirmed by the `strings` array in `backend/src/generated/prisma/internal/class.ts:37`, which enumerates every Prisma token the client supports and contains `every`, `some`, `none` but no count-comparison operator.
  - `backend/src/generated/prisma/models/Appearance.ts` — `AppearanceWhereInput` has `gameId` and `clubId` as **plain `IntFilter`s**. It cannot reach back to the parent `Game`'s `homeClubId` / `awayClubId`, so even a correlated `some` cannot distinguish home from away.

  A `GameWhereInput` can therefore express neither "11 on each side" nor "11 per side". Returning one would be a *silently wrong* predicate, which §4.5 treats as worse than a missing count. **The name is preserved; only the return type changes, from a type that cannot express the rule to `Prisma.Sql`, which can.** This is the minimal possible deviation. See "Escalation" below before implementing.
- **Escalation — `lead` must ratify CONTRACT DEVIATION #1.** The two options are: **(A) recommended** — accept `Prisma.Sql`; the whole v1.1 backend filter path is raw SQL, which is required anyway for the grouped counts. **(B)** revert to `Prisma.GameWhereInput` and accept that the completeness rule degrades to something weaker than 11-per-side, which contradicts §1.1 and the data. Do **not** begin Task 4 under option (B) without a decision.
- **Completeness is 11 starting-lineup appearances per side, correlated to the game's own `homeClubId` / `awayClubId`.** Not 22 total, not 11 total. `Appearance.type` is `starting_lineup` for 100% of rows today, but the predicate still filters on it, because a substitute appearance must not silently start counting toward a side.
- **530 games are excluded before any filter exists.** Every query in this patch — random match, filter options, counts — carries the completeness predicate. There is no code path that can return one of the 530 games.
- **This line uses `R#` in two different senses, and the difference is not cosmetic.** `R1`, `R4` and `R5` below are **v1.1-local constraint IDs**, declared in this list and reused by v1.1.2–v1.1.4; they are not roadmap IDs and resolve to nothing outside this line. `R6` and `R7` are **roadmap §8 risk IDs** and are cited that way elsewhere. Read a bare `R#` in a v1.1 plan as local unless it names a roadmap risk, and cite a roadmap §9.1 decision as `RD#` — §9.1's decisions are prefixed for exactly this reason, and §9 is authoritative where the two disagree. **Two `R#` collisions sit outside v1.1 and are not covered by this rule, so do not resolve them from it.** `plan-v1.0.1-event-measurement.md:14-16` declares its own local `R2` (dismissal encoding), `R3` (substitute goals) and `R4` (memory) that shadow roadmap §8 `R2`, `R3` and `R4` — the same local-vs-roadmap split, in the v1.0 line, with no note of its own. And `plan-v1.0.1-event-measurement.md:48` ("a cold R2 origin") uses the token for **Cloudflare R2 object storage**, the host of `DATA_URL` (`scripts/src/download-data.ts:7`, `*.r2.dev`), and is a risk identifier in no namespace at all. The local IDs above are not renamed to avoid this; a reader who greps `R2` across the tree must open the file that declares it before citing it.
- **R1 — counts are required, never rejected.** `GET /api/matches/filter-options` returns per-option counts and `total` on every request, including all-zero. A missing or `null` count is a defect.
- **R4 — one grouped query, never one query per option.** All five numbers come from a **single** `$queryRaw` statement. Adding a per-option lookup loop is a defect, and the 95% branch gate plus Task 5's test both hold the line.
- **R5 — facet exclusion.** When a dimension is selected, its own groupBy is computed with that dimension's filter *removed*, so every option in the list carries a meaningful count instead of a self-referential 0. v1.1.2 depends on this: a fully selected team list must not collapse to zeros.
- **R6 — `name` is the search and display key; `displayName` is presentation only.** v1.0.2 leaves `Player.name` and `Player.displayName` untouched (`docs/v1/v1.0/plan-v1.0.2-event-persistence.md`). Evaluation already uses `displayName ?? name`. This patch makes the backend match by moving to `displayName ?? name` at query and response time, and brings the mock to the same expression. No rename.
- **R7 — never re-narrow the vitest include, and enumerate every root that holds a test.** `frontend/vitest.config.ts` currently sets `include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}']`, which structurally cannot see `frontend/components/` **or `frontend/app/`**. Task 1 widens it to enumerate all four roots — `src/**`, `components/**`, `tests/**`, `app/**` — and deletes the dead shadowed `frontend/vitest.config.mts`, which is never read (Vitest resolves `CONFIG_NAMES × CONFIG_EXTENSIONS` in order and takes the first hit, so `vitest.config.ts` wins) and which uses non-function `test.include`/`test.exclude`, both deprecated in Vitest 5. Widen first, in the same commit, so the widened `components/**` tests are never collected by the stale config. **`app/**` is not optional**: Next colocates route tests under `app/`, and v1.1.2 puts three of them there (`FilterUrlSync.test.tsx`, `page.test.tsx`, and in v1.3.1 `page.hydration.test.tsx`). A test file outside the include is not "a missing directory" — it is a **silently uncollected suite** that reports green while asserting nothing. **Ownership: v1.1.1 owns the `include` list and is the only patch in v1 that may change it.** A later patch that needs a new `resolve.alias` entry may add exactly that one entry and must leave `include`, `exclude`, `environment` and `setupFiles` byte-identical — v1.1.2 does this for the aliases its `app/**` page tests need, and v1.3.1 is the same case for `@/lib/api`. No other v1 patch edits `frontend/vitest.config.ts`, and no patch ever re-narrows the include.
- **`frontend/components/Shirt.colors.test.tsx` is not a test.** It is a module-level type-check script with zero `describe` / `it` / `test` calls, so it has been collecting zero tests and reporting as a false green. Task 1 converts it into a real jsdom test rather than leaving the lie in place.
- **React tests need the file-level docblock, not a config.** The established pattern in this repo is `// @vitest-environment jsdom` as the first line of the test file (`frontend/src/lib/gameState.hook.test.ts:1`). Use that for every new React test. Do not add a per-file `environmentMatchGlobs` or a second `environment` config.
- **New shared UI lives in `frontend/src/components/`, not `frontend/components/`.** The `@` alias resolves to `frontend/src` in `frontend/vitest.config.ts:19`, but `frontend/app/missing-eleven/page.tsx:6` imports `@/components/MatchInfo`, which only resolves because `tsconfig.json` maps `@/*` to an **array** `['./src/*', './*']` and Next walks both. Vitest aliases are a flat map with no array fallback — that is precisely why `@/components/TeamTabBar` needed its own explicit alias at `frontend/vitest.config.ts:11` while `@/components/MatchInfo` got none. Anything a vitest test imports must live under `frontend/src/` so that `@/components/X` resolves identically in both. v1.1.3 and v1.1.4 obey this.
- **Test-seed ID discipline.** `backend/src/__tests__/setup/seed.ts` currently creates games `gameId: 1, 2, 3` with deliberately incomplete lineups, and `backend/src/__tests__/integration/matchService.test.ts` asserts their exact appearance contents. Existing tests also create a `gameId: 4` game. New complete-lineup fixtures therefore start at **`gameId: 5`**. Games 1–3 and 4 are frozen; changing any of them is a defect.
- **A complete game needs 22 distinct players** — 11 per side, and `Appearance` is `@@unique([gameId, playerId])`, so a player cannot appear on both sides of one game. The seed helper must assert this.
- **No new index and no Prisma migration in this patch.** `Appearance` already carries `@@index([gameId])` (`backend/prisma/schema.prisma:83`), which is the only index the two correlated subqueries need. Touching `schema.prisma` in v1.1.1 is a defect.
- **Route ordering is load-bearing.** `/filter-options` must be registered **before** `/:id` in `backend/src/routes/matches.ts`, or Express resolves `filter-options` as a game id and every call 400s.
- **Season bounds are 2013–2025.** `Game.season` is nullable and the 2026 season is partial (data runs to 2026-06-28), so the season option list must not present a 2026 entry and must not treat season and date as equivalent. Enforced in the frozen frontend validators in v1.1.2 and asserted in Task 5.
- **TDD mode: advisory_active.** Test first for all testable logic; red → green → refactor; report the commands and results.
- **No `git` write commands until the final commit of each task**, and each task's commit must be independently green.

---

### Task 1: Repair the frontend test harness (R7)

**Files:**
- Modify: `frontend/vitest.config.ts` (the `test.include` / `test.exclude` block; read the current file and re-derive the line range before editing)
- Delete: `frontend/vitest.config.mts`
- Modify: `frontend/components/Shirt.colors.test.tsx` (convert to a real test)

**Interfaces:**
- Consumes: nothing.
- Produces: `frontend/vitest.config.ts` collects `['src/**/*.{test,spec}.*', 'components/**/*.{test,spec}.*', 'tests/**/*.{test,spec}.*', 'app/**/*.{test,spec}.*']`; the single `@/components/TeamTabBar` alias at `:11` is retained unchanged; `frontend/vitest.config.mts` no longer exists. **This task owns the `include` list for the whole of v1** — every later patch consumes it, none may re-narrow it, and a later patch that must add a `resolve.alias` entry (v1.1.2, v1.3.1) adds only that entry and leaves the `test` block alone.

**Steps:**

- [ ] **Step 1.1: Capture the pre-change baseline (evidence that the existing test collects nothing).**

  ```bash
  cd frontend
  npx vitest run components/Shirt.colors.test.tsx --reporter=verbose
  ```

  Expected today: `No test files found` or zero collected tests. Record the exact output. This is the red for this task.

- [ ] **Step 1.2: Widen the include, then delete the shadowed config.**

  Edit `frontend/vitest.config.ts` so the test block reads:

  ```ts
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/lib/test-setup.ts'],
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'components/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'app/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
    ],
    exclude: ['node_modules', 'dist', '.next', 'coverage'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
    },
  }
  ```

  `setupFiles` stays `./src/lib/test-setup.ts`. The `environment: 'node'` default stays, because per-file jsdom is opt-in via the docblock and the pure-logic suites should stay fast.

  Then:

  ```bash
  rm frontend/vitest.config.mts
  ```

  Delete it. Do not "port" anything out of it: its `include: ['tests/**']` is already covered by the `tests/**` entry, and its `setupFiles`/`environment` are superseded.

  **`app/**` is the entry people forget, so name it here.** It is not in the `.mts` file, not in the current `include`, and not implied by the other three: Next.js colocates route tests under `frontend/app/`, and v1.1.2 immediately creates `frontend/app/missing-eleven/FilterUrlSync.test.tsx` and `page.test.tsx` (v1.3.1 adds `page.hydration.test.tsx`). Without this entry those three files are never collected, the suite still reports green, and the tests assert nothing. Verify the entry is live before leaving this step:

  ```bash
  cd frontend && npx vitest list app/
  ```

  Today that must print `No test files found`; after the edit it must list the `app/**` tests that exist. An empty list is the same failure as no entry at all.

- [ ] **Step 1.3: Convert `Shirt.colors.test.tsx` into a real test.**

  The current file type-checks `COLORS` entries against the props and exits. Replace the whole file with a real test. First read `frontend/components/Shirt.tsx` to get the exact `COLORS` keys, the prop names, and the `home` / `away` / `neutral` branches, then write against what is actually there — do not guess the colour names.

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect } from 'vitest';
  import { render, screen } from '@testing-library/react';
  import Shirt from '@/components/Shirt';

  describe('Shirt colours', () => {
    it('exposes an entry for every supported club colour', () => {
      // assert against the exported COLORS map and Shirt's declared prop union
    });

    it.each([/* one case per colour key, home side */])(
      'renders the home %s colour',
      (key) => { /* render, assert the inline background is applied */ },
    );

    it.each([/* one case per colour key, away side */])(
      'renders the away %s colour',
      (key) => { /* render, assert the inline background differs from home */ },
    );

    it('falls back to the neutral colour for an unknown club id', () => {
      // render with a club id that is not in COLORS, assert the neutral branch
    });
  });
  ```

  Use `it.each` over the **entire** exported colour map, never a sampled subset, for the same reason v1.0.1 used `it.each` over the whole dismissal list: a sample passes while an unrendered colour stays broken. Every branch that `Shirt.tsx` contains must be asserted, because the widened include brings this file under the coverage gate's blast radius.

- [ ] **Step 1.4: Verify green, and verify the suite count actually moved.**

  ```bash
  cd frontend
  npm run test
  ```

  Expected: the `Shirt colours` suite reports a non-zero test count, and the total collected file count is strictly greater than the baseline in Step 1.1. If the count did not move, the include did not take effect and the task is not done.

- [ ] **Step 1.5: Commit.**

  ```bash
  git add frontend/vitest.config.ts frontend/vitest.config.mts frontend/components/Shirt.colors.test.tsx
  git commit -m "test: widen vitest include and make Shirt colour checks a real test"
  ```

---

### Task 2: Add complete-lineup fixtures to the test seed

**Files:**
- Modify: `backend/src/__tests__/setup/seed.ts`

**Interfaces:**
- Consumes: the existing `seed` fixture used by every backend integration test.
- Produces: exported helper `createCompleteGame({ gameId, homeClubId, awayClubId, ... })` that creates a `Game` plus exactly 22 `Appearance` rows (11 home, 11 away), and one seeded complete game at `gameId: 5`. Games `1`–`4` are unchanged.

**Steps:**

- [ ] **Step 2.1: Read the current seed and confirm the frozen fixtures.**

  ```bash
  grep -n "gameId:" backend/src/__tests__/setup/seed.ts
  grep -n "gameId" backend/src/__tests__/integration/matchService.test.ts
  ```

  Confirm games 1, 2, 3 exist and that a `gameId: 4` game is created in a test. If any other test already claims `gameId: 5` or higher, renumber **this** patch's fixtures upward before writing; never renumber an existing test.

- [ ] **Step 2.2: Write the helper and one complete fixture, guarded by assertions.**

  Add to `backend/src/__tests__/setup/seed.ts`:

  ```ts
  export const LINEUP_SIZE = 11;

  export async function createCompleteGame(opts: {
    gameId: number;
    homeClubId: number;
    awayClubId: number;
    competitionId?: string;
    season?: number | null;
    round?: string | null;
    date?: Date | null;
  }) {
    // 1. create the Game row
    // 2. build 22 distinct playerIds: 11 for home, 11 for away
    // 3. assert the 22 playerIds are unique (Appearance is @@unique([gameId, playerId]))
    // 4. assert homeClubId !== awayClubId
    // 5. createMany the 22 Appearances with type: 'starting_lineup'
    // 6. return the created game id
  }
  ```

  Step 3's uniqueness assertion is not decoration: without it, a helper that accidentally reuses a player id creates 21 rows and the completeness tests fail for the wrong reason.

  Then add one seeded complete game at `gameId: 5`, with `season: 2024`, so the default fixture set contains both complete and incomplete games and every completeness test has something to discriminate against.

- [ ] **Step 2.3: Verify the existing suite is still green before adding new tests.**

  ```bash
  cd backend && npm run test
  ```

  Expected: unchanged pass. Games 1–3 and 4 were not touched, so nothing in the current suite may move. A failure here means Step 2.2 mutated a frozen fixture — fix that before continuing.

- [ ] **Step 2.4: Commit.**

  ```bash
  git add backend/src/__tests__/setup/seed.ts
  git commit -m "test: add complete-lineup game fixtures to the backend test seed"
  ```

---

### Task 3: Add the pure `hasCompleteLineups` predicate

**Files:**
- Modify: `backend/src/services/matchService.ts` (imports, exports)
- Create: `backend/src/lib/lineupCompleteness.ts`
- Modify: `backend/src/services/matchService.ts` (`GameWithRelations` becomes exported)
- Create: `backend/src/__tests__/unit/lineupCompleteness.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export function hasCompleteLineups(game: Pick<GameWithRelations, 'appearances' | 'homeClubId' | 'awayClubId'>): boolean` — exactly the locked signature.
  - `export type GameWithRelations` in `matchService.ts` — **additive export of an existing local type**, so a test can type its fixtures. Not a rename.

**Steps:**

- [ ] **Step 3.1: Write the failing unit test first.**

  Create `backend/src/__tests__/unit/lineupCompleteness.test.ts`. This is a pure function over a plain object, so it needs no database and no Testcontainers.

  Cover, at minimum:

  ```ts
  describe('hasCompleteLineups', () => {
    it('returns true for 11 home and 11 away starting-lineup appearances', ...);
    it('returns false when the home side has 10', ...);
    it('returns false when the away side has 10', ...);
    it('returns false when the appearances are 22 but all on one side', ...);  // the anti-pattern this guards
    it('returns false when a club has 12 appearances for that side', ...);      // "exactly", not "at least"
    it('ignores appearances belonging to a third club', ...);
    it('returns false for an empty appearances array', ...);
    it('does not count non-starting_lineup appearances toward a side', ...);
  });
  ```

  The fourth and eighth cases are the ones that would have caught a real bug: "22 total" and "no `type` check" are exactly the two wrong implementations that a naive predicate would ship. Use `test.each` for the boundary counts (0, 10, 11, 12, 22) rather than writing the cases by hand.

- [ ] **Step 3.2: Run it and confirm red.**

  ```bash
  cd backend && npx vitest run src/__tests__/unit/lineupCompleteness.test.ts
  ```

  Expected: failure to resolve the module. This is the red.

- [ ] **Step 3.3: Implement the predicate.**

  Create `backend/src/lib/lineupCompleteness.ts`:

  ```ts
  import type { Prisma } from '../generated/prisma/client';

  /** Appearances required on each side for a game to be playable. */
  export const LINEUP_SIZE = 11;

  export const STARTING_LINEUP = 'starting_lineup';

  type GameForCompleteness = {
    appearances: readonly { clubId: number; type: string }[];
    homeClubId: number;
    awayClubId: number;
  };

  export function hasCompleteLineups(game: GameForCompleteness): boolean {
    let home = 0;
    let away = 0;
    for (const a of game.appearances) {
      if (a.type !== STARTING_LINEUP) continue;
      if (a.clubId === game.homeClubId) home += 1;
      else if (a.clubId === game.awayClubId) away += 1;
    }
    return home === LINEUP_SIZE && away === LINEUP_SIZE;
  }
  ```

  Notes on the shape, all deliberate:
  - It takes a **structural** type, not `Pick<GameWithRelations, ...>`, so the module has no import cycle back into `matchService.ts`. `matchService.ts` re-exports the `Pick<...>`-typed alias so the locked public signature is still exactly what the contract specifies. Add a comment saying so, or a future reader will "simplify" one of the two and break the contract.
  - `else if`, not two `if`s. A degenerate game where `homeClubId === awayClubId` would otherwise double-count one row into both sides. Assert `homeClubId !== awayClubId` in the seed helper and keep the `else if`.
  - The `type` check is present even though it is a no-op on today's data, because it is the correct rule and it is what makes the eighth test above meaningful.
  - `=== LINEUP_SIZE`, not `>=`. "Exactly 11" is the rule; a 12th appearance means corrupt data and must not be laundered into "playable".

- [ ] **Step 3.4: Wire the locked signature into `matchService.ts`.**

  In `backend/src/services/matchService.ts`:
  - change `type GameWithRelations = ...` to `export type GameWithRelations = ...`;
  - add `export { hasCompleteLineups } from '../lib/lineupCompleteness';` (re-export so the frozen import path from `matchService` resolves);
  - if the frozen signature must be visible as a literal, add:
    ```ts
    export type CompletenessCheck = (
      game: Pick<GameWithRelations, 'appearances' | 'homeClubId' | 'awayClubId'>,
    ) => boolean;
    const _completenessContract: CompletenessCheck = hasCompleteLineups;
    ```
    A `const` that exists purely to pin a type is justified exactly once, here, where the alternative is a silent contract drift. Remove it if `verbatimModuleSyntax` or the linter objects.

- [ ] **Step 3.5: Run it and confirm green, with coverage on the new module.**

  ```bash
  cd backend && npx vitest run src/__tests__/unit/lineupCompleteness.test.ts --coverage.enabled --coverage.include='src/lib/lineupCompleteness.ts'
  ```

  Expected: all cases pass; 100% lines/branches/functions/statements for the new file.

- [ ] **Step 3.6: Commit.**

  ```bash
  git add backend/src/lib/lineupCompleteness.ts backend/src/services/matchService.ts backend/src/__tests__/unit/lineupCompleteness.test.ts
  git commit -m "feat: add the shared hasCompleteLineups lineup predicate"
  ```

---

### Task 4: Add the SQL completeness predicate and apply it to the random match

**Files:**
- Modify: `backend/src/lib/lineupCompleteness.ts`
- Modify: `backend/src/services/matchService.ts` (`getRandomMatch`)

**Interfaces:**
- Consumes: `LINEUP_SIZE`, `STARTING_LINEUP` from Task 3.
- Produces: `export function completeLineupsWhere(): Prisma.Sql` — the re-usable predicate. **CONTRACT DEVIATION #1: the return type is `Prisma.Sql`, not `Prisma.GameWhereInput`.** See Global Constraints for the proof and the escalation.

**Steps:**

- [ ] **Step 4.1: Confirm the deviation is ratified before writing code.**

  If `lead` has not answered the escalation, stop and ask. Do not proceed under assumption (B).

- [ ] **Step 4.2: Write the predicate.**

  Add to `backend/src/lib/lineupCompleteness.ts`:

  ```ts
  /**
   * Games are playable only when BOTH sides have exactly 11 starting-lineup
   * appearances, correlated to that game's own home/away club.
   *
   * Returns a Prisma.Sql fragment (aliased `g` for "Game") rather than a
   * GameWhereInput: Prisma 7 has no relation-count filter
   * (AppearanceListRelationFilter is {every, some, none} only), and
   * AppearanceWhereInput cannot reach the parent Game's homeClubId/awayClubId,
   * so the rule is not expressible as a GameWhereInput at all.
   *
   * Correctness: a related subquery per side on each row of "Game".
   * Performance: "Appearance" carries @@index([gameId]); no new index is needed.
   */
  export function completeLineupsWhere(): Prisma.Sql {
    return Prisma.sql`
      (SELECT COUNT(*) FROM "Appearance" a
        WHERE a."gameId" = g."gameId"
          AND a."clubId" = g."homeClubId"
          AND a."type" = ${STARTING_LINEUP}) = ${LINEUP_SIZE}
      AND (SELECT COUNT(*) FROM "Appearance" a
        WHERE a."gameId" = g."gameId"
          AND a."clubId" = g."awayClubId"
          AND a."type" = ${STARTING_LINEUP}) = ${LINEUP_SIZE}
    `;
  }
  ```

  Table and column names are the Prisma model and field names verbatim: `schema.prisma` uses no `@@map`, so the tables are `"Game"`, `"Appearance"`, `"Club"`, `"Competition"` and the columns are `"gameId"`, `"clubId"`, `"type"`, `"homeClubId"`, `"awayClubId"`, `"targetTeamId"`, `"opponentTeamId"`, `"competitionId"`, `"season"`. Postgres folds unquoted identifiers to lower case, so the quotes are load-bearing — an unquoted `gameId` becomes `gameid` and the query fails at runtime, not at compile time.

  `${STARTING_LINEUP}` and `${LINEUP_SIZE}` interpolate as **bind parameters**, not string concatenation, so the `=`-count and the type literal cannot be injected or typo-mangled.

- [ ] **Step 4.3: Write the failing integration test for `getRandomMatch`.**

  In `backend/src/__tests__/integration/matchService.test.ts`, add:

  ```ts
  it('never returns a game with an incomplete lineup', async () => {
    // call getRandomMatch many times; every returned game must satisfy
    // hasCompleteLineups, and its gameId must never be 1, 2 or 3
  });

  it('excludes incomplete games from the candidate set', async () => {
    // assert a total-count or candidate-set probe: with only incomplete games
    // seeded, getRandomMatch rejects with the not-found error
  });
  ```

  The first test must loop enough times to be meaningful. A single call is a 1-in-N sample; loop 200 times and assert the union of returned `gameId`s is a subset of the complete fixtures. The second test isolates the predicate from the randomness.

- [ ] **Step 4.4: Apply the predicate in `getRandomMatch`.**

  `getRandomMatch` currently does `count()` then `findMany({ skip: randomInt(count), take: 1 })`. Both calls must carry the predicate, and because the predicate is now SQL rather than a Prisma `where`, replace the two round trips with **one** ordered query:

  ```ts
  const rows = await prisma.$queryRaw<{ gameId: number }[]>`
    SELECT g."gameId"
    FROM "Game" g
    WHERE ${completeLineupsWhere()}
    ORDER BY g."gameId"
    LIMIT 1 OFFSET ${offset}
  `;
  ```

  where `offset` is a random index in `[0, total)`. `total` comes from a single `SELECT COUNT(*)` that carries the same predicate.

  This is a deliberate improvement over the old shape, not incidental:
  - it halves the round trips;
  - it removes the pre-existing `skip: randomInt(count)` TOCTOU window where a concurrent write could make `skip` out of range and return nothing;
  - it keeps the same uniform-random semantics, because a stable `ORDER BY` over a constant id sequence plus a uniform `OFFSET` is uniform.

  A separate "get the count" test must be added only if the new two-step shape is not covered by the first test.

- [ ] **Step 4.5: Verify green and check the full backend suite.**

  ```bash
  cd backend && npm run test
  ```

  Then check the coverage gate explicitly, because the new SQL file is inside the measured set:

  ```bash
  cd backend && npm run test:coverage
  ```

  Expected: all four metrics still ≥ 95%.

- [ ] **Step 4.6: Commit.**

  ```bash
  git add backend/src/lib/lineupCompleteness.ts backend/src/services/matchService.ts backend/src/__tests__/integration/matchService.test.ts
  git commit -m "feat: exclude incomplete lineups from random match selection"
  ```

---

### Task 5: Add the grouped filter-options query

**Files:**
- Create: `backend/src/lib/filterQuery.ts`
- Create: `backend/src/services/filterService.ts`
- Create: `backend/src/__tests__/integration/filterService.test.ts`

**Interfaces:**
- Consumes: `completeLineupsWhere()` from Task 4.
- Produces:
  ```ts
  export interface FilterOptionGroup { id: number; count: number; isNationalTeam: boolean }
  export interface FilterOptionsResponse {
    teams: FilterOptionGroup[];
    opponents: FilterOptionGroup[];
    competitions: { id: string; count: number }[];
    seasons: { season: number; count: number }[];
    total: number;
  }
  export async function getFilterOptions(filters: GameFilters): Promise<FilterOptionsResponse>
  ```
  `GameFilters` mirrors the frozen frontend type and is re-declared backend-side; see the "Where `GameFilters` lives" note below.

**Steps:**

- [ ] **Step 5.1: Write the failing integration test.**

  Create `backend/src/__tests__/integration/filterService.test.ts`. Use the Task 2 fixtures. Cover:

  ```ts
  it('returns all four dimensions plus a total for the empty filter set', ...);
  it('counts every club, including national teams, with isNationalTeam set', ...);
  it('never returns an incomplete game in any count', ...);
  it('applies seasonFrom and seasonTo inclusively', ...);
  it('excludes the selected dimension from its own counts (R5)', ...);
  it('returns an all-zero option list rather than an error when nothing matches', ...);
  it('omits NULL seasons from the seasons dimension', ...);
  it('never returns a season outside 2013-2025', ...);
  it('returns teams total === the total when no team is selected', ...);  // the R5 invariant
  ```

  The last one is the load-bearing invariant: with `teamIds` empty, the team facet is computed with no dimension filter, so `sum(teams[].count)` must equal `total`. When `teamIds` is non-empty, `sum(teams[].count)` must be **greater than or equal to** `total`. Assert both directions.

  The seventh and eighth tests pin the season rule from Global Constraints: a nullable `season` must never surface as a selectable option, and the option list is bounded to 2013–2025 even though dates run into 2026.

- [ ] **Step 5.2: Run it and confirm red.**

  ```bash
  cd backend && npx vitest run src/__tests__/integration/filterService.test.ts
  ```

- [ ] **Step 5.3: Build the SQL fragment helpers.**

  Create `backend/src/lib/filterQuery.ts` with pure, exported, unit-testable builders:

  ```ts
  import { Prisma } from '../generated/prisma/client';

  /** Builds the AND-ed fragment for one dimension; returns Prisma.empty when unfiltered. */
  export function teamWhere(       ids: number[]): Prisma.Sql
  export function opponentWhere(   ids: number[]): Prisma.Sql
  export function competitionWhere(ids: string[]): Prisma.Sql
  export function seasonWhere(from: number | null, to: number | null): Prisma.Sql

  /** All four dimensions. */
  export function allFiltersWhere(filters: GameFilters): Prisma.Sql

  /** All dimensions except the named one — the R5 facet exclusion. */
  export function filtersExcluding(filters: GameFilters, omit: Dimension): Prisma.Sql
  ```

  Implementation rules, all of which are correctness requirements and each of which needs a test:
  - An empty array / `null` bound returns `Prisma.empty` so the caller needs no conditional. `Prisma.empty` is exported from the generated namespace (`backend/src/generated/prisma/internal/prismaNamespace.ts:51`).
  - Values are interpolated as bind parameters via `Prisma.join(ids)`, never as raw SQL. `Prisma.join` is exported at `prismaNamespace.ts:52`. A `IN (${Prisma.join(ids)})` with a single element must still produce valid SQL — assert that, because the join helper's single-element output is an easy place to get a stray comma.
  - `Prisma.sql` is `prismaNamespace.ts:50`; `Prisma.raw` is `:53`. Use `raw` **only** for the static predicate text written in Task 4 — never for user input.
  - `seasonWhere` uses `>=` and `<=` (inclusive on both ends) and emits nothing when both bounds are `null`.
  - `seasonWhere(from, to)` with `from > to` emits a condition that matches **zero** rows, rather than silently normalising. Silently swapping the user's bounds is a lie about what was asked for; zero results is honest, and v1.1.4's empty state explains it. This is the same "absent, not wrong" rule v1.0.1 used.

  Unit-test these builders directly in `backend/src/__tests__/unit/filterQuery.test.ts`. `Prisma.Sql` exposes `strings`, `values`, and `text`; assert on the **parameter count and the `text` shape**, and never on a full rendered string with interpolations inlined — that assertion would break the moment someone reorders a fragment. Asserting `values` is what proves the input was parameterised rather than concatenated, which is the security property that actually matters.

- [ ] **Step 5.4: Write the single grouped statement.**

  In `backend/src/services/filterService.ts`, build **one** statement whose CTEs are the four facets plus the total, each with its own base, and return one JSON row:

  ```sql
  WITH teams AS (
    SELECT g."targetTeamId" AS k, COUNT(*)::int AS c
    FROM "Game" g
    WHERE <completeLineupsWhere> AND <filtersExcluding(filters, 'team')>
    GROUP BY 1
  ),
  opponents AS ( /* g."opponentTeamId", omit 'opponent' */ ),
  competitions AS ( /* g."competitionId", omit 'competition' */ ),
  seasons AS ( /* g."season", omit 'season' */ ),
  total_base AS ( /* COUNT(*)::int, allFiltersWhere(filters) */ )
  SELECT json_build_object(
    'teams',        COALESCE((SELECT json_agg(json_build_object('id', t.k, 'count', t.c) ORDER BY t.k) FROM teams t), '[]'::json),
    'opponents',    COALESCE((SELECT json_agg(json_build_object('id', o.k, 'count', o.c) ORDER BY o.k) FROM opponents o), '[]'::json),
    'competitions', COALESCE((SELECT json_agg(json_build_object('id', c.k, 'count', c.c) ORDER BY c.k) FROM competitions c), '[]'::json),
    'seasons',      COALESCE((SELECT json_agg(json_build_object('season', s.k, 'count', s.c) ORDER BY s.k) FROM seasons s WHERE s.k IS NOT NULL), '[]'::json),
    'total',        (SELECT c FROM total_base)
  ) AS result;
  ```

  Four reasons this is the right shape, and each is a reason a simpler shape is wrong:
  1. **One round trip and one snapshot.** R5 says a count inconsistent with the results is worse than no count. A single statement cannot observe a different database state between the team counts and the total. Four separate `groupBy` calls absolutely can.
  2. **One statement, one CTE per facet.** This is what makes the "exclude this dimension from its own counts" rule expressible at all — each facet needs a different base, and separate `groupBy` calls would need separate `where` objects, which is where the off-by-one-dimension bug lives.
  3. **Counts stay integers.** `COUNT(*)::int` plus `json_build_object` avoids a float round-trip through `json`; `json_agg` over a `bigint` would otherwise serialise as a number that `JSON.parse` and TypeScript disagree about.
  4. **Zero matches is a value, not an error.** Every `COALESCE` is there so an empty facet is `'[]'`, not `null`, so the client never has to null-check an array.

  Then map the row into `FilterOptionsResponse`, and resolve display metadata in **two** additional small queries against the **unfiltered** universe:

  ```ts
  const [row, clubs, competitions] = await Promise.all([
    counts,                                              // the single grouped statement
    prisma.club.findMany({ select: { clubId: true, name: true, isNationalTeam: true }, orderBy: { name: 'asc' } }),
    prisma.competition.findMany({ select: { competitionId: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  ```

  This is the important distinction to write in a comment, because it is the one place the plan spends extra queries on purpose: the **option universe is unfiltered** (you must be able to see, and select, an option that currently has 0), while the **counts are filtered**. Deriving the option list from the filtered CTE would hide exactly the zero-count options that R1 requires to stay visible and selectable.

  Ordering is deliberate: emit clubs sorted by `name` (from the unfiltered `findMany`) rather than by id, because the v1.1.3 UI groups and sorts by name.

  Type the `$queryRaw` result defensively — it is `unknown` at the boundary:
  ```ts
  const [row] = await prisma.$queryRaw<{ result: RawFilterCounts }[]>(query);
  ```

- [ ] **Step 5.5: Where `GameFilters` lives (record the decision).**

  `GameFilters` is a **frontend** type (`frontend/types/index.ts`) and the backend must not import from `frontend/`. Re-declare it backend-side in `backend/src/lib/filterQuery.ts`, field-for-field identical, and add a test that asserts the field sets match the frozen frontend type's keys. The frontend type is the single source of truth and the test is what stops them drifting. Do not create a shared package for two small interfaces in a v1.1 patch.

- [ ] **Step 5.6: Verify green, with both suites and coverage.**

  ```bash
  cd backend && npx vitest run src/__tests__/unit/filterQuery.test.ts src/__tests__/integration/filterService.test.ts
  cd backend && npm run test:coverage
  ```

- [ ] **Step 5.7: Commit.**

  ```bash
  git add backend/src/lib/filterQuery.ts backend/src/services/filterService.ts backend/src/__tests__/unit/filterQuery.test.ts backend/src/__tests__/integration/filterService.test.ts
  git commit -m "feat: add the single grouped filter-options query"
  ```

---

### Task 6: Expose `GET /api/matches/filter-options`

**Files:**
- Modify: `backend/src/routes/matches.ts` (register **before** `/:id`)
- Create: `backend/src/__tests__/integration/routes/filterOptions.test.ts`

**Interfaces:**
- Consumes: `getFilterOptions` from Task 5.
- Produces: `GET /api/matches/filter-options?teamIds=1,2&opponentIds=3&competitionIds=X&seasonFrom=2019&seasonTo=2024` → `200 FilterOptionsResponse`.
  - `teamIds` / `opponentIds`: comma-separated integers, whitespace tolerated, non-integers dropped.
  - `competitionIds`: comma-separated strings, each `trim`ed and **validated** against `/^[A-Za-z0-9_-]{1,32}$/` before it reaches a bind parameter.
  - `seasonFrom` / `seasonTo`: integers, clamped to 2013–2025, out-of-range or unparseable values ignored.
  - A malformed or absent query yields `EMPTY_FILTERS` semantics, never a 400 — an unreadable URL must degrade to "unfiltered", which is R1's spirit applied to the query string.
  - Unknown query keys are ignored, so the endpoint is forward-compatible with `?daily=` from v1.3.

**Steps:**

- [ ] **Step 6.1: Write the failing route test.**

  ```ts
  it('returns options and counts for the unfiltered request', ...);
  it('applies all four dimensions and the AND-across rule', ...);
  it('ORs within a dimension', ...);                       // teamIds=1,2 must union
  it('tolerates whitespace and ignores non-integer team ids', ...);
  it('ignores an unparseable season and returns 200', ...);
  it('clamps a season outside 2013-2025', ...);
  it('ignores unknown query keys', ...);
  it('never returns a count derived from an incomplete game', ...);
  it('does not collide with the :id route', ...);          // the ordering regression
  ```

  The last test is the one that catches the route-ordering bug. It must fail with a 400/404 if `/filter-options` is ever registered after `/:id`, so it is not optional.

- [ ] **Step 6.2: Run it and confirm red.**

  ```bash
  cd backend && npx vitest run src/__tests__/integration/routes/filterOptions.test.ts
  ```

- [ ] **Step 6.3: Register the route above `/:id`.**

  In `backend/src/routes/matches.ts`, insert the new handler **directly above** the `/:id` handler and leave a comment saying why:

  ```ts
  // MUST stay above '/:id' — Express would otherwise match 'filter-options' as a game id.
  router.get('/filter-options', async (req, res) => { ... });
  ```

  The handler does three things and nothing else: parse `req.query` into a `GameFilters`, call `getFilterOptions`, and `res.json(...)`. All filtering semantics belong in the service. If a validation branch appears here, it is doing the wrong layer's job — except the competition-id shape check, which is a **security** check at the trust boundary and belongs here.

- [ ] **Step 6.4: Verify green, and verify the mount path.**

  ```bash
  cd backend && npx vitest run src/__tests__/integration/routes/filterOptions.test.ts
  ```

  Confirm in `backend/src/app.ts` that the matches router is mounted so the final path is `/api/matches/filter-options` and **not** shadowed by any other `/api/matches/:something` route. If a `GET /api/matches/random` route exists, confirm it is also registered before `/:id`.

- [ ] **Step 6.5: Commit.**

  ```bash
  git add backend/src/routes/matches.ts backend/src/__tests__/integration/routes/filterOptions.test.ts
  git commit -m "feat: expose GET /api/matches/filter-options"
  ```

---

### Task 7: Align player autocomplete on `displayName ?? name` (R6)

**Files:**
- Modify: `backend/src/services/playerService.ts` (search filter and response mapping)
- Modify: `backend/src/__tests__/integration/playerService.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `searchPlayers` matches and returns on `displayName ?? name`. No field is renamed; `Player.name` and `Player.displayName` are untouched.

**Steps:**

- [ ] **Step 7.1: Write the failing tests.**

  In `backend/src/__tests__/integration/playerService.test.ts`, update the existing expectations and add:

  ```ts
  it('matches a player whose name lives only in displayName', ...);
  it('matches a player whose name lives only in name', ...);
  it('does not match on the unused field when the other is populated', ...);
  it('returns displayName in the response when present', ...);
  it('falls back to name in the response when displayName is null', ...);
  ```

  Read the existing tests first and update their expected payloads; they currently encode the old `name`-only behaviour and will fail otherwise.

- [ ] **Step 7.2: Run it and confirm red.**

  ```bash
  cd backend && npx vitest run src/__tests__/integration/playerService.test.ts
  ```

- [ ] **Step 7.3: Implement the change.**

  The `displayName ?? name` expression must appear in **three** places, and the same expression is copied into the mock in Task 8. Missing any one of them is how the asymmetry the task exists to fix comes back:
  1. the `where` clause — `OR: [{ name: { contains: q, mode: 'insensitive' } }, { displayName: { contains: q, mode: 'insensitive' } }]`
  2. the `select` / `orderBy` — order by the resolved value, not by `name`, or search results stop matching display order
  3. the response mapping — `displayName: p.displayName ?? p.name`

  Because `displayName` is nullable, an `OR` is required. A single `displayName` filter alone would drop every player whose value lives in `name`; a single `name` filter alone is today's bug.

  Note in a comment that v1.0.2 owns `Player` display concerns and that this change is additive to it.

- [ ] **Step 7.4: Verify green.**

  ```bash
  cd backend && npx vitest run src/__tests__/integration/playerService.test.ts
  ```

- [ ] **Step 7.5: Commit.**

  ```bash
  git add backend/src/services/playerService.ts backend/src/__tests__/integration/playerService.test.ts
  git commit -m "fix: match and display players on displayName ?? name"
  ```

---

### Task 8: Add the frontend filter types, API client, and mock

**Files:**
- Modify: `frontend/types/index.ts` (the six frozen filter types, additive)
- Create: `frontend/src/lib/filterParams.ts`
- Create: `frontend/src/lib/filterParams.test.ts`
- Create: `frontend/src/lib/filters.ts`
- Create: `frontend/src/lib/filters.test.ts`
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/lib/mockData.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, frozen and verbatim from the contract, and **in the three homes the contract names** — `FilterOption`, `SeasonOption`, `TeamOption`, `FilterOptionsResponse`, `GameFilters` and `EMPTY_FILTERS` in `frontend/types/index.ts`; `filtersToParams` / `paramsToFilters` / `isValidGameFilters` in `frontend/src/lib/filterParams.ts`; `matchesGameFilters` / `hasActiveFilters` / `countActiveFilters` in `frontend/src/lib/filters.ts`:

  ```ts
  // frontend/types/index.ts  (wire shapes, beside every other wire shape)
  export type GameFilterParams = {
    teamIds: number[] | null;
    opponentIds: number[] | null;
    competitionIds: string[] | null;
    seasonFrom: number | null;
    seasonTo: number | null;
  };
  export const EMPTY_FILTERS: Readonly<GameFilterParams>;
  // plus, from the contract, in the same file:
  //   FilterOption, SeasonOption, TeamOption, FilterOptionsResponse, GameFilters

  // frontend/src/lib/filterParams.ts  (pure URL helpers)
  export function paramsToFilters(params: URLSearchParams): GameFilterParams;
  export function filtersToParams(filters: GameFilterParams): URLSearchParams;
  export function isValidGameFilters(value: unknown): value is GameFilterParams;

  // frontend/src/lib/filters.ts  (pure predicates over a GameFilterParams)
  export function matchesGameFilters(filters: GameFilterParams, game: unknown): boolean;
  export function hasActiveFilters(filters: GameFilterParams): boolean;
  export function countActiveFilters(filters: GameFilterParams): number;

  // frontend/lib/api.ts  (async API-client functions, NOT pure helpers)
  export function fetchFilterOptions(filters: GameFilterParams): Promise<FilterOptionsResponse>;
  export function fetchRandomMatch(filters: GameFilterParams): Promise<GameResponse | null>;
  ```

  `paramsToFilters` and `filtersToParams` are the **pure** URL helpers; `fetchFilterOptions` / `fetchRandomMatch` are the **async** API-client functions. The pure and async families are named differently on purpose, so a caller can never pass a `URLSearchParams` where a `GameFilterParams` is required.

  **The frozen names and the file placement are two different things, and both are frozen.** The `GameFilters` / `GameFilterParams` naming discrepancy is **closed, not open**: E1 in `docs/v1/v1.3/overview.md:78` resolves it as two names for one type, and the ratified answer is the frontend name `GameFilterParams` with nullable lists. That record is the authority; the question is not a §9.1 row, and this task does not reopen it. Per §9.1's rule that a plan **verifies** a ratified answer and never re-decides it, the step checks the artifact and records what it found: `frontend/types/index.ts` exports `GameFilterParams`, and this patch introduces no `GameFilters`. A disagreement with the ratified name is a **defect in this plan** to be corrected here, not an escalation settled locally. What this task fixes is only the file placement: there is **no `frontend/types/filters.ts`**. Anything that appears in a JSON response goes in `frontend/types/index.ts`; anything that is a function goes in `frontend/src/lib/`, beside its own test file. `EMPTY_FILTERS` is a value rather than a wire shape, and it lives with the types because `paramsToFilters` returns it and v1.1.2's reducer compares against it.

  **Naming decision — the random-match client keeps its existing name.** The contract draft called this `getRandomMatch`, but `frontend/lib/api.ts` already exports `fetchRandomMatch` and every GET in that file follows the `fetchX` prefix (`fetchMatchById:48`, `fetchReveal:110`). Renaming it would churn three call sites in `frontend/app/missing-eleven/page.tsx` (`:91`, `:183`, `:198`) and break the file's own convention for no benefit. **This patch adds a `filters` parameter to the existing `fetchRandomMatch`; it does not rename it.** `fetchFilterOptions` is new, so it takes the `fetch` prefix to match its neighbours.

**Steps:**

- [ ] **Step 8.1: Write the failing tests for the pure helpers.**

  Create `frontend/src/lib/filters.test.ts` and `frontend/src/lib/filterParams.test.ts`. Both are pure, node-environment, no DOM. Cover:

  ```ts
  describe('paramsToFilters', () => {
    it('returns EMPTY_FILTERS-shaped values for an empty query', ...);
    it('ignores unknown keys', ...);
    it('parses comma-separated team and opponent ids', ...);
    it('tolerates whitespace and repeated commas in a list', ...);
    it('drops non-integer ids and empty segments', ...);
    it('parses seasonFrom and seasonTo as inclusive bounds', ...);
    it('coerces an out-of-range season to null and keeps the other bound', ...);   // 2013-2025
    it('deduplicates ids while preserving order', ...);
    it('preserves seasonFrom > seasonTo rather than normalising it', ...);
    it('parses a competition id with URL-decoded characters', ...);
  });

  describe('filtersToParams', () => {
    it('omits every unfiltered dimension', ...);
    it('serialises all five dimensions', ...);
    it('round-trips through paramsToFilters', ...);
  });

  describe('isValidGameFilters', () => {
    it('accepts EMPTY_FILTERS and a fully-populated object', ...);
    it('rejects a non-array teamIds, a non-integer id, an out-of-range season', ...);
    it('rejects an unknown extra key', ...);
  });

  describe('hasActiveFilters', () => {
    it('is false for EMPTY_FILTERS', ...);
    it('is false for an empty array or a null bound', ...);
    it('is true when any single dimension is set', ...);
  });
  ```

  The round-trip test is the highest-value one in the file: if `filtersToParams` and `paramsToFilters` ever disagree on a key name or a serialisation form, that test is what notices, and v1.1.2 builds the entire URL contract on this pair.

- [ ] **Step 8.2: Run and confirm red.**

  ```bash
  cd frontend && npx vitest run src/lib/filters.test.ts src/lib/filterParams.test.ts
  ```

- [ ] **Step 8.3: Implement the pure helpers and the types.**

  Three files, in this order, so no step ever imports a file that does not exist yet:

  1. **`frontend/types/index.ts`** — add the frozen filter types (`GameFilterParams`, `FilterOption`, `SeasonOption`, `TeamOption`, `FilterOptionsResponse`, `GameFilters`) and `EMPTY_FILTERS`, frozen with `Object.freeze`. Additive; append beside the existing game/match types, do not reorganise the file.
  2. **`frontend/src/lib/filterParams.ts`** — the three pure URL helpers (`paramsToFilters`, `filtersToParams`, `isValidGameFilters`).
  3. **`frontend/src/lib/filters.ts`** — the three pure predicates (`matchesGameFilters`, `hasActiveFilters`, `countActiveFilters`). `matchesGameFilters` and `countActiveFilters` are not exercised by the tests in Step 8.1; v1.1.3 and v1.1.4 are their first callers, and they ship with the same test file so they are collected from this patch onward rather than arriving untested later.

  Implementation rules that the tests above pin:
  - **Unknown keys are ignored**; only the five known keys are read. This is what makes v1.3's `?daily=` and any future param safe to coexist.
  - **Malformed input is coerced per dimension, not per object.** A bad `teamIds` becomes `null` and leaves the other four dimensions intact. Coercing the whole object to `EMPTY_FILTERS` because one season is out of range would silently discard four correct filters and is the more surprising behaviour. The contract's "coerce malformed values back to `EMPTY_FILTERS`" is therefore implemented as *per-dimension* empty values, which is the only reading that does not lose valid user intent. Record this as a clarification in the plan's report.
  - **Idempotent, order-preserving dedupe** for every list, so `?teamIds=1,1,2` and `?teamIds=1,2` produce identical `GameFilterParams` and the URL does not thrash.
  - **Whitespace tolerance** with `trim()`, and **empty segments dropped**, so `?teamIds=1,,2,` yields `[1, 2]`.
  - **Season bounds clamped to 2013–2025 inclusive.** Out-of-range becomes `null` for that bound only. This is where the Global Constraints season rule is enforced on the client, mirroring Task 6.
  - **`seasonFrom > seasonTo` is preserved.** No swap. Zero results is the honest outcome and v1.1.4 explains it in the empty state.
  - `isValidGameFilters` is a strict runtime guard: it must check the exact key set (so an unknown key is rejected), array element types, and season ranges. It is the boundary check for a value that came from outside the app, so it must not trust `typeof` alone.
  - `filtersToParams` **omits** unfiltered dimensions rather than writing an empty value, so the default URL stays clean. Callers that must preserve unrelated params (v1.1.2) merge rather than replace — that is a v1.1.2 concern, but note it in a comment so the next reader does not build the href by replacing the whole query string.

- [ ] **Step 8.4: Implement the API client, real and mock branches.**

  In `frontend/lib/api.ts`, add `fetchFilterOptions` and change `fetchRandomMatch` to accept `GameFilterParams`. Follow the file's existing `USE_MOCK` branching convention exactly — read the current `fetchRandomMatch` (`:39-45`) and mirror its structure, its error handling, and its return type.

  **Return-type change, and why it is required rather than optional:** `fetchRandomMatch` currently returns `Promise<GameResponse>` and throws on failure. It becomes `Promise<GameResponse | null>`, returning `null` when the server has no match for the filter set. v1.1.4's empty state is driven by that `null`, and a 404-as-exception would force the empty state to be implemented as a `catch` branch, which cannot distinguish "no match for this filter" from "the network is down" — two states that must look completely different to a user. The three call sites in `frontend/app/missing-eleven/page.tsx` (`:91`, `:183`, `:198`) must each handle the `null` case in v1.1.2; leaving one to throw is a defect.

  Real branch:
  - `fetchRandomMatch(filters)` → `GET /api/matches/random?` + `filtersToParams(filters)`; return `null` on 404, and `null` on an empty body.
  - `fetchFilterOptions(filters)` → `GET /api/matches/filter-options?` + `filtersToParams(filters)`; return the parsed `FilterOptionsResponse`. Do **not** silently coerce a malformed response into empty arrays — a wrong count is worse than a missing one, so throw and let the caller surface a real error.

  Mock branch: both call the mock helpers, which is the fix for R6's other half. The mock `fetchRandomMatch` must return `null` for a filter combination the mock has no match for, so mock mode exercises the empty state instead of hiding it.

- [ ] **Step 8.5: Implement the mock.**

  In `frontend/lib/mockData.ts`, add `MOCK_FILTER_OPTIONS: FilterOptionsResponse` and a `searchPlayers`-style mock filter that uses `displayName ?? name` — the **identical expression** as Task 7. Add a comment on both mock helpers pointing at the backend task that owns the real behaviour, so the next person to change one knows the other has to change with it. The mock lives outside `src/`, so it is outside the coverage `include`; assert its shape from a test in `src/` if you want it guarded.

  Make the mock counts internally consistent — the mock must satisfy the same R5 invariant the backend does, or mock mode will teach developers a UI that is wrong in production. And make the mock's filtered `fetchRandomMatch` return `null` when the selected filter combination has no match in `MOCK_MATCHES`, so that mock mode reaches v1.1.4's empty state instead of silently returning an unrelated game.

- [ ] **Step 8.6: Verify green, plus the existing frontend suite.**

  ```bash
  cd frontend && npx vitest run src/lib/filters.test.ts src/lib/filterParams.test.ts
  cd frontend && npm run test
  ```

- [ ] **Step 8.7: Commit.**

  ```bash
  git add frontend/types/index.ts frontend/src/lib/filterParams.ts frontend/src/lib/filters.ts frontend/lib/api.ts frontend/lib/mockData.ts frontend/src/lib/filterParams.test.ts frontend/src/lib/filters.test.ts
  git commit -m "feat: add frozen filter types, URL helpers, API client, and mock"
  ```

---

### Task 9: Validate the patch end to end

**Files:**
- Create: `docs/v1/v1.1/CHANGELOG-v1.1.1.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a changelog recording the commands run, their results, the coverage numbers, and the escalation outcome.

**Steps:**

- [ ] **Step 9.1: Run the full backend suite with coverage.**

  ```bash
  set -o pipefail; cd backend && npm run test:coverage 2>&1 | tail -40
  ```

  All four metrics must be ≥ 95% (`backend/vitest.config.ts:26-30`). Paste the actual table into the changelog; do not paraphrase it.

  **The `set -o pipefail` is load-bearing, and it is there on purpose.** This is the
  ratified form for a step that must trim its output
  (`docs/v1/v1.3/plan-v1.3.2-streak-persistence.md`, Global Constraints): with it the
  pipeline reports the first non-zero status in it, so the pass signal stays the
  suite's own. Drop it and keep the pipe, and `| tail -40` reports `tail`'s status,
  which is always 0 — a coverage run that failed the 95% gate then reads as a pass.
  `pipefail` is chosen over the `… > /tmp/out.log 2>&1; status=$?; tail -20 /tmp/out.log;
  exit $status` form because the trimmed output here is for reading only, and `exit`
  would close the developer's shell mid-plan. Every other step in this task runs
  unpiped for the same reason and needs no `pipefail`; do not re-introduce a bare pipe
  on either form.

- [ ] **Step 9.2: Run the full frontend suite and a production build.**

  ```bash
  cd frontend && npm run test
  set -o pipefail; cd frontend && npm run build 2>&1 | tail -30
  ```

  The build **must** be run even though this patch adds no page code, because Task 1 changed the vitest config and Task 8 added modules that the App Router will import in v1.1.2. A build failure here is a v1.1.1 defect, not a v1.1.2 one.

  The suite runs unpiped and the build is trimmed under `set -o pipefail`, for the
  reason Step 9.1 states: trimming is fine, discarding the suite's or build's own exit
  status is not. A `next build` failure must not be able to read as a green step.

- [ ] **Step 9.3: Live-smoke the endpoint.**

  With the app running, confirm by hand that `GET /api/matches/filter-options` returns five keys and that the counts are plausible:

  ```bash
  curl -s 'http://localhost:3000/api/matches/filter-options'
  curl -s 'http://localhost:3000/api/matches/filter-options?teamIds=<a real club id from the response>'
  ```

  With a team selected, the `opponents` counts must change and the `teams` counts must **not** collapse to `0` for the selected team (that is R5 working). If they do collapse, the facet exclusion is inverted.

- [ ] **Step 9.4: Confirm the frozen invariants on real data.**

  ```bash
  # no option may come from an incomplete game
  set -o pipefail; curl -s 'http://localhost:3000/api/matches/filter-options' | grep -o '"season":[0-9]*' | sort -u
  ```

  Expected season keys: 2013 through 2025, and nothing else — no `null`, no 2026, per the Global Constraints.

- [ ] **Step 9.5: Write the changelog and commit.**

  ```bash
  git add docs/v1/v1.1/CHANGELOG-v1.1.1.md
  git commit -m "docs: add v1.1.1 changelog and validation evidence"
  ```

## Acceptance criteria

1. `hasCompleteLineups(game)` is true only when **both** sides have 11 distinct players in state `starting_lineup`, each appearing under the game's own `homeClubId` / `awayClubId`. It returns `false` for 11-10, for 11-11 with a duplicate player, and for a substitute appearance.
2. `completeLineupsWhere()` returns a `Prisma.Sql` fragment — **not** `Prisma.GameWhereInput` — and the same fragment is interpolated by `getRandomMatch` and by the filter-options query. There is one definition of the rule: `grep -c "11" backend/src/lib/lineupCompleteness.ts` finds the predicate, and neither `matchService.ts` nor `filterQuery.ts` re-states the count inline.
3. The 530 incomplete games are unreachable through **every** query this patch adds or modifies. `getRandomMatch` still returns a complete game, and `filterService` derives all five numbers from the same predicate.
4. `GET /api/matches/filter-options` is registered **before** `/:id` in `backend/src/routes/matches.ts`, and it answers with `teams`, `opponents`, `competitions`, `seasons`, and `total` — one row, one round trip. Two queries for one response would contradict the architecture note.
5. `total` and every per-option `count` are **present and numeric on every request**, including an all-zero result. A missing or `null` count is R1 and a defect, not an empty-state.
6. Selecting a dimension does not collapse its own facet to zero (R5). With `teamIds` set, the `teams` counts stay meaningful and the `opponents` counts change.
7. Exactly one grouped statement produces all five numbers (R4). A per-option loop is a defect, and the 95% coverage gate plus Task 5's test hold the line.
8. Season options are 2013–2025 with no `null` and no 2026, on live data and in the integration test.
9. Player search matches `name` OR `displayName` and returns `name` as the search key with `displayName` as presentation only (R6). No field is renamed.
10. `frontend/vitest.config.ts` enumerates all four test roots (`src/**`, `components/**`, `tests/**`, `app/**`), `frontend/vitest.config.mts` is deleted, and **no other v1 patch may re-narrow this include** (R7). A test file outside the include is a silently uncollected suite, which is the failure this task exists to remove.
11. `frontend/components/Shirt.colors.test.tsx` contains real `describe`/`it` calls — a module-level type-check script reporting green while asserting nothing is a defect.
12. The six filter types plus `EMPTY_FILTERS` live in `frontend/types/index.ts` (additive — nothing removed), and `filterParams.ts` / `filters.ts` are pure modules with no React and no network import.
13. Every new frontend test file starts with `// @vitest-environment jsdom`. No `environmentMatchGlobs` and no second `environment` config is added.
14. New complete-lineup fixtures start at `gameId: 5`. Games 1–4 are frozen and unchanged — a new fixture that reuses those ids is a defect, because `matchService.test.ts` asserts their exact appearance contents.
15. `backend/prisma/schema.prisma` is not modified by this patch, and no index is added: `Appearance` already carries `@@index([gameId])`, which is all the correlated subqueries need.
16. Both suites are green, the backend coverage gate passes on all four metrics, `tsc` and `lint` are clean, and the frontend production build succeeds. Neither suite is asserted against a fixed count — both are measured and recorded, per `docs/v1/v1.2/overview.md:209`.

## Validation

| Check | Command | Pass signal |
|---|---|---|
| Backend unit + integration | `cd backend && npm run test` | every file green; count measured and recorded, not asserted |
| Backend coverage gate | `cd backend && npm run test:coverage` | no threshold failure on lines / statements / functions / branches |
| Frontend suite | `cd frontend && npm run test` | every file green; count measured and recorded, not asserted |
| Frontend production build | `cd frontend && npm run build` | no output — required even though this patch adds no page code, because Task 1 changed the vitest config |
| The completeness predicate | `cd backend && npx vitest run src/__tests__/unit/lineupCompleteness.test.ts` | every case green, including the 11-10 and duplicate-player rejections |
| The grouped query | `cd backend && npx vitest run src/__tests__/integration/filterService.test.ts` | all five keys present with numeric counts, and the facet-exclusion case green |
| The route | `cd backend && npx vitest run src/__tests__/integration/routes/filterOptions.test.ts` | answers before `/:id`; no 400 |
| The pure frontend helpers | `cd frontend && npx vitest run src/lib/filterParams.test.ts src/lib/filters.test.ts` | every case green |
| Types | `cd frontend && npx tsc --noEmit` | no output |
| Lint | `cd frontend && npm run lint` | no output |
| The shadow config is gone | `ls frontend/vitest.config.mts` | `No such file or directory` |
| The include is not re-narrowed | `grep -n "include:" frontend/vitest.config.ts` | all four roots present |
| The rule is stated once | `grep -rn "lineupCompleteness" backend/src/lib backend/src/services` | `completeLineupsWhere` imported by both query paths, never re-implemented |
| No schema drift | `git diff --stat -- backend/prisma/schema.prisma` | empty — this patch adds no migration |

## Risks

| Risk | Mitigation |
|---|---|
| **The raw-SQL deviation is unreviewed.** `hasCompleteLineups` returning `Prisma.Sql` instead of the frozen `Prisma.GameWhereInput` is a public-contract change, and the plan carries it as an explicit escalation rather than a decision. | Option (A) is recorded as recommended, with the whole v1.1 filter path already raw SQL, which the grouped counts require anyway. Option (B) is ruled out by §1.1 and the data. Do not begin Task 4 under (B) without a `lead` decision. |
| **An incomplete game is filtered "in" and the UI renders a board with holes.** | The predicate is applied to every query this patch adds or modifies, not just the filtered path, so there is no code path that can return one of the 530. Asserted at the data layer (Task 4) and through the endpoint (Task 6). |
| **A re-narrowed vitest include silently stops collecting a suite.** A file outside the include reports green while asserting nothing — the same false green that `Shirt.colors.test.tsx` produces today. | R7 assigns the widening to this patch and to no other; v1.1.2 and v1.3.1 may add exactly one `resolve.alias` entry each and must leave `include` byte-identical. Step 1.4 stops and escalates if the widening has not already happened. |
| **The new test leaves the database dirty if it fails before `await seed()`.** | `fileParallelism: false` (`backend/vitest.config.ts:8`) runs integration files serially against one database, so a dirty fixture would cascade. Re-run `cd backend && npm run test`; the global setup's `seed()` restores it. Do not start the next file until green. |
| **A new complete-lineup fixture reuses a frozen `gameId`.** | Complete fixtures start at `gameId: 5`; games 1–3 and 4 are frozen because `matchService.test.ts` asserts their exact appearance contents. |
| **Facet exclusion inverted**, so selecting a team collapses the team list to zeros. | R5 is a named assertion in Task 5, plus the live smoke in Step 9.3, which checks that `teams` does not collapse while `opponents` does change. |
| **The route ordering regresses** and `filter-options` is parsed as a game id. | Registered before `/:id` in Task 6, with a route integration test; Step 9.3 exercises it live. |

**Escalate before proceeding if:** Task 4's `completeLineupsWhere` cannot be written as a `Prisma.Sql` fragment without changing a frozen contract beyond the escalation on record (option B), or if widening the vitest include in Task 1 turns out to be blocked by a config change owned by another patch. In either case the deviation is larger than the one already ratified, and a new decision is required rather than a local workaround.
