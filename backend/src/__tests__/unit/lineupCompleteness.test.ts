import { describe, expect, it } from 'vitest';
import { hasCompleteLineups, type GameWithRelations } from '../../services/matchService';

type Appearance = GameWithRelations['appearances'][number];
type CompletenessInput = Pick<GameWithRelations, 'appearances' | 'homeClubId' | 'awayClubId'>;

function appearancesFor(clubId: number, count: number, startPlayerId: number, type = 'starting_lineup'): Appearance[] {
  return Array.from({ length: count }, (_, index) => ({
    clubId,
    playerId: startPlayerId + index,
    type,
  }) as Appearance);
}

function completeGame(overrides: Partial<CompletenessInput> = {}): CompletenessInput {
  return {
    homeClubId: 1,
    awayClubId: 2,
    appearances: [
      ...appearancesFor(1, 11, 100),
      ...appearancesFor(2, 11, 200),
    ],
    ...overrides,
  };
}

describe('hasCompleteLineups', () => {
  it('returns true for 11 distinct starting-lineup appearances on each side', () => {
    expect(hasCompleteLineups(completeGame())).toBe(true);
  });

  it.each([0, 10, 12, 22])('returns false when the home side has %i starters', (homeCount) => {
    expect(hasCompleteLineups(completeGame({
      appearances: [
        ...appearancesFor(1, homeCount, 100),
        ...appearancesFor(2, 11, 200),
      ],
    }))).toBe(false);
  });

  it('returns false when the away side has 10 starters', () => {
    expect(hasCompleteLineups(completeGame({
      appearances: [
        ...appearancesFor(1, 11, 100),
        ...appearancesFor(2, 10, 200),
      ],
    }))).toBe(false);
  });

  it('does not count 22 appearances all assigned to one side as complete', () => {
    expect(hasCompleteLineups(completeGame({
      appearances: appearancesFor(1, 22, 100),
    }))).toBe(false);
  });

  it('does not treat 12 starters as exactly 11', () => {
    expect(hasCompleteLineups(completeGame({
      appearances: [
        ...appearancesFor(1, 11, 100),
        ...appearancesFor(1, 1, 300),
        ...appearancesFor(2, 11, 200),
      ],
    }))).toBe(false);
  });

  it('does not count a duplicate player twice for one side', () => {
    const appearances = [
      ...appearancesFor(1, 11, 100),
      ...appearancesFor(2, 11, 200),
    ];
    appearances[10] = { ...appearances[10], playerId: appearances[0].playerId };
    expect(hasCompleteLineups(completeGame({ appearances }))).toBe(false);
  });

  it('ignores appearances belonging to a third club', () => {
    expect(hasCompleteLineups(completeGame({
      appearances: [
        ...appearancesFor(1, 11, 100),
        ...appearancesFor(2, 11, 200),
        ...appearancesFor(3, 11, 300),
      ],
    }))).toBe(true);
  });

  it('returns false for no appearances', () => {
    expect(hasCompleteLineups(completeGame({ appearances: [] }))).toBe(false);
  });

  it('does not count substitutes toward a side', () => {
    expect(hasCompleteLineups(completeGame({
      appearances: [
        ...appearancesFor(1, 10, 100),
        ...appearancesFor(1, 1, 111, 'substitute'),
        ...appearancesFor(2, 11, 200),
      ],
    }))).toBe(false);
  });
});
