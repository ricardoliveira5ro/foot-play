# Token-Based Reveal Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A revealed player is applied to the shirt that actually holds him. Today the reveal join keys on `shirtNumber`, which is nullable and therefore not a key at all — two players with no number in the same game collide on `===`, both names land on the first shirt, and the second shirt is left blank. This patch moves the join onto the opaque per-game `token`, which is unique by construction, and is the hard prerequisite for Hard mode (§11 Rule 4).

**Architecture:** Three surfaces, in dependency order. The backend attaches `token` to every row returned by `getRevealAppearances` and to every entry of the `/api/guess/reveal` payload. The frontend type gains the field and the `USE_MOCK` branch emits it. The join is extracted out of the page component into a pure module, `frontend/src/lib/reveal.ts`, so the defect becomes a real unit under test instead of a closure nobody can reach — `frontend/src/lib/reveal.test.ts` today declares the logic *inside the test file* and asserts that the old implementation is wrong, which is a test of a copy that protects nothing in production.

**Tech Stack:** TypeScript, Prisma 7, Express 4, Vitest + Testcontainers (backend; 95% gate on all four metrics at `backend/vitest.config.ts:26-30`), Next 16 / React 19, Vitest (frontend).

---

## Global Constraints

- **This patch changes no player-facing behaviour except correctness.** No mode, no mask, no clue, no score. It ships alone, deliberately (§5.6): a reveal regression must be attributable to v1.2.1 rather than to whichever mode happened to ship alongside it.
- **The join key becomes `token`, everywhere, in one step.** No fallback to `shirtNumber`, no "prefer token, fall back to number". A dual-key join keeps the defect alive inside the branch that is hardest to test.
- **`RevealPlayer` gains `token` as a required field.** `playerId` and `shirtNumber` are retained even though the frontend no longer reads either. The wire format is the contract; dropping a field is a breaking change with no compensating benefit.
- **`shirtNumber` stays `number | null` everywhere, and the literal `'?'` is never written into it.** The mask is a render concern owned by v1.2.3. This patch must not introduce a string into that field, because `===` on it is the code being deleted and a `'?'` write would silently break any surviving comparison.
- **The backend spreads the Prisma row and adds `token`.** `backend/src/__tests__/integration/matchService.test.ts` asserts on `appearances[0].number` and `appearances[last].player.displayName`; spreading keeps both assertions valid, so that file is not rewritten and keeps testing the query rather than the projection.
- **No Prisma migration and no schema change.** `token` is derived at request time from `(gameId, playerId)`, exactly as `buildLineup` already does at `backend/src/services/matchService.ts:91`.
- **`generatePlayerToken` stays private to `tokenService`.** No new export, no signature change, no secret-handling change. `backend/src/services/tokenService.ts:14` reads `PLAYER_TOKEN_SECRET` at module load and that is untouched.
- **No fixture is added to the shared seed.** The R1(a) proof needs a team with *two* null-numbered players and the shared seed has at most one per team, so adding a row would change the lengths asserted at `matchService.test.ts:61` and `guess.test.ts:57`. The new test creates its own game and calls `await seed()` afterwards — the pattern already used by `'sorts by number then playerId, nulls last, when numbers tie'` at `matchService.test.ts:96-134`.
- **TDD exception, stated once, for `frontend/lib/api.ts`.** Nothing under `frontend/lib/` is executed by any test, because the vitest `include` does not name `frontend/lib/**` — on this tree it is `src/**` only, and after v1.1.1 it enumerates `src/**`, `components/**`, `tests/**` and `app/**`, none of which is `lib/**`. The `USE_MOCK` branch in `frontend/lib/api.ts` is therefore covered by `npx tsc --noEmit` and by Task 1's backend integration test asserting the identical field end-to-end. Widening the include to `lib/**` is nobody's job in v1.2 and is **not** done here; v1.1.1 owns the include list (R7). Every other code change in this patch is test-first.
- **Regression commands, run at every task boundary:**

  ```bash
  cd backend  && npm run test              # count measured, never asserted
  cd frontend && npm run test              # count measured, never asserted
  cd frontend && npx tsc --noEmit
  ```

  Do not carry a fixed number. The figures recorded in `docs/v1/v1.2/overview.md:193-194` (backend 13/175, frontend 9/173) were measured on `cda2db0` and are a **snapshot, not a baseline**: v1.0.1 (+2 backend files), v1.0.2 (+1) and v1.1.1 (+4 backend, +2 frontend) all land before this patch, so the real numbers at v1.2.1 are already higher. Measure at every boundary, record the actual number, and use the delta from the measurement — not the absolute, and not the table.

---

## Files touched

| File | Change |
|---|---|
| `backend/src/services/matchService.ts` | `getRevealAppearances` attaches `token` to each row |
| `backend/src/routes/guess.ts` | `/reveal` includes `token` in the response |
| `backend/src/__tests__/integration/routes/guess.test.ts` | two `toEqual` assertions widened to the additive field |
| `backend/src/__tests__/integration/matchService.test.ts` | two new tests: the emitted token, and two null-numbered players |
| `frontend/types/index.ts` | `RevealPlayer` gains `token: string` |
| `frontend/src/lib/reveal.ts` | **new** — the pure join |
| `frontend/src/lib/reveal.test.ts` | rewritten against the real module (6 tests → 9) |
| `frontend/app/missing-eleven/page.tsx` | `revealTeam` delegates to `revealMatches` |
| `frontend/lib/api.ts` | `USE_MOCK` reveal branch emits `token` |

---

## Tasks

### Task 1: The `/api/guess/reveal` payload carries `token`

**Files:**
- Modify: `backend/src/services/matchService.ts` (`getRevealAppearances`, `:114-120`)
- Modify: `backend/src/routes/guess.ts` (`:65`)
- Modify: `backend/src/__tests__/integration/routes/guess.test.ts` (`:58`, `:71`)
- Modify: `backend/src/__tests__/integration/matchService.test.ts` (inside the `getRevealAppearances` describe, after `:152`)

**Interfaces:**
- Consumes: `generatePlayerToken(gameId: number, playerId: number): string` from `backend/src/services/tokenService.ts:16`. Unchanged.
- Produces: `getRevealAppearances(gameId, clubId)` returns each Prisma appearance row **spread** plus `token: string`. `POST /api/guess/reveal` returns `{ players: Array<{ playerId: number; name: string; shirtNumber: number | null; token: string }> }`.

- [ ] **Step 1.0: Renumbering preflight — `gameId` is a shared resource, not a local constant.**

  Step 1.1 hard-codes `gameId: 5` for the R1(a) test. `Appearance` is `@@unique([gameId, playerId])` **and** `gameId` is the primary key, so a collision is a constraint violation, not a test failure with a good message. **`gameId: 5` is already claimed by v1.1.1**, whose Task 2 seeds a complete game at `gameId: 5` (`docs/v1/v1.1/plan-v1.1.1-filter-foundation.md:207`); v1.1.1 renumbered *itself* upward only because nothing claimed 5 at the time it was written (`docs/v1/v1.1/plan-v1.1.1-filter-foundation.md:178`). By the time this patch runs, 5 is taken.

  ```bash
  grep -rn "gameId: 5\|createCompleteGame(" backend/src/__tests__/
  ```

  If **any** existing test or seed helper already claims `gameId: 5` or higher, renumber **this** patch's fixture upward — the `prisma.game.create` id, all three `prisma.appearance.createMany` rows, `getRevealAppearances(5, 1)`, and both `generatePlayerToken(5, …)` arguments — to a free id. Never renumber an existing test or seed row to make room; games 1–4 and v1.1.1's complete game are frozen.

  **Run this preflight against the tree as it exists when v1.2.1 executes, not as it exists when this plan was written.** The claim map is a property of the merged tree, and v1.0.x, v1.0.2 and v1.1.x all land before this patch. Re-running the grep immediately before writing the test is the whole check; reading this plan is not.

- [ ] **Step 1.1: Write the failing tests first.**

  In `backend/src/__tests__/integration/routes/guess.test.ts`, replace the exact-equality assertion at line 58:

  ```ts
  expect(res.body.players[0]).toEqual({ playerId: 108, name: 'Neuer', shirtNumber: 1 });
  ```

  with:

  ```ts
  expect(res.body.players[0]).toEqual({
    playerId: 108,
    name: 'Neuer',
    shirtNumber: 1,
    token: generatePlayerToken(1, 108),
  });
  ```

  and the one at line 71:

  ```ts
  expect(testPlayer).toEqual({ playerId: 114, name: 'Test Player', shirtNumber: null });
  ```

  with:

  ```ts
  expect(testPlayer).toEqual({
    playerId: 114,
    name: 'Test Player',
    shirtNumber: null,
    token: generatePlayerToken(2, 114),
  });
  ```

  Then append two tests inside the `getRevealAppearances` describe block in `backend/src/__tests__/integration/matchService.test.ts`:

  ```ts
    it('attaches the opaque per-game token to every appearance', async () => {
      const appearances = await getRevealAppearances(1, 1);
      expect(appearances).toHaveLength(8);
      for (const ap of appearances) {
        expect(ap.token).toBe(generatePlayerToken(1, ap.playerId));
      }
      // The token is game-scoped: the same player in another game gets another
      // token. This is the property that makes the join safe, so it is asserted
      // directly rather than assumed.
      expect(appearances[0].token).not.toBe(generatePlayerToken(2, appearances[0].playerId));
    });

    it('gives two null-numbered players in one team distinct tokens (R1(a))', async () => {
      // R1(a): `Appearance.number` is `Int?` (backend/prisma/schema.prisma:70)
      // and `getRevealAppearances` orders with `nulls: 'last'`, so a team with
      // two numberless players is an expected state, not an edge case. Both
      // rows carry `number === null`, so a `shirtNumber === shirtNumber` join
      // sends both names to the same shirt. The token is what makes them
      // separable, and this is where that is proven at the data layer.
      await prisma.game.create({
        data: {
          gameId: 5, competitionId: 'TEST-COMP', season: 2025,
          date: new Date('2025-02-01T00:00:00Z'),
          homeClubId: 1, awayClubId: 2, targetTeamId: 1, opponentTeamId: 2,
          homeClubGoals: 0, awayClubGoals: 0, homeClubFormation: '4-3-3', awayClubFormation: '4-4-2',
        },
      });
      await prisma.appearance.createMany({
        data: [
          { gameId: 5, clubId: 1, playerId: 111, number: null, type: 'starting_lineup', position: null },
          { gameId: 5, clubId: 1, playerId: 114, number: null, type: 'starting_lineup', position: 'centre-forward' },
          { gameId: 5, clubId: 1, playerId: 108, number: 1, type: 'starting_lineup', position: 'goalkeeper' },
        ],
      });

      const appearances = await getRevealAppearances(5, 1);
      const nullsLast = appearances.filter((ap) => ap.number === null);
      expect(nullsLast).toHaveLength(2);
      // The two rows are indistinguishable on shirt number...
      expect(nullsLast.map((ap) => ap.number)).toEqual([null, null]);
      // ...and separated only by the token.
      const tokens = nullsLast.map((ap) => ap.token);
      expect(new Set(tokens).size).toBe(2);
      expect(tokens.sort()).toEqual(
        [generatePlayerToken(5, 111), generatePlayerToken(5, 114)].sort(),
      );

      await seed();
    });
  ```

  `await seed()` at the end restores the shared fixture, which is what every other test in this file relies on. `prisma` and `seed` are already imported at `matchService.test.ts:2` and `:11`.

  The second test is the R1(a) proof. Run against a payload built from `number`, it cannot even be written — there is no value to compare. Its two assertions (`[null, null]` and two distinct tokens) state the whole defect in one place.

- [ ] **Step 1.2: Verify red.**

  ```bash
  cd backend && npx vitest run src/__tests__/integration/routes/guess.test.ts src/__tests__/integration/matchService.test.ts
  ```

  Expected: **FAIL**. `guess.test.ts` fails on both `toEqual` calls with a received object missing `token` (`- Expected  - 1 / + Received  + 0`, `token: undefined`). `matchService.test.ts` fails on both new tests because `ap.token` is `undefined` — the first on `expect(ap.token).toBe(...)`, the second on `new Set(tokens).size` being `1` rather than `2`. Every failure is the field being absent, not a typo.

- [ ] **Step 1.3: Implement in the service.**

  Edit `backend/src/services/matchService.ts`, replacing lines 114-120:

  ```ts
  export async function getRevealAppearances(gameId: number, clubId: number) {
    const appearances = await prisma.appearance.findMany({
      where: { gameId, clubId },
      include: { player: { select: { displayName: true, name: true } } },
      orderBy: [{ number: { sort: 'asc', nulls: 'last' } }, { playerId: 'asc' }],
    });

    // The spread keeps every query field the existing integration test asserts
    // on (`number`, `player.displayName`) while adding the opaque join key the
    // frontend now pairs names by. `number` is `Int?` and is NOT a key: two
    // numberless players in one team collide on `===` (roadmap R1(a)).
    return appearances.map((ap) => ({
      ...ap,
      token: generatePlayerToken(gameId, ap.playerId),
    }));
  }
  ```

  `generatePlayerToken` is already imported at line 6. No import change is needed.

- [ ] **Step 1.4: Implement in the route.**

  Edit `backend/src/routes/guess.ts`, replacing line 65:

  ```ts
    res.json({ players: appearances.map(ap => ({ playerId: ap.playerId, name: ap.player.displayName ?? ap.player.name ?? '', shirtNumber: ap.number, token: ap.token })) });
  ```

  Nothing else in the file changes. `/reveal-one` already keys on `token` and is unaffected.

- [ ] **Step 1.5: Verify green, then run the full backend regression and the coverage gate.**

  ```bash
  cd backend && npm run test
  ```

  Expected: every file green, and the test count **two higher than the measurement taken at the start of this task** (this task adds exactly two tests). Record the real number in the changelog. Do not assert `177` — the absolute was measured on `cda2db0` and v1.0.1, v1.0.2 and v1.1.1 have all landed since. Step 1.0 above is a **renumbering** preflight that greps for an existing `gameId: 5` claim; it runs no suite, so it measures nothing — if you need a number, take it here, before the first test is written.

  ```bash
  cd backend && npm run test:coverage
  ```

  Expected: no threshold failure on lines / statements / functions / branches. The new `.map` in `getRevealAppearances` is fully covered by the two route tests and the two service tests; the pre-existing `displayName ?? name ?? ''` branches are unchanged.

- [ ] **Step 1.6: Commit.**

  ```bash
  git add backend/src/services/matchService.ts backend/src/routes/guess.ts backend/src/__tests__/integration/routes/guess.test.ts backend/src/__tests__/integration/matchService.test.ts
  git commit -m "feat(api): return the opaque player token in the reveal payload"
  ```

---

### Task 2: `RevealPlayer` gains `token`, and the mock emits it

**Files:**
- Modify: `frontend/types/index.ts` (`:101-106`)
- Modify: `frontend/lib/api.ts` (`:117-123`)

**Interfaces:**
- Consumes: `LineupPlayer.token` already present at `frontend/types/index.ts:26` and already placed on every `ShirtGameData` by `createShirts` at `frontend/src/lib/gameState.ts:88-96`.
- Produces: `export interface RevealPlayer { playerId: number; name: string; shirtNumber: number | null; token: string }`.

- [ ] **Step 2.1: Add the field to the type.**

  Edit `frontend/types/index.ts`, replacing lines 101-106:

  ```ts
  /** One entry of POST /api/guess/reveal. */
  export interface RevealPlayer {
    playerId: number;
    name: string;
    shirtNumber: number | null;
    /**
     * Opaque per-game token for the shirt this player occupies. This — not
     * `shirtNumber` — is the join key back to a shirt: `Appearance.number` is
     * `Int?` and two players without a number in one game collide on `===`.
     */
    token: string;
  }
  ```

  A **required** field, on purpose: adding it is a compile-time break at every construction site, which is how Task 3's fixtures and `frontend/lib/api.ts`'s mock branch are forced to supply it. Do not make it optional.

- [ ] **Step 2.2: Emit it from the mock branch.**

  Edit `frontend/lib/api.ts`, replacing lines 117-123:

  ```ts
    const lineup = teamSide === 'home' ? entry.homeLineup : entry.awayLineup;
    const players = lineup.map((p) => ({
      playerId: p.playerId,
      name: p.displayName,
      shirtNumber: p.shirtNumber,
      token: p.token,
    }));
    return { players };
  ```

  `MockLineupPlayer` extends `LineupPlayer`, so `p.token` already exists and is deterministic per `(gameId, playerId)` via `mockToken` at `frontend/lib/mockData.ts:51-59`. **No change to `frontend/lib/mockData.ts` is required by this patch.**

- [ ] **Step 2.3: Verify the red — and understand which tool reports it.**

  ```bash
  cd frontend && npx tsc --noEmit
  ```

  Expected: errors **only** in `frontend/src/lib/reveal.test.ts` — one per `RevealPlayer` literal, each reading `Property 'token' is missing in type ... but required in type 'RevealPlayer'`. That is the intended red; Task 3 rewrites that file against the new type. Any other error means Step 2.1 or 2.2 is wrong — fix it before continuing.

  ```bash
  cd frontend && npm run test
  ```

  Expected: **the frontend file and test counts are unchanged from whatever Step 1.0 measured — and that is correct.** Vitest transpiles TypeScript with esbuild and performs no type checking, so a required-field change is invisible to the test run. The type check above is this task's red, not the suite. This is why every task in this plan lists `npx tsc --noEmit` separately. The pass signal is *unchanged*, not a number: assert nothing absolute here.

- [ ] **Step 2.4: Commit.**

  ```bash
  git add frontend/types/index.ts frontend/lib/api.ts
  git commit -m "feat(frontend): add token to RevealPlayer and the mock reveal payload"
  ```

---

### Task 3: Extract the join into `frontend/src/lib/reveal.ts` and prove R1(a)

**Files:**
- Create: `frontend/src/lib/reveal.ts`
- Rewrite: `frontend/src/lib/reveal.test.ts`

**Interfaces:**
- Consumes: `RevealPlayer` from `../../types`; `ShirtGameData` from `./gameState`.
- Produces: `export interface RevealMatch { token: string; name: string }` and `export function revealMatches(players: RevealPlayer[], shirts: ShirtGameData[]): RevealMatch[]` — pure, order-independent, returns the `(token, name)` pairs to apply. It performs **no** mutation and takes **no** callback; the page dispatches the result.

- [ ] **Step 3.1: Write the failing tests first.**

  Delete `frontend/src/lib/reveal.test.ts` and replace it in full. The reason this file is being rewritten is that the current one re-declares the production logic inside the test body and asserts properties *of that copy* — including two tests whose names begin `WRONG:`, which describe the old bug rather than the shipped behaviour. It passes today while production is broken.

  ```ts
  import { describe, it, expect } from 'vitest';
  import { revealMatches } from './reveal';
  import type { ShirtGameData } from './gameState';
  import type { RevealPlayer } from '../../types';

  function makeShirt(overrides: Partial<ShirtGameData> & { token: string }): ShirtGameData {
    return {
      nameLength: 5,
      wordBoundaries: [],
      shirtNumber: 10,
      position: 'CM',
      coords: { x: 50, y: 50 },
      state: 'failed',
      attempts: 6,
      guessHistory: [],
      correctLetters: [],
      ...overrides,
    };
  }

  function makeReveal(overrides: Partial<RevealPlayer> & { token: string; name: string }): RevealPlayer {
    return { playerId: 0, shirtNumber: 10, ...overrides };
  }

  describe('revealMatches', () => {
    it('matches a revealed player to the shirt carrying the same token', () => {
      const shirts = [makeShirt({ token: 't-6', shirtNumber: 6 })];
      const result = revealMatches([makeReveal({ token: 't-6', name: 'Target Six' })], shirts);
      expect(result).toEqual([{ token: 't-6', name: 'Target Six' }]);
    });

    it('assigns distinct names to two shirts that both have a null number (R1(a))', () => {
      // R1(a), the live defect. `Appearance.number` is `Int?`, so two
      // null-numbered players in one team are the normal case, not an edge
      // case. Matching on `shirtNumber` sends both names to the FIRST shirt
      // and leaves the second blank. `null === null` is true.
      const shirts = [
        makeShirt({ token: 't-a', shirtNumber: null }),
        makeShirt({ token: 't-b', shirtNumber: null }),
      ];
      const result = revealMatches(
        [
          makeReveal({ token: 't-a', name: 'First Player', shirtNumber: null }),
          makeReveal({ token: 't-b', name: 'Second Player', shirtNumber: null }),
        ],
        shirts,
      );
      expect(result).toEqual([
        { token: 't-a', name: 'First Player' },
        { token: 't-b', name: 'Second Player' },
      ]);
    });

    it('separates two players who share a shirt number within one team', () => {
      const shirts = [
        makeShirt({ token: 't-x', shirtNumber: 6 }),
        makeShirt({ token: 't-y', shirtNumber: 6 }),
      ];
      const result = revealMatches(
        [
          makeReveal({ token: 't-x', name: 'Numbersman', shirtNumber: 6 }),
          makeReveal({ token: 't-y', name: 'Trickster', shirtNumber: 6 }),
        ],
        shirts,
      );
      expect(result).toEqual([
        { token: 't-x', name: 'Numbersman' },
        { token: 't-y', name: 'Trickster' },
      ]);
    });

    it('produces the same result regardless of the order of the reveal array', () => {
      const shirts = [makeShirt({ token: 't-1' }), makeShirt({ token: 't-2' })];
      const players = [
        makeReveal({ token: 't-1', name: 'One' }),
        makeReveal({ token: 't-2', name: 'Two' }),
      ];
      const forward = revealMatches(players, shirts);
      const reversed = revealMatches([...players].reverse(), shirts);
      expect(reversed).toEqual(forward);
    });

    it('never overwrites a shirt that is already correct', () => {
      const shirts = [
        makeShirt({ token: 't-1', state: 'correct', name: 'Already Guessed' }),
        makeShirt({ token: 't-2', state: 'failed' }),
      ];
      const result = revealMatches(
        [
          makeReveal({ token: 't-1', name: 'Server Name' }),
          makeReveal({ token: 't-2', name: 'New Name' }),
        ],
        shirts,
      );
      expect(result).toEqual([{ token: 't-2', name: 'New Name' }]);
    });

    it('ignores a revealed player with no shirt on this board', () => {
      const shirts = [makeShirt({ token: 't-1' })];
      const result = revealMatches([makeReveal({ token: 'ghost', name: 'Ghost' })], shirts);
      expect(result).toEqual([]);
    });

    it('leaves an already-named failed shirt matchable and unchanged in value', () => {
      const shirts = [makeShirt({ token: 't-1', state: 'failed', name: 'Stale' })];
      const result = revealMatches([makeReveal({ token: 't-1', name: 'Fresh' })], shirts);
      expect(result).toEqual([{ token: 't-1', name: 'Fresh' }]);
      expect(shirts[0].name).toBe('Stale'); // pure: no mutation
    });

    it('returns one distinct pair per shirt when the whole team is revealed', () => {
      const shirts = Array.from({ length: 11 }, (_, i) => makeShirt({ token: `t-${i}`, shirtNumber: null }));
      const players = Array.from({ length: 11 }, (_, i) =>
        makeReveal({ token: `t-${i}`, name: `Player ${i}`, shirtNumber: null }),
      );
      const result = revealMatches(players, shirts);
      expect(result).toHaveLength(11);
      expect(new Set(result.map((r) => r.token)).size).toBe(11);
      expect(new Set(result.map((r) => r.name)).size).toBe(11);
    });
  });
  ```

  Nine tests, replacing six. The second and third are the ones that must fail against the old implementation: with `shirts.find(s => s.shirtNumber === player.shirtNumber && s.state !== 'correct')`, the first revealed player takes `t-a` and the second also takes `t-a`, producing `[{t-a,'First Player'},{t-a,'Second Player'}]` and nothing for `t-b`. The `toEqual` above rejects that **on the token**, not on the count, so a future regression cannot pass by coincidentally producing the right number of rows.

- [ ] **Step 3.2: Verify red.**

  ```bash
  cd frontend && npx vitest run src/lib/reveal.test.ts
  ```

  Expected: **FAIL** with a module-resolution error, `Failed to resolve import "./reveal"`. That is the red.

- [ ] **Step 3.3: Implement the module.**

  Create `frontend/src/lib/reveal.ts`:

  ```ts
  import type { RevealPlayer } from '../../types';
  import type { ShirtGameData } from './gameState';

  /** One shirt that a revealed name should be written to. */
  export interface RevealMatch {
    token: string;
    name: string;
  }

  /**
   * Pair each revealed player with the shirt that actually holds him.
   *
   * The join key is the opaque per-game `token`, which is unique by
   * construction. It is NOT `shirtNumber`: `Appearance.number` is `Int?`
   * (backend/prisma/schema.prisma:70) and `getRevealAppearances` orders with
   * `nulls: 'last'`, so players without a number are an expected state. Two of
   * them in one game collide on `===` and the second name overwrites the
   * first, leaving the other shirt blank.
   *
   * Pure: the input shirts are never mutated. The caller dispatches the
   * result, so this function has no knowledge of the reducer.
   */
  export function revealMatches(
    players: RevealPlayer[],
    shirts: ShirtGameData[],
  ): RevealMatch[] {
    const matches: RevealMatch[] = [];
    for (const player of players) {
      const shirt = shirts.find((s) => s.token === player.token && s.state !== 'correct');
      if (shirt) matches.push({ token: shirt.token, name: player.name });
    }
    return matches;
  }
  ```

  The `s.state !== 'correct'` guard is retained: a shirt the player already guessed keeps the name it earned.

- [ ] **Step 3.4: Verify green, then the frontend regression.**

  ```bash
  cd frontend && npx vitest run src/lib/reveal.test.ts
  ```

  Expected: `Test Files 1 passed (1)` / `Tests 9 passed (9)`.

  ```bash
  cd frontend && npm run test
  ```

  Expected: every file green, and the test count **+3** against the measurement taken at the start of this task — this file's six old tests are replaced by nine new ones. Record the real number; do not assert an absolute.

  ```bash
  cd frontend && npx tsc --noEmit
  ```

  Expected: no output. The red from Task 2 Step 2.3 is now gone, because Task 3 rewrote the only file that constructed `RevealPlayer` literals without the field.

- [ ] **Step 3.5: Commit.**

  ```bash
  git add frontend/src/lib/reveal.ts frontend/src/lib/reveal.test.ts
  git commit -m "fix(frontend): match revealed players to shirts by opaque token"
  ```

---

### Task 4: Wire the page to the extracted join

**Files:**
- Modify: `frontend/app/missing-eleven/page.tsx` (`:11-13`, `:43-48`)

**Interfaces:**
- Consumes: `revealMatches(players, shirts)` from `@/lib/reveal`; `revealName(token, name)` from `useGameState()` (`frontend/src/lib/gameState.ts:369-371`).
- Produces: no new exports. `revealTeam` keeps its `(players, shirts)` signature, so both call sites at `:70-71` and `:119-120` are unchanged.

- [ ] **Step 4.1: Replace the inline join.**

  Edit `frontend/app/missing-eleven/page.tsx`, replacing lines 43-48:

  ```tsx
  const revealTeam = useCallback((players: RevealPlayer[], shirts: ShirtGameData[]) => {
    for (const { token, name } of revealMatches(players, shirts)) {
      revealName(token, name);
    }
  }, [revealName]);
  ```

  and add the import beside the existing ones at lines 11-13:

  ```tsx
  import { revealMatches } from '@/lib/reveal';
  ```

  `MAX_ATTEMPTS` at line 4 and every other import stay exactly as they are.

- [ ] **Step 4.2: Prove the old join is gone, not merely bypassed.**

  ```bash
  grep -n "shirtNumber ===" frontend/app/missing-eleven/page.tsx
  ```

  Expected: **no output**. A hit here means the old join survived somewhere; delete it. This grep is the patch's acceptance check for R1(a) at the component level, because that `===` *is* the defect.

  ```bash
  grep -rn "shirtNumber ===" frontend/src frontend/app frontend/components
  ```

  Expected: no output. After this task the shirt-number join does not exist anywhere in the frontend — which is the property v1.2.3 depends on.

  ```bash
  grep -rn "s.token ===" frontend/app/missing-eleven/page.tsx frontend/src/lib/reveal.ts
  ```

  Expected: one hit per file — `page.tsx:149` from the pre-existing `handleShirtClick`, `reveal.ts` from `revealMatches`. The token key is now the only key.

- [ ] **Step 4.3: Run the full frontend regression and the types.**

  ```bash
  cd frontend && npx tsc --noEmit && npm run test
  ```

  Expected: `tsc` clean and every file green. Record the real file and test counts in the changelog; do not assert either against a number written here — the `176` that used to sit in this sentence was measured on `cda2db0`, and v1.0.1, v1.0.2 and v1.1.1 have all landed since.

  ```bash
  cd frontend && npm run lint
  ```

  Expected: no new warnings.

- [ ] **Step 4.4: Commit.**

  ```bash
  git add frontend/app/missing-eleven/page.tsx
  git commit -m "refactor(frontend): route the reveal flow through revealMatches"
  ```

---

## Acceptance criteria

1. `POST /api/guess/reveal` returns `token` on every player, for both `home` and `away`, and the token equals `generatePlayerToken(gameId, playerId)` for that row.
2. `RevealPlayer.token` is a **required** `string`, and `npx tsc --noEmit` is clean.
3. The reveal join reads `token` on both sides. `grep -rn "shirtNumber ===" frontend/src frontend/app frontend/components` returns nothing.
4. Two null-numbered players in one team each receive their own name — asserted at three layers: the backend emits two rows with `number === null` and two distinct tokens; `reveal.test.ts` assigns both names; and the join keys on the token.
5. Two players sharing a shirt number within one team each receive their own name.
6. The order of the reveal array does not change the result.
7. A shirt already in state `correct` is never overwritten.
8. `revealMatches` does not mutate the shirts it is given.
9. `getRevealAppearances` still returns `number` and `player`, and `backend/src/__tests__/integration/matchService.test.ts` is not weakened to accommodate the change.
10. No shared-seed fixture was added: `matchService.test.ts:61` and `guess.test.ts:57` still assert 8 players for game 1 home.
11. Frontend: every test file green, `tsc` clean, `lint` clean. Backend: every test file green, coverage gate satisfied on all four metrics. Neither suite is asserted against a fixed count — both are measured and recorded, per `docs/v1/v1.2/overview.md:209`.
12. Reverting this patch alone returns the app to v1.1.x behaviour with no data repair — the change is one additive response field plus one pure function.

## Validation

| Check | Command | Pass signal |
|---|---|---|
| Backend unit + integration | `cd backend && npm run test` | every file green; count measured and recorded, not asserted |
| Backend coverage gate | `cd backend && npm run test:coverage` | no threshold failure on lines / statements / functions / branches |
| Frontend suite | `cd frontend && npm run test` | every file green; count measured and recorded, not asserted |
| The join itself | `cd frontend && npx vitest run src/lib/reveal.test.ts` | `9 passed (9)` |
| Types | `cd frontend && npx tsc --noEmit` | no output |
| Lint | `cd frontend && npm run lint` | no output |
| No shirt-number join left | `grep -rn "shirtNumber ===" frontend/src frontend/app frontend/components` | no output |
| No `'?'` written into a number field | `grep -rn "shirtNumber = '?'\|shirtNumber: '?'" frontend/src frontend/app frontend/components frontend/lib` | no output |
| No `MAX_ATTEMPTS` collateral | `git diff --stat HEAD~3 -- frontend/src/lib/gameState.ts` | empty — this patch does not touch the attempt budget |

## Risks

| Risk | Mitigation |
|---|---|
| **A reveal regression is invisible in the UI** — a wrong name is a wrong-looking board, never an error. | The R1(a) case is a named test that fails against the old implementation, proven at the data layer (Task 1) and the join layer (Task 3). The order-independence test pins the property the fix relies on. |
| **The `token` reaches the client.** It already does — `LineupPlayer.token` is in every `ShirtGameData` and is required to submit a guess. This patch adds it to the *reveal* response, which reveals nothing new: the token is an HMAC of `(gameId, playerId)`, unguessable without `PLAYER_TOKEN_SECRET`, and every shirt's token for that game is already in the lineup payload. | No secret-handling change. `resolvePlayerToken` still uses `crypto.timingSafeEqual` and is untouched. |
| **`token` is game-scoped, and so is the reveal.** A token from another game resolves to no shirt. | Asserted directly in Task 1.1 (`not.toBe(generatePlayerToken(2, ...))`) and by the ghost-token test in Task 3.1. |
| **The new test in Task 1.1 leaves the database dirty** if it fails before `await seed()`. | `fileParallelism: false` (`backend/vitest.config.ts:8`) runs integration files serially against one database, so a dirty fixture would cascade. If this test fails, run `cd backend && npm run test` again — the `seed()` in the global setup restores it — and do not start the next file until the suite is green. |
| **The 530 games with an empty opponent lineup** return an empty `players` array for that side. | Unchanged by this patch: an empty array yields an empty `revealMatches` result. |

**Escalate before proceeding if:** the rewritten `reveal.test.ts` cannot be made to fail against the old `shirtNumber` join (Task 3.1's second and third tests). That would mean the tests do not protect the behaviour, and TDD's "watch it fail" guarantee is gone — ask before continuing rather than shipping a suite that passes either way.
