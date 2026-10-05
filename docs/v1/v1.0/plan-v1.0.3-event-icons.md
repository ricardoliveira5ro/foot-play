# Scorer & Send-Off Shirt Badges Implementation Plan

> **Status:** Implemented and released in commits `84554e6`, `547d251`, `8ec5a00`; scorer artwork refinement followed in `c3d5cfc`. The post-release UI refinements below are also present in the current working tree.

> **For agentic workers:** This document records the shipped behavior and implementation plan. The original step checkboxes are retained as the implementation workflow; they are not a live status tracker.

**Goal:** A shirt shows one football badge per goal and a send-off badge when its player was dismissed. Event badges stay together at the row's left/start; after a guess, the correct or wrong mark sits at the row's right/end. The row expands as needed so the badges do not overlap. Hovering uses a pointer cursor without moving or lifting the shirt and badge row. A game with no event data shows no event badges, with no error or zero-valued icon.

**Architecture:** A pure helper `frontend/src/lib/shirtBadges.ts` decides *which* badges exist, including one scorer badge per goal; `frontend/components/Shirt.tsx` only decides *how* they look. The split exists so v1.2's difficulty modes can ask whether the scorers clue is available without importing React or reaching into a component. `assists` and `isCaptain` are exposed by v1.0.2 but are not read here.

**Tech Stack:** Next.js 16 / React 19, Tailwind 4 design tokens (`text-ink`, `text-failed`, `bg-paper`), inline SVG, Vitest + Testing Library + jsdom.

## Global Constraints

- **The scorer badge IS a scored clue in Easy and Normal** (§5.1). **The send-off badge is DECORATION ONLY in every mode** — never scored, never in the multiplier (O5, §3.1, §5.1). Nothing in this patch scores anything, and nothing in it may.
- **§3.1 degradation, exactly:** missing data renders **no icon**. Never an error, never a zero-valued icon, never a broken tile.
- **No availability flag exists and none may be added.** The columns default to `0`, and `0` is indistinguishable from "did not score". So the UI cannot ask whether the data is present and the honest answer is always no. **Degradation is per game, uniform across all 22 shirts, not per shirt.** A game seeded before v1.0.1 renders no badge for anyone, and that is correct.
- **`goals` and `redCards` are required `number`s on `LineupPlayer`** (v1.0.2). There is no absent state, so no `?? 0` guard, no optional prop, and no `undefined` branch anywhere in this patch.
- **R7 — the vitest include is `src/**` only** (`frontend/vitest.config.ts:16`). Tests under `frontend/components/**` are **silently not collected**: `frontend/components/Shirt.colors.test.tsx` has never executed. This patch therefore places its component test at `frontend/src/components/Shirt.badges.test.tsx`. **Widening the include is v1.1.1's job (R7) and is explicitly out of scope here.** Do not touch `frontend/vitest.config.ts`.
- **Rollback chain is strict:** v1.0.3 → v1.0.2 → v1.0.1 → v0.2.5. Reverting v1.0.3 alone is safe; reverting v1.0.2 while keeping v1.0.3 is not (the types would stop matching the wire), so revert in order.
- **TDD mode: advisory_active.** Test first; red → green → refactor; report the commands and results.
- The frontend has **no coverage gate** (`frontend/vitest.config.ts` defines no `thresholds`), but both new files are still tested at branch level.

---

### Task 1: `shirtBadges.ts` — the pure badge decision

**Files:**
- Create: `frontend/src/lib/shirtBadges.ts`
- Create: `frontend/src/lib/shirtBadges.test.ts`

**Interfaces:**
- Consumes: `LineupPlayer.goals` and `LineupPlayer.redCards` (`frontend/types/index.ts`, v1.0.2).
- Produces (frozen — do not rename, do not reorder the union):

  ```ts
  export type ShirtBadge = 'scorer' | 'sent-off';
  export function badgesForShirt(input: { goals: number; redCards: number }): ShirtBadge[];
  ```

  Everything downstream — the component and, later, v1.2's clue logic — reads
  this function rather than re-deriving the rule.

**Steps:**

- [ ] **Step 1.1: Write the test file first.**

  Create `frontend/src/lib/shirtBadges.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import { badgesForShirt } from './shirtBadges';

  describe('badgesForShirt', () => {
    it('returns no badges when the game has no event data', () => {
      expect(badgesForShirt({ goals: 0, redCards: 0 })).toEqual([]);
    });

    it('returns a scorer badge when the player scored', () => {
      expect(badgesForShirt({ goals: 1, redCards: 0 })).toEqual(['scorer']);
    });

    it('returns a send-off badge when the player was dismissed', () => {
      expect(badgesForShirt({ goals: 0, redCards: 1 })).toEqual(['sent-off']);
    });

    it('returns both badges, scorer first, when both apply', () => {
      expect(badgesForShirt({ goals: 1, redCards: 1 })).toEqual(['scorer', 'sent-off']);
    });

    it('renders one scorer badge per goal', () => {
      expect(badgesForShirt({ goals: 3, redCards: 0 })).toEqual(['scorer', 'scorer', 'scorer']);
    });

    it('renders one send-off badge for multiple dismissals', () => {
      expect(badgesForShirt({ goals: 0, redCards: 2 })).toEqual(['sent-off']);
    });

    it('ignores a negative count rather than rendering a badge', () => {
      expect(badgesForShirt({ goals: -1, redCards: -1 })).toEqual([]);
    });
  });
  ```

  The last case pins the `> 0` comparison rather than truthiness: the columns
  are `@default(0)` and non-nullable, so a negative is impossible from the API,
  but a truthiness check would render a badge for `-1` if that ever changed.

- [ ] **Step 1.2: Run it and watch it fail.**

  ```bash
  cd frontend && npx vitest run src/lib/shirtBadges.test.ts
  ```

  Expected RED:

  ```
  FAIL  src/lib/shirtBadges.test.ts
  Error: Failed to load url ./shirtBadges
  ```

- [ ] **Step 1.3: Create `frontend/src/lib/shirtBadges.ts`.**

  ```ts
  /**
   * Which badges a shirt renders (v1.0.3).
   *
   * Pure and React-free on purpose: v1.2's Easy and Normal modes read this to
   * decide whether the scorers clue is available, without importing the Shirt
   * component or duplicating the rule.
   *
   * §3.1 graceful degradation. The database columns default to 0 and there is
   * no null, no unknown and no provenance flag, so "this game has no event
   * data" and "this player did not score" are the same value. Degradation is
   * therefore per GAME and uniform across all 22 shirts: a game seeded before
   * v1.0.1 returns [] for every shirt, and that is the correct answer, not a
   * bug. Do not add an availability flag here — the UI cannot ask.
   */
  export type ShirtBadge = 'scorer' | 'sent-off';

  /**
   * Badges for one shirt, ordered: 'scorer' before 'sent-off'.
   *
   * Always [] for a game with no event data — the per-game degradation rule.
   *
   * Note the asymmetry carried from v1.0.1: the scorer badge is a scored clue
   * in Easy and Normal, while the send-off badge is decoration in every mode
   * (O5). This function cannot tell them apart beyond their name, and must
   * not be used to decide either.
   */
  export function badgesForShirt(input: { goals: number; redCards: number }): ShirtBadge[] {
    const badges: ShirtBadge[] = [];

    if (input.goals > 0) badges.push('scorer');
    if (input.redCards > 0) badges.push('sent-off');

    return badges;
  }
  ```

- [ ] **Step 1.4: Run it and watch it pass.**

  ```bash
  cd frontend && npx vitest run src/lib/shirtBadges.test.ts
  ```

  Expected GREEN: `Test Files 1 passed (1)`, `Tests 7 passed (7)`.

- [ ] **Step 1.5: Refactor check.**

  Re-read the file. There is no duplicated logic, no default parameter and no
  early return — two pushes in a fixed order is the whole rule. Stop.

- [ ] **Step 1.6: Type-check and lint.**

  ```bash
  cd frontend && npx tsc --noEmit && npm run lint
  ```

- [ ] **Step 1.7: Commit.**

  ```bash
  git add frontend/src/lib/shirtBadges.ts frontend/src/lib/shirtBadges.test.ts
  git commit -m "feat(frontend): add pure shirt badge decision helper"
  ```

**Verify:** `cd frontend && npx vitest run --coverage src/lib/shirtBadges.test.ts` shows 100% on lines and branches.

---

### Task 2: Render the badges on the shirt

**Files:**
- Create: `frontend/src/components/Shirt.badges.test.tsx`
- Modify: `frontend/components/Shirt.tsx` — imports (`:8`), `shirtAriaLabel` (`:33-51`), new `BADGE_LABELS` / `BadgeIcon`, badge render (after `:236`)

**Interfaces:**
- Consumes: `badgesForShirt(input: { goals: number; redCards: number }): ShirtBadge[]` and `ShirtBadge` from `@/lib/shirtBadges` (Task 1); `shirt.goals` / `shirt.redCards` from `ShirtData` (`frontend/types/index.ts`, v1.0.2).
- Produces: `Shirt`'s existing props, unchanged. Each badge element carries `data-badge="scorer"` or `data-badge="sent-off"`. `ShirtProps` does **not** grow — the data already arrives on `shirt`.

**Files deliberately NOT touched, and why:**

| File | Why no change |
|---|---|
| `frontend/components/TacticBoard.tsx` | It passes `shirt={shirt}` straight through (`:42`). `ShirtData extends LineupPlayer`, so the two new fields are already on the object. |
| `frontend/app/missing-eleven/page.tsx` | Builds `ShirtData` with `{ ...entry, state, guessHistory, name }` (`:250-255`). The spread carries `goals` / `redCards` / `isCaptain` through with no edit. |
| `frontend/src/lib/gameState.ts` | `createShirts` spreads `...entry` (`:88-96`) and `ShirtGameData extends ShirtData extends LineupPlayer`, so the fields are typed and preserved. |
| `frontend/vitest.config.ts` | R7 — widening the include is v1.1.1's job. |

**Steps:**

- [ ] **Step 2.1: Write the component test first.**

  Create `frontend/src/components/Shirt.badges.test.tsx`:

  ```tsx
  // @vitest-environment jsdom

  /**
   * Shirt badge rendering (v1.0.3).
   *
   * This file lives under `src/` on purpose: `frontend/vitest.config.ts:16`
   * collects `src/**/*.test.{ts,tsx}` only, so a test beside
   * `frontend/components/Shirt.tsx` would never execute — the same silent
   * gap that has kept `frontend/components/Shirt.colors.test.tsx` unrun to
   * this day (R7). Widening that include is v1.1.1's job.
   */
  import { describe, it, expect } from 'vitest';
  import { render } from '@testing-library/react';
  import Shirt from '../../components/Shirt';
  import type { ShirtData } from '@/types';

  function makeShirt(overrides: Partial<ShirtData> = {}): ShirtData {
    return {
      token: 'shirt-1',
      nameLength: 5,
      wordBoundaries: [],
      shirtNumber: 10,
      position: 'ST',
      coords: { x: 50, y: 50 },
      state: 'default',
      goals: 0,
      assists: 0,
      redCards: 0,
      isCaptain: false,
      ...overrides,
    };
  }

  function renderShirt(overrides: Partial<ShirtData> = {}) {
    const { container } = render(<Shirt shirt={makeShirt(overrides)} index={0} />);
    const button = container.querySelector('button');
    if (!button) throw new Error('Shirt did not render a button');
    return { container, button };
  }

  function badgeOrder(container: HTMLElement): (string | null)[] {
    return [...container.querySelectorAll('[data-badge]')].map((el) => el.getAttribute('data-badge'));
  }

  describe('Shirt badges', () => {
    it('renders no badge and no badge wording when the game has no event data', () => {
      const { container, button } = renderShirt({ goals: 0, redCards: 0 });
      expect(container.querySelectorAll('[data-badge]')).toHaveLength(0);
      expect(button.getAttribute('aria-label')).toBe('Shirt 10, tap to guess the player');
    });

    it('renders one scorer badge per goal and names the total', () => {
      const { container, button } = renderShirt({ goals: 2, redCards: 0 });
      expect(badgeOrder(container)).toEqual(['scorer', 'scorer']);
      expect(button.getAttribute('aria-label')).toBe(
        'Shirt 10, tap to guess the player, scored 2 goals in this match',
      );
    });

    it('renders a send-off badge for a dismissal and names it', () => {
      const { container, button } = renderShirt({ goals: 0, redCards: 1 });
      expect(badgeOrder(container)).toEqual(['sent-off']);
      expect(button.getAttribute('aria-label')).toBe(
        'Shirt 10, tap to guess the player, sent off in this match',
      );
    });

    it('renders both badges, scorer first, and names both', () => {
      const { container, button } = renderShirt({ goals: 1, redCards: 1 });
      expect(badgeOrder(container)).toEqual(['scorer', 'sent-off']);
      expect(button.getAttribute('aria-label')).toBe(
        'Shirt 10, tap to guess the player, scored in this match, sent off in this match',
      );
    });

    it('renders one scorer badge per goal in a hat-trick', () => {
      const { container } = renderShirt({ goals: 3, redCards: 0 });
      expect(container.querySelectorAll('[data-badge="scorer"]')).toHaveLength(3);
    });

    it('keeps the badges on an in-progress shirt and names them', () => {
      const { container, button } = renderShirt({ state: 'in-progress', goals: 1, redCards: 0 });
      expect(badgeOrder(container)).toEqual(['scorer']);
      expect(button.getAttribute('aria-label')).toBe(
        'Shirt 10, guessing in progress, scored in this match',
      );
    });

    it('keeps the badges on a correct shirt and names them', () => {
      const { container, button } = renderShirt({
        state: 'correct',
        name: 'Neuer',
        goals: 0,
        redCards: 1,
      });
      expect(badgeOrder(container)).toEqual(['sent-off']);
      expect(button.getAttribute('aria-label')).toBe(
        'Shirt 10, guessed correctly: Neuer, sent off in this match',
      );
    });

    it('keeps the badges on a failed shirt and names them', () => {
      const { container, button } = renderShirt({ state: 'failed', goals: 1, redCards: 0 });
      expect(badgeOrder(container)).toEqual(['scorer']);
      expect(button.getAttribute('aria-label')).toBe(
        'Shirt 10, not guessed, scored in this match',
      );
    });

    it('keeps the existing null-shirt-number accessible name', () => {
      const { button } = renderShirt({ shirtNumber: null, goals: 1, redCards: 0 });
      expect(button.getAttribute('aria-label')).toBe(
        'Shirt ?, tap to guess the player, scored in this match',
      );
    });
  });
  ```

- [ ] **Step 2.2: Run it and watch it fail.**

  ```bash
  cd frontend && npx vitest run src/components/Shirt.badges.test.tsx
  ```

  Expected RED:

  ```
  FAIL  src/components/Shirt.badges.test.tsx
    × renders no badge and no badge wording when the game has no event data
      expected null to have length 0
  ```

  On a shirt with `goals: 0, redCards: 0` the only failures are the
  `data-badge` queries — `querySelectorAll` returns an empty `NodeList`, whose
  `length` is `0`, so that specific assertion passes while the four
  `badgeOrder` cases and the wording assertions fail. That is the expected red:
  the accessible-name assertions fail on the added wording.

- [ ] **Step 2.3: Add the imports.**

  Edit `frontend/components/Shirt.tsx`, adding after line 8
  (`import { getTextColor } …`):

  ```tsx
  import { badgesForShirt, type ShirtBadge } from '@/lib/shirtBadges';
  ```

- [ ] **Step 2.4: Extend `shirtAriaLabel`.**

  Edit `frontend/components/Shirt.tsx` lines 32-51 to:

  ```tsx
  /**
   * Accessible wording for the badges actually rendered on this shirt.
   *
   * The icons themselves are aria-hidden, so this is the only channel that
   * carries the information to a screen reader. A visible signal that is not
   * in the accessible name is invisible to part of the audience.
   */
  const BADGE_LABELS: Record<ShirtBadge, string> = {
    scorer: 'scored in this match',
    'sent-off': 'sent off in this match',
  };

  /** State-aware accessible name for the shirt button. */
  function shirtAriaLabel(
    state: ShirtState,
    shirtNumber: number | null,
    badges: ShirtBadge[],
    name?: string,
  ): string {
    const number = shirtNumber ?? '?';
    const badgesSuffix =
      badges.length > 0 ? `, ${badges.map((badge) => BADGE_LABELS[badge]).join(', ')}` : '';
    switch (state) {
      case 'default':
        return `Shirt ${number}, tap to guess the player${badgesSuffix}`;
      case 'in-progress':
        return `Shirt ${number}, guessing in progress${badgesSuffix}`;
      case 'correct':
        return name
          ? `Shirt ${number}, guessed correctly: ${name}${badgesSuffix}`
          : `Shirt ${number}, guessed correctly${badgesSuffix}`;
      case 'failed':
        return `Shirt ${number}, not guessed${badgesSuffix}`;
    }
  }
  ```

  Note the signature change: `badges` is the third parameter and `name` moves
  to fourth. `badges` is **required**, not defaulted, so there is no
  uncovered default branch. There is exactly one caller.

- [ ] **Step 2.5: Add the badge glyph.**

  Edit `frontend/components/Shirt.tsx`, inserting after the `StateBadge` function (which ends at line 129):

  ```tsx
  /**
   * Decorative badge glyph. aria-hidden because the badge is already named in
   * the shirt's aria-label via BADGE_LABELS — announcing it twice is noise.
   */
  function BadgeIcon({ badge }: { badge: ShirtBadge }) {
    if (badge === 'scorer') {
      return (
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
          <circle cx="6" cy="6" r="5" fill="currentColor" />
          <path d="M6 3.2 8.1 4.8 7.4 7.3 4.6 7.3 3.9 4.8Z" fill="currentColor" opacity="0.3" />
        </svg>
      );
    }

    return (
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
        <rect x="2" y="1" width="8" height="10" rx="1.5" fill="currentColor" />
      </svg>
    );
  }
  ```

- [ ] **Step 2.6: Compute the badges in the component body.**

  Edit `frontend/components/Shirt.tsx`. Replace line 137:

  ```tsx
  const { token, nameLength, shirtNumber, coords, state } = shirt;
  ```

  with:

  ```tsx
  const { token, nameLength, shirtNumber, coords, state } = shirt;

  // §3.1: no event data on this game means [] for every shirt. There is no
  // per-shirt availability signal and this must not invent one.
  const badges = badgesForShirt({ goals: shirt.goals, redCards: shirt.redCards });
  ```

- [ ] **Step 2.7: Update the one `shirtAriaLabel` call site.**

  Edit `frontend/components/Shirt.tsx` line 207:

  ```tsx
          aria-label={shirtAriaLabel(state, shirtNumber, badges, shirt.name)}
  ```

- [ ] **Step 2.8: Render one aligned badge row.**

  In `frontend/components/Shirt.tsx`, the row groups all `badges` inside
  `data-event-badge-group` and renders the optional `StateBadge` after it. The
  row uses `justify-between`, starts at the shirt's left edge and has a width
  equal to the larger of the shirt width and the content width. This keeps the
  event group at the left and the state mark at the right, including when five
  goal badges are shown. The row and its contents are `aria-hidden` decorative
  overlays inside the button, so they do not intercept clicks.

  The button uses a pointer cursor but has no hover translation or hover shadow;
  the shirt and badge row stay stationary while hovered.

- [ ] **Step 2.9: Run the badge tests and watch them pass.**

  ```bash
  cd frontend && npx vitest run src/components/Shirt.badges.test.tsx
  ```

  Expected GREEN: `Test Files 1 passed (1)`, `Tests 11 passed (11)`.

- [ ] **Step 2.10: Run the whole frontend suite.**

  ```bash
  cd frontend && npm run test
  ```

  Expected: `Test Files 11 passed (11)` (9 existing + `shirtBadges` +
  `Shirt.badges`), all tests passing, zero failures. If a file under
  `frontend/components/` appears, the include was widened — revert that
  immediately, it is v1.1.1's change.

- [ ] **Step 2.11: Type-check and lint.**

  ```bash
  cd frontend && npx tsc --noEmit && npm run lint
  ```

  Expected: exit 0, no output.

- [ ] **Step 2.12: Look at it.**

  ```bash
  cd frontend && NEXT_PUBLIC_USE_MOCK_API=true npm run dev
  ```

  Open `http://localhost:3000/missing-eleven`. With `mockEvents` from v1.0.2
  (`playerId % 4` for goals, `% 11` for red cards) roughly a quarter of the
  shirts carry scorer badges (one per goal) and about one in eleven a red card.
  Then set `NEXT_PUBLIC_USE_MOCK_API=false` against a database that has not been
  re-seeded: **no badge appears on any shirt**, and nothing errors. That second
  state is §3.1 working, not a bug — confirm it explicitly before committing.

- [ ] **Step 2.13: Confirm the vitest config was not touched.**

  ```bash
  git diff HEAD~1 -- frontend/vitest.config.ts
  ```

  Expected: empty output.

- [ ] **Step 2.14: Commit.**

  ```bash
  git add frontend/components/Shirt.tsx frontend/src/components/Shirt.badges.test.tsx
  git commit -m "feat(frontend): render scorer and send-off badges on shirts"
  ```

**Verify:** `grep -n "badgesForShirt\|data-badge\|BADGE_LABELS" frontend/components/Shirt.tsx` shows the helper call, the render block and the label map.

---

### Task 3: Validation, CHANGELOG, release

**Files:**
- Modify: `CHANGELOG.md` (prepend one section)

**Interfaces:**
- Consumes: everything above.
- Produces: the `## v1.0.3` CHANGELOG section `scripts/src/release.ts:8` requires.

**Steps:**

- [ ] **Step 3.1: Full frontend gate.**

  ```bash
  cd frontend && npm run test:coverage && npm run lint && npx tsc --noEmit
  ```

  Expected: 11 test files pass, lint clean, `tsc` exit 0.

- [ ] **Step 3.2: Backend is untouched.**

  ```bash
  cd backend && npm run test:coverage
  git diff HEAD~2 --stat -- backend/
  ```

  Expected: the backend suite passes unchanged and `git diff` prints nothing.

- [ ] **Step 3.3: Confirm the decoration-only rule has not leaked.**

  ```bash
  grep -rn "redCards\|badgesForShirt" frontend/src/lib/scoring.ts frontend/src/lib/gameState.ts
  ```

  Expected: no output. Scoring and game state must not reference the send-off
  badge. If either file matches, the red card has become a scored clue and this
  patch has broken §3.1 / O5.

- [ ] **Step 3.4: Confirm no availability flag was introduced.**

  ```bash
  grep -rn "hasEvents\|goalsKnown\|eventsKnown\|dataAvailable" frontend/ backend/src/ --include=*.ts --include=*.tsx
  ```

  Expected: no output.

- [ ] **Step 3.5: Write the CHANGELOG section.**

  Prepend to `CHANGELOG.md`, directly under the `---` on line 8 and above
  `## v1.0.2`:

  ```markdown
  ## v1.0.3 — Scorer and send-off shirt badges

  _2026-09-29_

  ### Added

  - **`frontend/src/lib/shirtBadges.ts`** — pure `badgesForShirt({ goals,
    redCards })` returning one scorer badge per goal, followed by a send-off
    badge when applicable. Kept React-free so v1.2's difficulty modes can read
    the same decision without importing the component.
  - **Scorer and send-off badges on the tactic-board shirts**, with the badge
    wording carried into the shirt's accessible name.

  ### Notes

  - **Graceful degradation is per game, not per shirt.** A game seeded before
    v1.0.1 reports `0` for all 22 shirts and shows no badges anywhere. There is
    no availability flag and none will be added: `0` is indistinguishable from
    "did not score", so the UI cannot ask whether the data is present.
  - **The scorer badge is a scored clue in Easy and Normal (v1.2.2). The
    send-off badge is decoration in every mode and never affects scoring or
    the multiplier.** Scoring code does not reference either.
  - The dismissal data behind the send-off badge is the known-risky part of
    v1.0 (R2). A wrong-looking icon is tolerable; a wrong-looking *scoring
    clue* is not, which is why only the scorer badge is ever scored.
  - **Test placement:** the component test lives at
    `frontend/src/components/Shirt.badges.test.tsx` because
    `frontend/vitest.config.ts` collects `src/**` only. Widening that include
    is v1.1.1's job (R7), deliberately not this one.
  - No change to `TacticBoard`, `page.tsx` or `gameState` — `ShirtData extends
    LineupPlayer`, so the two fields arrive on the existing prop.
  ```

- [ ] **Step 3.6: Verify the changelog is parseable.**

  ```bash
  npm run release -- --notes v1.0.3
  ```

  Expected: `_2026-09-29_`.

- [ ] **Step 3.7: Commit.**

  ```bash
  git add CHANGELOG.md
  git commit -m "release: v1.0.3 — scorer and send-off shirt badges"
  ```

**Verify:** `git log --oneline -3` shows three conventional-commit lines for this patch.

---

## Rollback

Revert the patch to **v1.0.2**. Both files are new and the `Shirt.tsx` change is
confined to the import, `shirtAriaLabel`, one new sub-component and one render
block. Reverting the commit alone restores the previous shirt with no data
repair, no API change and no migration. The four `LineupPlayer` fields stay on
the wire, unused.

If v1.0.2 is also being reverted, revert v1.0.2 **before** v1.0.3 — the reverse
order leaves `Shirt.tsx` reading fields the API no longer sends.

## Acceptance criteria

1. `badgesForShirt({ goals: 0, redCards: 0 })` returns `[]`.
2. `badgesForShirt({ goals: 2, redCards: 0 })` returns `['scorer', 'scorer']`; three goals return three badges.
3. `badgesForShirt({ goals: 0, redCards: 1 })` returns `['sent-off']`.
4. `badgesForShirt({ goals: 1, redCards: 1 })` returns `['scorer', 'sent-off']` in that order.
5. A shirt with no event data renders zero `[data-badge]` elements and an `aria-label` with no badge clause.
6. A shirt renders exactly one `data-badge="scorer"` element per goal.
7. A shirt with a dismissal renders exactly one `data-badge="sent-off"` element.
8. Badges render on `default`, `in-progress`, `correct` and `failed` shirts alike.
9. Every badge is named in the shirt's `aria-label`; the glyphs themselves are `aria-hidden`.
10. A shirt with `shirtNumber: null` still uses `Shirt ?, …` — the mask convention is untouched, and no `'?'` is ever written into `shirtNumber`.
11. `frontend/src/components/Shirt.badges.test.tsx` runs, and `frontend/vitest.config.ts` is unmodified.
12. `frontend/src/lib/scoring.ts` and `frontend/src/lib/gameState.ts` contain no reference to `redCards` or `badgesForShirt`.
13. The badge component suite covers multiple goals, the aligned state mark and accessible goal count; the TypeScript check passes. Full frontend suite and lint remain tracked in the validation plan below.
14. `cd backend && npm run test:coverage` passes unchanged, and `git diff` shows no backend change.
15. `npm run release -- --notes v1.0.3` prints the section body.

## Validation plan

| What | Command | Expected |
|---|---|---|
| Badge helper | `cd frontend && npx vitest run src/lib/shirtBadges.test.ts` | `Tests 7 passed (7)` |
| Shirt component | `cd frontend && npx vitest run src/components/Shirt.badges.test.tsx` | `Tests 11 passed (11)` |
| Frontend gate | `cd frontend && npm run test` | `Test Files 11 passed (11)` |
| Type-check | `cd frontend && npx tsc --noEmit` | exit 0 |
| Lint | `cd frontend && npm run lint` | exit 0 |
| Include untouched | `git diff HEAD~1 -- frontend/vitest.config.ts` | empty |
| Decoration-only | `grep -rn "redCards\|badgesForShirt" frontend/src/lib/scoring.ts frontend/src/lib/gameState.ts` | no output |
| No availability flag | `grep -rn "hasEvents\|goalsKnown\|eventsKnown" frontend/ backend/src/ --include=*.ts --include=*.tsx` | no output |
| Degraded rendering | `npm run dev -w frontend`, no re-seed | no badge on any shirt, no error |
| Real rendering | `NEXT_PUBLIC_USE_MOCK_API=true npm run dev -w frontend` | badges on some shirts |
| Backend unaffected | `cd backend && npm run test:coverage` | passes unchanged |
| Release note | `npm run release -- --notes v1.0.3` | section body |

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A nullable or optional event field arrives | Badges silently vanish, or the type claims a value that is not there | Both fields are required `number`s; Task 2 Step 2.6 passes them through untouched and adds no `?? 0` |
| Someone adds an availability flag | The honest answer "no, the data may be missing" gets smuggled in — §3.1 forbids it | Task 3 Step 3.4 greps for it; Global Constraints state the rule; the CHANGELOG records it |
| The send-off badge becomes a scored clue | An unmeasured, R2-exposed number starts moving scores | Task 3 Step 3.3 greps scoring and game state; Global Constraints state decoration-only in every mode |
| Event badges collide with the correct/failed `StateBadge` | The state mark can cover the end of a multi-goal row | Keep events grouped at the left and the state mark at the right of a row that grows to fit its contents; cover the five-goal case in the component suite |
| The component test is never collected | The patch reports green while shipping nothing | The test lives under `src/`, Step 2.10 asserts exactly 11 collected files, and Step 2.13 diffs the vitest config |
| Widening the vitest include from here | `Shirt.colors.test.tsx` surfaces a pre-existing failure and drags v1.0.3 into v1.1.1's budget (R7) | Explicitly forbidden in Global Constraints and Step 2.10 |
| A visually wrong send-off icon ships | The known R2 consequence | Decoration-only in every mode, and absent rather than wrong on unseeded games (§3.1) |

## Handoff to v1.2

v1.0.3 hands three things to v1.2:

1. **`badgesForShirt(input): ShirtBadge[]`** — the clue-availability question,
   answerable without touching a component. Easy and Normal read it to decide
   whether the scorers clue is present; Hard and Expert do not read it at all.
2. **`ShirtBadge = 'scorer' | 'sent-off'`** — the discriminated pair a mode
   keys on. Only `'scorer'` is ever a clue.
3. **The rule that absence is silent and uniform per game** — v1.2 modes must
   render and score correctly with the scorers clue absent, because v1.0.x is
   **not** a gate on v1.2 (§11 Rule 7).
