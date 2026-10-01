# Streak Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player's daily completions persist in `localStorage`: current streak, longest streak, and already-played-today state. This is the **first and only storage surface in the project** (§11 Rule 8), and it must not regress the hydration constraint that v0.2.5 fixed by removing storage.

**Architecture:** One pure module (`frontend/src/lib/streak.ts`) owns all streak arithmetic — `daysBetween`, `nextStreak`, `hasPlayed`, and the `isStreakState` validator — and is fully testable in a node environment with no DOM. One storage adapter (`frontend/src/lib/streakStorage.ts`) is the **only module that names `localStorage`**; it reads, validates, and writes the persisted `StreakState` under `STORAGE_KEY = 'footplay.daily.v1'`. The page initialises `streak` to the shared `EMPTY_STREAK` (identical on server and first client render), reads storage in a mount effect, and records a completion in an effect that fires on `gameStatus === 'complete'` — which covers both a win and a surrender, so **surrender counts as participation (E5)**. `DailyEntry` gains an optional `streak` prop and hides its Start button once today is in `playedKeys` (**ratified**, §9.1 RD3: one result per day, global across difficulties).

**Tech Stack:** TypeScript, React 19, Next.js 16 App Router, Vitest + jsdom + Testing Library (frontend). No backend change: §10 of the roadmap excludes server-side persistence, so this patch is frontend-only and its rollback point is v1.3.1.

---

## Global Constraints

- **`frontend/src/lib/streakStorage.ts` is the only module that names `localStorage`.** Not "the only module that writes it" — the only module that names it. The page calls `getDailyStorage()`, `loadStreak()`, and `recordCompletion()`; it never writes `window.localStorage` itself. Step 5.3 runs the grep that proves it. A `localStorage` reference anywhere else invalidates the patch boundary.

- **The hydration constraint applies to every storage read.** `streak` state initialises to `EMPTY_STREAK` on the server and on the first client render, so the markup cannot differ. The storage read happens in a mount effect, after first paint. `loadStreak` never throws — a read failure, corrupt JSON, or an invalid shape all resolve to `EMPTY_STREAK`. The v1.3.1 hydration test (`page.hydration.test.tsx`) must pass **unchanged**; it now also proves the streak read is effect-only, because the first case hydrates cleanly while the mount effect reads storage.

- **A completion is recorded against the day the puzzle started, never against a freshly computed today.** `recordCompletion(storage, state.dailyKey)` — `state.dailyKey` is the key the game was started with (v1.3.1 Task 7 preserves it through `SET_MATCH` and `SURRENDER`). Recomputing `toDailyKey(new Date())` at completion time would let a player finish just after 00:00:00 UTC and be credited to the wrong day, and it would break `nextStreak`'s idempotence contract.

- **Recording the same day twice is a no-op (O1: one result per day).** `nextStreak` returns the input state by reference when `lastPlayedKey === completedKey`, and `playedKeys` never contains a duplicate. This is what makes the completion effect safe to re-fire when a player replays today's puzzle after completing it.

- **`playedKeys` gates by DAY, not by (day, difficulty).** That is the **ratified** answer (roadmap §9.1, RD3), not a default awaiting sign-off: **one streak per day, global across difficulties.** §6.2 treats daily and difficulty as orthogonal axes — a daily streak answers only "did you play today" — so keying it by difficulty would penalise a player for choosing Easy, and would answer a question nobody asked. `STORAGE_KEY = 'footplay.daily.v1'` is the containment seam: if a *future* decision reverses this to per-(day, difficulty), bumping the key to `footplay.daily.v2` invalidates the old shape with no migration and no repair.

- **A re-seed can shift or break a streak, and that is documented known behavior, not a caveat to resolve** (roadmap §9 O2, §9.1 RD3). This is stated here so no implementer "fixes" it and no reviewer files it as a defect.

  What a re-seed actually does is change or remove *the puzzle a day resolves to*, which has two consequences, and they are not the same severity:

  | Consequence | Why it is not fixable in code |
  |---|---|
  | **The same day key resolves to a different game.** The player's *streak* is unaffected — the key is what is stored, not the game. Only the content behind a day they already played changes. | Nothing to fix. The stored shape is deliberately game-agnostic; that is what makes it survive a re-seed at all. |
  | **A day becomes unreachable** (its game left the eligible pool), so the player cannot complete it. That day is a missed day, and `nextStreak` resets `current` to 1 on their next completion while `longest` survives. | The streak rule is §6.1's — "miss a day and the streak resets" — with no exception for operator actions. Adding one would mean persisting an "excused day" concept, which is new scope and a new storage shape. |

  **This is pinned by tests, not left undefined.** `nextStreak` is a pure function of day keys, so the second row above is the ordinary missed-day path: the existing `a missed day resets current but keeps longest` test already pins the arithmetic, and Task 4's completion test pins that a completion on the day after an unreachable one resets `current` to 1 with `longest` intact. A re-seed does not need a dedicated test because it introduces **no new code path** — it only changes which game a key resolves to, and the key is all the streak module ever sees. That is the strongest form of "pinned" available here: the behavior is unreachable *by construction*, not merely untested.

- **A surrendered daily counts as participation (E5, decided here).** The completion effect fires on `gameStatus === 'complete'` regardless of how the game became complete — the reducer sets that status for both a win (all shirts resolved) and `SURRENDER`. This is stated here, tested in Task 4, and recorded in the changelog, because it also decides what the v1.4 share text may claim.

- **`loadStreak` refuses to persist what it cannot validate.** Corrupt JSON, a wrong shape, an invalid day key, or a broken invariant (e.g. `longest < current`) all resolve to `EMPTY_STREAK` **and remove the stored entry**. A key that `isDailyKey` rejects never survives a round trip, so v1.3.2 never sends one to the server either.

- **No `Date.parse` on a `DailyKey`, anywhere.** `daysBetween` decomposes with explicit `slice` and builds instants with `Date.UTC(year, month - 1, day)` — the same rule v1.3.1 froze for `isDailyKey`. `new Date('2026-01-01')` is UTC-parsed but `new Date('2026-01-01T00:00:00')` is local-parsed; neither appears in this patch.

- **TDD mode: `advisory_active`.** Test first for all testable logic; red → green → refactor; report the commands and results. Every task's Steps are ordered test → red → green → refactor → commit.

- **No command whose exit code is the pass signal may be piped.** `npm run test`, `npm run test:coverage`, `npm run build`, `npm run lint`, `npx tsc --noEmit` and `npx vitest run` all report success through their **exit code**, and `cmd | tail -N` replaces that exit code with `tail`'s — always 0. A red suite piped to `tail` therefore reads as a pass, and worse, `tail -15` keeps the *last* 15 lines, which is the summary block and never the assertion that failed. **Every command in this plan is written unpiped**, and that is the form to use. If output genuinely must be trimmed, use one of these two, both of which preserve the exit code, and say which one you used and why in the step:
  - `set -o pipefail` before the pipeline, in a shell that supports it (bash/zsh) — the pipeline then reports the first non-zero status, so `… | tail -20` is safe.
  - `… > /tmp/out.log 2>&1; status=$?; tail -20 /tmp/out.log; exit $status` — the portable form, and the only one that works when the trimming command is a filter the tool itself does not control.

  Piping a command whose pass signal is its **stdout** is a different case and is fine: `grep` and `wc` are used that way in this plan, because a missing match is a readable answer rather than a status code.

- **Frontend coverage** is measured over `src/**` only (`frontend/vitest.config.ts:23-28`) with **no threshold**, so nothing forces these tests to exist. They are written deliberately: `streak.ts` and `streakStorage.ts` sit inside `coverage.include`, and the page/DailyEntry tests are the behavioural proof.

- **No backend change, no Prisma schema change, no migration.** Reverting v1.3.2 is a pure code revert to v1.3.1. The streak data left in a player's `localStorage` is orphaned but harmless: v1.3.1 never reads it.

- **Rollback point: v1.3.1.** If v1.3.2 is reverted, every `localStorage` reference must disappear with it — that is what Rule 8's single-module boundary is for.

---

## Baselines

The figures below were measured on **`cda2db0`, the pre-v1.1.x tree** — not on the v1.3.1 commit, which is where this patch starts:

```bash
cd backend  && npm run test          # Test Files 13 passed (13) | Tests 175 passed (175)
cd frontend && npm run test          # Test Files 9 passed (9)  | Tests 173 passed (173)
```

They are recorded here as the origin of the delta arithmetic and for **nothing else**. Between `cda2db0` and this patch, v1.1.1, v1.1.2, v1.2.1, v1.2.2, v1.2.3, v1.2.4, v1.2.5 and v1.3.1 have each added tests, so these two numbers are **stale by construction** and no step in this plan may assert against them.

**The baseline for this patch is the v1.3.1 exit state, and it is measured, never recalled.** Step 0.1 runs both suites and writes the real numbers into the changelog; every delta below is relative to *that*. If a figure in this plan disagrees with what Task 0.1 measured, Task 0.1 is right.

---

### Task 0: Preflight — confirm v1.3.1 shipped and the storage surface is clean

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

  These two numbers **are** the v1.3.1 exit state, and they are the only baseline this patch has. Write both file counts and both test counts into the changelog verbatim. Do not carry the `cda2db0` figures in the Baselines section forward, and do not derive any delta from them.

  **Both commands are unpiped on purpose** (Global Constraints): their pass signal is the exit code, and `| tail` would replace a red suite with a zero status. If the output is long, follow the `set -o pipefail` or log-file form there and note which you used.

- [ ] **Step 0.2: Confirm v1.3.1's daily surface exists.**

  ```bash
  ls frontend/src/lib/daily.ts frontend/src/lib/filterParams.ts frontend/src/components/DailyEntry.tsx
  grep -n "isDaily\|dailyKey\|START_DAILY" frontend/src/lib/gameState.ts | head
  ```

  The `| head` on the `grep` above, and the one in Step 0.5, are legitimate: `grep`'s pass signal is its **stdout**, not its exit code, so trimming it cannot manufacture a pass. Only a test/build/lint command is bound by the rule above.

  Expected: `daily.ts` exports `DailyKey` / `toDailyKey` / `isDailyKey` / `selectDailyGameId` / `isPlayableDaily`; `gameState.ts` carries `isDaily` / `dailyKey` / `START_DAILY`; `DailyEntry.tsx` exists with the four v1.3.1 props. **If any is absent, stop** — v1.3.1 is the blocker, not this patch.

- [ ] **Step 0.3: Confirm the storage surface is currently empty.**

  ```bash
  cd frontend && grep -rn "localStorage\|sessionStorage\|indexedDB" src app components lib types
  ```

  Expected: **no output.** v1.3.1 shipped with zero storage access (its Step 11.3 gate). If anything is already there, stop and report — the patch boundary is already violated before v1.3.2 starts.

- [ ] **Step 0.4: Confirm the hydration test exists and passes.**

  ```bash
  cd frontend && npx vitest run app/missing-eleven/page.hydration.test.tsx
  ```

  Expected: 2 passed. This file must pass **unchanged** at the end of v1.3.2 (Step 5.2).

- [ ] **Step 0.5: Confirm the page test harness names v1.3.2 will extend.**

  ```bash
  grep -n "const search\|randomMock\|dailyMock\|const TODAY\|matchResponse" frontend/app/missing-eleven/page.test.tsx | head
  ```

  Expected: the harness from v1.3.1 Task 10.1 (`search`, `randomMock`, `dailyMock`, `TODAY`, `matchResponse`). Task 4 extends it; if v1.1.x renamed any of these, Task 4's names win — rename, do not duplicate.

---

### Task 1: The pure streak module

**Files:**
- Create: `frontend/src/lib/streak.ts`
- Create: `frontend/src/lib/streak.test.ts`

**Interfaces:**
- Consumes: `DailyKey`, `isDailyKey` from `@/lib/daily` (v1.3.1).
- Produces (frozen; v1.4 reads these):
  ```ts
  // frontend/src/lib/streak.ts
  export interface StreakState {
    /** Consecutive days played up to and including lastPlayedKey. */
    current: number;
    /** The longest current has ever been. */
    longest: number;
    /** The day key of the most recent completion, or null before the first. */
    lastPlayedKey: DailyKey | null;
    /** Every day key ever completed, in completion order. O1 gate. */
    playedKeys: DailyKey[];
  }
  export const EMPTY_STREAK: Readonly<StreakState>;
  /** Whole days between two keys; negative when b is before a. */
  export function daysBetween(a: DailyKey, b: DailyKey): number;
  /** The state after completing `completedKey`. Idempotent for the same day. */
  export function nextStreak(state: StreakState, completedKey: DailyKey): StreakState;
  /** True when todayKey is in playedKeys (O1: one result per day). */
  export function hasPlayed(state: StreakState, todayKey: DailyKey): boolean;
  /** Shape + invariant validator used by loadStreak. Pure. */
  export function isStreakState(value: unknown): value is StreakState;
  ```

**Steps:**

- [ ] **Step 1.1: Write the failing tests.**

  `frontend/src/lib/streak.test.ts`. Pure, **node** environment, no DOM, no `// @vitest-environment` line (the global default is `node`, `frontend/vitest.config.ts:17`).

  ```ts
  import { describe, it, expect } from 'vitest';
  import { EMPTY_STREAK, daysBetween, nextStreak, hasPlayed, isStreakState } from './streak';

  describe('daysBetween', () => {
    it.each([
      ['2025-12-31', '2026-01-01', 1],   // year boundary
      ['2026-01-31', '2026-02-01', 1],   // month boundary
      ['2026-01-01', '2026-01-03', 2],   // two days apart
      ['2024-02-28', '2024-03-01', 2],   // leap-year February
      ['2026-02-28', '2026-03-01', 1],   // non-leap February
      ['2024-02-29', '2025-03-01', 366], // leap day to the next year
    ])('daysBetween(%s, %s) === %i', (a, b, expected) => {
      expect(daysBetween(a, b)).toBe(expected);
    });
    it('is zero for the same day', () => {
      expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0);
    });
    it('is negative when b is before a', () => {
      expect(daysBetween('2026-01-03', '2026-01-01')).toBe(-2);
    });
  });

  describe('nextStreak', () => {
    it('first completion starts a streak of 1', () => {
      const next = nextStreak(EMPTY_STREAK, '2026-01-01');
      expect(next.current).toBe(1);
      expect(next.longest).toBe(1);
      expect(next.lastPlayedKey).toBe('2026-01-01');
      expect(next.playedKeys).toEqual(['2026-01-01']);
    });
    it('a consecutive day increments the streak', () => {
      const day1 = nextStreak(EMPTY_STREAK, '2026-01-01');
      const day2 = nextStreak(day1, '2026-01-02');
      expect(day2.current).toBe(2);
      expect(day2.longest).toBe(2);
      expect(day2.playedKeys).toEqual(['2026-01-01', '2026-01-02']);
    });
    it('a missed day resets current but keeps longest', () => {
      const day1 = nextStreak(EMPTY_STREAK, '2026-01-01');
      const day2 = nextStreak(day1, '2026-01-02');
      const day3 = nextStreak(day2, '2026-01-03');
      const missed = nextStreak(day3, '2026-01-06');
      expect(missed.current).toBe(1);
      expect(missed.longest).toBe(3);
      expect(missed.lastPlayedKey).toBe('2026-01-06');
    });
    it('recording the same day again is a reference no-op', () => {
      const day1 = nextStreak(EMPTY_STREAK, '2026-01-01');
      expect(nextStreak(day1, '2026-01-01')).toBe(day1);
    });
    it('never duplicates a key in playedKeys', () => {
      const day1 = nextStreak(EMPTY_STREAK, '2026-01-01');
      const day2 = nextStreak(day1, '2026-01-02');
      expect(day2.playedKeys).toEqual(['2026-01-01', '2026-01-02']);
    });
    it('a leap-day completion extends correctly and the next year is a miss', () => {
      const before = nextStreak(EMPTY_STREAK, '2024-02-28');
      const leap = nextStreak(before, '2024-02-29');
      expect(leap.current).toBe(2);
      const nextYear = nextStreak(leap, '2025-03-01');
      expect(nextYear.current).toBe(1); // 366 days later is a miss
      expect(nextYear.longest).toBe(2);
    });
    it('does not mutate its input state', () => {
      const input = { ...EMPTY_STREAK };
      const snapshot = JSON.stringify(input);
      nextStreak(input, '2026-01-01');
      expect(JSON.stringify(input)).toBe(snapshot);
    });
  });

  describe('hasPlayed', () => {
    it('is true when today is in playedKeys', () => {
      const state = nextStreak(EMPTY_STREAK, '2026-01-01');
      expect(hasPlayed(state, '2026-01-01')).toBe(true);
    });
    it('is false when today is not in playedKeys', () => {
      const state = nextStreak(EMPTY_STREAK, '2026-01-01');
      expect(hasPlayed(state, '2026-01-02')).toBe(false);
    });
    it('is false for an empty streak', () => {
      expect(hasPlayed(EMPTY_STREAK, '2026-01-01')).toBe(false);
    });
  });

  describe('isStreakState', () => {
    it('accepts EMPTY_STREAK', () => {
      expect(isStreakState(EMPTY_STREAK)).toBe(true);
    });
    it('accepts a valid non-empty state', () => {
      expect(isStreakState({
        current: 2, longest: 3, lastPlayedKey: '2026-01-02', playedKeys: ['2026-01-01', '2026-01-02'],
      })).toBe(true);
    });
    it('rejects non-objects', () => {
      for (const bad of [null, undefined, 'x', 42, [], true]) {
        expect(isStreakState(bad)).toBe(false);
      }
    });
    it('rejects wrong field types', () => {
      expect(isStreakState({ current: '1', longest: 1, lastPlayedKey: null, playedKeys: [] })).toBe(false);
      expect(isStreakState({ current: 1, longest: 1, lastPlayedKey: '2026-01-01', playedKeys: 'x' })).toBe(false);
    });
    it('rejects negative or fractional counts', () => {
      expect(isStreakState({ current: -1, longest: 0, lastPlayedKey: null, playedKeys: [] })).toBe(false);
      expect(isStreakState({ current: 1.5, longest: 1, lastPlayedKey: '2026-01-01', playedKeys: ['2026-01-01'] })).toBe(false);
    });
    it('rejects an invalid day key', () => {
      expect(isStreakState({ current: 1, longest: 1, lastPlayedKey: '2026-02-30', playedKeys: ['2026-02-30'] })).toBe(false);
    });
    it('rejects longest < current', () => {
      expect(isStreakState({ current: 3, longest: 2, lastPlayedKey: '2026-01-03', playedKeys: ['2026-01-01', '2026-01-02', '2026-01-03'] })).toBe(false);
    });
    it('rejects current 0 with a lastPlayedKey', () => {
      expect(isStreakState({ current: 0, longest: 1, lastPlayedKey: '2026-01-01', playedKeys: ['2026-01-01'] })).toBe(false);
    });
    it('rejects a lastPlayedKey that is not the last played key', () => {
      expect(isStreakState({ current: 1, longest: 1, lastPlayedKey: '2026-01-01', playedKeys: ['2026-01-02'] })).toBe(false);
    });
    it('rejects duplicate played keys', () => {
      expect(isStreakState({ current: 2, longest: 2, lastPlayedKey: '2026-01-02', playedKeys: ['2026-01-01', '2026-01-01'] })).toBe(false);
    });
    it('rejects current larger than the number of played days', () => {
      expect(isStreakState({ current: 3, longest: 3, lastPlayedKey: '2026-01-01', playedKeys: ['2026-01-01'] })).toBe(false);
    });
  });
  ```

  The load-bearing cases: **"recording the same day again is a reference no-op"** asserts object identity (`toBe`), not field equality — that is the O1 gate at the arithmetic level, and it is what makes the page's completion effect safe to re-fire. **"a leap-day completion extends correctly"** pins the `daysBetween` boundary that a naive `Date`-arithmetic implementation gets wrong.

- [ ] **Step 1.2: Run it and confirm red.**

  ```bash
  cd frontend && npx vitest run src/lib/streak.test.ts
  ```

  Expected: `Cannot find module './streak'` — the module does not exist yet.

- [ ] **Step 1.3: Implement the module.**

  `frontend/src/lib/streak.ts`:

  ```ts
  import { isDailyKey, type DailyKey } from '@/lib/daily';

  /**
   * Daily-puzzle streak state.
   *
   * Pure arithmetic, no storage, no DOM, no clock. The storage adapter
   * (streakStorage.ts) is the only module that touches localStorage; this
   * module is what it validates and what it persists.
   *
   * TIMEZONE RULE: every key is a UTC calendar day (v1.3.1). daysBetween is
   * integer arithmetic on epoch days, which is exact because UTC has no DST.
   */

  export interface StreakState {
    /** Consecutive days played up to and including lastPlayedKey. */
    current: number;
    /** The longest current has ever been. */
    longest: number;
    /** The day key of the most recent completion, or null before the first. */
    lastPlayedKey: DailyKey | null;
    /** Every day key ever completed, in completion order. O1 gate. */
    playedKeys: DailyKey[];
  }

  /** The state before anything has been played. Frozen; never mutate it. */
  export const EMPTY_STREAK: Readonly<StreakState> = Object.freeze({
    current: 0,
    longest: 0,
    lastPlayedKey: null,
    playedKeys: [],
  });

  /**
   * Whole days from a to b. Negative when b is before a.
   *
   * No Date.parse: the keys are decomposed with explicit slice and rebuilt
   * through Date.UTC(year, month - 1, day), the same rule isDailyKey froze in
   * v1.3.1. A day is always 86,400,000 ms because UTC has no DST.
   */
  export function daysBetween(a: DailyKey, b: DailyKey): number {
    const aEpoch = Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)));
    const bEpoch = Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10)));
    return (bEpoch - aEpoch) / 86_400_000;
  }

  /**
   * The state after completing `completedKey`.
   *
   * Idempotent: recording the same day twice returns the input state by
   * reference, which is the O1 "one result per day" guarantee at the
   * arithmetic level. A gap of more than one day resets `current` to 1 but
   * never lowers `longest`. `playedKeys` grows in completion order and never
   * contains a duplicate.
   */
  export function nextStreak(state: StreakState, completedKey: DailyKey): StreakState {
    if (state.lastPlayedKey === completedKey) return state;
    const current = state.lastPlayedKey === null
      ? 1
      : daysBetween(state.lastPlayedKey, completedKey) === 1
        ? state.current + 1
        : 1;
    const playedKeys = state.playedKeys.includes(completedKey)
      ? state.playedKeys
      : [...state.playedKeys, completedKey];
    return {
      current,
      longest: Math.max(state.longest, current),
      lastPlayedKey: completedKey,
      playedKeys,
    };
  }

  /** True when todayKey is in playedKeys — the O1 already-played-today gate. */
  export function hasPlayed(state: StreakState, todayKey: DailyKey): boolean {
    return state.playedKeys.includes(todayKey);
  }

  /**
   * Shape + invariant validator for a persisted StreakState.
   *
   * Every rule here is a rule loadStreak enforces: a stored value that fails
   * any of these is corrupt and is removed, not repaired. The invariants are
   * the ones nextStreak maintains, so a value that passes this validator is
   * one nextStreak could have produced.
   */
  export function isStreakState(value: unknown): value is StreakState {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const s = value as Record<string, unknown>;
    if (typeof s.current !== 'number' || !Number.isInteger(s.current) || s.current < 0) return false;
    if (typeof s.longest !== 'number' || !Number.isInteger(s.longest) || s.longest < 0) return false;
    if (s.lastPlayedKey !== null && !isDailyKey(s.lastPlayedKey)) return false;
    if (!Array.isArray(s.playedKeys) || !s.playedKeys.every((k) => isDailyKey(k))) return false;
    if (new Set(s.playedKeys).size !== s.playedKeys.length) return false;
    if (s.longest < s.current) return false;
    if (s.current > s.playedKeys.length) return false;
    if (s.longest > s.playedKeys.length) return false;
    if (s.current === 0 && s.lastPlayedKey !== null) return false;
    if (s.playedKeys.length === 0 && s.lastPlayedKey !== null) return false;
    if (s.playedKeys.length > 0 && s.lastPlayedKey !== s.playedKeys[s.playedKeys.length - 1]) return false;
    return true;
  }
  ```

  Note the `EMPTY_STREAK` typing: it is `Readonly<StreakState>` and is passed to `nextStreak` freely — TypeScript's `readonly` is not enforced on assignability, only on direct property writes, so this compiles and is exactly the "shared initial state" the hydration constraint wants.

- [ ] **Step 1.4: Verify green.**

  ```bash
  cd frontend && npx vitest run src/lib/streak.test.ts
  ```

- [ ] **Step 1.5: Verify purity by grep.**

  ```bash
  cd frontend && grep -n "localStorage\|sessionStorage\|indexedDB\|Math.random\|Date.now()" src/lib/streak.ts
  ```

  Expected: **no output.** This module is pure arithmetic; the storage surface lives in Task 2.

- [ ] **Step 1.6: Regression — the whole frontend suite.**

  ```bash
  cd frontend && npm run test
  ```

  All pre-existing tests must pass unchanged.

- [ ] **Step 1.7: Commit.**

  ```bash
  git add frontend/src/lib/streak.ts frontend/src/lib/streak.test.ts
  git commit -m "feat(frontend): add pure daily streak arithmetic"
  ```

---

### Task 2: The storage adapter — the only module that names localStorage

**Files:**
- Create: `frontend/src/lib/streakStorage.ts`
- Create: `frontend/src/lib/streakStorage.test.ts`

**Interfaces:**
- Consumes: `EMPTY_STREAK`, `isStreakState`, `nextStreak`, `StreakState` (Task 1); `isDailyKey`, `DailyKey` (v1.3.1).
- Produces (frozen):
  ```ts
  // frontend/src/lib/streakStorage.ts
  export const STORAGE_KEY: 'footplay.daily.v1';
  /** window.localStorage when it exists, else null (server render). */
  export function getDailyStorage(): Storage | null;
  /** Read + validate. Never throws. Corrupt data is removed, not repaired. */
  export function loadStreak(storage?: Storage): StreakState;
  /** Compute the next state, persist it, return it. Throws on a bad key or a write failure. */
  export function recordCompletion(storage: Storage, key: DailyKey): StreakState;
  ```

**Steps:**

- [ ] **Step 2.1: Write the failing tests.**

  `frontend/src/lib/streakStorage.test.ts`. **Node** environment — the tests use an in-memory `Storage` stub, so no jsdom is needed and the module's `typeof window` guard is exercised for real.

  ```ts
  import { describe, it, expect } from 'vitest';
  import { STORAGE_KEY, loadStreak, recordCompletion, getDailyStorage } from './streakStorage';
  import { EMPTY_STREAK } from './streak';

  /** Minimal in-memory Storage. Enough for every assertion in this file. */
  function createStorage(initial: Record<string, string> = {}): Storage {
    const map = new Map(Object.entries(initial));
    return {
      get length() { return map.size; },
      clear: () => { map.clear(); },
      getItem: (key: string) => map.get(key) ?? null,
      key: (index: number) => [...map.keys()][index] ?? null,
      removeItem: (key: string) => { map.delete(key); },
      setItem: (key: string, value: string) => { map.set(key, String(value)); },
    } as Storage;
  }

  describe('loadStreak', () => {
    it('returns EMPTY_STREAK when storage is undefined (server render)', () => {
      expect(loadStreak()).toBe(EMPTY_STREAK);
    });
    it('returns EMPTY_STREAK when nothing is stored', () => {
      expect(loadStreak(createStorage())).toEqual(EMPTY_STREAK);
    });
    it('reads a valid stored state', () => {
      const storage = createStorage({
        [STORAGE_KEY]: JSON.stringify({ current: 2, longest: 3, lastPlayedKey: '2026-01-02', playedKeys: ['2026-01-01', '2026-01-02'] }),
      });
      expect(loadStreak(storage)).toEqual({ current: 2, longest: 3, lastPlayedKey: '2026-01-02', playedKeys: ['2026-01-01', '2026-01-02'] });
    });
    it('returns EMPTY_STREAK and removes corrupt JSON', () => {
      const storage = createStorage({ [STORAGE_KEY]: '{not json' });
      expect(loadStreak(storage)).toEqual(EMPTY_STREAK);
      expect(storage.getItem(STORAGE_KEY)).toBeNull();
    });
    it('returns EMPTY_STREAK and removes an invalid shape', () => {
      const storage = createStorage({
        [STORAGE_KEY]: JSON.stringify({ current: 1, longest: 1, lastPlayedKey: '2026-02-30', playedKeys: ['2026-02-30'] }),
      });
      expect(loadStreak(storage)).toEqual(EMPTY_STREAK);
      expect(storage.getItem(STORAGE_KEY)).toBeNull();
    });
    it('returns EMPTY_STREAK when getItem throws', () => {
      const throwing = { getItem: () => { throw new Error('denied'); } } as unknown as Storage;
      expect(loadStreak(throwing)).toEqual(EMPTY_STREAK);
    });
  });

  describe('recordCompletion', () => {
    it('writes the new state under STORAGE_KEY and returns it', () => {
      const storage = createStorage();
      const next = recordCompletion(storage, '2026-01-01');
      expect(next.current).toBe(1);
      expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual(next);
    });
    it('extends a stored streak', () => {
      const storage = createStorage({
        [STORAGE_KEY]: JSON.stringify({ current: 1, longest: 1, lastPlayedKey: '2025-12-31', playedKeys: ['2025-12-31'] }),
      });
      const next = recordCompletion(storage, '2026-01-01');
      expect(next.current).toBe(2);
      expect(next.longest).toBe(2);
    });
    it('is idempotent for the same day', () => {
      const storage = createStorage({
        [STORAGE_KEY]: JSON.stringify({ current: 1, longest: 1, lastPlayedKey: '2026-01-01', playedKeys: ['2026-01-01'] }),
      });
      const first = recordCompletion(storage, '2026-01-01');
      const second = recordCompletion(storage, '2026-01-01');
      expect(second).toEqual(first);
      expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual(first);
    });
    it('throws for a key isDailyKey would reject', () => {
      expect(() => recordCompletion(createStorage(), '2026-02-30' as never)).toThrow(/daily key/i);
    });
    it('propagates a setItem failure rather than lying about persistence', () => {
      const failing = { setItem: () => { throw new Error('quota'); } } as unknown as Storage;
      expect(() => recordCompletion(failing, '2026-01-01')).toThrow(/quota/);
    });
  });

  describe('getDailyStorage', () => {
    it('returns null when there is no window (node/server render)', () => {
      expect(getDailyStorage()).toBeNull();
    });
  });
  ```

  The two that earn their keep: **"returns EMPTY_STREAK and removes an invalid shape"** is the "refuses to persist what it cannot validate" contract — a bad key like `2026-02-30` must not survive a round trip, because v1.3.2 never sends a key `isDailyKey` would reject. **"propagates a setItem failure"** is the honesty contract: a quota error must not be silently swallowed into a UI that claims a streak that was never written.

- [ ] **Step 2.2: Run it and confirm red.**

  ```bash
  cd frontend && npx vitest run src/lib/streakStorage.test.ts
  ```

  Expected: `Cannot find module './streakStorage'`.

- [ ] **Step 2.3: Implement the adapter.**

  `frontend/src/lib/streakStorage.ts`:

  ```ts
  import { isDailyKey, type DailyKey } from '@/lib/daily';
  import { EMPTY_STREAK, isStreakState, nextStreak, type StreakState } from './streak';

  /**
   * The ONLY module in the project that names localStorage (§11 Rule 8).
   *
   * Everything else — the page, DailyEntry, tests — goes through the three
   * functions here. That is what makes the hydration constraint have exactly
   * one blast radius and what makes a v1.3.2 revert a pure code revert.
   */

  /** O1 seam: bumping this invalidates the old shape with no migration. */
  export const STORAGE_KEY = 'footplay.daily.v1';

  /** window.localStorage when it exists, else null (server render). */
  export function getDailyStorage(): Storage | null {
    return typeof window === 'undefined' ? null : window.localStorage;
  }

  /**
   * Read and validate the persisted streak. Never throws.
   *
   * - no storage (server render) → EMPTY_STREAK
   * - nothing stored → EMPTY_STREAK
   * - getItem throws (privacy mode) → EMPTY_STREAK
   * - corrupt JSON or an invalid shape → EMPTY_STREAK, and the entry is
   *   removed. Corrupt data is discarded, not repaired: a repaired value is a
   *   value we would then have to keep correct.
   */
  export function loadStreak(storage?: Storage): StreakState {
    const target = storage ?? getDailyStorage();
    if (!target) return EMPTY_STREAK;
    let raw: string | null;
    try {
      raw = target.getItem(STORAGE_KEY);
    } catch {
      return EMPTY_STREAK;
    }
    if (raw === null) return EMPTY_STREAK;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isStreakState(parsed)) {
        target.removeItem(STORAGE_KEY);
        return EMPTY_STREAK;
      }
      return parsed;
    } catch {
      target.removeItem(STORAGE_KEY);
      return EMPTY_STREAK;
    }
  }

  /**
   * Compute the next state, persist it, return it.
   *
   * The key is validated here as belt-and-braces: the page passes
   * `state.dailyKey`, which came from `paramsToDailyKey` or `toDailyKey` and
   * is therefore already valid, but this function is total on its own.
   *
   * A setItem failure propagates. Swallowing it would let the UI claim a
   * streak that was never written; the page catches and degrades instead.
   */
  export function recordCompletion(storage: Storage, key: DailyKey): StreakState {
    if (!isDailyKey(key)) {
      throw new Error(`recordCompletion requires a valid daily key, got ${String(key)}`);
    }
    const next = nextStreak(loadStreak(storage), key);
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }
  ```

- [ ] **Step 2.4: Verify green.**

  ```bash
  cd frontend && npx vitest run src/lib/streakStorage.test.ts
  ```

- [ ] **Step 2.5: The Rule 8 boundary gate.**

  ```bash
  cd frontend && grep -rn "localStorage\|sessionStorage\|indexedDB" src app components lib types
  ```

  Expected: **exactly one file** — `src/lib/streakStorage.ts`. Any other hit is a Rule 8 violation; remove it before continuing.

- [ ] **Step 2.6: Regression — the whole frontend suite.**

  ```bash
  cd frontend && npm run test
  ```

- [ ] **Step 2.7: Commit.**

  ```bash
  git add frontend/src/lib/streakStorage.ts frontend/src/lib/streakStorage.test.ts
  git commit -m "feat(frontend): add the localStorage streak adapter"
  ```

---

### Task 3: DailyEntry — streak display and the already-played-today gate

**Files:**
- Modify: `frontend/src/components/DailyEntry.tsx`
- Modify: `frontend/src/components/DailyEntry.test.tsx`

**Interfaces:**
- Consumes: `hasPlayed`, `EMPTY_STREAK`, `StreakState` (Task 1).
- Produces (additive prop; the four v1.3.1 props are unchanged):
  ```tsx
  // frontend/src/components/DailyEntry.tsx
  export interface DailyEntryProps {
    dailyKey: DailyKey | null;
    todayKey: DailyKey | null;
    urlReady: boolean;
    /** v1.3.2: the persisted streak. Optional so the component renders
     *  identically without storage (server, first paint, tests); the page
     *  supplies it once the post-mount read has happened. Defaults to
     *  EMPTY_STREAK. */
    streak?: StreakState;
    onStartDaily: () => void;
  }
  ```

  `streak` is **optional**, not required. That is deliberate: the page's `streak` state is `EMPTY_STREAK` on the server and on the first client render, and the component must render identically in that state — an optional prop with an `EMPTY_STREAK` default is the type-level expression of the hydration constraint. It also keeps the v1.3.1 tests valid without churn.

**Steps:**

- [ ] **Step 3.1: Write the failing tests.**

  Append to `frontend/src/components/DailyEntry.test.tsx` (jsdom, existing harness). The existing `base` fixture stays as v1.3.1 left it — `streak` is optional, so none of the v1.3.1 cases change.

  ```tsx
  import { EMPTY_STREAK, type StreakState } from '@/lib/streak';

  const playedToday: StreakState = { current: 1, longest: 1, lastPlayedKey: '2026-01-01', playedKeys: ['2026-01-01'] };
  const threeDayStreak: StreakState = { current: 3, longest: 5, lastPlayedKey: '2025-12-30', playedKeys: ['2025-12-28', '2025-12-29', '2025-12-30'] };

  it('shows the current and longest streak when there is history', () => {
    render(<DailyEntry {...base} streak={threeDayStreak} />);
    expect(screen.getByText(/current streak: 3/i)).toBeInTheDocument();
    expect(screen.getByText(/longest: 5/i)).toBeInTheDocument();
  });

  it('does not show a streak line when nothing has been played', () => {
    render(<DailyEntry {...base} streak={EMPTY_STREAK} />);
    expect(screen.queryByText(/current streak/i)).not.toBeInTheDocument();
  });

  it('hides the start button and says played today when today is in playedKeys (O1)', () => {
    render(<DailyEntry {...base} streak={playedToday} />);
    expect(screen.queryByRole('button', { name: /daily puzzle/i })).not.toBeInTheDocument();
    expect(screen.getByText(/played today/i)).toBeInTheDocument();
  });

  it('still offers the daily puzzle when today is not played', () => {
    render(<DailyEntry {...base} streak={threeDayStreak} />);
    expect(screen.getByRole('button', { name: /daily puzzle/i })).toBeInTheDocument();
  });

  it('defaults to EMPTY_STREAK when no streak prop is given (hydration-safe)', () => {
    render(<DailyEntry {...base} />);
    expect(screen.getByRole('button', { name: /daily puzzle/i })).toBeInTheDocument();
    expect(screen.queryByText(/current streak/i)).not.toBeInTheDocument();
  });
  ```

  The load-bearing case is **"hides the start button and says played today"** — that is the O1 already-played-today state the roadmap ships in this patch, and it is the only place the player learns they have already had their one result today.

- [ ] **Step 3.2: Run it and confirm red.**

  ```bash
  cd frontend && npx vitest run src/components/DailyEntry.test.tsx
  ```

- [ ] **Step 3.3: Implement.**

  In `frontend/src/components/DailyEntry.tsx`, add the import, the prop, and the two new render branches. The pre-hydration gate and the `playingToday` branch are unchanged:

  ```tsx
  import { hasPlayed, EMPTY_STREAK, type StreakState } from '@/lib/streak';

  export interface DailyEntryProps {
    /** The day key currently requested via ?daily=, or null in ordinary play. */
    dailyKey: DailyKey | null;
    /** Today's UTC day key, or null before the post-mount read has happened. */
    todayKey: DailyKey | null;
    /** True once the query string has been read. */
    urlReady: boolean;
    /** v1.3.2: the persisted streak. Optional so the component renders
     *  identically without storage (server, first paint, tests); the page
     *  supplies it once the post-mount read has happened. */
    streak?: StreakState;
    /** Request the daily puzzle. */
    onStartDaily: () => void;
  }

  export default function DailyEntry({ dailyKey, todayKey, urlReady, streak = EMPTY_STREAK, onStartDaily }: DailyEntryProps) {
    // Pre-hydration gate — unchanged from v1.3.1.
    if (!urlReady || todayKey === null) return null;

    const playingToday = dailyKey === todayKey;
    const playedToday = hasPlayed(streak, todayKey);
    const hasHistory = streak.longest > 0;

    if (playingToday) {
      return (
        <p className="text-xs text-ink/65">You are playing today&apos;s puzzle.</p>
      );
    }

    return (
      <div className="flex w-full flex-col gap-2">
        {playedToday ? (
          <p className="text-xs text-ink/65">You&apos;ve played today&apos;s puzzle.</p>
        ) : (
          <button
            type="button"
            onClick={onStartDaily}
            className="w-full rounded-lg border border-ink/20 px-5 py-3 font-semibold text-ink transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare"
          >
            Daily puzzle — {formatDay(todayKey)}
          </button>
        )}
        {hasHistory && (
          <p className="text-xs text-ink/55">
            Current streak: {streak.current} · Longest: {streak.longest}
          </p>
        )}
        <p className="text-xs text-ink/55">One puzzle a day. Filters do not apply.</p>
      </div>
    );
  }
  ```

  The streak line renders in **both** the played-today and the not-played branches — after playing, the player wants to see the number. It is suppressed only when `longest === 0`, so a brand-new player sees no "Current streak: 0" noise.

- [ ] **Step 3.4: Verify green.**

  ```bash
  cd frontend && npx vitest run src/components/DailyEntry.test.tsx
  ```

  Every v1.3.1 case in this file must still pass unchanged.

- [ ] **Step 3.5: Regression — the whole frontend suite.**

  ```bash
  cd frontend && npm run test
  ```

- [ ] **Step 3.6: Commit.**

  ```bash
  git add frontend/src/components/DailyEntry.tsx frontend/src/components/DailyEntry.test.tsx
  git commit -m "feat(frontend): show the streak and gate the daily entry once played"
  ```

---

### Task 4: Record completions in the page

**Files:**
- Modify: `frontend/app/missing-eleven/page.tsx`
- Modify: `frontend/app/missing-eleven/page.test.tsx`

**Interfaces:**
- Consumes: `loadStreak`, `recordCompletion`, `getDailyStorage` (Task 2); `EMPTY_STREAK`, `StreakState` (Task 1); `DailyEntry`'s new `streak` prop (Task 3).
- Produces: no new exports. The page gains `streak` state, one mount read effect, one completion effect, and passes `streak={streak}` to `DailyEntry`.

**Steps:**

- [ ] **Step 4.1: Extend the harness and write the failing tests.**

  In `frontend/app/missing-eleven/page.test.tsx`:

  **(a) Extend the existing harness.** Add `STORAGE_KEY` to the imports, clear storage in `beforeEach`/`afterEach`, and seed nothing by default:

  ```tsx
  import { STORAGE_KEY } from '@/lib/streakStorage';

  // in beforeEach, after the mock resets:
  window.localStorage.clear();

  // in afterEach, before vi.useRealTimers():
  window.localStorage.clear();
  ```

  **(b) Append a `describe('streak')` block.** The harness names (`search`, `randomMock`, `dailyMock`, `TODAY`, `matchResponse`, `screen`, `fireEvent`, `waitFor`) are the v1.3.1 ones. The surrender flow is the cheapest way to reach `gameStatus === 'complete'` — and it is exactly the E5 path, so the surrender tests double as the E5 proof.

  ```tsx
  describe('streak', () => {
    it('records a completion when the daily game completes — surrender counts (E5)', async () => {
      search.current = `daily=${TODAY}`;
      render(<MissingElevenPage />);
      await screen.findByText('game 104');

      fireEvent.click(screen.getByRole('button', { name: /give up\?/i }));
      fireEvent.click(await screen.findByRole('button', { name: /are you sure\?/i }));

      await waitFor(() => {
        const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
        expect(saved).toEqual({ current: 1, longest: 1, lastPlayedKey: TODAY, playedKeys: [TODAY] });
      });
    });

    it('recording the same day twice is a no-op (O1: one result per day)', async () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        current: 1, longest: 1, lastPlayedKey: TODAY, playedKeys: [TODAY],
      }));
      search.current = `daily=${TODAY}`;
      render(<MissingElevenPage />);
      await screen.findByText('game 104');

      fireEvent.click(screen.getByRole('button', { name: /give up\?/i }));
      fireEvent.click(await screen.findByRole('button', { name: /are you sure\?/i }));
      await screen.findByText('complete');

      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
      expect(saved.current).toBe(1);
      expect(saved.playedKeys).toEqual([TODAY]);
    });

    it('a completion on a consecutive day extends the streak', async () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        current: 5, longest: 5, lastPlayedKey: '2025-12-31',
        playedKeys: ['2025-12-27', '2025-12-28', '2025-12-29', '2025-12-30', '2025-12-31'],
      }));
      search.current = `daily=${TODAY}`;
      render(<MissingElevenPage />);
      await screen.findByText('game 104');

      fireEvent.click(screen.getByRole('button', { name: /give up\?/i }));
      fireEvent.click(await screen.findByRole('button', { name: /are you sure\?/i }));

      await waitFor(() => {
        const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
        expect(saved.current).toBe(6);
        expect(saved.longest).toBe(6);
        expect(saved.lastPlayedKey).toBe(TODAY);
      });
    });

    it('a missed day resets the streak but keeps the longest', async () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        current: 3, longest: 7, lastPlayedKey: '2025-12-28',
        playedKeys: ['2025-12-26', '2025-12-27', '2025-12-28'],
      }));
      search.current = `daily=${TODAY}`;
      render(<MissingElevenPage />);
      await screen.findByText('game 104');

      fireEvent.click(screen.getByRole('button', { name: /give up\?/i }));
      fireEvent.click(await screen.findByRole('button', { name: /are you sure\?/i }));

      await waitFor(() => {
        const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
        expect(saved.current).toBe(1);
        expect(saved.longest).toBe(7);
      });
    });

    it('does not record a completion for an ordinary game', async () => {
      search.current = '';
      render(<MissingElevenPage />);
      await screen.findByText('game 7');

      fireEvent.click(screen.getByRole('button', { name: /give up\?/i }));
      fireEvent.click(await screen.findByRole('button', { name: /are you sure\?/i }));
      await screen.findByText('complete');

      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('reads the streak from storage after mount and shows it', async () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        current: 2, longest: 2, lastPlayedKey: '2025-12-31', playedKeys: ['2025-12-30', '2025-12-31'],
      }));
      search.current = '';
      render(<MissingElevenPage />);

      // First paint: the streak has not been read yet — nothing streak-derived.
      expect(screen.queryByText(/current streak/i)).not.toBeInTheDocument();

      await screen.findByText('game 7');
      expect(await screen.findByText(/current streak: 2/i)).toBeInTheDocument();
    });

    it('hides the daily entry button once today is played', async () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        current: 1, longest: 1, lastPlayedKey: TODAY, playedKeys: [TODAY],
      }));
      search.current = '';
      render(<MissingElevenPage />);
      await screen.findByText('game 7');

      expect(screen.queryByRole('button', { name: /daily puzzle/i })).not.toBeInTheDocument();
      expect(screen.getByText(/played today/i)).toBeInTheDocument();
    });
  });
  ```

  The two that earn their keep: **"records a completion … surrender counts"** is the E5 decision pinned at the only place it can be — the page is the only component that knows a game completed. **"does not record a completion for an ordinary game"** is the O1 boundary: the streak is a *daily* streak, and a filtered game completing must not touch storage.

- [ ] **Step 4.2: Run it and confirm red.**

  ```bash
  cd frontend && npx vitest run app/missing-eleven/page.test.tsx
  ```

  Expected: the new `streak` cases fail (no storage read/write yet) and the v1.3.1 cases still pass.

- [ ] **Step 4.3: Add the streak state and the two effects.**

  In `frontend/app/missing-eleven/page.tsx`:

  ```tsx
  import { loadStreak, recordCompletion, getDailyStorage } from '@/lib/streakStorage';
  import { EMPTY_STREAK, type StreakState } from '@/lib/streak';

  // inside the component, alongside `confirmingSurrender`:
  // `streak` starts as EMPTY_STREAK on the server and on the first client
  // render, so the markup cannot differ. The read below happens in an effect,
  // after first paint — the hydration constraint from v0.2.5.
  const [streak, setStreak] = useState<StreakState>(EMPTY_STREAK);

  // after the todayKey effect:
  useEffect(() => {
    // The only storage read in the patch. loadStreak never throws: a read
    // failure, corrupt JSON, or an invalid shape all resolve to EMPTY_STREAK.
    const storage = getDailyStorage();
    if (storage) setStreak(loadStreak(storage));
  }, []);

  // completion effect — records a daily completion exactly once per transition:
  useEffect(() => {
    if (state.gameStatus === 'complete' && state.isDaily && state.dailyKey !== null) {
      const storage = getDailyStorage();
      if (!storage) return;
      try {
        // Keyed on the day the puzzle STARTED, never on a freshly computed
        // today: finishing just after 00:00:00 UTC must not credit the wrong
        // day, and nextStreak's idempotence makes a replay a no-op (O1).
        setStreak(recordCompletion(storage, state.dailyKey));
      } catch {
        // Storage write failed (private mode, quota). The game is complete;
        // the streak is simply not persisted this session.
      }
    }
  }, [state.gameStatus, state.isDaily, state.dailyKey]);
  ```

  The completion effect covers **both** ways a game becomes complete — the reducer sets `gameStatus: 'complete'` for a win (all shirts resolved) and for `SURRENDER` — which is the E5 decision: **surrender counts as participation**. There is no branch here that distinguishes them, and that is the point.

  The effect cannot loop: its dependencies (`gameStatus`, `isDaily`, `dailyKey`) are stable across the re-render caused by `setStreak`, so it fires once per transition. A replay of today's puzzle after completion re-fires it, and `recordCompletion` is idempotent for the same key.

- [ ] **Step 4.4: Pass the streak to DailyEntry.**

  In the aside, where v1.3.1 placed `<DailyEntry …/>`:

  ```tsx
  <DailyEntry
    dailyKey={state.dailyKey}
    todayKey={todayKey}
    urlReady={urlReady}
    streak={streak}
    onStartDaily={handleStartDaily}
  />
  ```

- [ ] **Step 4.5: Verify green.**

  ```bash
  cd frontend && npx vitest run app/missing-eleven/
  ```

  Every v1.3.1 page case must still pass unchanged.

- [ ] **Step 4.6: Type-check and lint.**

  ```bash
  cd frontend && npx tsc --noEmit && npm run lint
  ```

  Expect exit 0. The completion effect's `catch` block is intentionally empty of logging — a storage failure is not a user-facing error; if you add a comment, keep the one above.

- [ ] **Step 4.7: Regression — the whole frontend suite.**

  ```bash
  cd frontend && npm run test
  ```

- [ ] **Step 4.8: Commit.**

  ```bash
  git add frontend/app/missing-eleven/page.tsx frontend/app/missing-eleven/page.test.tsx
  git commit -m "feat(frontend): persist the daily streak on completion"
  ```

---

### Task 5: Validate v1.3.2 end to end

**Files:**
- Create: `docs/v1/v1.3/CHANGELOG-v1.3.2.md`

**Steps:**

- [ ] **Step 5.1: Run both suites with coverage.**

  ```bash
  cd backend  && npm run test:coverage
  cd frontend && npm run test:coverage
  ```

  Backend: all four metrics ≥ 95% and **unchanged** — v1.3.2 touches no backend code. Frontend: record the actual numbers; there is no threshold, so the number is information, not a gate.

- [ ] **Step 5.2: The hydration gate — v1.3.1's test must pass unchanged.**

  ```bash
  cd frontend && npx vitest run app/missing-eleven/page.hydration.test.tsx
  ```

  Expected: 2 passed, **no edits to the file**. The first case now also proves the streak read is effect-only: `hydrateRoot` + `act` flush the mount effect, which reads storage, and the markup still matches. The second case (storage throws during render) still passes because `renderToString` never runs effects.

- [ ] **Step 5.3: The Rule 8 boundary gate.**

  ```bash
  cd frontend && grep -rn "localStorage\|sessionStorage\|indexedDB" src app components lib types
  ```

  **Expected: exactly `src/lib/streakStorage.ts`.** Any other hit is a Rule 8 violation and the patch is not shippable until it is removed. Record the (single-line) result in the changelog as evidence.

- [ ] **Step 5.4: Run the production build.**

  ```bash
  cd frontend && npm run build
  ```

  A failure mentioning `missing-suspense-with-csr-bailout` means the `<Suspense>` from v1.3.1 Task 10.6 was disturbed — it must not be.

- [ ] **Step 5.5: Live-smoke the streak by hand.**

  With `npm run dev` in `frontend` and the backend running:

  ```bash
  TODAY=$(date -u +%F)
  open "http://localhost:3000/missing-eleven?daily=$TODAY"
  ```

  1. Play (or surrender) today's daily puzzle.
  2. DevTools → Application → Local Storage: `footplay.daily.v1` exists with `current: 1`, `longest: 1`, `lastPlayedKey: <today>`, `playedKeys: [<today>]`.
  3. Reload the page: the streak line shows "Current streak: 1 · Longest: 1" and the daily entry button is **gone** — "You've played today's puzzle." (O1 gate).
  4. Open the same URL in a second browser profile: no streak, the button is back — storage is per-browser, which is the accepted scope (§10: no server-side persistence).
  5. DevTools console is CLEAN — no hydration warning. This is the real proof of the hydration constraint; Step 5.2's test is a proxy for it.
  6. Play an ordinary (non-daily) game and surrender: `footplay.daily.v1` is unchanged.
  7. Corrupt the stored value by hand (`{not json`), reload: the entry is removed and the page renders with no streak — `loadStreak` refused to persist what it cannot validate.

  Check 5 is the one that matters most and the one no unit test can fully substitute for.

- [ ] **Step 5.6: Confirm the rollback is a pure code revert.**

  ```bash
  git diff --stat v1.3.2~1..HEAD -- backend/ frontend/prisma/
  ```

  Expected: empty. No backend change, no migration, no seed change. Reverting v1.3.2 alone returns the app to v1.3.1 behaviour; the orphaned `footplay.daily.v1` entry in a player's browser is never read.

- [ ] **Step 5.7: Write the changelog.**

  Create `docs/v1/v1.3/CHANGELOG-v1.3.2.md` recording, verbatim rather than paraphrased: the measured baselines, the commands run and their real output, the Step 5.3 grep result, the Step 5.5 observations, and the two decisions below:

  > **E5 (decided): a surrendered daily counts as participation.** The completion effect fires on `gameStatus === 'complete'` regardless of how the game became complete. This is what the v1.4 share text may claim.

  > **O2 (accepted, unchanged from v1.3.1): re-seed shifts daily history.** The streak is keyed to day keys whose puzzles may change after a re-seed. The streak itself is unaffected — it counts days played, not which game was played — but a re-seed can change which game a past day's link resolves to, and can make a day unreachable, which is an ordinary missed day under §6.1: `current` resets to 1, `longest` survives. This is **accepted, documented known behavior**, not a defect to mitigate.

- [ ] **Step 5.8: Commit.**

  ```bash
  git add docs/v1/v1.3/CHANGELOG-v1.3.2.md
  git commit -m "docs: add v1.3.2 changelog and validation evidence"
  ```

---

## Acceptance criteria

1. `frontend/src/lib/streakStorage.ts` is the **only** module that names `localStorage`. `grep -rln "localStorage" frontend/src frontend/app` returns that file alone; every other module reads and writes through its exported functions.
2. All streak arithmetic lives in the pure module (`daysBetween`, `nextStreak`, `hasPlayed`, `isStreakState`) and is testable in a node environment with **no DOM**. No arithmetic is duplicated in a component.
3. The hydration constraint holds for **every** storage read: nothing reads storage during the first render, and the streak display is correct on the very first paint after hydration.
4. A completion is recorded against the **day the puzzle started**, never against a freshly computed "today". A game left open across the rollover records the day it began.
5. Recording the same day twice is a **no-op** (O1: one result per day) — current streak, longest streak, and `playedKeys` are unchanged on the second record.
6. `playedKeys` gates by **DAY, not by (day, difficulty)**. The type is `DailyKey[]` and `isStreakState` rejects any key `isDailyKey` would not.
7. `loadStreak` **refuses to persist what it cannot validate**: corrupt JSON, an unknown shape, or a malformed key falls back to a clean state rather than being written back.
8. No `Date.parse` is applied to a `DailyKey`, anywhere.
9. A surrendered daily **counts as participation** (E5), so surrendering is not a missed day for streak purposes.
10. A missed day resets **current** streak and preserves **longest**, pinned by the named test that already exists in the module.
11. `DailyEntry` shows the streak and gates the already-played-today state; it does not own the arithmetic.
12. This patch is **frontend-only** — no backend change, no Prisma schema change, no migration. Its rollback point is v1.3.1.
13. `npm run test`, `npm run build`, `npx tsc --noEmit`, and `npm run lint` are clean, and every new suite is collected. The suite is measured and recorded, not asserted against a fixed count, per `docs/v1/v1.2/overview.md:209`.

## Validation

| Check | Command | Pass signal |
|---|---|---|
| Frontend suite | `cd frontend && npm run test` | every file green; count measured and recorded, not asserted |
| The pure streak module | `cd frontend && npx vitest run src/lib/streak.test.ts` | every case green in a node environment, with no DOM |
| The storage adapter | `cd frontend && npx vitest run src/lib/streakStorage.test.ts` | validation, rejection, and round-trip cases green |
| The display and the today gate | `cd frontend && npx vitest run src/components/DailyEntry.test.tsx` | green, including the already-played-today path |
| Production build | `cd frontend && npm run build` | no output |
| Types | `cd frontend && npx tsc --noEmit` | no output |
| Lint | `cd frontend && npm run lint` | no output |
| **One module owns storage** | `grep -rln "localStorage" frontend/src frontend/app` | exactly `frontend/src/lib/streakStorage.ts` |
| `playedKeys` is keyed by day | `grep -n "playedKeys" frontend/src/lib/streak.ts` | typed `DailyKey[]` — no difficulty field |
| No `Date.parse` on a key | `grep -rn "Date.parse" frontend/src/lib/streak.ts frontend/src/lib/streakStorage.ts` | no output |
| No backend drift | `git diff --stat -- backend/ backend/prisma/` | empty — frontend-only, no migration |
| The include was not re-narrowed (R7) | `grep -n "include:" frontend/vitest.config.ts` | unchanged from v1.1.1 |

---

## Risks

| Risk | Mitigation |
|---|---|
| **A re-seed changes which game a day resolves to, or makes a day unreachable** — so a streak can shift or break for reasons outside the player's control. | **Documented known behavior, not a defect** (roadmap §9 O2, §9.1 RD3). The streak module stores day keys and never the game, so the first row introduces no code path; the second is an ordinary missed day under §6.1, already pinned by `a missed day resets current but keeps longest`. No mitigation is added, deliberately: an "excused day" concept would be new scope and a new storage shape. |
| **A per-(day, difficulty) streak is implemented by "helpfully" keying `playedKeys` on both fields.** | `playedKeys` is `DailyKey[]` — the type forbids it, and `isStreakState` rejects any key `isDailyKey` would not. The ratification's rationale (§6.2 orthogonality; penalising Easy) is in the Global Constraints so an implementer does not re-derive it. `STORAGE_KEY` remains the seam for a future reversal. |
| **`hasPlayed` is read as a v1.4 gate on the copy control**, putting a `localStorage` read into the clipboard path. | Ratified **not** to exist (§9.1, RD7). v1.4.2's Step 5.3 greps for `hasPlayed` in `src/` and a hit is a failure. This row exists because the earlier handoff wording invited the inference. |

---

## Escalations

These were raised when this plan was written. Each is a contract discrepancy or a decision the roadmap left open; none was resolved by renaming anything.

| # | Item | What v1.3.2 does | Needs |
|---|---|---|---|
| **E5** | Whether a *surrendered* daily counts toward the streak was not settled by §6.1. | **Decided: surrender counts as participation.** The completion effect fires on `gameStatus === 'complete'`, which the reducer sets for both a win and `SURRENDER`. Tested in Task 4, recorded in the changelog. | `lead` to ratify before v1.4, because the v1.4 share text may claim a streak. A surrender also produces an **11-slot** share grid when the opponent half was untouched (roadmap §7, RD2), so the text may describe a partial result. |
| **O1** | One streak per day, or one per (day, difficulty)? | **Ratified — closed as "one result per day, global across difficulties"** (roadmap §9.1, RD3). `playedKeys` gates by day; `STORAGE_KEY = 'footplay.daily.v1'` is the containment seam — a future reversal means bumping the key, which invalidates the old shape with no migration. §6.2 makes daily and difficulty orthogonal, so a per-difficulty streak would penalise playing on Easy. | **None — settled. Do not re-open.** |
| **O2** | A re-seed changes the dataset and therefore the daily selection. | **Documented known behavior, not a caveat to resolve** (roadmap §9, §9.1 RD3). A re-seed can change which game a day resolves to — the streak is unaffected, because it stores day keys and never the game — or make a day unreachable, which is an ordinary missed day under §6.1 and resets `current` while `longest` survives. Both rows are in the Global Constraints table; the second introduces **no new code path**, so it is pinned by the existing missed-day test rather than by a re-seed-specific one. | **None — accepted behavior.** Recorded in the changelog. |
| **E4 (carried)** | `frontend/node_modules` lacks `next/dist/docs/` in this working tree. | v1.3.2 adds no Next.js API surface at all — the storage work is plain React state + effects. The v1.3.1 note stands: an implementer with a populated `node_modules` should confirm `FilterUrlSync` still needs no Suspense move. | None for this patch. |

---

## Handoff to v1.4

- **`StreakState` is the input v1.4 needs for the share text.** The v1.4 block carries the mode and the score; whether it may also claim a streak depends on the E5 ratification above — a share text that implies "won" would be wrong for a surrendered completion.
- **`hasPlayed(streak, todayKey)` gates starting a second daily — and it is NOT a gate on v1.4's copy control.** The earlier phrasing here ("the gate v1.4's share affordance sits behind") invited the wrong inference and has been corrected by ratification (§9.1, RD7): v1.4 ships **no** `hasPlayed` gating and its clipboard path reads no storage at all. The completion overlay is reachable by playing, which is the only sense in which the affordance sits behind the gate.
- **`STORAGE_KEY = 'footplay.daily.v1'` is the streak-scope seam.** A future reversal to per-(day, difficulty) means bumping the key — never migrating the old shape.
- **The Rule 8 boundary is the revert contract.** Any future patch that needs storage goes through `streakStorage.ts`; a patch that does not need storage must not name `localStorage` at all.