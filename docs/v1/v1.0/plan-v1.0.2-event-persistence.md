# Event Column Exposure & Game Filter Indexes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The match and lineup API response carries `goals`, `assists`, `redCards` and `isCaptain` on every lineup entry, the frontend type matches it exactly, and `Game.season`, `Game.date` and `Game.targetTeamId` are indexed for the v1.1 filters.

**Architecture:** Three additive index statements on `Game` (the only migration in this patch). `buildLineup` in `backend/src/services/matchService.ts` copies four already-present columns onto each lineup entry; `frontend/types/index.ts` `LineupPlayer` gains the identical four fields, and the three test fixtures plus the mock dataset are updated in the same commit so the two halves of the contract never disagree.

**Tech Stack:** Prisma 7 (schema + `migrate dev`), Express 4, Prisma raw SQL for the index assertion, Vitest + Testcontainers, Next.js 16 / React 19, TypeScript strict.

## Global Constraints

- **Rule 1 (§11): v1.0.1 must already be merged.** "No data, no columns to expose." If `Appearance.goals` is still 0 everywhere in the deployed database, this patch is still correct — the columns default to `0` and the API returns `0` — but the seed must have been re-run before v1.0.3's icons mean anything.
- **The index list is CLOSED:** `Game.season`, `Game.date`, `Game.targetTeamId`. Adding an `Appearance` index here is a defect (R4). Adding any fourth `Game` index is a defect. `@@index([competitionId])` already exists (`backend/prisma/schema.prisma:62`) and stays.
- **`Game.season` and `Game.date` are nullable** (`Int?`, `DateTime?`). A plain btree index serves both equality and the v1.1 range queries; do not reach for a partial or expression index — there is no measured need.
- **Frozen API names.** Each `LineupPlayer` entry gains exactly:
  ```ts
  goals: number;      // 0 when unknown — see degradation note
  assists: number;
  redCards: number;
  isCaptain: boolean;
  ```
  v1.1 and v1.2 consume these verbatim.
- **Graceful degradation (§3.1) — there is no null/unknown/provenance flag.** `0` is indistinguishable from "did not score". Do not add `goalsKnown`, `hasEvents`, or any nullable variant; the icon set degrades per game, uniformly across all 22 shirts, and the UI cannot and must not ask whether the data is present.
- **`isCaptain` is `Boolean?` in Prisma** (`backend/prisma/schema.prisma:73`). The wire type is `boolean`, so the service coerces with `?? false`.
- **Tasks 2 and 3 must ship together.** The backend adds the fields and the frontend makes them required; neither half is shippable alone. Land them in one PR.
- **TDD mode: advisory_active.** Test first; red → green → refactor; report the commands and results.
- **Backend coverage gate:** 95% on all four metrics (`backend/vitest.config.ts:26-30`). `buildLineup` is reached through `buildMatchResponse`, so its new expressions need a test that observes them.

---

### Task 1: Index the three `Game` filter columns

**Files:**
- Modify: `backend/prisma/schema.prisma` (`model Game`, after line 62)
- Create: `backend/prisma/migrations/<timestamp>_add_game_filter_indexes/migration.sql`
- Create: `backend/src/__tests__/integration/gameIndexes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: three database indexes — `Game_season_idx`, `Game_date_idx`, `Game_targetTeamId_idx`. No TypeScript symbol.

**Steps:**

- [ ] **Step 1.1: Write the failing test first.**

  Create `backend/src/__tests__/integration/gameIndexes.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import { prisma } from '../../prisma';

  /**
   * The v1.1 filter columns. This list is CLOSED — adding an index is a
   * change to this array, not to schema.prisma alone.
   */
  const REQUIRED_INDEXES = [
    'Game_season_idx',
    'Game_date_idx',
    'Game_targetTeamId_idx',
  ] as const;

  describe('Game filter indexes', () => {
    it('creates an index for every filter column', async () => {
      const rows = await prisma.$queryRaw<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes WHERE tablename = 'Game'
      `;
      const names = rows.map((row) => row.indexname);
      for (const expected of REQUIRED_INDEXES) {
        expect(names).toContain(expected);
      }
    });

    it('keeps the pre-existing competition index', async () => {
      const rows = await prisma.$queryRaw<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes WHERE tablename = 'Game'
      `;
      expect(rows.map((row) => row.indexname)).toContain('Game_competitionId_idx');
    });
  });
  ```

- [ ] **Step 1.2: Run it and watch it fail.**

  ```bash
  cd backend && npx vitest run src/__tests__/integration/gameIndexes.test.ts
  ```

  Expected RED:

  ```
  AssertionError: expected [ 'Game_pkey', 'Game_gameId_key', 'Game_competitionId_idx' ] to contain 'Game_season_idx'
  ```

  The exact array printed depends on the local database; what matters is that
  the assertion names a missing index rather than a load error.

- [ ] **Step 1.3: Add the indexes to the schema.**

  Edit `backend/prisma/schema.prisma`, replacing lines 62-63:

  ```prisma
    @@index([competitionId])
    @@index([season])
    @@index([date])
    @@index([targetTeamId])
  }
  ```

- [ ] **Step 1.4: Create the migration.**

  ```bash
  cd backend && npx prisma migrate dev --create-only --name add_game_filter_indexes
  ```

  Expected: `prisma.config.ts` supplies `shadowDatabaseUrl` from
  `SHADOW_DATABASE_URL`, so this completes without extra flags.

  **If no shadow database is reachable**, create the folder by hand instead —
  the existing migrations in this repo are hand-sized and so is this one:

  ```bash
  cd backend && mkdir -p "prisma/migrations/$(date -u +%Y%m%d%H%M%S)_add_game_filter_indexes"
  ```

  and write that `migration.sql`:

  ```sql
  -- Indexes backing the v1.1 Season and Competition filter range queries.
  -- CLOSED list: do not extend without changing roadmap v1.0.2.
  -- CreateIndex
  CREATE INDEX "Game_season_idx" ON "Game"("season");

  -- CreateIndex
  CREATE INDEX "Game_date_idx" ON "Game"("date");

  -- CreateIndex
  CREATE INDEX "Game_targetTeamId_idx" ON "Game"("targetTeamId");
  ```

- [ ] **Step 1.5: Verify the generated SQL matches what the schema declares.**

  ```bash
  cd backend && cat prisma/migrations/*_add_game_filter_indexes/migration.sql
  ```

  Expected: exactly three `CREATE INDEX` statements on `"Game"`, one per column, and nothing else. If Prisma emitted anything else, the schema edit was wrong — fix the schema and regenerate.

- [ ] **Step 1.6: Apply it and watch the test go green.**

  ```bash
  cd backend && npx prisma migrate deploy && npx vitest run src/__tests__/integration/gameIndexes.test.ts
  ```

  Expected GREEN: `Test Files 1 passed (1)`, `Tests 2 passed (2)`.

  The integration suite's `globalSetup.ts` runs `npx prisma migrate deploy`
  against a fresh Testcontainers Postgres on every run, so the test passes in CI
  with no local state.

- [ ] **Step 1.7: Commit.**

  ```bash
  git add backend/prisma/schema.prisma backend/prisma/migrations backend/src/__tests__/integration/gameIndexes.test.ts
  git commit -m "feat(backend): index Game season, date and targetTeamId for v1.1 filters"
  ```

**Verify:** `psql "$DATABASE_URL" -c "SELECT indexname FROM pg_indexes WHERE tablename = 'Game';"` lists `Game_pkey`, `Game_gameId_key`, `Game_competitionId_idx`, `Game_season_idx`, `Game_date_idx`, `Game_targetTeamId_idx` — and nothing else.

---

### Task 2: Expose the event columns on the lineup response

**Files:**
- Modify: `backend/src/__tests__/integration/matchService.test.ts` (fixtures at `:113-121` and a new test)
- Modify: `backend/src/__tests__/integration/routes/matches.test.ts`
- Modify: `backend/src/services/matchService.ts:88-98` (`buildLineup`)

**Interfaces:**
- Consumes: `Appearance.goals` / `assists` / `redCards` (`Int @default(0)`, non-nullable) and `Appearance.isCaptain` (`Boolean?`), all already selected by the `appearances: { include: { player: true } }` relation on `getRandomMatch` (`matchService.ts:30`) and `getMatchById` (`matchService.ts:44`).
- Produces: each entry of `homeLineup` / `awayLineup` from `buildMatchResponse` gains:

  ```ts
  goals: number;
  assists: number;
  redCards: number;
  isCaptain: boolean;
  ```

  `buildMatchResponse` and `buildLineup` keep their names, signatures and export status. No query change, no `select` change — the columns are already on the row.

**Steps:**

- [ ] **Step 2.1: Write the failing integration test.**

  In `backend/src/__tests__/integration/matchService.test.ts`, append a new `describe` block at the end of the file:

  ```ts
  describe('buildMatchResponse event columns', () => {
    it('exposes goals, assists, redCards and isCaptain on every lineup entry', async () => {
      const game = await getMatchById(1);
      const response = buildMatchResponse(game!);

      for (const player of [...response.homeLineup, ...response.awayLineup]) {
        expect(typeof player.goals).toBe('number');
        expect(typeof player.assists).toBe('number');
        expect(typeof player.redCards).toBe('number');
        expect(typeof player.isCaptain).toBe('boolean');
      }
    });

    it('returns the stored values verbatim', async () => {
      await prisma.appearance.update({
        where: { gameId_playerId: { gameId: 1, playerId: 108 } },
        data: { goals: 2, assists: 1, redCards: 1, isCaptain: true },
      });

      const response = buildMatchResponse((await getMatchById(1))!);
      const player = response.homeLineup.find(
        (l) => l.token === generatePlayerToken(1, 108),
      );

      expect(player?.goals).toBe(2);
      expect(player?.assists).toBe(1);
      expect(player?.redCards).toBe(1);
      expect(player?.isCaptain).toBe(true);

      await seed();
    });

    it('reports 0 and false when the columns are untouched', async () => {
      const response = buildMatchResponse((await getMatchById(2))!);
      const player = response.awayLineup.find(
        (l) => l.token === generatePlayerToken(2, 101),
      );
      expect(player).toMatchObject({ goals: 0, assists: 0, redCards: 0, isCaptain: false });
    });

    it('coerces a null isCaptain to false', async () => {
      await prisma.appearance.update({
        where: { gameId_playerId: { gameId: 2, playerId: 101 } },
        data: { isCaptain: null },
      });

      const response = buildMatchResponse((await getMatchById(2))!);
      const player = response.awayLineup.find(
        (l) => l.token === generatePlayerToken(2, 101),
      );
      expect(player?.isCaptain).toBe(false);

      await seed();
    });

    it('emits an empty array for a game with no lineups', async () => {
      const response = buildMatchResponse((await getMatchById(3))!);
      expect(response.homeLineup).toEqual([]);
      expect(response.awayLineup).toEqual([]);
    });
  });
  ```

  `prisma`, `getMatchById`, `buildMatchResponse` and `seed` are all already
  imported in this file (`:1-11`); the new block adds no import.

- [ ] **Step 2.2: Write the failing route test.**

  In `backend/src/__tests__/integration/routes/matches.test.ts`, inside
  `describe('GET /api/matches/:id')`, add after the existing `'returns 200 for a valid id'` test:

  ```ts
  it('serves the event columns over HTTP', async () => {
    const res = await request(app).get('/api/matches/1');
    expect(res.status).toBe(200);
    const first = res.body.homeLineup[0];
    expect(first).toHaveProperty('goals');
    expect(first).toHaveProperty('assists');
    expect(first).toHaveProperty('redCards');
    expect(first).toHaveProperty('isCaptain');
    expect(typeof first.isCaptain).toBe('boolean');
  });
  ```

- [ ] **Step 2.3: Run both and watch them fail.**

  ```bash
  cd backend && npx vitest run src/__tests__/integration/matchService.test.ts src/__tests__/integration/routes/matches.test.ts
  ```

  Expected RED:
  - `matchService.test.ts` — `expect(typeof player.goals).toBe('number')` fails with `expected 'undefined' to be 'number'`.
  - `matches.test.ts` — `expected { … } to have property 'goals'`.

  These are genuine assertion failures, not type errors: the fields are simply absent from the object.

- [ ] **Step 2.4: Add the four fields in `buildLineup`.**

  Edit `backend/src/services/matchService.ts` lines 88-98, replacing the returned object:

  ```ts
  return side.map((a, i) => {
    const displayName = a.player?.displayName ?? a.player?.name ?? '';
    return {
      token: generatePlayerToken(gameId, a.playerId),
      nameLength: normalize(displayName).length,
      wordBoundaries: getWordBoundaries(displayName),
      shirtNumber: a.number ?? null,
      position: fitted[i].position,
      coords: fitted[i].coords,
      // Event columns (v1.0.2). These default to 0 and stay 0 on a game that
      // was seeded before v1.0.1 — 0 is indistinguishable from "did not
      // score", which is why degradation is per game and carries no flag.
      goals: a.goals,
      assists: a.assists,
      redCards: a.redCards,
      // Prisma types isCaptain as Boolean?; the wire type is boolean.
      isCaptain: a.isCaptain ?? false,
    };
  });
  ```

  Do not add a `select` to the `include` blocks at lines 26-33 and 41-46: the
  columns are already on the appearance row, and narrowing the select would be
  an unrelated change to `getRevealAppearances`'s sibling queries.

- [ ] **Step 2.5: Run both and watch them pass.**

  ```bash
  cd backend && npx vitest run src/__tests__/integration/matchService.test.ts src/__tests__/integration/routes/matches.test.ts
  ```

  Expected GREEN: both files pass, `Tests … passed`.

- [ ] **Step 2.6: Check the payload by hand.**

  ```bash
  cd backend && npm run dev &
  curl -s localhost:3000/api/matches/1 | npx --yes json -a homeLineup 2>/dev/null | head -20
  ```

  Expected: one object per shirt containing `token`, `nameLength`,
  `wordBoundaries`, `shirtNumber`, `position`, `coords`, `goals`, `assists`,
  `redCards`, `isCaptain`. Stop the server with `Ctrl-C`.

- [ ] **Step 2.7: Lint and type-check.**

  ```bash
  ESLINT_USE_FLAT_CONFIG=false npx eslint backend/src/
  cd backend && npm run build
  ```

- [ ] **Step 2.8: Commit.**

  ```bash
  git add backend/src/services/matchService.ts backend/src/__tests__/integration/matchService.test.ts backend/src/__tests__/integration/routes/matches.test.ts
  git commit -m "feat(backend): expose appearance event columns on the lineup response"
  ```

**Verify:** `grep -n "goals\|assists\|redCards\|isCaptain" backend/src/services/matchService.ts` shows the four fields inside `buildLineup`'s returned object.

---

### Task 3: Mirror the contract in the frontend types

Task 2 and Task 3 are one deployable unit. The backend now returns four fields; the frontend type must accept them in the same PR or `tsc` fails on every `LineupPlayer` literal in the repo.

**Files:**
- Modify: `frontend/types/index.ts:20-35` (`LineupPlayer`)
- Modify: `frontend/lib/mockData.ts:61-68` (`buildLineup`)
- Modify: `frontend/src/lib/gameState.test.ts:14-23` (`player` factory)
- Modify: `frontend/src/lib/gameState.hook.test.ts:21-30` (`player` factory)
- Modify: `frontend/src/components/GameComplete.test.tsx:28-40` (`makeShirt` factory)

**Interfaces:**
- Consumes: the JSON emitted by Task 2.
- Produces (frozen — do not rename, do not make optional):

  ```ts
  export interface LineupPlayer {
    token: string;
    nameLength: number;
    wordBoundaries: number[];
    shirtNumber: number | null;
    position: string | null;
    coords: PositionCoords;
    goals: number;
    assists: number;
    redCards: number;
    isCaptain: boolean;
  }
  ```

**Steps:**

- [ ] **Step 3.1: Watch it fail first.**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -20
  ```

  Expected RED. Right now it is green, because the type has not changed yet —
  which means this task's red is produced by Step 3.2, below.

- [ ] **Step 3.2: Add the four fields to `LineupPlayer`.**

  Edit `frontend/types/index.ts` lines 20-35 to:

  ```ts
  /** One starting-XI entry, as returned by the lineup endpoints. */
  export interface LineupPlayer {
    /**
     * Opaque per-game token identifying the player behind this shirt.
     * Replaces the stable DB `playerId` in lineup payloads so a correct guess
     * in one game cannot be reused to cheat in another.
     */
    token: string;
    /** Normalized length of the player's name (no spaces/diacritics). */
    nameLength: number;
    /** Normalized indices where a word separator (space/hyphen/apostrophe) occurs. */
    wordBoundaries: number[];
    shirtNumber: number | null;
    /** Position code, e.g. 'GK' | 'CB' | 'LB' | 'CM' | 'ST'. */
    position: string | null;
    coords: PositionCoords;
    /** Goals scored in this match. 0 when the game predates event data. */
    goals: number;
    /** Assists in this match. 0 when the game predates event data. */
    assists: number;
    /** Send-offs in this match (direct red or second yellow). 0 when unknown. */
    redCards: number;
    /** Captain for this match. False when no captain row exists for the game. */
    isCaptain: boolean;
  }
  ```

  The four fields are **required**, not optional. There is no "data may be
  absent" state on the wire: the backend always sends a number.

- [ ] **Step 3.3: Run `tsc` and read the failures.**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30
  ```

  Expected RED: `Property 'goals' is missing in type … but required in type 'LineupPlayer'` in `lib/mockData.ts`, `src/lib/gameState.test.ts`,
  `src/lib/gameState.hook.test.ts` and `src/components/GameComplete.test.tsx`.
  That list **is** the change surface — there must be no fifth file.

- [ ] **Step 3.4: Fix the mock dataset.**

  Edit `frontend/lib/mockData.ts`, replacing `buildLineup` (lines 61-68) and adding the helper above it:

  ```ts
  /**
   * Deterministic event columns so the v1.0.3 shirt badges are visible when
   * running against the mock dataset. In production these come from
   * GET /api/matches/* (v1.0.2) and are seeded from game_events.csv (v1.0.1).
   */
  function mockEvents(playerId: number): Pick<MockLineupPlayer, 'goals' | 'assists' | 'redCards' | 'isCaptain'> {
    return {
      goals: playerId % 4 === 0 ? 1 : 0,
      assists: playerId % 7 === 0 ? 1 : 0,
      redCards: playerId % 11 === 0 ? 1 : 0,
      isCaptain: playerId % 9 === 0,
    };
  }

  function buildLineup(gameId: number, players: MockRawPlayer[]): MockLineupPlayer[] {
    return players.map((p) => ({
      ...p,
      nameLength: normalize(p.displayName).length,
      wordBoundaries: getWordBoundaries(p.displayName),
      token: mockToken(gameId, p.playerId),
      ...mockEvents(p.playerId),
    }));
  }
  ```

  `MockRawPlayer` is unchanged — the four fields are derived, not authored, so
  none of the ~44 mock player entries needs editing.

- [ ] **Step 3.5: Fix the `player` factory in `gameState.test.ts`.**

  Edit `frontend/src/lib/gameState.test.ts` lines 14-23 to:

  ```ts
  function player(token: string, nameLength = 5): LineupPlayer {
    return {
      token,
      nameLength,
      wordBoundaries: [],
      shirtNumber: 10,
      position: 'ST',
      coords: { x: 50, y: 50 },
      goals: 0,
      assists: 0,
      redCards: 0,
      isCaptain: false,
    };
  }
  ```

- [ ] **Step 3.6: Fix the `player` factory in `gameState.hook.test.ts`.**

  Edit `frontend/src/lib/gameState.hook.test.ts` lines 21-30 to the identical
  body as Step 3.5 (same ten fields, same signature).

- [ ] **Step 3.7: Fix the `makeShirt` factory in `GameComplete.test.tsx`.**

  Edit `frontend/src/components/GameComplete.test.tsx` lines 28-40 to:

  ```tsx
  function makeShirt(overrides: Partial<ShirtGameData> = {}): ShirtGameData {
    return {
      token: 'shirt-1',
      nameLength: 5,
      wordBoundaries: [],
      shirtNumber: 10,
      position: 'ST',
      coords: { x: 50, y: 50 },
      state: 'default',
      attempts: 0,
      guessHistory: [],
      correctLetters: [],
      goals: 0,
      assists: 0,
      redCards: 0,
      isCaptain: false,
      ...overrides,
    };
  }
  ```

  `overrides` stays last so a test can still override any field.

- [ ] **Step 3.8: Run `tsc` and watch it pass.**

  ```bash
  cd frontend && npx tsc --noEmit
  ```

  Expected: no output, exit 0.

- [ ] **Step 3.9: Run the frontend suite and watch it pass.**

  ```bash
  cd frontend && npm run test
  ```

  Expected: all 9 existing test files pass. No test was added in this patch —
  the assertion lives on the backend, and `LineupPlayer` is a pure type with no
  runtime behaviour to test. `frontend/vitest.config.ts` defines no thresholds,
  so nothing here is gated.

- [ ] **Step 3.10: Lint.**

  ```bash
  cd frontend && npm run lint
  ```

- [ ] **Step 3.11: Commit.**

  ```bash
  git add frontend/types/index.ts frontend/lib/mockData.ts frontend/src/lib/gameState.test.ts frontend/src/lib/gameState.hook.test.ts frontend/src/components/GameComplete.test.tsx
  git commit -m "feat(frontend): type the lineup event columns from the v1.0.2 API"
  ```

**Verify:** `cd frontend && npx tsc --noEmit && npm run test && npm run lint` — all three exit 0.

---

### Task 4: Validation, CHANGELOG, release

**Files:**
- Modify: `CHANGELOG.md` (prepend one section)

**Interfaces:**
- Consumes: everything above.
- Produces: the `## v1.0.2` CHANGELOG section `scripts/src/release.ts:8` requires.

**Steps:**

- [ ] **Step 4.1: Run the full backend gate.**

  ```bash
  cd backend && npm run test:coverage
  ```

  Expected: `Test Files 16 passed (16)` (15 after v1.0.1, plus
  `gameIndexes.test.ts`), all tests passing, coverage ≥95% on all four metrics.

- [ ] **Step 4.2: Confirm the frontend gate.**

  ```bash
  cd frontend && npm run test:coverage && npm run lint && npx tsc --noEmit
  ```

- [ ] **Step 4.3: Confirm the index list stayed closed.**

  ```bash
  git diff HEAD~2 -- backend/prisma/schema.prisma
  ```

  Expected: exactly three added `@@index` lines under `model Game`, and no
  `Appearance` change at all.

- [ ] **Step 4.4: Confirm the index is actually used.**

  ```bash
  psql "$DATABASE_URL" -c "EXPLAIN SELECT * FROM \"Game\" WHERE \"season\" BETWEEN 2020 AND 2024;"
  ```

  Expected: the plan shows `Index Scan using Game_season_idx` (or
  `Bitmap Index Scan`) rather than `Seq Scan`. If it still says `Seq Scan`, the
  local table is too small for the planner to prefer the index — that is
  expected below ~a few thousand rows and is not a defect.

- [ ] **Step 4.5: Write the CHANGELOG section.**

  Prepend to `CHANGELOG.md`, directly under the `---` on line 8 and above
  `## v1.0.1`:

  ```markdown
  ## v1.0.2 — Event columns on the API & Game filter indexes

  _2026-09-29_

  ### Added

  - **`goals`, `assists`, `redCards` and `isCaptain` on every lineup entry**
    in `GET /api/matches/random` and `GET /api/matches/:id`, mirrored as
    required fields on `LineupPlayer` in `frontend/types/index.ts`.
  - **Indexes on `Game.season`, `Game.date` and `Game.targetTeamId`**, backing
    the v1.1 Season and Team filters. Closed list — no other index added.

  ### Notes

  - **No new queries.** The columns were already on the appearance rows the
    existing `include` selects.
  - **There is no "data missing" flag, and there will not be one.** The
    columns default to `0`, and `0` is indistinguishable from "did not score",
    so a game seeded before v1.0.1 reports zeros for all 22 shirts and the UI
    cannot tell. Degradation is per game, uniform across the board.
  - `isCaptain` is nullable in the database and is sent as `false` when null.
  - Tasks 2 and 3 ship together: the backend field and the required frontend
    field are one contract.
  ```

- [ ] **Step 4.6: Verify the changelog is parseable.**

  ```bash
  npm run release -- --notes v1.0.2 | head -5
  ```

  Expected: `_2026-09-29_`. On failure the error names the pattern at `scripts/src/release.ts:9`.

- [ ] **Step 4.7: Commit.**

  ```bash
  git add CHANGELOG.md
  git commit -m "release: v1.0.2 — event columns on the API and Game filter indexes"
  ```

**Verify:** `git log --oneline -4` shows four conventional-commit lines for this patch.

---

## Rollback

Revert the patch to **v1.0.1**. No data repair: the migration only adds indexes, and dropping or keeping them is harmless. Reverting the code removes the four fields from the API and the four required fields from `LineupPlayer` in the same revert, so the contract stays consistent. If the migration file is left in place, the extra indexes remain and cost only write throughput — remove them with a follow-up `prisma migrate resolve --rolled-back` plus a hand-written `DROP INDEX` only if write latency is actually affected.

## Acceptance criteria

1. `GET /api/matches/random` and `GET /api/matches/:id` return `goals`, `assists`, `redCards`, `isCaptain` on every entry of `homeLineup` and `awayLineup`.
2. `isCaptain` is `boolean` on the wire, `false` when the column is null.
3. `frontend/types/index.ts` `LineupPlayer` has the same four fields, all required.
4. `cd frontend && npx tsc --noEmit` exits 0; no `LineupPlayer` literal anywhere omits the fields.
5. Exactly three new indexes exist on `Game`: `Game_season_idx`, `Game_date_idx`, `Game_targetTeamId_idx`. `Game_competitionId_idx` still exists. No `Appearance` index was added.
6. `backend/src/__tests__/integration/gameIndexes.test.ts` passes against a fresh Testcontainers database, which proves the migration is in the repo rather than only on the author's machine.
7. No new nullable or optional variant of the four fields exists anywhere.
8. `cd backend && npm run test:coverage` passes the 95% gate on all four metrics.
9. `cd frontend && npm run test:coverage && npm run lint && npx tsc --noEmit` all pass.
10. `npm run release -- --notes v1.0.2` prints the section body.

## Validation plan

| What | Command | Expected |
|---|---|---|
| Index test | `cd backend && npx vitest run src/__tests__/integration/gameIndexes.test.ts` | `Tests 2 passed (2)` |
| Service test | `cd backend && npx vitest run src/__tests__/integration/matchService.test.ts` | all pass, incl. 5 new cases |
| Route test | `cd backend && npx vitest run src/__tests__/integration/routes/matches.test.ts` | all pass, incl. the new HTTP case |
| Full backend gate | `cd backend && npm run test:coverage` | 14 files pass, ≥95% on four metrics |
| Type-check | `cd frontend && npx tsc --noEmit` | exit 0 |
| Frontend tests | `cd frontend && npm run test` | 9 files pass |
| Frontend lint | `cd frontend && npm run lint` | exit 0 |
| Live payload | `curl -s localhost:3000/api/matches/1` | four new keys per shirt |
| Index list | `psql "$DATABASE_URL" -c "SELECT indexname FROM pg_indexes WHERE tablename='Game';"` | exactly 6 names |
| No appearance index | `git diff HEAD~2 -- backend/prisma/schema.prisma` | three `@@index` lines under `model Game` only |
| Release note | `npm run release -- --notes v1.0.2` | section body |

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Backend and frontend land apart | `tsc` fails repo-wide | Tasks 2+3 are one commit pair and one PR; the task header says so |
| Scope creep into indexes | Extra write cost, R4 breach | `gameIndexes.test.ts` asserts three required indexes and re-asserts the pre-existing one; the CHANGELOG records the list as closed |
| A nullable/optional field creeps in | Consumers reintroduce the "is data missing?" question the schema cannot answer | Global Constraints forbid it; the three tests assert `typeof === 'number'` and `typeof === 'boolean'`, so `null` fails |
| Migration created only locally | CI's `migrate deploy` finds a schema-drift error | Task 1 Step 1.6 proves it through `globalSetup`'s fresh container; Step 4.5 verifies the changelog, and the migration folder is committed in Step 1.7 |
| Small local table hides an unindexed column | A filter stays slow in production | Task 4 Step 4.4 acknowledges `Seq Scan` on a small table as expected, and asserts the index exists rather than the plan shape |

## Handoff to v1.0.3

`LineupPlayer.goals` and `LineupPlayer.redCards` are live on the wire and typed. v1.0.3 consumes exactly those two, plus nothing else — `assists` and `isCaptain` are exposed for v1.1/v1.2 and are not read by v1.0.3.
