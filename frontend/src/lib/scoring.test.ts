import { describe, it, expect } from 'vitest';
import { scorePlayer, computeBonuses, computeTotalScore } from './scoring';
import type { ShirtGameData } from './gameState';

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

describe('computeBonuses', () => {
  it('awards Full House only when all shirts resolved with some failed', () => {
    const bonuses = computeBonuses(22, 18, 4, 0);
    expect(bonuses).toHaveLength(1);
    expect(bonuses[0].name).toBe('Full House');
    expect(bonuses[0].points).toBe(500);
  });

  it('awards Clean Sweep + Full House + One-Try Wonders for a perfect game', () => {
    const bonuses = computeBonuses(22, 22, 0, 12);
    expect(bonuses).toHaveLength(3);
    const names = bonuses.map(b => b.name);
    expect(names).toContain('Full House');
    expect(names).toContain('Clean Sweep');
    expect(names).toContain('One-Try Wonders');
    expect(bonuses.reduce((sum, b) => sum + b.points, 0)).toBe(3500);
  });

  it('awards One-Try Wonders + Full House when 10 first-tries and 12 failed', () => {
    const bonuses = computeBonuses(22, 10, 12, 10);
    expect(bonuses).toHaveLength(2);
    const names = bonuses.map(b => b.name);
    expect(names).toContain('One-Try Wonders');
    expect(names).toContain('Full House');
  });

  it('awards no bonuses when not all shirts are resolved', () => {
    const bonuses = computeBonuses(22, 10, 0, 5);
    expect(bonuses).toHaveLength(0);
  });

  it('awards Full House only when 18 correct and 4 failed', () => {
    const bonuses = computeBonuses(22, 18, 4, 3);
    expect(bonuses).toHaveLength(1);
    expect(bonuses[0].name).toBe('Full House');
  });

  it('awards no bonuses for empty input', () => {
    const bonuses = computeBonuses(0, 0, 0, 0);
    expect(bonuses).toHaveLength(0);
  });

  it('awards Full House on surrender (all shirts failed, none correct)', () => {
    // Surrender scenario: 22 shirts all failed, 0 correct, 0 first-try
    const bonuses = computeBonuses(22, 0, 22, 0);
    expect(bonuses).toHaveLength(1);
    expect(bonuses[0].name).toBe('Full House');
    expect(bonuses[0].points).toBe(500);
  });
});

describe('computeTotalScore', () => {
  function makeShirt(overrides: Partial<ShirtGameData>): ShirtGameData {
    return {
      token: 't1',
      nameLength: 6,
      wordBoundaries: [],
      shirtNumber: 7,
      position: 'CM',
      coords: { x: 50, y: 50 },
      state: 'correct',
      attempts: 1,
      guessHistory: [],
      correctLetters: [],
      ...overrides,
    };
  }

  it('scores 25,500 for all 22 correct on the first try (22 × 1000 + 3500 bonuses)', () => {
    const target = Array.from({ length: 11 }, (_, i) =>
      makeShirt({ token: `t${i}`, state: 'correct', attempts: 1, correctLetters: [] })
    );
    const opponent = Array.from({ length: 11 }, (_, i) =>
      makeShirt({ token: `o${i}`, state: 'correct', attempts: 1, correctLetters: [] })
    );

    const breakdown = computeTotalScore(target, opponent, 'Home', 'Away');
    expect(breakdown.grandTotal).toBe(25500);
    expect(breakdown.perPlayer).toHaveLength(22);
    expect(breakdown.bonuses).toHaveLength(3);
  });

  it('scores 2,175 for a mixed set with Full House bonus', () => {
    // One correct on first try (1000), one correct on third try (600),
    // one failed with 2 of 4 letters (2/4 × 150 = 75) + Full House (+500)
    const target = [
      makeShirt({ token: 'a', state: 'correct', attempts: 1 }),
      makeShirt({ token: 'b', state: 'correct', attempts: 3 }),
      makeShirt({ token: 'c', state: 'failed', attempts: 6, correctLetters: ['A', 'B'], nameLength: 4 }),
    ];
    const opponent: ShirtGameData[] = [];

    const breakdown = computeTotalScore(target, opponent, 'Home', 'Away');
    expect(breakdown.grandTotal).toBe(2175);
    expect(breakdown.bonuses).toHaveLength(1);
    expect(breakdown.bonuses[0].name).toBe('Full House');
  });

  it('awards no bonuses for partial completion', () => {
    const target = [
      makeShirt({ token: 'a', state: 'correct', attempts: 1 }),
      makeShirt({ token: 'b', state: 'in-progress', attempts: 2 }),
    ];
    const opponent: ShirtGameData[] = [];

    const breakdown = computeTotalScore(target, opponent, 'Home', 'Away');
    expect(breakdown.bonuses).toHaveLength(0);
    expect(breakdown.grandTotal).toBe(1000);
  });

  it('returns zero totals for empty input', () => {
    const breakdown = computeTotalScore([], [], 'Home', 'Away');
    expect(breakdown.grandTotal).toBe(0);
    expect(breakdown.perPlayer).toHaveLength(0);
    expect(breakdown.bonuses).toHaveLength(0);
  });

  it('awards letter-based partial credit for in-progress shirts with no bonuses', () => {
    // One correct shirt (1000) + one in-progress shirt: not correct or failed,
    // so it gets letter-based partial credit (scorePlayer with correct=false).
    // No bonuses because not all shirts are resolved.
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
    // Not all shirts resolved → no bonuses
    expect(breakdown.bonuses).toHaveLength(0);
  });
});
