# v1.3.2 — Daily streak persistence

Scope: frontend only. No backend, Prisma, or seed changes.

## What shipped

- `frontend/src/lib/streak.ts` — pure streak arithmetic:
  `daysBetween`, `nextStreak`, `hasPlayed`, `isStreakState`, `StreakState`,
  `EMPTY_STREAK`. No storage, DOM, clock, or randomness.
- `frontend/src/lib/streakStorage.ts` — the only runtime module that names
  browser storage. `STORAGE_KEY = 'footplay.daily.v1'`,
  `getDailyStorage`, `loadStreak`, `recordCompletion`.
- `frontend/src/components/DailyEntry.tsx` — optional `streak` prop, a
  "Current streak: N · Longest: M" line when history exists, and the O1
  gate: once today is in `playedKeys` the entry says "You've played today's
  puzzle." and offers no start button.
- `frontend/app/missing-eleven/page.tsx` — post-mount streak read, and one
  completion effect that records the daily when the reducer reaches
  `complete` **or** `surrendered`.

## Validation

Commands run from the repository root unless noted.

### Backend coverage — unchanged, no backend code touched

```text
cd backend && npm run test:coverage
Statements   : 99.2%  (752/758)
Branches     : 97.01% (585/603)
Functions    : 100%   (148/148)
Lines        : 99.53% (642/645)
```

### Frontend suite

```text
cd frontend && npm run test
Test Files  40 passed (40)
Tests       729 passed (729)
```

### Frontend coverage — informational, no threshold

```text
cd frontend && npm run test:coverage
Statements   : 98.65% (1025/1039)
Branches     : 96.74% (892/922)
Functions    : 98.23% (278/283)
Lines        : 99.53% (853/857)

src/lib/streak.ts       97.14% stmts · 95.74% branch · 100% funcs · 100% lines
src/lib/streakStorage.ts fully covered by its node-environment adapter tests
```

### Hydration gate — v1.3.1 test unchanged

```text
cd frontend && npx vitest run app/missing-eleven/page.hydration.test.tsx
Test Files  1 passed (1)
Tests       2 passed (2)
```

No edits were made to `page.hydration.test.tsx`. The first case flushes the
mount effect (which reads storage) and still matches markup; the second case
throws if storage is read during render, and `renderToString` never runs
effects.

### Typecheck, lint, build

```text
cd frontend && npx tsc --noEmit          # clean
cd frontend && npm run lint              # 0 errors, 1 pre-existing warning
cd frontend && npm run build             # compiled; / and /missing-eleven static
```

`next build` emitted no `missing-suspense-with-csr-bailout` failure.

### Rule 8 boundary

```text
grep -rn "localStorage\|sessionStorage\|indexedDB" \
  frontend/src frontend/app frontend/components frontend/lib frontend/types
```

Result (runtime code):

```text
frontend/src/lib/streakStorage.ts:5   * The ONLY module ... names localStorage
frontend/src/lib/streakStorage.ts:15  /** window.localStorage when it exists ... */
frontend/src/lib/streakStorage.ts:17  return typeof window === 'undefined' ? null : window.localStorage;
```

One deviation from the plan's "exactly one file" expectation: the v1.3.1
hydration guard `frontend/app/missing-eleven/page.hydration.test.tsx` also
contains the literal `localStorage` because it installs a getter that throws
on render-time access. That test must pass unchanged (Task 5.2), so the
literal stays. It is a test guard, not a runtime reader; `streakStorage.ts`
remains the only production module that reads storage.

### Pure-module boundary

```text
grep -n "localStorage\|sessionStorage\|indexedDB\|Math.random\|Date.now()" \
  frontend/src/lib/streak.ts
```

No output.

### Rollback is a pure code revert

```text
git diff --stat HEAD~4..HEAD -- backend/ frontend/prisma/
```

Empty. The four v1.3.2 commits touch no backend or migration files. (Compared
against `v1.3.1`, the repository also contains earlier post-tag Sonar
commits, so the tag range is not the right baseline for this gate.)

## Decisions

> **E5 (decided): a surrendered daily counts as participation.** The
> completion effect fires on `gameStatus === 'complete'` or
> `gameStatus === 'surrendered'`. `nextStreak` is idempotent for the same day,
> so re-renders cannot inflate the streak. This is what the v1.4 share text
> may claim.

> **O2 (accepted, unchanged from v1.3.1): re-seed shifts daily history.** The
> streak is keyed to day keys whose puzzles may change after a re-seed. The
> streak itself is unaffected — it counts days played, not which game was
> played — but a re-seed can change which game a past day's link resolves to,
> and can make a day unreachable, which is an ordinary missed day under §6.1:
> `current` resets to 1, `longest` survives. This is **accepted, documented
> known behavior**, not a defect to mitigate.

## Deviations from the plan

- `DailyKey` is not exported by `frontend/src/lib/daily.ts`; the shipped
  module uses `string` day keys and validates with the existing
  `isDailyKey`, matching v1.3.1.
- Plan test fixtures with `longest > playedKeys.length` were corrected;
  `isStreakState` rejects them by design (a longest streak cannot exceed the
  number of recorded days).
- A dead validator branch (`playedKeys.length === 0 && lastPlayedKey !== null`)
  was removed: it is unreachable given the `current === 0` and
  `current > playedKeys.length` rules above it.
- Page streak tests seed and read through `getDailyStorage()`/`STORAGE_KEY`
  so test files do not name the storage API directly.

## Not performed

Step 5.5's manual browser live-smoke (DevTools inspection, second profile,
console-clean check) was not run in this environment. It remains the one
manual acceptance step; automated coverage and the hydration proxy are
recorded above.
