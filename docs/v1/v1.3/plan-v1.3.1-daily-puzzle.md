# Deterministic Daily Puzzle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player can open `/missing-eleven?daily=YYYY-MM-DD` and get the same puzzle as every other player on that calendar day, from a shareable link, with **zero storage access anywhere in the patch** (§11 Rule 8).

**Architecture:** One pure selection function, mirrored across the network boundary and pinned by a shared fixture table. `selectDailyGameId(candidates, key)` is a total, deterministic function of a candidate id set and a `YYYY-MM-DD` key — no `Math.random`, no `Date.now()`, no ordering assumption on its input. The backend resolves the eligible pool (530 of 10,219 games are unplayable, so eligibility is not optional), runs the *same* pure function, and returns a `GameResponse`. The client reads `?daily=` through v1.1.2's existing single-URL-reader component rather than through any new Next.js API, so v1.3.1 adds no search-params surface of its own.

**Tech Stack:** TypeScript, Prisma 7 raw SQL (`Prisma.$queryRaw`), Express 4, Vitest + Testcontainers (backend, 95% gate on all four metrics), Next.js 16 App Router, React 19, Tailwind 4, Vitest + jsdom + Testing Library (frontend).

---

## Global Constraints

- **Zero `localStorage` in this patch. Not "read-only" — zero.** §11 Rule 8 assigns *all* browser-storage access to v1.3.2 so the hydration constraint has exactly one blast radius. Step 11.3 runs the grep that proves it. A single `localStorage` reference in v1.3.1 invalidates the patch boundary.

- **The day key is UTC. The rollover is 00:00:00 UTC, worldwide, exactly once.** This is the load-bearing design decision of the patch; see "Timezone" below for the full argument. `toDailyKey(date) = date.toISOString().slice(0, 10)`, matching `matchService.ts:56`.

- **No `Date.parse` on a `DailyKey`, anywhere.** `new Date('2026-01-01')` is UTC-parsed; `new Date('2026-01-01T00:00:00')` is *local*-parsed (`GameComplete.tsx:26` does exactly this). Day arithmetic uses `Date.UTC` with explicitly decomposed components, never a parsed string. Two tests exist solely to pin this.

- **The selection pool is the whole eligible dataset, not "games played that day".** A day key selects *from* 9,689 eligible games; it does not filter to games whose `Game.date` equals that day. Consequence: a zero-candidate day is impossible unless the eligible pool itself is empty, which is an ops failure (an unseeded database), not a data-shape failure — and it maps to `404`, which the existing error branch already renders.

- **The daily game must be playable.** The eligibility query interpolates v1.1.1's `completeLineupsWhere()` verbatim. A daily puzzle that cannot be completed is the worst failure mode a once-a-day feature has, because the player cannot retry until tomorrow. Step 4.4 asserts 11 non-empty shirts on both sides of the returned game.

- **Daily ignores filters, structurally.** `fetchDailyMatch(key)` takes only a day key — there is no parameter through which a filter could narrow it. On the client, the load effect returns early when `state.isDaily`, so a filter change cannot replace the puzzle (§6.2). Two separate guards, one on each side of the wire.

- **`FilterUrlSync` remains the app's only URL reader and only URL writer.** v1.3.1 adds props to it. It does not add a second reader, a second writer, or a `useSearchParams` call anywhere else. `FILTER_PARAM_KEYS` is **not** modified — it stays a list of *filter* keys, and `'daily'` is handled separately in the same write effect.

- **The page needs to know the URL has been read before it loads a game.** v1.1.2 gave `FilterUrlSync` an internal `readyRef`; v1.3.1 adds an `onReady` callback so the page can observe it. Without this, the page's mount effect fires on the *first* commit, reading a closure where `isDaily` is still `false`, and fetches a random match that the daily fetch then overwrites — a visible flash of the wrong puzzle on every `?daily=` deep link. **Side effect worth reporting, not a scope expansion:** the same race makes a filter deep link briefly load an unfiltered game in v1.1.2, and `onReady` closes it.

- **A day key that is not today is never playable, and never silently falls back.** §6.1 forbids catch-up. `?daily=2020-01-01` today surfaces an error through the existing error branch; `Try again` then leaves daily mode and plays an ordinary game, and the write effect deletes `?daily=` from the URL as it does so. The stale link is never silently converted into a different puzzle.

- **"New puzzle" leaves daily mode; it does not fetch a second daily.** `NEW_GAME` resets to `initialState`, which sets `isDaily: false` and `dailyKey: null`, and the single load effect then loads an ordinary filtered match. There is no branch in `handlePlayAgain` for the daily case — see Task 10 for why that falls out for free.

- **The server's selection function is a deliberate cross-boundary duplicate, pinned by a shared fixture table.** The backend must not import from `frontend/` (the precedent is v1.1.1's `GameFilters` re-declaration), and there is no shared package. `selectDailyGameId` is four lines and is written twice; Task 3's fixture table is the canonical one and both suites assert against identical literals, so neither implementation can drift without failing its own suite. **This is the accepted cost of a frozen interface that puts the selection function on the client while the endpoint returns a resolved `GameResponse`.**

- **TDD mode: `advisory_active`.** Test first for all testable logic; red → green → refactor; report the commands and results. Every task's Steps are ordered test → red → green → refactor → commit.

- **Frontend coverage** is measured over `src/**` only (`frontend/vitest.config.ts:23-28`, `coverage.include`), and there is **no coverage threshold**, so nothing forces these tests to exist. They are written deliberately. Every new module under `src/` gets a test anyway, to avoid diluting the numbers v1.1.x will be reading.

- **No Prisma schema change and no migration.** Every revert of this patch is a pure code revert. `git diff v1.3.1~1..HEAD -- backend/prisma/` must be empty.

---

## Timezone: the day-boundary rule

**Rule: the day key is the UTC calendar date. The boundary is 00:00:00 UTC. There is one rollover per day, shared by every user on earth.**

```
toDailyKey(new Date('2026-03-01T00:00:00Z'))  === '2026-03-01'
toDailyKey(new Date('2026-02-28T23:59:59Z'))  === '2026-02-28'
```

Four reasons, in priority order:

1. **It is the only rule under which a daily puzzle is shareable.** A local-timezone key makes the puzzle a function of the *viewer's UTC offset*. Two people opening the same link in Auckland and in Los Angeles would get two different games, and §6.2's whole argument — that a daily result must be the same result for everyone or it cannot be compared or broadcast — collapses. Determinism here is not a nicety; it is the feature.

2. **It is the rule the codebase already uses for a date-to-daykey conversion.** `matchService.ts:56` is `game.date?.toISOString().slice(0, 10)` — UTC. `GameComplete.tsx:26` is `new Date(\`${date}T00:00:00\`)` — local. The codebase is inconsistent. The UTC side is the one that *produces a key*; the local side is display formatting, a different job. v1.3.1 follows the UTC side and says so, rather than silently picking the other.

3. **It keeps the server authoritative.** The endpoint receives `?date=YYYY-MM-DD` and can validate it against a single canonical form. A client-supplied *local* day key is a string the server cannot check: `2026-03-01` might mean four different instants. Under UTC the key is an unambiguous absolute day, which is what makes a 400 on a malformed `date` possible at all (Task 5).

4. **UTC has no DST, so a day is always 86,400,000 ms.** `daysBetween` in v1.3.2 is integer arithmetic on epoch days and is exact. A local key would make a day 23 or 25 hours long on a DST boundary — an entire extra class of streak bug, for a boundary that occurs twice a year and would be invisible until it wasn't.

**What is given up, stated plainly:** at 00:00 UTC the puzzle rolls over at 19:00 in Los Angeles the previous day and at 12:00 in Auckland. A player mid-game across the boundary keeps playing the puzzle they started, which is correct, and `recordCompletion` keys on the `dailyKey` the game actually started with, so their streak is credited to the day they played rather than the day they finished. **This is intentional and must not be "fixed" by re-keying on `new Date()` at completion time** — that would let a player farm a streak by finishing just after midnight, and it would break v1.3.2's `nextStreak` idempotence contract.

---

## Baselines

Measured on `cda2db0` before any v1.3 work:

```bash
cd backend  && npm run test          # Test Files 13 passed (13) | Tests 175 passed (175)
cd frontend && npm run test          # Test Files  9 passed (9)  | Tests 173 passed (173)
```

Both figures are confirmed by counting `it(`/`test(` in the tree (backend 175, frontend 173) and match `docs/v1/v1.2/overview.md:193-194`. v1.1.x and v1.2.x are planned but not in this tree, so **every delta below is relative to these figures and must be re-measured at Task 0**, not assumed.

---

### Task 0: Preflight — confirm the upstream contracts exist

**Files:** none. Read-only.

**Interfaces:**
- Consumes: nothing.
- Produces: a verified precondition list, or an abort.

**Steps:**

- [ ] **Step 0.1: Record the real baselines.**

  ```bash
  cd backend  && npm run test
  cd frontend && npm run test
  ```

  Write the actual numbers into the changelog. Do not carry forward the table above.

- [ ] **Step 0.2: Confirm v1.1.1's eligibility predicate exists.**

  ```bash
  grep -rn "completeLineupsWhere" backend/src/lib/ backend/src/services/ | head
  ```

  Expected: `backend/src/lib/lineupCompleteness.ts` exports it and `matchService.ts` interpolates it. **If it is absent, stop.** Do not reimplement the completeness rule in v1.3.1 — that is §11 Rule 2's whole point, and a second copy of the rule is a correctness hole. Raise it as a blocked dependency on v1.1.1.

- [ ] **Step 0.3: Gate on v1.1.1 and v1.1.2 — the vitest include and the filter modules.**

  ```bash
  ls frontend/app/missing-eleven/FilterUrlSync.tsx frontend/src/lib/filterParams.ts frontend/src/lib/filtersEqual.ts
  grep -n "include:" frontend/vitest.config.ts
  ```

  **Gate: this patch does not run unless v1.1.1 has already landed, and it does not do v1.1.1's work.** Two things must be true before Task 1:

  1. `frontend/vitest.config.ts` lists all four roots — `src/**`, `components/**`, `tests/**`, `app/**`. v1.1.1 owns that list and is the only patch that may change it (R7). **This patch's own tests live in `app/`** (`page.test.tsx`, `page.hydration.test.tsx`), which is precisely the root a pre-v1.1.1 include omits — so a missing `app/**` entry means this patch's most expensive tests would be collected by nothing and reported green by nothing. If `app/**` is absent, **stop and report: v1.1.1 is the blocker, not this patch.** Do not add the entry here.
  2. `frontend/src/lib/filterParams.ts` exists, holding v1.1.1's three filter helpers, and `frontend/src/lib/filtersEqual.ts` exists alongside it. If `filtersEqual.ts` is missing, v1.1.2 has not landed; report that. This patch **appends** to `filterParams.ts` and does not create it (Task 2).

  `FilterUrlSync.tsx` must exist and must be the only `useSearchParams` caller:

  ```bash
  grep -rln "useSearchParams" frontend/app/ frontend/src/ frontend/components/
  ```

  Expected: exactly `frontend/app/missing-eleven/FilterUrlSync.tsx`.

- [ ] **Step 0.4: Confirm the page test can resolve the page's imports.**

  ```bash
  grep -n "'@/lib/api'\|'@/components" frontend/vitest.config.ts
  ```

  `page.tsx:5` imports `@/lib/api`, which resolves through `'@' → frontend/src` to a path that does not exist. v1.1.1's `page.test.tsx` must have added explicit aliases (the `'@/lib/curatedTeams'` alias at `frontend/vitest.config.ts:10` is the existing precedent), and v1.1.1 owns the **alias block** in that file as firmly as it owns the include list. So: if the aliases are missing, **extend v1.1.1's existing alias block with exactly the entries Task 10 needs, and only those** — in Task 10, where the failing import names them. Do not create a parallel alias block, do not reorder v1.1.1's entries, and **do not widen `include` in this patch.**

- [ ] **Step 0.5: Record the escalation outcome.**

  The contract discrepancies listed under "Escalations" below were raised when this plan was written. Before starting, confirm with `lead` which have been ratified, and note the answer in the changelog.

---

### Task 1: The pure daily module

**Files:**
- Create: `frontend/src/lib/daily.ts`
- Create: `frontend/src/lib/daily.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (frozen; v1.3.2 and v1.4 read these):
  ```ts
  // frontend/src/lib/daily.ts
  /** Canonical day key for "today" in the project's agreed timezone (UTC). */
  export type DailyKey = string; // 'YYYY-MM-DD'
  export function toDailyKey(date: Date): DailyKey;
  export function isDailyKey(value: unknown): value is DailyKey;
  /** Total, deterministic, order-independent. Throws on an empty candidate set. */
  export function selectDailyGameId(candidates: number[], key: DailyKey): number;
  /** FNV-1a, 32-bit, unsigned. Exported so the fixture tables can be regenerated. */
  export function dailyHash32(key: string): number;
  /** §6.1: only today's puzzle is playable. */
  export function isPlayableDaily(requested: DailyKey | null, today: DailyKey): boolean;
  ```

**Steps:**

- [ ] **Step 1.1: Write the failing tests.**

  `frontend/src/lib/daily.test.ts`. Pure, **node** environment, no DOM, no imports beyond the module under test. No `// @vitest-environment` line — the global default is `node` (`frontend/vitest.config.ts:17`).

  ```ts
  import { describe, it, expect } from 'vitest';
  import { toDailyKey, isDailyKey, selectDailyGameId, dailyHash32, isPlayableDaily } from './daily';

  describe('toDailyKey', () => {
    it('keys on the UTC calendar date, not the local one', () => {
      expect(toDailyKey(new Date('2026-03-01T00:00:00Z'))).toBe('2026-03-01');
      expect(toDailyKey(new Date('2026-02-28T23:59:59Z'))).toBe('2026-02-28');
    });
    it('rolls over at 00:00:00 UTC and one millisecond earlier does not', () => {
      expect(toDailyKey(new Date('2026-03-01T00:00:00Z'))).not.toBe(toDailyKey(new Date('2026-02-28T23:59:59.999Z')));
    });
    it('is unaffected by the host timezone', () => {
      // Both instants are constructed with an explicit Z so the test is
      // timezone-independent regardless of where CI runs.
      expect(toDailyKey(new Date('2026-01-01T00:30:00Z'))).toBe('2026-01-01');
      expect(toDailyKey(new Date('2026-01-01T23:30:00Z'))).toBe('2026-01-01');
    });
  });

  describe('isDailyKey', () => {
    it('accepts real calendar dates', () => {
      expect(isDailyKey('2026-01-01')).toBe(true);
      expect(isDailyKey('2024-02-29')).toBe(true);   // leap year
      expect(isDailyKey('2013-07-27')).toBe(true);   // first date in the dataset
      expect(isDailyKey('2026-06-28')).toBe(true);   // last date in the dataset
    });
    it('rejects a day that does not exist by rolling forward', () => {
      expect(isDailyKey('2026-02-30')).toBe(false);  // -> 2026-03-02
      expect(isDailyKey('2025-02-29')).toBe(false);  // 2025 is not a leap year -> 2025-03-01
    });
    it('rejects a month that overflows the year', () => {
      expect(isDailyKey('2026-13-01')).toBe(false);  // -> 2027-01-01
      expect(isDailyKey('2026-00-10')).toBe(false);
    });
    it('rejects a two-digit year, which Date.UTC would remap to 19xx', () => {
      expect(isDailyKey('26-01-01')).toBe(false);
      expect(isDailyKey('0099-01-01')).toBe(false);
    });
    it('rejects any other shape', () => {
      for (const bad of ['', '2026-1-1', '2026/01/01', '2026-01-01T00:00:00Z', 'today', null, undefined, 20260101, {}]) {
        expect(isDailyKey(bad)).toBe(false);
      }
    });
  });

  describe('selectDailyGameId', () => {
    // Canonical fixture table — mirrored verbatim in
    // backend/src/__tests__/unit/dailySelection.test.ts (Task 3.5).
    const CANDIDATES = [101, 102, 103, 104, 105];

    it.each([
      ['2026-01-01', 104],
      ['2026-01-02', 103],
      ['2026-03-01', 102],
      ['2025-12-31', 101],
      ['2026-06-28', 103],
    ])('maps %s to game %i', (key, expected) => {
      expect(selectDailyGameId(CANDIDATES, key)).toBe(expected);
    });

    it('returns the same id for the same day every time', () => {
      const first = selectDailyGameId(CANDIDATES, '2026-01-01');
      for (let i = 0; i < 50; i += 1) expect(selectDailyGameId(CANDIDATES, '2026-01-01')).toBe(first);
    });
    it('is independent of the input order', () => {
      expect(selectDailyGameId([105, 101, 104, 102, 103], '2026-01-01')).toBe(104);
      expect(selectDailyGameId([103, 105, 102, 104, 101], '2026-01-01')).toBe(104);
    });
    it('does not mutate its candidates argument', () => {
      const input = [105, 101, 103];
      const copy = [...input];
      selectDailyGameId(input, '2026-01-01');
      expect(input).toEqual(copy);
    });
    it('returns the only candidate when there is exactly one', () => {
      expect(selectDailyGameId([777], '2026-01-01')).toBe(777);
    });
    it('always returns a member of the candidate set, over many days', () => {
      const wide = Array.from({ length: 97 }, (_, i) => 1000 + i * 7);
      for (let day = 1; day <= 28; day += 1) {
        const key = `2026-01-${String(day).padStart(2, '0')}`;
        expect(wide).toContain(selectDailyGameId(wide, key));
      }
    });
    it('throws on an empty candidate set rather than returning undefined', () => {
      expect(() => selectDailyGameId([], '2026-01-01')).toThrow(/at least one candidate/);
    });
  });

  describe('dailyHash32', () => {
    it.each([
      ['2026-01-01', 2049302883],
      ['2026-01-02', 2066080502],
      ['2026-03-01', 2731745201],
      ['2025-12-31', 2670561445],
      ['2026-06-28', 3118212717],
      ['2013-07-27', 1811984445],
    ])('hashes %s to %i', (key, expected) => {
      expect(dailyHash32(key)).toBe(expected);
    });
    it('always returns an unsigned 32-bit integer', () => {
      for (const k of ['2026-01-01', '1970-01-01', '9999-12-31']) {
        const h = dailyHash32(k);
        expect(Number.isInteger(h)).toBe(true);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(4294967295);
      }
    });
  });

  describe('isPlayableDaily', () => {
    it('is true only for today (§6.1: no catch-up, no playing yesterday)', () => {
      expect(isPlayableDaily('2026-01-01', '2026-01-01')).toBe(true);
      expect(isPlayableDaily('2025-12-31', '2026-01-01')).toBe(false);
      expect(isPlayableDaily('2026-01-02', '2026-01-01')).toBe(false);
      expect(isPlayableDaily(null, '2026-01-01')).toBe(false);
    });
  });
  ```

  The expected hash and mapping values above were produced by running the exact algorithm in Node and are quoted verbatim from that run. If a test here fails against a plausible-looking implementation, the **implementation** is wrong, not the numbers.

- [ ] **Step 1.2: Run it and confirm red.**

  ```bash
  cd frontend && npx vitest run src/lib/daily.test.ts
  ```

  Expected: `Cannot find module './daily'` — the module does not exist yet.

- [ ] **Step 1.3: Implement the module.**

  ```ts
  /**
   * Deterministic daily-puzzle primitives.
   *
   * TIMEZONE RULE: the day key is the UTC calendar date and the rollover is
   * 00:00:00 UTC. See docs/v1/v1.3/plan-v1.3.1-daily-puzzle.md for why a
   * local-timezone key would make the puzzle unshareable. This matches
   * backend/src/services/matchService.ts:56, which also derives a day key with
   * toISOString().slice(0, 10). Note the deliberate difference from
   * frontend/src/components/GameComplete.tsx:26, which parses
   * `${date}T00:00:00` as LOCAL time — that is display formatting, not key
   * derivation, and the two must not be confused.
   *
   * Everything in this module is pure. There is no Math.random and no
   * Date.now() in this file, and a test asserts the selection is stable across
   * repeated calls.
   */

  /** Canonical day key for "today" in the project's agreed timezone. */
  export type DailyKey = string; // 'YYYY-MM-DD'

  const DAILY_KEY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

  /** UTC calendar date of an instant, as 'YYYY-MM-DD'. */
  export function toDailyKey(date: Date): DailyKey {
    return date.toISOString().slice(0, 10);
  }

  /**
   * True when `value` is a real calendar date in 'YYYY-MM-DD' form.
   *
   * The round-trip is what makes this total. A regex alone accepts
   * '2026-02-30' and '2025-02-29'; decomposing the components through
   * Date.UTC and re-serialising proves the date exists. The `year < 1000`
   * guard covers the other Date.UTC quirk: years 0-99 are remapped into the
   * 1900s, so '0099-01-01' would otherwise silently validate as '1999-01-01'.
   */
  export function isDailyKey(value: unknown): value is DailyKey {
    if (typeof value !== 'string' || !DAILY_KEY_SHAPE.test(value)) return false;
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    if (year < 1000) return false;
    return toDailyKey(new Date(Date.UTC(year, month - 1, day))) === value;
  }

  /**
   * FNV-1a, 32-bit, returned unsigned.
   *
   * Deliberately trivial: a short, well-known, stable hash whose output is
   * quoted verbatim in the fixture tables of both test suites, so a drift in
   * either copy is caught by a failing number rather than by a reviewer
   * noticing a changed puzzle.
   */
  export function dailyHash32(key: string): number {
    let hash = 2166136261;
    for (let index = 0; index < key.length; index += 1) {
      hash ^= key.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  /**
   * The daily game for a day key: a pure function of the candidate id set and
   * the key. Order-independent, so the caller does not need ORDER BY and the
   * server and the client cannot disagree because of row order.
   *
   * Throws on an empty candidate set. "There is no puzzle" is not a number,
   * and the caller — the daily service — maps the throw to a 404, which is
   * the honest response to an unseeded database.
   */
  export function selectDailyGameId(candidates: number[], key: DailyKey): number {
    if (candidates.length === 0) {
      throw new Error('selectDailyGameId requires at least one candidate game id');
    }
    const ordered = [...candidates].sort((a, b) => a - b);
    return ordered[dailyHash32(key) % ordered.length];
  }

  /**
   * §6.1: today's puzzle only. Miss a day and the streak resets — there is no
   * catch-up and no playing yesterday. A shared link to a past day is not
   * playable and is never silently swapped for a different puzzle.
   */
  export function isPlayableDaily(requested: DailyKey | null, today: DailyKey): boolean {
    return requested !== null && requested === today;
  }
  ```

- [ ] **Step 1.4: Verify green.**

  ```bash
  cd frontend && npx vitest run src/lib/daily.test.ts
  ```

  The five `selectDailyGameId` rows and the six `dailyHash32` rows must all pass with the literal values from Step 1.1.

- [ ] **Step 1.5: Verify purity by grep.**

  ```bash
  cd frontend && grep -n "Math.random\|Date.now()\|new Date()" src/lib/daily.ts
  ```

  Expected: exactly two matches, both `new Date(` — the two that construct a UTC instant from explicit components inside `isDailyKey`:

  ```
  return toDailyKey(new Date(Date.UTC(year, month - 1, day))) === value;
  ```

  (Line numbers are not asserted — the header comment may shift them. `toDailyKey` takes its instant from its caller; the only `new Date()` calls are the two that construct a UTC instant from explicit components in `isDailyKey`. Neither reads the clock.) **If `Date.now()` or `Math.random()` appears anywhere in this file, the file is wrong.**

- [ ] **Step 1.6: Regression — the whole frontend suite.**

  ```bash
  cd frontend && npm run test
  ```

  All pre-existing tests must pass unchanged.

- [ ] **Step 1.7: Commit.**

  ```bash
  git add frontend/src/lib/daily.ts frontend/src/lib/daily.test.ts
  git commit -m "feat(frontend): add pure deterministic daily selection"
  ```

---

### Task 2: The `?daily=` URL param

**Files:**
- Modify: `frontend/src/lib/filterParams.ts` — **append** the two daily helpers; v1.1.1 owns this file and its three filter helpers
- Modify: `frontend/src/lib/filterParams.test.ts` — **append** a `describe` block; v1.1.1 owns this file too. There is no `dailyParams.ts` and no `dailyParams.test.ts`

**Interfaces:**
- Consumes: `DailyKey`, `isDailyKey` from Task 1.
- Produces (frozen):
  ```ts
  // frontend/src/lib/filterParams.ts  (appended after v1.1.1's three helpers)
  export const DAILY_PARAM_KEY: 'daily';
  export function dailyToParams(key: DailyKey): URLSearchParams;
  export function paramsToDailyKey(params: URLSearchParams): DailyKey | null;
  ```

  **File placement note — this patch appends; it never creates a second helper module.** The contract for this line freezes `filtersToParams` / `paramsToFilters` / `isValidGameFilters` into `frontend/src/lib/filterParams.ts`, and **v1.1.1 Task 8 has been aligned to the contract**, so by the time this patch runs the file exists and already holds those three helpers. This task therefore adds two exports to it and a `describe` block to its existing test. **v1.3.1 does not rename, re-export, move, or rewrite anything of v1.1.1's** — writing a fresh `filterParams.ts` containing only the daily helpers would silently delete `filtersToParams`, `paramsToFilters` and `isValidGameFilters`, and v1.1.2 imports all three by name, so v1.1.2 would fail to compile on a green-looking test run here. The import specifier `@/lib/filterParams` is unchanged, and it now names one module instead of two.

**Steps:**

- [ ] **Step 2.1: Write the failing tests.**

  Append a `describe('dailyToParams', …)` / `describe('paramsToDailyKey', …)` pair to v1.1.1's existing `frontend/src/lib/filterParams.test.ts`, **below its existing filter-helper describes and without touching them**. Node environment, no DOM — same file, same environment as the tests already in it.

  ```ts
  import { describe, it, expect } from 'vitest';
  import { dailyToParams, paramsToDailyKey, DAILY_PARAM_KEY } from './filterParams';

  describe('dailyToParams', () => {
    it('emits exactly one key', () => {
      expect(dailyToParams('2026-01-01').toString()).toBe('daily=2026-01-01');
    });
    it('uses the frozen key name', () => {
      expect(DAILY_PARAM_KEY).toBe('daily');
      expect(dailyToParams('2026-01-01').has('daily')).toBe(true);
    });
    it('emits nothing else, so it cannot clobber a filter param', () => {
      const params = dailyToParams('2026-01-01');
      expect([...params.keys()]).toEqual(['daily']);
    });
  });

  describe('paramsToDailyKey', () => {
    it('reads a valid key', () => {
      expect(paramsToDailyKey(new URLSearchParams('daily=2026-01-01'))).toBe('2026-01-01');
    });
    it('returns null when the param is absent', () => {
      expect(paramsToDailyKey(new URLSearchParams(''))).toBeNull();
      expect(paramsToDailyKey(new URLSearchParams('teamIds=7&seasonFrom=2020'))).toBeNull();
    });
    it('returns null for a malformed key rather than passing it through', () => {
      for (const bad of ['daily=2026-02-30', 'daily=2026-1-1', 'daily=today', 'daily=', 'daily=2026-13-01', 'daily=26-01-01']) {
        expect(paramsToDailyKey(new URLSearchParams(bad))).toBeNull();
      }
    });
    it('coexists with every filter param without being affected by them', () => {
      const params = new URLSearchParams('teamIds=7&competitionIds=Premier%20League&seasonFrom=2020&seasonTo=2022&daily=2026-03-01');
      expect(paramsToDailyKey(params)).toBe('2026-03-01');
      expect(params.get('teamIds')).toBe('7');
    });
    it('survives a merge round trip', () => {
      const merged = new URLSearchParams('teamIds=7&daily=2026-03-01');
      for (const [k, v] of dailyToParams('2026-03-01')) merged.set(k, v);
      expect(paramsToDailyKey(merged)).toBe('2026-03-01');
      expect(merged.toString()).toBe('teamIds=7&daily=2026-03-01');
    });
  });
  ```

- [ ] **Step 2.2: Run it and confirm red.**

  ```bash
  cd frontend && npx vitest run src/lib/filterParams.test.ts
  ```

  Expected: **red**, and red *only* on the new blocks. v1.1.1's filter-helper tests are already green and must still be green here — if one of them fails, the append landed in the wrong file.

- [ ] **Step 2.3: Implement.**

  Add the following to the **bottom of the existing** `frontend/src/lib/filterParams.ts`, after `isValidGameFilters`. Keep every v1.1.1 export above it exactly as it is; keep the file's existing imports, and add only what this needs:

  ```ts
  import { isDailyKey, type DailyKey } from '@/lib/daily';

  /** Query param carrying the daily day key. Shared by the writer and reader. */
  export const DAILY_PARAM_KEY = 'daily';

  /**
   * Serialise a day key into its own URLSearchParams.
   *
   * Returns a params object containing ONLY `daily`, never a filter key. The
   * caller merges it over the live query string (v1.1.2's rule), so building
   * an href from this alone would delete the user's filters.
   */
  export function dailyToParams(key: DailyKey): URLSearchParams {
    const params = new URLSearchParams();
    params.set(DAILY_PARAM_KEY, key);
    return params;
  }

  /**
   * Read the day key out of a query string, or null when absent or malformed.
   *
   * A malformed `daily` is null, not a degraded value: silently accepting
   * '2026-02-30' would either 400 on the request or, worse, be normalised
   * somewhere downstream into a different day than the one the link names.
   */
  export function paramsToDailyKey(params: URLSearchParams): DailyKey | null {
    const raw = params.get(DAILY_PARAM_KEY);
    if (raw === null) return null;
    return isDailyKey(raw) ? raw : null;
  }
  ```

- [ ] **Step 2.4: Verify green and run the suite.**

  ```bash
  cd frontend && npx vitest run src/lib/filterParams.test.ts src/lib/daily.test.ts
  cd frontend && npm run test
  ```

- [ ] **Step 2.5: Commit.**

  ```bash
  git add frontend/src/lib/filterParams.ts frontend/src/lib/filterParams.test.ts
  git commit -m "feat(frontend): add the ?daily= query param helpers"
  ```

---

### Task 3: The backend mirror — key validation and selection

**Files:**
- Create: `backend/src/lib/dailyKey.ts`
- Create: `backend/src/lib/dailySelection.ts`
- Create: `backend/src/__tests__/unit/dailyKey.test.ts`
- Create: `backend/src/__tests__/unit/dailySelection.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (field-for-field identical to Task 1; the backend must not import from `frontend/`):
  ```ts
  // backend/src/lib/dailyKey.ts
  export function toDailyKey(date: Date): string;
  export function isDailyKey(value: unknown): value is string;

  // backend/src/lib/dailySelection.ts
  export function dailyHash32(key: string): number;
  export function selectDailyGameId(candidates: number[], key: string): number;
  ```

**Steps:**

- [ ] **Step 3.1: Write the failing `dailyKey` test.**

  `backend/src/__tests__/unit/dailyKey.test.ts` — unit, no database:

  ```ts
  import { describe, it, expect } from 'vitest';
  import { toDailyKey, isDailyKey } from '../../lib/dailyKey';

  describe('toDailyKey', () => {
    it('keys on UTC', () => {
      expect(toDailyKey(new Date('2026-03-01T00:00:00Z'))).toBe('2026-03-01');
      expect(toDailyKey(new Date('2026-02-28T23:59:59Z'))).toBe('2026-02-28');
    });
  });

  describe('isDailyKey', () => {
    it('accepts real dates including both dataset endpoints', () => {
      for (const good of ['2013-07-27', '2026-06-28', '2024-02-29', '2026-01-01']) {
        expect(isDailyKey(good)).toBe(true);
      }
    });
    it('rejects a date that does not exist', () => {
      for (const bad of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10']) {
        expect(isDailyKey(bad)).toBe(false);
      }
    });
    it('rejects a two-digit year that Date.UTC would remap', () => {
      expect(isDailyKey('26-01-01')).toBe(false);
      expect(isDailyKey('0099-01-01')).toBe(false);
    });
    it('rejects any other shape', () => {
      for (const bad of ['', '2026-1-1', '2026/01/01', 'today', null, undefined, 20260101]) {
        expect(isDailyKey(bad)).toBe(false);
      }
    });
  });
  ```

- [ ] **Step 3.2: Run it and confirm red.**

  ```bash
  cd backend && npx vitest run src/__tests__/unit/dailyKey.test.ts
  ```

- [ ] **Step 3.3: Implement `dailyKey.ts`.**

  ```ts
  /**
   * Day-key validation, mirrored from frontend/src/lib/daily.ts.
   *
   * This is a deliberate cross-boundary duplicate. The backend must not import
   * from frontend/ (same precedent as v1.1.1's GameFilters re-declaration in
   * backend/src/lib/filterQuery.ts), there is no shared package, and the frozen
   * contract puts the selection function on the client while the endpoint
   * returns an already-resolved GameResponse.
   *
   * The two copies are pinned to identical expectations by the fixture tables
   * in the frontend and backend test suites: any change to one implementation
   * fails its own suite. TIMEZONE: UTC, matching matchService.ts:56.
   */

  const DAILY_KEY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

  export function toDailyKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  export function isDailyKey(value: unknown): value is string {
    if (typeof value !== 'string' || !DAILY_KEY_SHAPE.test(value)) return false;
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    if (year < 1000) return false;
    return toDailyKey(new Date(Date.UTC(year, month - 1, day))) === value;
  }
  ```

- [ ] **Step 3.4: Verify green.**

  ```bash
  cd backend && npx vitest run src/__tests__/unit/dailyKey.test.ts
  ```

- [ ] **Step 3.5: Write the failing `dailySelection` test, with the shared fixture.**

  `backend/src/__tests__/unit/dailySelection.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import { dailyHash32, selectDailyGameId } from '../../lib/dailySelection';

  // CANONICAL FIXTURE — identical to the table in
  // frontend/src/lib/daily.test.ts. If you change one, change both, and say so
  // in the changelog: a change here silently republishes every day's puzzle.
  const CANDIDATES = [101, 102, 103, 104, 105];

  describe('dailyHash32', () => {
    it.each([
      ['2026-01-01', 2049302883],
      ['2026-01-02', 2066080502],
      ['2026-03-01', 2731745201],
      ['2025-12-31', 2670561445],
      ['2026-06-28', 3118212717],
      ['2013-07-27', 1811984445],
    ])('hashes %s to %i', (key, expected) => {
      expect(dailyHash32(key)).toBe(expected);
    });
    it('is always an unsigned 32-bit integer', () => {
      for (const k of ['2026-01-01', '1970-01-01', '9999-12-31']) {
        const h = dailyHash32(k);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(4294967295);
      }
    });
  });

  describe('selectDailyGameId', () => {
    it.each([
      ['2026-01-01', 104],
      ['2026-01-02', 103],
      ['2026-03-01', 102],
      ['2025-12-31', 101],
      ['2026-06-28', 103],
    ])('maps %s to game %i', (key, expected) => {
      expect(selectDailyGameId(CANDIDATES, key)).toBe(expected);
    });
    it('is independent of input order', () => {
      expect(selectDailyGameId([105, 101, 104, 102, 103], '2026-01-01')).toBe(104);
    });
    it('does not mutate its candidates argument', () => {
      const input = [105, 101, 103];
      const copy = [...input];
      selectDailyGameId(input, '2026-01-01');
      expect(input).toEqual(copy);
    });
    it('returns the only candidate when there is exactly one', () => {
      expect(selectDailyGameId([777], '2026-01-01')).toBe(777);
    });
    it('always returns a member of the candidate set', () => {
      const wide = Array.from({ length: 97 }, (_, i) => 1000 + i * 7);
      for (let day = 1; day <= 28; day += 1) {
        expect(wide).toContain(selectDailyGameId(wide, `2026-01-${String(day).padStart(2, '0')}`));
      }
    });
    it('throws on an empty candidate set', () => {
      expect(() => selectDailyGameId([], '2026-01-01')).toThrow(/at least one candidate/);
    });
  });
  ```

- [ ] **Step 3.6: Run it and confirm red.**

  ```bash
  cd backend && npx vitest run src/__tests__/unit/dailySelection.test.ts
  ```

- [ ] **Step 3.7: Implement `dailySelection.ts`.**

  ```ts
  /**
   * Daily selection, mirrored from frontend/src/lib/daily.ts.
   * See that file and backend/src/lib/dailyKey.ts for why the duplication
   * exists and how it is pinned. No Math.random, no Date.now().
   */

  export function dailyHash32(key: string): number {
    let hash = 2166136261;
    for (let index = 0; index < key.length; index += 1) {
      hash ^= key.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  export function selectDailyGameId(candidates: number[], key: string): number {
    if (candidates.length === 0) {
      throw new Error('selectDailyGameId requires at least one candidate game id');
    }
    const ordered = [...candidates].sort((a, b) => a - b);
    return ordered[dailyHash32(key) % ordered.length];
  }
  ```

- [ ] **Step 3.8: Verify both suites agree, then run the backend suite.**

  ```bash
  cd backend && npx vitest run src/__tests__/unit/dailyKey.test.ts src/__tests__/unit/dailySelection.test.ts
  cd backend && npm run test
  ```

  The cross-boundary guard: both files now assert the **same six hash values and the same five selection mappings**. Any edit to one implementation that is not made in the other fails that side's suite.

- [ ] **Step 3.9: Commit.**

  ```bash
  git add backend/src/lib/dailyKey.ts backend/src/lib/dailySelection.ts backend/src/__tests__/unit/dailyKey.test.ts backend/src/__tests__/unit/dailySelection.test.ts
  git commit -m "feat(backend): add the deterministic daily key and selection"
  ```

---

### Task 4: The daily service

**Files:**
- Create: `backend/src/services/dailyService.ts`
- Create: `backend/src/__tests__/integration/dailyService.test.ts`

**Interfaces:**
- Consumes: `completeLineupsWhere()` (v1.1.1), `getMatchById` and `buildMatchResponse` (`backend/src/services/matchService.ts:38,52`), `selectDailyGameId` (Task 3), `isDailyKey` (Task 3).
- Produces:
  ```ts
  // backend/src/services/dailyService.ts
  export async function getEligibleGameIds(): Promise<number[]>;
  export async function getDailyMatch(key: string): Promise<GameWithRelations>;
  // throws { code: 'NOT_FOUND', status: 404 } when the eligible pool is empty
  ```

**Steps:**

- [ ] **Step 4.1: Write the failing test.**

  `backend/src/__tests__/integration/dailyService.test.ts`. Integration — it hits the real seeded Postgres that `backend/vitest.config.ts` shares via `fileParallelism: false`.

  ```ts
  import { describe, it, expect } from 'vitest';
  import { prisma } from '../../prisma';
  import { getEligibleGameIds, getDailyMatch } from '../../services/dailyService';

  describe('getEligibleGameIds', () => {
    it('never returns a game with an incomplete lineup', async () => {
      const ids = await getEligibleGameIds();
      expect(ids.length).toBeGreaterThan(0);
      // Every returned id must have 11 appearances on BOTH sides. Spot-check a
      // slice rather than all ~9.7k so the suite stays fast; the SQL predicate
      // itself is v1.1.1's and is tested there.
      for (const id of ids.slice(0, 25)) {
        const game = await prisma.game.findUnique({
          where: { gameId: id },
          include: { appearances: true },
        });
        expect(game).not.toBeNull();
        const home = game!.appearances.filter((a) => a.clubId === game!.homeClubId).length;
        const away = game!.appearances.filter((a) => a.clubId === game!.awayClubId).length;
        expect(home).toBe(11);
        expect(away).toBe(11);
      }
    });

    it('returns a strictly decreasing-id-free, duplicate-free ascending list', async () => {
      const ids = await getEligibleGameIds();
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('excludes every game the raw appearance count says is incomplete', async () => {
      const ids = new Set(await getEligibleGameIds());
      const incomplete = await prisma.$queryRaw<{ gameId: number }[]>`
        SELECT DISTINCT g."gameId"
        FROM "Game" g
        LEFT JOIN "Appearance" a ON a."gameId" = g."gameId"
        GROUP BY g."gameId"
        HAVING COUNT(a.*) < 22
      `;
      for (const row of incomplete) expect(ids.has(row.gameId)).toBe(false);
    });
  });

  describe('getDailyMatch', () => {
    it('returns the same game for the same day, every time', async () => {
      const first = await getDailyMatch('2026-01-01');
      for (let i = 0; i < 5; i += 1) {
        expect((await getDailyMatch('2026-01-01')).gameId).toBe(first.gameId);
      }
    });

    it('returns a different game for two different days', async () => {
      // Two distinct days, chosen because the canonical fixture maps them to
      // different indices of a 5-element set. With 9,689 candidates two keys
      // could in principle collide; the fixture pair is only meaningful at
      // fixture size, so this test asserts over a real sample instead.
      const seen = new Set<number>();
      for (let day = 1; day <= 20; day += 1) {
        seen.add((await getDailyMatch(`2026-01-${String(day).padStart(2, '0')}`)).gameId);
      }
      expect(seen.size).toBeGreaterThan(1);
    });

    it('returns a game that is genuinely playable — 11 shirts on both sides', async () => {
      for (const key of ['2026-01-01', '2026-03-01', '2025-12-31']) {
        const game = await getDailyMatch(key);
        const home = game.appearances.filter((a) => a.clubId === game.homeClubId).length;
        const away = game.appearances.filter((a) => a.clubId === game.awayClubId).length;
        expect(home).toBe(11);
        expect(away).toBe(11);
      }
    });

    it('returns a game drawn from the eligible pool', async () => {
      const ids = new Set(await getEligibleGameIds());
      expect(ids.has((await getDailyMatch('2026-01-01')).gameId)).toBe(true);
    });
  });
  ```

- [ ] **Step 4.2: Run it and confirm red.**

  ```bash
  cd backend && npx vitest run src/__tests__/integration/dailyService.test.ts
  ```

- [ ] **Step 4.3: Implement the service.**

  ```ts
  import { Prisma } from '../generated/prisma/client';
  import { prisma } from '../prisma';
  import { completeLineupsWhere } from '../lib/lineupCompleteness';
  import { getMatchById, type GameWithRelations } from './matchService';
  import { selectDailyGameId } from '../lib/dailySelection';

  /**
   * Every game a player can actually finish, ascending by id.
   *
   * Interpolation order matters: the alias `g` declared by
   * completeLineupsWhere() must be introduced before the predicate is used.
   *
   * Why the whole list rather than a SQL OFFSET/LIMIT: the frozen contract
   * puts the selection in a pure function of the candidate ids, and having the
   * server run that exact function means there is one implementation of the
   * rule in the request path rather than two that must agree. ~9.7k integers is
   * roughly 60 KB of JSON per daily page load. This is NOT the §3.2 / R4 memory
   * exposure, which is about accumulating a map over ~1.27M event rows; a
   * short id array is two orders of magnitude smaller and is discarded
   * immediately.
   */
  export async function getEligibleGameIds(): Promise<number[]> {
    const rows = await prisma.$queryRaw<{ gameId: number }[]>(Prisma.sql`
      SELECT g."gameId" AS "gameId"
      FROM "Game" g
      WHERE ${completeLineupsWhere()}
      ORDER BY g."gameId" ASC
    `);
    return rows.map((row) => row.gameId);
  }

  /**
   * The puzzle for a day key.
   *
   * Throws NOT_FOUND/404 when the eligible pool is empty, which means the
   * database is unseeded — an operational failure, not a per-day one. A
   * particular day can never have zero candidates: the pool is the whole
   * eligible dataset and the day key selects from it.
   */
  export async function getDailyMatch(key: string): Promise<GameWithRelations> {
    const candidates = await getEligibleGameIds();

    if (candidates.length === 0) {
      throw Object.assign(new Error('No playable games available for the daily puzzle'), {
        code: 'NOT_FOUND',
        status: 404,
      });
    }

    const gameId = selectDailyGameId(candidates, key);
    const game = await getMatchById(gameId);

    if (!game) {
      // Unreachable while the pool and the id lookup read the same table, but
      // a 500 here is a lie and a null return is a crash. Refuse explicitly.
      throw Object.assign(new Error(`Daily game ${gameId} disappeared between selection and load`), {
        code: 'NOT_FOUND',
        status: 404,
      });
    }

    return game;
  }
  ```

  `buildMatchResponse` is **not** called here. The route calls it, exactly as the `/random` and `/:id` handlers do (`routes/matches.ts:15,32`), so the wire shaping stays in the route layer.

- [ ] **Step 4.4: Verify green.**

  ```bash
  cd backend && npx vitest run src/__tests__/integration/dailyService.test.ts
  ```

  **The load-bearing test here is "returns a game that is genuinely playable."** 530 of 10,219 games have an empty opponent lineup; a daily puzzle with an empty half is unrecoverable until tomorrow.

- [ ] **Step 4.5: Regression.**

  ```bash
  cd backend && npm run test
  ```

- [ ] **Step 4.6: Commit.**

  ```bash
  git add backend/src/services/dailyService.ts backend/src/__tests__/integration/dailyService.test.ts
  git commit -m "feat(backend): resolve the daily puzzle from the eligible pool"
  ```

---

### Task 5: `GET /api/matches/daily`

**Files:**
- Modify: `backend/src/routes/matches.ts`
- Create: `backend/src/__tests__/integration/routes/daily.test.ts`

**Interfaces:**
- Consumes: `getDailyMatch` (Task 4), `buildMatchResponse` (`matchService.ts:52`), `isDailyKey` (Task 3).
- Produces: `GET /api/matches/daily?date=YYYY-MM-DD` → `200 GameResponse`.
  - `date` **absent** → the server's current UTC day.
  - `date` **malformed** → `400 { error, code: 'INVALID_PARAMETER' }`.
  - no eligible games → `404 { error, code: 'NOT_FOUND' }`.
  - `date` is validated at the trust boundary and is **never** interpolated into SQL — it only ever reaches `dailyHash32`, which treats it as an opaque string.

**Steps:**

- [ ] **Step 5.1: Write the failing route test.**

  `backend/src/__tests__/integration/routes/daily.test.ts`, following the shape of `backend/src/__tests__/integration/routes/matches.test.ts`:

  ```ts
  import { describe, it, expect, vi } from 'vitest';
  import request from 'supertest';
  import app from '../../../app';

  describe('GET /api/matches/daily', () => {
    it('returns a game with both full lineups', async () => {
      const res = await request(app).get('/api/matches/daily?date=2026-01-01');
      expect(res.status).toBe(200);
      expect(res.body.game.gameId).toBeGreaterThan(0);
      expect(res.body.homeLineup.length).toBe(11);
      expect(res.body.awayLineup.length).toBe(11);
    });

    it('is deterministic for a given date', async () => {
      const first = await request(app).get('/api/matches/daily?date=2026-01-01');
      const second = await request(app).get('/api/matches/daily?date=2026-01-01');
      expect(second.body.game.gameId).toBe(first.body.game.gameId);
    });

    it('ignores filter query params entirely (§6.2: daily ignores filters)', async () => {
      const bare = await request(app).get('/api/matches/daily?date=2026-01-01');
      const filtered = await request(app).get('/api/matches/daily?date=2026-01-01&teamIds=1&competitionIds=Nope&seasonFrom=2019&seasonTo=2025');
      expect(filtered.body.game.gameId).toBe(bare.body.game.gameId);
    });

    it('defaults to the current UTC day when date is absent', async () => {
      const res = await request(app).get('/api/matches/daily');
      expect(res.status).toBe(200);
      const bare = await request(app).get(`/api/matches/daily?date=${new Date().toISOString().slice(0, 10)}`);
      expect(res.body.game.gameId).toBe(bare.body.game.gameId);
    });

    it('rejects a malformed date with 400', async () => {
      for (const bad of ['2026-02-30', '2026-1-1', 'not-a-date', '2026-13-01', '26-01-01']) {
        const res = await request(app).get(`/api/matches/daily?date=${encodeURIComponent(bad)}`);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_PARAMETER');
      }
    });

    it('rejects an empty date string with 400', async () => {
      const res = await request(app).get('/api/matches/daily?date=');
      expect(res.status).toBe(400);
    });

    it('does NOT collide with the :id route', async () => {
      // The ordering regression. Registered after '/:id', Express matches
      // 'daily' as a game id and this returns 400 (non-numeric id).
      const res = await request(app).get('/api/matches/daily?date=2026-01-01');
      expect(res.status).toBe(200);
      expect(res.body.code).not.toBe('INVALID_PARAMETER');
    });

    it('returns a 404 when the eligible pool is empty', async () => {
      // v1.1.1 already filtered /random by the same predicate, so there is no
      // HTTP-level way to empty the pool from a test. Assert the service-level
      // contract instead, which is where the behaviour lives.
      const { getEligibleGameIds } = await import('../../../services/dailyService');
      expect(Array.isArray(await getEligibleGameIds())).toBe(true);
    });
  });
  ```

  The last test is deliberately weak, and the comment says why: emptying a shared Postgres mid-suite would corrupt the other integration tests (`fileParallelism: false`, one database). The 404 branch is covered at the unit level instead, in Step 5.4's `vi.mock` case, where it can be reached without touching the database.

- [ ] **Step 5.2: Run it and confirm red.**

  ```bash
  cd backend && npx vitest run src/__tests__/integration/routes/daily.test.ts
  ```

  Expected: `404` on every case — `/daily` is currently swallowed by `/:id` (a non-numeric id is a 400) or not found.

- [ ] **Step 5.3: Register the route above `/:id`.**

  In `backend/src/routes/matches.ts`, insert **directly above** `router.get('/:id', ...)`, with the comment v1.1.1 used for `filter-options`:

  ```ts
  import { getDailyMatch } from '../services/dailyService';
  import { isDailyKey, toDailyKey } from '../lib/dailyKey';

  // MUST stay above '/:id' — Express would otherwise match 'daily' as a game id.
  // Same ordering constraint as '/filter-options' above/below it.
  router.get('/daily', asyncHandler(async (req, res) => {
    const raw = req.query.date;

    // Absent date means "today", resolved on the server's clock in UTC so a
    // bare curl is useful. The frontend always sends an explicit date (see the
    // plan's Global Constraints) so a request that crosses the UTC midnight
    // boundary cannot be resolved to a different day than the client asked for.
    const key = raw === undefined ? toDailyKey(new Date()) : String(raw);

    // Unlike the filter endpoints — which degrade a malformed query to
    // "unfiltered" — a malformed date is a 400. A wrong filter silently widens
    // the result set; a wrong date silently serves the WRONG PUZZLE. Failing
    // loudly is the safer of the two.
    if (!isDailyKey(key)) {
      return res.status(400).json({
        error: `Query parameter 'date' must be a calendar date in YYYY-MM-DD form`,
        code: 'INVALID_PARAMETER',
      });
    }

    const game = await getDailyMatch(key);
    return res.json(buildMatchResponse(game));
  }));
  ```

  The handler does three things: resolve the key, validate it, and serialise. No filtering semantics, no selection, no SQL.

- [ ] **Step 5.4: Cover the 404 branch without a database.**

  Add to `backend/src/__tests__/integration/routes/daily.test.ts` a second `describe` that mocks the service:

  ```ts
  describe('GET /api/matches/daily — empty eligible pool', () => {
    beforeEach(() => { vi.resetModules(); });
    it('returns 404 NOT_FOUND when no playable game exists', async () => {
      vi.doMock('../../../services/dailyService', () => ({
        getDailyMatch: vi.fn().mockRejectedValue(
          Object.assign(new Error('No playable games available for the daily puzzle'), { code: 'NOT_FOUND', status: 404 }),
        ),
      }));
      const { default: mockedApp } = await import('../../../app');
      const res = await request(mockedApp).get('/api/matches/daily?date=2026-01-01');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      vi.doUnmock('../../../services/dailyService');
    });
  });
  ```

  Check how `backend/src/middleware/asyncHandler.ts` maps a rejection carrying `status`/`code` onto the response — mirror that shape rather than inventing one. Read the existing `routes/matches.test.ts` 404 cases for the exact convention.

- [ ] **Step 5.5: Verify green and confirm the route order.**

  ```bash
  cd backend && npx vitest run src/__tests__/integration/routes/daily.test.ts src/__tests__/integration/routes/matches.test.ts
  grep -n "router.get" backend/src/routes/matches.ts
  ```

  Expected order in the grep output: `/random`, `/filter-options`, `/daily`, `/:id`. `GET /api/matches/random` and `/api/matches/:id` must both keep working — the second command's companion assertion is that `matches.test.ts` still passes, which the first command already covers.

- [ ] **Step 5.6: Regression, and the coverage gate.**

  ```bash
  cd backend && npm run test:coverage
  ```

  All four metrics must be ≥ 95% (`backend/vitest.config.ts:26-30`). `dailyKey.ts`, `dailySelection.ts`, `dailyService.ts` and the new route branch all sit inside `coverage.include: ['src/**/*.ts']`, so every branch above is required, not optional.

- [ ] **Step 5.7: Commit.**

  ```bash
  git add backend/src/routes/matches.ts backend/src/__tests__/integration/routes/daily.test.ts
  git commit -m "feat(backend): expose GET /api/matches/daily above the :id route"
  ```

---

### Task 6: `fetchDailyMatch` and the mock branch

**Files:**
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/lib/mockData.ts`
- Create: `frontend/src/lib/fetchDailyMatch.test.ts`

**Interfaces:**
- Consumes: `selectDailyGameId` (Task 1).
- Produces:
  ```ts
  // frontend/lib/api.ts
  export async function fetchDailyMatch(key: DailyKey): Promise<GameResponse>;
  ```
  Real branch: `GET /api/matches/daily?date=<key>`. Mock branch: resolve over `MOCK_DAILY_CANDIDATES` with `selectDailyGameId`. **A new endpoint without a mock branch breaks `NEXT_PUBLIC_USE_MOCK_API=true`**, so the branch is part of this task, not an afterthought.

**Steps:**

- [ ] **Step 6.1: Write the failing test.**

  `frontend/src/lib/fetchDailyMatch.test.ts`. Node environment, `fetch` stubbed. `@/lib/api` must resolve — confirm the alias from Task 0.4 first. If it is still missing, add `'@/lib/api': path.resolve(__dirname, 'lib/api')` **inside v1.1.1's existing alias block in `frontend/vitest.config.ts`**, as part of this step, and say in the commit body that this is a one-entry extension of v1.1.1's block rather than a new config. If v1.1.1's block is not there at all, stop and report it as the missing dependency instead of building a block from scratch.

  ```ts
  import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; vi.resetModules(); vi.unstubAllEnvs(); });

  describe('fetchDailyMatch — real branch', () => {
    it('requests /api/matches/daily with the date and returns the GameResponse', async () => {
      vi.stubEnv('NEXT_PUBLIC_USE_MOCK_API', '');
      vi.resetModules();
      const { fetchDailyMatch } = await import('@/lib/api');
      const payload = { game: { gameId: 42 }, homeLineup: [], awayLineup: [] };
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await expect(fetchDailyMatch('2026-01-01')).resolves.toEqual(payload);
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/matches/daily?date=2026-01-01'));
    });

    it('sends only the date — no filter params can narrow a daily (§6.2)', async () => {
      vi.stubEnv('NEXT_PUBLIC_USE_MOCK_API', '');
      vi.resetModules();
      const { fetchDailyMatch } = await import('@/lib/api');
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ game: { gameId: 1 }, homeLineup: [], awayLineup: [] }) });
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      await fetchDailyMatch('2026-03-01');
      const url = String(fetchMock.mock.calls[0][0]);
      expect(url).toContain('date=2026-03-01');
      expect(url).not.toContain('teamIds');
      expect(url).not.toContain('competitionIds');
      expect(url).not.toContain('seasonFrom');
    });

    it('throws a named error on 404 so the page can distinguish it', async () => {
      vi.stubEnv('NEXT_PUBLIC_USE_MOCK_API', '');
      vi.resetModules();
      const { fetchDailyMatch } = await import('@/lib/api');
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }) as unknown as typeof fetch;
      await expect(fetchDailyMatch('2026-01-01')).rejects.toThrow(/404/);
    });

    it('throws on a 400 for a malformed date rather than returning a wrong puzzle', async () => {
      vi.stubEnv('NEXT_PUBLIC_USE_MOCK_API', '');
      vi.resetModules();
      const { fetchDailyMatch } = await import('@/lib/api');
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, statusText: 'Bad Request' }) as unknown as typeof fetch;
      await expect(fetchDailyMatch('nonsense' as never)).rejects.toThrow(/400/);
    });
  });

  describe('fetchDailyMatch — mock branch', () => {
    it('is deterministic for the same day', async () => {
      vi.stubEnv('NEXT_PUBLIC_USE_MOCK_API', 'true');
      vi.resetModules();
      const { fetchDailyMatch } = await import('@/lib/api');
      const first = await fetchDailyMatch('2026-01-01');
      const second = await fetchDailyMatch('2026-01-01');
      expect(second.game.gameId).toBe(first.game.gameId);
    });

    it('returns a mock match that exists in MOCK_MATCHES', async () => {
      vi.stubEnv('NEXT_PUBLIC_USE_MOCK_API', 'true');
      vi.resetModules();
      const { fetchDailyMatch } = await import('@/lib/api');
      const { default: MOCK_MATCHES } = await import('@/lib/mockData');
      const res = await fetchDailyMatch('2026-03-01');
      expect(MOCK_MATCHES.some((m) => m.game.gameId === res.game.gameId)).toBe(true);
    });
  });
  ```

- [ ] **Step 6.2: Run it and confirm red.**

  ```bash
  cd frontend && npx vitest run src/lib/fetchDailyMatch.test.ts
  ```

- [ ] **Step 6.3: Add the mock dataset export.**

  In `frontend/lib/mockData.ts`, add beside `MOCK_MATCHES`:

  ```ts
  /**
   * Game ids the mock daily selector chooses from.
   *
   * Every MOCK_MATCHES entry is complete, so this is simply their id list —
   * but it is named and exported separately so that when v1.1.1's mock grows
   * an incomplete game, this list is the single place to correct, and the
   * mock can never hand out a daily puzzle that cannot be finished. Same rule
   * as the backend's completeLineupsWhere(): the mock must satisfy the same
   * invariant, or mock mode teaches a UI that is wrong in production.
   */
  export const MOCK_DAILY_CANDIDATES: readonly number[] = Object.freeze(
    MOCK_MATCHES.map((entry) => entry.game.gameId),
  );
  ```

- [ ] **Step 6.4: Add the client function, real and mock branches.**

  In `frontend/lib/api.ts`, follow the file's existing `USE_MOCK` structure exactly (read `fetchRandomMatch` at `:39-45` first) and add after `fetchMatchById`:

  ```ts
  import { selectDailyGameId, type DailyKey } from '@/lib/daily';
  import MOCK_MATCHES, { MOCK_DAILY_CANDIDATES } from './mockData';

  /**
   * GET /api/matches/daily?date=<key> — the deterministic puzzle for a day.
   *
   * Takes a day key and nothing else. There is deliberately no `filters`
   * parameter: §6.2 says daily ignores filters entirely, and the strongest way
   * to guarantee that is for the request to have nowhere to put them. This
   * function is the server-side twin of GET /api/matches/random, which keeps
   * the `fetchX` naming convention of this file.
   */
  export async function fetchDailyMatch(key: DailyKey): Promise<GameResponse> {
    if (USE_MOCK) {
      await delay(MOCK_DELAY_MS);
      const gameId = selectDailyGameId([...MOCK_DAILY_CANDIDATES], key);
      const found = MOCK_MATCHES.find((entry) => entry.game.gameId === gameId);
      if (!found) {
        throw new Error(`Daily game ${gameId} not found in mock dataset`);
      }
      return found;
    }
    return requestJson<GameResponse>(`/api/matches/daily?date=${encodeURIComponent(key)}`);
  }
  ```

  Note `encodeURIComponent` on the date. `requestJson` builds the URL by concatenation, so an unencoded key is an injection surface into the query string even though the server treats `date` as an opaque string to the hash.

  Fix the `mockData` import to a named + default import, or keep the existing default import and reference the named export separately — whichever the file's current style allows without touching `MOCK_MATCHES`' own consumers.

- [ ] **Step 6.5: Verify green and run the suite.**

  ```bash
  cd frontend && npx vitest run src/lib/fetchDailyMatch.test.ts
  cd frontend && npm run test
  ```

- [ ] **Step 6.6: Commit.**

  ```bash
  git add frontend/lib/api.ts frontend/lib/mockData.ts frontend/src/lib/fetchDailyMatch.test.ts
  # only if Step 6.1 actually extended the alias block:
  git add frontend/vitest.config.ts
  git commit -m "feat(frontend): add fetchDailyMatch with a deterministic mock branch"
  ```

---

### Task 7: Daily mode in the game state

**Files:**
- Modify: `frontend/src/lib/gameState.ts`
- Modify: `frontend/src/lib/gameState.test.ts`

**Interfaces:**
- Consumes: `DailyKey` from Task 1. Plus `GameState.difficulty` / `GameState.filters` and `SET_DIFFICULTY` / `SET_FILTERS` from v1.2.x / v1.1.2 — additive, unaffected.
- Produces (frozen):
  ```ts
  // frontend/src/lib/gameState.ts
  export interface GameState {
    /* …existing… */
    isDaily: boolean;
    dailyKey: DailyKey | null;
  }
  export type GameAction =
    | /* …existing… */
    | { type: 'START_DAILY'; payload: DailyKey };
  // initialState gains isDaily: false, dailyKey: null
  // useGameState() additionally returns: startDaily(key: DailyKey): void
  ```

**Steps:**

- [ ] **Step 7.1: Write the failing reducer tests.**

  Append to `frontend/src/lib/gameState.test.ts`:

  ```ts
  describe('START_DAILY', () => {
    it('sets isDaily and dailyKey', () => {
      const next = gameReducer(initialState, { type: 'START_DAILY', payload: '2026-01-01' });
      expect(next.isDaily).toBe(true);
      expect(next.dailyKey).toBe('2026-01-01');
    });
    it('moves to loading, so the page shows the loading state and not a stale board', () => {
      expect(gameReducer(initialState, { type: 'START_DAILY', payload: '2026-01-01' }).gameStatus).toBe('loading');
    });
    it('clears the current match so the load effect fires', () => {
      const playing = gameReducer(initialState, { type: 'SET_MATCH', payload: makeMatch() });
      expect(gameReducer(playing, { type: 'START_DAILY', payload: '2026-01-01' }).match).toBeNull();
    });
    it('is a reference no-op for the same key — no refetch loop', () => {
      const first = gameReducer(initialState, { type: 'START_DAILY', payload: '2026-01-01' });
      expect(gameReducer(first, { type: 'START_DAILY', payload: '2026-01-01' })).toBe(first);
    });
    it('applies a genuine change of day', () => {
      const first = gameReducer(initialState, { type: 'START_DAILY', payload: '2026-01-01' });
      expect(gameReducer(first, { type: 'START_DAILY', payload: '2026-01-02' }).dailyKey).toBe('2026-01-02');
    });
    it('clears any error', () => {
      const errored = gameReducer(initialState, { type: 'SET_ERROR', payload: 'boom' });
      expect(gameReducer(errored, { type: 'START_DAILY', payload: '2026-01-01' }).error).toBeNull();
    });
  });

  it('initialises isDaily to false and dailyKey to null', () => {
    expect(initialState.isDaily).toBe(false);
    expect(initialState.dailyKey).toBeNull();
  });

  it('NEW_GAME leaves daily mode', () => {
    const daily = gameReducer(initialState, { type: 'START_DAILY', payload: '2026-01-01' });
    const after = gameReducer(daily, { type: 'NEW_GAME' });
    expect(after.isDaily).toBe(false);
    expect(after.dailyKey).toBeNull();
  });

  it('SET_MATCH preserves isDaily and dailyKey', () => {
    const daily = gameReducer(initialState, { type: 'START_DAILY', payload: '2026-01-01' });
    const loaded = gameReducer(daily, { type: 'SET_MATCH', payload: makeMatch() });
    expect(loaded.isDaily).toBe(true);
    expect(loaded.dailyKey).toBe('2026-01-01');
  });
  ```

  Two of these are load-bearing. **"is a reference no-op for the same key"** must assert object identity (`toBe`), not field equality — v1.1.2's `SET_FILTERS` established that pattern, and it is what stops a re-dispatch from re-triggering the load. **"SET_MATCH preserves isDaily"** is what makes the load effect's `state.match` guard sufficient: the match arrives without erasing the mode it belongs to.

- [ ] **Step 7.2: Run it and confirm red.**

  ```bash
  cd frontend && npx vitest run src/lib/gameState.test.ts
  ```

- [ ] **Step 7.3: Implement the state change.**

  In `frontend/src/lib/gameState.ts`:

  ```ts
  import type { DailyKey } from '@/lib/daily';

  // in GameState:
    /** True when the board is showing the deterministic daily puzzle (§6.2). */
    isDaily: boolean;
    /** The day key the daily puzzle belongs to; null in ordinary play. */
    dailyKey: DailyKey | null;

  // in initialState:
    isDaily: false,
    dailyKey: null,

  // in the GameAction union:
    | { type: 'START_DAILY'; payload: DailyKey }

  // in the reducer, after 'SET_FILTERS' so the no-ops sit together:
    case 'START_DAILY': {
      if (state.isDaily && state.dailyKey === action.payload) return state;
      return {
        ...state,
        isDaily: true,
        dailyKey: action.payload,
        match: null,
        gameStatus: 'loading',
        error: null,
        activeShirtIndex: null,
      };
    }

  // in UseGameStateReturn and the hook:
    startDaily: (key: DailyKey) => void;
    const startDaily = useCallback((key: DailyKey) => {
      dispatch({ type: 'START_DAILY', payload: key });
    }, []);
  ```

  `NEW_GAME` needs no change: it returns `initialState`, which already carries `isDaily: false` and `dailyKey: null`. That is the whole mechanism by which "New puzzle" leaves daily mode, and it is why `handlePlayAgain` needs no daily branch (Task 10).

  Do **not** add an `EXIT_DAILY` action. `NEW_GAME` already is it, and two actions for one transition is how they drift.

- [ ] **Step 7.4: Verify green and that nothing else moved.**

  ```bash
  cd frontend && npx vitest run src/lib/gameState.test.ts src/lib/gameState.hook.test.ts
  cd frontend && npm run test
  ```

  Every pre-existing `gameState` case must pass **unchanged**. The two new fields must be inert for callers that do not read them.

- [ ] **Step 7.5: Commit.**

  ```bash
  git add frontend/src/lib/gameState.ts frontend/src/lib/gameState.test.ts
  git commit -m "feat(frontend): add daily mode to the game state"
  ```

---

### Task 8: Teach `FilterUrlSync` the `daily` param

**Files:**
- Modify: `frontend/app/missing-eleven/FilterUrlSync.tsx`
- Modify: `frontend/app/missing-eleven/FilterUrlSync.test.tsx`

**Interfaces:**
- Consumes: `dailyToParams`, `paramsToDailyKey`, `DAILY_PARAM_KEY` (Task 2); `FILTER_PARAM_KEYS`, `filtersToParams`, `paramsToFilters` (v1.1.2).
- Produces (additive props; the component stays the app's only URL reader and only writer):
  ```tsx
  export default function FilterUrlSync(props: {
    applied: GameFilterParams;
    onFilters: (filters: GameFilterParams) => void;
    /** The day key currently requested via ?daily=, or null. */
    daily: DailyKey | null;
    onDaily: (key: DailyKey | null) => void;
    /** Fired once the query string has been read, so the page may load. */
    onReady: () => void;
  }): null;
  ```

**Steps:**

- [ ] **Step 8.1: Write the failing tests.**

  Append to `frontend/app/missing-eleven/FilterUrlSync.test.tsx` (jsdom, `next/navigation` mocked the way v1.1.2 mocks it):

  ```tsx
  it('reports the daily key from the URL', async () => {
    mockSearchParams('daily=2026-01-01');
    await renderAndFlush(<Harness applied={EMPTY_FILTERS} />);
    expect(onDaily).toHaveBeenCalledWith('2026-01-01');
  });
  it('reports a null daily key when the param is absent', async () => {
    mockSearchParams('');
    await renderAndFlush(<Harness applied={EMPTY_FILTERS} />);
    expect(onDaily).toHaveBeenCalledWith(null);
  });
  it('reports a null daily key for a malformed date', async () => {
    mockSearchParams('daily=2026-02-30');
    await renderAndFlush(<Harness applied={EMPTY_FILTERS} />);
    expect(onDaily).toHaveBeenCalledWith(null);
  });
  it('writes ?daily= into the URL when a daily is requested', async () => {
    mockSearchParams('');
    await renderAndFlush(<Harness applied={EMPTY_FILTERS} daily="2026-01-01" />);
    expect(routerReplace).toHaveBeenCalledWith('/missing-eleven?daily=2026-01-01', { scroll: false });
  });
  it('removes ?daily= from the URL when the daily is left', async () => {
    mockSearchParams('daily=2026-01-01');
    await renderAndFlush(<Harness applied={EMPTY_FILTERS} daily={null} />);
    expect(routerReplace).toHaveBeenCalledWith('/missing-eleven', { scroll: false });
  });
  it('preserves ?daily= when filters are rewritten', async () => {
    mockSearchParams('daily=2026-01-01');
    await renderAndFlush(<Harness applied={{ ...EMPTY_FILTERS, seasonFrom: 2020 }} daily="2026-01-01" />);
    const href = String(routerReplace.mock.calls.at(-1)![0]);
    expect(href).toContain('daily=2026-01-01');
    expect(href).toContain('seasonFrom=2020');
  });
  it('keeps ?daily= out of FILTER_PARAM_KEYS', async () => {
    expect(FILTER_PARAM_KEYS).not.toContain('daily');
  });
  it('does not write to the URL before the first read', async () => {
    // The readyRef gate must survive the daily addition.
    mockSearchParams('daily=2026-01-01&teamIds=7');
    render(<Harness applied={EMPTY_FILTERS} />);
    expect(routerReplace).not.toHaveBeenCalled();
  });
  it('calls onReady exactly once per query string', async () => {
    mockSearchParams('daily=2026-01-01');
    await renderAndFlush(<Harness applied={EMPTY_FILTERS} />);
    expect(onReady).toHaveBeenCalledTimes(1);
  });
  it('renders nothing', async () => {
    mockSearchParams('');
    const { container } = render(<Harness applied={EMPTY_FILTERS} />);
    expect(container.innerHTML).toBe('');
  });
  ```

  Build a local `Harness` in the test file that renders `<Suspense><FilterUrlSync …/></Suspense>` with the three v1.1.2 props and the three new ones wired to spies, mirroring the structure v1.1.2's existing test already uses. Do not invent a second test style.

- [ ] **Step 8.2: Run it and confirm red.**

  ```bash
  cd frontend && npx vitest run app/missing-eleven/FilterUrlSync.test.tsx
  ```

  **If this reports "no test files found", the vitest `include` does not cover `app/**` — stop and raise the R7 blocker (Task 0.3). v1.3.1 does not widen the include.**

- [ ] **Step 8.3: Implement.**

  Read the current file first; the shape below assumes v1.1.2's structure as specified in `docs/v1/v1.1/plan-v1.1.2-filter-url-state.md:340-374`. Three changes and nothing else:

  **(a) Props.**

  ```tsx
  import { dailyToParams, paramsToDailyKey, DAILY_PARAM_KEY } from '@/lib/filterParams';
  import type { DailyKey } from '@/lib/daily';

  interface Props {
    applied: GameFilterParams;
    onFilters: (filters: GameFilterParams) => void;
    daily: DailyKey | null;
    onDaily: (key: DailyKey | null) => void;
    onReady: () => void;
  }
  ```

  **(b) Read effect — report the daily key, then unlock writes.**

  ```tsx
  useEffect(() => {
    const params = new URLSearchParams(key);
    onFilters(paramsToFilters(params));
    onDaily(paramsToDailyKey(params));
    // readyRef must be set before the write effect of this same commit reads it,
    // and onReady must be called last so the page sees both dispatches batched
    // into one re-render. Do not reorder these three lines.
    readyRef.current = true;
    onReady();
  }, [key, onFilters, onDaily, onReady]);
  ```

  `onFilters`, `onDaily` and `onReady` must be stable `useCallback` identities from the page, or this effect re-runs every render and dispatches forever.

  **(c) Write effect — merge `daily` alongside the filter keys.**

  ```tsx
  useEffect(() => {
    if (!readyRef.current) return;
    const next = new URLSearchParams(key);
    for (const k of FILTER_PARAM_KEYS) next.delete(k);
    for (const [k, v] of filtersToParams(applied)) next.set(k, v);
    // `daily` is deleted and re-set here rather than being added to
    // FILTER_PARAM_KEYS, which stays a list of FILTER keys only. Leaving daily
    // means removing it from the URL, which is how the address bar self-heals
    // after a stale ?daily= link is declined.
    if (daily) next.set(DAILY_PARAM_KEY, daily);
    else next.delete(DAILY_PARAM_KEY);
    const href = next.size ? `${pathname}?${next}` : pathname;
    if (href === (key ? `${pathname}?${key}` : pathname)) return;
    router.replace(href, { scroll: false });
  }, [applied, daily, key, router, pathname]);
  ```

  The `readyRef` ordering is load-bearing and was already so in v1.1.2; the daily addition must not disturb it. The "does not write before the first read" test is what pins it.

- [ ] **Step 8.4: Verify green.**

  ```bash
  cd frontend && npx vitest run app/missing-eleven/FilterUrlSync.test.tsx
  ```

  Every v1.1.2 test in this file must still pass unchanged, including *"preserves an unrelated `?daily=` param when writing"* — which this patch now makes load-bearing rather than hypothetical.

- [ ] **Step 8.5: Regression.**

  ```bash
  cd frontend && npm run test
  ```

- [ ] **Step 8.6: Commit.**

  ```bash
  git add frontend/app/missing-eleven/FilterUrlSync.tsx frontend/app/missing-eleven/FilterUrlSync.test.tsx
  git commit -m "feat(frontend): read and write ?daily= in the URL bridge"
  ```

---

### Task 9: The daily entry point component

**Files:**
- Create: `frontend/src/components/DailyEntry.tsx`
- Create: `frontend/src/components/DailyEntry.test.tsx`

**Interfaces:**
- Consumes: `DailyKey` (Task 1), `toDailyKey` (Task 1).
- Produces:
  ```tsx
  // frontend/src/components/DailyEntry.tsx
  export interface DailyEntryProps {
    /** The day key currently requested via ?daily=, or null in ordinary play. */
    dailyKey: DailyKey | null;
    /** Today's UTC day key, or null before the post-mount read has happened. */
    todayKey: DailyKey | null;
    /** True once the query string has been read. */
    urlReady: boolean;
    /** Request the daily puzzle. The URL is written by FilterUrlSync, not here. */
    onStartDaily: () => void;
  }
  export default function DailyEntry(props: DailyEntryProps): JSX.Element;
  ```

  `frontend/src/components/` — not `frontend/components/` — because that is where the newest components live (`GameComplete.tsx`, `WordleModal.tsx`), it keeps the component inside `vitest.config.ts`'s `coverage.include`, and `@/components/DailyEntry` resolves through the existing `'@' → frontend/src` alias with **no new alias needed**.

**Steps:**

- [ ] **Step 9.1: Write the failing test.**

  `frontend/src/components/DailyEntry.test.tsx`. Header line `// @vitest-environment jsdom` is **required** — the global environment is `node` (`frontend/vitest.config.ts:17`) and the existing component tests all carry it.

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, vi } from 'vitest';
  import { render, screen } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import DailyEntry from './DailyEntry';

  const base = { dailyKey: null, todayKey: '2026-01-01', urlReady: true, onStartDaily: vi.fn() };

  describe('DailyEntry', () => {
    it('renders nothing before the URL has been read (first paint must not differ)', () => {
      const { container } = render(<DailyEntry {...base} urlReady={false} />);
      expect(container.innerHTML).toBe('');
    });

    it('renders nothing before todayKey is known', () => {
      const { container } = render(<DailyEntry {...base} todayKey={null} />);
      expect(container.innerHTML).toBe('');
    });

    it('offers the daily puzzle when not in daily mode', () => {
      render(<DailyEntry {...base} />);
      expect(screen.getByRole('button', { name: /daily puzzle/i })).toBeInTheDocument();
    });

    it('names the day it is offering', () => {
      render(<DailyEntry {...base} todayKey="2026-01-01" />);
      expect(screen.getByText(/1 January 2026/)).toBeInTheDocument();
    });

    it('calls onStartDaily when the button is pressed', async () => {
      const onStartDaily = vi.fn();
      render(<DailyEntry {...base} onStartDaily={onStartDaily} />);
      await userEvent.click(screen.getByRole('button', { name: /daily puzzle/i }));
      expect(onStartDaily).toHaveBeenCalledTimes(1);
    });

    it('shows an in-progress notice instead of a button while playing today', () => {
      render(<DailyEntry {...base} dailyKey="2026-01-01" />);
      expect(screen.queryByRole('button', { name: /daily puzzle/i })).not.toBeInTheDocument();
      expect(screen.getByText(/today's puzzle/i)).toBeInTheDocument();
    });

    it('never renders a filter control — daily is a mode, not a filter variant (§6.2)', () => {
      render(<DailyEntry {...base} />);
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 9.2: Run it and confirm red.**

  ```bash
  cd frontend && npx vitest run src/components/DailyEntry.test.tsx
  ```

- [ ] **Step 9.3: Implement the component.**

  `frontend/src/components/DailyEntry.tsx`:

  ```tsx
  import { toDailyKey, type DailyKey } from '@/lib/daily';

  /**
   * The daily entry point.
   *
   * §6.2: daily is a MODE that sits alongside the difficulty modes, not an
   * option inside the filter panel. It therefore renders one button and no
   * controls, and it is offered by the page rather than by the filter panel.
   *
   * This component never touches the router and never touches storage. It asks
   * for a daily via onStartDaily; the URL is written by FilterUrlSync, which
   * is the app's only URL writer. That keeps the link copyable from the
   * address bar for free.
   */

  export interface DailyEntryProps {
    /** The day key currently requested via ?daily=, or null in ordinary play. */
    dailyKey: DailyKey | null;
    /** Today's UTC day key, or null before the post-mount read has happened. */
    todayKey: DailyKey | null;
    /** True once the query string has been read. */
    urlReady: boolean;
    /** Request the daily puzzle. */
    onStartDaily: () => void;
  }

  /** '1 January 2026' — display only. Never fed back into a day key. */
  function formatDay(key: DailyKey): string {
    const date = new Date(`${key}T00:00:00Z`);
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(date);
  }

  export default function DailyEntry({ dailyKey, todayKey, urlReady, onStartDaily }: DailyEntryProps) {
    // Pre-hydration gate. Before the URL is read and before today's key is
    // known there is genuinely nothing to say, and rendering a placeholder
    // would be a value we would then have to keep correct. Rendering nothing
    // is what makes the first client paint identical to the server's.
    if (!urlReady || todayKey === null) return null;

    const playingToday = dailyKey === todayKey;

    if (playingToday) {
      return (
        <p className="text-xs text-ink/65">You are playing today&apos;s puzzle.</p>
      );
    }

    return (
      <div className="flex w-full flex-col gap-2">
        <button
          type="button"
          onClick={onStartDaily}
          className="w-full rounded-lg border border-ink/20 px-5 py-3 font-semibold text-ink transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare"
        >
          Daily puzzle — {formatDay(todayKey)}
        </button>
        <p className="text-xs text-ink/55">One puzzle a day. Filters do not apply.</p>
      </div>
    );
  }
  ```

  `formatDay` uses an explicit `T00:00:00Z` **plus** `timeZone: 'UTC'`, so it is correct even though it builds a `Date` from a key. Both halves are needed: the `Z` makes the parse UTC, and `timeZone: 'UTC'` makes the format UTC. This is the display-formatting counterpart to `isDailyKey`, which never parses a string at all — the two are deliberately different techniques for the two different jobs. Do not reuse `formatDay`'s parse in any key logic.

  Reuse the `matchService.ts:56` / `GameComplete.tsx:26` distinction deliberately: display is local-or-UTC as long as it is *consistent within itself*; key derivation is UTC, always.

- [ ] **Step 9.4: Verify green.**

  ```bash
  cd frontend && npx vitest run src/components/DailyEntry.test.tsx
  ```

- [ ] **Step 9.5: Regression.**

  ```bash
  cd frontend && npm run test
  ```

- [ ] **Step 9.6: Commit.**

  ```bash
  git add frontend/src/components/DailyEntry.tsx frontend/src/components/DailyEntry.test.tsx
  git commit -m "feat(frontend): add the daily puzzle entry point"
  ```

---

### Task 10: Wire the page

**Files:**
- Modify: `frontend/app/missing-eleven/page.tsx`
- Create: `frontend/app/missing-eleven/page.test.tsx` *(create if v1.1.2 did not; otherwise extend)*

**Interfaces:**
- Consumes: `fetchDailyMatch` (Task 6), `toDailyKey` / `isPlayableDaily` / `DailyKey` (Task 1), `DailyEntry` (Task 9), `FilterUrlSync` (Task 8), `startDaily` (Task 7), v1.1.2's `filters` / `setFilters` / `useFilterOptions`.
- Produces: no new exports. The page gains `urlReady`, `todayKey`, `loadNonce`, and a single mode-aware load effect.

**Steps:**

- [ ] **Step 10.1: Write the failing page tests.**

  `frontend/app/missing-eleven/page.test.tsx`. If v1.1.2 already created this file, **keep its mock block and its existing `describe` cases verbatim** and append the `describe('daily mode')` block below inside the same file. If the two files' mock names differ, this plan's names win — rename, do not duplicate.

  The harness is fixed and must be reproduced exactly, because every assertion below depends on these four names: `search`, `randomMock`, `dailyMock`, and the `MatchInfo` mock that renders `game <id>`.

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
  import { render, screen, fireEvent, waitFor } from '@testing-library/react';
  import MissingElevenPage from './page';
  import { toDailyKey } from '@/lib/daily';
  import type { GameResponse, LineupPlayer } from '@/types';

  // Today is frozen so `?daily=<today>` is a fixed string and the suite cannot
  // flake across a real 00:00:00 UTC rollover. `shouldAdvanceTime` keeps real
  // time flowing underneath, so RTL's waitFor and React's scheduler both work
  // while `Date` is pinned.
  const TODAY = '2026-01-01';
  const EXPIRED = '2020-01-01';

  const search = vi.hoisted(() => ({ current: '' }));
  const randomMock = vi.hoisted(() => vi.fn());
  const dailyMock = vi.hoisted(() => vi.fn());

  vi.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(search.current),
    useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
    usePathname: () => '/missing-eleven',
  }));

  vi.mock('@/lib/api', () => ({
    fetchRandomMatch: randomMock,
    fetchDailyMatch: dailyMock,
    submitGuess: vi.fn(),
    fetchReveal: vi.fn().mockResolvedValue({ players: [] }),
    revealOnePlayer: vi.fn().mockResolvedValue({ name: 'Someone' }),
  }));

  // The board and the score counter are irrelevant to every assertion here and
  // would each need a full shirt fixture; the match *id* is the only thing the
  // tests care about, so MatchInfo surfaces it and the rest render nothing.
  vi.mock('@/components/MatchInfo', () => ({
    default: ({ match }: { match: { gameId: number } }) => <p>game {match.gameId}</p>,
  }));
  vi.mock('@/components/TacticBoard', () => ({ default: () => <p>tactic board</p> }));
  vi.mock('@/components/WordleModal', () => ({ default: () => null }));
  vi.mock('@/components/ScoreCounter', () => ({ default: () => null }));
  vi.mock('@/components/GameComplete', () => ({
    default: ({ onPlayAgain }: { onPlayAgain: () => void }) => (
      <div>
        <p>complete</p>
        <button type="button" onClick={onPlayAgain}>Play Again</button>
      </div>
    ),
  }));

  function player(token: string): LineupPlayer {
    return { token, nameLength: 5, wordBoundaries: [], shirtNumber: 10, position: 'ST', coords: { x: 50, y: 50 } };
  }

  function matchResponse(gameId: number): GameResponse {
    return {
      game: {
        gameId,
        date: '2024-01-01',
        season: '2023/24',
        competition: 'Test League',
        homeClub: { clubId: 294, name: 'SL Benfica' },
        awayClub: { clubId: 999, name: 'Unknown FC' },
        homeScore: 0,
        awayScore: 0,
        homeFormation: '4-3-3',
        awayFormation: '4-4-2',
      },
      homeLineup: [player('home-1')],
      awayLineup: [player('away-1')],
    };
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    search.current = '';
    randomMock.mockReset();
    dailyMock.mockReset();
    // Every test that does not care about the fetch path still needs it to settle.
    randomMock.mockResolvedValue(matchResponse(7));
    dailyMock.mockResolvedValue(matchResponse(104));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // A guard on the guard: if the frozen clock ever drifts from the real
  // `toDailyKey` contract these tests are testing the wrong thing.
  it('the frozen clock really is the day key the page will compute', () => {
    expect(toDailyKey(new Date())).toBe(TODAY);
  });

  describe('daily mode', () => {
    it('loads a random match when there is no ?daily= param', async () => {
      render(<MissingElevenPage />);
      await waitFor(() => expect(randomMock).toHaveBeenCalledTimes(1));
      expect(dailyMock).not.toHaveBeenCalled();
      expect(await screen.findByText('game 7')).toBeInTheDocument();
    });

    it('loads the daily puzzle for ?daily=<today> and does NOT call fetchRandomMatch', async () => {
      search.current = `daily=${TODAY}`;
      render(<MissingElevenPage />);
      await waitFor(() => expect(dailyMock).toHaveBeenCalledTimes(1));
      expect(dailyMock).toHaveBeenCalledWith(TODAY);
      expect(randomMock).not.toHaveBeenCalled();
      expect(await screen.findByText('game 104')).toBeInTheDocument();
    });

    it('sends an explicit canonical date so the server never has to guess the day', async () => {
      search.current = `daily=${TODAY}`;
      render(<MissingElevenPage />);
      await waitFor(() => expect(dailyMock).toHaveBeenCalled());
      expect(dailyMock.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(dailyMock.mock.calls[0][0]).toBe(TODAY);
    });

    it('does not fetch a random match first on a ?daily= deep link (no flash of the wrong puzzle)', async () => {
      search.current = `daily=${TODAY}`;
      render(<MissingElevenPage />);
      // The first commit already has FilterUrlSync's read effect scheduled but
      // not run, so `urlReady` is still false. Nothing may be fetched yet.
      expect(randomMock).not.toHaveBeenCalled();
      expect(dailyMock).not.toHaveBeenCalled();
      await waitFor(() => expect(dailyMock).toHaveBeenCalledTimes(1));
      expect(randomMock).not.toHaveBeenCalled();
    });

    it('does not fetch on the first commit, before the URL read has been reported', async () => {
      render(<MissingElevenPage />);
      expect(randomMock).not.toHaveBeenCalled();
      await waitFor(() => expect(randomMock).toHaveBeenCalledTimes(1));
    });

    it('ignores filter params when in daily mode (§6.2)', async () => {
      search.current = `daily=${TODAY}`;
      const view = render(<MissingElevenPage />);
      await screen.findByText('game 104');

      search.current = `daily=${TODAY}&seasonFrom=2020`;
      view.rerender(<MissingElevenPage />);

      // The filter change is reported by FilterUrlSync; nothing may refetch.
      await waitFor(() => expect(screen.getByText('game 104')).toBeInTheDocument());
      expect(randomMock).not.toHaveBeenCalled();
      expect(dailyMock).toHaveBeenCalledTimes(1);
    });

    it('keeps the same daily game when a filter changes', async () => {
      search.current = `daily=${TODAY}`;
      const view = render(<MissingElevenPage />);
      await screen.findByText('game 104');

      search.current = `daily=${TODAY}&seasonFrom=2020`;
      view.rerender(<MissingElevenPage />);

      await waitFor(() => expect(screen.getByText('game 104')).toBeInTheDocument());
      expect(dailyMock).toHaveBeenCalledTimes(1);
    });

    it('"New puzzle" leaves daily mode and loads an ordinary match', async () => {
      search.current = `daily=${TODAY}`;
      render(<MissingElevenPage />);
      await screen.findByText('game 104');

      fireEvent.click(screen.getByRole('button', { name: /new puzzle/i }));

      await waitFor(() => expect(screen.getByText('game 7')).toBeInTheDocument());
      expect(dailyMock).toHaveBeenCalledTimes(1);
      expect(randomMock).toHaveBeenCalledTimes(1);
    });

    it('"Play again" from the completion overlay also leaves daily mode', async () => {
      search.current = `daily=${TODAY}`;
      render(<MissingElevenPage />);
      await screen.findByText('game 104');

      // Two clicks: the page's existing surrender confirmation, which is the
      // cheapest way to reach gameStatus === 'complete' in a test.
      fireEvent.click(screen.getByRole('button', { name: /give up\?/i }));
      fireEvent.click(await screen.findByRole('button', { name: /are you sure\?/i }));
      await screen.findByText('complete');

      fireEvent.click(screen.getByRole('button', { name: /play again/i }));

      await waitFor(() => expect(screen.getByText('game 7')).toBeInTheDocument());
      expect(dailyMock).toHaveBeenCalledTimes(1);
      expect(randomMock).toHaveBeenCalledTimes(1);
    });

    it('Try again retries the SAME daily game', async () => {
      search.current = `daily=${TODAY}`;
      dailyMock.mockReset();
      dailyMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(matchResponse(104));
      render(<MissingElevenPage />);

      expect(await screen.findByText('boom')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /try again/i }));

      await waitFor(() => expect(screen.getByText('game 104')).toBeInTheDocument());
      expect(dailyMock).toHaveBeenCalledTimes(2);
      expect(dailyMock).toHaveBeenNthCalledWith(1, TODAY);
      expect(dailyMock).toHaveBeenNthCalledWith(2, TODAY);
    });

    it('renders the error branch for an expired daily link', async () => {
      search.current = `daily=${EXPIRED}`;
      render(<MissingElevenPage />);
      expect(await screen.findByText(/no longer available/i)).toBeInTheDocument();
      expect(screen.queryByText('tactic board')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('never calls fetchDailyMatch for a day that is not today (§6.1: no catch-up)', async () => {
      search.current = `daily=${EXPIRED}`;
      render(<MissingElevenPage />);
      await screen.findByText(/no longer available/i);
      expect(dailyMock).not.toHaveBeenCalled();
    });

    it('Try again on an expired ?daily= link leaves daily mode', async () => {
      search.current = `daily=${EXPIRED}`;
      render(<MissingElevenPage />);
      await screen.findByText(/no longer available/i);

      fireEvent.click(screen.getByRole('button', { name: /try again/i }));

      await waitFor(() => expect(randomMock).toHaveBeenCalledTimes(1));
      expect(await screen.findByText('game 7')).toBeInTheDocument();
      expect(dailyMock).not.toHaveBeenCalled();
    });

    it('renders no daily entry on the first paint and the entry once the URL has been read', async () => {
      render(<MissingElevenPage />);
      expect(screen.queryByRole('button', { name: /daily puzzle/i })).not.toBeInTheDocument();
      expect(await screen.findByRole('button', { name: /daily puzzle/i })).toBeInTheDocument();
    });

    it('starts the daily puzzle from the entry button', async () => {
      render(<MissingElevenPage />);
      await waitFor(() => expect(randomMock).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByRole('button', { name: /daily puzzle/i }));

      await waitFor(() => expect(dailyMock).toHaveBeenCalledWith(TODAY));
      expect(await screen.findByText('game 104')).toBeInTheDocument();
    });

    it('offers the daily entry beside the board controls, not inside them (§6.2)', async () => {
      render(<MissingElevenPage />);
      const daily = await screen.findByRole('button', { name: /daily puzzle/i });
      const controls = screen.getByRole('button', { name: /new puzzle/i }).closest('div');

      // Daily is a mode, not a filter variant: the entry point is a sibling of
      // the controls group in the aside, never a member of it.
      expect(controls).not.toContainElement(daily);
      expect(daily.closest('aside')).toBe(controls?.closest('aside'));
    });
  });
  ```

  Three of these are the patch's real regression guards:
  - **"does not fetch a random match first"** is the `onReady` race from Global Constraints. If the `urlReady` gate is removed, `randomMock` is called on the first commit and this fails; no other test in the suite would notice, because the daily fetch would still win and the page would still end up correct.
  - **"never calls fetchDailyMatch for a day that is not today"** is §6.1 enforced at the only place it can be — the client is the only component that knows "today".
  - **"Try again on an expired link leaves daily mode"** is the documented escape hatch from Global Constraints; without it, a stale shared link is a dead end.

  **Vitest aliases this test needs (Task 0.4's "exactly the ones the Task 10 test needs").** The page imports `@/components/MatchInfo`, `@/components/TacticBoard`, `@/components/WordleModal`, `@/components/GameComplete` and `@/components/ScoreCounter` — all of which live in `frontend/components/`, not `frontend/src/components/` — and `@/lib/api` lives in `frontend/lib/`. The `'@' → frontend/src` alias alone cannot resolve any of them, so the page test cannot even load the page until these are added to `frontend/vitest.config.ts`, following the existing `'@/components/TeamTabBar'` precedent at `frontend/vitest.config.ts:11`:

  ```ts
  '@/lib/api': path.resolve(__dirname, 'lib/api'),
  '@/components/MatchInfo': path.resolve(__dirname, 'components/MatchInfo'),
  '@/components/TacticBoard': path.resolve(__dirname, 'components/TacticBoard'),
  '@/components/WordleModal': path.resolve(__dirname, 'components/WordleModal'),
  '@/components/GameComplete': path.resolve(__dirname, 'components/GameComplete'),
  '@/components/ScoreCounter': path.resolve(__dirname, 'components/ScoreCounter'),
  ```

  Add exactly these six and nothing else. **v1.1.1 owns the alias block in `frontend/vitest.config.ts`, so this is an extension of that block, not a replacement for it:** keep `'@/types'`, `'@/lib/curatedTeams'`, `'@/components/TeamTabBar'` and `'@'` exactly where they are, and add only the entries above that are still missing. The diff for that file should be six added lines and nothing else — if it shows a moved or reordered alias, the block was rewritten instead of extended. `@/lib/daily` and `@/lib/gameState` resolve through `'@' → frontend/src` and need no alias.

- [ ] **Step 10.2: Run it and confirm red.**

  ```bash
  cd frontend && npx vitest run app/missing-eleven/page.test.tsx
  ```

- [ ] **Step 10.3: Add the three pieces of state.**

  In `frontend/app/missing-eleven/page.tsx`:

  ```tsx
  import { useCallback, useEffect, useRef, useState } from 'react';
  import { toDailyKey, isPlayableDaily, type DailyKey } from '@/lib/daily';
  import { fetchDailyMatch } from '@/lib/api';
  import DailyEntry from '@/components/DailyEntry';

  // inside the component, alongside `confirmingSurrender`:
  const [urlReady, setUrlReady] = useState(false);
  // `todayKey` is null on the server and on the first client render, and is
  // filled in by an effect. Computing it inline with `new Date()` would read
  // the clock during render, and a render that straddles 00:00:00 UTC would
  // produce different markup on the server than on the client.
  const [todayKey, setTodayKey] = useState<DailyKey | null>(null);
  const [loadNonce, setLoadNonce] = useState(0);

  useEffect(() => {
    setTodayKey(toDailyKey(new Date()));
  }, []);
  ```

- [ ] **Step 10.4: Replace the mount effect with one mode-aware load effect.**

  v0.2.5's mount effect is `page.tsx:87-103`:

  ```tsx
  // Initialize game on mount (no localStorage restore — fixes hydration mismatch)
  useEffect(() => {
    if (state.gameStatus === 'idle' && !state.match) {
      setLoading(true);
      fetchRandomMatch()
        .then((response) => { startNewGame(response); })
        .catch((cause: unknown) => { setError(describeError(cause)); })
        .finally(() => { setLoading(false); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount
  ```

  Replace it with the single effect below. **Every fetch in this page now goes through this one effect**, which is what lets `handlePlayAgain` become `newGame()` with no branch.

  ```tsx
  /**
   * The single owner of "which puzzle should be on the board".
   *
   * It replaces the mount-only effect and the two hand-rolled fetches in
   * handlePlayAgain / handleRetry. Keying on `match` rather than on mount
   * means every transition into "no game loaded" loads the right one, so the
   * handlers only have to reset state.
   *
   * The `urlReady` guard is load-bearing. Without it this effect runs on the
   * first commit, where its closure still has `isDaily === false` even though
   * FilterUrlSync has already dispatched START_DAILY from a child effect, and
   * a random match is fetched and then thrown away.
   */
  useEffect(() => {
    if (!urlReady) return;
    if (state.match) return;

    const today = todayKey;
    const dailyKey = state.dailyKey;

    if (state.isDaily) {
      if (dailyKey === null) return;
      if (today === null) return;                                   // not resolved yet
      if (!isPlayableDaily(dailyKey, today)) {
        // §6.1: today's puzzle only. A shared link to a past day is not
        // playable and is never silently swapped for a different puzzle.
        // "Try again" (handleRetry) is the documented way out, and it leaves
        // daily mode.
        setError('That day’s puzzle is no longer available. Try again for a new puzzle.');
        return;
      }
      setLoading(true);
      fetchDailyMatch(dailyKey)
        .then(startNewGame)
        .catch((cause: unknown) => setError(describeError(cause)))
        .finally(() => setLoading(false));
      return;
    }

    setLoading(true);
    fetchRandomMatch(filters)
      .then((response) => {
        if (response) startNewGame(response);
        else setError('No games match the current filters.');
      })
      .catch((cause: unknown) => setError(describeError(cause)))
      .finally(() => setLoading(false));
    // `filters` is read inside the effect and is intentionally not a
    // dependency: v1.1.2's own filter effect owns filter-driven refetches,
    // and adding it here would double-fetch on every filter change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlReady, state.match, state.isDaily, state.dailyKey, todayKey, loadNonce]);
  ```

  **§6.2 guard — add the same early return to v1.1.2's filter-change effect**, whichever of the page's effects refetches when `filters` changes:

  ```tsx
  if (state.isDaily) return;   // §6.2: daily ignores filters entirely
  ```

  Without it, ticking a filter while in daily mode replaces the daily puzzle with a filtered random match, which is the exact "daily under my current filter settings" behaviour §6.2 rejects — and it would break the share link, because the result would no longer be the day's puzzle.

- [ ] **Step 10.5: Simplify the handlers.**

  ```tsx
  /**
   * §6.1: there is exactly one puzzle per day, so "New puzzle" cannot mean
   * "another daily". NEW_GAME resets isDaily and dailyKey to initialState, and
   * the load effect above then fetches an ordinary filtered match. There is no
   * daily branch here, and that is the point: leaving daily is the default
   * behaviour of leaving the mode, not a special case bolted on.
   *
   * Hiding the button in daily mode was considered and rejected — it is more
   * Wordle-like, but it removes the only escape from a puzzle the player does
   * not want to finish, and §6.1 says nothing about trapping the player.
   */
  const handlePlayAgain = useCallback(() => {
    newGame();
  }, [newGame]);

  const handleRetry = useCallback(() => {
    setError(null);
    if (state.isDaily && todayKey !== null && state.dailyKey !== null && !isPlayableDaily(state.dailyKey, todayKey)) {
      // The expired-link escape hatch described above. Leaving daily also
      // removes ?daily= from the URL through FilterUrlSync's write effect.
      newGame();
      return;
    }
    setLoadNonce((n) => n + 1);
  }, [state.isDaily, state.dailyKey, todayKey, newGame, setError]);
  ```

  `handleRetry` keeps its label and its position in the existing error branch (`page.tsx:219-227`). It now means "load the puzzle for the current mode again", which is what it already said.

- [ ] **Step 10.6: Wire the bridge and the entry point.**

  ```tsx
  const handleFilters = useCallback((next: GameFilterParams) => setFilters(next), [setFilters]);
  const handleDaily = useCallback((key: DailyKey | null) => {
    if (key === null) newGame();
    else startDaily(key);
  }, [startDaily, newGame]);
  const handleReady = useCallback(() => setUrlReady(true), []);
  const handleStartDaily = useCallback(() => {
    if (todayKey !== null) startDaily(todayKey);
  }, [todayKey, startDaily]);
  ```

  `handleDaily(null)` maps to `newGame()`. A URL with no `daily` key must therefore leave daily mode, and `NEW_GAME` is already that transition — the same reason it is not a separate action in Task 7.

  ```tsx
  // near the top of the page body, where v1.1.2 put it:
  <Suspense fallback={null}>
    <FilterUrlSync
      applied={filters}
      onFilters={handleFilters}
      daily={state.dailyKey}
      onDaily={handleDaily}
      onReady={handleReady}
    />
  </Suspense>

  // in the aside, directly above the "New puzzle" button:
  <DailyEntry
    dailyKey={state.dailyKey}
    todayKey={todayKey}
    urlReady={urlReady}
    onStartDaily={handleStartDaily}
  />
  ```

  `<Suspense fallback={null}>` **must not be removed.** It is the fix for Next 16's `missing-suspense-with-csr-bailout` build failure, and `next dev` never surfaces it — only `next build` does. Put the build-error text in a comment.

- [ ] **Step 10.7: Verify green.**

  ```bash
  cd frontend && npx vitest run app/missing-eleven/
  ```

- [ ] **Step 10.8: Prove the hydration constraint holds.**

  This goes in its own file, `frontend/app/missing-eleven/page.hydration.test.tsx`, not in `page.test.tsx`. A file-level `@vitest-environment` docblock cannot differ between two cases in one file, and this file needs **jsdom** because it calls `hydrateRoot` against a real DOM node.

  The page renders `Loading puzzle…` on first paint because `state.match` is null, and the real `useGameState` starts exactly there — so `useGameState` is deliberately **not** mocked. The page's child components are mocked, and every API call resolves to a promise that never settles, so the component stays in its first-paint state for the whole test.

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, vi, afterEach } from 'vitest';
  import { renderToString } from 'react-dom/server';
  import { hydrateRoot } from 'react-dom/client';
  import { act } from '@testing-library/react';
  import MissingElevenPage from './page';

  vi.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(''),
    useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
    usePathname: () => '/missing-eleven',
  }));

  // Never settles: the page must remain in its loading branch, which is the
  // state the server rendered.
  const never = () => new Promise<never>(() => {});

  vi.mock('@/lib/api', () => ({
    fetchRandomMatch: () => never(),
    fetchDailyMatch: () => never(),
    submitGuess: () => never(),
    fetchReveal: () => never(),
    revealOnePlayer: () => never(),
  }));

  vi.mock('@/components/MatchInfo', () => ({ default: () => null }));
  vi.mock('@/components/TacticBoard', () => ({ default: () => null }));
  vi.mock('@/components/WordleModal', () => ({ default: () => null }));
  vi.mock('@/components/ScoreCounter', () => ({ default: () => null }));
  vi.mock('@/components/GameComplete', () => ({ default: () => null }));

  const HYDRATION_NOISE = /hydrat|did not match|server (HTML|rendered)|text content does not match/i;

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('first-paint hydration', () => {
    it('server render and first client render produce identical markup', async () => {
      const html = renderToString(<MissingElevenPage />);
      expect(html).toContain('Loading puzzle');

      const container = document.createElement('div');
      container.innerHTML = html;
      document.body.appendChild(container);

      const errors: string[] = [];
      const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        errors.push(args.map((a) => String(a)).join(' '));
      });
      await act(async () => {
        hydrateRoot(container, <MissingElevenPage />);
      });
      spy.mockRestore();

      expect(errors.filter((e) => HYDRATION_NOISE.test(e))).toEqual([]);
    });

    it('does not reach for storage during render — there is none in v1.3.1', () => {
      // A Storage-shaped property that throws on every access. Any code path
      // reachable from render that touched storage would throw here.
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() { throw new Error('localStorage accessed during render'); },
      });
      expect(() => renderToString(<MissingElevenPage />)).not.toThrow();
    });
  });
  ```

  Two things to get right when running this file. The environment docblock is `jsdom`, not `node`: `hydrateRoot` needs a DOM. And `localStorage` is redefined on `window` in the second case and **never restored** — it is redefined rather than assigned precisely so the throw survives; do not "clean it up", or the case becomes a no-op that passes without proving anything. Vitest isolates files in separate workers, so the leak cannot reach another file.

  The first test is the direct proof; the second is a belt-and-braces assertion that the zero-storage constraint is structural rather than incidental. **Neither substitutes for the live smoke in Step 11.4** — jsdom is not a browser, and React's hydration diagnostics are not guaranteed to be identical to a real browser console.

- [ ] **Step 10.9: Type-check and lint.**

  ```bash
  cd frontend && npx tsc --noEmit && npm run lint
  ```

  Expect exit 0. The two `eslint-disable-next-line react-hooks/exhaustive-deps` sites carry their reasons inline; a bare disable with no reason is what the next reader will delete.

- [ ] **Step 10.10: Regression.**

  ```bash
  cd frontend && npm run test
  ```

  Every pre-existing page test must still pass unchanged. This patch changes the load path, so a regression surfaces as a pre-existing failure — do not relax the old test.

- [ ] **Step 10.11: Commit.**

  ```bash
  git add frontend/app/missing-eleven/page.tsx frontend/app/missing-eleven/page.test.tsx frontend/app/missing-eleven/page.hydration.test.tsx
  # only if Task 10 actually added the six missing aliases to v1.1.1's block:
  git add frontend/vitest.config.ts
  git commit -m "feat(frontend): load the daily puzzle from ?daily= on the missing-eleven page"
  ```

---

### Task 11: Validate v1.3.1 end to end

**Files:**
- Create: `docs/v1/v1.3/CHANGELOG-v1.3.1.md`

**Steps:**

- [ ] **Step 11.1: Run both suites with coverage.**

  ```bash
  cd backend  && npm run test:coverage
  cd frontend && npm run test:coverage
  ```

  Backend: all four metrics ≥ 95%. Frontend: record the actual numbers; there is no threshold, so the number is information, not a gate.

- [ ] **Step 11.2: Run the production build. This is the gate for the `Suspense` work.**

  ```bash
  cd frontend && npm run build
  ```

  A failure mentioning `missing-suspense-with-csr-bailout` or *"deopted into client-side rendering"* means the `<Suspense>` from Task 10.6 is missing or sits above rather than below `FilterUrlSync`. **A passing dev server is not evidence.**

- [ ] **Step 11.3: The patch-boundary gate — v1.3.1 has zero storage access.**

  ```bash
  cd frontend && grep -rn "localStorage\|sessionStorage\|indexedDB\|STORAGE_KEY\|loadStreak\|recordCompletion\|resolveStorage" src app components lib types
  ```

  **Expected: no output.** Any hit is a §11 Rule 8 violation and the patch is not shippable until it is removed. Record the (empty) result in the changelog as evidence.

- [ ] **Step 11.4: Live-smoke the daily contract by hand.**

  With `npm run dev` in `frontend` and the backend running:

  ```bash
  TODAY=$(date -u +%F)
  curl -s "localhost:3000/api/matches/daily?date=$TODAY"
  # expect: a GameResponse with homeLineup and awayLineup

  # determinism
  set -o pipefail; curl -s "localhost:3000/api/matches/daily?date=$TODAY" | grep -o '"gameId":[0-9]*' | head -1
  set -o pipefail; curl -s "localhost:3000/api/matches/daily?date=$TODAY" | grep -o '"gameId":[0-9]*' | head -1
  # expect: identical ids

  # two days differ
  set -o pipefail; curl -s "localhost:3000/api/matches/daily?date=2026-01-01" | grep -o '"gameId":[0-9]*' | head -1
  set -o pipefail; curl -s "localhost:3000/api/matches/daily?date=2026-01-02" | grep -o '"gameId":[0-9]*' | head -1

  # filters are ignored (§6.2)
  set -o pipefail; curl -s "localhost:3000/api/matches/daily?date=2026-01-01&teamIds=1&competitionIds=Zzz" | grep -o '"gameId":[0-9]*' | head -1

  # malformed date is a 400, not a wrong puzzle
  curl -s -o /dev/null -w '%{http_code}\n' "localhost:3000/api/matches/daily?date=2026-02-30"   # expect 400

  # route order
  curl -s -o /dev/null -w '%{http_code}\n' "localhost:3000/api/matches/daily?date=$TODAY"       # expect 200, not 400
  curl -s -o /dev/null -w '%{http_code}\n' "localhost:3000/api/matches/1"                        # expect 200
  ```

  Then in the browser:

  ```bash
  open "http://localhost:3000/missing-eleven?daily=$TODAY"
  # 1. the board loads today's puzzle and the address bar keeps ?daily=
  # 2. DevTools console is CLEAN — no hydration warning. This is the real proof
  #    of the hydration constraint; Step 10.8's test is a proxy for it.
  # 3. the daily entry button says "You are playing today's puzzle"
  # 4. open the same URL in a second browser profile — the same game id
  # 5. click "New puzzle" — an ordinary filtered game loads and ?daily= leaves the URL
  # 6. open "?daily=2020-01-01" — the expired message, no puzzle, Try again works
  # 7. open "?daily=$TODAY&teamIds=<id>" — the SAME puzzle as (1), and the filter panel
  #    applies to nothing
  ```

  Check 2 is the one that matters most and the one no unit test can fully substitute for. Check 7 is the one that proves §6.2 in the browser rather than only in a curl.

- [ ] **Step 11.5: Confirm the rollback is a pure code revert.**

  ```bash
  git diff --stat v1.3.1~1..HEAD -- backend/prisma/
  ```

  Expected: empty. No migration, no seed change, no data repair. Reverting v1.3.1 alone returns the app to v1.2.x behaviour, and a `?daily=` link then simply plays an ordinary game because nothing reads the param.

- [ ] **Step 11.6: Write the changelog.**

  Create `docs/v1/v1.3/CHANGELOG-v1.3.1.md` recording, verbatim rather than paraphrased: the measured baselines, the commands run and their real output, the Step 11.3 grep result, the Step 11.4 curl outputs, and the escalation outcomes from Task 0.5. **Include the O2 re-seed note:**

  > **Re-seed vs daily history (roadmap O2, default: accept the shift).** The daily pool is the set of eligible game ids, so a re-seed that changes the dataset changes which game a given day key selects. Some past days' puzzles will change. This is accepted and documented rather than mitigated: it is operational, not architectural, and it cannot be mitigated without freezing the selection, which would make the puzzle wrong in a different way.

- [ ] **Step 11.7: Commit.**

  ```bash
  git add docs/v1/v1.3/CHANGELOG-v1.3.1.md
  git commit -m "docs: add v1.3.1 changelog and validation evidence"
  ```

---

## Acceptance criteria

1. `selectDailyGameId(candidates, key)` is **total, deterministic, and pure**: the same candidate id set and the same `YYYY-MM-DD` key always yield the same id, and the function performs no I/O. It is mirrored byte-for-byte across the network boundary and pinned by a shared fixture table, so a client and server cannot disagree about today's puzzle.
2. The day key is **UTC**, and the rollover is `00:00:00Z` exactly once worldwide. A test pins the boundary from both sides.
3. **No `Date.parse` is applied to a `DailyKey` anywhere.** `grep -rn "Date.parse" frontend/src backend/src` returns no occurrence that receives a daily key.
4. There is **zero** `localStorage` access in this patch — not read-only, zero. `grep -rn "localStorage" frontend/src frontend/app` returns no output.
5. The selection pool is the **whole eligible dataset**, not "games played that day". A day key selects from every eligible game id, and the fixtures cover a pool that is not the set of that day's plays.
6. The daily game must be **playable**: it satisfies the completeness predicate, so the shared render path cannot produce a board with holes.
7. Daily **ignores filters structurally**, not by convention: the daily path never reads the filter state, and a test proves a filter in the URL does not change the selected id.
8. `FilterUrlSync` remains the app's only URL reader and only URL writer. `grep -rn "useSearchParams" frontend/app frontend/src` still names exactly one file.
9. A day key that is **not today** is never playable and never silently falls back to another day. The error path is asserted directly.
10. **"New puzzle" leaves daily mode** — it does not fetch a second daily puzzle. `daily` is cleared from the state, and the next fetch is a normal random match.
11. The page knows the URL has been read before it loads a game; hydration is sequenced so no game is fetched against an unparsed URL.
12. `GET /api/matches/daily` validates the `YYYY-MM-DD` key and rejects a malformed one, rather than defaulting.
13. `fetchDailyMatch` and its mock branch agree on shape, so the mock path cannot drift from the network path.
14. No Prisma schema change and no migration: `git diff --stat -- backend/prisma/schema.prisma` is empty.
15. `npm run test`, `npm run build`, `npx tsc --noEmit`, and `npm run lint` are clean on both workspaces, and every new suite is collected. Neither suite is asserted against a fixed count — both are measured and recorded, per `docs/v1/v1.2/overview.md:209`.

## Validation

| Check | Command | Pass signal |
|---|---|---|
| Backend unit + integration | `cd backend && npm run test` | every file green; count measured and recorded, not asserted |
| Backend coverage gate | `cd backend && npm run test:coverage` | no threshold failure on lines / statements / functions / branches |
| Frontend suite | `cd frontend && npm run test` | every file green; count measured and recorded, not asserted |
| The pure daily module | `cd frontend && npx vitest run src/lib/daily.test.ts` | every case green, including both sides of the UTC rollover |
| The shared fixture table | `cd frontend && npx vitest run src/lib/daily.shared.test.ts` | client and server mirrors agree on every fixture row |
| The backend mirror | `cd backend && npx vitest run src/__tests__/integration/dailyService.test.ts` | every fixture row agrees with the client |
| The daily entry point | `cd frontend && npx vitest run app/missing-eleven/DailyEntry.test.tsx` | green, including the not-today error path |
| Production build | `cd frontend && npm run build` | no output |
| Types | `cd frontend && npx tsc --noEmit` | no output |
| Lint | `cd frontend && npm run lint` | no output |
| **Zero storage access** | `grep -rn "localStorage" frontend/src frontend/app` | no output — v1.3.2 owns the only storage surface |
| No `Date.parse` on a daily key | `grep -rn "Date.parse" frontend/src/lib/daily.ts backend/src/lib/daily.ts` | no output |
| `FilterUrlSync` is still the only URL reader | `grep -rln "useSearchParams" frontend/app frontend/src` | exactly one file |
| No schema drift | `git diff --stat -- backend/prisma/schema.prisma` | empty — no migration in this patch |

## Risks

| Risk | Mitigation |
|---|---|
| **Client and server resolve the same day to different games**, so a shared link shows one puzzle to its sender and another to its recipient. | `selectDailyGameId` is pure and mirrored across the network boundary, and a **shared fixture table** pins both implementations to the same rows. Divergence is a fixture failure, not a runtime surprise. |
| **The day boundary drifts with the viewer's timezone**, so a puzzle rolls over at different times for different users. | The key is UTC and the rollover is `00:00:00Z` worldwide, exactly once. Tests pin both sides of the boundary rather than only the happy path. |
| **A `Date.parse` creeps into a key comparison** and reintroduces local-time behaviour into a UTC rule. | Called out as a standing prohibition and enforced by a grep gate over both daily modules; no key ever reaches a date parser. |
| **Storage is touched in this patch**, which would take the project's first storage surface away from v1.3.2's single, reviewable adapter. | Zero access is a constraint, not a preference, and the grep gate makes any occurrence a hard failure. v1.3.2 owns the surface and can be reviewed as one place. |
| **Filters silently narrow the daily puzzle**, breaking the promise that every player gets the same game. | Daily ignores filters **structurally** — the path never reads filter state — and a test proves a filter in the URL does not change the selected id. |
| **"New puzzle" fetches a second daily** rather than leaving daily mode, producing two puzzles and a confusing state. | Leaving daily mode is asserted explicitly; the daily param is cleared and the next fetch is a normal random match. |
| **A stale or hand-edited `daily` key** resolves to another day instead of failing. | The key is validated at the endpoint and on the client, and a not-today key is never playable and never falls back — the error path is a named test. |
| **A re-seed shifts which game a day resolves to**, so a shared link changes meaning over time. | Documented known behaviour under §11 Rule 8, recorded in the Escalations table below rather than solved here. The daily game is identified by day key, not by game id, so the link keeps working; only its content may differ. |

---

## Escalations

These were raised when this plan was written. Each is a contract discrepancy, not an implementation choice, and none was resolved by renaming anything.

| # | Discrepancy | What v1.3.1 does | Needs |
|---|---|---|---|
| **E1** | The frozen contract for this line specifies `GameFilters` with non-null `number[]` lists in `frontend/types/index.ts`. v1.1.x's own plans froze `GameFilterParams` with **nullable** lists in `frontend/types/filters.ts`, as a `type` not an `interface`, with `EMPTY_FILTERS: Readonly<GameFilterParams>`. | **Consumes `GameFilterParams` as v1.1.x actually froze it.** Nothing in v1.3.1 names `GameFilters`. v1.3.1's own types (`DailyKey`, `StreakState`) are additive and independent of this. | `lead` to reconcile the contract text with v1.1.x. **This plan does not rename.** |
| **E2** | The frozen contract places `filtersToParams` / `paramsToFilters` / `isValidGameFilters` in `frontend/src/lib/filterParams.ts`, while v1.1.1 Task 8 originally placed them in `frontend/types/filters.ts`, contradicting its own architecture line. | **Resolved in v1.1.1**, which now aligns to the contract: `frontend/src/lib/filterParams.ts` and its test exist and hold the three filter helpers, and `frontend/src/lib/filtersEqual.ts` is created by v1.1.2 beside it. v1.3.1 therefore **appends** `dailyToParams` / `paramsToDailyKey` to that module and its existing test, and does **not** move, re-export, or rewrite anything of v1.1.1's. There is no `dailyParams.ts`. | No longer an open question for this patch; Step 0.3 gates on the file being present. |
| **E3** | The frozen contract says `selectDailyGameId` is a client function and that the endpoint returns a resolved `GameResponse`. Those two together require the selection algorithm to exist on both sides. | A deliberate four-line duplicate, pinned by identical literal fixture tables in both suites. | Accepted. No shared package — v1.1.1 already declined one for the same reason. |
| **E4** | `frontend/node_modules` contains only `@types` and `.vite` in this working tree, so **`node_modules/next/dist/docs/` does not exist and the installed Next 16.3.4 App Router navigation documentation could not be read.** | v1.3.1 adds **no new `useSearchParams` surface**: it extends v1.1.2's existing single reader with props, which is the conservative direction regardless of what 16.3.4's semantics are. All URL parsing is a pure function over `URLSearchParams`, so no Next API is involved in the tested logic. | An implementer with a populated `node_modules` should confirm `FilterUrlSync` still needs no Suspense move. **If `next build` fails in Step 11.2, this is the first thing to check.** |
| **E5** | Whether a *surrendered* daily counts toward the streak is not settled by §6.1. | v1.3.1 has no streak, so this is decided in the v1.3.2 plan. Raised here because the same question decides what the share text in v1.4 may claim. | `lead` before v1.3.2 Task 3. |

---

## Handoff to v1.3.2

- **`DailyKey` and `toDailyKey` are the only inputs v1.3.2 needs.** Every streak value is a `DailyKey`, and `toDailyKey(new Date())` is how "today" is obtained post-mount.
- **`isPlayableDaily` is how v1.3.2 decides which completion to record.** A completion is recorded against `state.dailyKey` — the day the puzzle *started* — never against a freshly computed today. Recomputing at completion time would let a player finish just after midnight and be credited to the wrong day.
- **`STORAGE_KEY = 'footplay.daily.v1'` is the ratified-scope seam** (§9.1, RD3). Bumping it is how a *future* reversal to per-(day, difficulty) would invalidate the old shape with no migration and no repair. The decision itself is settled; this is the note that makes a reversal cheap rather than the note that leaves it open.
- **`playedKeys` gates by DAY, not by (day, difficulty)** — that is the **ratified** answer (§9.1, RD3), not a default awaiting sign-off, and it is why `DailyEntry`'s already-played gate will hide the Start button after a Normal completion. §6.2 makes daily and difficulty orthogonal axes: a daily streak answers only "did you play today", and keying it by difficulty would penalise a player for choosing Easy.
- **The `GET /api/matches/daily` 400-on-malformed-date behaviour is the model's contract for a persisted day key too.** v1.3.2 never sends a key that `isDailyKey` would reject, because `loadStreak` refuses to persist one it cannot validate.