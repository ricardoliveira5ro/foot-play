import { describe, it, expect } from 'vitest';
import { scorePlayer, computeTotalScore } from './scoring';
import type { ShirtGameData } from './gameState';

/** Minimal valid `ShirtGameData` with sensible defaults, overridable per case. */
function makeShirt(overrides: Partial<ShirtGameData>): ShirtGameData {
  return {
    token: 't1',
    nameLength: 6,
    wordBoundaries: [],
    shirtNumber: 7,
    position: 'CM',
    coords: { x: 50, y: 50 },
    goals: 0,
    assists: 0,
    redCards: 0,
    isCaptain: false,
    hasFirstLetter: true,
    state: 'correct',
    attempts: 1,
    guessHistory: [],
    correctLetters: [],
    ...overrides,
  };
}

describe('scorePlayer — correct guesses', () => {
  it('awards 1000 for a first-try correct guess', () => {
    expect(scorePlayer(1, true, 0, 0)).toBe(1000);
  });

  it('awards 800 for a second-try correct guess', () => {
    expect(scorePlayer(2, true, 0, 0)).toBe(800);
  });

  it('awards 600 for a third-try correct guess', () => {
    expect(scorePlayer(3, true, 0, 0)).toBe(600);
  });

  it('awards 400 for a fourth-try correct guess', () => {
    expect(scorePlayer(4, true, 0, 0)).toBe(400);
  });

  it('awards 200 for a fifth-try correct guess', () => {
    expect(scorePlayer(5, true, 0, 0)).toBe(200);
  });

  it('awards 100 for a sixth-try correct guess', () => {
    expect(scorePlayer(6, true, 0, 0)).toBe(100);
  });

  it('floors at 100 for attempts beyond six', () => {
    expect(scorePlayer(7, true, 0, 0)).toBe(100);
    expect(scorePlayer(10, true, 0, 0)).toBe(100);
  });
});

describe('scorePlayer — failed guesses (partial credit)', () => {
  it('awards 0 when no letters were found', () => {
    expect(scorePlayer(6, false, 0, 6)).toBe(0);
  });

  it('awards 75 for 3 of 6 letters (3/6 × 150)', () => {
    expect(scorePlayer(6, false, 3, 6)).toBe(75);
  });

  it('awards 150 when all letters were found', () => {
    expect(scorePlayer(6, false, 6, 6)).toBe(150);
  });

  it('returns 0 when the name has no letters (division by zero guard)', () => {
    expect(scorePlayer(6, false, 0, 0)).toBe(0);
  });

  it('awards 150 for a 1-letter name with the letter found', () => {
    expect(scorePlayer(6, false, 1, 1)).toBe(150);
  });

  it('awards 0 for a 1-letter name without the letter', () => {
    expect(scorePlayer(6, false, 0, 1)).toBe(0);
  });

  it('rounds to the nearest whole number', () => {
    // 1/3 × 150 = 50 exactly; 2/3 × 150 = 100 exactly; 1/4 × 150 = 37.5 → 38
    expect(scorePlayer(6, false, 1, 4)).toBe(38);
  });
});

describe('computeTotalScore', () => {
  it('scores 22,000 for all 22 correct on the first try (22 × 1000)', () => {
    const target = Array.from({ length: 11 }, (_, i) =>
      makeShirt({ token: `t${i}`, state: 'correct', attempts: 1, correctLetters: [] })
    );
    const opponent = Array.from({ length: 11 }, (_, i) =>
      makeShirt({ token: `o${i}`, state: 'correct', attempts: 1, correctLetters: [] })
    );

    const breakdown = computeTotalScore(target, opponent, 'Home', 'Away');
    expect(breakdown.grandTotal).toBe(22000);
    expect(breakdown.perPlayer).toHaveLength(22);
  });

  it('scores 1,675 for a mixed set (sum of per-player points only)', () => {
    // One correct on first try (1000), one correct on third try (600),
    // one failed with 2 of 4 letters (2/4 × 150 = 75). No bonuses.
    const target = [
      makeShirt({ token: 'a', state: 'correct', attempts: 1 }),
      makeShirt({ token: 'b', state: 'correct', attempts: 3 }),
      makeShirt({ token: 'c', state: 'failed', attempts: 6, correctLetters: ['A', 'B'], nameLength: 4 }),
    ];
    const opponent: ShirtGameData[] = [];

    const breakdown = computeTotalScore(target, opponent, 'Home', 'Away');
    expect(breakdown.grandTotal).toBe(1675);
  });

  it('scores 1,000 for a correct shirt plus an in-progress shirt with no letters found', () => {
    const target = [
      makeShirt({ token: 'a', state: 'correct', attempts: 1 }),
      makeShirt({ token: 'b', state: 'in-progress', attempts: 2 }),
    ];
    const opponent: ShirtGameData[] = [];

    const breakdown = computeTotalScore(target, opponent, 'Home', 'Away');
    expect(breakdown.grandTotal).toBe(1000);
  });

  it('returns zero totals for empty input', () => {
    const breakdown = computeTotalScore([], [], 'Home', 'Away');
    expect(breakdown.grandTotal).toBe(0);
    expect(breakdown.perPlayer).toHaveLength(0);
  });

  it('awards letter-based partial credit for in-progress shirts', () => {
    // One correct shirt (1000) + one in-progress shirt: not correct or failed,
    // so it gets letter-based partial credit (scorePlayer with correct=false).
    const target = [
      makeShirt({ token: 'a', state: 'correct', attempts: 1 }),
      makeShirt({
        token: 'b',
        state: 'in-progress',
        attempts: 2,
        correctLetters: ['M', 'E'],
        nameLength: 4,
      }),
    ];
    const opponent: ShirtGameData[] = [];

    const breakdown = computeTotalScore(target, opponent, 'Home', 'Away');
    // Correct shirt: 1000. In-progress shirt: 2/4 × 150 = 75.
    expect(breakdown.grandTotal).toBe(1075);
    expect(breakdown.perPlayer).toHaveLength(2);
    const inProgressPlayer = breakdown.perPlayer.find(p => p.token === 'b');
    expect(inProgressPlayer).toBeDefined();
    expect(inProgressPlayer!.correct).toBe(false);
    expect(inProgressPlayer!.letterPoints).toBe(75);
    expect(inProgressPlayer!.totalPoints).toBe(75);
  });

  it('scores 0 for a surrender (all 22 shirts failed)', () => {
    // Surrender scenario: 22 shirts all failed with no letters found → 0 points each.
    const target = Array.from({ length: 11 }, (_, i) =>
      makeShirt({ token: `t${i}`, state: 'failed', attempts: 6, correctLetters: [] })
    );
    const opponent = Array.from({ length: 11 }, (_, i) =>
      makeShirt({ token: `o${i}`, state: 'failed', attempts: 6, correctLetters: [] })
    );

    const breakdown = computeTotalScore(target, opponent, 'Home', 'Away');
    expect(breakdown.grandTotal).toBe(0);
    expect(breakdown.perPlayer).toHaveLength(22);
  });
});

describe('multiplier scaling', () => {
  describe('scorePlayer', () => {
    it('leaves every score unchanged at ×1', () => {
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
      // 1/8 × 150 = 18.75. Rounding the base first would give 19, and 19 × 0.5
      // = 9.5 -> 10. Rounding the scaled value gives 9.
      expect(scorePlayer(6, false, 1, 8, 1)).toBe(19);
      expect(scorePlayer(6, false, 1, 8, 2)).toBe(38);
      expect(scorePlayer(6, false, 1, 8, 0.5)).toBe(9);
      expect(scorePlayer(6, false, 1, 8, 0.5)).not.toBe(10);
    });

    it('does not double-count a repeated letter', () => {
      // "Müller" has two l's. The numerator is the unique count, and the
      // multiplier does not change that. These are two DISTINCT numbers:
      // 1/6 × 150 × 2 = 50 and 2/6 × 150 × 2 = 100. Do NOT assert them equal
      // to each other — that would assert the bug.
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
    it('sums the scaled line items, so the breakdown adds up to the total', () => {
      const target = [
        makeShirt({ token: 'a', state: 'correct', attempts: 1 }),
        makeShirt({
          token: 'b',
          state: 'failed',
          attempts: 6,
          correctLetters: ['A', 'B'],
          nameLength: 6,
        }),
      ];
      const opponent = [
        makeShirt({
          token: 'o1',
          state: 'failed',
          attempts: 6,
          correctLetters: ['A'],
          nameLength: 6,
        }),
      ];

      for (const m of [1, 0.5, 2, 3]) {
        const breakdown = computeTotalScore(target, opponent, 'Home', 'Away', m);
        const summed = breakdown.perPlayer.reduce((sum, p) => sum + p.totalPoints, 0);
        expect(breakdown.grandTotal).toBe(summed);
        expect(breakdown.perPlayer).toHaveLength(3);
        for (const p of breakdown.perPlayer) {
          expect(p.multiplier).toBe(m);
        }
      }
    });

    it('scales the grand total as a whole', () => {
      const target = Array.from({ length: 11 }, (_, i) =>
        makeShirt({ token: `t${i}`, state: 'correct', attempts: 1 })
      );
      const opponent: ShirtGameData[] = [];

      expect(computeTotalScore(target, opponent, 'Home', 'Away', 1).grandTotal).toBe(11000);
      expect(computeTotalScore(target, opponent, 'Home', 'Away', 2).grandTotal).toBe(22000);
      expect(computeTotalScore(target, opponent, 'Home', 'Away', 0.5).grandTotal).toBe(5500);
      expect(computeTotalScore(target, opponent, 'Home', 'Away', 3).grandTotal).toBe(33000);
    });

    it('leaves letterPoints and totalPoints consistent for a failed shirt', () => {
      const target = [
        makeShirt({
          token: 'a',
          state: 'failed',
          attempts: 6,
          correctLetters: ['A', 'B'],
          nameLength: 6,
        }),
      ];

      const breakdown = computeTotalScore(target, [], 'Home', 'Away', 2);
      const line = breakdown.perPlayer[0];
      expect(line.letterPoints).toBe(100);
      expect(line.totalPoints).toBe(line.letterPoints);
    });

    it('keeps a correct shirt at zero letter points', () => {
      const target = [makeShirt({ token: 'a', state: 'correct', attempts: 2 })];

      const breakdown = computeTotalScore(target, [], 'Home', 'Away', 3);
      const line = breakdown.perPlayer[0];
      expect(line.letterPoints).toBe(0);
      expect(line.totalPoints).toBe(2400);
    });

    it('defaults to no scaling when the multiplier is omitted', () => {
      const target = [makeShirt({ token: 'a', state: 'correct', attempts: 1 })];

      expect(computeTotalScore(target, [], 'Home', 'Away').grandTotal).toBe(
        computeTotalScore(target, [], 'Home', 'Away', 1).grandTotal,
      );
    });
  });
});
