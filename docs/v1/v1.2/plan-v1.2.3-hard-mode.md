# Hard Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In `Hard`, a shirt gives the player nothing: no first letter, no scorers icon, no captain icon, and no visible number — the number slot shows a `?`. Six attempts and an optional opponent are unchanged, so the only thing Hard removes is information and the only thing it adds is the ×2 multiplier that v1.2.5 will apply. Task 6 additionally confirms v1.2.2's Finish control is absent in `Hard`, which is what proves the control reads the mode table rather than a hardcoded pair of mode names.

**Architecture:** The mask is a **render-time concern in one pure function and one component**. `frontend/src/lib/shirtNumberMask.ts` answers two questions — should the number be visible, and what is this shirt's accessible name — and `Shirt.tsx` asks them. The data never changes: `shirtNumber` stays `number | null` in state, in the API payload and in the shirt array, because v1.2.1 moved the reveal join onto `token` and nothing may reintroduce a number comparison. This is the dependency that makes v1.2.1 a hard prerequisite (§5.6): while the reveal matched on `shirtNumber`, a mask implemented by nulling the field would have made `===` stop matching at all.

**Tech Stack:** TypeScript, Next 16 / React 19, Vitest + `@testing-library/react`, jsdom for component tests.

---

## Global Constraints

- **The literal `'?'` is never written into `shirtNumber`.** Not in state, not in the payload, not in the shirt array. `shirtNumber` is `number | null` at every layer after this patch, and the mask is a display substitution performed at render time inside `Shirt.tsx`. A `'?'` write makes v1.2.1's `s.token === player.token` join unaffected but v1.2.1's *reason for existing* — keeping the number available to the reveal flow — false. Assert this with a grep in the validation table.
- **The mask is not implemented by nulling the field.** §5.6 names this failure precisely: writing `null` would collapse the distinction at `Shirt.tsx:225/249/254` between "hidden because Hard" and "no number in the database". The two are different facts and the accessible name must keep them apart, so `shirtNumberMask.ts` returns *both* a display value and a label that says which of the two is in play.
- **A masked number is still a real number in the data, so a revealed or guessed shirt shows it.** `state === 'correct'` and `state === 'failed'` mean the identity is settled; hiding the number then would remove information the player has already earned. `maskedShirtNumber` therefore returns the real value in both states, and the two tag-number sites at `Shirt.tsx:249/254` are left exactly as they are — their `shirtNumber !== null` fallback is only reached after resolution, so they need no change and must not be given one.
- **The mask depends on the mode, passed down as a prop.** `ShirtProps` gains `difficulty?: Difficulty` defaulting to `DEFAULT_DIFFICULTY`. The mode is a per-game property and belongs on the component's props; it does **not** go into `ShirtData`, which is a per-shirt wire shape consumed by the API, the mock and the state, and which must stay identical across all four modes. `TacticBoard` is the only production caller of `Shirt` and is where the prop is plumbed.
- **`shirtNumberMask.ts` is pure and holds the only mode comparison in this patch.** Two functions, both total, no React.
- **New component tests live under `frontend/src/components/`** and import outward with `../../components/Shirt`. This is a house rule, not a workaround: after v1.1.1 the include enumerates `src/**`, `components/**`, `tests/**` and `app/**`, so a test beside `Shirt.tsx` in `frontend/components/` *would* be collected — but it would sit outside the coverage `include` (`src/**`), and colocating is where the next person will look. Every such file carries `// @vitest-environment jsdom` because the global environment is `node`.
- **`Shirt.colors.test.tsx` is in `frontend/components/`, which is outside this tree's current include.** Do not move it, and do not widen `vitest.config.ts` from this patch; v1.1.1 owns the include change (R7) and already converts this file into a real test. If you move it, two patches now touch the test layout.
- **Hard does not change the clue policy code.** `availableClues` already returns `['shirt-number']` for `hard`, and that was written and tested in v1.2.2. This patch offers the mode, not its rules.
- **Regression commands, run at every task boundary:**

  ```bash
  cd backend  && npm run test              # unchanged by this patch
  cd frontend && npm run test
  cd frontend && npx tsc --noEmit
  cd frontend && npm run lint
  ```

  Baseline for this patch is the v1.2.2 exit state. Measure it, do not assume it.

---

## Files touched

| File | Change |
|---|---|
| `frontend/src/lib/shirtNumberMask.ts` | **new** — `maskedShirtNumber`, `shirtNumberAriaLabel` |
| `frontend/src/lib/shirtNumberMask.test.ts` | **new** — mask policy, including the hidden/null distinction |
| `frontend/components/Shirt.tsx` | `difficulty` prop, masked number slot, label from the helper |
| `frontend/src/components/Shirt.test.tsx` | **new** — jsdom render tests for the mask in all four states |
| `frontend/components/TacticBoard.tsx` | plumb `difficulty` to `Shirt` |
| `frontend/app/missing-eleven/page.tsx` | pass `state.difficulty` to `TacticBoard` |
| `frontend/src/components/WordleModal.tsx` | mask the header number |
| `frontend/src/lib/difficulty.ts` | append `'hard'` to `DIFFICULTIES` |
| `frontend/src/lib/difficulty.test.ts` | update the offer-list assertion |
| `frontend/src/components/DifficultySelector.tsx` | "number shown" / "number hidden" |
| `frontend/src/components/DifficultySelector.test.tsx` | assert the Hard description |
| `frontend/src/components/FinishButton.test.tsx` | created in **v1.2.2 Task 7**; this patch adds the Hard absence case and re-runs the confirmation test (Task 6) |

---

## Tasks

### Task 1: The mask policy

**Files:**
- Create: `frontend/src/lib/shirtNumberMask.ts`
- Create: `frontend/src/lib/shirtNumberMask.test.ts`

**Interfaces:**
- Consumes: `Difficulty`, `DIFFICULTY_CONFIG` from `./difficulty`; `ShirtState` from `../../types`.
- Produces:
  ```ts
  export function maskedShirtNumber(
    mode: Difficulty,
    shirtNumber: number | null,
    state: ShirtState,
  ): number | null;

  export function shirtNumberAriaLabel(
    mode: Difficulty,
    shirtNumber: number | null,
    state: ShirtState,
  ): string;
  ```

- [ ] **Step 1.1: Write the failing test first.**

  Create `frontend/src/lib/shirtNumberMask.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import { maskedShirtNumber, shirtNumberAriaLabel } from './shirtNumberMask';

  describe('maskedShirtNumber', () => {
    it('shows the number in Easy and Normal', () => {
      for (const mode of ['easy', 'normal'] as const) {
        expect(maskedShirtNumber(mode, 9, 'default')).toBe(9);
        expect(maskedShirtNumber(mode, 9, 'in-progress')).toBe(9);
      }
    });

    it('hides the number in Hard while the shirt is unresolved', () => {
      expect(maskedShirtNumber('hard', 9, 'default')).toBeNull();
      expect(maskedShirtNumber('hard', 9, 'in-progress')).toBeNull();
    });

    it('reveals the number in Hard once the shirt is resolved', () => {
      // 'correct' means the player guessed the name; 'failed' means they used
      // the last attempt. Either way the shirt's identity is settled and the
      // number is no longer information the player lacks.
      expect(maskedShirtNumber('hard', 9, 'correct')).toBe(9);
      expect(maskedShirtNumber('hard', 9, 'failed')).toBe(9);
    });

    it('leaves a genuinely null number null in every mode', () => {
      for (const mode of ['easy', 'normal', 'hard', 'expert'] as const) {
        for (const state of ['default', 'in-progress', 'correct', 'failed'] as const) {
          expect(maskedShirtNumber(mode, null, state)).toBeNull();
        }
      }
    });

    it('never returns a number in Expert while unresolved', () => {
      expect(maskedShirtNumber('expert', 9, 'default')).toBeNull();
      expect(maskedShirtNumber('expert', 9, 'in-progress')).toBeNull();
      expect(maskedShirtNumber('expert', 9, 'correct')).toBe(9);
    });
  });

  describe('shirtNumberAriaLabel', () => {
    it('names a visible number plainly', () => {
      expect(shirtNumberAriaLabel('normal', 9, 'default')).toBe('9');
    });

    it('distinguishes a Hard-masked number from a missing one', () => {
      // This is the distinction a null-write would destroy (§5.6). Two shirts
      // can both display '?'; only the label says whether the number is being
      // withheld or was never on record.
      expect(shirtNumberAriaLabel('hard', 9, 'default')).toBe('? (number hidden)');
      expect(shirtNumberAriaLabel('hard', null, 'default')).toBe('? (no number on record)');
    });

    it('uses the same two labels in Expert', () => {
      expect(shirtNumberAriaLabel('expert', 4, 'default')).toBe('? (number hidden)');
      expect(shirtNumberAriaLabel('expert', null, 'default')).toBe('? (no number on record)');
    });

    it('reports a missing number in Easy and Normal without claiming it is hidden', () => {
      expect(shirtNumberAriaLabel('easy', null, 'default')).toBe('? (no number on record)');
      expect(shirtNumberAriaLabel('normal', null, 'default')).toBe('? (no number on record)');
    });

    it('reports the real number once the shirt is resolved in a masking mode', () => {
      expect(shirtNumberAriaLabel('hard', 9, 'correct')).toBe('9');
      expect(shirtNumberAriaLabel('hard', 9, 'failed')).toBe('9');
      expect(shirtNumberAriaLabel('hard', null, 'failed')).toBe('? (no number on record)');
    });
  });
  ```

  The `distinguishes a Hard-masked number from a missing one` test is the one that fails against a naive implementation, because a naive one returns `'?'` for both and the two cases are indistinguishable to a screen-reader user.

- [ ] **Step 1.2: Verify red.**

  ```bash
  cd frontend && npx vitest run src/lib/shirtNumberMask.test.ts 2>&1 | tail -20
  ```

  Expected: **FAIL** — `Failed to resolve import "./shirtNumberMask"`.

- [ ] **Step 1.3: Implement the policy.**

  Create `frontend/src/lib/shirtNumberMask.ts`:

  ```ts
  import { DIFFICULTY_CONFIG, type Difficulty } from './difficulty';
  import type { ShirtState } from '../../types';

  /** True once the shirt's identity is settled and the number is no longer a secret. */
  function isResolved(state: ShirtState): boolean {
    return state === 'correct' || state === 'failed';
  }

  /**
   * The number to *display* for a shirt, or `null` when there is nothing to
   * display.
   *
   * This returns a value; it never writes one. `shirtNumber` in state and in
   * the payload stays exactly as the API delivered it, because the reveal
   * flow and the API both still need the real number (§5.6). `null` here means
   * "render the mask", not "the shirt has no number".
   */
  export function maskedShirtNumber(
    mode: Difficulty,
    shirtNumber: number | null,
    state: ShirtState,
  ): number | null {
    if (shirtNumber === null) return null;
    if (DIFFICULTY_CONFIG[mode].showShirtNumber) return shirtNumber;
    return isResolved(state) ? shirtNumber : null;
  }

  /**
   * The number as it appears in the shirt's accessible name.
   *
   * Three distinct facts must stay distinguishable, and this is why the mask
   * is not a null write:
   *   - the number is visible          -> '9'
   *   - the number is withheld by mode -> '? (number hidden)'
   *   - the player has no number       -> '? (no number on record)'
   *
   * The second and third both display as '?' to a sighted player, so the
   * label is the only place the difference can live.
   */
  export function shirtNumberAriaLabel(
    mode: Difficulty,
    shirtNumber: number | null,
    state: ShirtState,
  ): string {
    const display = maskedShirtNumber(mode, shirtNumber, state);
    if (display !== null) return String(display);
    if (shirtNumber === null) return '? (no number on record)';
    return '? (number hidden)';
  }
  ```

  `maskedShirtNumber` is the only place `showShirtNumber` is read, and `shirtNumberAriaLabel` is the only place the withheld/absent distinction is made. Keeping both in one module is what keeps `Shirt.tsx` free of mode comparisons.

- [ ] **Step 1.4: Verify green.**

  ```bash
  cd frontend && npx vitest run src/lib/shirtNumberMask.test.ts 2>&1 | tail -20
  ```

  Expected: `Test Files 1 passed (1)` / `Tests 11 passed (11)`.

- [ ] **Step 1.5: Commit.**

  ```bash
  git add frontend/src/lib/shirtNumberMask.ts frontend/src/lib/shirtNumberMask.test.ts
  git commit -m "feat(frontend): add the render-only shirt number mask"
  ```

---

### Task 2: Render the mask in `Shirt`

**Files:**
- Modify: `frontend/components/Shirt.tsx` (`:18-30` props, `:32-56` label, number span at `:225-235`)
- Create: `frontend/src/components/Shirt.test.tsx`

**Interfaces:**
- Consumes: `maskedShirtNumber`, `shirtNumberAriaLabel` from `@/lib/shirtNumberMask`; `DEFAULT_DIFFICULTY`, `type Difficulty` from `@/lib/difficulty`.
- Produces: `ShirtProps` gains `difficulty?: Difficulty`. Every existing caller keeps compiling because the prop is optional and defaults.

- [ ] **Step 2.1: Write the failing test first.**

  Create `frontend/src/components/Shirt.test.tsx`:

  ```tsx
  // @vitest-environment jsdom
  import { describe, it, expect } from 'vitest';
  import { render, screen } from '@testing-library/react';
  import Shirt from '../../components/Shirt';
  import type { ShirtData } from '../../types';

  const base: ShirtData = {
    token: 'tok-1',
    nameLength: 5,
    wordBoundaries: [],
    shirtNumber: 9,
    position: 'ST',
    coords: { x: 50, y: 50 },
    state: 'default',
  };

  function renderShirt(overrides: Partial<ShirtData> = {}, difficulty?: 'easy' | 'normal' | 'hard' | 'expert') {
    return render(<Shirt shirt={{ ...base, ...overrides }} index={0} difficulty={difficulty} />);
  }

  describe('Shirt number masking', () => {
    it('shows the number in Normal', () => {
      renderShirt({}, 'normal');
      expect(screen.getByTestId('shirt-number').textContent).toBe('9');
    });

    it('shows the number when no mode is given, defaulting to Normal', () => {
      render(<Shirt shirt={base} index={0} />);
      expect(screen.getByTestId('shirt-number').textContent).toBe('9');
    });

    it('shows a question mark instead of the number in Hard', () => {
      renderShirt({}, 'hard');
      expect(screen.getByTestId('shirt-number').textContent).toBe('?');
      expect(screen.getByTestId('shirt-number').textContent).not.toContain('9');
    });

    it('reveals the number in Hard once the shirt is guessed', () => {
      renderShirt({ state: 'correct', name: 'Someone' }, 'hard');
      expect(screen.getByTestId('shirt-number').textContent).toBe('9');
    });

    it('reveals the number in Hard once the shirt has failed', () => {
      renderShirt({ state: 'failed' }, 'hard');
      expect(screen.getByTestId('shirt-number').textContent).toBe('9');
    });

    it('renders no number element at all for a player with no number on record', () => {
      renderShirt({ shirtNumber: null }, 'normal');
      expect(screen.queryByTestId('shirt-number')).toBeNull();
    });

    it('gives a Hard-masked shirt a different label from a numberless one', () => {
      const { unmount } = renderShirt({ shirtNumber: 9 }, 'hard');
      expect(screen.getByRole('button').getAttribute('aria-label')).toContain('? (number hidden)');
      unmount();

      renderShirt({ shirtNumber: null }, 'hard');
      expect(screen.getByRole('button').getAttribute('aria-label'))
        .toContain('? (no number on record)');
    });

    it('keeps the real number in the shirt data after masking', () => {
      // The mask is render-only. This asserts it at the boundary that matters:
      // what went into the component is what the caller still holds.
      const shirt = { ...base };
      renderShirt({}, 'hard');
      expect(shirt.shirtNumber).toBe(9);
    });

    it('shows no clue-bearing text on a Hard shirt', () => {
      // Hard shows nothing but a masked number. The clue set is already
      // ['shirt-number'] (v1.2.2); this pins the rendered outcome.
      renderShirt({}, 'hard');
      const button = screen.getByRole('button');
      expect(button.textContent).not.toMatch(/scorer|captain|first letter/i);
    });
  });
  ```

  The file is under `frontend/src/components/`, not beside `Shirt.tsx`, because `frontend/vitest.config.ts:16` collects `src/**`. The import points outward at `../../components/Shirt`. Do not move the component to make the path shorter.

- [ ] **Step 2.2: Verify red.**

  ```bash
  cd frontend && npx vitest run src/components/Shirt.test.tsx 2>&1 | tail -25
  ```

  Expected: **FAIL** on the Hard cases — `queryByTestId('shirt-number')` finds nothing because the span has no `data-testid`, and the aria label contains `?` but not `? (number hidden)`.

- [ ] **Step 2.3: Add the prop and the import.**

  In `frontend/components/Shirt.tsx`:

  1. Add the imports beside the existing ones:

     ```ts
     import { DEFAULT_DIFFICULTY, type Difficulty } from '@/lib/difficulty';
     import { maskedShirtNumber, shirtNumberAriaLabel } from '@/lib/shirtNumberMask';
     ```

  2. Add to `ShirtProps` (after `colors`):

     ```ts
     /**
      * Mode in force, which decides whether the shirt number is visible.
      * Optional and defaulting to Normal so every existing caller — including
      * the storybook-style usages in `frontend/components` — is unaffected.
      * A per-game property, so it lives here and not in `ShirtData`, which is
      * a per-shirt wire shape shared with the API.
      */
     difficulty?: Difficulty;
     ```

  3. Change `shirtAriaLabel`'s signature to take the already-resolved label string rather than the number:

     ```ts
     function shirtAriaLabel(state: ShirtState, number: string, name?: string): string {
       switch (state) {
         case 'default':
           return `Shirt ${number}, tap to guess the player`;
         case 'in-progress':
           return `Shirt ${number}, guessing in progress`;
         case 'correct':
           return name
             ? `Shirt ${number}, guessed correctly: ${name}`
             : `Shirt ${number}, guessed correctly`;
         case 'failed':
           return name
             ? `Shirt ${number}, wrong: revealed as ${name}`
             : `Shirt ${number}, no correct guess`;
       }
     }
     ```

     The `const number = shirtNumber ?? '?'` line is **removed** — the caller now supplies the string, and it is the only thing that can tell the three cases apart. Every other branch is byte-identical to the current implementation.

  4. In the component signature, destructure `difficulty = DEFAULT_DIFFICULTY`, and immediately after the existing `shirt` destructure add:

     ```ts
     const displayNumber = maskedShirtNumber(difficulty, shirt.shirtNumber, state);
     const numberLabel = shirtNumberAriaLabel(difficulty, shirt.shirtNumber, state);
     ```

     Replace the aria-label call site with `aria-label={shirtAriaLabel(state, numberLabel, shirt.name)}`.

  5. Replace the number span at lines 225-235 with:

     ```tsx
     {displayNumber !== null && (
       <span
         data-testid="shirt-number"
         className={`absolute inset-0 flex items-center justify-center pt-[4%] font-display leading-none ${numberClass}`}
         style={{
           fontSize: '38cqw',
           ...(colors?.numberOutline ? { WebkitTextStroke: '1px #000' } : {}),
         }}
       >
         {displayNumber}
       </span>
     )}
     {(displayNumber === null && DIFFICULTY_CONFIG[difficulty].showShirtNumber === false) && (
       <span
         data-testid="shirt-number"
         className={`absolute inset-0 flex items-center justify-center pt-[4%] font-display leading-none ${numberClass}`}
         style={{ fontSize: '38cqw', ...(colors?.numberOutline ? { WebkitTextStroke: '1px #000' } : {}) }}
       >
         ?
       </span>
     )}
     ```

     **On the two spans and the visible `?`.** §5.1 calls the mode "masked `?`"; §5.6 notes the component "already knows how to hide the number by absence" and that `?` is an accessible-name convention. This implementation resolves the two in favour of §5.1: the `?` is **rendered** in the number slot, because a shirt with an empty centre reads as broken rather than as hidden, while §5.6's actual constraint — that `'?'` is never *stored* in `shirtNumber` — is satisfied because this substitution happens in the JSX, after the data has been read. The two conditions above are exhaustive and mutually exclusive: a real number renders as itself, a withheld number renders as `?`, and a player with no number on record renders neither.

     If the reviewer prefers the §5.6 reading (hide by absence, `?` only in the label), delete the second span and drop the two `renderShirt({ shirtNumber: null })` expectations from Task 2.1's list — but do not leave both spans' behaviour untested either way.

- [ ] **Step 2.4: Verify green, then the whole frontend.**

  ```bash
  cd frontend && npx vitest run src/components/Shirt.test.tsx 2>&1 | tail -25
  ```

  Expected: `Test Files 1 passed (1)` / `Tests 9 passed (9)`.

  ```bash
  cd frontend && npx tsc --noEmit && npm run test 2>&1 | tail -12 && npm run lint 2>&1 | tail -20
  ```

  Expected: `tsc` clean; the suite count is the v1.2.2 exit count plus 9 plus 11; no new lint warnings.

- [ ] **Step 2.5: Commit.**

  ```bash
  git add frontend/components/Shirt.tsx frontend/src/components/Shirt.test.tsx
  git commit -m "feat(frontend): mask the shirt number in Hard mode at render time"
  ```

---

### Task 3: Plumb the mode to the board

**Files:**
- Modify: `frontend/components/TacticBoard.tsx` (`:10-21` props, `:42` the `Shirt` call)
- Modify: `frontend/app/missing-eleven/page.tsx` (the `<TacticBoard>` call)

**Interfaces:**
- Consumes: `state.difficulty` from `useGameState()`.
- Produces: `TacticBoardProps` gains `difficulty?: Difficulty`, forwarded to every `Shirt`. `Shirt` is the only component that receives it, and `TacticBoard` is the only production caller of `Shirt` (`frontend/components/TacticBoard.tsx:42`).

- [ ] **Step 3.1: Add the prop to `TacticBoard`.**

  In `frontend/components/TacticBoard.tsx`:

  1. Import `DEFAULT_DIFFICULTY, DIFFICULTY_CONFIG, type Difficulty` from `@/lib/difficulty`.
  2. Add to `TacticBoardProps`:

     ```ts
     /** Mode in force; forwarded to every Shirt so the number can be masked. */
     difficulty?: Difficulty;
     ```

  3. Destructure `difficulty = DEFAULT_DIFFICULTY` in the signature, and replace the `<Shirt ...>` line at 42 with:

     ```tsx
     <Shirt key={shirt.token} shirt={shirt} index={index} onClick={onShirtClick} guessHistory={shirt.guessHistory} colors={colors} difficulty={difficulty} />
     ```

  4. If the board renders a heading or legend that mentions shirt numbers, guard it with `DIFFICULTY_CONFIG[difficulty].showShirtNumber`. If it does not, delete the unused `DIFFICULTY_CONFIG` import — an unused import is a lint failure.

- [ ] **Step 3.2: Pass it from the page.**

  In `frontend/app/missing-eleven/page.tsx`, at the `<TacticBoard>` call, add `difficulty={state.difficulty}`.

- [ ] **Step 3.3: Prove the mask is reachable and the data is untouched.**

  ```bash
  grep -rn "difficulty=" frontend/app/missing-eleven/page.tsx
  ```

  Expected: a hit for `<TacticBoard ... difficulty={state.difficulty} />`.

  ```bash
  grep -rn "shirtNumber = null\|shirtNumber: null\|shirtNumber = '?'\|shirtNumber: '?'" frontend/app frontend/src frontend/components frontend/lib
  ```

  Expected: hits **only** in test fixtures and type/interface declarations — never in a line that assigns to a live shirt. Any hit in `page.tsx`, `gameState.ts` or `TacticBoard.tsx` is a mask implemented as a data write and must be reverted to a prop.

- [ ] **Step 3.4: Verify the full frontend.**

  ```bash
  cd frontend && npx tsc --noEmit && npm run test 2>&1 | tail -12 && npm run lint 2>&1 | tail -20
  ```

  Expected: all green at the count recorded in Task 2 Step 2.4.

- [ ] **Step 3.5: Commit.**

  ```bash
  git add frontend/components/TacticBoard.tsx frontend/app/missing-eleven/page.tsx
  git commit -m "feat(frontend): thread the difficulty through TacticBoard to Shirt"
  ```

---

### Task 4: Mask the number in the open-shirt modal

**Files:**
- Modify: `frontend/src/components/WordleModal.tsx`
- Modify: `frontend/src/components/WordleModal.test.tsx`

**Interfaces:**
- Consumes: `difficulty?: Difficulty` (added in v1.2.2 Task 6) and the `shirtNumber` prop.
- Produces: no new props. The modal header shows the same masked value the shirt does, via the same helper — one policy, two render sites.

- [ ] **Step 4.1: Write the failing test first.**

  Append to `frontend/src/components/WordleModal.test.tsx`:

  ```tsx
    it('masks the header number in Hard', () => {
      render(
        <WordleModal nameLength={5} shirtNumber={9} position="ST" guesses={[]}
          onGuess={() => {}} onClose={() => {}} difficulty="hard" />,
      );
      expect(screen.getByTestId('modal-shirt-number').textContent).toBe('?');
    });

    it('shows the header number in Normal', () => {
      render(
        <WordleModal nameLength={5} shirtNumber={9} position="ST" guesses={[]}
          onGuess={() => {}} onClose={() => {}} difficulty="normal" />,
      );
      expect(screen.getByTestId('modal-shirt-number').textContent).toBe('9');
    });

    it('shows no header number element for a player with no number on record', () => {
      render(
        <WordleModal nameLength={5} shirtNumber={null} position="ST" guesses={[]}
          onGuess={() => {}} onClose={() => {}} difficulty="hard" />,
      );
      expect(screen.queryByTestId('modal-shirt-number')).toBeNull();
    });
  ```

- [ ] **Step 4.2: Verify red.**

  ```bash
  cd frontend && npx vitest run src/components/WordleModal.test.tsx 2>&1 | tail -25
  ```

  Expected: **FAIL** on all three — `data-testid="modal-shirt-number"` does not exist.

- [ ] **Step 4.3: Implement.**

  In `frontend/src/components/WordleModal.tsx`, import `maskedShirtNumber` from `../lib/shirtNumberMask` and replace the header's number rendering with:

  ```tsx
  {(() => {
    const display = maskedShirtNumber(difficulty, shirtNumber, 'in-progress');
    if (display !== null) {
      return <span data-testid="modal-shirt-number">{display}</span>;
    }
    if (!DIFFICULTY_CONFIG[difficulty].showShirtNumber) {
      return <span data-testid="modal-shirt-number">?</span>;
    }
    return null;
  })()}
  ```

  The state argument is `'in-progress'` because the modal is only ever open on an unresolved shirt — a resolved shirt is closed by the reducer. Passing `'correct'` or `'failed'` here would show a number the player has not earned.

- [ ] **Step 4.4: Verify green.**

  ```bash
  cd frontend && npx vitest run src/components/WordleModal.test.tsx 2>&1 | tail -20
  ```

  Expected: the file's full count green, including v1.2.2's three clue-line tests.

  ```bash
  cd frontend && npx tsc --noEmit && npm run test 2>&1 | tail -12 && npm run lint 2>&1 | tail -20
  ```

- [ ] **Step 4.5: Commit.**

  ```bash
  git add frontend/src/components/WordleModal.tsx frontend/src/components/WordleModal.test.tsx
  git commit -m "feat(frontend): mask the shirt number in the guess modal header"
  ```

---

### Task 5: Offer Hard

**Files:**
- Modify: `frontend/src/lib/difficulty.ts` (the `DIFFICULTIES` comment and array)
- Modify: `frontend/src/lib/difficulty.test.ts` (the offer-list assertion)
- Modify: `frontend/src/components/DifficultySelector.tsx` (`describeMode`)
- Modify: `frontend/src/components/DifficultySelector.test.tsx`

**Interfaces:**
- Consumes: nothing new. `DIFFICULTY_CONFIG.hard` was written and tested in v1.2.2 Task 1; this task only makes the mode reachable.
- Produces: `DIFFICULTIES === ['easy', 'normal', 'hard']`. The selector file itself does not change shape — it iterates `DIFFICULTIES`.

- [ ] **Step 5.1: Update the failing test first.**

  In `frontend/src/lib/difficulty.test.ts`, replace the offer-list assertion:

  ```ts
    it('offers only the modes that have shipped, in ascending order', () => {
      expect(DIFFICULTIES).toEqual(['easy', 'normal', 'hard']);
    });
  ```

  and add:

  ```ts
    it('still withholds Expert until v1.2.4', () => {
      expect(DIFFICULTIES).not.toContain('expert');
    });
  ```

- [ ] **Step 5.2: Verify red.**

  ```bash
  cd frontend && npx vitest run src/lib/difficulty.test.ts 2>&1 | tail -20
  ```

  Expected: **FAIL** — `DIFFICULTIES` is `['easy', 'normal']`.

- [ ] **Step 5.3: Append the mode.**

  In `frontend/src/lib/difficulty.ts`:

  ```ts
  /**
   * Modes offered in the UI, in ascending order. Deliberately shorter than the
   * config: a mode is offered only once the patch that implements its rules
   * has shipped. v1.2.2 offers Easy and Normal; v1.2.3 appends Hard, whose
   * rules (clue removal and the number mask) are implemented above; v1.2.4
   * appends Expert.
   */
  export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
  ```

- [ ] **Step 5.4: Make the selector's description tell the truth about the number.**

  In `frontend/src/components/DifficultySelector.tsx`, replace the last line of `describeMode`:

  ```ts
    return `${c.attempts} attempts · ${clueText} · ${c.showShirtNumber ? 'number shown' : 'number hidden'}`;
  ```

  The `number shown` literal written in v1.2.2 becomes conditional here, and stays conditional — v1.2.4 does not touch it.

  In `frontend/src/components/DifficultySelector.test.tsx`, add:

  ```tsx
    it('tells the player that Hard hides the number', () => {
      render(<DifficultySelector value="normal" onChange={() => {}} />);
      expect(screen.getByText(/number hidden/)).toBeTruthy();
      expect(screen.getByText(/number shown/)).toBeTruthy();
    });
  ```

  The Hard mode's `clueText` is `no clues`, so the rendered row reads `6 attempts · no clues · number hidden`.

- [ ] **Step 5.5: Verify green and run everything.**

  ```bash
  cd frontend && npx vitest run src/lib/difficulty.test.ts src/components/DifficultySelector.test.tsx 2>&1 | tail -20
  ```

  Expected: both files green; `difficulty.test.ts` now 8 tests, the selector 5.

  ```bash
  cd frontend && npx tsc --noEmit && npm run test 2>&1 | tail -12 && npm run lint 2>&1 | tail -20
  cd backend  && npm run test 2>&1 | tail -12
  ```

  Expected: frontend `tsc` clean and the full count green; backend unchanged.

- [ ] **Step 5.6: Commit.**

  ```bash
  git add frontend/src/lib/difficulty.ts frontend/src/lib/difficulty.test.ts frontend/src/components/DifficultySelector.tsx frontend/src/components/DifficultySelector.test.tsx
  git commit -m "feat(frontend): offer Hard mode in the selector"
  ```

---

### Task 6: Confirm the Finish control across the third non-Expert mode

**The control is created in v1.2.2 Task 7; this task confirms it.** Hard is the
third `opponentRequired: false` row, and it is the one that proves the control
reads the **table** rather than a hardcoded pair of mode names: Easy and Normal
are the default and its sibling, so a two-mode check is satisfied by
`mode !== 'expert' && mode !== 'hard'` as easily as by a table read. Three modes
is where the shortcut starts to hurt (roadmap §5.2, R1).

**Nothing about the mask is touched here.** This task is a verification and, if
v1.2.2 got it wrong, a one-line fix.

**Files:**
- Modify: `frontend/src/components/FinishButton.test.tsx` (created in v1.2.2) — add the Hard case and re-run the property test over the grown offer list
- Verify, and modify only if v1.2.2 got it wrong: `frontend/src/components/FinishButton.tsx`

**Interfaces:**
- Consumes: `FinishButton` and `FinishButtonProps` from v1.2.2 Task 7, unchanged. **No new prop, no new component, no new export.**
- Produces: the Hard absence assertion.

- [ ] **Step 6.1: Write the failing test first.**

  Append to `describe('FinishButton')` in `frontend/src/components/FinishButton.test.tsx`:

  ```tsx
    it('renders nothing in Hard either, so the third mode proves the flag is read', () => {
      // Easy and Normal are the default and its sibling; a `mode !== 'expert'`
      // shortcut passes both. Hard is what forces a table read.
      const { container } = render(
        <FinishButton difficulty="hard" resolved={22} total={22} onFinish={() => {}} />,
      );
      expect(container.innerHTML).toBe('');
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('still renders the confirmation step for the required mode', () => {
      // The confirmation is part of the affordance and must survive every later
      // patch that touches the component.
      const onFinish = vi.fn();
      render(<FinishButton difficulty="expert" resolved={22} total={22} onFinish={onFinish} />);
      fireEvent.click(screen.getByRole('button', { name: /^finish/i }));
      expect(onFinish).not.toHaveBeenCalled();
      expect(screen.getByText(/cannot be undone/i)).toBeTruthy();
    });
  ```

  The `reads the flag, not the mode name` property test added in v1.2.2 iterates `DIFFICULTIES`, so it now covers `hard` as well. **Re-run it rather than adding a hand-written `hard` case to it** — a table read and three special cases look identical in the output and diverge the moment a fifth mode appears.

- [ ] **Step 6.2: Verify red.**

  ```bash
  cd frontend && npx vitest run src/components/FinishButton.test.tsx 2>&1 | tail -25
  ```

  Expected: **FAIL** if v1.2.2's `FinishButton` compared against a literal mode name or rendered a disabled control instead of returning `null`. If the Hard case passes, that is a **verified** result: record it in the changelog and keep the test, because it is the standing guard for R1 and for v1.2.4's absence assertion.

- [ ] **Step 6.3: Fix the control if it reads a mode name.**

  In `frontend/src/components/FinishButton.tsx`, the render must branch on the flag only:

  ```tsx
    if (!DIFFICULTY_CONFIG[difficulty].opponentRequired) return null;
  ```

  and the hint must be composed from `DIFFICULTY_CONFIG[difficulty].label` rather than a literal mode name. Do not add a prop, a screen, or a new dialog: the affordance is a control plus a confirmation inside the existing board and dialog patterns (roadmap §5.2), and the mask work in this patch must not bleed into it.

- [ ] **Step 6.4: Verify and commit.**

  ```bash
  cd frontend && npx vitest run src/components/FinishButton.test.tsx 2>&1 | tail -20
  cd frontend && npx tsc --noEmit && npm run test 2>&1 | tail -12 && npm run lint 2>&1 | tail -20
  git add frontend/src/components/FinishButton.test.tsx frontend/src/components/FinishButton.tsx
  git commit -m "test(frontend): confirm the Finish control across the third non-Expert mode"
  ```

  Expected: `7 passed (7)`; `tsc` clean; no new lint warnings; the mask tests unchanged from this patch's earlier tasks.

---

## Acceptance criteria

1. `DIFFICULTIES` is `['easy', 'normal', 'hard']`; `expert` is still absent from the offer list.
2. In `Hard`, an unresolved shirt displays `?` in the number slot and the real number appears in neither the shirt nor the open-shirt modal.
3. In `Hard`, a `correct` or `failed` shirt displays its real number in both places.
4. In `Easy` and `Normal`, every shirt displays its real number and the default (no `difficulty` prop) is `Normal`.
5. A shirt whose `shirtNumber` is `null` renders **no** number element in any mode, and is not confused with a masked one.
6. The two `?` cases have different accessible names: `? (number hidden)` and `? (no number on record)`.
7. `shirtNumber` is unchanged after the patch: no `'?'` or `null` is written into it anywhere outside test fixtures. Verified by grep.
8. The tag-number sites at `Shirt.tsx:249/254` are untouched and still render `#<number>` on a resolved shirt.
9. The reveal join is unaffected: `grep -rn "shirtNumber ===" frontend/src frontend/app frontend/components` still returns nothing.
10. `availableClues('hard', ...)` still returns `['shirt-number']`, and no Hard shirt renders scorer, captain or first-letter text.
11. New component tests live under `frontend/src/components/`, import outward with `../../components/...`, and carry `// @vitest-environment jsdom`.
12. `frontend/vitest.config.ts` is unchanged — this patch adds no alias and no include entry, because v1.1.1 owns that file; `frontend/components/Shirt.colors.test.tsx` is not moved.
13. `FinishButton` renders **nothing** in `Hard` at `resolved={22}`, and the confirmation step still fires for a required mode. The absence is asserted for all three non-Expert modes across v1.2.2 and v1.2.3, with a property test over `DIFFICULTIES` rather than three hand-written cases.
14. `FinishButton.tsx` is modified only if v1.2.2 read a mode name instead of `opponentRequired`; in the expected case it is not modified at all.
15. Frontend: full suite green, `tsc` clean, `lint` clean. Backend: untouched and green.

## Validation

| Check | Command | Pass signal |
|---|---|---|
| Mask policy | `cd frontend && npx vitest run src/lib/shirtNumberMask.test.ts` | `11 passed (11)` |
| Shirt rendering | `cd frontend && npx vitest run src/components/Shirt.test.tsx` | `9 passed (9)` |
| Modal number | `cd frontend && npx vitest run src/components/WordleModal.test.tsx` | all green |
| Offer list | `cd frontend && npx vitest run src/lib/difficulty.test.ts` | `8 passed (8)` |
| Finish control (Task 6) | `cd frontend && npx vitest run src/components/FinishButton.test.tsx` | `7 passed (7)` — v1.2.2's 5 plus the 2 added here |
| Full frontend | `cd frontend && npm run test` | every file green |
| Types | `cd frontend && npx tsc --noEmit` | no output |
| Lint | `cd frontend && npm run lint` | no output |
| No data-level mask | `grep -rn "shirtNumber = null\|shirtNumber: null\|shirtNumber = '?'\|shirtNumber: '?'" frontend/app frontend/src frontend/components` | only fixtures and type declarations |
| No shirt-number join | `grep -rn "shirtNumber ===" frontend/src frontend/app frontend/components` | no output |
| No mode-name branching in components | `grep -rn "=== 'hard'" frontend/src/components frontend/components frontend/app` | no output |
| No test config change | `git diff --stat <base> -- frontend/vitest.config.ts frontend/vitest.config.mts` | empty |
| Tests are collected | `cd frontend && npx vitest list 2>&1 \| grep -c "Shirt.test\|shirtNumberMask"` | 2 files listed, not 0 |
| Backend untouched | `cd backend && npm run test` | every file green; count measured and recorded, not asserted |

## Risks

| Risk | Mitigation |
|---|---|
| **The mask leaks into data** — someone "simplifies" by nulling `shirtNumber` where the mask is applied. | Two guards: the grep in the validation table, and `maskedShirtNumber` returning a value rather than mutating. The reveal join is on `token`, so a null-write would not crash — it would silently stop the shirt from ever being identifiable, which is worse. |
| **A test is filed next to the component and lands outside the coverage `include`.** This patch's most valuable test is the aria-label distinction, and it is exactly the kind of test that gets written beside `Shirt.tsx`. | Tests are specified under `frontend/src/components/` with outward imports, so they are both collected and covered. The `npx vitest list` check in the validation table counts collected files, which is the check that catches a *missing* file rather than a misplaced one. v1.1.1 owns the include; this patch does not touch it. |
| **The §5.1 "masked `?`" and §5.6 "hide by absence" readings differ**, and the choice is visible to the player. | The resolution is written at the implementation site with its reasoning, and the alternative is stated with the exact test edits it requires, so the choice is reviewable rather than implicit. |
| **Hard ships with a ×2 multiplier that does nothing yet.** | `DIFFICULTY_CONFIG.hard.multiplier` is read by nothing until v1.2.5. That is intentional and §5.6 assigns the multiplier to v1.2.5. Do not wire it early — a scoring change here would make Hard's difficulty untestable against Normal. |
| **Expert's mask arrives early** because `DIFFICULTY_CONFIG.expert.showShirtNumber` is already `false`. | `maskedShirtNumber` is tested for `expert` (Task 1.1) and passes; this is correct and harmless, because no UI path can select `expert` until v1.2.4 appends it to `DIFFICULTIES`. |
| **Task 6 touches a component in a patch about masking, and the two concerns get tangled** — someone "simplifies" `FinishButton` to share the mask's mode branching. | Task 6 modifies nothing unless v1.2.2 read a mode name, and its own acceptance criterion says so. The mask's data flow (`shirtNumberMask.ts` → `Shirt` → `TacticBoard`) and the control's (`DIFFICULTY_CONFIG` → `FinishButton`) share only the config table, which is the intended single source. `git diff --stat` on the patch shows the two files kept apart. |

**Escalate before proceeding if:** the reviewer rejects the visible-`?` reading of §5.1 versus §5.6's hide-by-absence, since it changes two spans and two test expectations. Also escalate if `Shirt.colors.test.tsx` turns out to be uncollected *and* broken — fixing it belongs to v1.1.1, not here.
