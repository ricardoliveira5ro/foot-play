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
    goals: 0,
    assists: 0,
    redCards: 0,
    isCaptain: false,
    hasFirstLetter: true,
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

/**
 * Build the input. `opponentAttempted` is caller-supplied here — the real
 * derivation lives in `GameComplete` (Step 5.3) and is asserted there — but a
 * fixture must not contradict the flag it sets. When you pass
 * `opponentAttempted: true`, pass `opponentShirts` that actually carry
 * `attempts > 0`; `attemptedHalf` below does that for you. Shirts with
 * `attempts: 0` alongside `opponentAttempted: true` would describe a state the
 * game cannot produce.
 */
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

/** A half the player really did guess against: every shirt has attempts. */
function attemptedHalf(prefix: string): ShirtGameData[] {
  return mixedHalf(prefix).map((shirt) => ({ ...shirt, attempts: 2 }));
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
    const grid = buildShareGrid(
      makeInput({ difficulty: 'hard', opponentAttempted: true, opponentShirts: attemptedHalf('o') })
    );
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

  it('yields 11 slots for a surrendered Expert game whose opponent was never touched', () => {
    // RD2, and the reason the grid reads `opponentAttempted` alone. The mode
    // requires the opponent; the player never played it, because they gave up.
    // Reading the requirement here would claim 22 slots for a half that was
    // never touched — which is why `opponentRequired` is not the condition.
    const grid = buildShareGrid(makeInput({ difficulty: 'expert', opponentAttempted: false }));
    expect(grid.slots).toHaveLength(11);
    expect(countTeam(grid, 'target')).toBe(11);
    expect(countTeam(grid, 'opponent')).toBe(0);
  });

  it('yields 22 slots for a Finish-locked Expert result', () => {
    // The same mode, the other outcome. A Finish-locked Expert result reached
    // 22/22, which is only possible when the opponent half was attempted —
    // the gate refused to pass otherwise. One flag, both cases, no mode read.
    const grid = buildShareGrid(
      makeInput({ difficulty: 'expert', opponentAttempted: true, opponentShirts: attemptedHalf('o') })
    );
    expect(grid.slots).toHaveLength(22);
    expect(countTeam(grid, 'opponent')).toBe(11);
  });

  it('scopes by attempt, identically in every mode', () => {
    // The property that replaces the old `opponentRequired` scope test: the
    // mode is not an input to scope. `difficulty` is varied and the flag is
    // fixed, and the answer does not move.
    for (const difficulty of Object.keys(DIFFICULTY_CONFIG) as Difficulty[]) {
      const untouched = mixedHalf('o').map((shirt) => ({ ...shirt, attempts: 0 }));
      const attempted = mixedHalf('o').map((shirt) => ({ ...shirt, attempts: 2 }));
      expect(
        buildShareGrid(makeInput({ difficulty, opponentAttempted: false, opponentShirts: untouched })).slots
      ).toHaveLength(11);
      expect(
        buildShareGrid(makeInput({ difficulty, opponentAttempted: true, opponentShirts: attempted })).slots
      ).toHaveLength(22);
    }
  });

  it('keeps the mode table honest: every required-opponent mode is attempt-reachable', () => {
    // Retained as a guard on `DIFFICULTY_CONFIG`, NOT as the grid's condition
    // (RD4). What it actually asserts, and why it is not vacuous:
    //
    //  1. The table still has at least one `opponentRequired` mode. Without
    //     this the loop below would iterate an empty list and pass silently,
    //     which is the failure mode a guard is supposed to prevent.
    //  2. For each such mode, the flag is **derived from shirts with
    //     `attempts > 0`** — the same derivation `GameComplete` performs — so
    //     this proves the mode is genuinely attempt-reachable rather than
    //     merely being asserted to be.
    //  3. Both directions are checked. `attempts > 0` yields 22 slots;
    //     `attempts === 0` on the same mode yields 11. So if a future change
    //     made scope fall back to reading `opponentRequired`, direction (b)
    //     fails — which is precisely the regression RD2 exists to prevent.
    const requiredModes = (Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).filter(
      (mode) => DIFFICULTY_CONFIG[mode].opponentRequired
    );
    expect(requiredModes.length).toBeGreaterThan(0);

    for (const mode of requiredModes) {
      const attempted = mixedHalf('o').map((shirt) => ({ ...shirt, attempts: 2 }));
      const untouched = attempted.map((shirt) => ({ ...shirt, attempts: 0 }));

      const inScope = buildShareGrid(
        makeInput({
          difficulty: mode,
          opponentShirts: attempted,
          opponentAttempted: attempted.some((shirt) => shirt.attempts > 0),
        })
      );
      expect(inScope.slots).toHaveLength(22);

      const outOfScope = buildShareGrid(
        makeInput({
          difficulty: mode,
          opponentShirts: untouched,
          opponentAttempted: untouched.some((shirt) => shirt.attempts > 0),
        })
      );
      expect(outOfScope.slots).toHaveLength(11);
    }
  });

  it('puts the target half before the opponent half, each in position order', () => {
    const grid = buildShareGrid(
      makeInput({ difficulty: 'hard', opponentAttempted: true, opponentShirts: attemptedHalf('o') })
    );
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
    buildShareGrid(
      makeInput({
        targetShirts,
        difficulty: 'hard',
        opponentAttempted: true,
        opponentShirts: attemptedHalf('o'),
      })
    );
    expect(targetShirts.map((shirt) => shirt.token)).toEqual(before);
  });
});

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

  it('renders one row for expert when the opponent was never attempted', () => {
    // RD2/§7 row 4, and the reason the grid reads `opponentAttempted` alone. The
    // mode requires the opponent half; the player never played it, because they
    // gave up. Reading the requirement here would render two rows and claim a
    // half that was never touched. One row, 11 slots, in every mode.
    const grid = buildShareGrid(
      makeInput({ difficulty: 'expert', opponentAttempted: false, score: 19800 })
    );
    expect(renderShareGrid(grid)).toBe(
      '🟩⬛⬛⬛🟩🟩⬛⬛⬛🟩🟩\nExpert ×3 · 19800'
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
