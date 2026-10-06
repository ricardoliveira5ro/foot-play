# v1.1.1 — Filter foundation

## Delivered

- Added a pure completeness rule and a shared parameterized SQL predicate. Random match selection and every filter count now exclude games without exactly 11 distinct `starting_lineup` players for each game-specific club.
- Added filter facets and totals in one grouped SQL statement, with club and competition metadata queried from the unfiltered option universe. The API keeps zero-count options visible and removes each selected dimension from its own facet counts.
- Added `GET /api/matches/filter-options`, and applied the same parsed filters to `GET /api/matches/random` so the frontend client does not send ignored query parameters.
- Aligned player search and its response to `displayName ?? name`.
- Widened Vitest discovery to `src/**`, `components/**`, `tests/**`, and `app/**`; removed the shadow config; converted the Shirt colour type-check script into a real test.
- Added frontend filter types, URL helpers, filter predicates, API calls, and mock filter behavior. No filter controls are rendered.

## Contract decisions and implementation notes

- **SQL completeness contract:** accepted by the project owner before Task 4. `completeLineupsWhere()` returns `Prisma.Sql`; the generated Prisma relation filters cannot express per-side counts correlated to a parent game's home and away clubs.
- **Filter type name:** uses the ratified `GameFilterParams` name with nullable lists. The plan's alternate `GameFilters` reference conflicts with the v1.3 E1 resolution, so no `GameFilters` alias was added.
- **Option labels:** team, opponent, and competition options include `name`. The plan requires unfiltered metadata lookups and later selector plans consume names, although its response sketch omits them.
- **Current Shirt API:** this checkout has no `COLORS` map or home/away/neutral Shirt branches. The real component test covers its actual four pattern branches and default fill/stroke.
- **Nullable random result:** the existing page's three match-fetch call sites now handle `null` through its existing error state. No filter UI was added.
- **Build backend:** the default Turbopack build could not spawn its CSS worker/bind a local port in this environment. The same production build completed with Next's supported webpack backend.

## Validation evidence

### Backend

`npm run test:coverage` — **passed**, 20 files and 322 tests.

```text
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |   99.42 |    96.99 |     100 |   99.66 |
 src/routes        |   97.93 |    92.68 |     100 |    98.9 |
  guess.ts         |     100 |    97.91 |     100 |     100 | 65
  matches.ts       |   95.55 |    82.75 |     100 |    97.5 | 14
 src/services      |   99.55 |    96.83 |     100 |   99.73 |
  filterService.ts |   93.33 |    91.66 |     100 |     100 | 109
  matchService.ts  |     100 |    86.36 |     100 |     100 | 70,94-96,125,155
  playerService.ts |     100 |       75 |     100 |     100 | 21
  ...ionMapping.ts |    99.7 |    99.12 |     100 |    99.64 | 249
-------------------|---------|----------|---------|---------|-------------------
Statements   : 99.42% ( 690/694 )
Branches     : 96.99% ( 517/533 )
Functions    : 100% ( 135/135 )
Lines        : 99.66% ( 590/592 )
```

`npm run build` — passed (`tsc`).

Focused checks passed during implementation:

- `npx vitest run src/__tests__/unit/lineupCompleteness.test.ts --coverage.enabled --coverage.include='src/lib/lineupCompleteness.ts'` — 12 tests; 100% lines, statements, functions, and branches for the predicate.
- `npx vitest run src/__tests__/unit/filterQuery.test.ts src/__tests__/integration/filterService.test.ts` — 16 tests.
- `npx vitest run src/__tests__/integration/routes/filterOptions.test.ts` — 9 tests.
- `npx vitest run src/__tests__/integration/matchService.test.ts src/__tests__/integration/routes/matches.test.ts` — 31 tests, including filtered random selection and the no-match case.
- `npx vitest run src/__tests__/integration/playerService.test.ts` — 10 tests.

### Frontend

- `npm run test` — passed, 15 files and 223 tests.
- `npx tsc --noEmit` — passed.
- `npm run lint` — passed with 0 errors; one existing unused-import warning remains in `frontend/src/components/GameComplete.test.tsx`.
- `npm run build -- --webpack` — production build passed; routes `/`, `/_not-found`, and `/missing-eleven` compiled and prerendered.
- Default `npm run build` — Turbopack failed in this environment while creating a CSS worker and binding a local port. The webpack production build above provides the successful build verification.

### Live endpoint smoke

With the local development server running:

- `GET /api/matches/filter-options` returned the five expected top-level keys and `total: 9689`.
- Seasons were exactly 2013 through 2025; no null season or 2026 option appeared.
- `GET /api/matches/filter-options?teamIds=5` returned `total: 557`; the selected AC Milan team facet also remained 557, and opponent counts were populated under the team filter.
- Both live requests returned HTTP 200.

## Task commits

Each implementation task was committed separately. The sequence includes a small follow-up commit correcting the player route expectation and a follow-up applying filters to random match selection, which the client contract required but the plan did not wire through on the backend.
