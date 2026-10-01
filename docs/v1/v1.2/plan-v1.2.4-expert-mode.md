# Expert Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Expert` is the only mode in which the opponent lineup is not a bonus but half the puzzle. Three attempts instead of six, no clues, the number masked as in `Hard`, and the game cannot be completed until all 22 shirts are resolved. At 22/22 the board does **not** end by itself: the player presses Finish, confirms, and only that confirmation moves the game to `complete`. A surrender ends the run from whatever is resolved, in every mode including Expert.

**Architecture:** The attempt budget and the number mask are already mode-driven — v1.2.2 and v1.2.3 read `DIFFICULTY_CONFIG` and this patch adds no code to either. The only new machinery is the completion gate. `checkGameComplete` currently ends the game the moment the 22nd shirt resolves, in every mode; this patch makes that auto-complete conditional and introduces one explicit `FINISH_GAME` action as the only path to `complete` when the mode requires the opponent. The Finish control is introduced in **v1.2.2** with the mode table that drives it, **confirmed here** as Expert-only, and this patch **asserts its absence** in the other three modes as a test. It is a control plus a confirmation inside the existing board and dialog patterns — not a screen, not a new route.

**Tech Stack:** TypeScript, Next 16 / React 19, Vitest + `@testing-library/react`, jsdom for component tests.

---

## Global Constraints

- **This patch changes no attempt budget and no mask.** `DIFFICULTY_CONFIG.expert` is `{ attempts: 3, showShirtNumber: false, showFirstLetter: false, showScorersClue: false, showCaptainClue: false, opponentRequired: true, multiplier: 3 }` and has said so since v1.2.2 Task 1. The three-attempt budget works today because `gameState.ts:154` and all three page call sites read `DIFFICULTY_CONFIG[difficulty].attempts`; the mask works because `maskedShirtNumber` reads `showShirtNumber`. The only new behaviour in this patch is the gate.
- **The completion predicate is mode-dependent, and this is ratified, not incidental** (roadmap §5.2, RD1 in §9.1). `checkGameComplete` (`gameState.ts:111-114`) currently requires every shirt on **both** boards to be `correct` or `failed`, and that has governed all four modes since before v1.2. This patch changes that to one condition:

  ```
  all.length > 0
    && every target-half shirt is resolved
    && (!DIFFICULTY_CONFIG[difficulty].opponentRequired
        || every opponent-half shirt is resolved)
  ```

  `opponentRequired` is read from the mode table. **Comparing against a mode name is forbidden here** — `difficulty === 'expert'` would make the gate silently wrong for any future mode, and v1.2.2's Global Constraints make the mode table the one place a mode is described by data. The consequence, which the tests below pin: in `easy`, `normal` and `hard` the condition is satisfied the moment the last target-half shirt resolves, so those three modes **auto-complete at 11/22**. That is a behaviour change to three shipped modes, and it is the one the roadmap ratified. The alternative — leaving three modes Finish-locked at 22/22 — was what the flag contradicted, and it is closed.
- **`FINISH_GAME` is the only transition to `complete` when `opponentRequired` is true, and it is gated.** A dispatch with 11/22 resolved in `expert` must leave `gameStatus: 'playing'` and leave the shirts untouched. The gate is in the reducer, not in the button: a disabled button is a UI convenience and is not a guarantee.
- **Auto-complete is suppressed only when `opponentRequired` is true.** In `easy`, `normal` and `hard` the target half's last shirt still ends the game by itself. Suppressing it everywhere would add a button to three modes that never needed one — and under RD1 those three modes do not need one.
- **The Finish control is rendered only when `DIFFICULTY_CONFIG[difficulty].opponentRequired` is true.** It is not rendered-and-disabled in the other modes; it does not exist there. A permanently disabled button in Easy reads as a broken feature. This patch adds the **absence assertion** that makes the flag load-bearing: after this patch no test anywhere may find a Finish control in `easy`, `normal` or `hard`.
- **The Finish affordance is a control plus a confirmation.** v1.2.2 introduces the control and its confirmation step using the board's existing dialog pattern; this patch consumes it unchanged. Do not invent a second affordance here, and do not escalate a question about its shape — it is already ratified as "a control that states its unresolved count and asks the player to confirm", within existing patterns and not a screen.
- **Surrender is unaffected by the gate, and must stay that way.** `SURRENDER` already transitions to a terminal state in every mode. This patch must not gate surrender on the opponent half, must not add opponent shirts to the surrendered board, and must not require the player to resolve anything in order to give up. A surrendered `expert` result is therefore an 11-slot result whenever the opponent half was untouched (roadmap §7, RD2), and the share grid in v1.4.1 must be able to render it.
- **The disabled label states the unresolved count**, e.g. `Finish — 11 of 22 resolved`, so the player can see what is blocking them rather than being told "not available".
- **No new component test outside `frontend/src/`.** This is a house rule rather than a consequence of the include: after v1.1.1 the include enumerates `src/**`, `components/**`, `tests/**` and `app/**`, so an out-of-`src/` test would still be collected — but it would fall outside the coverage `include` (`src/**`). Every new test file carries `// @vitest-environment jsdom` and imports outward with `../../components/...`. v1.1.1 owns the include list; this patch does not touch `frontend/vitest.config.ts`.
- **The multiplier is still inert.** `expert.multiplier` is read by nothing until v1.2.5. Do not wire it here.
- **Regression commands, run at every task boundary:**

  ```bash
  cd backend  && npm run test              # unchanged by this patch
  cd frontend && npm run test
  cd frontend && npx tsc --noEmit
  cd frontend && npm run lint
  ```

  Baseline is the v1.2.3 exit state. Measure, do not assume.

---

## Files touched

| File | Change |
|---|---|
| `frontend/src/lib/gameState.ts` | `checkGameComplete` becomes mode-dependent (RD1), `FINISH_GAME` action, `finishGame` in the hook, conditional auto-complete |
| `frontend/src/lib/gameState.test.ts` | gate tests: Expert 11/22 refusal, Expert 22/22 completion, **11/22 auto-complete in Easy/Normal/Hard**, surrender tolerance |
| `frontend/src/lib/gameState.hook.test.ts` | `finishGame` exposed |
| `frontend/src/components/FinishButton.test.tsx` | created in **v1.2.2**; this patch adds the three-mode **absence** assertions |
| `frontend/app/missing-eleven/page.tsx` | verify the render stays gated and surrender stays ungated |
| `frontend/src/lib/difficulty.ts` | append `'expert'` to `DIFFICULTIES` |
| `frontend/src/lib/difficulty.test.ts` | update the offer-list assertion |
| `frontend/src/components/DifficultySelector.tsx` | Expert's description |
| `frontend/src/components/DifficultySelector.test.tsx` | assert the Expert description |

**Not created here, on purpose:** `FinishButton.tsx` and `resolvedShirtCount` both
land in **v1.2.2** with the mode table that supplies their only input
(`opponentRequired`). A control cannot be written before the data that decides
whether it exists.

---

## Tasks

### Task 1: The completion gate

**Files:**
- Modify: `frontend/src/lib/gameState.ts` (`:44` action union, `:111-114` predicate, `handleSubmitGuess` completion at `:169-178`, new handler, hook)
- Modify: `frontend/src/lib/gameState.test.ts`
- Modify: `frontend/src/lib/gameState.hook.test.ts`

**Interfaces:**
- Consumes: `DIFFICULTY_CONFIG`, `DEFAULT_DIFFICULTY`, `type Difficulty` from `./difficulty` (already imported by v1.2.2).
- Produces:
  ```ts
  // GameAction gains:
  | { type: 'FINISH_GAME' }
  // checkGameComplete gains a difficulty parameter (RD1):
  export function checkGameComplete(
    target: ShirtGameData[],
    opponent: ShirtGameData[],
    difficulty: Difficulty,
  ): boolean;
  // The hook gains:
  finishGame: () => void;
  ```

- [ ] **Step 1.1: Write the failing tests first.**

  Append to `frontend/src/lib/gameState.test.ts`, inside the top-level `describe`:

  ```ts
    describe('FINISH_GAME', () => {
      /** A full board whose first `unresolved` target shirts are still `default`. */
      function expertBoard(unresolved: number) {
        const mk = (state: ShirtState) => ({ ...blank, state });
        return {
          targetShirts: [
            ...Array.from({ length: unresolved }, () => mk('default')),
            ...Array.from({ length: 11 - unresolved }, () => mk('correct')),
          ],
          opponentShirts: Array.from({ length: 11 }, () => mk('correct')),
          gameStatus: 'playing' as const,
        };
      }

      /** Target half fully resolved, opponent half untouched — the RD1 gate shape. */
      function expertTargetOnly() {
        const mk = (state: ShirtState) => ({ ...blank, state });
        return {
          targetShirts: Array.from({ length: 11 }, () => mk('correct')),
          opponentShirts: Array.from({ length: 11 }, () => mk('default')),
          gameStatus: 'playing' as const,
        };
      }

      it('refuses to finish an Expert game whose target half is done but opponent is not', () => {
        // 11/22 is the shape that would complete instantly in Normal. In Expert
        // the opponent half is the gate, so this must stay `playing`.
        const state = { ...initialState, ...expertTargetOnly(), difficulty: 'expert' as const };
        const next = gameReducer(state, { type: 'FINISH_GAME' });
        expect(next.gameStatus).toBe('playing');
        expect(next.targetShirts).toBe(state.targetShirts);
        expect(next.opponentShirts).toBe(state.opponentShirts);
      });

      it('refuses at 21 of 22', () => {
        const state = { ...initialState, ...expertBoard(10), difficulty: 'expert' as const };
        expect(gameReducer(state, { type: 'FINISH_GAME' }).gameStatus).toBe('playing');
      });

      it('completes an Expert game at 22 of 22', () => {
        const state = { ...initialState, ...expertBoard(0), difficulty: 'expert' as const };
        const next = gameReducer(state, { type: 'FINISH_GAME' });
        expect(next.gameStatus).toBe('complete');
        expect(next.targetShirts).toBe(state.targetShirts);
        expect(next.opponentShirts).toBe(state.opponentShirts);
      });

      it('leaves the shirts untouched when it completes', () => {
        const state = { ...initialState, ...expertBoard(0), difficulty: 'expert' as const };
        const next = gameReducer(state, { type: 'FINISH_GAME' });
        // Finishing is a status transition, not a resolution step. A shirt the
        // player never touched must stay untouched, or the score silently
        // changes at the moment of finishing.
        expect(next.targetShirts.every(s => s.state === 'correct')).toBe(true);
      });
    });

    describe('auto-complete by mode', () => {
      /** Target half fully resolved, opponent half untouched. */
      function boardWithOneUnresolved(difficulty: Difficulty) {
        const mk = (state: ShirtState) => ({ ...blank, state });
        return {
          ...initialState,
          targetShirts: [mk('default'), ...Array.from({ length: 10 }, () => mk('correct'))],
          opponentShirts: Array.from({ length: 11 }, () => mk('correct')),
          gameStatus: 'playing' as const,
          difficulty,
        };
      }

      /** Only the target half resolved. The RD1 case: 11/22. */
      function targetHalfOnly(difficulty: Difficulty) {
        const mk = (state: ShirtState) => ({ ...blank, state });
        return {
          ...initialState,
          targetShirts: Array.from({ length: 11 }, () => mk('correct')),
          opponentShirts: Array.from({ length: 11 }, () => mk('default')),
          gameStatus: 'playing' as const,
          difficulty,
        };
      }

      it('does not auto-complete an Expert game when the last shirt resolves', () => {
        const state = boardWithOneUnresolved('expert');
        const next = gameReducer(state, {
          type: 'SUBMIT_GUESS',
          payload: { token: state.targetShirts[0].token, results: [], isCorrect: true, name: 'X' },
        });
        // 22 of 22 are now resolved, but the game is not over until Finish.
        expect(next.gameStatus).toBe('playing');
        expect(resolvedShirtCount(next.targetShirts, next.opponentShirts)).toBe(22);
      });

      it('auto-completes Normal at 11 of 22, opponent untouched', () => {
        // The load-bearing RD1 case: the opponent half is a bonus, not a gate.
        const state = targetHalfOnly('normal');
        const next = gameReducer(state, {
          type: 'SUBMIT_GUESS',
          payload: { token: state.opponentShirts[0].token, results: [], isCorrect: false, name: 'X' },
        });
        expect(next.gameStatus).toBe('complete');
        expect(resolvedShirtCount(next.targetShirts, next.opponentShirts)).toBe(11);
      });

      it('auto-completes Easy and Hard at 11 of 22, opponent untouched', () => {
        for (const difficulty of ['easy', 'hard'] as const) {
          const state = targetHalfOnly(difficulty);
          const next = gameReducer(state, {
            type: 'SUBMIT_GUESS',
            payload: { token: state.opponentShirts[0].token, results: [], isCorrect: false, name: 'X' },
          });
          expect(next.gameStatus).toBe('complete');
        }
      });

      it('does not auto-complete in Expert at 11 of 22, which is the gate', () => {
        const state = targetHalfOnly('expert');
        const next = gameReducer(state, {
          type: 'SUBMIT_GUESS',
          payload: { token: state.opponentShirts[0].token, results: [], isCorrect: false, name: 'X' },
        });
        expect(next.gameStatus).toBe('playing');
        // 11/22 is the surrendered-Expert shape, and surrender is the only way
        // out of it. Until then the game stays playable.
        expect(resolvedShirtCount(next.targetShirts, next.opponentShirts)).toBe(11);
      });
    });

    describe('surrender is not gated', () => {
      function surrenderedExpert() {
        const mk = (state: ShirtState) => ({ ...blank, state });
        return {
          ...initialState,
          targetShirts: Array.from({ length: 11 }, () => mk('correct')),
          opponentShirts: Array.from({ length: 11 }, () => mk('default')),
          gameStatus: 'playing' as const,
          difficulty: 'expert' as const,
        };
      }

      it('ends an Expert game at 11 resolved when the player surrenders', () => {
        // RD2: the gate guards Finish, never surrender. A surrendered Expert
        // result is an 11-slot result, and v1.4.1's grid must be able to say so.
        const state = surrenderedExpert();
        const next = gameReducer(state, { type: 'SURRENDER' });
        expect(next.gameStatus).toBe('surrendered');
        expect(resolvedShirtCount(next.targetShirts, next.opponentShirts)).toBe(11);
      });

      it('leaves the untouched opponent half untouched, not failed', () => {
        // Forfeiting the bonus must not fabricate resolutions for it: v1.4.1
        // derives `opponentAttempted` from `attempts > 0`, and a synthetic
        // 'failed' shirt would make a surrendered game look 22-slot.
        const state = surrenderedExpert();
        const next = gameReducer(state, { type: 'SURRENDER' });
        expect(next.opponentShirts.every(s => s.state === 'default')).toBe(true);
        expect(next.opponentShirts.every(s => s.attempts === 0)).toBe(true);
      });
    });
  ```

  Add the imports the new tests need: `resolvedShirtCount` from `./gameState`, and `ShirtState` plus `Difficulty` (`ShirtState` from `../../types`, `Difficulty` from `./difficulty`). `blank` is whatever minimal `ShirtGameData` fixture the file already uses — if the file has none, add one:

  ```ts
  const blank: ShirtGameData = {
    token: 'tok', nameLength: 5, wordBoundaries: [], shirtNumber: 9,
    position: 'ST', coords: { x: 50, y: 50 }, state: 'default',
    attempts: 0, guessHistory: [], correctLetters: [],
  };
  ```

  Use a distinct `token` per shirt where a test dispatches by token, so the lookup is unambiguous.

- [ ] **Step 1.2: Verify red.**

  ```bash
  cd frontend && npx vitest run src/lib/gameState.test.ts
  ```

  Expected: **FAIL** on the new blocks. `resolvedShirtCount` is not exported; the `FINISH_GAME` cases hit no case in the reducer and fall through to `state`; `does not auto-complete an Expert game` fails because the current `handleSubmitGuess` sets `complete` at 22/22 regardless of mode; `auto-completes Normal at 11 of 22` fails because the current `checkGameComplete` demands all 22; and both `surrender is not gated` cases fail only if surrender has been changed to mark the opponent half — if they pass, that is a correct finding, not a reason to weaken them.

- [ ] **Step 1.3: Implement the count helper and make the predicate mode-dependent.**

  1. In `frontend/src/lib/gameState.ts`, directly after `checkGameComplete` at line 114:

     ```ts
     /** How many of the 22 shirts are settled. Drives the Finish label. */
     export function resolvedShirtCount(
       target: ShirtGameData[],
       opponent: ShirtGameData[],
     ): number {
       return [...target, ...opponent].filter(
         s => s.state === 'correct' || s.state === 'failed',
       ).length;
     }
     ```

  2. Rewrite `checkGameComplete` itself, which ends at line 114, to the ratified RD1 condition. It gains a third parameter, `difficulty`:

     ```ts
     /**
      * The completion gate (roadmap §5.2, RD1).
      *
      * One condition for all four modes. The target half must be fully
      * resolved; the opponent half must be resolved only when the mode table
      * says the opponent is required. `opponentRequired` is read from
      * DIFFICULTY_CONFIG — never `difficulty === 'expert'` — so a future mode
      * inherits the right behaviour from its row.
      *
      * The emptiness guard returns false for an empty lineup, so an
       * empty board can never read as "complete".
      */
     export function checkGameComplete(
       target: ShirtGameData[],
       opponent: ShirtGameData[],
       difficulty: Difficulty,
     ): boolean {
       const all = [...target, ...opponent];
       if (all.length === 0) return false;
       const settled = (s: ShirtGameData) => s.state === 'correct' || s.state === 'failed';
       if (!target.every(settled)) return false;
       if (DIFFICULTY_CONFIG[difficulty].opponentRequired) return opponent.every(settled);
       return true;
     }
     ```

     **The emptiness guard is written against `all`, not `target`.** That is the form
     the Global Constraints above state, and it is the form the Risks table's entry on a
     duplicated predicate is written against: `FinishButton` additionally requires
     `total === 22`, which a target-half-only guard would not tolerate on a partial
     lineup. Writing `all` keeps the constraint, the implementation and the risk row
     describing **one** predicate rather than three that look alike.

     Add the `DIFFICULTY_CONFIG` import from `./difficulty` if it is not already imported in this file, and the `Difficulty` type.

     **This is the one call-site-visible change in the patch.** Update every existing caller of `checkGameComplete` to pass `difficulty`; `grep -rn "checkGameComplete" frontend/src` must return no call that omits it.

- [ ] **Step 1.4: Add the action and the handler.**

  1. In the `GameAction` union, directly after `SURRENDER`:

     ```ts
     | { type: 'FINISH_GAME' }
     ```

  2. Directly after `handleSurrender` (which ends at line 232), add:

     ```ts
     /**
      * FINISH_GAME handling.
      *
      * Where the mode requires the opponent, the game ends only here. The gate
      * lives in the reducer rather than in the button's `disabled` attribute: a
      * disabled control is a UI courtesy, not a guarantee, and this transition
      * decides whether 11 shirts or 22 are scored.
      */
     function handleFinishGame(state: GameState): GameState {
       if (state.gameStatus !== 'playing') return state;
       if (!checkGameComplete(state.targetShirts, state.opponentShirts, state.difficulty)) return state;
       return { ...state, gameStatus: 'complete' };
     }
     ```

     Note the handler does **not** mark unresolved shirts `failed`. The gate already requires every in-scope shirt to be resolved, so there is nothing left to mark; the explicit early return is what guarantees that.

  3. In the reducer switch, beside `case 'SURRENDER'`:

     ```ts
       case 'FINISH_GAME':
         return handleFinishGame(state);
     ```

  4. In the hook, beside `surrender`:

     ```ts
     const finishGame = useCallback(() => dispatch({ type: 'FINISH_GAME' }), []);
     ```

     and add `finishGame` to the returned object.

- [ ] **Step 1.5: Make auto-complete mode-conditional.**

  In `handleSubmitGuess`, at line 169, replace:

  ```ts
  // Only end the game when ALL shirts on both boards are resolved.
  const isComplete = checkGameComplete(updatedTarget, updatedOpponent);
  ```

  with:

  ```ts
  // Auto-complete applies only where the mode does NOT require the opponent
  // (§5.2, RD1). Where it does, the player must press Finish even at 22/22: the
  // opponent is half the puzzle, and an explicit finish makes that requirement
  // visible instead of implicit. checkGameComplete carries the mode-dependent
  // half of the condition; this negation carries the "may it end by itself" half.
  const isComplete =
    !DIFFICULTY_CONFIG[state.difficulty].opponentRequired &&
    checkGameComplete(updatedTarget, updatedOpponent, state.difficulty);
  ```

  This is the only line in the patch that branches on the mode, and it branches on a **config flag**, not on a mode name.

- [ ] **Step 1.6: Verify green.**

  ```bash
  cd frontend && npx vitest run src/lib/gameState.test.ts
  ```

  Expected: the file green, including all pre-existing tests. The pre-existing completion tests run at `DEFAULT_DIFFICULTY` (`normal`), where `opponentRequired` is `false`, so they still auto-complete — but note that they now do so at **11/22**, not 22/22, because `checkGameComplete` no longer demands the opponent half there. If a pre-existing test asserts 22/22 as a precondition for `complete`, that assertion was pinning the bug this patch fixes; update it to set up the target half only, and say so in the changelog rather than re-narrowing the predicate.

- [ ] **Step 1.7: Expose `finishGame` in the hook test.**

  Append to `frontend/src/lib/gameState.hook.test.ts`:

  ```ts
    it('exposes finishGame', () => {
      const { result } = renderHook(() => useGameState());
      expect(typeof result.current.finishGame).toBe('function');
      // At 0 of 22 resolved the dispatch is a no-op, so the status is unchanged.
      act(() => result.current.finishGame());
      expect(result.current.state.gameStatus).toBe(initialState.gameStatus);
    });
  ```

  Import `initialState` if the file does not already.

- [ ] **Step 1.8: Run the full frontend.**

  ```bash
  cd frontend && npx vitest run src/lib/gameState.test.ts src/lib/gameState.hook.test.ts
  cd frontend && npx tsc --noEmit && npm run test && npm run lint
  ```

  Expected: both files green; `tsc` clean; no new lint warnings.

- [ ] **Step 1.9: Commit.**

  ```bash
  git add frontend/src/lib/gameState.ts frontend/src/lib/gameState.test.ts frontend/src/lib/gameState.hook.test.ts
  git commit -m "feat(frontend): gate Expert completion behind an explicit Finish"
  ```

---

### Task 2: Confirm the Finish control is Expert-only

**This patch does not create the Finish control.** It is created in **v1.2.2**,
alongside the mode table that drives it, because a control whose only input is
`DIFFICULTY_CONFIG[difficulty].opponentRequired` cannot be written before the
table that supplies it. v1.2.3 confirms it across the third non-Expert mode. This
task's job is the remaining half of the decision: the **absence assertion**
(roadmap §5.2, RD1) — proof that `opponentRequired: false` removes the control
rather than disabling it.

**Files:**
- Modify: `frontend/src/components/FinishButton.test.tsx` (created in v1.2.2) — add the three-mode absence cases
- Verify, and modify only if v1.2.2 got it wrong: `frontend/app/missing-eleven/page.tsx`

**Interfaces:**
- Consumes: `FinishButton` from `@/components/FinishButton` and its `FinishButtonProps`, both created in v1.2.2; `DIFFICULTY_CONFIG`, `type Difficulty` from `@/lib/difficulty`. **This patch consumes the control unchanged and does not re-specify its shape.**
- Produces: the absence assertions only. No new export, no prop change, no new component.

- [ ] **Step 2.1: Write the failing absence assertions.**

  Append to the `describe('FinishButton')` block in `frontend/src/components/FinishButton.test.tsx`:

  ```tsx
    it('renders nothing at all in Normal, even fully resolved', () => {
      // The absence assertion (RD1). "Fully resolved" is the case that matters:
      // a control that merely greys out at 22/22 in Normal would still be a
      // requirement the player can see and cannot satisfy, which is the exact
      // confusion the flag exists to remove.
      const { container } = render(
        <FinishButton difficulty="normal" resolved={22} total={22} onFinish={() => {}} />,
      );
      expect(container.innerHTML).toBe('');
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('renders nothing in Easy and Hard too', () => {
      for (const difficulty of ['easy', 'hard'] as const) {
        const { container } = render(
          <FinishButton difficulty={difficulty} resolved={22} total={22} onFinish={() => {}} />,
        );
        expect(container.innerHTML).toBe('');
      }
    });

    it('reads the flag, not the mode name', () => {
      // A property test over the table, not a third hand-written mode case:
      // exactly the modes whose row says opponentRequired: false render nothing.
      for (const difficulty of DIFFICULTIES) {
        const { container } = render(
          <FinishButton difficulty={difficulty} resolved={22} total={22} onFinish={() => {}} />,
        );
        const rendered = container.innerHTML !== '';
        expect(rendered).toBe(DIFFICULTY_CONFIG[difficulty].opponentRequired);
      }
    });
  ```

  Import `DIFFICULTIES` and `DIFFICULTY_CONFIG` from `../lib/difficulty` if the file does not already.

  The third test is the one that would fail against a `difficulty === 'expert'` implementation, and it fails forever the moment a fifth mode is added with a different flag value. That is the point: the table is the only input (v1.2.2's Global Constraints).

- [ ] **Step 2.2: Verify red.**

  ```bash
  cd frontend && npx vitest run src/components/FinishButton.test.tsx
  ```

  Expected: **FAIL** if v1.2.2's `FinishButton` renders a disabled control instead of returning `null` for a non-required mode, or if it compares against the literal `'expert'`. If all three pass, that is a **verified** result, not a skipped step: record it in the changelog and keep the tests, because they are the standing guard for RD1.

- [ ] **Step 2.3: Make the control obey the flag, if it does not already.**

  In `frontend/src/components/FinishButton.tsx`, the render must open with the flag read from the table, and the hint text must not name a mode:

  ```tsx
    if (!DIFFICULTY_CONFIG[difficulty].opponentRequired) return null;
  ```

  The hint is composed from `DIFFICULTY_CONFIG[difficulty].label` and the flag, never from a hardcoded mode name, so a future mode that requires the opponent gets a correct sentence for free. Do **not** add a new prop, a screen, or a route: the affordance is a control plus a confirmation inside the existing board and dialog patterns, exactly as v1.2.2 built it (roadmap §5.2).

- [ ] **Step 2.4: Verify the page still gates the render.**

  ```bash
  cd frontend && grep -n "FinishButton" app/missing-eleven/page.tsx
  cd frontend && npx tsc --noEmit && npm run test && npm run lint
  ```

  Expected: the page renders `FinishButton` only inside the `gameStatus === 'playing'` view, and the surrender flow still calls `surrender` and never `finishGame`. `tsc` clean; the suite count is the Task 1 exit count plus 3; no new lint warnings.

  **Surrender stays ungated.** The page must not require anything of the opponent half before enabling the surrender control, and `handleSurrender` must not mark untouched opponent shirts `failed`. A surrendered `expert` result is 11 slots (RD2), and fabricating `failed` shirts would make v1.4.1's grid believe the opponent was played.

- [ ] **Step 2.5: Commit.**

  ```bash
  git add frontend/src/components/FinishButton.test.tsx frontend/src/components/FinishButton.tsx frontend/app/missing-eleven/page.tsx
  git commit -m "test(frontend): assert the Finish control is absent unless the mode requires the opponent"
  ```

---

### Task 3: Offer Expert

**Files:**
- Modify: `frontend/src/lib/difficulty.ts`
- Modify: `frontend/src/lib/difficulty.test.ts`
- Modify: `frontend/src/components/DifficultySelector.tsx`
- Modify: `frontend/src/components/DifficultySelector.test.tsx`

**Interfaces:**
- Consumes: nothing new; `DIFFICULTY_CONFIG.expert` was written and tested in v1.2.2.
- Produces: `DIFFICULTIES === ['easy', 'normal', 'hard', 'expert']`, and a selector description that states the three things that make Expert different.

- [ ] **Step 3.1: Update the failing test first.**

  In `frontend/src/lib/difficulty.test.ts`, replace the offer-list assertion:

  ```ts
    it('offers every mode that has shipped, in ascending order', () => {
      expect(DIFFICULTIES).toEqual(['easy', 'normal', 'hard', 'expert']);
    });
  ```

  and delete the `still withholds Expert until v1.2.4` test added in v1.2.3 Step 5.1.

- [ ] **Step 3.2: Verify red.**

  ```bash
  cd frontend && npx vitest run src/lib/difficulty.test.ts
  ```

  Expected: **FAIL** — `DIFFICULTIES` is `['easy', 'normal', 'hard']`.

- [ ] **Step 3.3: Append the mode.**

  In `frontend/src/lib/difficulty.ts`:

  ```ts
  /**
   * Modes offered in the UI, in ascending order. A mode is offered only once
   * the patch implementing its rules has shipped: v1.2.2 offers Easy and
   * Normal, v1.2.3 appends Hard (clue removal and the number mask), v1.2.4
   * appends Expert (three attempts and the required opponent). The gate that
   * makes Expert's opponent required lives in `gameState.ts`; the three
   * attempts and the mask are already config-driven.
   */
  export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard', 'expert'];
  ```

- [ ] **Step 3.4: Make the description state what makes Expert different.**

  In `frontend/src/components/DifficultySelector.tsx`, replace the return line of `describeMode`:

  ```ts
    const opponentText = c.opponentRequired ? 'opponent required' : 'opponent optional';
    return `${c.attempts} attempts · ${clueText} · ${c.showShirtNumber ? 'number shown' : 'number hidden'} · ${opponentText}`;
  ```

  Expert's row reads `3 attempts · no clues · number hidden · opponent required`.

  **"Optional" here is a claim about the gate, not yet about points.** Under RD1 the three non-Expert modes now auto-complete the moment the target half is resolved, so `opponent optional` describes a real, observable difference between the rows. It says nothing about scoring yet: v1.2.5 is the patch that makes the opponent a labelled optional *bonus* (§5.2) and the patch that makes the ×3 multiplier visible. Until then the points do not differ by mode at all, and the selector must not imply that they do.

  In `frontend/src/components/DifficultySelector.test.tsx`, add:

  ```tsx
    it('states that Expert requires the opponent and offers three attempts', () => {
      render(<DifficultySelector value="normal" onChange={() => {}} />);
      expect(screen.getByText(/3 attempts/)).toBeTruthy();
      expect(screen.getByText(/opponent required/)).toBeTruthy();
      expect(screen.getByText(/opponent optional/)).toBeTruthy();
    });
  ```

  `getByText(/opponent optional/)` must match exactly one node. If the copy in a later patch makes the two ambiguous, switch both to `getAllByText(...).length` assertions rather than loosening the regex.

- [ ] **Step 3.5: Verify green and run everything.**

  ```bash
  cd frontend && npx vitest run src/lib/difficulty.test.ts src/components/DifficultySelector.test.tsx
  ```

  Expected: both green; `difficulty.test.ts` back to 7 tests, the selector 6.

  ```bash
  cd frontend && npx tsc --noEmit && npm run test && npm run lint
  cd backend  && npm run test
  ```

  Expected: frontend all green; backend unchanged.

- [ ] **Step 3.6: Commit.**

  ```bash
  git add frontend/src/lib/difficulty.ts frontend/src/lib/difficulty.test.ts frontend/src/components/DifficultySelector.tsx frontend/src/components/DifficultySelector.test.tsx
  git commit -m "feat(frontend): offer Expert mode in the selector"
  ```

---

## Closed escalation — the §5.2 `opponentRequired` tension

**This is resolved. Do not re-open it inside v1.2.4, and do not carry it into
v1.2.5.** The answer is roadmap §5.2 as ratified, and it is recorded as **RD1** in
roadmap §9.1.

The tension was that §5.2 calls the opponent an "optional scorable bonus" in
Easy, Normal and Hard while `checkGameComplete` had always required all 22
shirts, so `opponentRequired: false` described a gate that did not exist. The two
answers on the table were (a) keep 22/22 everywhere and rewrite the docs, or
(b) let `easy`/`normal`/`hard` complete at 11/22. **Answer (b) is ratified.** The
gate is now one condition read from the mode table, so the flag and the gate
cannot disagree — there is nothing left to flag, because the disagreement *was*
the bug.

**What that changes for this patch, concretely:**

- `checkGameComplete` gains a `difficulty` parameter and stops demanding the
  opponent half in the three modes whose row says the opponent is optional.
- `easy`, `normal` and `hard` **auto-complete at 11/22** and the three modes'
  pre-existing completion tests are updated to set up a target half only. That is
  a behaviour change to three shipped modes, and it is the ratified one.
- The Finish control's absence in those three modes becomes a **test** here
  (Task 2), not a claim.

**What it does not change:** §5.1's mode table stays exactly as written, and the
"optional bonus" *labelling* still lands in v1.2.5 and not here, for the reason
§5.2 and §11 rule 5 give.

---

## Acceptance criteria

1. `FINISH_GAME` completes an `expert` game at 22/22 and changes nothing but `gameStatus`.
2. `FINISH_GAME` with the target half resolved but the opponent half untouched leaves `gameStatus: 'playing'` and both shirt arrays referentially untouched, in `expert`.
3. `FINISH_GAME` at 21/22 leaves `gameStatus: 'playing'`.
4. An `expert` game does **not** auto-complete when the 22nd shirt resolves; it stays `playing` until Finish.
5. `easy`, `normal` and `hard` **auto-complete at 11/22** with the opponent half untouched — the ratified RD1 consequence, asserted for all three modes.
6. `checkGameComplete` takes `difficulty` and reads `DIFFICULTY_CONFIG[difficulty].opponentRequired`; no call site omits the argument and no branch compares a mode name.
7. `SURRENDER` ends an `expert` game from 11 resolved shirts, leaves `gameStatus: 'surrendered'`, and marks no untouched opponent shirt `failed` — the RD2 11-slot result.
8. The Finish control renders **nothing at all** when `opponentRequired` is false, asserted for `easy`, `normal` and `hard` at `resolved={22}`, and asserted by a property test over `DIFFICULTIES` rather than by hand-written mode cases.
9. The Finish control is created in **v1.2.2** and consumed here unchanged: a control plus a confirmation inside the existing board and dialog patterns, not a screen. This patch adds no new prop, route, or dialog.
10. The gate is enforced in the reducer, not only by a `disabled` attribute.
11. Finishing never mutates a shirt's `state`, so the score at the moment of finishing equals the score before it.
12. Expert plays 3 attempts per shirt, with no further code change in this patch — asserted by the existing config-driven attempt tests plus `DIFFICULTY_CONFIG.expert.attempts === 3`.
13. `DIFFICULTIES` is `['easy', 'normal', 'hard', 'expert']`.
14. The selector describes Expert as `3 attempts · no clues · number hidden · opponent required`.
15. `expert.multiplier` is still read by nothing; no scoring code changed.
16. Frontend: full suite green, `tsc` clean, `lint` clean. Backend: untouched and green.

## Validation

| Check | Command | Pass signal |
|---|---|---|
| Gate + auto-complete | `cd frontend && npx vitest run src/lib/gameState.test.ts` | all green, including the four updated pre-existing completion tests |
| RD1 config-driven gate | `grep -n "opponentRequired" frontend/src/lib/gameState.ts` | hits only inside `checkGameComplete` and `handleSubmitGuess`; no `=== 'expert'` |
| Every call site updated | `grep -rn "checkGameComplete" frontend/src frontend/app` | no call omits the `difficulty` argument |
| Surrender stays ungated | `cd frontend && npx vitest run src/lib/gameState.test.ts -t "surrender is not gated"` | 2 passed |
| Hook surface | `cd frontend && npx vitest run src/lib/gameState.hook.test.ts` | all green |
| Finish absence | `cd frontend && npx vitest run src/components/FinishButton.test.tsx` | v1.2.2's cases plus the 3 added here |
| Offer list | `cd frontend && npx vitest run src/lib/difficulty.test.ts` | `7 passed (7)` |
| Full frontend | `cd frontend && npm run test` | every file green |
| Types | `cd frontend && npx tsc --noEmit` | no output |
| Lint | `cd frontend && npm run lint` | no output |
| One mode branch only | `grep -rn "=== 'expert'\|=== 'easy'\|=== 'normal'\|=== 'hard'" frontend/src/lib frontend/app frontend/components frontend/src/components` | no output |
| Gate is in the reducer | `grep -n "checkGameComplete" frontend/src/lib/gameState.ts` | the predicate, the `handleSubmitGuess` completion site, and `handleFinishGame` |
| Emptiness guard is over the **whole** lineup, not one half | `grep -n "all\.length" frontend/src/lib/gameState.ts` | exactly one hit, inside `checkGameComplete`, on the emptiness guard Step 1.3 writes against `[...target, ...opponent]` |
| …and that guard is not over one half | `grep -n "target\.length" frontend/src/lib/gameState.ts` | no output — the pre-patch bug this patch removes was a `target`-only guard |
| No scoring change | `git diff --stat <base> -- frontend/src/lib/scoring.ts frontend/components/GameComplete.tsx` | empty |
| Tests are collected | `cd frontend && npx vitest list 2>&1 \| grep -c FinishButton` | 1, not 0 |
| Backend untouched | `cd backend && npm run test` | every file green; count measured and recorded, not asserted |

## Risks

| Risk | Mitigation |
|---|---|
| **Three shipped modes now end at 11/22 instead of 22/22.** | Ratified (RD1) and asserted in both directions: Normal/Easy/Hard auto-complete at 11/22, and `expert` refuses. The pre-existing completion tests are updated to a target half, and the change is recorded in the changelog rather than hidden in a re-narrowed predicate. |
| **A pre-existing test asserts 22/22 as a precondition for `complete`.** | That assertion was pinning the defect. Update the fixture to a target half; do **not** re-narrow `checkGameComplete` to make it pass. If a test genuinely needs a 22/22 completion, it should set `difficulty: 'expert'`. |
| **Suppressing auto-complete in Expert surprises a player who has just solved 22/22** and sees nothing happen. | The Finish control is present and enabled at that moment, and v1.2.2's confirmation makes the last step explicit. If playtesting finds it confusing, the fix is a copy change, not a behaviour change. |
| **The gate is duplicated** between the control's `locked` expression and `checkGameComplete`. | They are not the same predicate: the control also requires `total === 22`, which the reducer's emptiness guard tolerates. Duplication here is a UI courtesy; the reducer is authoritative and is the one with tests. A comment on each says so. |
| **The surrender path quietly gains an opponent requirement.** | `surrender is not gated` asserts both the 11-slot outcome and that untouched opponent shirts stay `default` with `attempts === 0`. A synthetic `failed` would make v1.4.1's `opponentAttempted` claim the opponent was played. |
| **`state.difficulty` read inside `handleSubmitGuess` is the mode at submit time**, not the mode when the game started. | The selector is not rendered once `gameStatus === 'playing'`, so the mode cannot change mid-game. Asserted in v1.2.2's "leaves the board and the shirts untouched" test and by the conditional render. |
| **Expert's three attempts shipped in v1.2.2 but were untestable** — no UI could select the mode. | Task 3 makes it selectable and the existing config-driven attempt tests cover the budget. The `does not auto-complete` tests are new here and carry the mode-specific risk. |

**Escalate before proceeding only if:** `DIFFICULTY_CONFIG` no longer exposes
`opponentRequired` as a boolean per mode, or a future mode needs "required to
complete" and "opponent in the share grid" to differ — the latter is v1.4.1's
concern and is closed there (RD4). The §5.2 gate question itself is **not** an
escalation any more.
