# Changelog v1.3.1 — Deterministic Daily Puzzle

**Scope.** `GET /api/matches/daily?date=YYYY-MM-DD` resolves one playable game per UTC day from the whole eligible pool; `/missing-eleven?daily=YYYY-MM-DD` plays it. Same key ⇒ same game everywhere, UTC rollover at `00:00:00Z`. Daily ignores filters. No browser storage, no schema change, no migration.

## Baselines and final counts

| Workspace | Before | After | Delta |
|---|---|---|---|
| Backend | 23 files / 341 tests | **27 files / 380 tests** | +4 files / +39 tests |
| Frontend | 33 files / 558 tests | **38 files / 637 tests** | +5 files / +79 tests |

Counts are measured, not asserted (per `docs/v1/v1.2/overview.md:209`).

## Step 11.1 — Suites with coverage

`cd backend && npm run test:coverage`

```
Test Files  27 passed (27)
     Tests  380 passed (380)
Statements   : 98.02% ( 743/758 )
Branches     : 95.17% ( 572/601 )
Functions    : 98.64% ( 146/148 )
Lines        : 98.13% ( 633/645 )
```

All four backend metrics are ≥ 95% (gate met).

`cd frontend && npm run test:coverage`

```
Test Files  38 passed (38)
     Tests  637 passed (637)
Statements   : 98.48% ( 913/927 )
Branches     : 96.41% ( 780/809 )
Functions    : 98.02% ( 248/253 )
Lines        : 99.21% ( 761/767 )
```

Frontend has no threshold; recorded as information.

## Step 11.2 — Production build (Suspense gate)

`cd frontend && npm run build`

```
▲ Next.js 16.3.4 (Turbopack)
✓ Compiled successfully in 1037ms
✓ Generating static pages using 6 workers (5/5) in 465ms
Route (app)
┌ ○ /
├ ○ /_not-found
└ ○ /missing-eleven
```

No `missing-suspense-with-csr-bailout` and no “deopted into client-side rendering”. `FilterUrlSync` remains below its `<Suspense>` boundary, mounted for every started state (loading/error/empty/board) so `onReady` can unlock a deep link.

## Step 11.3 — Storage gate

Production source only (test files excluded, because the hydration suite is a deliberate negative control):

```bash
grep -rn "localStorage\|sessionStorage\|indexedDB\|STORAGE_KEY\|loadStreak\|recordCompletion\|resolveStorage" \
  frontend/src frontend/app frontend/components frontend/lib frontend/types --exclude='*.test.*' --exclude='*.test.tsx'
```

**Output: empty.** v1.3.1 adds zero storage access.

The only literal `localStorage` occurrence in the repo is `frontend/app/missing-eleven/page.hydration.test.tsx`, which installs a getter that **throws** on access and asserts the page renders anyway. That is the proof of absence, not a use.

Related gates:

- `grep -rn "Date.parse" frontend/src/lib/daily.ts backend/src/lib/dailyKey.ts backend/src/lib/dailySelection.ts` → empty.
- Actual URL-reader calls (`useSearchParams(`): `frontend/app/missing-eleven/FilterUrlSync.tsx` only. (`page.tsx` mentions the hook only in a comment.)
- `git diff --stat -- backend/prisma/` between the v1.3.1 base and HEAD → empty. No schema, seed, or migration change.
- `npx tsc --noEmit` (frontend) → empty.
- `npm run lint` (frontend) → exit 0, 0 errors. One pre-existing `react-hooks/exhaustive-deps` warning at `page.tsx:180` (`state.opponentPhase`); that dependency array is unchanged from the base commit.

## Step 11.4 — Live daily contract

Backend run on a scratch port against the local development database (`footplay_dev`, 10,219 games / 218,988 appearances). `TODAY=2026-10-26`.

```
today gameId:                        "gameId":2478658
today gameId (again):                "gameId":2478658
2026-01-01:                          "gameId":2604207
2026-01-02:                          "gameId":4112903
filters ignored (2026-01-01 + junk): "gameId":2604207
malformed 2026-02-30:                400
  {"error":"Query parameter 'date' must be a calendar date in YYYY-MM-DD form","code":"INVALID_PARAMETER"}
GET /api/matches/daily?date=TODAY:   200
GET /api/matches/2478658:            200
daily response:                      homeLineup=0 awayLineup=0 homePreview=11 awayPreview=11
target lineup on request:            homeLineup=11 (normal clues)
```

- Determinism: identical `gameId` for the same key.
- Two days differ: `2026-01-01` ≠ `2026-01-02`.
- Filters ignored: adding `teamIds`/`competitionIds` returns the same `2026-01-01` game.
- Malformed date is a 400, not a fallback.
- Route order: `/daily` is not captured by `/:id`.
- Playability: both lineups have 11 players.

Caveat: the plan's `GET /api/matches/1 → 200` assumed id `1` exists. This dataset uses ids such as `2478658`; id `1` returns 404. The route itself is healthy (`/api/matches/2478658 → 200`).

**Browser walkthrough (11.4 steps 1–7):** not run — no headless browser is installed in this environment. Every listed behavior is covered by automated tests (`page.daily.test.tsx`, `page.hydration.test.tsx`, `FilterUrlSync.test.tsx`) plus the production build. The interactive DevTools-clean-console check remains the one manual check a maintainer should repeat before release.

## Step 11.5 — Rollback is a code revert

`git diff --stat v1.3.1~1..HEAD -- backend/prisma/` → empty (the tag does not exist yet; the same check against the branch base is empty). No migration, seed, or data repair. Reverting v1.3.1 returns the app to v1.2.x; a leftover `?daily=` link simply plays an ordinary game because nothing reads it.

## Cross-boundary agreement

`selectDailyGameId` and `dailyHash32` are mirrored in `frontend/src/lib/daily.ts` and `backend/src/lib/dailySelection.ts`. The fixture tables are identical in `frontend/src/lib/daily.test.ts` and `backend/src/__tests__/unit/dailySelection.test.ts` (selection rows for `2026-01-01/02`, `2026-03-01`, `2025-12-31`, `2026-06-28`; hash rows including `2013-07-27`). Changing one without the other is a test failure, not a silent puzzle republish.

## Escalation outcomes (Task 0.5)

| # | Outcome |
|---|---|
| **E1** (`GameFilters` vs `GameFilterParams`) | Consumed `GameFilterParams` as v1.1.x actually froze it. Nothing in v1.3.1 names `GameFilters`; no rename. |
| **E2** (location of filter helpers) | Resolved in v1.1.1. `dailyToParams` / `paramsToDailyKey` were appended to `frontend/src/lib/filterParams.ts`; no new module, nothing moved. |
| **E3** (client/server duplicate) | Accepted. The duplicated selection is pinned by identical fixture tables in both suites. |
| **E4** (Next 16 docs unavailable) | Accepted. The production build in Step 11.2 passed, confirming the existing `<Suspense>` placement for Next 16.3.4. |
| **E5** (does a surrendered daily count toward a streak?) | Deferred to v1.3.2; v1.3.1 has no streak. |

## Post-release fix — daily is Normal, opponent deferred

The original daily response returned both full lineups. That pre-populated the opponent board, so Normal's “opponent only after the target XI” rule could never open: `canContinueOpponent` required an empty opponent board and a full opponent preview, while the daily had neither. A previously selected Easy/Hard/Expert mode also leaked into a daily because `START_DAILY` did not reset `difficulty`.

The fix makes the daily a single Normal-ruleset mode:

- `START_DAILY` normalizes `difficulty` to `normal` on every entry, including same-key re-entry; `SET_DIFFICULTY` is ignored while `isDaily`; `SET_MATCH` keeps opponent shirts empty in daily mode.
- `GET /api/matches/daily` now calls `buildMatchResponse(game, 'normal', true)` and returns `homePreview` / `awayPreview` with empty lineups.
- `loadDaily` fetches only the target XI with `normal` clues. Continue fetches the opponent through the same path as an ordinary Normal game.
- `canContinueOpponent(state)` is now a tested selector in `frontend/src/lib/gameState.ts`; the page no longer keeps an inline copy.
- `fetchDailyMatch` mock mode returns the same preview-only shape.

This supersedes the “both full lineups” expectation in the original acceptance criteria and the “daily and difficulty are orthogonal” reading of §6.2. `DailyEntry` copy is unchanged.

Post-fix validation (2026-10-26):

| Workspace | Tests | Coverage |
|---|---|---|
| Backend | 27 files / 381 tests | 99.20% statements, 97.17% branches, 100% functions, 99.53% lines |
| Frontend | 38 files / 670 tests | 98.66% statements, 96.81% branches, 98.13% functions, 99.50% lines |

`npx tsc --noEmit` is clean in both workspaces; `npm run build` is clean; `npm run lint` exits 0 with the same pre-existing `react-hooks/exhaustive-deps` warning at `page.tsx:180`.

## Known deviation

`FilterUrlSync`'s write effect only removes `?daily=` when the current URL value parses to a real day key. A malformed value (e.g. `?daily=1`) is preserved as an opaque parameter rather than rewritten. Rationale: it keeps v1.1.2's “preserve unrelated params” contract for values the daily state never owned. A valid-but-not-today key is still removed when the player leaves daily mode, so the expired-link escape hatch self-heals the address bar as designed.

## Re-seed vs daily history

> **Re-seed vs daily history (roadmap O2, default: accept the shift).** The daily pool is the set of eligible game ids, so a re-seed that changes the dataset changes which game a given day key selects. Some past days' puzzles will change. This is accepted and documented rather than mitigated: it is operational, not architectural, and it cannot be mitigated without freezing the selection, which would make the puzzle wrong in a different way.
