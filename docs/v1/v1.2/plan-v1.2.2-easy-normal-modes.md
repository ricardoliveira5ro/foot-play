# Easy and Normal Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The player chooses a difficulty before the board loads, and the chosen mode decides the clue set and the attempt budget. `Easy` adds the first letter to `Normal`'s scorers-and-captain set; both keep six attempts and a visible shirt number (§5.1). Nothing else changes in this patch — `Hard` and `Expert` are already declared in the config so the table is written once, but the UI only offers two of them, because §5.6 ships one patch per mode and a mode offered before its rules exist is a bug report waiting to happen. Task 7 also introduces the **Finish** control, because its only input is the `opponentRequired` column this patch's Task 1 writes; in both offered modes it renders nothing, and v1.2.4 is where Expert first needs it.

**Architecture:** One new module, `frontend/src/lib/difficulty.ts`, owns the entire mode table as data. Every other decision in the patch reads that table instead of branching on the mode name: the attempt budget, the clue set, the attempt-limit check, the mode selector, the Finish control. The clue *policy* — which clues a given shirt actually has — lands in `availableClues` in `frontend/src/lib/shirtBadges.ts`, which intersects the mode's flags with the presence of data. Both are pure and unit-tested, so the mode table is verified as a table rather than as a chain of `if (mode === 'easy')` statements scattered across a component.

**Tech Stack:** TypeScript, Next 16 / React 19, Vitest + `@testing-library/react` (frontend).

---

## Global Constraints

- **The mode table is data, and it is the only place a mode name is compared.** The four-mode table is written in full in Task 1 — including `Hard` and `Expert`, whose values are final here per §5.1 — but `DIFFICULTIES` (the selector's option list) contains only `easy` and `normal` in this patch. `DIFFICULTIES` grows in v1.2.3 and v1.2.4; no other file changes to offer a new mode. This is why the config carries a `label` per mode and a `DIFFICULTIES` array exists beside it: the table and the offer list are separate concerns.
- **No Prisma column, no migration, no new endpoint.** `GameState.difficulty` is client-side state initialised to `DEFAULT_DIFFICULTY` (`'normal'`), exactly as the locked contract specifies. Accepted tradeoff: reloading the page returns to Normal. v1.3.2 needs the mode on a *result* row, which is a different field from the mode you picked, and the roadmap assigns that field to v1.3.2 — see the handoff note in `overview.md`. Do not add a column in this patch.
- **The attempt budget is read from config at every call site.** `DIFFICULTY_CONFIG[difficulty].attempts` replaces `MAX_ATTEMPTS` at `frontend/src/lib/gameState.ts:154` and `frontend/app/missing-eleven/page.tsx:168,341,344`. No `attemptsFor(mode)` helper: the frozen contract exposes the table and the direct lookup is the whole idiom. The `MAX_ATTEMPTS` export is **kept**, re-expressed as `DIFFICULTY_CONFIG[DEFAULT_DIFFICULTY].attempts` so the two cannot drift, because `frontend/src/lib/gameState.test.ts:287-294` imports it and rewriting a passing test to accommodate a new constant is a worse trade than keeping a value that is now derived.
- **`availableClues` intersects mode flags with data presence.** A flag says the mode *permits* a clue; the data says the shirt *has* one. `first-letter` requires `hasFirstLetter`, `scorers` requires `goals > 0`, `captain` requires `isCaptain === true`, and `shirt-number` is config-only because its input deliberately has no `shirtNumber` field. Returned in the fixed order `['first-letter', 'scorers', 'captain', 'shirt-number']` regardless of mode, so the order is a display contract, not an accident of object key order.
- **`redCards` is in the signature and never in the output.** It is accepted for structural symmetry with the appearance row, and it is decoration in every mode (§5.1, O5). No clue derived from it exists or may be added; a test asserts that a red-carded player gains no clue.
- **`isCaptain` arrives as `boolean` and is compared with `=== true`.** The API normalises the nullable Prisma column (`a.isCaptain === true`, v1.0.2's `buildLineup`) so `null` is already `false` at the boundary. The explicit comparison in `availableClues` is the belt to that braces, and it is what makes the 227 captain-less games (§5.5) fall out as "no captain clue" instead of as an error.
- **Games with no event data degrade silently.** A shirt with `goals: 0`, `isCaptain: false`, `hasFirstLetter: false` in `Easy` yields `['shirt-number']`, not an empty array and not a thrown error.
- **No component test is added outside `frontend/src/`.** New component tests live at `frontend/src/components/*.test.tsx` and import outward with `../../components/<Name>`. They carry `// @vitest-environment jsdom` because the global environment is `node`. This is a **house rule for readability, not a consequence of the include**: on this tree the include is `src/**` only, and after v1.1.1 it enumerates `src/**`, `components/**`, `tests/**` and `app/**`, so a test outside `src/` would be collected. Keeping new component tests under `src/` anyway means the coverage `include` (`src/**`) sees them. `frontend/vitest.config.mts` is **dead, not shadowing** — Vitest resolves `CONFIG_NAMES × CONFIG_EXTENSIONS` in order and takes the first hit, so `vitest.config.ts` is always the effective config, and the two are not equivalent (9 collected files on the `.ts` versus 5 on the `.mts`). v1.1.1 owns the include list and deletes the `.mts` (R7); this patch does not touch `frontend/vitest.config.ts`.
- **TDD applies to every task here.** The two new modules and the reducer change are all test-first, and the selector component is test-first with `@testing-library/react`.
- **Regression commands, run at every task boundary:**

  ```bash
  cd backend  && npm run test              # count measured, never asserted
  cd frontend && npm run test              # count measured, never asserted
  cd frontend && npx tsc --noEmit
  ```

  **Do not carry a fixed baseline.** The figures behind this block were measured on `cda2db0` and are a snapshot, not a contract: v1.0.1, v1.0.2, v1.1.1 and v1.2.1 all land before this patch and each one moves the totals. Measure at every boundary and record the actual number.

---

## Files touched

| File | Change |
|---|---|
| `frontend/src/lib/difficulty.ts` | **new** — `Difficulty`, `DIFFICULTIES`, `DIFFICULTY_CONFIG`, `DEFAULT_DIFFICULTY` |
| `frontend/src/lib/difficulty.test.ts` | **new** — the table asserted as a table |
| `frontend/src/lib/shirtBadges.ts` | **new, or appended if v1.0.3 landed first** — `ShirtClue`, `availableClues`. Append-only: in the merged case v1.0.3's exports survive intact |
| `frontend/src/lib/shirtBadges.test.ts` | **new, or appended if v1.0.3 landed first** — clue policy, including the degradation cases. Append-only: in the merged case the file holds v1.0.3's 7 tests plus this patch's 9, and the expected count is `16 passed (16)`, never `9` |
| `frontend/src/lib/gameState.ts` | `GameState.difficulty`, `initialState.difficulty`, `SET_DIFFICULTY`, config-driven attempt limit |
| `frontend/src/lib/gameState.test.ts` | reducer tests for `SET_DIFFICULTY`, the config-driven limit, and `resolvedShirtCount` (Task 7) |
| `frontend/src/lib/gameState.hook.test.ts` | `setDifficulty` exposed from the hook |
| `frontend/src/components/DifficultySelector.tsx` | **new** — two-option selector |
| `frontend/src/components/DifficultySelector.test.tsx` | **new** — jsdom render test |
| `frontend/src/components/WordleModal.tsx` | clue line in the header |
| `frontend/src/components/WordleModal.test.tsx` | clue-line assertions |
| `frontend/src/components/FinishButton.tsx` | **new (Task 7)** — the config-driven control plus its confirmation |
| `frontend/src/components/FinishButton.test.tsx` | **new (Task 7)** — jsdom render tests, including the two "renders nothing" cases |
| `frontend/app/missing-eleven/page.tsx` | render the selector, pass the mode, replace `MAX_ATTEMPTS`, render Finish (Task 7) |

---

## Tasks

### Task 1: The mode table

**Files:**
- Create: `frontend/src/lib/difficulty.ts`
- Create: `frontend/src/lib/difficulty.test.ts`

**Interfaces:**
- Produces, and this is the **frozen cross-line contract** that v1.2.3, v1.2.4 and v1.2.5 all read — do not rename a field, add a field, or reorder the type:

  ```ts
  export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';
  export const DIFFICULTIES: readonly Difficulty[];
  export const DIFFICULTY_CONFIG: Record<Difficulty, {
    attempts: number;
    multiplier: number;
    showShirtNumber: boolean;
    showFirstLetter: boolean;
    showScorersClue: boolean;
    showCaptainClue: boolean;
    opponentRequired: boolean;
    label: string;
  }>;
  export const DEFAULT_DIFFICULTY: Difficulty;
  ```

- [ ] **Step 1.1: Write the failing test first.**

  Create `frontend/src/lib/difficulty.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import { DIFFICULTIES, DIFFICULTY_CONFIG, DEFAULT_DIFFICULTY, type Difficulty } from './difficulty';

  const ALL: Difficulty[] = ['easy', 'normal', 'hard', 'expert'];

  describe('DIFFICULTY_CONFIG', () => {
    it('defines an entry for every difficulty, with no extras', () => {
      expect(Object.keys(DIFFICULTY_CONFIG).sort()).toEqual([...ALL].sort());
    });

    it('matches the §5.1 table for every mode', () => {
      // The table is the spec. Asserting it row by row means a typo in one
      // cell fails one assertion instead of silently shipping.
      expect(DIFFICULTY_CONFIG.easy).toMatchObject({
        attempts: 6, multiplier: 0.5, showShirtNumber: true,
        showFirstLetter: true, showScorersClue: true, showCaptainClue: true,
        opponentRequired: false,
      });
      expect(DIFFICULTY_CONFIG.normal).toMatchObject({
        attempts: 6, multiplier: 1, showShirtNumber: true,
        showFirstLetter: false, showScorersClue: true, showCaptainClue: true,
        opponentRequired: false,
      });
      expect(DIFFICULTY_CONFIG.hard).toMatchObject({
        attempts: 6, multiplier: 2, showShirtNumber: false,
        showFirstLetter: false, showScorersClue: false, showCaptainClue: false,
        opponentRequired: false,
      });
      expect(DIFFICULTY_CONFIG.expert).toMatchObject({
        attempts: 3, multiplier: 3, showShirtNumber: false,
        showFirstLetter: false, showScorersClue: false, showCaptainClue: false,
        opponentRequired: true,
      });
    });

    it('gives every mode a non-empty human label', () => {
      for (const mode of ALL) expect(DIFFICULTY_CONFIG[mode].label.trim()).not.toBe('');
    });

    it('keeps Expert on 3 attempts and every other mode on 6', () => {
      expect(DIFFICULTY_CONFIG.expert.attempts).toBe(3);
      for (const mode of ALL.filter((m) => m !== 'expert')) {
        expect(DIFFICULTY_CONFIG[mode].attempts).toBe(6);
      }
    });
  });

  describe('DIFFICULTIES', () => {
    it('offers only the modes that have shipped, in ascending order', () => {
      // v1.2.2 ships Easy and Normal. v1.2.3 appends 'hard', v1.2.4 appends
      // 'expert'. The offer list is deliberately not the same thing as the
      // config keys.
      expect(DIFFICULTIES).toEqual(['easy', 'normal']);
    });

    it('offers a subset of the config, in config order', () => {
      for (const mode of DIFFICULTIES) expect(DIFFICULTY_CONFIG[mode]).toBeDefined();
    });
  });

  describe('DEFAULT_DIFFICULTY', () => {
    it('is normal, which is the mode that matches the pre-v1.2 experience', () => {
      expect(DEFAULT_DIFFICULTY).toBe('normal');
      expect(DIFFICULTY_CONFIG[DEFAULT_DIFFICULTY].multiplier).toBe(1);
      expect(DIFFICULTY_CONFIG[DEFAULT_DIFFICULTY].attempts).toBe(6);
    });
  });
  ```

  The third `DIFFICULTIES` test is the one that fails first after Task 1.2 is written with all four modes listed — it is the guard that keeps a mode from being offered early, so do not relax it to `expect(DIFFICULTIES).toContain('hard')` in a later patch without also adding that mode's rules.

- [ ] **Step 1.2: Verify red.**

  ```bash
  cd frontend && npx vitest run src/lib/difficulty.test.ts 2>&1 | tail -20
  ```

  Expected: **FAIL** — `Failed to resolve import "./difficulty"`.

- [ ] **Step 1.3: Implement the table.**

  Create `frontend/src/lib/difficulty.ts`:

  ```ts
  /**
   * The v1.2 mode table (roadmap §5.1), written once.
   *
   * Every other decision in the v1.2 patches reads this table: the attempt
   * budget, the clue set, the shirt-number mask, the opponent requirement and
   * the scoring multiplier. Adding a mode means adding a row here and nothing
   * else until its own patch lands.
   */

  export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';

  export interface DifficultyConfig {
    /** Guesses allowed per shirt. */
    attempts: number;
    /** Applied per shirt to both sides of the score (§5.3, v1.2.5). */
    multiplier: number;
    showShirtNumber: boolean;
    showFirstLetter: boolean;
    showScorersClue: boolean;
    showCaptainClue: boolean;
    /** Expert must resolve all 22 shirts before Finish is available (§5.2). */
    opponentRequired: boolean;
    /** Display name in the selector. */
    label: string;
  }

  export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
    easy: {
      attempts: 6, multiplier: 0.5, showShirtNumber: true,
      showFirstLetter: true, showScorersClue: true, showCaptainClue: true,
      opponentRequired: false, label: 'Easy',
    },
    normal: {
      attempts: 6, multiplier: 1, showShirtNumber: true,
      showFirstLetter: false, showScorersClue: true, showCaptainClue: true,
      opponentRequired: false, label: 'Normal',
    },
    hard: {
      attempts: 6, multiplier: 2, showShirtNumber: false,
      showFirstLetter: false, showScorersClue: false, showCaptainClue: false,
      opponentRequired: false, label: 'Hard',
    },
    expert: {
      attempts: 3, multiplier: 3, showShirtNumber: false,
      showFirstLetter: false, showScorersClue: false, showCaptainClue: false,
      opponentRequired: true, label: 'Expert',
    },
  };

  /**
   * Modes offered in the UI, in ascending order. Deliberately shorter than the
   * config: a mode is offered only once the patch that implements its rules
   * has shipped (v1.2.2 offers two, v1.2.3 appends 'hard', v1.2.4 'expert').
   */
  export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal'];

  export const DEFAULT_DIFFICULTY: Difficulty = 'normal';
  ```

- [ ] **Step 1.4: Verify green.**

  ```bash
  cd frontend && npx vitest run src/lib/difficulty.test.ts 2>&1 | tail -20
  ```

  Expected: `Test Files 1 passed (1)` / `Tests 7 passed (7)`.

- [ ] **Step 1.5: Commit.**

  ```bash
  git add frontend/src/lib/difficulty.ts frontend/src/lib/difficulty.test.ts
  git commit -m "feat(frontend): add the v1.2 difficulty config table"
  ```

---

### Task 2: The clue policy

**Files:**
- Create: `frontend/src/lib/shirtBadges.ts` — **or append to it, if v1.0.3 has already landed; never overwrite it**
- Create: `frontend/src/lib/shirtBadges.test.ts` — **or append to it, if v1.0.3 has already landed; never overwrite it**

**Interfaces:**
- Consumes: `Difficulty` from `./difficulty`.
- Produces the second **frozen cross-line contract**:

  ```ts
  export type ShirtClue = 'first-letter' | 'scorers' | 'captain' | 'shirt-number';
  export function availableClues(
    mode: Difficulty,
    shirt: { goals: number; redCards: number; isCaptain: boolean; hasFirstLetter: boolean },
  ): ShirtClue[];
  ```

- [ ] **Step 2.0: Resolve the file-state precondition.**

  ```bash
  ls frontend/src/lib/shirtBadges.ts
  ```

  **Not present** (the state on `cda2db0`) → create the file as below. **Present** (v1.0.3 landed) → do not create it; append `ShirtClue`, `ClueShirt`, `availableClues` and its imports to the existing module, preserving every export v1.0.3 defined. The two histories merge into one file either way; the rest of this task is identical, with one exception that matters: **in the merged case the expected test count is the union of both sets, not this task's alone** (Step 2.4).

- [ ] **Step 2.1: Write the failing test first.**

  The branch from Step 2.0 decides the file, and it decides the *verb*:

  - **`shirtBadges.test.ts` does not exist (v1.0.3 has not landed)** → **create** it with the block below.
  - **`shirtBadges.test.ts` already exists (v1.0.3 landed first)** → **append** a `describe('availableClues', …)` block to the existing file. **Append only. Never rewrite, never replace, never "start from the block below".** The file already holds v1.0.3's seven tests; following this step literally as written would delete seven passing tests, and a `git add` of the result would make that deletion look deliberate in review.

  ```ts
  import { describe, it, expect } from 'vitest';
  import { availableClues } from './shirtBadges';

  const bare = { goals: 0, redCards: 0, isCaptain: false, hasFirstLetter: false };

  describe('availableClues', () => {
    it('gives Easy every permitted clue when the data supports all of them', () => {
      expect(
        availableClues('easy', { goals: 2, redCards: 0, isCaptain: true, hasFirstLetter: true }),
      ).toEqual(['first-letter', 'scorers', 'captain', 'shirt-number']);
    });

    it('gives Normal the scorers and captain clues but never the first letter', () => {
      const clues = availableClues('normal', { goals: 2, redCards: 0, isCaptain: true, hasFirstLetter: true });
      expect(clues).toEqual(['scorers', 'captain', 'shirt-number']);
      expect(clues).not.toContain('first-letter');
    });

    it('gives Hard and Expert no data-driven clues, only the shirt number', () => {
      for (const mode of ['hard', 'expert'] as const) {
        expect(availableClues(mode, { goals: 3, redCards: 1, isCaptain: true, hasFirstLetter: true }))
          .toEqual(['shirt-number']);
      }
    });

    it('omits the first letter when the mode permits it but the name has none', () => {
      expect(availableClues('easy', { ...bare, hasFirstLetter: false }))
        .not.toContain('first-letter');
    });

    it('omits the scorers clue when the player scored nothing', () => {
      expect(availableClues('normal', { ...bare, goals: 0 })).not.toContain('scorers');
    });

    it('omits the captain clue for a non-captain', () => {
      expect(availableClues('normal', { ...bare, isCaptain: false })).not.toContain('captain');
    });

    it('degrades to just the shirt number when there is no event data at all', () => {
      // A shirt with no scorers row, no captain row and no first letter is the
      // 227-games-with-no-captain case (§5.5) and the 530-games-with-no-events
      // case. Neither is an error; the shirt simply has fewer clues.
      expect(availableClues('easy', bare)).toEqual(['shirt-number']);
      expect(availableClues('normal', bare)).toEqual(['shirt-number']);
    });

    it('never produces a clue from redCards, in any mode', () => {
      // O5: the send-off icon is decoration in every mode. A red-carded player
      // with no other data gains nothing.
      for (const mode of ['easy', 'normal', 'hard', 'expert'] as const) {
        const withCard = availableClues(mode, { ...bare, redCards: 1 });
        const without = availableClues(mode, { ...bare, redCards: 0 });
        expect(withCard).toEqual(without);
        expect(withCard).not.toContain('captain');
        expect(withCard).not.toContain('scorers');
      }
    });

    it('returns clues in the fixed display order regardless of the input shape', () => {
      const clues = availableClues('easy', { goals: 1, redCards: 0, isCaptain: true, hasFirstLetter: true });
      expect(clues).toEqual([...clues].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)));
    });
  });
  ```

  Add the ordering constant at the top of the test file, after the imports:

  ```ts
  const ORDER: ShirtClue[] = ['first-letter', 'scorers', 'captain', 'shirt-number'];
  ```

  and import the type: `import { availableClues, type ShirtClue } from './shirtBadges';`

- [ ] **Step 2.2: Verify red.**

  ```bash
  cd frontend && npx vitest run src/lib/shirtBadges.test.ts 2>&1 | tail -20
  ```

  Expected: **FAIL** — `Failed to resolve import "./shirtBadges"`.

- [ ] **Step 2.3: Implement the policy.**

  **In the merged case, this step appends; it never overwrites.** Read the top of `frontend/src/lib/shirtBadges.ts` first. If v1.0.3's exports are there, add `ShirtClue`, `ClueShirt`, `availableClues` and the `./difficulty` import **beside** them, reusing v1.0.3's clue-label map if it has one rather than declaring a second. Do not rewrite the file around your additions, and do not reformat a line you did not touch — the diff has to read as "one patch added a clue policy to a module that already existed".

  ```ts
  import { DIFFICULTY_CONFIG, type Difficulty } from './difficulty';

  export type ShirtClue = 'first-letter' | 'scorers' | 'captain' | 'shirt-number';

  /** The subset of an appearance row that can carry a clue. */
  export interface ClueShirt {
    goals: number;
    /** Accepted for structural symmetry with the appearance row. Never a clue:
     *  the send-off icon is decoration in every mode (§5.1, O5). */
    redCards: number;
    isCaptain: boolean;
    hasFirstLetter: boolean;
  }

  /** Fixed display order. The caller may sort, but the policy returns this. */
  const CLUE_ORDER: readonly ShirtClue[] = ['first-letter', 'scorers', 'captain', 'shirt-number'];

  /**
   * The clues a shirt actually shows, in a given mode.
   *
   * The mode's flags say which clues are *permitted*; the shirt's data says
   * which *exist*. Intersecting the two is what makes degradation automatic:
   * a game with no event rows yields fewer clues instead of an error, and the
   * 227 captain-less games (§5.5) yield no captain clue rather than a broken
   * one.
   *
   * `shirt-number` is the odd one out: it is config-only, because this input
   * deliberately carries no `shirtNumber`. In `hard` and `expert` it is still
   * returned — those modes *hide* the number (§5.1), they do not remove it
   * from the data, and v1.2.3 masks it at render time. So its presence here
   * means "this shirt has a number to show or mask", never "show the number".
   */
  export function availableClues(mode: Difficulty, shirt: ClueShirt): ShirtClue[] {
    const config = DIFFICULTY_CONFIG[mode];
    const present: Record<ShirtClue, boolean> = {
      'first-letter': shirt.hasFirstLetter,
      scorers: shirt.goals > 0,
      captain: shirt.isCaptain === true,
      'shirt-number': true,
    };
    const permitted: Record<ShirtClue, boolean> = {
      'first-letter': config.showFirstLetter,
      scorers: config.showScorersClue,
      captain: config.showCaptainClue,
      'shirt-number': config.showShirtNumber || !config.showShirtNumber,
    };
    return CLUE_ORDER.filter((clue) => permitted[clue] && present[clue]);
  }
  ```

  **On the `'shirt-number'` line.** `config.showShirtNumber || !config.showShirtNumber` is deliberate and is the one ugly line in the patch: `shirt-number` is present in every mode because the number always exists in the data, and Hard/Expert *mask* it at render time (v1.2.3) rather than removing it. Written as a plain `true`, the line would read as though the config flag were being ignored; written as `config.showShirtNumber`, it would delete the number from Hard and Expert, which is the null-write bug §5.6 warns about. If v1.0.3 landed first and this file already has a clue-label map, reuse its labels here rather than introducing a second one.

- [ ] **Step 2.4: Verify green.**

  ```bash
  cd frontend && npx vitest run src/lib/shirtBadges.test.ts 2>&1 | tail -20
  ```

  Expected: `Test Files 1 passed (1)` and no failures.

  **The expected count depends on the Step 2.0 branch, and the union is the point:**

  | Tree state | Expected |
  |---|---|
  | `shirtBadges.test.ts` created by this task | `9 passed (9)` — this task's nine tests alone |
  | v1.0.3 landed first, this task's nine **appended** | **`16 passed (16)`** — v1.0.3's 7 **plus** this task's 9 |

  If you appended and see 9, you have overwritten v1.0.3's tests; restore them from that patch before continuing. Never make the suite green by deleting a test you did not write.

- [ ] **Step 2.5: Commit.**

  ```bash
  git add frontend/src/lib/shirtBadges.ts frontend/src/lib/shirtBadges.test.ts
  git commit -m "feat(frontend): derive per-shirt clue availability from the mode table"
  ```

---

### Task 3: `difficulty` in game state

**Files:**
- Modify: `frontend/src/lib/gameState.ts` (`:7`, `:25-33`, `:36`, `:55`, reducer switch)
- Modify: `frontend/src/lib/gameState.test.ts`
- Modify: `frontend/src/lib/gameState.hook.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_DIFFICULTY`, `Difficulty` from `./difficulty`.
- Produces:
  ```ts
  // GameState gains:
  difficulty: Difficulty;
  // GameAction gains:
  | { type: 'SET_DIFFICULTY'; payload: Difficulty }
  // initialState gains: difficulty = DEFAULT_DIFFICULTY
  ```
  plus a `setDifficulty(mode: Difficulty): void` on the hook, alongside `toggleBoard`.
  `MAX_ATTEMPTS` remains exported, now defined as `DIFFICULTY_CONFIG[DEFAULT_DIFFICULTY].attempts`.

- [ ] **Step 3.1: Write the failing tests first.**

  Append to `frontend/src/lib/gameState.test.ts`, inside the existing top-level `describe`:

  ```ts
    describe('SET_DIFFICULTY', () => {
      it('defaults to normal on a fresh game', () => {
        expect(initialState.difficulty).toBe('normal');
        expect(initialState.difficulty).toBe(DEFAULT_DIFFICULTY);
      });

      it('stores the chosen mode', () => {
        const next = gameReducer(initialState, { type: 'SET_DIFFICULTY', payload: 'easy' });
        expect(next.difficulty).toBe('easy');
      });

      it('leaves the board and the shirts untouched', () => {
        const next = gameReducer(initialState, { type: 'SET_DIFFICULTY', payload: 'easy' });
        expect(next.targetShirts).toBe(initialState.targetShirts);
        expect(next.gameStatus).toBe(initialState.gameStatus);
      });

      it('returns to normal on NEW_GAME', () => {
        const easy = gameReducer(initialState, { type: 'SET_DIFFICULTY', payload: 'easy' });
        expect(gameReducer(easy, { type: 'NEW_GAME' }).difficulty).toBe(DEFAULT_DIFFICULTY);
      });

      it('keeps MAX_ATTEMPTS in step with the default mode', () => {
        expect(MAX_ATTEMPTS).toBe(DIFFICULTY_CONFIG[DEFAULT_DIFFICULTY].attempts);
      });
    });
  ```

  The last test is the drift guard: it fails if anyone re-hardcodes `6` at `gameState.ts:7` instead of deriving it.

  Append to `frontend/src/lib/gameState.hook.test.ts`, in the existing hook test:

  ```ts
    it('exposes setDifficulty and the current mode', async () => {
      const { result } = renderHook(() => useGameState());
      expect(result.current.state.difficulty).toBe('normal');
      act(() => result.current.setDifficulty('easy'));
      expect(result.current.state.difficulty).toBe('easy');
    });
  ```

  Add `DEFAULT_DIFFICULTY, DIFFICULTY_CONFIG` to the existing `./difficulty` import in `gameState.test.ts` and the `act` import in the hook test.

- [ ] **Step 3.2: Verify red.**

  ```bash
  cd frontend && npx vitest run src/lib/gameState.test.ts src/lib/gameState.hook.test.ts 2>&1 | tail -30
  ```

  Expected: **FAIL** in both. The reducer tests fail on `initialState.difficulty` being `undefined` and on the `SET_DIFFICULTY` action being an unknown type; the hook test fails because `setDifficulty` is not a function.

- [ ] **Step 3.3: Implement the state change.**

  In `frontend/src/lib/gameState.ts`:

  1. Replace line 7:

     ```ts
     import { DEFAULT_DIFFICULTY, DIFFICULTY_CONFIG, type Difficulty } from './difficulty';
     ```

     (place it with the other imports) and replace the local constant with:

     ```ts
     /**
      * The Normal-mode attempt budget. Retained because it is the pre-v1.2
      * default and several tests import it; it is *derived* from the config so
      * it cannot drift from the table. Gameplay reads
      * `DIFFICULTY_CONFIG[state.difficulty].attempts` instead — see
      * `isLastAttempt` below.
      */
     const MAX_ATTEMPTS = DIFFICULTY_CONFIG[DEFAULT_DIFFICULTY].attempts;
     ```

  2. Add to `GameState` (after `activeBoard`):

     ```ts
     /** Mode chosen for this session. Drives attempts and the clue set (§5.1). */
     difficulty: Difficulty;
     ```

  3. Add to `GameAction`, directly after `SELECT_TEAM`:

     ```ts
     | { type: 'SET_DIFFICULTY'; payload: Difficulty }
     ```

  4. Add to `initialState`, after `teamSide: 'home'`:

     ```ts
     difficulty: DEFAULT_DIFFICULTY,
     ```

  5. In the reducer switch, directly after the `SELECT_TEAM` case:

     ```ts
       case 'SET_DIFFICULTY':
         return { ...state, difficulty: action.payload };
     ```

  6. In the `isLastAttempt` computation at line 154, replace `newAttempts >= MAX_ATTEMPTS` with:

     ```ts
     const isLastAttempt = newAttempts >= DIFFICULTY_CONFIG[state.difficulty].attempts;
     ```

     This is the one place the reducer enforces the attempt limit, so it is the one place that must follow the mode. Note it reads `state.difficulty` — the mode in force when the guess was submitted — not a prop, because the reducer has no other source.

  7. In the hook's returned object, beside `toggleBoard`:

     ```ts
     const setDifficulty = useCallback((mode: Difficulty) => dispatch({ type: 'SET_DIFFICULTY', payload: mode }), []);
     ```

- [ ] **Step 3.4: Verify green.**

  ```bash
  cd frontend && npx vitest run src/lib/gameState.test.ts src/lib/gameState.hook.test.ts 2>&1 | tail -20
  ```

  Expected: `Test Files 2 passed (2)` and no failures. The `gameState` count is **+6** against the measurement taken at the start of this task (5 new tests in `gameState.test.ts`, 1 in the hook test) — record the real number. Do not assert a total: `docs/v1/v1.2/overview.md:205` is explicit that a suite is never forced to match a number in a plan, and v1.0.x, v1.1.x and v1.2.1 have all landed before this patch.

  ```bash
  cd frontend && npm run test 2>&1 | tail -12
  ```

  Expected: every file green. This task adds **+6** against whatever the suite measured at the start of it (2 `difficulty` files' worth of tests in this plan's terms are already counted in Tasks 1–2: 7 for the mode table, 9 for the clue policy, 5 and 1 for the state change). **Measure and record the number; do not assert one.** The absolute totals written in earlier drafts of this step were arithmetic on a pre-v1.1.x baseline and were wrong in three different ways at once — do not reintroduce them.

  ```bash
  cd frontend && npx tsc --noEmit
  ```

  Expected: no output. The `GameState` change is additive and every existing construction of a full `GameState` in the tests goes through `initialState` or a spread, so nothing should break — if `tsc` reports missing-`difficulty` errors, a test hand-builds a `GameState` literal and should spread `initialState` instead.

- [ ] **Step 3.5: Commit.**

  ```bash
  git add frontend/src/lib/gameState.ts frontend/src/lib/gameState.test.ts frontend/src/lib/gameState.hook.test.ts
  git commit -m "feat(frontend): track the chosen difficulty in game state"
  ```

---

### Task 4: The attempt budget follows the mode

**Files:**
- Modify: `frontend/app/missing-eleven/page.tsx` (`:4`, `:168`, `:341`, `:344`)

**Interfaces:**
- Consumes: `DIFFICULTY_CONFIG` from `@/lib/difficulty`; `state.difficulty` from `useGameState()`.
- Produces: no new exports. `MAX_ATTEMPTS` is no longer read by the page.

- [ ] **Step 4.1: Replace all four call sites.**

  In `frontend/app/missing-eleven/page.tsx`:

  1. Line 4 — drop the constant from the import:

     ```tsx
     import { useGameState } from '@/lib/gameState';
     ```

  2. Add, beside the other `@/lib` imports:

     ```tsx
     import { DIFFICULTY_CONFIG } from '@/lib/difficulty';
     ```

  3. Immediately after the `revealTeam` callback, derive the budget once per render:

     ```tsx
     const maxAttempts = DIFFICULTY_CONFIG[state.difficulty].attempts;
     ```

  4. Line 168 — `const isLastAttempt = activeShirt.guessHistory.length + 1 >= DIFFICULTY_CONFIG[state.difficulty].attempts;`

  5. Line 341 — `maxAttempts={DIFFICULTY_CONFIG[state.difficulty].attempts}`

  6. Line 344 — `isGameOver={guessHistory.length >= DIFFICULTY_CONFIG[state.difficulty].attempts || guessHistory.some(g => g.every(r => r.result === 'CORRECT'))}`

  The derived `maxAttempts` const is used where a value is read once; the three inline lookups are used where it is read inside JSX or a callback far from the top of the component. **Be consistent within a block** — if you introduce `maxAttempts`, use it at all three JSX sites; do not mix the two styles in one expression.

- [ ] **Step 4.2: Prove the constant is gone from the page.**

  ```bash
  grep -n "MAX_ATTEMPTS" frontend/app/missing-eleven/page.tsx
  ```

  Expected: **no output**. A hit means a site still reads the Normal-mode constant, which would make Expert silently play six attempts in v1.2.4.

  ```bash
  grep -n "DIFFICULTY_CONFIG" frontend/app/missing-eleven/page.tsx
  ```

  Expected: one import plus three or four uses. Count them — the four sites above are the four, and any other use is scope creep to justify before merging.

- [ ] **Step 4.3: Run the frontend regression.**

  ```bash
  cd frontend && npx tsc --noEmit && npm run test 2>&1 | tail -12 && npm run lint 2>&1 | tail -20
  ```

  Expected: `tsc` clean, suite at the count recorded in Task 3 Step 3.4, no new lint warnings.

- [ ] **Step 4.4: Commit.**

  ```bash
  git add frontend/app/missing-eleven/page.tsx
  git commit -m "refactor(frontend): read the attempt budget from the mode table"
  ```

---

### Task 5: The selector

**Files:**
- Create: `frontend/src/components/DifficultySelector.tsx`
- Create: `frontend/src/components/DifficultySelector.test.tsx`
- Modify: `frontend/app/missing-eleven/page.tsx`

**Interfaces:**
- Consumes: `DIFFICULTIES`, `DIFFICULTY_CONFIG`, `type Difficulty` from `@/lib/difficulty`.
- Produces:
  ```tsx
  interface DifficultySelectorProps {
    value: Difficulty;
    onChange: (mode: Difficulty) => void;
  }
  ```

- [ ] **Step 5.1: Write the failing test first.**

  Create `frontend/src/components/DifficultySelector.test.tsx`:

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, vi } from 'vitest';
  import { render, screen, fireEvent } from '@testing-library/react';
  import DifficultySelector from './DifficultySelector';
  import { DIFFICULTIES, DIFFICULTY_CONFIG } from '../lib/difficulty';

  describe('DifficultySelector', () => {
    it('renders exactly the modes that have shipped', () => {
      render(<DifficultySelector value="normal" onChange={() => {}} />);
      for (const mode of DIFFICULTIES) {
        expect(screen.getByRole('radio', { name: DIFFICULTY_CONFIG[mode].label })).toBeTruthy();
      }
      expect(screen.getAllByRole('radio')).toHaveLength(DIFFICULTIES.length);
    });

    it('marks the current mode as checked', () => {
      render(<DifficultySelector value="easy" onChange={() => {}} />);
      expect((screen.getByRole('radio', { name: 'Easy' }) as HTMLInputElement).checked).toBe(true);
      expect((screen.getByRole('radio', { name: 'Normal' }) as HTMLInputElement).checked).toBe(false);
    });

    it('reports the chosen mode', () => {
      const onChange = vi.fn();
      render(<DifficultySelector value="normal" onChange={onChange} />);
      fireEvent.click(screen.getByRole('radio', { name: 'Easy' }));
      expect(onChange).toHaveBeenCalledWith('easy');
    });

    it('describes each mode with its attempts and clues', () => {
      render(<DifficultySelector value="normal" onChange={() => {}} />);
      // The player has to be able to tell Easy from Normal before starting;
      // "more clues" is the only difference that matters here.
      expect(screen.getByText(/first letter/i)).toBeTruthy();
      expect(screen.getByText(/6 attempts/i)).toBeTruthy();
    });
  });
  ```

  The file lives under `frontend/src/components/` on purpose, and that placement is a house rule rather than a consequence of the include: on the current tree `frontend/vitest.config.ts:16` does collect `src/**` only, but by the time this patch runs v1.1.1 has widened it to enumerate `src/**`, `components/**`, `tests/**` and `app/**` — so a test at `frontend/components/` *would* be collected by then. It would sit outside the coverage `include` (`src/**`), though, and `src/components/` is where the newest components live and where the next person will look. The `// @vitest-environment jsdom` line is required because the global environment is `node`, and that one **is** a real constraint. v1.1.1 owns the include list; this patch does not touch `frontend/vitest.config.ts`.

- [ ] **Step 5.2: Verify red.**

  ```bash
  cd frontend && npx vitest run src/components/DifficultySelector.test.tsx 2>&1 | tail -20
  ```

  Expected: **FAIL** — `Failed to resolve import "./DifficultySelector"`.

- [ ] **Step 5.3: Implement the component.**

  Create `frontend/src/components/DifficultySelector.tsx`:

  ```tsx
  'use client';

  import { DIFFICULTIES, DIFFICULTY_CONFIG, type Difficulty } from '../lib/difficulty';

  interface DifficultySelectorProps {
    value: Difficulty;
    onChange: (mode: Difficulty) => void;
  }

  /** One-line summary of what a mode changes. Kept beside the table on
   *  purpose: the copy is derived, so it cannot drift from the config. */
  function describeMode(mode: Difficulty): string {
    const c = DIFFICULTY_CONFIG[mode];
    const clues = [
      c.showFirstLetter && 'first letter',
      c.showScorersClue && 'scorers',
      c.showCaptainClue && 'captain',
    ].filter(Boolean);
    const clueText = clues.length ? clues.join(' + ') : 'no clues';
    return `${c.attempts} attempts · ${clueText} · number shown`;
  }

  export default function DifficultySelector({ value, onChange }: DifficultySelectorProps) {
    return (
      <fieldset className="difficulty-selector">
        <legend>Difficulty</legend>
        {DIFFICULTIES.map((mode) => (
          <label key={mode} className="difficulty-selector__option">
            <input
              type="radio"
              name="difficulty"
              value={mode}
              checked={value === mode}
              onChange={() => onChange(mode)}
            />
            <span className="difficulty-selector__label">
              {DIFFICULTY_CONFIG[mode].label}
              <small className="difficulty-selector__detail">{describeMode(mode)}</small>
            </span>
          </label>
        ))}
      </fieldset>
    );
  }
  ```

  The selector iterates `DIFFICULTIES`, not the config keys, so appending a mode to `DIFFICULTIES` in v1.2.3 offers it with no change to this file. The `number shown` suffix in `describeMode` is a temporary literal: in v1.2.3 it becomes `c.showShirtNumber ? 'number shown' : 'number hidden'`, and in v1.2.4 it also carries the opponent requirement.

- [ ] **Step 5.4: Verify green.**

  ```bash
  cd frontend && npx vitest run src/components/DifficultySelector.test.tsx 2>&1 | tail -20
  ```

  Expected: `Test Files 1 passed (1)` / `Tests 4 passed (4)`.

- [ ] **Step 5.5: Render it on the page.**

  In `frontend/app/missing-eleven/page.tsx`:

  1. Add the imports:

     ```tsx
     import DifficultySelector from '@/components/DifficultySelector';
     ```

     and pull `setDifficulty` out of the `useGameState()` destructure at lines 18-30.

  2. In the `gameStatus === 'idle'` branch — the same branch that already offers the team pick — render:

     ```tsx
     <DifficultySelector value={state.difficulty} onChange={setDifficulty} />
     ```

     **Above** the existing start control, and do not wire it to `startNewGame`: at this point no game is loaded, so changing the mode must not fetch anything. It sets state, and the start control fetches with whatever mode is current.

  3. Once a game is in play (`gameStatus === 'playing'`), the selector is **not** rendered. Switching mode mid-game would leave shirts with mismatched attempt counts; the mode is chosen before the board loads, which is what §5.1 describes.

- [ ] **Step 5.6: Verify the full frontend suite and the types.**

  ```bash
  cd frontend && npx tsc --noEmit && npm run test 2>&1 | tail -12 && npm run lint 2>&1 | tail -20
  ```

  Expected: `tsc` clean; suite count is the Task 3 count plus 4; no new lint warnings.

- [ ] **Step 5.7: Commit.**

  ```bash
  git add frontend/src/components/DifficultySelector.tsx frontend/src/components/DifficultySelector.test.tsx frontend/app/missing-eleven/page.tsx
  git commit -m "feat(frontend): add the difficulty selector for Easy and Normal"
  ```

---

### Task 6: Show the clue set on the open shirt

**Files:**
- Modify: `frontend/src/components/WordleModal.tsx` (header block)
- Modify: `frontend/src/components/WordleModal.test.tsx`

**Interfaces:**
- Consumes: `availableClues` from `@/lib/shirtBadges`; a new optional `clues?: ShirtClue[]` prop, plus `difficulty?: Difficulty` defaulting to `DEFAULT_DIFFICULTY`.
- Produces: a "Clues" line in the modal header listing the shirt's clues, so Easy and Normal are observably different. v1.0.3's icon badges, if they land later, replace this line and take the clue set from the same prop.

- [ ] **Step 6.1: Write the failing test first.**

  Append to `frontend/src/components/WordleModal.test.tsx`:

  ```tsx
    it('lists the clues the shirt actually has', () => {
      render(
        <WordleModal
          nameLength={5}
          shirtNumber={9}
          position="ST"
          guesses={[]}
          onGuess={() => {}}
          onClose={() => {}}
          difficulty="easy"
          clues={['first-letter', 'scorers', 'captain', 'shirt-number']}
        />,
      );
      expect(screen.getByTestId('modal-clues').textContent).toContain('First letter');
      expect(screen.getByTestId('modal-clues').textContent).toContain('Scorers');
      expect(screen.getByTestId('modal-clues').textContent).toContain('Captain');
    });

    it('omits a clue the shirt does not have', () => {
      render(
        <WordleModal
          nameLength={5}
          shirtNumber={9}
          position="ST"
          guesses={[]}
          onGuess={() => {}}
          onClose={() => {}}
          difficulty="normal"
          clues={['scorers']}
        />,
      );
      const line = screen.getByTestId('modal-clues').textContent ?? '';
      expect(line).toContain('Scorers');
      expect(line).not.toContain('First letter');
      expect(line).not.toContain('Captain');
    });

    it('renders no clue line at all when there are no clues', () => {
      render(
        <WordleModal
          nameLength={5}
          shirtNumber={9}
          position="ST"
          guesses={[]}
          onGuess={() => {}}
          onClose={() => {}}
          difficulty="hard"
          clues={[]}
        />,
      );
      expect(screen.queryByTestId('modal-clues')).toBeNull();
    });
  ```

  Wrap the new cases in `describe('clues', ...)` and add the new props to the existing render helper if the file has one. `data-testid` is used here rather than a role or a text query because the line is presentational and its accessible name would change with every copy edit.

- [ ] **Step 6.2: Verify red.**

  ```bash
  cd frontend && npx vitest run src/components/WordleModal.test.tsx 2>&1 | tail -25
  ```

  Expected: **FAIL** on all three — `clues` and `difficulty` are not in `WordleModalProps`, and `data-testid="modal-clues"` does not exist. If the failures are *type* errors only, note that vitest does not type-check: the red must be a missing element, not a TS error.

- [ ] **Step 6.3: Implement the clue line.**

  In `frontend/src/components/WordleModal.tsx`:

  1. Extend the props interface:

     ```ts
     /** Mode in force, used to label the clue set. Defaults to Normal. */
     difficulty?: Difficulty;
     /** The clues this shirt shows, already resolved by `availableClues`. */
     clues?: ShirtClue[];
     ```

  2. Add the import and a label map, beside `POSITION_LABELS`:

     ```ts
     import { DEFAULT_DIFFICULTY, DIFFICULTY_CONFIG, type Difficulty } from '../lib/difficulty';
     import type { ShirtClue } from '../lib/shirtBadges';

     const CLUE_LABELS: Record<ShirtClue, string> = {
       'first-letter': 'First letter',
       scorers: 'Scorers',
       captain: 'Captain',
       'shirt-number': 'Number',
     };
     ```

  3. In the component signature: `difficulty = DEFAULT_DIFFICULTY, clues = [],` alongside the existing defaults.

  4. In the header, after the position label, render — and nothing at all when `clues` is empty:

     ```tsx
     {clues.length > 0 && (
       <p className="wordle-modal__clues" data-testid="modal-clues">
         <span className="wordle-modal__clues-mode">{DIFFICULTY_CONFIG[difficulty].label}</span>
         {' · '}
         {clues.map((clue) => CLUE_LABELS[clue]).join(', ')}
       </p>
     )}
     ```

- [ ] **Step 6.4: Pass the clues from the page.**

  In `frontend/app/missing-eleven/page.tsx`, at the `<WordleModal>` call site (around line 335), pass the real resolved clue set:

  ```tsx
  difficulty={state.difficulty}
  clues={activeShirt ? availableClues(state.difficulty, activeShirt) : []}
  ```

  **One instruction, and this is it: the real values, never a placeholder.** There is no placeholder variant of this step. A clue line wired to a constant renders `Number` on every shirt in every mode, which is a wrong answer presented confidently — strictly worse than not rendering the line at all.

  **What already exists — do not re-add it.** v1.0.2 froze `LineupPlayer` with four **required, non-null** fields and stated that v1.1 and v1.2 consume them verbatim (`docs/v1/v1.0/plan-v1.0.2-event-persistence.md:16-23`, and the interface block at `:375-390`):

  ```ts
  goals: number;      // 0 when unknown
  assists: number;
  redCards: number;
  isCaptain: boolean;
  ```

  That same file also states, at `:24`, that **there is no null/unknown/provenance flag** and that a nullable variant is a defect. `ShirtData extends LineupPlayer` (`frontend/types/index.ts:79`) and `ShirtGameData extends ShirtData` (`frontend/src/lib/gameState.ts:13`), so **after v1.0.2 `ShirtGameData` already carries `goals` and `isCaptain`** — v1.0.2's `buildLineup` normalises `isCaptain` with `?? false` at the boundary, which is why the `=== true` comparison in `availableClues` is a belt and not a lie. Read `docs/v1/v1.0/plan-v1.0.2-event-persistence.md` before touching the type; do not make `goals` or `isCaptain` optional and do not add `| null` to either. Doing so would break v1.0.3's icon layer, which reads the same fields, and it is the exact degradation rule v1.0.2 froze against.

  **`hasFirstLetter` is the only new field in this step.** It does not exist anywhere today, and it is the one thing the clue policy needs that the lineup payload does not carry. Add it as `hasFirstLetter: boolean` in `frontend/types/index.ts`, set it in v1.0.2's `buildLineup` to `p.name.trim().length > 0` — a player whose Wordle answer is empty has no first letter to give — and default it to `false` in `frontend/lib/mockData.ts` and in the fixtures. That is the whole of the payload work: **one** new field, not three.

  `docs/v1/v1.2/overview.md:205` already anticipated exactly this fork ("its Task 6 either widens the lineup payload or the task is dropped"), and the answer is now settled: the payload is widened by **one** boolean, so Task 6 ships. If that single boolean turns out to require a Prisma column, an endpoint change, or any edit to a field v1.0.2 froze, **stop and ask** rather than widening further — dropping Task 6 remains a legitimate outcome, and the mode selector and the attempt budget are unaffected by it.

- [ ] **Step 6.5: Verify green and run everything.**

  ```bash
  cd frontend && npx vitest run src/components/WordleModal.test.tsx 2>&1 | tail -20
  ```

  Expected: `Test Files 1 passed (1)` / `Tests 21 passed (21)` (18 baseline + 3).

  ```bash
  cd frontend && npx tsc --noEmit && npm run test 2>&1 | tail -12 && npm run lint 2>&1 | tail -20
  cd backend  && npm run test 2>&1 | tail -12
  ```

  Expected: frontend `tsc` clean, the full suite green, and the backend suite **identical to the measurement taken at the start of this patch** — this patch touches no backend file. The pass signal is *unchanged and green*, not a count: the pre-v1.2.1 `13/175` and post-v1.2.1 `13/177` figures both belong to `cda2db0`, and v1.0.1, v1.0.2 and v1.1.1 have landed since, so the real number is already different.

- [ ] **Step 6.6: Commit.**

  ```bash
  git add frontend/src/components/WordleModal.tsx frontend/src/components/WordleModal.test.tsx frontend/types/index.ts frontend/lib/mockData.ts frontend/app/missing-eleven/page.tsx
  git commit -m "feat(frontend): show the resolved clue set when a shirt is open"
  ```

---

### Task 7: Introduce the Finish affordance

**Why here and not in v1.2.4.** The control's only input is
`DIFFICULTY_CONFIG[difficulty].opponentRequired`, a field this patch's Task 1
writes. A control cannot be specified before the data that decides whether it
exists, and writing it in v1.2.4 would mean writing it against a table declared
two patches earlier and never rendered. So: **introduced here**, **confirmed in
v1.2.3** against the third non-Expert mode, and **asserted absent in v1.2.4**
where Expert first needs it (roadmap §5.2, R1).

**In these two modes the control renders nothing.** That is the expected result
of the first three tests below, and a green run with zero rendered buttons is the
correct outcome — not a missing feature. `FINISH_GAME` itself does not exist yet;
it lands in v1.2.4, which is why `onFinish` here is a prop with no dispatcher
behind it.

**Files:**
- Create: `frontend/src/components/FinishButton.tsx`
- Create: `frontend/src/components/FinishButton.test.tsx`
- Modify: `frontend/src/lib/gameState.ts` — add `resolvedShirtCount`
- Modify: `frontend/src/lib/gameState.test.ts` — its tests
- Modify: `frontend/app/missing-eleven/page.tsx` — render the control

**Interfaces:**
- Consumes: `DIFFICULTY_CONFIG`, `type Difficulty` from `@/lib/difficulty` (this patch's Task 1); the existing surrender confirmation's dialog pattern from the page.
- Produces:
  ```tsx
  interface FinishButtonProps {
    difficulty: Difficulty;
    /** Shirts already `correct` or `failed`, across both boards. */
    resolved: number;
    /** Shirts on the board. 22 for a full game, less for a partial lineup. */
    total: number;
    onFinish: () => void;
  }
  ```
  and
  ```ts
  export function resolvedShirtCount(
    target: ShirtGameData[],
    opponent: ShirtGameData[],
  ): number;
  ```

- [ ] **Step 7.1: Write the failing tests first.**

  Append to `frontend/src/lib/gameState.test.ts`:

  ```ts
    describe('resolvedShirtCount', () => {
      it('counts resolved shirts across both boards', () => {
        const target = [
          { ...blank, state: 'correct' as const },
          { ...blank, state: 'failed' as const },
          { ...blank, state: 'default' as const },
        ];
        const opponent = [{ ...blank, state: 'correct' as const }];
        expect(resolvedShirtCount(target, opponent)).toBe(3);
      });

      it('counts zero on an empty board', () => {
        expect(resolvedShirtCount([], [])).toBe(0);
      });
    });
  ```

  Create `frontend/src/components/FinishButton.test.tsx`:

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect, vi } from 'vitest';
  import { render, screen, fireEvent } from '@testing-library/react';
  import { DIFFICULTIES, DIFFICULTY_CONFIG } from '../lib/difficulty';
  import FinishButton from './FinishButton';

  describe('FinishButton', () => {
    it('renders nothing in Easy or Normal, which is the whole point', () => {
      // These are the two offered modes. The opponent is a bonus here, so a
      // visible-but-disabled Finish would be a requirement the game does not have.
      for (const difficulty of ['easy', 'normal'] as const) {
        const { container } = render(
          <FinishButton difficulty={difficulty} resolved={22} total={22} onFinish={() => {}} />,
        );
        expect(container.innerHTML).toBe('');
        expect(screen.queryByRole('button')).toBeNull();
      }
    });

    it('renders a locked control with the unresolved count for a required mode', () => {
      // `expert` is not offered until v1.2.4, but its row is final here, so the
      // control's required case is testable two patches early.
      render(<FinishButton difficulty="expert" resolved={11} total={22} onFinish={() => {}} />);
      const button = screen.getByRole('button') as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(button.textContent).toContain('11 of 22');
    });

    it('unlocks at 22 of 22 and reports the press', () => {
      const onFinish = vi.fn();
      render(<FinishButton difficulty="expert" resolved={22} total={22} onFinish={onFinish} />);
      const button = screen.getByRole('button') as HTMLButtonElement;
      expect(button.disabled).toBe(false);
      fireEvent.click(button);
      expect(onFinish).toHaveBeenCalledTimes(1);
    });

    it('asks for confirmation before reporting the finish', () => {
      // The affordance is a control PLUS a confirmation (roadmap §5.2), not a
      // control. A single click must not complete a game.
      const onFinish = vi.fn();
      render(<FinishButton difficulty="expert" resolved={22} total={22} onFinish={onFinish} />);
      fireEvent.click(screen.getByRole('button'));
      expect(onFinish).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
      expect(onFinish).toHaveBeenCalledTimes(1);
    });

    it('reads the flag, not the mode name', () => {
      for (const difficulty of DIFFICULTIES) {
        const { container } = render(
          <FinishButton difficulty={difficulty} resolved={22} total={22} onFinish={() => {}} />,
        );
        expect(container.innerHTML !== '').toBe(
          DIFFICULTY_CONFIG[difficulty].opponentRequired,
        );
      }
    });
  });
  ```

  The last test is the load-bearing one: it fails against a `difficulty === 'expert'` implementation, and it fails again the moment a fifth mode is added with a different flag value. **The table is the only input.**

- [ ] **Step 7.2: Verify red.**

  ```bash
  cd frontend && npx vitest run src/lib/gameState.test.ts src/components/FinishButton.test.tsx 2>&1 | tail -25
  ```

  Expected: **FAIL** — `resolvedShirtCount` is not exported and `Failed to resolve import "./FinishButton"`.

- [ ] **Step 7.3: Implement the count helper.**

  In `frontend/src/lib/gameState.ts`, directly after `checkGameComplete` (which ends at line 114):

  ```ts
  /** How many shirts are settled, across both boards. Drives the Finish label. */
  export function resolvedShirtCount(
    target: ShirtGameData[],
    opponent: ShirtGameData[],
  ): number {
    return [...target, ...opponent].filter(
      s => s.state === 'correct' || s.state === 'failed',
    ).length;
  }
  ```

- [ ] **Step 7.4: Implement the control.**

  Create `frontend/src/components/FinishButton.tsx`. The affordance is a control plus a confirmation, and the confirmation **reuses the page's existing dialog pattern** — the same one the surrender flow uses for its own confirm. Do not add a route, a page, or a bespoke modal library.

  ```tsx
  'use client';

  import { useState } from 'react';
  import { DIFFICULTY_CONFIG, type Difficulty } from '../lib/difficulty';

  interface FinishButtonProps {
    difficulty: Difficulty;
    /** Shirts already `correct` or `failed`, across both boards. */
    resolved: number;
    /** Shirts on the board. 22 for a full game, less for a partial lineup. */
    total: number;
    onFinish: () => void;
  }

  /** A full game is 11 + 11. Anything less is a partial lineup, which cannot be finished. */
  const FULL_BOARD = 22;

  /**
   * The finish control, for modes whose row says the opponent is required.
   *
   * Two rules, both from the table and never from a mode name:
   *   - `opponentRequired === false` renders NOTHING, not a disabled control. A
   *     permanently disabled Finish in Easy reads as a broken feature, and
   *     worse, as a requirement the game does not have (roadmap §5.2, R1).
   *   - `total === FULL_BOARD` guards the count against a partial lineup being
   *     "finished" by arithmetic.
   *
   * The confirmation is part of the affordance: finishing is irreversible and
   * the reward depends on the resolved count, so the player is asked once.
   *
   * `disabled` is a courtesy. The real gate is `checkGameComplete` inside the
   * reducer (v1.2.4), so a click that slips through the DOM is still refused.
   */
  export default function FinishButton({ difficulty, resolved, total, onFinish }: FinishButtonProps) {
    const [confirming, setConfirming] = useState(false);
    const config = DIFFICULTY_CONFIG[difficulty];

    if (!config.opponentRequired) return null;

    const locked = total !== FULL_BOARD || resolved < FULL_BOARD;

    if (confirming) {
      return (
        <div className="finish" role="group" aria-label="Confirm finish">
          <p className="finish__confirm">
            Finish with {resolved} of {FULL_BOARD} resolved? This cannot be undone.
          </p>
          <button type="button" className="finish__confirm-yes" onClick={onFinish}>
            Confirm
          </button>
          <button type="button" className="finish__confirm-no" onClick={() => setConfirming(false)}>
            Keep playing
          </button>
        </div>
      );
    }

    return (
      <div className="finish">
        <button
          type="button"
          className="finish__button"
          disabled={locked}
          onClick={() => setConfirming(true)}
        >
          {locked ? `Finish — ${resolved} of ${FULL_BOARD} resolved` : 'Finish'}
        </button>
        {locked && (
          <p className="finish__hint">
            In {config.label} the opponent lineup is required. Every shirt on both teams
            must be identified.
          </p>
        )}
      </div>
    );
  }
  ```

  The hint names the mode through `config.label`, never a literal. The early `return null` is a second line of defence behind the page's conditional render; it costs one comparison and makes the component safe to mount unconditionally in a future patch.

- [ ] **Step 7.5: Render it on the page.**

  In `frontend/app/missing-eleven/page.tsx`:

  1. Import `FinishButton` from `@/components/FinishButton` and `resolvedShirtCount` from `@/lib/gameState`.
  2. Next to `const maxAttempts = DIFFICULTY_CONFIG[state.difficulty].attempts;`, add:

     ```tsx
     const resolvedCount = resolvedShirtCount(state.targetShirts, state.opponentShirts);
     ```

  3. In the playing view, render:

     ```tsx
     {state.gameStatus === 'playing' && (
       <FinishButton
         difficulty={state.difficulty}
         resolved={resolvedCount}
         total={state.targetShirts.length + state.opponentShirts.length}
         onFinish={() => {}}
       />
     )}
     ```

     `onFinish` is a no-op **in this patch**: `FINISH_GAME` does not exist until v1.2.4. The control renders nothing in both offered modes, so the stub is unreachable in practice — it exists so the component is wired to the real board and the real count rather than to a placeholder, and v1.2.4 replaces it with `finishGame`. Do not add a `FINISH_GAME` action here; that is v1.2.4's reducer work and duplicating it would put two gates in the codebase.

     The control sits beside the surrender control and **outside** the surrender confirmation flow. It brings its own confirmation, which is its own concern.

- [ ] **Step 7.6: Verify green.**

  ```bash
  cd frontend && npx vitest run src/lib/gameState.test.ts src/components/FinishButton.test.tsx 2>&1 | tail -20
  cd frontend && npx tsc --noEmit && npm run test 2>&1 | tail -12 && npm run lint 2>&1 | tail -20
  ```

  Expected: both files green; `tsc` clean; no new lint warnings. The FinishButton file reports **5 passed**, and the two "renders nothing" cases passing is the correct result for this patch.

- [ ] **Step 7.7: Commit.**

  ```bash
  git add frontend/src/lib/gameState.ts frontend/src/lib/gameState.test.ts frontend/src/components/FinishButton.tsx frontend/src/components/FinishButton.test.tsx frontend/app/missing-eleven/page.tsx
  git commit -m "feat(frontend): add the config-driven Finish control and its confirmation"
  ```

---

## Acceptance criteria

1. `DIFFICULTY_CONFIG` has an entry for each of `easy`, `normal`, `hard`, `expert` matching §5.1 field for field, and `DIFFICULTIES` offers exactly `['easy', 'normal']`.
2. `DEFAULT_DIFFICULTY` is `'normal'`, and `initialState.difficulty === DEFAULT_DIFFICULTY`.
3. `availableClues` returns, per mode: Easy `[first-letter?, scorers?, captain?, shirt-number]`, Normal `[scorers?, captain?, shirt-number]`, Hard/Expert `[shirt-number]` — with `?` meaning "only when the data supports it".
4. `availableClues` never returns a clue derived from `redCards`, in any mode, with or without a red card.
5. A shirt with no event data and no captain row returns `['shirt-number']` in every mode. No throw, no empty array, no error state.
6. The attempt budget is read from `DIFFICULTY_CONFIG[difficulty].attempts` at `gameState.ts:154` and at all three page call sites; `grep -n MAX_ATTEMPTS frontend/app/missing-eleven/page.tsx` returns nothing.
7. `MAX_ATTEMPTS` is still exported, is `6`, and is derived from `DEFAULT_DIFFICULTY` — asserted by a test, not by convention.
8. `SET_DIFFICULTY` is handled by the reducer, leaves shirts and status untouched, and resets to `DEFAULT_DIFFICULTY` on `NEW_GAME`.
9. The selector renders only the shipped modes, is keyboard-reachable as a radio group, reports the chosen mode, and is not reachable once a game is in play.
10. No component test was added outside `frontend/src/`, and every new component test carries `// @vitest-environment jsdom`.
11. `FinishButton` renders **nothing at all** when `opponentRequired` is false — asserted for `easy` and `normal` at `resolved={22}` and by a property test over `DIFFICULTIES` — and a locked control with its unresolved count when the flag is true. No mode name is compared anywhere in it.
12. The Finish affordance is a control **plus a confirmation**: one click on `Finish` does not call `onFinish`; confirming does. It reuses the existing dialog pattern, adds no route and no screen (roadmap §5.2).
13. `onFinish` is a documented no-op in this patch; no `FINISH_GAME` action exists, and `checkGameComplete` is untouched.
14. Frontend: full suite green, `tsc` clean, `lint` clean. Backend: unchanged and green.
15. Reverting this patch alone returns the app to v1.2.1 behaviour, which is identical to pre-patch except that revealed names now land on the right shirt.

## Validation

| Check | Command | Pass signal |
|---|---|---|
| Mode table | `cd frontend && npx vitest run src/lib/difficulty.test.ts` | `7 passed (7)` |
| Clue policy | `cd frontend && npx vitest run src/lib/shirtBadges.test.ts` | `9 passed (9)` when this patch created the file; **`16 passed (16)`** when it appended to v1.0.3's — never fewer than either |
| State + hook | `cd frontend && npx vitest run src/lib/gameState.test.ts src/lib/gameState.hook.test.ts` | no failures |
| Selector | `cd frontend && npx vitest run src/components/DifficultySelector.test.tsx` | `4 passed (4)` |
| Clue line | `cd frontend && npx vitest run src/components/WordleModal.test.tsx` | `21 passed (21)` |
| Finish control (Task 7) | `cd frontend && npx vitest run src/components/FinishButton.test.tsx` | `5 passed (5)`; the two "renders nothing" cases passing is the correct result here |
| Full frontend | `cd frontend && npm run test` | every file green; count recorded, not assumed |
| Types | `cd frontend && npx tsc --noEmit` | no output |
| Lint | `cd frontend && npm run lint` | no output |
| No constant left in the page | `grep -n "MAX_ATTEMPTS" frontend/app/missing-eleven/page.tsx` | no output |
| No mode-name branching in components | `grep -rn "=== 'easy'\|=== 'normal'\|=== 'hard'\|=== 'expert'" frontend/components frontend/src/components frontend/app` | no output |
| Finish reads the flag | `grep -n "opponentRequired" frontend/src/components/FinishButton.tsx` | hits only, with no `=== 'expert'` beside them |
| No premature gate | `grep -rn "FINISH_GAME" frontend/src` | no output — that action is v1.2.4's |
| Backend untouched | `cd backend && npm run test` | every file green; count measured and recorded, not asserted |
| New test location | `find frontend/components -name "*.test.*"` | unchanged by this patch |

## Risks

| Risk | Mitigation |
|---|---|
| **A config field gets a typo'd name in one consumer and silently reads `undefined`.** `DIFFICULTY_CONFIG[mode].attemps` would be `undefined`, and `attempts >= undefined` is `false`, so the attempt limit would never trip. | `tsc` catches it: the type is `DifficultyConfig`, not an index signature. Keep the type explicit — do not widen it to `Record<string, ...>`. |
| **All four modes exist in the config, so it is tempting to offer all four.** | `DIFFICULTIES` is the offer list and a test asserts its exact contents. The distinction is named in both the module and the overview. |
| **Task 6's wiring needs one field the lineup payload does not carry** (`hasFirstLetter`), and a placeholder substituted for it would render a clue line that is always `Number`. | The placeholder variant is removed from the plan: Step 6.4 has exactly one instruction (pass the real values) and states that `goals` and `isCaptain` already exist as required non-null fields, so the only payload work is the single boolean. A test asserts the clue line renders `Scorers` and `Captain` for a shirt that has the data, which fails loudly under a placeholder. Dropping Task 6 stays a legitimate outcome, and the mode selector and the attempt budget are unaffected by it. |
| **`shirt-number` is returned in Hard and Expert**, which reads as a contradiction. | Documented at the implementation site, and covered by the Hard/Expert test. It means "the number exists in the data", not "show it"; v1.2.3 masks it at render time. |
| **A mode switch mid-game** would leave shirts under two different attempt budgets. | The selector is not rendered once `gameStatus === 'playing'`, and `SET_DIFFICULTY` is a no-op on the shirts by construction — asserted by the "leaves the board and the shirts untouched" test. |
| **v1.0.3 may already own `shirtBadges.ts` and its test**, and creating either file here would clobber it — silently deleting 7 passing tests, because the suite would still be green. | Task 2 Step 2.0 is a precondition that branches on the file's presence; Steps 2.1 and 2.3 **append** in the merge case and never overwrite; Step 2.4 states the union count (`16`) explicitly so a `9` is visible as a regression rather than read as the expected value. |
| **The Finish control ships dead in this patch** — it renders nothing in both offered modes, and its `onFinish` is a stub. A reviewer may read that as unfinished work. | It is the ratified sequencing (§5.2): introduced here because the table that drives it is here, confirmed in v1.2.3, asserted in v1.2.4. The `onFinish` stub is deliberately a no-op rather than an early `FINISH_GAME`, because two completion gates in the codebase is worse than one arriving a patch late. The 5 passing tests make it verified code, not scaffolding. |

**Escalate before proceeding if:** adding `hasFirstLetter` turns out to require a Prisma column, an endpoint change, or any edit to a field v1.0.2 froze — Task 6's single new boolean is the whole permitted widening. Also escalate if `shirtBadges.ts` exists with a conflicting `availableClues` export. Both change the shape of this patch and neither is a decision to make silently.
