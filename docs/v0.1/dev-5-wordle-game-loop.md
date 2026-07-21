# Development 5: Wordle Algorithm & Game Loop

**Status**: `ready for implementation`
**Source**: `docs/v0.1/plan-v1.0-decomposition.md` (Development 5)
**Estimated Effort**: M (3-5 days)

---

## Objective

Build the core game mechanics — the Wordle algorithm, the Wordle modal UI, the game state machine, and game completion flow. Then wire everything to the real API. By the end of this development, a complete game loop is playable: click shirt → Wordle guesses → colored feedback → correct/failed → all 11 shirts done → game complete.

**This is the integration point** — it combines the API (Dev 3) with the frontend shell (Dev 4) into a working game.

---

## Approach

**Wordle algorithm** (`lib/wordle.ts`): Pure function comparing a guess against target `display_name`. Returns per-letter results (green/orange/grey). Normalized: lowercase, diacritics stripped.

**WordleModal component**: Modal dialog with text input, 6-row feedback grid, submit button, close button. On-screen keyboard optional for v1.0.

**Game state machine** (`lib/gameState.ts`): Uses `useReducer` for predictable state transitions. Manages match data, team side, shirts, active shirt, guesses, game status (idle → loading → playing → won/lost).

**Persistence**: Serialized to localStorage on every state change. Restored on page load.

**Integration**: Replace mock data with real API calls. `fetchRandomMatch()` hits `GET /api/matches/random`. Error handling with retry UI.

---

## Detailed Tasks

### Task 5.1: Build the Wordle algorithm utility

- **Description**: Create pure function `evaluateGuess(guess, target)` returning per-letter feedback.
- **Files to create/modify**:
  - `frontend/src/lib/wordle.ts` — algorithm
- **Algorithm**:
  1. Normalize: lowercase, strip diacritics, remove special chars
  2. First pass: mark correct positions (green)
  3. Second pass: mark present-but-wrong-position (orange), respecting duplicate counts
  4. Remaining letters: absent (grey)
- **Duplication handling**: If a letter appears twice in guess but once in target, only one gets "present". Priority: correct > present left-to-right.
- **Acceptance criteria**:
  - [ ] `evaluateGuess("MESSI", "Messi")` → all correct
  - [ ] `evaluateGuess("MEESI", "Messi")` → M:correct, E:correct, E:absent, S:present, I:correct
  - [ ] `evaluateGuess("MMMMM", "Messi")` → M:correct, M:absent, M:absent, M:absent, M:absent
  - [ ] `evaluateGuess("ronaldo", "Ronaldo")` → all correct (case-insensitive)
  - [ ] `evaluateGuess("messi", "Ronaldo")` → all absent
  - [ ] Handles diacritics: `evaluateGuess("Pele", "Pelé")` → all correct
  - [ ] Handles spaces/hyphens: `evaluateGuess("van dijk", "Van Dijk")` → all correct
- **Validation**: Write 10+ test cases in Node script. Verify expected outputs.

### Task 5.2: Build WordleModal component

- **Description**: Create the modal dialog for entering and reviewing Wordle guesses.
- **Files to create/modify**:
  - `frontend/src/components/WordleModal.tsx` — modal component
- **Features**:
  - Modal overlay (darkens background, centers content)
  - Close button (×) top right
  - Player position hint: "Guess the Centre-Forward"
  - Display of player shirt number for context
  - Text input limited to target name length
  - Submit button (disabled if input empty or wrong length)
  - 6-row feedback grid (green/orange/grey colored letter boxes)
  - Submit on Enter key
  - On final guess (6th), show result or failure reveal
  - Auto-focus input on open, uppercase display
- **Acceptance criteria**:
  - [ ] Modal opens when shirt is clicked
  - [ ] Modal closes with × or click outside
  - [ ] Input accepts letters only (max = target name length)
  - [ ] Submit disabled when input empty or wrong length
  - [ ] Previous guesses in colored rows
  - [ ] After 6 attempts: failure state with correct name
  - [ ] Correct guess triggers success state
  - [ ] Input clears after each submit
- **Validation**: Render with mock props. Manually test all states.

### Task 5.3: Build game state machine (useReducer + localStorage)

- **Description**: Implement the game state reducer with localStorage persistence.
- **Files to create/modify**:
  - `frontend/src/lib/gameState.ts` — reducer, actions, localStorage helpers
- **Actions**: SET_MATCH, SELECT_TEAM, OPEN_SHIRT, CLOSE_SHIRT, SUBMIT_GUESS, RESTORE_SESSION, NEW_GAME
- **Reducer logic**:
  - `SUBMIT_GUESS`: normalize → compare → add guess → decrement attempts → if correct: 'correct'; if attempts=0: 'failed' + gameStatus='lost'; if all 11 correct: gameStatus='won'
  - Win: only when ALL 11 shirts are 'correct'
  - Loss: immediately when ANY shirt transitions to 'failed'
- **Persistence**: Debounced writes to localStorage key `footplay-game-session`.
- **State shape**:
  ```typescript
  interface GameState {
    match: MatchResponse | null;
    teamSide: TeamSide;
    shirts: ShirtData[];
    activeShirtIndex: number | null;
    gameStatus: 'idle' | 'loading' | 'playing' | 'won' | 'lost';
  }
  ```
- **Acceptance criteria**:
  - [ ] SUBMIT_GUESS correctly updates shirt state
  - [ ] Game status transitions correctly
  - [ ] Game ends immediately on first shirt failure
  - [ ] Win fires only when all 11 shirts correct
  - [ ] State persists across page refresh
  - [ ] NEW_GAME resets everything
- **Validation**: Simulate game in browser, refresh, verify restoration.

### Task 5.4: Build GameComplete component

- **Description**: Create the game-end overlay shown when all shirts are resolved.
- **Files to create/modify**:
  - `frontend/src/components/GameComplete.tsx`
- **Features**:
  - Win message: "Congratulations!" + correct names in green + statistics
  - Loss message: "Better luck next time!" + revealed failed names
  - "Play Again" button → triggers NEW_GAME
  - Match summary (score, teams, date)
- **Acceptance criteria**:
  - [ ] Win: congratulatory message + correct names + Play Again
  - [ ] Loss: consolation message + revealed failed names + Play Again
  - [ ] Match summary visible below result
- **Validation**: Force win/loss, verify rendering.

### Task 5.5: Wire /missing-eleven page to real API

- **Description**: Update game page to use real API calls instead of mock data.
- **Files to modify**:
  - `frontend/src/app/missing-eleven/page.tsx` — full integration
- **Orchestration**:
  1. On mount: check localStorage for session
  2. If valid session: restore it (skip API call)
  3. If no session: call `fetchRandomMatch()`, create new game state
  4. Loading state: spinner/skeleton
  5. Error state: retry button with message
  6. Shirt click → open WordleModal
  7. onGuess → dispatch SUBMIT_GUESS → update shirt state
  8. Save to localStorage after each guess
  9. Game won/lost → show GameComplete
- **Acceptance criteria**:
  - [ ] Home page loads match from real API
  - [ ] Loading state shows spinner
  - [ ] Error state shows "Could not load match. Try again." with retry
  - [ ] Error recovers on retry
  - [ ] Mock data disabled by default (still present as fallback)
- **Validation**: Stop backend → error shown. Start backend → retry → game loads.

### Task 5.6: Full game loop integration and polish

- **Description**: End-to-end testing. Fix integration issues.
- **No new files** — integration fixes to existing components.
- **Test scenarios**:
  1. Click shirt → WordleModal opens with correct player context
  2. Type guess → submit → feedback renders → modal updates
  3. Correct guess → shirt 'correct' → modal closes
  4. 6 wrong guesses → shirt 'failed' → modal shows failure → game ends
  5. All 11 correct → GameComplete shows win
  6. First shirt failed → immediate GameComplete shows loss
  7. Refresh mid-game → session restored
  8. Play Again → new match loads
  9. Switch between shirts mid-guess
- **Acceptance criteria**:
  - [ ] Complete game loop works end-to-end
  - [ ] All 11 shirts interactive
  - [ ] Wordle feedback accurate
  - [ ] Game ends correctly in win/loss scenarios
  - [ ] State persists across refresh
  - [ ] Play Again starts fresh game
- **Validation**: Play 3 complete games manually. Test edge cases.

---

## Dependencies

- **Dev 3 (Core REST API)** — Real API endpoints must exist
- **Dev 4 (Frontend Shell & Layout)** — Components (TacticBoard, Shirt, MatchInfo, Layout) must exist

---

## Effort Estimate

**M (3-5 days)**

| Task | Estimate |
|------|----------|
| Task 5.1 (Wordle algorithm) | 0.5 day |
| Task 5.2 (WordleModal) | 1 day |
| Task 5.3 (Game state machine) | 1 day |
| Task 5.4 (GameComplete) | 0.5 day |
| Task 5.5 (Integration) | 1 day |
| Task 5.6 (Test and polish) | 0.5 day |
| Buffer | 0.5 day |

---

## Risk Factors

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Wordle duplicate letter edge cases | Medium | Medium | Follow classic algorithm exactly. Test 20+ cases. |
| Game state localStorage serialization issues | Low | Medium | Validate on restore. Discard if corrupted. |
| Integration bugs between components | Medium | Medium | Systematic scenario testing (Task 5.6). |
| Player names with special characters | Medium | Low | Normalization handles most cases. Log if issues found. |

---

## "Done" Checklist

- [ ] `evaluateGuess()` produces correct Wordle feedback for 20+ test cases
- [ ] WordleModal renders with input, feedback grid, submit, close
- [ ] Game state machine correctly transitions all states
- [ ] Game state persists across page refresh (localStorage)
- [ ] GameComplete shows win/loss screen with Play Again
- [ ] Full game loop: click shirt → guess → feedback → correct/failed → game ends immediately on first failed shirt
- [ ] Win condition triggers only when all 11 shirts are correct
- [ ] App fetches real data from API (mock data disabled by default)
- [ ] Loading, error, and empty states handled gracefully
- [ ] Play Again button starts a new game
- [ ] `npm run lint` passes
- [ ] All changes committed to `dev-5/*` branch
