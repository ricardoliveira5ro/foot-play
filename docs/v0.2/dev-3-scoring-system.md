# Development 3: Precision XI Scoring System

**Status**: `planned`
**Source**: `docs/v0.2/plan-v0.2-overview.md` (Feature 3)
**Estimated Effort**: M (3-4 days)

---

## Objective

Add a scoring system that rewards precision and football knowledge. Players earn points per shirt based on how few attempts they needed, get partial credit for failed shirts based on letter knowledge, and earn match bonuses for exceptional performance.

---

## Approach

**Scoring engine**: A pure function module (`frontend/src/lib/scoring.ts`) that computes the total score. No side effects, easy to test.

**Per-player scoring (correct guess)**: The score for a correct guess starts at 1000 points and decreases by 200 for each wrong guess, with a floor of 100 points. So guessing on the first try earns 1000, on the second 800, and so on down to 100 on the sixth try.

**Per-player scoring (failed)**: Partial credit based on how many distinct letters were identified correctly across all guesses: the ratio of unique correct letters to the total letters in the name, multiplied by 150.

**Match bonuses**: Full House (+500), Clean Sweep (+2000), One-Try Wonders (+1000). Bonuses stack.

**Letter tracking**: The correct letters field on the shirt game data (added in Dev 2 Task 2.1) tracks unique letters that received a CORRECT result across all guesses for a shirt.

**Score display**: A live counter in the header area, updated after each guess. The GameComplete screen shows a full breakdown with per-shirt scoring and bonus line items.

---

## Detailed Tasks

### Task 3.1: Create scoring engine

- **File to create**: `frontend/src/lib/scoring.ts`
- **What this connects to**: Uses the shirt game data type from `frontend/src/lib/gameState.ts` (which extends the base shirt data from `frontend/types/index.ts`). The correct letters field was added in Dev 2 Task 2.1 Step 2.

**Step 1**: Create the file `frontend/src/lib/scoring.ts`.

**Step 2**: Define the types and main scoring functions:

- A per-player score record holding the shirt token, the shirt number, a team label, the attempt count, whether the guess was correct, the letter-based points (for failed shirts), and the total points for that shirt.
- A bonus line record holding the bonus name, the points, and a short description.
- A score breakdown record holding the grand total, the per-player array, and the bonuses array.

**Step 3**: Implement the per-player scoring function. It takes the attempt count, whether the guess was correct, the number of unique correct letters, and the total letters in the name:

- For a correct guess: the score starts at 1000 and decreases by 200 for each attempt beyond the first, with a floor of 100. So the first try earns 1000, the second 800, the third 600, the fourth 400, the fifth 200, and the sixth (or later) 100.
- For a failed guess: partial credit based on letter knowledge — the ratio of unique correct letters to the total letters in the name, multiplied by 150 and rounded to the nearest whole number. Zero letters found earns 0; all letters found earns 150. Guard against division by zero when the name has no letters (return 0 in that case).

**Step 4**: Implement the match bonus function. It takes the total shirt count, the correct count, the failed count, and the first-try count, and returns the list of earned bonuses:

- Full House: when every shirt in the game (all 22) is resolved — correct or failed — award 500 points.
- Clean Sweep: when every shirt is correct, award 2000 points.
- One-Try Wonders: when 10 or more shirts were guessed correctly on the first try, award 1000 points.
- Bonuses stack: a perfect game earns all three (3500 bonus points total). Each bonus carries a name, points, and a short description.

**Step 5**: Implement the total score function. It takes both shirt arrays and both team labels:

- Process each array into per-player scores using the per-player function. For failed shirts, the letter points come from the ratio of unique correct letters to the name length; for correct shirts, the letter points are zero and the full points come from the attempt-based formula.
- Combine both teams' score lists into one; sum the per-player points.
- Count correct shirts, failed shirts, and first-try correct shirts across both arrays; feed those counts into the bonus function; sum the bonus points.
- Return the breakdown with the grand total (player points plus bonus points), the per-player list, and the bonus list.

**What to verify after this step**:
- Run npx tsc --noEmit — no type errors.
- Verify the formulas manually: first try correct = 1000; sixth try correct = 100; failed with 3 of 6 letters = 75 (rounded from 3/6 × 150); failed with no letters found = 0.

---

### Task 3.2: Letter tracking in game state (already done in Dev 2)

The correct letters field was added to the shirt game data in Dev 2 Task 2.1 Step 2. The reducer logic that populates it was added in Dev 2 Task 2.1 Step 12.

**What to verify**: Confirm that after a guess with CORRECT results, the shirt's correct letters field contains the unique correct letters. This is testable by checking the reducer output after a submit-guess action.

---

### Task 3.3: Create live score counter component

- **File to create**: `frontend/components/ScoreCounter.tsx`
- **File to modify**: `frontend/app/missing-eleven/page.tsx`
- **What this connects to**: The header area of the page component (currently line 181-185). The score must update after each guess by recomputing from the current state.

**Step 1**: Create the file `frontend/components/ScoreCounter.tsx`.

**Step 2**: Implement the component:

- Mark it as a client component.
- It takes the current score as a prop.
- Render a small label ("Score") next to the score value, formatted with thousands separators, in the display font.
- Add a subtle pulse animation when the score changes: keep a reference to the previous score and a reference to the score element. When the score prop differs from the previous value, run a short scale animation on the score element — scale up to about 1.15 and back to 1 over roughly 300ms with an ease-out curve.

**Step 3**: Wire it into the page component:

- Add imports for the counter component and the total score function.
- After the lineup and shirt derivation block, compute the live score: when the game status is playing or complete and a match exists, call the total score function with both shirt arrays and both team names; otherwise the score is null and the displayed value is 0.
- Add the counter to the header area below the match info component, shown only while playing. Adjust the grid row placement of the aside if needed to avoid overlap.

**What to verify after this step**:
- Run npx tsc --noEmit — no type errors.
- The score counter displays during gameplay and is hidden during loading/error.
- The score updates after each guess (pulse animation visible).
- The score is 0 at game start.

---

### Task 3.4: Update GameComplete with score breakdown

- **File to modify**: `frontend/src/components/GameComplete.tsx`
- **What this connects to**: The component's props (updated in Dev 2 Task 2.5). It now receives the target and opponent shirt arrays as shirt game data (which includes the correct letters, attempts, and so on).

#### Step 1: Add imports (after line 4)

Import the shirt game data type and the scoring functions.

#### Step 2: Update props to accept the richer shirt data type

The props keep the same shape from Dev 2 Task 2.5, but the two shirt arrays now use the shirt game data type instead of the base shirt data type.

#### Step 3: Compute the score breakdown inside the component

After the stats derivation block, call the total score function with both shirt arrays and both team names.

#### Step 4: Add the score display in the header

Below the subtitle and before the end of the header section, add a "Final Score" label and the total formatted with thousands separators in the display font.

#### Step 5: Add per-player score rows to the shirt list

Extend the render helper to accept a per-player score map keyed by shirt token. For each row, show the attempt count (e.g., "3T") and the points (e.g., "600pt") in a small monospace label next to the player name.

#### Step 6: Update the shirt list calls to pass the scores

Build the score map from the breakdown's per-player list (keyed by token) and pass it to both team sections' render calls.

#### Step 7: Add bonus line items after the player lists

When bonuses exist, show a "Bonuses" section with one row per bonus: the bonus name, a short description, and the points with a plus sign, using the correct color token for the amount.

**What to verify after this step**:
- Run npx tsc --noEmit — no type errors.
- GameComplete shows the final score prominently.
- Per-shirt rows show attempts (e.g., "3T") and points (e.g., "600pt").
- Bonus line items appear when conditions are met.
- Score totals match manual calculation.

---

### Task 3.5: Unit test scoring engine

- **File to create**: `frontend/src/lib/scoring.test.ts`
- **Test runner**: The project does not have a test framework configured. Two options:
  - **Option A (recommended)**: Install vitest as a dev dependency from the frontend directory, add a test script to package.json that runs vitest, and create a vitest config file that tells vitest to look for test files under the src directory. Then run the test file with the vitest runner.
  - **Option B (quick)**: Create a plain Node script using the built-in assert module and run it with the tsx runner.

**Step 1**: If using vitest, install it, add the test script to package.json, and create the vitest config.

**Step 2**: Create the test file covering:

- Per-player scoring, correct guesses: assert 1000 for the first try, 800 for the second, 600 for the third, 400 for the fourth, 200 for the fifth, and 100 for the sixth.
- Per-player scoring, failed guesses: 0 letters found out of 6 → 0; 3 of 6 → 75; 6 of 6 → 150; zero total letters → 0 (edge case); a 1-letter name with the letter found → 150; a 1-letter name without it → 0.
- Match bonuses: Full House only when all shirts are resolved with some failed; Clean Sweep plus Full House plus One-Try Wonders when all 22 are correct with 12 first-tries; One-Try Wonders plus Full House when 10 first-tries and 12 failed; no bonuses when not all resolved; Full House only when 18 correct and 4 failed; empty input → no bonuses.
- Total score: all 22 correct on the first try → 25,500 total (22 × 1000 plus 3500 in bonuses) with all three bonuses present; a mixed set (one correct on the first try, one correct on the third try, one failed with 2 of 4 letters) → 1,675 with no bonuses; bonus stacking verified; partial completion → no bonuses.

**Step 3**: Run the tests — all should pass. If using the plain Node approach, run with the tsx runner instead.

**What to verify after this step**:
- All 20+ test cases pass.
- Edge cases covered: 0 letters, 1-letter names, empty arrays, bonus stacking.
- npx tsc --noEmit still passes.

---

## Dependencies

- Dev 1 (Team Colors) — not strictly required but should be done for visual consistency
- Dev 2 (Opponent Toggle) — required for 22-shirt scoring and the correct letters field

## Effort Estimate

**M (3-4 days)**

| Task | Estimate |
|---|---|
| Task 3.1 (scoring engine) | 1 day |
| Task 3.2 (letter tracking) | Already done in Dev 2 |
| Task 3.3 (live counter) | 0.5 day |
| Task 3.4 (GameComplete breakdown) | 1 day |
| Task 3.5 (unit tests) | 0.5 day |
| Buffer | 0.5 day |

## Risk Factors

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Scoring math errors | Low | Medium | 20+ unit tests; pure functions, easy to verify manually |
| Letter tracking adds state complexity | Medium | Low | Simple array per shirt; deduplicated; no cross-shirt dependencies |
| Score counter clutters UI | Low | Low | Minimal design; can hide behind a tap or behind a hover |
| No test runner configured | Low | Low | vitest setup is small; alternatively use a plain Node script |

## "Done" Checklist

- [ ] The per-player scoring function returns correct values for all attempt counts
- [ ] The match bonus function triggers correct bonuses
- [ ] The total score function sums correctly with bonus stacking
- [ ] The correct letters field is populated correctly across guesses
- [ ] Live score counter updates after each guess with animation
- [ ] GameComplete shows final score, per-player breakdown, and bonus line items
- [ ] 20+ unit tests pass
- [ ] No regressions
- [ ] npx tsc --noEmit passes
- [ ] npm run lint passes