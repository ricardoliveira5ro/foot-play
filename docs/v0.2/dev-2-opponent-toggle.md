# Development 2: Opponent Lineup Toggle

**Status**: `planned`
**Source**: `docs/v0.2/plan-v0.2-overview.md` (Feature 2)
**Estimated Effort**: M (3-4 days)

---

## Objective

Extend the game from guessing one team (11 shirts) to guessing both teams (22 shirts) via a simple toggle that switches the tactic board view. Each team's shirts have independent state. The game ends when all 22 shirts are resolved — no early game-over on first failure.

---

## Approach

**State refactor**: The game state machine (`frontend/src/lib/gameState.ts`) currently tracks 11 shirt entries. v0.2 extends this to 22 entries, grouped by team:
- A target shirt array — 11 shirts for the target team (the one the pick-side logic chose)
- An opponent shirt array — 11 shirts for the opponent team (the other side)
- An active board field — which board is currently displayed: the target or the opponent

**Toggle component**: A simple toggle switch that flips the active board. No progress indicators, no team names on the toggle — just the switch. The team name is already shown above the board by the TacticBoard component.

**Game end condition**: When every shirt in both the target and opponent arrays has a resolved state (correct or failed), the game is complete. No early termination. The game status becomes complete instead of won or lost.

**Backend**: No changes needed. The game response already returns the home lineup and the away lineup.

---

## Detailed Tasks

### Task 2.1: Refactor game state for 22 shirts

- **File to modify**: `frontend/src/lib/gameState.ts`
- **What this connects to**: Every consumer of the game state — the page component (lines 16-27 destructures the state), the GameComplete component (receives a shirts prop), and the game state hook return (lines 259-326).

#### Step 1: Update the game status type (currently line 11)

The status currently has five values: idle, loading, playing, won, lost. Replace won and lost with a single complete status, leaving four values: idle, loading, playing, complete.

#### Step 2: Add a correct letters field to the shirt game data (currently lines 13-18)

This field is needed for Dev 3 (scoring) but is introduced here to avoid a second state refactor. It should be an array of strings holding the unique letters that received a CORRECT result across all guesses for that shirt. The existing fields (attempt count, guess history, plus the base shirt data) stay unchanged.

#### Step 3: Update the game state interface (currently lines 20-27)

Replace the single shirts array with two arrays: a target shirt array and an opponent shirt array, both holding shirt game data. Add an active board field that holds either target or opponent. Keep the match, team side, and error fields. The active shirt index now means "index into the active board's shirt array" and stays null when no modal is open.

#### Step 4: Add new actions to the action union (currently lines 29-38)

Add a toggle-board action with no payload. Keep all existing actions (set match, select team, open shirt, close shirt, submit guess, reveal name, new game, set error, set loading) unchanged in shape.

#### Step 5: Update the initial state (currently lines 42-49)

Match starts null, team side starts as home, both shirt arrays start empty, the active board starts as target, the active shirt index starts null, the game status starts idle, and the error starts null.

#### Step 6: Update the create-shirts helper (currently lines 76-83)

The helper maps a lineup into shirt game data entries. It already initializes the state to default, attempts to 0, and guess history to an empty array. Add initialization of the new correct letters field to an empty array.

#### Step 7: Replace the win condition and update the completion check (currently lines 98-104)

Remove the old win-condition function entirely — there is no win/lose anymore. Update the completion check to take both shirt arrays, combine them into one list, and return true when the combined list is non-empty and every shirt has a resolved state (correct or failed).

#### Step 8: Rewrite the set-match case in the reducer (currently lines 110-122)

This is the most critical change. It now populates BOTH team arrays. When a match is set, first determine the picked side using the existing pick-side logic. The target lineup comes from the picked side (the home lineup if home was picked, the away lineup otherwise); the opponent lineup comes from the other side. Create shirt data for both lineups, store the match, set the team side to the picked side, set the active board to target, set the game status to playing, and clear the error and the active shirt index.

#### Step 9: Update the select-team case (currently lines 124-133)

Apply the same dual-array population logic: the target lineup comes from the selected side, the opponent lineup from the other side. Reset the active board to target and the active shirt index to null.

#### Step 10: Add the toggle-board case (new action)

Flip the active board between target and opponent, and reset the active shirt index to null so no modal is left open across a switch.

#### Step 11: Rewrite the open-shirt case (currently lines 135-144)

Look up the shirt in the active board's array (target or opponent depending on the active board). If the token is not found, or the shirt is already resolved (correct or failed), return the state unchanged. Otherwise set the active shirt index to the found index.

#### Step 12: Rewrite the submit-guess case (currently lines 153-221)

This is the largest rewrite. The reducer must update the correct board's array and check completion across both arrays. The logic:

- Guard: if there is no match or the game is not playing, return the state unchanged.
- Determine the active board and copy its shirt array.
- Find the shirt by token; if it is missing or already resolved, return the state unchanged.
- Increment the attempt count and determine whether this is the last allowed attempt by comparing against the max attempts constant.
- Collect the letters that received a CORRECT result from this guess, append them to the shirt's existing correct letters, and deduplicate so each letter appears only once.
- Decide the new shirt state: correct if the guess was correct (and close the modal), failed if it was the last attempt and still wrong (and close the modal), otherwise in-progress (keep the modal open).
- Build the updated shirt with the new state, attempt count, guess history (append this guess's results), and deduplicated correct letters; attach the player's name when the guess was correct.
- Write the updated shirt back into the active board's array; the other board's array stays untouched.
- Check completion across BOTH arrays with the updated completion check; if complete, set the game status to complete.
- Return the new state with the updated arrays, game status, and active shirt index (null when the modal should close).

#### Step 13: Update the reveal-name case (currently lines 224-231)

Apply the name update to whichever board contains the token. The simplest approach is to map over both arrays and update the matching shirt in each — only one will match, the other is returned unchanged.

#### Step 14: Update the hook return (currently lines 259-271)

Add a toggle-board action creator that dispatches the toggle-board action, and include it in the returned object. Keep the rest of the hook API unchanged (start new game, select team, open shirt, close shirt, submit guess, reveal name, new game, set error, set loading).

**What to verify after this step**:
- Run npx tsc --noEmit from the frontend directory — no type errors.
- The page component will temporarily have type errors (it references the old single shirts array which no longer exists) — this is expected and fixed in Task 2.4.

---

### Task 2.2: Create TeamToggle component

- **File to create**: `frontend/components/TeamToggle.tsx`
- **Design reference**: The existing design system uses a dark ink background, chalk text, and rounded corners (see `page.tsx` line 148 for button patterns). The toggle should match the minimal, monochrome style.

**Step 1**: Create the file `frontend/components/TeamToggle.tsx`.

**Step 2**: Implement the component:

- Mark it as a client component.
- It takes two props: the active board (target or opponent) and a toggle callback.
- Render a small two-position switch: a rounded container with a sliding indicator. The indicator sits on the left when the target board is active and slides to the right when the opponent board is active, with a short transition for the slide.
- Inside the switch, show two small labels: "1–11" on the left and "12–22" on the right. The active position's label is rendered in the light chalk color; the inactive one in a dimmed ink tone.
- The whole control is a button so it is keyboard accessible. Give it an accessible label that announces which lineup the switch will move to — "Switch to opponent lineup" when on the target board, and the reverse when on the opponent board.
- Style it to match the existing monochrome look: dark ink accents, rounded corners, a subtle hover state, and a visible focus outline for keyboard users.
- Make it sticky at the top of the board area so it stays visible while scrolling, and center it horizontally.

**What to verify after this step**:
- Run npx tsc --noEmit — no type errors.
- Render the component — the toggle slides left/right when clicked.
- The accessible label updates to reflect the current state.

---

### Task 2.3: Update TacticBoard for active team rendering

- **File to modify**: `frontend/components/TacticBoard.tsx`
- **What this connects to**: The TacticBoard currently receives a shirts array which is always the target team. After Dev 1, it also receives a club ID. This task adds a key so the board re-renders cleanly when switching teams.

**Step 1**: No structural changes are needed to the TacticBoard beyond what Dev 1 already added (the club ID prop). The component already receives a shirts array and renders it — it does not care whether the shirts are the target or the opponent.

**Step 2**: Add a key prop to the pitch wrapper so React re-mounts (and re-runs the entrance animation) when switching boards. To do this, the TacticBoard needs to know which board is active: add an optional active board prop to its props interface, and pass it as the key on the pitch element (falling back to a default value when not provided).

**What to verify after this step**:
- Run npx tsc --noEmit — no type errors.
- Switching the active board prop causes the pitch to re-mount with the entrance animation.

---

### Task 2.4: Update missing-eleven page for dual teams

- **File to modify**: `frontend/app/missing-eleven/page.tsx`
- **What this connects to**: This is the main orchestration file. It currently uses the old single shirts array (lines 167-176) and the team side to derive the lineup. After the state refactor, it must use the target and opponent arrays and the active board.

#### Step 1: Add imports (after line 8)

Import the TeamToggle component.

#### Step 2: Add the toggle callback to the destructured hook (currently lines 17-27)

Add the toggle-board callback to the existing destructuring of the game state hook, alongside the other callbacks.

#### Step 3: Update the reveal effect (currently lines 50-60)

The current effect fetches reveal data for the picked team side only. After this change, when the game status becomes complete and a match exists, fetch reveal data for BOTH teams in parallel — the picked side and the opposite side — and combine both responses' player lists into the revealed players state. Handle errors with the existing error setter.

#### Step 4: Update the modal state derivation (currently lines 63-71)

The modal now looks up shirts from the active board. Derive an active shirts array from the state (target or opponent depending on the active board). The modal should show when the active shirt index is not null, the shirt at that index exists, and its state is default or in-progress. Derive the active shirt and its guess history from that array.

#### Step 5: Update the shirt click handler (currently lines 73-79)

Look up the shirt in the active shirts array instead of the old single array, keeping the same guards: ignore resolved shirts, and ignore clicks when the game is not playing.

#### Step 6: Update the guess handler (currently lines 85-102)

Note: this handler does not need structural changes — it already uses the active shirt's token, which is valid across both boards, and the reveal-one-player API takes a token, not a team side. Verify the last-attempt logic still compares against the max attempts constant.

#### Step 7: Update the lineup and team derivation block (currently lines 167-176)

Replace the single-team derivation with active-board-aware derivation:

- Determine the active team side: when the active board is the target, it is the picked team side; when the opponent board is active, it is the opposite side.
- Derive the lineup, formation, team name, and club ID from the active team side (using the home or away fields of the match accordingly).
- Build the shirts array for the board by mapping the lineup entries and merging in the live game state (state, guess history, name) from the active board's shirt array, falling back to a default state when a shirt is not found.

#### Step 8: Add TeamToggle above TacticBoard (currently around line 191)

Insert the toggle above the section that wraps the TacticBoard, passing the active board and the toggle callback. Keep the existing grid placement on the section. Pass the derived team name, formation, shirts, click handler, club ID, and active board to the TacticBoard.

#### Step 9: Update GameComplete usage (currently lines 229-237)

Pass both teams' shirt arrays and both team names — the target team name from the picked side, the opponent team name from the other side — plus the revealed players and the play-again handler.

#### Step 10: Update the game complete check (currently line 137)

Use the new complete status to decide when the GameComplete overlay shows.

**What to verify after this step**:
- Run npx tsc --noEmit — no type errors.
- Run npm run lint — no lint warnings.
- Load game → toggle visible above the board.
- Click toggle → board switches to opponent team (different team name, different shirts).
- Guess correctly on target team → shirt updates.
- Guess correctly on opponent team → shirt updates.
- Toggle back → target team shirts still have their state.

---

### Task 2.5: Update GameComplete for both teams

- **File to modify**: `frontend/src/components/GameComplete.tsx`
- **What this connects to**: It currently receives a single shirts array and a win boolean. After this change, it receives both teams' data, and the game status is complete (no win/lose distinction).

#### Step 1: Update the props interface (currently lines 7-19)

Replace the win boolean and the single shirts array with two shirt arrays (target and opponent) plus two team name strings (target and opponent). Keep the match, team side, revealed players, and play-again handler.

#### Step 2: Update the component function signature (currently line 73)

Destructure the new props.

#### Step 3: Derive stats from both arrays (replace lines 74-86)

Combine both shirt arrays into one list. Compute the total count, the correct count, the failed count, and whether every shirt is correct. Build a lookup of revealed players by shirt number for name display.

#### Step 4: Update the header text (currently lines 107-150)

Replace the win/lose header with a completion header:

- When every shirt is correct, show a "Perfect Score!" title with a celebratory icon (a heart or similar) and a message stating that all players across both teams were identified.
- Otherwise show "Game Complete" with a neutral icon (an X) and a message stating how many of the total players were correct.
- Use the existing correct and failed color tokens for the icon, the title color, and a subtle radial background glow behind the header.

#### Step 5: Render two grouped sections for the player reveal list (replace lines 154-228)

Replace the single list with two grouped sections, one per team, each headed by the team name. Add a helper that renders one team's shirt list: sort the shirts by position order, and for each shirt show the number, the position label, the revealed name (or a dash when not revealed), and a small circular badge with a check for correct or an X for failed, colored with the correct and failed tokens. Rows for correct shirts use the correct color tint, failed shirts the failed tint, and unresolved shirts a neutral ink tint.

**What to verify after this step**:
- Run npx tsc --noEmit — no type errors.
- Run npm run lint — no lint warnings.
- Game complete shows two grouped sections with team names.
- All 22 shirts listed across both sections.
- Correct shirts in green, failed in red.

---

## Dependencies

- v1.0 must be complete
- Dev 1 (Team Colors) should be done first (shirts need colors before toggle work)

## Effort Estimate

**M (3-4 days)**

| Task | Estimate |
|---|---|
| Task 2.1 (state refactor) | 1.5 days |
| Task 2.2 (toggle component) | 0.5 day |
| Task 2.3 (TacticBoard update) | 0.25 day |
| Task 2.4 (page integration) | 1 day |
| Task 2.5 (GameComplete update) | 0.5 day |
| Buffer | 0.5 day |

## Risk Factors

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| State refactor breaks existing game flow | Medium | Medium | Incremental changes: update types first, then reducer cases one by one; test each state transition |
| Local storage serialization of 22 shirts | Low | Low | Same pattern as v1.0, just more data; note: current code does not persist to local storage (see `page.tsx` line 31 comment), so this is a non-issue |
| Toggle UX feels awkward on mobile | Low | Medium | Sticky positioning; test on real devices; keep it minimal |
| Reveal-one-player still works for opponent tokens | Low | Low | The API takes an opaque token — it is team-agnostic. Verified in `frontend/lib/api.ts` line 137. |

## "Done" Checklist

- [ ] Toggle switches between target and opponent boards
- [ ] Both teams' shirts have independent guess state
- [ ] Game ends when all 22 shirts resolved (status complete)
- [ ] No early game-over on first failure
- [ ] GameComplete shows both teams' results grouped by team
- [ ] State persists across refresh (if local storage is implemented)
- [ ] Play Again starts fresh game
- [ ] No regressions in existing v1.0 functionality
- [ ] npx tsc --noEmit passes
- [ ] npm run lint passes