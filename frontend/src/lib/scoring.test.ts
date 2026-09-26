import { describe, it, expect } from 'vitest';
import { scorePlayer, computeTotalScore } from './scoring';
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
