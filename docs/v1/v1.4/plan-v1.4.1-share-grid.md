# Share Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a completed Missing Eleven result as a shareable text block — one emoji slot per shirt in scope for that result, plus the mode and the score — and show it in the game-over dialog, with no clipboard behaviour anywhere in this patch.

**Architecture:** One new pure module, `frontend/src/lib/shareGrid.ts`, owns the whole share contract: it decides scope, ordering and glyphs, and it renders the block and the composed text. It has no React and no DOM, so it is testable in the default `node` environment and reusable from anywhere. `GameComplete.tsx` becomes a consumer: it derives one `opponentAttempted` boolean, calls `buildShareGrid`, and drops the returned text into a selectable `<pre>`. The mode table is read, never branched on, so the block cannot drift from the mode it describes. The position-order table is extracted out of `GameComplete.tsx` into `frontend/src/lib/positionOrder.ts` first, so the dialog and the share grid provably order shirts identically instead of keeping two copies of the same map.

**Tech Stack:** TypeScript, Next 16 / React 19, Vitest + `@testing-library/react` (frontend).

---

## Global Constraints

- **The shape is "one slot per shirt in scope for that result", not a fixed 11.** 11 is a special case of the rule, not the definition of the block (roadmap §7). The three cases:

  | Case | Slots | Why |
  |---|---|---|
  | Easy / Normal / Hard, opponent not attempted | 11 | The opponent half is out of scope for that result |
  | Easy / Normal / Hard, opponent attempted | 22 | The opponent half is in scope and renders alongside the target half |
  | Expert | 22, always | Finish stays locked until all 22 are resolved (§5.2), so an Expert result cannot end at 11 |

  **Score and mode are carried in all three cases** — the mode is what makes the score comparable (§6.2). A grid with no slots still renders its tally line.

- **Un-resolved slots are rendered, never omitted** (roadmap §7). A slot belongs to the grid once its shirt is in scope; what varies is whether that shirt was resolved, not whether the grid has a place for it.

- **The frozen interface is closed.** `frontend/src/lib/shareGrid.ts` exports exactly these, with these names, in this order. Do not add, remove, rename or re-order a field, and do not add a fourth exported function:

  ```ts
  export type SlotOutcome = 'correct' | 'failed';

  export interface ShareSlot {
    team: 'target' | 'opponent';
    state: SlotOutcome;
    shirtNumber: number | null;
  }

  export interface ShareGridInput {
    targetShirts: ShirtGameData[];
    opponentShirts: ShirtGameData[];
    difficulty: Difficulty;
    opponentAttempted: boolean;
    score: number;
  }

  export interface ShareGrid {
    slots: ShareSlot[];
    score: number;
    difficulty: Difficulty;
  }

  export function buildShareGrid(input: ShareGridInput): ShareGrid;
  export function renderShareGrid(grid: ShareGrid): string;
  export function renderShareText(grid: ShareGrid, link: string | null): string;
  ```

  `renderShareText` ships in this patch even though only `renderShareGrid` is wired to the UI. The composed text is the contract that v1.4.2 copies, and the alternative — a v1.4.2 commit that changes v1.4.1's frozen module — would break this patch's rollback point. An export that is not yet called from a component is not dead code when a later patch in the same line is contractually required to call it.

- **Two glyphs, not three.** `🟩` (`U+1F7E9`) is a correct shirt; `⬛` (`U+2B1B`) is everything else. **There is no `🟨`**, and that is a decision, not an omission. A third glyph would imply a third outcome the game does not have, and `SlotOutcome` is frozen to two values, so a yellow slot would have to be a *failed* slot wearing a colour that claims "close". Worse, it would make an 11-slot Easy result visually indistinguishable in kind from a 22-slot Expert result — exactly the confusion the mode label exists to prevent (§7). `⬛` is also the honest rendering of "this shirt did not get solved", and it is legible in the same way a solved square is: the block is a fixed-emoji monospace grid, so both rows align regardless of the glyph's ink coverage.

- **Non-terminal shirt states map to `failed`, not to a throw and not to an omission.** `ShirtState` is `'default' | 'in-progress' | 'correct' | 'failed'`, so `buildShareGrid` receives states that are neither terminal. It claims `correct` only for `'correct'` and everything else is `failed`. Throwing would let a refactor that surfaces the grid mid-game take down the dialog; omitting would violate the "never omitted" rule above.

- **Scope is read from `DIFFICULTY_CONFIG`, never from a mode name.** The opponent half is in scope when `DIFFICULTY_CONFIG[difficulty].opponentRequired` is true (Expert, today) **or** when the caller passes `opponentAttempted: true`. v1.2.2's constraint is that the mode table is data and is the only place a mode name is compared; a `difficulty === 'expert'` comparison here would break that and would silently mis-handle any future mode that also requires the opponent. A test asserts the property over the table, not over one mode.

- **`opponentAttempted` is derived, not stored.** `GameComplete` passes `opponentShirts.some((shirt) => shirt.attempts > 0)`. This is the whole point of the flag: a surrendered game in Normal has 11 target slots and an opponent half that exists but was never touched, and `state !== 'default'` would misclassify it as a 22-slot game the player did not play. Deriving it from the shirts means it cannot go stale, needs no reducer change, and needs no `GameState` field.

- **The slot count is whatever the caller passed in.** `buildShareGrid` counts the shirts it is given. It does not pad to 11, does not truncate to 11, and does not special-case the length. The 11/22 in the table above is what the real call sites produce, not something the renderer enforces — a three-shirt half yields three slots, and a test pins that so a future "always pad to 11" change fails loudly.

- **Ordering comes from the shared position table, extracted first.** `POSITION_ORDER`, `getPositionLabel` and a new `compareShirtPosition` live in `frontend/src/lib/positionOrder.ts`. `GameComplete.tsx` imports them; it no longer declares its own copy. Ties keep input order (`Array.prototype.sort` is stable), which is what the dialog does today and what the share grid must match — an emoji row whose order disagrees with the list above it is a bug a reader will see immediately.

- **The share score is a raw integer, already multiplied once.** The dialog formats its own display total with `toLocaleString('en-US')`; the share block uses the unformatted `scoreBreakdown.grandTotal`. `1,234` in a share text is three characters wider than `1234`, which breaks monospace alignment on the tally line, and the recipient parses the number, not the punctuation. **The multiplier is applied by the scorer, not by the share grid**: v1.2.5's invariant is that `grandTotal` is the sum of already-scaled line items, so the tally line pairs the mode's multiplier with a total that already includes it. Nothing in `shareGrid.ts` may multiply by `multiplier` again — it reads the value only to print it, next to the label that makes the number interpretable.

- **No React and no DOM in `shareGrid.ts`.** Its only imports are `./difficulty` (pure data) and `./positionOrder` (pure data), plus type-only imports of `Difficulty` and `ShirtGameData`. The task that creates it ends with a grep proving there is no `react` import and no `document`/`window` reference, because a component-shaped helper here is what forces the v1.4.2 clipboard work into the same module and breaks the rollback point.

- **v1.3 ships before v1.4** (roadmap §11 rule 6). The block carries a mode, and a mode alone makes a score ambiguous across difficulties; v1.3 supplies the daily puzzle whose `?daily=` link is the only stable, replayable link. Task 0 verifies v1.3 landed and does not proceed otherwise.

- **v1.4 touches no `localStorage`.** All of it belongs to v1.3.2 (roadmap §11 rule 8), which owns the entire storage surface so hydration has exactly one blast radius. No read, no write, no key.

- **v1.4 does not widen the vitest include and does not touch `vitest.config.ts`.** R7 (roadmap §8) assigns the widening — and the deletion of the shadowing `frontend/vitest.config.mts` — to v1.1.1, deliberately before the UI-heavy patches that rely on component coverage. Task 0 verifies that already happened. If the include is still `src/**` only, **stop and escalate**; do not fix it here, and do not re-narrow it either.

- **No backend change.** No Prisma column, no migration, no endpoint, no new seed. The backend's 95% coverage gate (`backend/vitest.config.ts:26-30`) is unaffected and must still pass. The frontend has no coverage gate and none is added.

- **No identifier is renamed.** `ShirtState`, `ShirtGameData`, `GameState.difficulty`, `DIFFICULTY_CONFIG`, `opponentRequired`, `label`, `multiplier`, `computeTotalScore`, `grandTotal`, and every v1.3 URL/filter/daily export are consumed as they stand. `GameComplete` gains an optional `difficulty` prop, which v1.2.5 already specifies; it defaults so the existing tests and call sites keep compiling.

- **TDD applies to every task with production code.** Red first, with the expected failure quoted, then green, then refactor. New component tests live in `frontend/src/components/` and carry `// @vitest-environment jsdom`, because the global environment is `node`. New lib tests need no pragma.

- **Regression commands, run at every task boundary:**

  ```bash
  cd frontend && npm test
  cd backend && npm test
  ```

  Expected after this patch, in order: `Test Files 11 passed (11)` / `Tests 189 passed (189)` for the frontend (up from 9/173 — 2 new files, 16 new tests), and the backend unchanged at `13 passed` / `175 passed`. Any other number means something was deleted or a file stopped being collected; see the R7 note in Task 0.

---

## Task 1: Preflight — confirm the upstream contracts landed

**Files:** read-only. Nothing is created or modified in this task, and there is no commit.

**Interfaces:**
- Consumes: nothing. Reads the filesystem and the roadmap only.
- Produces: nothing. This task exists to fail loudly before any code is written.

- [ ] **Step 1.1: Confirm `DIFFICULTY_CONFIG` exists with the fields this patch reads.**

  ```bash
  cd frontend && npm test -- src/lib/difficulty.test.ts
  ```

  Expected: the file exists and passes, with the §5.1 table asserted row by row — `easy` `{attempts: 6, multiplier: 0.5, opponentRequired: false, label: 'Easy'}`, `normal` `{…, multiplier: 1, opponentRequired: false, label: 'Normal'}`, `hard` `{…, multiplier: 2, opponentRequired: false, label: 'Hard'}`, `expert` `{attempts: 3, multiplier: 3, opponentRequired: true, label: 'Expert'}`.

  If `src/lib/difficulty.test.ts` is missing, v1.2.2 has not shipped. **Stop and escalate:** this patch has no mode table to read and inventing one here would fork the contract.

- [ ] **Step 1.2: Confirm the v1.2.5 score contract is in place.**

  ```bash
  cd frontend && grep -n "multiplier" src/lib/scoring.ts
  ```

  Expected: `scorePlayer` and `computeTotalScore` each take `multiplier: number = 1` as a fifth parameter, and `PerPlayerScore` carries a `multiplier` field. `GameComplete.tsx` passes a `difficulty` prop and `page.tsx` forwards it to both `computeTotalScore` call sites and to `GameComplete`.

  If absent, v1.2.5 has not shipped. **Stop and escalate** — the tally line would then be showing a multiplier that is not in the score, which is worse than showing nothing.

- [ ] **Step 1.3: Confirm `ShirtState` still has exactly four members.**

  ```bash
  cd frontend && grep -n "type ShirtState" types/index.ts
  ```

  Expected: `export type ShirtState = 'default' | 'in-progress' | 'correct' | 'failed';`. If a member was added, the `failed` fallback in `buildShareGrid` may need rethinking — re-read the decision above before changing anything.

- [ ] **Step 1.4: Confirm v1.3 landed and the include was already widened (roadmap §11 rule 6, R7).**

  ```bash
  cd frontend && ls src/lib/ && grep -n "include" vitest.config.ts && ls vitest.config.mts 2>&1
  ```

  Expected: `difficulty.ts`, `filterParams.ts` and `daily.ts` all exist; the surviving config's `include` covers `frontend/components/**` as well as `src/**`; and `vitest.config.mts` is **gone** (v1.1.1 deleted it so there is one source of truth).

  If the include is still `src/**` only, or if both config files still exist, **stop and escalate.** Do not widen it here and do not delete the file here. R7 names v1.1.1 as the owner, and its budget note records that the first run after widening may surface a pre-existing failure in `frontend/components/Shirt.colors.test.tsx` — that failure belongs to v1.1.1, not to this patch.

- [ ] **Step 1.5: Record the baseline.**

  ```bash
  cd frontend && npm test
  cd ../backend && npm test
  ```

  Expected: every test file passes, and no failure is present in `frontend/components/Shirt.colors.test.tsx`. If one is, that is an unfixed v1.1.1 item: **stop and escalate** rather than absorbing it into v1.4.

- [ ] **Step 1.6: Confirm the clean tree.**

  ```bash
  git status --short
  ```

  Expected: no modified file in `frontend/` or `backend/`. Untracked `docs/v1/**` is fine.

---

## Task 2: Extract the position table into its own module

The share grid and the dialog must order shirts identically. Rather than copy `POSITION_ORDER` into a second file and trust the copies to match, the table is extracted first and both consumers import it.

**Files:**
- Create: `frontend/src/lib/positionOrder.ts`
- Create: `frontend/src/lib/positionOrder.test.ts`
- Modify: `frontend/src/components/GameComplete.tsx` (remove the `POSITION_ORDER` const and the `getPositionLabel` function, add one import — located **by name, not by line range**: see Step 2.5)

**Interfaces:**
- Produces:

  ```ts
  // frontend/src/lib/positionOrder.ts
  export const POSITION_ORDER: Record<string, number>;
  export function getPositionLabel(position: string | null): string;
  export function compareShirtPosition(
    a: { position: string | null },
    b: { position: string | null },
  ): number;
  ```

  `compareShirtPosition` is the comparator currently inlined at `GameComplete.tsx:131`. Unknown and missing positions compare as `99`, so they sort last while keeping their relative input order.

- [ ] **Step 2.1: Write the failing test first.**

  Create `frontend/src/lib/positionOrder.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import { POSITION_ORDER, getPositionLabel, compareShirtPosition } from './positionOrder';

  describe('compareShirtPosition', () => {
    it('orders a goalkeeper before a centre-forward', () => {
      expect(compareShirtPosition({ position: 'GK' }, { position: 'ST' })).toBeLessThan(0);
    });

    it('orders a centre-forward after a winger', () => {
      expect(compareShirtPosition({ position: 'ST' }, { position: 'LW' })).toBeGreaterThan(0);
    });

    it('orders back-line roles left to right', () => {
      const sorted = ['RB', 'GK', 'CB', 'LB']
        .map((position) => ({ position }))
        .sort(compareShirtPosition)
        .map((shirt) => shirt.position);
      expect(sorted).toEqual(['GK', 'CB', 'LB', 'RB']);
    });

    it('sorts an unknown position last', () => {
      const sorted = ['ST', 'Sweeper', 'Wizard', 'GK']
        .map((position) => ({ position }))
        .sort(compareShirtPosition)
        .map((shirt) => shirt.position);
      expect(sorted).toEqual(['GK', 'Sweeper', 'ST', 'Wizard']);
    });

    it('sorts a missing position last', () => {
      const sorted = ['ST', 'GK', null]
        .map((position) => ({ position }))
        .sort(compareShirtPosition)
        .map((shirt) => shirt.position);
      expect(sorted).toEqual(['GK', 'ST', null]);
    });

    it('returns 0 for two shirts in the same role, so input order is kept', () => {
      expect(compareShirtPosition({ position: 'CM' }, { position: 'CM' })).toBe(0);
    });

    it('gives every known abbreviation a rank below the unknown rank', () => {
      const unknownRank = POSITION_ORDER['Wizard'];
      expect(unknownRank).toBeUndefined();
      for (const rank of Object.values(POSITION_ORDER)) {
        expect(rank).toBeLessThan(99);
      }
    });
  });

  describe('getPositionLabel', () => {
    it('returns the abbreviation unchanged when it has a label', () => {
      expect(getPositionLabel('GK')).toBe('GK');
      expect(getPositionLabel('RWB')).toBe('RWB');
    });

    it('renders CF as the striker label', () => {
      expect(getPositionLabel('CF')).toBe('ST');
    });

    it('falls back to the raw position when it has no label', () => {
      expect(getPositionLabel('Sweeper')).toBe('Sweeper');
    });

    it('renders ? for a missing position', () => {
      expect(getPositionLabel(null)).toBe('?');
      expect(getPositionLabel('')).toBe('?');
    });
  });
  ```

- [ ] **Step 2.2: Run it and watch it fail.**

  ```bash
  cd frontend && npm test -- src/lib/positionOrder.test.ts
  ```

  Expected: **FAIL** — `Failed to resolve import "./positionOrder" from "src/lib/positionOrder.test.ts"`. The module does not exist yet.

- [ ] **Step 2.3: Write the module.**

  Create `frontend/src/lib/positionOrder.ts`:

  ```ts
  /**
   * Row order for lineup positions. Unknown and missing positions compare as
   * 99 so they sort last, which is what the game-over list has always done.
   *
   * Lives in its own module because two consumers need the same order and a
   * share block whose order disagrees with the list above it reads as a bug:
   * the share grid and the game-over table both import this.
   */
  export const POSITION_ORDER: Record<string, number> = {
    // Goalkeeper
    'Goalkeeper': 0, 'GK': 0,
    // Defenders
    'Centre-Back': 10, 'CB': 10,
    'Left-Back': 11, 'LB': 11,
    'Right-Back': 12, 'RB': 12,
    'Defender': 15, 'Sweeper': 15,
    // Midfielders
    'Defensive Midfield': 20, 'DM': 20,
    'Central Midfield': 21, 'CM': 21,
    'Attacking Midfield': 22, 'AM': 22, 'CAM': 22,
    'Midfield': 23,
    'Left Midfield': 24, 'LM': 24,
    'Right Midfield': 25, 'RM': 25,
    // Forwards
    'Left Winger': 30, 'LW': 30, 'LWB': 30,
    'Right Winger': 31, 'RW': 31, 'RWB': 31,
    'Second Striker': 32,
    'Centre-Forward': 33, 'ST': 33, 'CF': 34,
    'Attack': 35,
  };

  /**
   * Comparator over the two fields the order depends on, so a full shirt object
   * can be handed to `Array.prototype.sort` without a wrapper lambda. Ties
   * return 0 and `sort` is stable, so same-role shirts keep input order.
   */
  export function compareShirtPosition(
    a: { position: string | null },
    b: { position: string | null },
  ): number {
    return (POSITION_ORDER[a.position ?? ''] ?? 99) - (POSITION_ORDER[b.position ?? ''] ?? 99);
  }

  /** Display label for a position. `CF` renders as the striker label. */
  export function getPositionLabel(position: string | null): string {
    const labels: Record<string, string> = {
      GK: 'GK',
      CB: 'CB',
      LB: 'LB',
      RB: 'RB',
      LWB: 'LWB',
      RWB: 'RWB',
      DM: 'DM',
      CM: 'CM',
      AM: 'AM',
      CAM: 'CAM',
      LM: 'LM',
      RM: 'RM',
      LW: 'LW',
      RW: 'RW',
      ST: 'ST',
      CF: 'ST',
    };
    return position ? labels[position] ?? position : '?';
  }
  ```

- [ ] **Step 2.4: Verify green.**

  ```bash
  cd frontend && npm test -- src/lib/positionOrder.test.ts
  ```

  Expected: `Test Files 1 passed (1)` / `Tests 11 passed (11)`.

- [ ] **Step 2.5: Point `GameComplete.tsx` at the shared module and delete its copy.**

  In `frontend/src/components/GameComplete.tsx`, delete the whole `POSITION_ORDER` const and the whole `getPositionLabel` function, then add this import next to the existing `@/lib/scoring` imports.

  **Locate the two declarations by name, not by line number.** On `cda2db0` they sit at lines 50–93, immediately after `getNameColor` and immediately before the `GameComplete` component — that is the shape to look for, and `grep -n 'POSITION_ORDER\|getPositionLabel' frontend/src/components/GameComplete.tsx` will find them wherever they now are. **Do not use `50–93` as a range:** v1.2.5 runs before this patch and inserts a `difficulty` prop and a `../lib/difficulty` import into this same file, both above `POSITION_ORDER`, so by the time you are here the block starts several lines lower. A stale range would either leave the copy behind (a duplicate position table, the exact bug this task exists to remove) or delete four lines of someone else's code.

  ```ts
  import { compareShirtPosition, getPositionLabel } from '@/lib/positionOrder';
  ```

  Then replace the inlined sort at what is now around line 131 —

  ```ts
  .sort((a, b) => (POSITION_ORDER[a.position ?? ''] ?? 99) - (POSITION_ORDER[b.position ?? ''] ?? 99))
  ```

  — with:

  ```ts
  .sort(compareShirtPosition)
  ```

  `POSITION_ORDER` is no longer referenced anywhere in the component, so do not import it.

- [ ] **Step 2.6: Verify the refactor changed no behaviour.**

  ```bash
  cd frontend && npm test -- src/components/GameComplete.test.tsx src/lib/positionOrder.test.ts
  ```

  Expected: `Test Files 2 passed (2)` / `Tests 28 passed (28)` — the 17 pre-existing `GameComplete` tests plus the 11 new ones. The three sorting tests in `GameComplete.test.tsx` ("sorts player rows by position order", "sorts unknown positions last", "renders position labels with fallbacks for unknown and missing positions") are the ones that would catch a bad extraction.

- [ ] **Step 2.7: Full regression.**

  ```bash
  cd frontend && npm test
  cd ../backend && npm test
  ```

  Expected: frontend `Test Files 10 passed (10)` / `Tests 184 passed (184)`; backend unchanged at `13 passed` / `175 passed`.

- [ ] **Step 2.8: Commit.**

  ```bash
  git add frontend/src/lib/positionOrder.ts frontend/src/lib/positionOrder.test.ts frontend/src/components/GameComplete.tsx
  git commit -m "refactor(frontend): extract the position order into a shared module"
  ```

---

## Task 3: `buildShareGrid` — scope, order and outcome

**Files:**
- Create: `frontend/src/lib/shareGrid.ts`
- Create: `frontend/src/lib/shareGrid.test.ts`

**Interfaces:**
- Consumes: `POSITION_ORDER` and `compareShirtPosition` from `./positionOrder` (Task 2); `DIFFICULTY_CONFIG` and `type Difficulty` from `./difficulty`; `type ShirtGameData` from `./gameState` (type-only).
- Produces: the frozen block from Global Constraints — `SlotOutcome`, `ShareSlot`, `ShareGridInput`, `ShareGrid`, `buildShareGrid`. `renderShareGrid` and `renderShareText` are declared in Task 4; the module is complete only after Task 4, so Task 3 must not export them yet.

- [ ] **Step 3.1: Write the failing test first.**

  Create `frontend/src/lib/shareGrid.test.ts`. This file covers the whole module, so it is written in full now and Task 4 extends it:

  ```ts
  import { describe, it, expect } from 'vitest';
import { DIFFICULTY_CONFIG, type Difficulty } from './difficulty';
  import { buildShareGrid, renderShareGrid, renderShareText } from './shareGrid';
  import type { ShareGridInput } from './shareGrid';
  import type { ShirtGameData } from './gameState';
  import type { ShirtState } from '@/types';

  // --- Fixtures ---

  function makeShirt(overrides: Partial<ShirtGameData> & { token: string }): ShirtGameData {
    return {
      nameLength: 5,
      wordBoundaries: [],
      shirtNumber: 0,
      position: null,
      coords: { x: 50, y: 50 },
      state: 'default',
      attempts: 0,
      guessHistory: [],
      correctLetters: [],
      ...overrides,
    };
  }

  /**
   * Eleven shirts, deliberately stored out of position order — ST, GK, CB, CM,
   * RB, LW, DM, LB, RW, RM, null — so every test that uses this half also
   * exercises the sort. Five correct, six failed.
   */
  const MIXED: ReadonlyArray<[number, string | null, ShirtState]> = [
    [9, 'ST', 'correct'],
    [1, 'GK', 'correct'],
    [4, 'CB', 'failed'],
    [6, 'CM', 'correct'],
    [2, 'RB', 'failed'],
    [10, 'LW', 'failed'],
    [8, 'DM', 'correct'],
    [3, 'LB', 'failed'],
    [7, 'RW', 'failed'],
    [5, 'RM', 'failed'],
    [11, null, 'correct'],
  ];

  /** The mixed half in position order: 1, 4, 3, 2, 8, 6, 5, 10, 7, 9, 11. */
  const MIXED_ORDER = [1, 4, 3, 2, 8, 6, 5, 10, 7, 9, 11];

  function mixedHalf(prefix: string): ShirtGameData[] {
    return MIXED.map(([shirtNumber, position, state], index) =>
      makeShirt({ token: `${prefix}-${index}`, shirtNumber, position, state })
    );
  }

  function uniformHalf(prefix: string, state: ShirtState): ShirtGameData[] {
    return MIXED.map(([shirtNumber, position], index) =>
      makeShirt({ token: `${prefix}-${index}`, shirtNumber, position, state })
    );
  }

  function makeInput(overrides: Partial<ShareGridInput> = {}): ShareGridInput {
    return {
      targetShirts: mixedHalf('t'),
      opponentShirts: mixedHalf('o'),
      difficulty: 'normal',
      opponentAttempted: false,
      score: 8300,
      ...overrides,
    };
  }

  function countTeam(grid: ReturnType<typeof buildShareGrid>, team: 'target' | 'opponent'): number {
    return grid.slots.filter((slot) => slot.team === team).length;
  }

  describe('buildShareGrid', () => {
    it('scopes the opponent half out when the opponent was not attempted', () => {
      const grid = buildShareGrid(makeInput({ difficulty: 'normal', opponentAttempted: false }));
      expect(grid.slots).toHaveLength(11);
      expect(countTeam(grid, 'target')).toBe(11);
      expect(countTeam(grid, 'opponent')).toBe(0);
    });

    it('scopes the opponent half in when the opponent was attempted', () => {
      const grid = buildShareGrid(makeInput({ difficulty: 'hard', opponentAttempted: true }));
      expect(grid.slots).toHaveLength(22);
      expect(countTeam(grid, 'target')).toBe(11);
      expect(countTeam(grid, 'opponent')).toBe(11);
    });

    it.each(['easy', 'normal', 'hard'] as const)(
      'scopes the opponent half out in %s mode when the opponent was not attempted',
      (difficulty) => {
        const grid = buildShareGrid(makeInput({ difficulty, opponentAttempted: false }));
        expect(grid.slots).toHaveLength(11);
      }
    );

    it('scopes the opponent half in for expert even when the opponent was never attempted', () => {
      const grid = buildShareGrid(makeInput({ difficulty: 'expert', opponentAttempted: false }));
      expect(grid.slots).toHaveLength(22);
      expect(countTeam(grid, 'opponent')).toBe(11);
    });

    it('scopes the opponent half in for every mode that requires it, not just expert', () => {
      const required = (Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).filter(
        (mode) => DIFFICULTY_CONFIG[mode].opponentRequired
      );
      expect(required.length).toBeGreaterThan(0);
      for (const mode of required) {
        const grid = buildShareGrid(makeInput({ difficulty: mode, opponentAttempted: false }));
        expect(grid.slots).toHaveLength(22);
      }
    });

    it('puts the target half before the opponent half, each in position order', () => {
      const grid = buildShareGrid(makeInput({ difficulty: 'hard', opponentAttempted: true }));
      expect(grid.slots.map((slot) => slot.shirtNumber)).toEqual([...MIXED_ORDER, ...MIXED_ORDER]);
      expect(grid.slots.slice(0, 11).every((slot) => slot.team === 'target')).toBe(true);
      expect(grid.slots.slice(11).every((slot) => slot.team === 'opponent')).toBe(true);
    });

    it('maps a correct shirt to correct and every other state to failed', () => {
      const grid = buildShareGrid(
        makeInput({
          targetShirts: [
            makeShirt({ token: 'a', shirtNumber: 1, state: 'correct' }),
            makeShirt({ token: 'b', shirtNumber: 2, state: 'failed' }),
            makeShirt({ token: 'c', shirtNumber: 3, state: 'default' }),
            makeShirt({ token: 'd', shirtNumber: 4, state: 'in-progress' }),
          ],
          opponentShirts: [],
          opponentAttempted: false,
        })
      );
      expect(grid.slots.map((slot) => slot.state)).toEqual(['correct', 'failed', 'failed', 'failed']);
    });

    it('keeps a null shirt number as null rather than substituting one', () => {
      const grid = buildShareGrid(
        makeInput({
          targetShirts: [makeShirt({ token: 'a', shirtNumber: null, state: 'failed' })],
          opponentShirts: [],
          opponentAttempted: false,
        })
      );
      expect(grid.slots[0].shirtNumber).toBeNull();
    });

    it('emits one slot per shirt given, never a fixed eleven', () => {
      const grid = buildShareGrid(
        makeInput({
          targetShirts: [
            makeShirt({ token: 'a', shirtNumber: 1, position: 'GK', state: 'correct' }),
            makeShirt({ token: 'b', shirtNumber: 2, position: 'CB', state: 'failed' }),
            makeShirt({ token: 'c', shirtNumber: 3, position: 'ST', state: 'failed' }),
          ],
          opponentShirts: [],
          opponentAttempted: false,
        })
      );
      expect(grid.slots).toHaveLength(3);
    });

    it('renders zero slots for an empty lineup in both scope cases', () => {
      const normal = buildShareGrid(
        makeInput({ targetShirts: [], opponentShirts: [], difficulty: 'normal' })
      );
      expect(normal.slots).toHaveLength(0);
      const expert = buildShareGrid(
        makeInput({ targetShirts: [], opponentShirts: [], difficulty: 'expert' })
      );
      expect(expert.slots).toHaveLength(0);
    });

    it('carries the score and difficulty through unchanged', () => {
      const grid = buildShareGrid(makeInput({ difficulty: 'expert', score: 19800 }));
      expect(grid.score).toBe(19800);
      expect(grid.difficulty).toBe('expert');
    });

    it('does not mutate the caller arrays', () => {
      const targetShirts = mixedHalf('t');
      const before = targetShirts.map((shirt) => shirt.token);
      buildShareGrid(makeInput({ targetShirts, difficulty: 'hard', opponentAttempted: true }));
      expect(targetShirts.map((shirt) => shirt.token)).toEqual(before);
    });
  });
  ```

- [ ] **Step 3.2: Run it and watch it fail.**

  ```bash
  cd frontend && npm test -- src/lib/shareGrid.test.ts
  ```

  Expected: **FAIL** — `Failed to resolve import "./shareGrid" from "src/lib/shareGrid.test.ts"`. The module does not exist yet.

- [ ] **Step 3.3: Write the module.**

  Create `frontend/src/lib/shareGrid.ts`. It is written with only the `buildShareGrid` half; Task 4 appends the two renderers to this same file:

  ```ts
  import { DIFFICULTY_CONFIG } from './difficulty';
  import type { Difficulty } from './difficulty';
  import { compareShirtPosition } from './positionOrder';
  import type { ShirtGameData } from './gameState';

  /**
   * The two states a share slot can be in.
   *
   * Deliberately not four. `ShirtState` has four members, but a share block
   * describes a *finished* result, and a shirt that is merely unsolved is not a
   * third kind of outcome — it is the same "did not get solved" as a shirt the
   * player ran out of attempts on. See the glyph decision in the plan's Global
   * Constraints: 🟩 correct, ⬛ everything else.
   */
  export type SlotOutcome = 'correct' | 'failed';

  /** One shirt's worth of the block. `team` says which half the slot belongs to. */
  export interface ShareSlot {
    team: 'target' | 'opponent';
    state: SlotOutcome;
    shirtNumber: number | null;
  }

  /**
   * What a completed game hands the renderer. `opponentAttempted` is a
   * statement about play, not about mode: it is true when the player actually
   * guessed against the opponent half, which is what brings that half into
   * scope in the three modes where it is optional.
   */
  export interface ShareGridInput {
    targetShirts: ShirtGameData[];
    opponentShirts: ShirtGameData[];
    difficulty: Difficulty;
    opponentAttempted: boolean;
    score: number;
  }

  /** A built, render-ready block. `slots` is target half then opponent half. */
  export interface ShareGrid {
    slots: ShareSlot[];
    score: number;
    difficulty: Difficulty;
  }

  /**
   * Builds the block for a completed result.
   *
   * Scope: the target half always; the opponent half when the mode requires it
   * (Expert, per §5.2 — Finish is locked until all 22 resolve, so an Expert
   * result cannot end at 11) or when the player attempted it. Scope is read
   * from `DIFFICULTY_CONFIG.opponentRequired` rather than by naming a mode, so
   * a future mode that also requires the opponent is handled by the table.
   *
   * Count: one slot per shirt in scope, whatever that number is. The 11 and 22
   * in the plan's case table are what the real call sites produce; this function
   * does not pad, truncate, or target them. A slot is never omitted — a shirt
   * in scope with no resolution still gets a slot (§7).
   *
   * Order: by shared position rank, target half before opponent half, so the
   * block reads in the same order as the game-over table above it.
   */
  export function buildShareGrid(input: ShareGridInput): ShareGrid {
    const { targetShirts, opponentShirts, difficulty, opponentAttempted, score } = input;
    const opponentInScope = DIFFICULTY_CONFIG[difficulty].opponentRequired || opponentAttempted;

    const toSlots = (shirts: ShirtGameData[], team: 'target' | 'opponent'): ShareSlot[] =>
      // Copy before sorting: the caller's array is game state and must not be
      // reordered underneath the game-over list.
      [...shirts].sort(compareShirtPosition).map((shirt) => ({
        team,
        // 'correct' is the only claim this makes. 'failed', 'default' and
        // 'in-progress' are all "not solved", and a non-terminal shirt renders
        // rather than throwing or being dropped (§7).
        state: shirt.state === 'correct' ? 'correct' : 'failed',
        shirtNumber: shirt.shirtNumber,
      }));

    return {
      slots: [...toSlots(targetShirts, 'target'), ...(opponentInScope ? toSlots(opponentShirts, 'opponent') : [])],
      score,
      difficulty,
    };
  }
  ```

- [ ] **Step 3.4: Verify green.**

  ```bash
  cd frontend && npm test -- src/lib/shareGrid.test.ts
  ```

  Expected: **FAIL**, but only on the missing exports — `renderShareGrid` and `renderShareText` are not written yet, so every one of the 13 `buildShareGrid` tests passes and the file errors at import time. That import error is the point of this step: it proves Task 4 has real work to do and that the file is incomplete rather than accidentally finished.

  If any `buildShareGrid` test fails, the implementation is wrong — most likely the scope condition or the sort. Do not proceed to Task 4.

- [ ] **Step 3.5: Prove the module is pure — no React, no DOM.**

  ```bash
  cd frontend && grep -nE "from 'react'|require\(|document\.|window\.|navigator" src/lib/shareGrid.ts
  ```

  Expected: **no output.** Anything printed means the module picked up a side effect and the v1.4.2 clipboard work would have to live in the same file, breaking this patch's rollback point.

- [ ] **Step 3.6: Type-check.**

  ```bash
  cd frontend && npx tsc --noEmit
  ```

  Expected: clean. `Difficulty` and `ShirtGameData` are imported type-only, so they leave no runtime edge to the module.

- [ ] **Step 3.7: Full regression.**

  ```bash
  cd frontend && npm test
  cd ../backend && npm test
  ```

  Expected: frontend `Test Files 10 passed (10)` / `Tests 184 passed (184)` — the count is unchanged from Task 2, because `shareGrid.test.ts` currently fails to import and Task 3 has not made it runnable. Backend `13 passed` / `175 passed`.

  **Read this number carefully.** A frontend suite that is *lower* than 184 here means a previously collected file stopped being collected, which is an R7 regression and must be escalated, not ignored.

- [ ] **Step 3.8: Commit.**

  ```bash
  git add frontend/src/lib/shareGrid.ts frontend/src/lib/shareGrid.test.ts
  git commit -m "feat(frontend): build the share grid from a completed result"
  ```

---

## Task 4: `renderShareGrid` and `renderShareText`

**Files:**
- Modify: `frontend/src/lib/shareGrid.ts` (append two functions)
- Modify: `frontend/src/lib/shareGrid.test.ts` (append two describes)

**Interfaces:**
- Consumes: everything Task 3 produced; `DIFFICULTY_CONFIG[grid.difficulty].label` and `.multiplier` for the tally.
- Produces: the last two frozen exports, `renderShareGrid(grid: ShareGrid): string` and `renderShareText(grid: ShareGrid, link: string | null): string`. After this task the frozen block is complete and no further export may be added in v1.4.1.

- [ ] **Step 4.1: Write the failing tests first.**

  Append to `frontend/src/lib/shareGrid.test.ts`:

  ```ts
  describe('renderShareGrid', () => {
    it('renders one target row and the tally for an 11-slot result', () => {
      const grid = buildShareGrid(makeInput({ difficulty: 'normal', score: 8300 }));
      expect(renderShareGrid(grid)).toBe('🟩⬛⬛⬛🟩🟩⬛⬛⬛🟩🟩\nNormal ×1 · 8300');
    });

    it('renders a target row then an opponent row for a 22-slot result', () => {
      const grid = buildShareGrid(
        makeInput({
          difficulty: 'hard',
          opponentAttempted: true,
          score: 12450,
          opponentShirts: uniformHalf('o', 'failed'),
        })
      );
      expect(renderShareGrid(grid)).toBe(
        '🟩⬛⬛⬛🟩🟩⬛⬛⬛🟩🟩\n⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛\nHard ×2 · 12450'
      );
    });

    it('renders both rows for expert even when the opponent was never attempted', () => {
      const grid = buildShareGrid(
        makeInput({ difficulty: 'expert', opponentAttempted: false, score: 19800 })
      );
      expect(renderShareGrid(grid)).toBe(
        '🟩⬛⬛⬛🟩🟩⬛⬛⬛🟩🟩\n🟩⬛⬛⬛🟩🟩⬛⬛⬛🟩🟩\nExpert ×3 · 19800'
      );
    });

    it('renders a perfect expert result as two all-correct rows', () => {
      const grid = buildShareGrid(
        makeInput({
          targetShirts: uniformHalf('t', 'correct'),
          opponentShirts: uniformHalf('o', 'correct'),
          difficulty: 'expert',
          opponentAttempted: true,
          score: 33000,
        })
      );
      expect(renderShareGrid(grid)).toBe(
        '🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩\n🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩\nExpert ×3 · 33000'
      );
    });

    it('renders a surrendered result as one all-failed row', () => {
      const grid = buildShareGrid(
        makeInput({
          targetShirts: uniformHalf('t', 'failed'),
          opponentShirts: [],
          difficulty: 'normal',
          opponentAttempted: false,
          score: 620,
        })
      );
      expect(renderShareGrid(grid)).toBe('⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛\nNormal ×1 · 620');
    });

    it('renders the score as a raw integer, not a localised string', () => {
      const grid = buildShareGrid(makeInput({ score: 1234567 }));
      expect(renderShareGrid(grid)).toContain('· 1234567');
      expect(renderShareGrid(grid)).not.toContain('1,234,567');
    });

    it('still carries the mode and score when the grid has no slots', () => {
      const grid = buildShareGrid(
        makeInput({ targetShirts: [], opponentShirts: [], difficulty: 'easy', score: 0 })
      );
      expect(renderShareGrid(grid)).toBe('Easy ×0.5 · 0');
    });

    it('emits no empty line for a half that is out of scope', () => {
      const grid = buildShareGrid(makeInput({ difficulty: 'normal', opponentAttempted: false }));
      expect(renderShareGrid(grid).split('\n')).toHaveLength(2);
    });
  });

  describe('renderShareText', () => {
    it('prefixes the title and omits the link when link is null', () => {
      const grid = buildShareGrid(makeInput({ score: 8300 }));
      expect(renderShareText(grid, null)).toBe(
        'Missing Eleven\n🟩⬛⬛⬛🟩🟩⬛⬛⬛🟩🟩\nNormal ×1 · 8300'
      );
    });

    it('appends the link on its own final line', () => {
      const grid = buildShareGrid(makeInput({ difficulty: 'easy', score: 4150 }));
      expect(
        renderShareText(grid, 'https://footplay.online/missing-eleven?daily=2026-01-01')
      ).toBe(
        'Missing Eleven\n🟩⬛⬛⬛🟩🟩⬛⬛⬛🟩🟩\nEasy ×0.5 · 4150\nhttps://footplay.online/missing-eleven?daily=2026-01-01'
      );
    });

    it('omits an empty-string link rather than emitting a blank final line', () => {
      const grid = buildShareGrid(makeInput({ difficulty: 'easy', score: 4150 }));
      expect(renderShareText(grid, '')).toBe(
        'Missing Eleven\n🟩⬛⬛⬛🟩🟩⬛⬛⬛🟩🟩\nEasy ×0.5 · 4150'
      );
    });

    it('passes the link through untouched', () => {
      const grid = buildShareGrid(makeInput());
      const link = 'https://footplay.online/missing-eleven?daily=2026-01-01&difficulty=hard';
      expect(renderShareText(grid, link).endsWith(link)).toBe(true);
    });
  });
  ```

- [ ] **Step 4.2: Run it and watch it fail.**

  ```bash
  cd frontend && npm test -- src/lib/shareGrid.test.ts
  ```

  Expected: **FAIL** — `renderShareGrid` and `renderShareText` are not exported from `./shareGrid`, so the file errors on import and all 26 tests report as unrun.

- [ ] **Step 4.3: Append the two renderers.**

  Append to `frontend/src/lib/shareGrid.ts`:

  ```ts
  /** Correct shirt. The only slot that reads as solved. */
  const GLYPH: Record<SlotOutcome, string> = {
    correct: '🟩', // U+1F7E9
    failed: '⬛',  // U+2B1B
  };

  /** One emoji line per half that is in scope, then the tally line. */
  export function renderShareGrid(grid: ShareGrid): string {
    // Group by team rather than by position in `slots`, so the row order is a
    // property of this function and does not depend on how the grid was built.
    const rows = (['target', 'opponent'] as const)
      .map((team) => grid.slots.filter((slot) => slot.team === team))
      .filter((slots) => slots.length > 0)
      .map((slots) => slots.map((slot) => GLYPH[slot.state]).join(''));

    const { label, multiplier } = DIFFICULTY_CONFIG[grid.difficulty];
    // The score is the raw integer. The dialog localises its own display total,
    // but "1,234" in a monospace block is three characters wider than "1234" and
    // misaligns the tally line.
    rows.push(`${label} ×${multiplier} · ${grid.score}`);

    return rows.join('\n');
  }

  /**
   * The full share payload: title, block, and a link when one is supplied.
   * v1.4.2 copies this string verbatim, so an empty or absent link must not
   * leave a blank trailing line for the recipient to trip over.
   */
  export function renderShareText(grid: ShareGrid, link: string | null): string {
    const lines = ['Missing Eleven', renderShareGrid(grid)];
    if (link !== null && link !== '') lines.push(link);
    return lines.join('\n');
  }
  ```

- [ ] **Step 4.4: Verify green.**

  ```bash
  cd frontend && npm test -- src/lib/shareGrid.test.ts
  ```

  Expected: `Test Files 1 passed (1)` / `Tests 26 passed (26)` — 13 scope/order tests, 8 `renderShareGrid` tests, 4 `renderShareText` tests, and the 1 remaining count. If an emoji literal fails, the glyph has been corrupted in transit: confirm the file is UTF-8 and the characters are `U+1F7E9` and `U+2B1B`, not `U+1F7E8` and `U+2B1B`, and not a `U+FE0F` variation selector appended to either.

- [ ] **Step 4.5: Prove the frozen export list is exact.**

  ```bash
  cd frontend && grep -nE "^export (type|interface|function|const)" src/lib/shareGrid.ts
  ```

  Expected: exactly seven lines — `SlotOutcome`, `ShareSlot`, `ShareGridInput`, `ShareGrid`, `buildShareGrid`, `renderShareGrid`, `renderShareText`. `GLYPH` and `countTeam`-style helpers must not be exported; a non-exported `const GLYPH` does not match the pattern above and that is correct.

- [ ] **Step 4.6: Type-check and lint.**

  ```bash
  cd frontend && npx tsc --noEmit && npm run lint
  ```

  Expected: clean, with no new warning about the unused `shirtNumber` field on `ShareSlot`. It is part of the frozen contract and is read by consumers even though this renderer does not print it.

- [ ] **Step 4.7: Full regression.**

  ```bash
  cd frontend && npm test
  cd ../backend && npm test
  ```

  Expected: frontend `Test Files 11 passed (11)` / `Tests 189 passed (189)`; backend `13 passed` / `175 passed`.

- [ ] **Step 4.8: Commit.**

  ```bash
  git add frontend/src/lib/shareGrid.ts frontend/src/lib/shareGrid.test.ts
  git commit -m "feat(frontend): render the share grid and composed share text"
  ```

---

## Task 5: Show the block in the game-over dialog

The block is visible and selectable in v1.4.1. Copying it is v1.4.2 and this task adds no copy control, no clipboard call, and no button — the dialog gains a block and nothing else.

**Files:**
- Modify: `frontend/src/components/GameComplete.tsx` (prop, derivation, block)
- Modify: `frontend/src/components/GameComplete.test.tsx` (new tests)
- Modify: `frontend/app/missing-eleven/page.tsx` (pass `difficulty`)

**Interfaces:**
- Consumes: `buildShareGrid` and `renderShareGrid` from `@/lib/shareGrid`; `type Difficulty` from `@/lib/difficulty`; `state.difficulty` from `GameState` at the page call site.
- Produces: `GameCompleteProps` gains one optional field — `difficulty?: Difficulty`, defaulting to `DEFAULT_DIFFICULTY`. The prop is optional because v1.2.5 already specifies it that way and because the 17 existing tests construct the component without it; making it required would mean editing passing tests to accommodate a default that already exists.

- [ ] **Step 5.1: Write the failing tests first.**

  Append these to the existing `describe('GameComplete', …)` block in `frontend/src/components/GameComplete.test.tsx`. `makeShirt` and `renderGameComplete` already exist in that file; `renderGameComplete` forwards `targetShirts`, `opponentShirts` and — once Step 5.2 adds it — `difficulty`. Add `difficulty` to its `RenderOptions` interface in the same step, defaulting to `'normal'`:

  ```tsx
  describe('share block', () => {
    const eleven = (prefix: string, state: ShirtState = 'default'): ShirtGameData[] =>
      Array.from({ length: 11 }, (_, i) =>
        makeShirt({ token: `${prefix}-${i}`, shirtNumber: i + 1, position: null, state })
      );

    it('renders the block with 11 slots when the opponent was not attempted', () => {
      renderGameComplete({
        targetShirts: eleven('t', 'correct'),
        opponentShirts: [],
        difficulty: 'normal',
      });
      // 11000 = 11 correct shirts × 1000 (scorePlayer's base, which attempts: 0
      // does not reduce). This is the end-to-end check that the block carries
      // scoreBreakdown.grandTotal rather than something re-derived.
      expect(screen.getByRole('img', { name: /share grid/i }).textContent).toBe(
        '🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩\nNormal ×1 · 11000'
      );
    });

    it('renders 22 slots when the opponent has attempts', () => {
      renderGameComplete({
        targetShirts: eleven('t', 'correct'),
        opponentShirts: eleven('o', 'failed').map((shirt, i) => ({ ...shirt, attempts: 2, token: `o-${i}` })),
        difficulty: 'normal',
      });
      const lines = (screen.getByRole('img', { name: /share grid/i }).textContent ?? '').split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe('🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩');
      expect(lines[1]).toBe('⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛');
      expect(lines[2]).toContain('Normal ×1 · ');
    });

    it('treats an opponent half with no attempts as out of scope', () => {
      // The surrender case: the opponent half exists in state but was never
      // played, so a game that never touched it is an 11-slot result.
      renderGameComplete({
        targetShirts: eleven('t', 'failed'),
        opponentShirts: eleven('o', 'default'),
        difficulty: 'hard',
      });
      const text = screen.getByRole('img', { name: /share grid/i }).textContent ?? '';
      expect(text.split('\n')).toHaveLength(2);
      expect(text.split('\n')[0]).toBe('⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛');
    });

    it('renders 22 slots for expert even when the opponent was never attempted', () => {
      renderGameComplete({
        targetShirts: eleven('t', 'correct'),
        opponentShirts: eleven('o', 'default'),
        difficulty: 'expert',
      });
      const text = screen.getByRole('img', { name: /share grid/i }).textContent ?? '';
      expect(text.split('\n')).toHaveLength(3);
    });

    it('carries the mode label and multiplier in the tally line', () => {
      renderGameComplete({
        targetShirts: eleven('t', 'correct'),
        opponentShirts: [],
        difficulty: 'hard',
      });
      // The multiplier and the score are asserted separately and loosely on
      // purpose. `DIFFICULTY_CONFIG.hard.multiplier` is 2 and v1.2.5 has already
      // scaled `grandTotal` by it, so the exact total is scoring's assertion to
      // make, not this one. What v1.4.1 owns is that the mode and its
      // multiplier are read from the table and shown.
      expect(screen.getByRole('img', { name: /share grid/i }).textContent).toContain('Hard ×2 · ');
    });

    it('places the block between the match summary and Play Again', () => {
      const { container } = renderGameComplete({
        targetShirts: eleven('t', 'correct'),
        opponentShirts: [],
        difficulty: 'normal',
      });
      const block = screen.getByRole('img', { name: /share grid/i });
      const again = screen.getByRole('button', { name: 'Play Again' });
      // Node.DOCUMENT_POSITION_FOLLOWING === 4: the block sits after the summary
      // and before the control, so the dialog ends on the thing to press.
      expect(
        block.compareDocumentPosition(again) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(container.querySelector('pre')).toBe(block);
    });

    it('keeps the block selectable and monospace', () => {
      renderGameComplete({ targetShirts: eleven('t', 'correct'), opponentShirts: [] });
      const block = screen.getByRole('img', { name: /share grid/i });
      expect(block.tagName).toBe('PRE');
      expect(block.className).toContain('font-mono');
      expect(block.className).toContain('select-text');
    });

    it('renders no clipboard control in v1.4.1', () => {
      renderGameComplete({ targetShirts: eleven('t', 'correct'), opponentShirts: [] });
      expect(screen.queryByRole('button', { name: /copy/i })).toBeNull();
    });

    it('describes the block for a screen reader with a plain-language label', () => {
      renderGameComplete({
        targetShirts: eleven('t', 'correct'),
        opponentShirts: [],
        difficulty: 'normal',
      });
      // role="img" with a text alternative: the emoji themselves would otherwise
      // be read as a run of unpronounceable squares.
      expect(screen.getByRole('img', { name: 'Share grid' })).toBeTruthy();
    });
  });
  ```

  Add `ShirtState` to the file's existing `@/types` import so the helper compiles:

  ```tsx
  import type { Game, ShirtData, ShirtState } from '@/types';
  ```

- [ ] **Step 5.2: Run it and watch it fail.**

  ```bash
  cd frontend && npm test -- src/components/GameComplete.test.tsx
  ```

  Expected: **FAIL** across the new `share block` describe — `Unable to find an accessible element with the role "img"`. The 17 existing tests still pass; if they do not, the fixture change in Step 5.1 is wrong and must be fixed before continuing.

- [ ] **Step 5.3: Add the prop and the derivation.**

  In `frontend/src/components/GameComplete.tsx`, add to `GameCompleteProps`:

  ```ts
  /** Mode the result was played in. Drives the share grid's scope and tally. */
  difficulty?: Difficulty;
  ```

  and add the imports:

  ```tsx
  import { DEFAULT_DIFFICULTY, type Difficulty } from '@/lib/difficulty';
  import { buildShareGrid, renderShareGrid } from '@/lib/shareGrid';
  ```

  Destructure the prop with a default, alongside the other destructured props:

  ```tsx
  function GameComplete({
    match,
    targetShirts,
    opponentShirts,
    targetTeamName,
    opponentTeamName,
    onPlayAgain,
    difficulty = DEFAULT_DIFFICULTY,
  }: GameCompleteProps) {
  ```

  Then, immediately after the existing `scoreBreakdown` line, add:

  ```tsx
  // Whether the player actually guessed against the opponent half. Derived, not
  // stored: a surrendered Normal game has an opponent half in state that was
  // never played, and that is an 11-slot result, not a 22-slot one. Deriving it
  // keeps it from going stale and needs no reducer change.
  const opponentAttempted = opponentShirts.some((shirt) => shirt.attempts > 0);

  const shareText = renderShareGrid(
    buildShareGrid({
      targetShirts,
      opponentShirts,
      difficulty,
      opponentAttempted,
      // Raw total, not the localised string the dialog displays further down.
      score: scoreBreakdown.grandTotal,
    })
  );
  ```

  If the component's signature does not destructure its props, add a `const { … } = props;` line and use `props.difficulty` in the same expression.

- [ ] **Step 5.4: Render the block between the summary and the button.**

  In `frontend/src/components/GameComplete.tsx`, between the closing `</div>` of the `{/* Match summary */}` block and the `{/* Play Again button */}` comment, insert:

  ```tsx
  {/* Share block — v1.4.1 renders it; v1.4.2 adds the copy control. */}
  <div className="border-t border-ink/10 px-6 py-3">
  <p className="mb-2 text-center text-xs uppercase tracking-[0.08em] text-ink/55">
    Share grid
  </p>
  <pre
    role="img"
    aria-label="Share grid"
    className="overflow-x-auto rounded-lg bg-ink/5 px-3 py-2 text-center font-mono text-sm leading-relaxed text-ink select-text"
  >
    {shareText}
  </pre>
  </div>
  ```

  `role="img"` with `aria-label` is deliberate: a screen reader announcing eleven green-square emoji is worse than useless, while the label plus the selectable text gives a reader the same result a sighted one gets by looking. `select-text` is what makes v1.4.2's manual-copy fallback possible, so it ships now rather than being bolted on with the button.

- [ ] **Step 5.5: Verify green.**

  ```bash
  cd frontend && npm test -- src/components/GameComplete.test.tsx
  ```

  Expected: `Test Files 1 passed (1)` / `Tests 26 passed (26)` — the 17 pre-existing tests plus the 9 new ones.

- [ ] **Step 5.6: Forward `difficulty` from the page.**

  In `frontend/app/missing-eleven/page.tsx`, add `difficulty={state.difficulty}` to the `<GameComplete …>` element, next to the existing `match`, `targetShirts`, `opponentShirts`, `targetTeamName`, `opponentTeamName` and `onPlayAgain` props. v1.2.5 already passes this prop; if it is already there, this step is a no-op — confirm and move on rather than adding a duplicate attribute.

- [ ] **Step 5.7: Prove this patch added no clipboard behaviour.**

  ```bash
  cd frontend && grep -rnE "navigator\.clipboard|execCommand|Clipboard|copy" src/components/GameComplete.tsx src/lib/shareGrid.ts
  ```

  Expected: **no output.** Any hit means v1.4.2 leaked into v1.4.1 and the rollback point in the roadmap is wrong.

  ```bash
  cd frontend && grep -rnE "localStorage|sessionStorage" src/lib/shareGrid.ts src/components/GameComplete.tsx
  ```

  Expected: **no output** — all storage belongs to v1.3.2 (§11 rule 8).

- [ ] **Step 5.8: Type-check and lint.**

  ```bash
  cd frontend && npx tsc --noEmit && npm run lint
  ```

  Expected: clean.

- [ ] **Step 5.9: Full regression.**

  ```bash
  cd frontend && npm test
  cd ../backend && npm test
  ```

  Expected: frontend `Test Files 11 passed (11)` / `Tests 198 passed (198)` — the 189 from Task 4 plus the 9 component tests. Backend `13 passed` / `175 passed`.

- [ ] **Step 5.10: Commit.**

  ```bash
  git add frontend/src/components/GameComplete.tsx frontend/src/components/GameComplete.test.tsx frontend/app/missing-eleven/page.tsx
  git commit -m "feat(frontend): show the share grid in the game-over dialog"
  ```

---

## Task 6: Verify the patch and record it

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: the release note for `v1.4.1`, which `scripts/src/release.ts` reads.

- [ ] **Step 6.1: Run the whole suite one more time, from a clean shell.**

  ```bash
  cd frontend && npm test
  cd ../backend && npm run test:coverage
  ```

  Expected: frontend `Test Files 11 passed (11)` / `Tests 198 passed (198)`; backend `13 passed` / `175 passed` with all four coverage metrics at or above 95% — the gate at `backend/vitest.config.ts:26-30`, which this patch cannot move because it touches no backend file.

- [ ] **Step 6.2: Build the frontend.**

  ```bash
  cd frontend && npm run build
  ```

  Expected: a successful Next production build. This is also the only full type-check that includes the app router, so it is not a substitute for Step 5.8 — both matter.

- [ ] **Step 6.3: Check the frozen surface one last time.**

  ```bash
  cd frontend && grep -nE "^export (type|interface|function|const)" src/lib/shareGrid.ts && ls src/lib/shareGrid.ts src/lib/positionOrder.ts
  ```

  Expected: the seven frozen exports and both files present.

- [ ] **Step 6.4: Write the changelog entry.**

  Prepend to `CHANGELOG.md`, directly under the `---` that follows the header block, matching the existing `## v0.2.5 — …` shape and newest-first order:

  ```markdown
  ## v1.4.1 — Share Grid

  _2026-09-30_

  ### Added

  - **Shareable result grid** — a completed Missing Eleven game now shows an
    emoji block in the game-over dialog: one slot per shirt in scope for that
    result, plus the mode and score, ready to select and copy. The opponent
    half appears when Expert is played (all 22 resolve before Finish unlocks) or
    when the opponent half was actually attempted, so an 11-slot result and an
    Expert result cannot be mistaken for one another.
  ```

- [ ] **Step 6.5: Confirm nothing outside the patch changed.**

  ```bash
  git status --short
  git diff --stat HEAD
  ```

  Expected: changes confined to `frontend/src/lib/positionOrder.ts`, `frontend/src/lib/positionOrder.test.ts`, `frontend/src/lib/shareGrid.ts`, `frontend/src/lib/shareGrid.test.ts`, `frontend/src/components/GameComplete.tsx`, `frontend/src/components/GameComplete.test.tsx`, `frontend/app/missing-eleven/page.tsx`, and `CHANGELOG.md`. `docs/v1/roadmap-v1.md` is not among them.

- [ ] **Step 6.6: Commit.**

  ```bash
  git add CHANGELOG.md
  git commit -m "docs: release note for v1.4.1"
  ```

---

## Handoff to v1.4.2

- **Rollback point:** `v1.3.x`. Reverting this patch leaves no trace of the share feature.
- **v1.4.2's job:** add a Copy control to the same dialog that copies `renderShareText(grid, link)`, where `link` is the current URL's path and query.
- **What v1.4.2 must not change:** the seven frozen exports in `shareGrid.ts`, and the `<pre>` block's `role`, `aria-label` or `select-text` class. A copy button that replaces the visible text is a regression — the block stays on screen in v1.4.2 exactly as it is here.
- **What v1.4.2 gets for free:** the composed text, the link-free case, and the visible fallback block, all already tested here.
- **Open decision to watch:** roadmap §9 O1 (streak scope) is still open. If it flips to per-(day, difficulty), the tally line's mode label becomes load-bearing rather than merely informative. Nothing in this patch needs to change for that — which is the point of reading the label and multiplier out of `DIFFICULTY_CONFIG` instead of composing them from a mode name.
