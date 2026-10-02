# v1.3 — Daily puzzle (overview)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One deterministic puzzle per UTC day, shareable by link, with a persisted streak — the first storage surface in the project, introduced without regressing the hydration constraint that v0.2.5 fixed by removing storage.

**Architecture:** One pure selection function, mirrored across the network boundary and pinned by identical fixture tables in both suites. The backend resolves the eligible pool (530 of 10,219 games are unplayable), runs the same function, and returns a `GameResponse`; the client reads `?daily=` through v1.1.2's existing single URL reader. v1.3.2 adds one pure streak module and one storage adapter — the **only** module that names `localStorage` — and records completions in an effect that fires on `gameStatus === 'complete'`, covering both wins and surrenders.

**Tech Stack:** TypeScript, Prisma 7 raw SQL, Express 4, Vitest + Testcontainers (backend, 95% gate), Next.js 16 App Router, React 19, Tailwind 4, Vitest + jsdom + Testing Library (frontend).

---

> **Ratified decisions are not decided here.** Roadmap [§9.1](../roadmap-v1.md#91-ratified-decisions) is authoritative for every decision the owner has closed; a plan's preflight **verifies** the ratified answer and never re-decides it. Where a plan and that table disagree, the table wins and the plan is the defect. A question the table does not cover is still an escalation.

---

## The two patches

| Patch | What lands | Files it adds | Rollback to |
|---|---|---|---|
| **v1.3.1** — `plan-v1.3.1-daily-puzzle.md` | Deterministic daily selection (`selectDailyGameId`, FNV-1a 32-bit over the UTC day key), `GET /api/matches/daily` registered above `/:id`, `?daily=` read/written through `FilterUrlSync`, `START_DAILY` in the game state, the `DailyEntry` component, and a mode-aware page load effect. **Zero storage access.** | `frontend/src/lib/daily.ts`, `frontend/src/components/DailyEntry.tsx`, `backend/src/lib/dailyKey.ts`, `backend/src/lib/dailySelection.ts`, `backend/src/services/dailyService.ts`, plus `dailyToParams` / `paramsToDailyKey` **appended** to v1.1.1's `frontend/src/lib/filterParams.ts`. **4 backend test files, 5 frontend test files** (M-6 correction: the earlier count of "2 backend / 4 frontend" was wrong on both halves. The frontend figure is 5 rather than 6 because the M-4 correction folds v1.3.1's `?daily=` tests into v1.1.1's existing `filterParams.test.ts` instead of creating a sixth `dailyParams.test.ts`; 4 further test files are modified rather than created) | v1.2.x |
| **v1.3.2** — `plan-v1.3.2-streak-persistence.md` | Pure streak arithmetic (`daysBetween`, `nextStreak`, `hasPlayed`, `isStreakState`), the storage adapter (`STORAGE_KEY = 'footplay.daily.v1'`, `loadStreak`, `recordCompletion`, `getDailyStorage`), completion recording in the page (surrender counts — E5), and the already-played-today gate + streak line in `DailyEntry`. **First and only `localStorage` surface.** | `frontend/src/lib/streak.ts`, `frontend/src/lib/streakStorage.ts`, 2 frontend test files | v1.3.1 |

**Rollback chain is strict and one-directional:** v1.3.2 → v1.3.1 → v1.2.x. Both reverts are pure code reverts — no migration, no seed change, no data repair. Reverting v1.3.2 orphans `footplay.daily.v1` in players' browsers (never read by v1.3.1); reverting v1.3.1 makes a `?daily=` link play an ordinary game because nothing reads the param.

---

## Line counts

| File | Lines |
|---|---|
| `docs/v1/v1.3/plan-v1.3.1-daily-puzzle.md` | 2549 |
| `docs/v1/v1.3/plan-v1.3.2-streak-persistence.md` | 1159 |
| `docs/v1/v1.3/overview.md` | this file |

---

## Timezone rule and rationale

**The day key is the UTC calendar date; the boundary is 00:00:00 UTC; there is one rollover per day, shared by every user on earth.** `toDailyKey(date) = date.toISOString().slice(0, 10)`, matching `matchService.ts:56`.

1. **It is the only rule under which a daily puzzle is shareable.** A local-timezone key makes the puzzle a function of the viewer's UTC offset — Auckland and Los Angeles would get different games from the same link, and a daily result could not be compared or broadcast.
2. **It is the rule the codebase already uses to produce a key.** `matchService.ts:56` is UTC; `GameComplete.tsx:26` is local, but that is display formatting, a different job. v1.3 follows the UTC side and says so.
3. **It keeps the server authoritative.** `?date=YYYY-MM-DD` is a single canonical form the server can validate — which is what makes a 400 on a malformed date possible at all.
4. **UTC has no DST, so a day is always 86,400,000 ms.** `daysBetween` in v1.3.2 is exact integer arithmetic on epoch days; a local key would make a day 23 or 25 hours long twice a year.

**What is given up, stated plainly:** at 00:00 UTC the puzzle rolls over at 19:00 in Los Angeles the previous day and at 12:00 in Auckland. A player mid-game across the boundary keeps the puzzle they started, and `recordCompletion` keys on the `dailyKey` the game started with — never a freshly computed today — so the streak is credited to the day played, not the day finished. Re-keying at completion time would let a player farm a streak by finishing just after midnight.

---

## Hydration proof

The constraint: **no storage read may render differently between server and client on first paint.**

- `streak` state initialises to the shared `EMPTY_STREAK` on the server and on the first client render; the storage read happens in a mount effect, after first paint.
- `loadStreak` never throws — a read failure, corrupt JSON, or an invalid shape all resolve to `EMPTY_STREAK` (and corrupt data is removed, not repaired).
- `DailyEntry`'s `streak` prop is optional with an `EMPTY_STREAK` default — the type-level expression of the constraint.
- The v1.3.1 hydration test (`page.hydration.test.tsx`) passes **unchanged** in v1.3.2: the first case hydrates cleanly while the mount effect reads storage (proving the read is effect-only), and the second case (storage throws during render) still passes because `renderToString` never runs effects.
- The live smoke (v1.3.1 Step 11.4, v1.3.2 Step 5.5) checks the DevTools console is clean — the real proof no unit test can fully substitute for.

---

## Cross-line contract escalation

Raised in the v1.3.1 plan's Escalations table; none was resolved by renaming anything.

**`E1`–`E5` below are this line's escalation IDs**, carried by the v1.3 specifier
handoff. They are **not** roadmap identifiers, and they collide index for index with
v1.4's separate `E1`–`E5` series — share grid, position order, `vitest.config.mts`,
`hasPlayed` gating, `renderShareText` — so a bare `E1` in this tree means one of two
unrelated questions. Cite one as **v1.3 escalation `E#`**. The roadmap's ratified
decisions are `RD#` (§9.1) and its cross-cutting risks are `R#` (§8); the
`GameFilters` / `GameFilterParams` naming question answered here is settled by this
table, **not** by §9.1, which has no naming row.

| # | Discrepancy | What v1.3 does |
|---|---|---|
| **E1 (v1.3 escalation)** | The frozen contract names `GameFilters` with non-null lists in `frontend/types/index.ts`; v1.1.x froze `GameFilterParams` with nullable lists in `frontend/types/filters.ts`. **Resolved** — not a decision, just two names for one type. | Consumes `GameFilterParams` as v1.1.x actually froze it. Nothing in v1.3 names `GameFilters`. |
| **E2** | The contract places filter helpers in `frontend/src/lib/filterParams.ts`; v1.1.1 Task 8 originally placed them in `frontend/types/filters.ts`, contradicting its own architecture line. | v1.1.1 now aligns to the contract, so `frontend/src/lib/filterParams.ts` **exists** by the time v1.3.1 runs. v1.3.1 **appends** `dailyToParams` / `paramsToDailyKey` to it and extends the existing test file; it does not move, re-export, or overwrite v1.1.1's filter helpers. |
| **E3** | The contract puts selection on the client while the endpoint returns a resolved `GameResponse`. | A deliberate four-line duplicate, pinned by identical literal fixture tables in both suites. |
| **E4** | `node_modules/next/dist/docs/` is absent in this working tree. | v1.3 adds no new `useSearchParams` surface; it extends v1.1.2's single reader with props. |
| **E5** | Whether a surrendered daily counts toward the streak was unsettled. | **Decided in v1.3.2: surrender counts as participation** — the completion effect fires on `gameStatus === 'complete'` for wins and surrenders alike. Ratification needed before v1.4, whose share text may claim a streak. A surrender with an untouched opponent half is an **11-slot** grid (roadmap §7, RD2), so the share text describes a partial result and must not imply 22. |

### Streak scope — ratified, and the re-seed consequence is known behavior

**O1 is closed: one streak per day, global across difficulties** (roadmap §9.1, RD3).
`playedKeys` gates by day, and `STORAGE_KEY = 'footplay.daily.v1'` is the containment
seam for a future reversal. §6.2 treats daily and difficulty as **orthogonal axes**, so
a daily streak answers only "did you play today"; keying it by difficulty would
penalise a player for choosing Easy. This is ratified, not an open default — v1.3.1's
and v1.3.2's plans verify it and do not re-decide it.

**A re-seed can shift or break a streak, and that is documented known behavior rather
than a caveat to resolve** (roadmap §9 O2). Two consequences, deliberately not merged:

- **A day resolves to a different game.** The streak is unaffected — the stored shape is
  day keys and never the game, which is exactly why it survives a re-seed.
- **A day becomes unreachable.** That is an ordinary missed day under §6.1: `current`
  resets to 1, `longest` survives. Adding an "excused day" exemption would be new scope
  and a new storage shape, so no mitigation is added.

The second row introduces no new code path, so it is pinned by the existing missed-day
test rather than by a re-seed-specific one; the reasoning and the reasoning-as-tests
sit in v1.3.2's Global Constraints and Risks table.

**Open decisions inherited and irrelevant here:** O5 — the send-off icon is decoration
in every mode, and a streak line makes no claim about any clue.

---

## Handoff to v1.4

- `StreakState` and the E5 ratification are the inputs v1.4 needs for the share text.
- `hasPlayed(streak, todayKey)` gates **starting a second daily**, and it is **not** a gate on v1.4's copy control: v1.4 ships no `hasPlayed` gating and its clipboard path reads no storage at all (§9.1, RD7). The earlier phrasing of this bullet invited the wrong inference and is corrected here.
- Any future storage access goes through `streakStorage.ts`; a patch that does not need storage must not name `localStorage` at all (Rule 8).