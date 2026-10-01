# v1.2 — Difficulty modes (overview)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four ways to play the same game, differing only in how much information the player starts with and what the result is worth — Easy through Expert, from a first letter down to nothing, and from ×0.5 to ×3.

**Architecture:** One data table, `frontend/src/lib/difficulty.ts`, holds all four modes. Every other decision in the line — the attempt budget, the clue set, the shirt-number mask, the completion gate, the scoring multiplier — is a **lookup** in that table rather than a branch on a mode name, and each of those five consumers is a separate pure function with its own tests. The one structural prerequisite is v1.2.1: the reveal join moves from `shirtNumber` to the opaque per-game `token` before any mode is offered, so that masking the number cannot make the reveal ambiguous.

**Tech Stack:** TypeScript, Prisma 7, Express 4, Vitest + Testcontainers (backend, 95% gate), Next.js 16 / React 19, Tailwind 4, Vitest + jsdom + Testing Library (frontend).

---

> **Ratified decisions are not decided here.** Roadmap [§9.1](../roadmap-v1.md#91-ratified-decisions) is authoritative for every decision the owner has closed; a plan's preflight **verifies** the ratified answer and never re-decides it. Where a plan and that table disagree, the table wins and the plan is the defect. A question the table does not cover is still an escalation.

---

## The five patches

| Patch | What lands | Files it adds | Rollback to |
|---|---|---|---|
| **v1.2.1** — `plan-v1.2.1-token-reveal.md` | `token` added to `RevealPlayer` and to every row of `getRevealAppearances`; the reveal join extracted to `frontend/src/lib/reveal.ts` and keyed on `token`. A backend fixture with two null-numbered players and a frontend test that assigns both names. **No mode, no mask, no clue, no score** — ships alone so a reveal regression is attributable to this patch. | `frontend/src/lib/reveal.ts`, 1 frontend test file (rewritten), 2 backend tests added | v1.1.x |
| **v1.2.2** — `plan-v1.2.2-easy-normal-modes.md` | The mode table itself, `availableClues`, `GameState.difficulty` + `SET_DIFFICULTY`, the attempt budget read from config at all four call sites, and a selector offering **Easy and Normal only**. | `frontend/src/lib/difficulty.ts`, `frontend/src/lib/shirtBadges.ts`, `frontend/src/components/DifficultySelector.tsx`, 4 frontend test files | v1.2.1 |
| **v1.2.3** — `plan-v1.2.3-hard-mode.md` | `maskedShirtNumber` + `shirtNumberAriaLabel`, the render-only mask in `Shirt.tsx` and in the guess modal, and Hard appended to the offer list. | `frontend/src/lib/shirtNumberMask.ts`, `frontend/src/components/Shirt.test.tsx` | v1.2.2 |
| **v1.2.4** — `plan-v1.2.4-expert-mode.md` | `FINISH_GAME` as the only path to `complete` in Expert, auto-complete suppressed in Expert only, the gated `FinishButton`, and Expert appended to the offer list. | `frontend/src/components/FinishButton.tsx`, 1 frontend test file | v1.2.3 |
| **v1.2.5** — `plan-v1.2.5-multiplier-scoring.md` | `multiplier` on `scorePlayer` and `computeTotalScore`, `PerPlayerScore.multiplier`, the multiplier shown in the breakdown, and the opponent labelled `optional bonus` or `required`. | 0 new files — 3 existing files and their tests | v1.2.4 |

**Rollback chain is strict and one-directional:** v1.2.5 → v1.2.4 → v1.2.3 → v1.2.2 → v1.2.1 → v1.1.x. Every revert is a code revert with **no data repair and no reverse migration**: v1.2 changes no Prisma schema. The only backend change in the whole line is the additive `token` field in v1.2.1, which older code ignores.

---

## Data flow

```
Appearance (number: Int?, isCaptain: Boolean?, goals, redCards)
      │
      │  v1.2.1  getRevealAppearances()  ──►  each row + generatePlayerToken(gameId, playerId)
      │          Appearance.number is Int? — two nulls collide on ===  (R1(a), live in v0.2.5)
      v
RevealPlayer { playerId, name, shirtNumber: number|null, token }
      │
      v
revealMatches(players, shirts)  ──►  [{ token, name }]     key = token, NEVER shirtNumber
      │                             pure, non-mutating
      ▼
revealName(token, name)  ──►  GameState shirts

──────────────────────── the mode line ────────────────────────

DIFFICULTY_CONFIG  (v1.2.2, written once, never branched around)
  easy   ×0.5  6 attempts  first+scorers+captain  number shown    opponent optional
  normal ×1    6 attempts  scorers+captain        number shown    opponent optional
  hard   ×2    6 attempts  none                   number MASKED   opponent optional
  expert ×3    3 attempts  none                   number MASKED   opponent REQUIRED
  │
  ├──► DIFFICULTIES           ──► DifficultySelector        (v1.2.2 / .3 / .4 append one row each)
  ├──► availableClues()       ──► WordleModal clue line    (v1.2.2)
  ├──► .attempts              ──► gameState.ts:154 + 3 page call sites   (v1.2.2)
  ├──► .showShirtNumber       ──► maskedShirtNumber()      (v1.2.3)
  ├──► .opponentRequired      ──► handleFinishGame() + FinishButton  (v1.2.4)
  └──► .multiplier            ──► scorePlayer() ×2 branches, both call sites  (v1.2.5)
```

---

## The six decisions that bind all five patches

### 1. The mode table is data, and no consumer branches on a mode name

`DIFFICULTY_CONFIG` is a `Record<Difficulty, DifficultyConfig>` and every consumer does a lookup. `grep -rn "=== 'easy'\|=== 'normal'\|=== 'hard'\|=== 'expert'" frontend/` returns nothing, and each plan's validation table includes that grep. A fifth mode is a row in one file, not five conditionals in five components.

`DIFFICULTIES` is a **separate, shorter** list: it is what the selector offers, and a mode is appended to it only in the patch that implements its rules. A mode present in the config but absent from `DIFFICULTIES` is the normal state of affairs mid-line — `expert` sits in the config from v1.2.2 and is offered only at v1.2.4.

### 2. The shirt-number mask is render-only, and the `'?'` is never stored

`shirtNumber` stays `number | null` in state, in the payload and in the shirt array for the whole line. `maskedShirtNumber` returns a value to render; it never writes one back. The literal `'?'` appears in JSX and in the accessible name and nowhere else.

The reason is v1.2.1. Reveal matching used to key on `shirtNumber`, so a mask implemented as a null-write would have made the lookup stop matching at all. The migration to `token` is what makes the mask safe, which is why it is the first patch and ships alone.

The mask also preserves a distinction that a null-write destroys: **"hidden because Hard" and "no number in the database" display the same glyph but are named differently** — `? (number hidden)` against `? (no number on record)`. That pair is asserted at the helper and at the rendered `aria-label`.

### 3. The clue policy intersects the mode with the data

`availableClues(mode, shirt)` returns the clues a shirt *has*, not the clues the mode *permits*. A flag permits; the data supplies. A player with no goals, no captain row and no first letter yields `['shirt-number']` in Easy — the degradation is automatic, which is what makes the 227 captain-less games and the 530 event-less games render without a special case and without an error. `redCards` is in the signature and never in the output, asserted by a test that loops all four modes with and without a red card.

### 4. Scaling is applied once, to both branches, with one rounding

`scorePlayer` wraps the two existing expressions rather than re-deriving them:

```
correct:  Math.round(max(1000 − 200 × (attempts − 1), 100) × multiplier)
failed:   Math.round((uniqueCorrectLetters / totalLetters) × 150 × multiplier)
```

Three things follow, each with a test that fails against the wrong version:

- **The `100` floor is pre-multiplier.** A shirt that has bottomed out is worth `50` in Easy. Re-applying the floor after scaling would flatten the bottom of the range.
- **One `Math.round`, on the scaled result.** `1/8` letters at `×0.5` is `9`. Rounding the base first gives `10`.
- **`grandTotal` is the sum of the already-scaled line items.** It is not multiplied again. This is what makes the breakdown add up to the total (§5.3).

Both `computeTotalScore` call sites — the live counter at `page.tsx:268` and the final dialog at `GameComplete.tsx:122` — pass the multiplier. Omitting one is silent, because the parameter defaults to `1`.

### 5. The 22/22 gate is a reducer invariant, not a button's `disabled`

Expert's opponent requirement is enforced in `handleFinishGame` against `checkGameComplete`. `FinishButton` re-checks for the label and for the partial-lineup case, but a click that slips past the DOM is still refused. Both `FINISH_GAME` at 11/22 and a `SUBMIT_GUESS` that resolves the 22nd shirt in Expert leave `gameStatus: 'playing'`; the first is a refusal and the second is a suppression, and they are separate tests because they are separate code paths.

### 6. `difficulty` lives in state, not in the shirt data

`ShirtProps` gains `difficulty?: Difficulty`; `ShirtData` does not change. The mode is a per-game property, and `ShirtData` is a per-shirt wire shape shared with the API, the mock and the state — the same array in all four modes. It reaches `Shirt` through `TacticBoard`, the only production caller.

---

## Frozen interfaces

These four signatures are read by more than one patch. A rename or a reordering in one patch breaks the next, and none of them may be changed in a patch that does not own them.

```ts
// frontend/src/lib/difficulty.ts — v1.2.2
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
export const DEFAULT_DIFFICULTY: Difficulty; // 'normal'

// frontend/src/lib/shirtBadges.ts — v1.2.2
export type ShirtClue = 'first-letter' | 'scorers' | 'captain' | 'shirt-number';
export function availableClues(
  mode: Difficulty,
  shirt: { goals: number; redCards: number; isCaptain: boolean; hasFirstLetter: boolean },
): ShirtClue[];

// frontend/src/lib/scoring.ts — v1.2.5
export function scorePlayer(
  attempts: number, correct: boolean, uniqueCorrectLetters: number,
  totalLetters: number, multiplier: number = 1,
): number;
export function computeTotalScore(
  targetShirts: ShirtGameData[], opponentShirts: ShirtGameData[],
  targetTeamName: string, opponentTeamName: string, multiplier: number = 1,
): ScoreBreakdown;
export interface PerPlayerScore { /* … */ multiplier: number; }
```

State surface, all additive:

```ts
// frontend/src/lib/gameState.ts
export interface GameState { /* … */ difficulty: Difficulty }
export type GameAction = /* … */
  | { type: 'SET_DIFFICULTY'; payload: Difficulty }   // v1.2.2
  | { type: 'FINISH_GAME' };                         // v1.2.4
export const initialState: GameState;                // difficulty = DEFAULT_DIFFICULTY

// frontend/src/lib/gameState.ts — v1.2.4
export function resolvedShirtCount(
  target: ShirtGameData[], opponent: ShirtGameData[],
): number;

// frontend/src/lib/shirtNumberMask.ts — v1.2.3
export function maskedShirtNumber(
  mode: Difficulty, shirtNumber: number | null, state: ShirtState,
): number | null;
export function shirtNumberAriaLabel(
  mode: Difficulty, shirtNumber: number | null, state: ShirtState,
): string;

// frontend/types/index.ts — v1.2.1
export interface RevealPlayer {
  playerId: number; name: string; shirtNumber: number | null; token: string;
}
```

Wire surface, additive only — a client that predates a field must keep working, and a client that postdates it must never be required to use one:

```
POST /api/guess/reveal  →  { players: Array<{ playerId, name, shirtNumber: number|null, token }> }
```

---

## Validation order

Baselines measured on `cda2db0`, before v1.2.1:

```bash
cd backend  && npm run test   # Test Files 13 passed (13) | Tests 175 passed (175)
cd frontend && npm run test   # Test Files  9 passed (9)  | Tests 173 passed (173)
cd frontend && npx tsc --noEmit
cd backend  && npm run test:coverage   # 95% on all four metrics
```

**There is no expected suite count for v1.2, by design.** The only thing this table asserts is which files each patch adds; the counts are measured at each task boundary and written down, never predicted. This table used to carry a cumulative absolute count per patch, and every one of those numbers was an artefact of the `cda2db0` snapshot rather than a property of the work:

| After | New frontend files | Counts |
|---|---|---|
| v1.2.1 | `reveal.ts` + rewritten `reveal.test.ts` | measured at Task 1's boundary; recorded, not asserted |
| v1.2.2 | `difficulty.ts`, `shirtBadges.ts`, `DifficultySelector.tsx` (+ tests) | measured, and **branch-dependent** — see below |
| v1.2.3 | `shirtNumberMask.ts`, `Shirt.test.tsx` | measured at Task 1's boundary; recorded, not asserted |
| v1.2.4 | `FinishButton.tsx` | measured at Task 1's boundary; recorded, not asserted |
| v1.2.5 | none — existing files only | measured; every file green is the pass signal |

Why the absolute numbers were removed rather than refreshed: they were not stale by one patch, they were **structurally** unpredictable. v1.0.1, v1.0.2, v1.0.3, v1.1.1, v1.1.2 and v1.3.x all add tests and all land before or between these rows, and two of v1.2.2's own outcomes are decided at run time — Task 2 Step 2.0 branches on whether v1.0.3 already created `shirtBadges.test.ts` (9 tests created, or 16 after appending to v1.0.3's 7), and Task 6 may be dropped entirely. A table that must be re-derived on every landing, in the one file a reader is most likely to treat as authoritative, is worse than no table. The per-patch Validation tables say *every file green* and *record the number*; that is the contract.

- v1.2.2 is the patch to watch: its Task 2 branches on whether v1.0.3 already created `shirtBadges.test.ts`, and its Task 6 either adds one boolean to the lineup payload or is dropped outright — both outcomes are legitimate and both change the total. **Measure at every task boundary and record the actual number; do not force a suite to match a table.** v1.0.x and v1.1.x are not in this tree, so their own deltas shift every absolute figure. The rule is uniform across v1.2: **no plan asserts a fixed count as a pass signal**, and this overview does not publish one either. Every file green is the pass signal; the count is a measurement.

Two project-specific facts that the per-patch plans rely on:

- `frontend/vitest.config.ts:16` collects `src/**` only **on this tree**. By the time v1.2 runs, v1.1.1 has widened it to enumerate `src/**`, `components/**`, `tests/**` and `app/**`, so over-collecting is the expected state and a test outside `src/` is not automatically dead. New component tests still live at `frontend/src/components/*.test.tsx` and import outward with `../../components/<Name>` — that is a house rule for readability, not a consequence of the include. **v1.1.1 owns the include list (R7); no v1.2 patch touches `include`.**
- `frontend/vitest.config.mts` is **dead, not shadowing.** Vitest resolves `CONFIG_NAMES × CONFIG_EXTENSIONS` in order and takes the first file that exists, so `vitest.config.ts` is always the effective config and `vitest.config.mts` is never read. The two are not equivalent: on `cda2db0` the `.ts` collects 9 files (`src/**/*.test.{ts,tsx}`) and the `.mts` would collect 5 (`src/**/*.test.ts` minus its two `exclude` entries). v1.1.1 deletes the `.mts` so there is one source of truth.
- The global test environment is `node`, so every new component test carries `// @vitest-environment jsdom`.

---

## Out of scope for v1.2

- **No Prisma migration and no schema change.** v1.1 adds none either, so the whole v1.0→v1.2 stretch is migration-free and every revert is a pure code revert.
- **No persistence of the chosen mode.** `difficulty` is client state initialised to `DEFAULT_DIFFICULTY`. Reloading the page returns to Normal. The mode a player *picked* and the mode a *result* was played in are different facts, and §6.2/§6.3 assign the second to v1.3.2 and v1.4 — see "Handoff" below.
- **No URL parameter for the mode.** v1.1.2 made the *filters* URL-addressable; a mode deep link belongs with the daily puzzle, where a mode is part of which puzzle you are playing, not part of which match.
- **No send-off clue in any mode** (§5.1, O5). The red-card icon from v1.0.3 stays decoration.
- **No mode-specific Wordle feedback.** The letter colours are identical in all four modes; the mode changes what you start with, not how you are graded.
- **No leaderboard, no daily puzzle, no share grid.** v1.3 and v1.4.

---

## Closed escalation — the §5.2 `opponentRequired` gate

**This is resolved, and it is not an open dependency of any patch in this line.**
The answer is roadmap §5.2 as ratified, recorded as **RD1** in roadmap §9.1.

The tension was that §5.2 calls the opponent "an optional scorable bonus" in Easy,
Normal and Hard while `checkGameComplete` had always required all 22 shirts, so
`opponentRequired: false` described a gate that did not exist. Two answers were on
the table: **(a)** keep 22/22 everywhere and correct the docs, or **(b)** let
`easy`/`normal`/`hard` complete at 11/22. **Answer (b) is ratified.**

**What it changes in this line:**

- `checkGameComplete` gains a `difficulty` parameter and stops demanding the
  opponent half in the three modes whose row says the opponent is optional, so
  those three modes **auto-complete at 11/22**.
- The Finish control's absence in those three modes becomes a **test** (v1.2.2 for
  `easy`/`normal`, v1.2.3 for `hard`, v1.2.4 for all three plus the required case),
  not a claim.
- v1.2.5's `optional bonus` label becomes true rather than aspirational, and it
  gains a second input — `opponentAttempted` — so a game that ended at 11/22 says
  the bonus was not played instead of pointing at points that are not on the line.
- **Surrender is unchanged and ungated.** A surrendered `expert` result is an
  11-slot result (RD2), and every result path tolerates an untouched opponent half.

**What it does not change:** §5.1's mode table stays exactly as written, and the
*labelling* still lands in v1.2.5 and not in v1.2.4, for the reason §5.2 and §11
rule 5 give.

**There is no v1.2.6.** Option (b) was implemented in v1.2.4, which is the patch
§5.6 already assigns the gate, rather than in a new one.

---

## Handoff to v1.3 and v1.4

- **v1.3.1 (daily puzzle) needs the mode on the puzzle, not on the game.** §6.1 makes daily and difficulty orthogonal axes. The client-side `difficulty` state is the right input for "which difficulty is this daily"; the *result* needs its own `difficulty` column, which v1.3.2 owns. Do not reuse `GameState.difficulty` as a result field — it is session state and resets to `DEFAULT_DIFFICULTY` on `NEW_GAME`.
- **v1.3.2 (streaks) keys one streak per day, globally across difficulties** (O1). That decision is recorded and unaffected by this line, but it depends on the result carrying a mode, which v1.3.2 adds.
- **v1.4 (share grid) disambiguates a result by its mode** (§6.2). It reads the same four modes and the same multipliers; the share text needs a `×0.5 / ×1 / ×2 / ×3` label, and `DIFFICULTY_CONFIG[mode].multiplier` is the only source of those four numbers.
- **`availableClues` is reusable by v1.4** if the share grid ever shows what the player was given. It is a pure function of the mode and a shirt, with no dependency on state.
- **The one thing a later patch must not undo:** `shirtNumber` stays `number | null` and the reveal join stays on `token`. Any future patch that nulls the number to hide it — including a v1.3 or v1.4 patch that reuses the shirt component — reintroduces a defect v1.2.1 was written to remove.

---

## Risks

| Risk | Where it lives | Mitigation |
|---|---|---|
| **A mask implemented as a data write** collapses "hidden by Hard" into "no number in the database" and breaks the reveal flow. | v1.2.3 | The mask is a return value, not a mutation; two greps in v1.2.3's validation table; the `shirtNumberAriaLabel` pair is tested. |
| **A mode name appears in a component** and the table stops being the single source of truth. | all five | Every plan greps for `=== 'easy'` and friends; the table is `Record<Difficulty, …>`, so a typo in a field name is a `tsc` error, not an `undefined`. |
| **One `computeTotalScore` call site is missed**, and the live counter and the final dialog disagree with no error. | v1.2.5 | The parameter defaults to `1`, which hides the omission; an arity grep at both sites is in the validation table. |
| **`DIFFICULTIES` grows ahead of the rules**, offering a mode whose behaviour does not exist yet. | v1.2.2–.4 | `DIFFICULTIES` is a separate list from the config keys, and its exact contents are asserted in every one of the three patches. |
| **A new component test lands outside `frontend/src/` and goes uncovered or uncollected** — silently, because the suite stays green. | v1.2.2–.5 | Tests are specified under `frontend/src/components/` with outward imports and `// @vitest-environment jsdom`, which keeps them inside both the widened include and the `src/**` coverage `include`; `npx vitest list \| grep -c` is in three validation tables. Note the two failure modes are **not** the same: on the current tree a test under `frontend/components/` is genuinely not collected at all, but once v1.1.1 has widened the include to four roots it *is* collected and merely falls outside coverage. Either way the file belongs in `frontend/src/components/`. `frontend/components/Shirt.colors.test.tsx` is the one existing file in that position, and v1.1.1 is what brings it in. |
| **The `opponentRequired` flag and the actual gate disagree**, and the GameComplete label claims an optionality the game does not have. | v1.2.4, v1.2.5 | Flagged above, with two options. The label reads one field, so either answer is a one-line change plus one test. |
| **`RED_CARDS` reaches a clue.** | v1.2.2 | A test loops all four modes with and without a red card and asserts identical output. |
| **The test counts in this overview drift** as v1.0.x and v1.1.x land. | all five | Every plan measures its own baseline at the first task and records deltas rather than absolutes. |

---

## Related documents

- `docs/v1/roadmap-v1.md` — §5.1 the mode table, §5.2 the opponent bonus and the locked Finish, §5.3 scoring under a multiplier, §5.4 multiplier rationale, §5.5 the captain clue, §5.6 the patch table and the render-only mask rule, §8 R1(a), §9 O1/O5, §11 Rule 4.
- `docs/v1/v1.1/overview.md` — the same structure for the patch line before this one, and the source of R7.
- `docs/v1/v1.2/plan-v1.2.1-token-reveal.md` … `plan-v1.2.5-multiplier-scoring.md` — the five plans.
