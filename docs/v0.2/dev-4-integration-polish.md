# Development 4: Integration & Polish

**Status**: `planned`
**Source**: `docs/v0.2/plan-v0.2-overview.md` (Feature 4)
**Estimated Effort**: S (2-3 days)

---

## Objective

Wire all three features together, test end-to-end, handle edge cases, and polish the experience. This is the final development before v0.2 is ready.

---

## Approach

Systematic scenario testing of all features working together. Fix any integration issues. Add smooth transitions. Verify the full game loop with scoring, colors, and toggle. Handle edge cases that arise from the 22-shirt model.

---

## Detailed Tasks

### Task 4.1: End-to-end scenario testing

Each scenario includes the exact steps to reproduce and what to verify. Work through them sequentially — fix any failures before moving to the next.

#### Scenario 1: Load game → both teams' lineups visible via toggle

**How to test**:
1. Open http://localhost:3000/missing-eleven in the browser.
2. Wait for the game to load (loading text disappears, pitch renders).
3. Verify the toggle appears above the board with "1–11" and "12–22" labels.
4. Verify the team name shown above the pitch is a curated team name (e.g., "FC Barcelona", "Real Madrid").
5. Open browser DevTools → Network tab. Confirm the random match endpoint (GET /api/matches/random) returned both the home lineup and the away lineup, each with 11 players.

**What to verify**: Toggle is visible. Board shows 11 shirts. Team name matches one of the curated teams.

#### Scenario 2: Toggle switches board → correct team shown

**How to test**:
1. Note the team name and formation shown above the pitch.
2. Click the toggle to switch to "12–22".
3. Verify the team name changes to the opponent team.
4. Verify the formation changes to the opponent's formation.
5. Verify the shirt positions/layout are different (different formation).
6. Verify shirt colors change if the opponent team has different colors (Dev 1).
7. Click the toggle back to "1–11".
8. Verify the original team's shirts and state are preserved (any shirts you already guessed are still in their correct/failed state).

**What to verify**: Both boards render independently. State is preserved across toggles.

#### Scenario 3: Guess correctly on target team → shirt updates

**How to test**:
1. Stay on the "1–11" board.
2. Click a shirt to open the Wordle modal.
3. Type a correct guess (you can check the answer by looking at the API response in DevTools or using mock data).
4. Submit the guess.
5. Verify the modal closes.
6. Verify the shirt shows a green checkmark badge.
7. Verify the player's name appears below the shirt in green.
8. Verify the score counter updates (Dev 3).

**What to verify**: Correct guess → green state, name revealed, score increases.

#### Scenario 4: Guess correctly on opponent team → same behavior

**How to test**:
1. Toggle to the "12–22" board.
2. Click a shirt and guess correctly.
3. Verify the same behavior as Scenario 3 (green badge, name, score update).
4. Toggle back to "1–11" — verify the target team's state is unchanged.

**What to verify**: Opponent board works identically to target board.

#### Scenario 5: Fail a shirt → letter points earned, game continues

**How to test**:
1. Click a shirt and submit 6 incorrect guesses.
2. Verify the shirt shows a red X badge after the 6th guess.
3. Verify the player's name is revealed below the shirt in red.
4. Verify the game does NOT end — you can still click and guess other shirts.
5. Verify the score counter updates with letter-based partial points.

**What to verify**: Failed shirt → red state, name revealed, game continues, partial score.

#### Scenario 6: Score counter updates after each guess

**How to test**:
1. Note the current score value.
2. Make a correct guess on any shirt.
3. Verify the score increases by the expected amount (1000 for first try, etc.).
4. Make an incorrect guess on another shirt.
5. Verify the score increases by the letter-based amount.
6. Verify the pulse animation plays on score change.

**What to verify**: Score math is correct. Animation is visible.

#### Scenario 7: Complete all 22 shirts → GameComplete shows full breakdown

**How to test**:
1. Guess or fail all 22 shirts (both teams).
2. Verify the GameComplete overlay appears.
3. Verify it shows "Perfect Score!" if all correct, or "Game Complete" with correct/failed counts.
4. Verify both team sections are shown with team names as headers.
5. Verify per-shirt rows show shirt number, position, name, attempts (e.g., "3T"), and points (e.g., "600pt").
6. Verify bonus line items appear if conditions are met (Full House, Clean Sweep, One-Try Wonders).
7. Verify the final score is displayed prominently.
8. Verify the match summary (score, teams, date, competition) is shown at the bottom.

**What to verify**: Full breakdown is correct. All 22 shirts listed. Bonuses calculated correctly.

#### Scenario 8: Refresh mid-game → state restored

**How to test**:
1. Start a game and make a few guesses on both teams.
2. Note the current state (which shirts are guessed, score, toggle position).
3. Refresh the page.
4. Verify the game re-fetches from the API (current implementation does NOT persist to local storage — see `page.tsx` line 31 comment). This is expected behavior for v0.2.
5. If local storage persistence is added later, verify state is restored.

**What to verify**: Game restarts fresh on refresh (by design). No errors on reload.

#### Scenario 9: Play Again → fresh game with new match

**How to test**:
1. Complete a game (all 22 shirts resolved).
2. Click "Play Again" in the GameComplete overlay.
3. Verify the overlay closes.
4. Verify a new match loads (different teams, different lineups).
5. Verify all shirts are in default state.
6. Verify the score counter resets to 0.

**What to verify**: Fresh game starts. No stale state from previous game.

#### Scenario 10: Unknown team colors → fallback renders correctly

**How to test**:
1. If possible, find a match where one team is NOT in the curated list (e.g., a lower-league team).
2. Verify the non-curated team's shirts render with default white/gray colors.
3. Verify the curated team's shirts still have proper colors.

**How to force this in mock mode**: Add a mock match entry whose club ID is not present in the team colors map. Or temporarily remove an entry from the map.

**What to verify**: Fallback colors work. No crashes.

#### Scenario 11: Mobile: toggle sticky, shirts tappable, modal usable

**How to test**:
1. Open Chrome DevTools → toggle device toolbar → select iPhone 14 Pro.
2. Verify the toggle is sticky at the top when scrolling.
3. Verify shirts are tappable with a comfortable hit area (at least 44px — the shirt component already expands its tap target beyond the visible SVG with negative margins and padding).
4. Verify the Wordle modal opens and is usable on mobile (keyboard visible, input works).
5. Verify the GameComplete overlay's player list is scrollable (it is capped at half the viewport height and scrolls internally).

**What to verify**: All interactions work on mobile viewport.

#### Scenario 12: Edge: both teams have same formation

**How to test**:
1. Find or mock a match where both teams use the same formation (e.g., both 4-3-3).
2. Verify both boards render correctly with the same layout.
3. Verify the toggle still switches teams properly.

**What to verify**: Same formation doesn't cause rendering issues.

#### Scenario 13: Edge: player name is 1 letter long

**How to test**:
1. Find or mock a match where a player has a 1-letter normalized name (e.g., a single-character name after normalization).
2. Verify the shirt renders with 1 letter slot.
3. Verify the Wordle modal shows 1 tile.
4. Verify guessing works (correct on first try = 1000 points, failed = 0 or 150).

**What to verify**: 1-letter names work in shirt preview and modal.

#### Scenario 14: Edge: player name has diacritics

**How to test**:
1. Find or mock a match where a player's name contains diacritics (e.g., "José", "Łukasz", "Özil").
2. Verify the shirt shows the correct name length (the word normalization logic in `frontend/src/lib/wordle.ts` strips diacritics before computing it).
3. Verify guessing handles diacritics correctly — the normalization strips them before comparing the guess to the answer.
4. Verify the revealed name shows the original diacritics.

**What to verify**: Diacritics are handled correctly in guessing and display.

---

### Task 4.2: Smooth transitions

- **Files to modify**:
  - `frontend/app/missing-eleven/page.tsx` — fade transition on board switch
  - `frontend/components/ScoreCounter.tsx` — already has pulse animation (Dev 3 Task 3.3)
  - `frontend/app/globals.css` — if any new keyframes are needed

**Step 1**: Add a fade transition wrapper around the TacticBoard in the page component.

The TacticBoard already receives a key based on the active board (from Dev 2 Task 2.3), which causes React to unmount and remount the component. To add a fade, wrap the section that contains the TacticBoard in a container that carries the active board as a React key and applies a fade-in animation class. Because the key changes when the board switches, React remounts the wrapper and the fade plays on every switch.

**Step 2**: Add the fade-in animation utility class to the global stylesheet.

Define a class that applies a 200ms ease-out fade-in animation that runs once and holds its final state (opacity 1).

**Step 3**: Verify the fade-in keyframe exists in the global stylesheet.

It is currently defined inside the WordleModal's scoped global styles. Move it to the global stylesheet for consistency so both the modal and the board switch share one definition. The keyframe animates opacity from 0 to 1.

**What to verify after this step**:
- Toggle between boards → smooth 200ms fade transition.
- No layout shift during transition.
- Score counter pulse animation still works (Dev 3).
- Shirt entrance animation still works for both boards.

---

### Task 4.3: Edge case handling

- **Files**: Various (primarily the page component and the game state module)

**Step 1**: Handle the API returning only one team's lineup.

The set-match case in the game state module (Dev 2 Task 2.1 Step 8) already creates both arrays. If one lineup is empty, the opponent array will be empty. The toggle should be hidden when the opponent has no shirts: conditionally render the toggle only when the opponent shirt array is non-empty, and disable the toggle behavior when there is only one team.

**Step 2**: Handle a player name that is empty or null.

The GameComplete render helper already falls back to a dash when a name is not revealed. The Shirt component already skips the number display when the shirt number is null. No changes needed.

**Step 3**: Handle local storage quota exceeded.

The current implementation does NOT use local storage (see `page.tsx` line 31: no local storage restore — fixes hydration mismatch). If local storage persistence is added later, wrap the writes in a try/catch so a quota error or private browsing mode does not break the game — the game still works, just without persistence.

**Step 4**: Handle a network error mid-game.

The existing error handling in the page component already shows an error message with a "Try again" button. The retry callback re-fetches a new match. This is sufficient — the user loses their current game but can start fresh. For a better experience you could preserve the current state and retry the failed request, but that adds complexity and is out of scope for v0.2.

**What to verify after this step**:
- Match with empty opponent lineup → no toggle shown, only target team board.
- All edge cases handled without crashes or blank screens.

---

### Task 4.4: Performance verification

- **Check**: No code changes needed — this is a verification task.

**Step 1**: Game load time.

Open Chrome DevTools → Network tab → reload the page.
- Verify the random match endpoint responds within 2 seconds.
- Verify the pitch renders within 1 second of the API response.
- In mock mode (the mock API flag), verify the artificial delay is the only bottleneck.

**Step 2**: Toggle responsiveness.

Click the toggle rapidly (5+ times in quick succession).
- Verify no visual glitches or lag.
- Verify the correct board is always shown (no race condition).
- The toggle action is synchronous in the reducer — no async concerns.

**Step 3**: Score calculation performance.

The score is computed on every render via the total score function. With 22 shirts this is trivial (pure function, no I/O). Verify by:
1. Open React DevTools → Profiler.
2. Make a guess.
3. Check that the re-render of the page component takes under 5ms.

**Step 4**: Local storage operations (if implemented).

If local storage persistence is added, verify it does not block the UI:
1. Defer the write (schedule it after the current work rather than inline).
2. Verify no jank on rapid guess submissions.

**What to verify after this step**:
- No perceivable lag on any interaction.
- Game loads within 3 seconds on simulated 3G (DevTools → Network → Slow 3G).
- Score calculation is instant.

---

### Task 4.5: Final lint and build

- **Files**: N/A (global checks)

**Step 1**: Run lint from the frontend directory. Fix any warnings or errors.

**Step 2**: Run the type check (npx tsc --noEmit) from the frontend directory. Fix any type errors.

**Step 3**: Run the production build (npm run build) from the frontend directory. Fix any build errors.

**Step 4**: Verify no TypeScript errors remain across all modified files:
- `frontend/src/lib/teamColors.ts`
- `frontend/src/lib/colorUtils.ts`
- `frontend/src/lib/scoring.ts`
- `frontend/src/lib/gameState.ts`
- `frontend/components/Shirt.tsx`
- `frontend/components/TacticBoard.tsx`
- `frontend/components/TeamToggle.tsx` (new)
- `frontend/components/ScoreCounter.tsx` (new)
- `frontend/app/missing-eleven/page.tsx`
- `frontend/src/components/GameComplete.tsx`

**What to verify after this step**:
- Lint passes with zero warnings.
- Type check passes with zero errors.
- Production build succeeds.
- No regressions in existing v1.0 functionality.

---

## Dependencies

- Dev 1, 2, 3 must all be complete

## Effort Estimate

**S (2-3 days)**

| Task | Estimate |
|---|---|
| Task 4.1 (E2E scenarios) | 1 day |
| Task 4.2 (transitions) | 0.25 day |
| Task 4.3 (edge cases) | 0.25 day |
| Task 4.4 (performance) | 0.25 day |
| Task 4.5 (lint/build) | 0.25 day |
| Buffer | 0.5 day |

## Risk Factors

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Integration bugs between features | Medium | Medium | Systematic scenario testing with 14 specific scenarios |
| Mobile UX issues | Low | Medium | Test on real devices via Chrome DevTools device toolbar |
| Performance regression with 22 shirts | Low | Low | 22 shirts is trivial for React; profile if needed |
| Empty opponent lineup edge case | Low | High | Conditionally hide toggle; verify with mock data |

## "Done" Checklist

- [ ] All 14 E2E scenarios pass
- [ ] Transitions are smooth (fade on toggle, pulse on score)
- [ ] Edge cases handled gracefully (empty lineup, diacritics, 1-letter names)
- [ ] No performance issues (load < 3s, toggle < 100ms, score calc instant)
- [ ] Lint passes with zero warnings
- [ ] Type check passes with zero errors
- [ ] Production build succeeds
- [ ] Full game loop works end-to-end: load → guess → toggle → score → complete → play again
- [ ] All changes committed