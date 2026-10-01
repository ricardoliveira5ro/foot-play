# Multiplier Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The multiplier in `DIFFICULTY_CONFIG` becomes real. Every shirt's score is scaled by the mode's multiplier — the correct branch and the failed branch both — and the GameComplete breakdown shows the multiplier it applied, so the displayed total is the sum of the visible line items. The opponent lineup is labelled as an **optional bonus** in Easy, Normal and Hard and as **required** in Expert, because a UI that shows the same two team sections in every mode implies a requirement that does not exist in three of them. Both labels read `opponentRequired` — the same field the completion gate reads since v1.2.4 — so the score breakdown and the gate cannot disagree (roadmap §5.2, §9.1 RD1).

**Architecture:** `scorePlayer` gains a fifth parameter with a default of `1`, and `computeTotalScore` gains a fifth parameter with a default of `1`, so every existing caller keeps working and every existing test keeps its expected value. The scaling is applied inside `scorePlayer` — the single place the two expressions live — and `computeTotalScore` forwards the multiplier and records it on each `PerPlayerScore` so the breakdown can render it. The total is **not** recomputed from the multiplier: it is the sum of the already-scaled line items, which is what makes the breakdown add up (§5.3).

**Tech Stack:** TypeScript, Next 16 / React 19, Vitest + `@testing-library/react`, jsdom for component tests.

---

## Global Constraints

- **The two expressions are scaled as-is, not re-derived.** §5.3 names the exact two and names the two specific errors a re-derivation invites. `max(1000 − 200 × (attempts − 1), 100)` and `round((uniqueCorrectLetters / totalLetters) × 150)` are wrapped, not rewritten. The `100` floor stays inside the multiplication, and the numerator stays unique letters — never the raw count of correct letters across guesses.
- **Exactly one `Math.round` per branch, applied to the scaled result.** `Math.round(base × multiplier)` and `Math.round(ratio × 150 × multiplier)`. Rounding the base first and then multiplying would make `×0.5` on an odd number lose a half-point, and the two call sites would disagree about whether they were rounding pre- or post-scale. This is the symmetric rule and it preserves `×1` exactly: `Math.round(x × 1) === Math.round(x)`.
- **The `100` floor is a base floor, not a post-scale floor.** A shirt whose attempt decay bottoms out scores `100 × 0.5 = 50` in Easy. Re-applying `Math.max(..., 100)` after scaling would floor every Easy shirt at 100 and erase the multiplier's effect exactly where it is most visible. Asserted explicitly.
- **Scaling only the correct branch is forbidden.** A failed shirt in Hard would then out-earn a clean Easy win, because Hard removes every clue and the player usually fails.
- **Both call sites pass the same multiplier.** `frontend/src/components/GameComplete.tsx:122` and `frontend/app/missing-eleven/page.tsx:268` both compute a score, and the live counter on the page must agree with the final dialog. If either omits the argument it defaults to `1` and the game reads as if no multiplier exists.
- **The multiplier is a default parameter, not a required one.** `scorePlayer(..., multiplier: number = 1)` and `computeTotalScore(..., multiplier: number = 1)`. The defaults preserve every existing test's expected value; changing them to required parameters would mean editing 20 passing assertions to re-state something the default already says.
- **`PerPlayerScore` gains `multiplier: number`.** It is recorded on each line so the breakdown can render `×2` next to the points without re-deriving it. The `grandTotal` is still `perPlayer.reduce(...)` over the already-scaled `totalPoints` — no second multiplication anywhere.
- **"Optional bonus" labelling lands here and not in v1.2.4.** §5.2 defers it to this patch for a stated reason: "optional" is only a meaningful word once a mode exists where the opponent is not required. It is now. v1.2.4's selector text says `opponent optional`, which describes the gate; this patch makes the *score section* say the same thing, which is where a player looks to find out what is worth points.
- **The label reads `opponentRequired`, and that is now the whole story.** v1.2.4 made the completion gate mode-dependent (roadmap §5.2, RD1), so the flag is no longer a description of something else: it is the same field the gate reads, the same field `FinishButton` reads, and the same field this label reads. One flag, one truth, three consumers — the label **cannot** contradict the gate, and there is no longer an open question about which way the gate goes. The three-mode `optional bonus` label is correct as written, and the `Expert required` case is the one that proves the label is conditional rather than hardcoded.
- **The opponent label must be honest about a game the player never opposed.** A `normal` game that auto-completed at 11/22 (RD1) has no opponent bonus to label, because there is no opponent bonus in the result. The GameComplete section is therefore rendered from the same question v1.4.1 asks of the share grid — *did the player put an attempt into the opponent half* — and an untouched half reads `optional bonus — not played this game` rather than implying points that are not on the line. A surrendered game says the same thing.
- **No new component test outside `frontend/src/`**, and every new test file carries `// @vitest-environment jsdom` and imports outward with `../../components/...`.
- **Regression commands, run at every task boundary:**

  ```bash
  cd backend  && npm run test              # unchanged by this patch
  cd frontend && npm run test
  cd frontend && npx tsc --noEmit
  cd frontend && npm run lint
  ```

  Baseline is the v1.2.4 exit state. Measure, do not assume.

---

## Files touched

| File | Change |
|---|---|
| `frontend/src/lib/scoring.ts` | `multiplier` on `scorePlayer` and `computeTotalScore`; `PerPlayerScore.multiplier` |
| `frontend/src/lib/scoring.test.ts` | multiplier tests: parity, ×0.5, ×2, ×3, floor, repeated letters, breakdown sum |
| `frontend/src/components/GameComplete.tsx` | `difficulty` prop, per-shirt multiplier in the breakdown, opponent section label |
| `frontend/src/components/GameComplete.test.tsx` | multiplier display and label tests |
| `frontend/app/missing-eleven/page.tsx` | pass the multiplier to both `computeTotalScore` call sites and the difficulty to `GameComplete` |

---

## Tasks

### Task 1: Scale the two branches

**Files:**
- Modify: `frontend/src/lib/scoring.ts` (`:3-15`, `:27-50`, `:52-95`)
- Modify: `frontend/src/lib/scoring.test.ts`

**Interfaces:**
- Produces the third **frozen cross-line contract**:

  ```ts
  export function scorePlayer(
    attempts: number,
    correct: boolean,
    uniqueCorrectLetters: number,
    totalLetters: number,
    multiplier: number = 1,
  ): number;

  export function computeTotalScore(
    targetShirts: ShirtGameData[],
    opponentShirts: ShirtGameData[],
    targetTeamName: string,
    opponentTeamName: string,
    multiplier: number = 1,
  ): ScoreBreakdown;

  export interface PerPlayerScore {
    // ...existing fields...
    /** Mode multiplier applied to this line. 1 when no mode is in play. */
    multiplier: number;
  }
  ```

- [ ] **Step 1.1: Write the failing tests first.**

  Append to `frontend/src/lib/scoring.test.ts`, as a new top-level `describe`:

  ```ts
  describe('multiplier scaling', () => {
    describe('scorePlayer', () => {
      it('leaves every score unchanged at ×1', () => {
        // The default-argument contract: any caller that does not pass a
        // multiplier gets the pre-v1.2.5 value, byte for byte.
        expect(scorePlayer(1, true, 0, 0)).toBe(1000);
        expect(scorePlayer(3, true, 0, 0)).toBe(600);
        expect(scorePlayer(6, true, 0, 0)).toBe(100);
        expect(scorePlayer(3, false, 3, 6)).toBe(75);
        expect(scorePlayer(6, false, 0, 5)).toBe(0);
        expect(scorePlayer(3, false, 5, 0)).toBe(0);
      });

      it('scales a first-try correct guess by ×2 and ×3', () => {
        expect(scorePlayer(1, true, 0, 0, 2)).toBe(2000);
        expect(scorePlayer(1, true, 0, 0, 3)).toBe(3000);
        expect(scorePlayer(1, true, 0, 0, 0.5)).toBe(500);
      });

      it('scales a decayed correct guess by the same factor', () => {
        expect(scorePlayer(2, true, 0, 0, 2)).toBe(1600);
        expect(scorePlayer(4, true, 0, 0, 2)).toBe(800);
        expect(scorePlayer(3, true, 0, 0, 3)).toBe(1800);
      });

      it('applies the 100 floor before scaling, so ×0.5 of 100 is 50', () => {
        // The floor belongs to the base, not to the result. Re-applying
        // Math.max(..., 100) after scaling would floor every Easy shirt at
        // 100 and hide the multiplier exactly where it is most visible.
        expect(scorePlayer(6, true, 0, 0, 1)).toBe(100);
        expect(scorePlayer(6, true, 0, 0, 0.5)).toBe(50);
        expect(scorePlayer(6, true, 0, 0, 2)).toBe(200);
        expect(scorePlayer(6, true, 0, 0, 3)).toBe(300);
      });

      it('scales failed partial credit by the same factor', () => {
        expect(scorePlayer(6, false, 3, 6, 2)).toBe(150);
        expect(scorePlayer(6, false, 3, 6, 3)).toBe(225);
        expect(scorePlayer(6, false, 3, 6, 0.5)).toBe(38);
      });

      it('rounds once, on the scaled result', () => {
        // 3/6 × 150 = 75 exactly; 1/3 × 150 = 50 exactly. Use a ratio that
        // does not divide evenly: 1/8 × 150 = 18.75.
        expect(scorePlayer(6, false, 1, 8, 1)).toBe(19);
        expect(scorePlayer(6, false, 1, 8, 2)).toBe(38);
        expect(scorePlayer(6, false, 1, 8, 0.5)).toBe(9);
        // 0.5 of 18.75 is 9.375, which rounds to 9. Rounding the base first
        // would give round(18.75)=19, and 19 × 0.5 = 9.5 -> 10. The two
        // orders disagree, and this is the case that catches it.
        expect(scorePlayer(6, false, 1, 8, 0.5)).not.toBe(10);
      });

      it('does not double-count a repeated letter', () => {
        // "Müller" has two l's. Guessing one l and getting it right twice
        // across attempts must not count as two unique letters. The numerator
        // is the unique count, and the multiplier does not change that.
        // The two values are 1/6 x 150 x 2 = 50 and 2/6 x 150 x 2 = 100, and
        // they must be asserted as two distinct numbers: an equality between
        // them would be a claim that 50 === 100, i.e. that the numerator does
        // not reach the formula at all.
        expect(scorePlayer(6, false, 1, 6, 2)).toBe(50);
        expect(scorePlayer(6, false, 2, 6, 2)).toBe(100);
      });

      it('keeps a zero-length name at zero under every multiplier', () => {
        for (const m of [1, 0.5, 2, 3]) {
          expect(scorePlayer(3, false, 0, 0, m)).toBe(0);
        }
      });
    });

    describe('computeTotalScore', () => {
      const shirt = (over: Partial<ShirtGameData> = {}): ShirtGameData => ({
        token: 't', nameLength: 6, wordBoundaries: [], shirtNumber: 9,
        position: 'ST', coords: { x: 50, y: 50 }, state: 'correct',
        attempts: 1, guessHistory: [], correctLetters: [], ...over,
      });

      it('sums the scaled line items, so the breakdown adds up to the total', () => {
        const target = [
          shirt({ token: 'a' }),
          shirt({ token: 'b', state: 'failed', attempts: 6, correctLetters: ['A', 'C'] }),
        ];
        const opponent = [shirt({ token: 'c', state: 'failed', attempts: 3, correctLetters: ['A'] })];
        for (const m of [1, 0.5, 2, 3]) {
          const breakdown = computeTotalScore(target, opponent, 'Home', 'Away', m);
          const summed = breakdown.perPlayer.reduce((sum, p) => sum + p.totalPoints, 0);
          expect(breakdown.grandTotal).toBe(summed);
          for (const p of breakdown.perPlayer) expect(p.multiplier).toBe(m);
        }
      });

      it('scales the grand total as a whole', () => {
        const target = Array.from({ length: 11 }, (_, i) => shirt({ token: `t${i}` }));
        const opponent: ShirtGameData[] = [];
        const at1 = computeTotalScore(target, opponent, 'Home', 'Away').grandTotal;
        expect(at1).toBe(11000);
        expect(computeTotalScore(target, opponent, 'Home', 'Away', 2).grandTotal).toBe(22000);
        expect(computeTotalScore(target, opponent, 'Home', 'Away', 0.5).grandTotal).toBe(5500);
        expect(computeTotalScore(target, opponent, 'Home', 'Away', 3).grandTotal).toBe(33000);
      });

      it('leaves letterPoints and totalPoints consistent for a failed shirt', () => {
        const target = [shirt({ state: 'failed', attempts: 6, correctLetters: ['A', 'C'] })];
        const breakdown = computeTotalScore(target, [], 'Home', 'Away', 2);
        const line = breakdown.perPlayer[0];
        // For a failed shirt the line is only the letter credit, and it is
        // already scaled. Multiplying it again here would double-count.
        expect(line.letterPoints).toBe(100);
        expect(line.totalPoints).toBe(line.letterPoints);
      });

      it('keeps a correct shirt at zero letter points', () => {
        const target = [shirt({ state: 'correct', attempts: 2 })];
        const line = computeTotalScore(target, [], 'Home', 'Away', 3).perPlayer[0];
        expect(line.letterPoints).toBe(0);
        // (1000 - (2 - 1) x 200) x 3 = 800 x 3 = 2400. Note the 1800 in the
        // decayed-correct test above is the THREE-attempt value (600 x 3); at
        // two attempts the base is 800, not 600.
        expect(line.totalPoints).toBe(2400);
      });

      it('defaults to no scaling when the multiplier is omitted', () => {
        const target = [shirt({ token: 'a' })];
        expect(computeTotalScore(target, [], 'Home', 'Away').grandTotal)
          .toBe(computeTotalScore(target, [], 'Home', 'Away', 1).grandTotal);
      });
    });
  });
  ```

  Add the imports the new block needs: `computeTotalScore` and `ShirtGameData` if the file does not already import them.

  **On the `does not double-count a repeated letter` test.** It asserts both that the unique count is what is used and that the multiplier does not change the numerator. The two expectations are `scorePlayer(6, false, 1, 6, 2) === 50` (1/6 × 150 × 2) and `scorePlayer(6, false, 2, 6, 2) === 100` (2/6 × 150 × 2), and those are the numbers that fail if someone substitutes the raw correct-letter count for the unique count and then inflates the numerator by the multiplier. **There is deliberately no `toBe(scorePlayer(...))` self-comparison between them:** the two values are different by construction, so asserting they are equal would assert the bug.

- [ ] **Step 1.2: Verify red.**

  ```bash
  cd frontend && npx vitest run src/lib/scoring.test.ts
  ```

  Expected: **FAIL** across the new block — the extra arguments are ignored today, so every scaled expectation returns the unscaled value (`500` vs `1000`, `38` vs `75`), `line.multiplier` is `undefined`, and the `computeTotalScore` calls with a fifth argument compile fine but ignore it.

- [ ] **Step 1.3: Implement the scaling.**

  In `frontend/src/lib/scoring.ts`:

  1. Add `multiplier` to `PerPlayerScore`, after `totalPoints`:

     ```ts
     /** Total points for this shirt. */
     totalPoints: number;
     /** Mode multiplier applied to this line, for display. 1 when unscaled. */
     multiplier: number;
     ```

  2. Replace the `scorePlayer` signature and body with:

     ```ts
     export function scorePlayer(
       attempts: number,
       correct: boolean,
       uniqueCorrectLetters: number,
       totalLetters: number,
       multiplier: number = 1,
     ): number {
       if (correct) {
         // The floor is part of the BASE, not of the result: a shirt that has
         // bottomed out at 100 is worth 50 in Easy and 300 in Expert. Applying
         // the floor after scaling would flatten the bottom of the range and
         // make the multiplier invisible exactly where it matters.
         const base = Math.max(
           BASE_CORRECT_SCORE - (Math.max(attempts, 1) - 1) * ATTEMPT_PENALTY,
           MIN_CORRECT_SCORE,
         );
         return Math.round(base * multiplier);
       }

       if (totalLetters === 0) return 0;
       // `uniqueCorrectLetters` is the count of DISTINCT correct letters, so a
       // letter guessed correctly in three attempts is still worth one. The
       // multiplier scales the credit; it does not change what counts.
       return Math.round((uniqueCorrectLetters / totalLetters) * LETTER_SCORE_MAX * multiplier);
     }
     ```

  3. Add the parameter to `computeTotalScore` and thread it through:

     ```ts
     export function computeTotalScore(
       targetShirts: ShirtGameData[],
       opponentShirts: ShirtGameData[],
       targetTeamName: string,
       opponentTeamName: string,
       multiplier: number = 1,
     ): ScoreBreakdown {
       const processTeam = (shirts: ShirtGameData[], team: string): PerPlayerScore[] =>
         shirts.map(shirt => {
           const correct = shirt.state === 'correct';
           const letterPoints = correct
             ? 0
             : scorePlayer(shirt.attempts, false, shirt.correctLetters.length, shirt.nameLength, multiplier);
           const totalPoints = correct
             ? scorePlayer(shirt.attempts, true, 0, 0, multiplier)
             : letterPoints;

           return {
             token: shirt.token,
             shirtNumber: shirt.shirtNumber,
             team,
             attempts: shirt.attempts,
             correct,
             letterPoints,
             totalPoints,
             multiplier,
           };
         });
     ```

     The rest of the function is unchanged: `grandTotal` is still the sum of the already-scaled `totalPoints`. **Do not multiply it again** — the `sums the scaled line items` test fails the moment that happens.

  4. Update the `scorePlayer` doc comment above the function to state that both branches are scaled and that the multiplier defaults to 1.

- [ ] **Step 1.4: Verify green, then the whole frontend.**

  ```bash
  cd frontend && npx vitest run src/lib/scoring.test.ts
  ```

  Expected: the file green, all 20 pre-existing tests included. If any pre-existing assertion fails, the default argument is wrong — every number in `scoring.test.ts` before this patch is a ×1 expectation.

  ```bash
  cd frontend && npx tsc --noEmit && npm run test && npm run lint
  ```

  Expected: `tsc` clean, every file green, no new lint warnings. `GameComplete.test.tsx` and `GameComplete.tsx` will not compile-fail — `PerPlayerScore` gained a field, and any test constructing one literally needs it; add `multiplier: 1` to those literals.

- [ ] **Step 1.5: Commit.**

  ```bash
  git add frontend/src/lib/scoring.ts frontend/src/lib/scoring.test.ts
  git commit -m "feat(frontend): scale both scoring branches by the mode multiplier"
  ```

---

### Task 2: Show the multiplier and label the opponent

**Files:**
- Modify: `frontend/src/components/GameComplete.tsx` (props, `:122`, the per-shirt row, the opponent section header)
- Modify: `frontend/src/components/GameComplete.test.tsx`
- Modify: `frontend/app/missing-eleven/page.tsx` (`:268`, the `<GameComplete>` call)

**Interfaces:**
- Consumes: `DIFFICULTY_CONFIG`, `DEFAULT_DIFFICULTY`, `type Difficulty` from `@/lib/difficulty`; the new `PerPlayerScore.multiplier`.
- Produces: `GameCompleteProps` gains `difficulty?: Difficulty`, defaulting to `DEFAULT_DIFFICULTY`, so every existing call site and test keeps compiling and keeps showing unscaled numbers.

- [ ] **Step 2.1: Write the failing tests first.**

  Append to `frontend/src/components/GameComplete.test.tsx`, in a new `describe`:

  ```tsx
    describe('mode multiplier', () => {
      it('shows the multiplier next to the grand total', () => {
        render(
          <GameComplete
            targetShirts={solvedShirts()}
            opponentShirts={[]}
            targetTeamName="Home"
            opponentTeamName="Away"
            onPlayAgain={() => {}}
            onChangeBoard={() => {}}
            difficulty="hard"
          />,
        );
        expect(screen.getByTestId('grand-total-multiplier').textContent).toBe('×2');
      });

      it('shows the multiplier on each per-shirt line', () => {
        render(
          <GameComplete
            targetShirts={solvedShirts()}
            opponentShirts={[]}
            targetTeamName="Home"
            opponentTeamName="Away"
            onPlayAgain={() => {}}
            onChangeBoard={() => {}}
            difficulty="expert"
          />,
        );
        const badges = screen.getAllByTestId('per-player-multiplier');
        expect(badges.length).toBeGreaterThan(0);
        for (const badge of badges) expect(badge.textContent).toBe('×3');
      });

      it('shows no multiplier badge in Normal', () => {
        render(
          <GameComplete
            targetShirts={solvedShirts()}
            opponentShirts={[]}
            targetTeamName="Home"
            opponentTeamName="Away"
            onPlayAgain={() => {}}
            onChangeBoard={() => {}}
            difficulty="normal"
          />,
        );
        expect(screen.queryByTestId('grand-total-multiplier')).toBeNull();
        expect(screen.queryAllByTestId('per-player-multiplier')).toHaveLength(0);
      });

      it('labels the opponent an optional bonus in Easy, Normal and Hard', () => {
        for (const difficulty of ['easy', 'normal', 'hard'] as const) {
          const { unmount } = render(
            <GameComplete
              targetShirts={solvedShirts()}
              opponentShirts={solvedShirts('opp')}
              targetTeamName="Home"
              opponentTeamName="Away"
              onPlayAgain={() => {}}
              onChangeBoard={() => {}}
              difficulty={difficulty}
            />,
          );
          expect(screen.getByTestId('opponent-section-label').textContent)
            .toMatch(/optional bonus/i);
          unmount();
        }
      });

      it('labels the opponent required in Expert', () => {
        render(
          <GameComplete
            targetShirts={solvedShirts()}
            opponentShirts={solvedShirts('opp')}
            targetTeamName="Home"
            opponentTeamName="Away"
            onPlayAgain={() => {}}
            onChangeBoard={() => {}}
            difficulty="expert"
          />,
        );
        expect(screen.getByTestId('opponent-section-label').textContent)
          .toMatch(/required/i);
        expect(screen.getByTestId('opponent-section-label').textContent)
          .not.toMatch(/optional/i);
      });
    });
  ```

  Add a `solvedShirts(prefix = 't')` fixture at the top of the test file returning 11 `correct` shirts with distinct tokens, reusing the file's existing `ShirtGameData` builder if it has one. Use the real `GameComplete` prop names from the file — read the interface before writing this block, and add the props the interface actually declares (`onPlayAgain`, `onChangeBoard`, and any `scores`/`activeTab` props) rather than assuming.

- [ ] **Step 2.2: Verify red.**

  ```bash
  cd frontend && npx vitest run src/components/GameComplete.test.tsx
  ```

  Expected: **FAIL** on the new block — `difficulty` is not a prop, so the four `data-testid`s do not exist. If the failures are only "unknown prop" type errors, note that vitest does not type-check: the red must be a missing element.

- [ ] **Step 2.3: Implement the prop and the two call sites.**

  In `frontend/src/components/GameComplete.tsx`:

  1. Add the imports:

     ```tsx
     import { DEFAULT_DIFFICULTY, DIFFICULTY_CONFIG, type Difficulty } from '../lib/difficulty';
     ```

  2. Add to `GameCompleteProps`:

     ```ts
     /** Mode in force. Drives the multiplier display and the opponent label. */
     difficulty?: Difficulty;
     ```

  3. Destructure `difficulty = DEFAULT_DIFFICULTY` in the signature and derive:

     ```tsx
     const multiplier = DIFFICULTY_CONFIG[difficulty].multiplier;
     ```

  4. Replace the `computeTotalScore` call at line 122 with the multiplier appended:

     ```tsx
     const scoreBreakdown = computeTotalScore(targetShirts, opponentShirts, targetTeamName, opponentTeamName, DIFFICULTY_CONFIG[difficulty].multiplier);
     ```

  5. Next to the grand total, render the multiplier — and only when it is not 1, so Normal is visually unchanged:

     ```tsx
     {multiplier !== 1 && (
       <span data-testid="grand-total-multiplier" className="text-ink/60">
         ×{multiplier}
       </span>
     )}
     ```

     Use a formatting helper rather than `×{multiplier}` for the fractional case, because `0.5` renders as `0.5` but `2` renders as `2` and both read as `×0.5` / `×2`, which is what we want. If the codebase prefers a `formatMultiplier` helper, add it to `scoring.ts` and unit-test it; do not inline `Number(multiplier.toFixed(1))` in two places.

  6. In the per-shirt row, after the points, render:

     ```tsx
     {p.multiplier !== 1 && (
       <span data-testid="per-player-multiplier" className="text-ink/50">
         ×{p.multiplier}
       </span>
     )}
     ```

     Read the multiplier off the line item, not off the prop, so the badge describes the number actually printed beside it.

   7. In the opponent section header, render:

      ```tsx
      <h3 data-testid="opponent-section-label">
        {opponentTeamName}
        <span className="ml-2 text-ink/50">
          {opponentLabel(opponentAttempted, difficulty)}
        </span>
      </h3>
      ```

      with a small pure helper in `GameComplete.tsx`:

      ```tsx
      /**
       * How the opponent section is labelled (§5.2, RD1).
       *
       * `opponentRequired` says the mode needs the opponent; `opponentAttempted`
       * says whether the player actually put an attempt into it. Both matter,
       * and they are different questions: under RD1 a `normal` game can end at
       * 11/22 with the opponent untouched, so "optional bonus" on its own would
       * point at points that are not on the line.
       */
      function opponentLabel(opponentAttempted: boolean, difficulty: Difficulty): string {
        if (DIFFICULTY_CONFIG[difficulty].opponentRequired) return 'required';
        return opponentAttempted ? 'optional bonus' : 'optional bonus — not played this game';
      }
      ```

      `opponentAttempted` is derived, never stored: `opponentShirts.some((shirt) => shirt.attempts > 0)`. **Derive it in `GameComplete` from the shirts it already receives** — do not add a prop for it here, and do not add a `GameState` field. This is the same derivation v1.4.1's share grid uses, which is why a surrendered game renders honestly in both places without either patch knowing about the other.

      The label reads `opponentRequired` because that is the field that means "this mode needs the opponent" (§5.2) — and since v1.2.4 it is the **same** field the completion gate reads, so the label and the gate are incapable of disagreeing.

  In `frontend/app/missing-eleven/page.tsx`:

  1. At the live-score call site around line 268, append the multiplier:

     ```tsx
     computeTotalScore(
       state.targetShirts,
       state.opponentShirts,
       targetTeamName,
       opponentTeamName,
       DIFFICULTY_CONFIG[state.difficulty].multiplier,
     )
     ```

     **This is the call site that is easiest to forget**, and forgetting it does not crash: the default `1` makes the live counter show unmultiplied points while the final dialog shows multiplied ones, so the score appears to jump at the end of the game. The page already imports `DIFFICULTY_CONFIG` from v1.2.2 Task 4.

  2. Pass `difficulty={state.difficulty}` to `<GameComplete>`.

- [ ] **Step 2.4: Prove both call sites agree.**

  ```bash
  grep -n "computeTotalScore(" frontend/app/missing-eleven/page.tsx frontend/src/components/GameComplete.tsx frontend/src/lib/scoring.ts
  ```

  Expected: exactly two call sites — one in the page, one in `GameComplete` — and both with a fifth argument. Any call site with four arguments computes an unmultiplied score.

  ```bash
  grep -n "scorePlayer(" frontend/src/lib/scoring.ts
  ```

  Expected: two calls, both with a fifth argument. A `scorePlayer` call without the multiplier inside `computeTotalScore` would leave `letterPoints` unscaled while `totalPoints` was scaled.

- [ ] **Step 2.5: Verify green and run everything.**

  ```bash
  cd frontend && npx vitest run src/components/GameComplete.test.tsx
  ```

  Expected: the file green, all 20 pre-existing tests included. A pre-existing failure means the multiplier is showing where it should not — check step 2.3 item 5.

  ```bash
  cd frontend && npx tsc --noEmit && npm run test && npm run lint
  cd backend  && npm run test
  ```

  Expected: frontend all green; backend unchanged.

- [ ] **Step 2.6: Commit.**

  ```bash
  git add frontend/src/components/GameComplete.tsx frontend/src/components/GameComplete.test.tsx frontend/app/missing-eleven/page.tsx
  git commit -m "feat(frontend): show the mode multiplier and label the opponent bonus"
  ```

---

## Acceptance criteria

1. `scorePlayer` accepts a fifth `multiplier` argument defaulting to `1`, and every pre-v1.2.5 expected value is unchanged at ×1.
2. The correct branch scales: `×2` on a first-try guess is `2000`, `×0.5` is `500`, `×3` is `3000`.
3. The failed branch scales by the same factor: `3/6` letters at `×2` is `150`, at `×3` is `225`, at `×0.5` is `38`.
4. The `100` floor is pre-multiplier: `6` attempts at `×0.5` is `50`, not `100`.
5. Exactly one `Math.round` per branch, on the scaled value: `1/8` letters at `×0.5` is `9`, not `10`.
6. The numerator stays the unique-letter count, and the multiplier does not inflate it: `1/6` at `×2` is `50`, `2/6` at `×2` is `100`.
7. A zero-length name scores `0` under every multiplier.
8. `PerPlayerScore` carries `multiplier`, and `grandTotal` is the sum of the already-scaled line items for every multiplier tested.
9. `letterPoints` and `totalPoints` agree for a failed shirt — the credit is scaled once, not twice.
10. Both `computeTotalScore` call sites pass the multiplier, so the live counter and the final dialog agree.
11. The grand total shows `×2` in Hard and `×3` in Expert, and shows no multiplier badge in Normal.
12. Each per-shirt line shows the multiplier that produced its number, or no badge when the multiplier is 1.
13. The opponent section reads `required` in Expert, `optional bonus` in Easy/Normal/Hard **when the player put an attempt into the opponent half**, and `optional bonus — not played this game` when they did not. The label is a pure function of `DIFFICULTY_CONFIG[difficulty].opponentRequired` and `opponentShirts.some(s => s.attempts > 0)`, and of nothing else.
14. An `expert` result always reads `required`; a `normal` game that auto-completed at 11/22 under RD1 reads `not played this game`, because there is no bonus on the line to point at.
15. The multiplier display is not duplicated inline in two places; a shared formatter is used if one is needed.
16. Frontend: full suite green, `tsc` clean, `lint` clean. Backend: untouched and green.

## Validation

| Check | Command | Pass signal |
|---|---|---|
| Scaling unit | `cd frontend && npx vitest run src/lib/scoring.test.ts` | all green, pre-existing included |
| Breakdown display | `cd frontend && npx vitest run src/components/GameComplete.test.tsx` | all green |
| Full frontend | `cd frontend && npm run test` | every file green |
| Types | `cd frontend && npx tsc --noEmit` | no output |
| Lint | `cd frontend && npm run lint` | no output |
| Both call sites scaled | `grep -n -A 6 "computeTotalScore(" frontend/app/missing-eleven/page.tsx frontend/src/components/GameComplete.tsx` | a fifth argument in each |
| Both `scorePlayer` calls scaled | `grep -n "scorePlayer(" frontend/src/lib/scoring.ts` | two calls, each ending in `multiplier)` |
| No second multiplication | `grep -n "grandTotal" frontend/src/lib/scoring.ts` | a single `reduce` over `totalPoints`, no `* multiplier` |
| Signatures match the frozen contract | `grep -n "multiplier: number = 1" frontend/src/lib/scoring.ts` | two hits |
| Label reads the flag, not a mode name | `grep -n "opponentRequired" frontend/src/components/GameComplete.tsx` | a hit inside `opponentLabel`, with no `=== 'expert'` |
| `opponentAttempted` is derived | `grep -n "opponentAttempted" frontend/src/components/GameComplete.tsx` | exactly one `some(` derivation, no prop and no `GameState` field |
| Tests are collected | `cd frontend && npx vitest list 2>&1 \| grep -c GameComplete` | 1, not 0 |
| Backend untouched | `cd backend && npm run test` | every file green; count measured and recorded, not asserted |

## Risks

| Risk | Mitigation |
|---|---|
| **The live counter and the final dialog disagree** because one call site was missed. | The default `1` hides the omission — no error, just a score that jumps at the end. The two greps in the validation table check arity at both sites, and the `defaults to no scaling when the multiplier is omitted` test pins the default so the omission stays invisible-but-documented. |
| **`Math.round` order produces off-by-one points** at `×0.5`. | Pinned by the `1/8 at ×0.5 is 9, not 10` test, which is the one case where rounding the base first and rounding the scaled value disagree. |
| **Re-applying the `100` floor after scaling** flattens the bottom of the range. | Pinned by the `×0.5 of 100 is 50` test, and the reasoning is a comment at the implementation site. |
| **A label that used to be a lie becomes stale in the other direction** — v1.2.4 already made the gate mode-dependent, so a future patch could reintroduce a uniform gate and leave this label describing something that is no longer true. | The label and the gate read **the same field**, so a uniform gate would have to stop reading `opponentRequired`, which the `Label reads the flag, not a mode name` grep and the `Expert required` test both catch. This risk is now a *shared-input* risk rather than a documentation-drift risk, and it is caught by a test instead of by review. |
| **The `not played this game` phrasing is a new string that GameComplete's snapshot or copy test does not expect.** | The label is one pure helper with three cases and a test per case; add the string to the existing opponent-label assertion rather than loosening the matcher. |
| **Substituting the raw correct-letter count for the unique count** while scaling would inflate every failed shirt. | Pinned by the `does not double-count a repeated letter` test, which asserts both the unique-count value and its doubled counterpart. |
| **The ×3 multiplier makes an Expert score unreadable** next to the other modes. | §5.4 accepts this explicitly: ×3 is the ceiling because going higher makes the score unreadable. A change here is a §5.4 change, not an implementation one. |

**Escalate before proceeding only if:** the completion gate in `gameState.ts` no longer reads `DIFFICULTY_CONFIG[difficulty].opponentRequired`, or `GameComplete` no longer receives the opponent shirts and so cannot derive `opponentAttempted`. Either would break the shared-input property this patch relies on, and either means v1.2.4's RD1 work was reverted. The §5.2 gate question itself is **closed** (roadmap §9.1, RD1) and is not an escalation.
