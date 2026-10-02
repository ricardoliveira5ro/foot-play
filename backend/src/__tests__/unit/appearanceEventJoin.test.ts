import { describe, it, expect } from 'vitest';
import {
  AppearanceEventIndex,
  type AppearanceKey,
  type FullAppearanceRow,
} from '../../lib/appearanceEventJoin';
import type { ParsedEventType } from '../../lib/eventMapping';

const key = (gameId: number, playerId: number): AppearanceKey => ({ gameId, playerId });

const event = (type: ParsedEventType, isAssist = false) => ({ type, isAssist });

describe('AppearanceEventIndex', () => {
  it('reports the number of distinct indexed appearances', () => {
    const index = new AppearanceEventIndex([key(1, 101), key(1, 101), key(1, 102)]);
    expect(index.size).toBe(2);
  });

  it('accumulates a goal', () => {
    const index = new AppearanceEventIndex([key(1, 101)]);
    expect(index.accumulate(key(1, 101), event('goal'))).toEqual({ goals: 1, assists: 0, redCards: 0 });
  });

  it('accumulates a penalty goal', () => {
    const index = new AppearanceEventIndex([key(1, 101)]);
    index.accumulate(key(1, 101), event('penalty'));
    expect(index.accumulate(key(1, 101), event('penalty'))).toEqual({ goals: 2, assists: 0, redCards: 0 });
  });

  it('does not count an own goal (O5 — recognized, deliberately deferred)', () => {
    const index = new AppearanceEventIndex([key(1, 101)]);
    expect(index.accumulate(key(1, 101), event('own_goal'))).toEqual({ goals: 0, assists: 0, redCards: 0 });
  });

  it('does not count a shootout goal (O3)', () => {
    const index = new AppearanceEventIndex([key(1, 101)]);
    expect(index.accumulate(key(1, 101), event('shootout_goal'))).toEqual({ goals: 0, assists: 0, redCards: 0 });
  });

  it('counts a direct red card', () => {
    const index = new AppearanceEventIndex([key(1, 101)]);
    expect(index.accumulate(key(1, 101), event('red_card'))).toEqual({ goals: 0, assists: 0, redCards: 1 });
  });

  it('counts a second-yellow dismissal as a red card', () => {
    const index = new AppearanceEventIndex([key(1, 101)]);
    expect(index.accumulate(key(1, 101), event('second_yellow'))).toEqual({ goals: 0, assists: 0, redCards: 1 });
  });

  it('ignores a yellow card', () => {
    const index = new AppearanceEventIndex([key(1, 101)]);
    expect(index.accumulate(key(1, 101), event('yellow_card'))).toEqual({ goals: 0, assists: 0, redCards: 0 });
  });

  it('ignores a substitution', () => {
    const index = new AppearanceEventIndex([key(1, 101)]);
    expect(index.accumulate(key(1, 101), event('substitution'))).toEqual({ goals: 0, assists: 0, redCards: 0 });
  });

  it('ignores an unrecognised row', () => {
    const index = new AppearanceEventIndex([key(1, 101)]);
    expect(index.accumulate(key(1, 101), event('other'))).toEqual({ goals: 0, assists: 0, redCards: 0 });
  });

  it('accumulates an assist carried on its own event row (A1)', () => {
    // The measured dataset has no `assist` event type: assists arrive as a
    // player_assist_id on a goal row, and the seed emits a SEPARATE event
    // with type 'other' against the assister's own appearance key.
    const index = new AppearanceEventIndex([key(1, 101), key(1, 202)]);
    index.accumulate(key(1, 101), event('goal'));
    expect(index.accumulate(key(1, 202), event('other', true))).toEqual({
      goals: 0,
      assists: 1,
      redCards: 0,
    });
  });

  it('drops an assist whose appearance row does not exist', () => {
    const index = new AppearanceEventIndex([key(1, 101)]);
    expect(index.accumulate(key(1, 999), event('other', true))).toBeUndefined();
    expect(index.size).toBe(1);
  });

  it('returns undefined for an event with no matching appearance row', () => {
    const index = new AppearanceEventIndex([key(1, 101)]);
    expect(index.accumulate(key(1, 999), event('goal'))).toBeUndefined();
  });

  it('does not grow when events arrive for unknown appearances', () => {
    const index = new AppearanceEventIndex([key(1, 101)]);
    index.accumulate(key(1, 999), event('goal'));
    index.accumulate(key(2, 999), event('red_card'));
    expect(index.size).toBe(1);
  });

  it('separates the same player in two different games', () => {
    const index = new AppearanceEventIndex([key(1, 101), key(2, 101)]);
    index.accumulate(key(1, 101), event('goal'));
    expect(index.accumulate(key(2, 101), event('goal'))).toEqual({ goals: 1, assists: 0, redCards: 0 });
  });

  it('accumulates multiple events for the same appearance', () => {
    const index = new AppearanceEventIndex([key(1, 101)]);
    index.accumulate(key(1, 101), event('goal'));
    index.accumulate(key(1, 101), event('second_yellow'));
    expect(index.accumulate(key(1, 101), event('goal'))).toEqual({ goals: 2, assists: 0, redCards: 1 });
  });

  it('leaves a game whose every event row is unjoinable at zero', () => {
    const index = new AppearanceEventIndex([key(1, 101), key(1, 102)]);
    index.accumulate(key(1, 999), event('goal'));
    index.accumulate(key(1, 998), event('red_card'));
    const rows: FullAppearanceRow[] = [
      { gameId: 1, playerId: 101, goals: 0, assists: 0, redCards: 0 },
      { gameId: 1, playerId: 102, goals: 0, assists: 0, redCards: 0 },
    ];
    expect(index.finalize(rows)).toEqual(rows);
  });

  it('writes accumulated totals back onto the appearance rows', () => {
    const index = new AppearanceEventIndex([key(1, 101), key(1, 102)]);
    index.accumulate(key(1, 101), event('goal', true));
    index.accumulate(key(1, 101), event('red_card'));
    const finalized = index.finalize([
      { gameId: 1, playerId: 101, goals: 0, assists: 0, redCards: 0 },
      { gameId: 1, playerId: 102, goals: 0, assists: 0, redCards: 0 },
    ]);
    expect(finalized[0]).toEqual({ gameId: 1, playerId: 101, goals: 1, assists: 1, redCards: 1 });
    expect(finalized[1]).toEqual({ gameId: 1, playerId: 102, goals: 0, assists: 0, redCards: 0 });
  });

  it('does not mutate the rows passed to finalize', () => {
    const index = new AppearanceEventIndex([key(1, 101)]);
    index.accumulate(key(1, 101), event('goal'));
    const row: FullAppearanceRow = { gameId: 1, playerId: 101, goals: 0, assists: 0, redCards: 0 };
    index.finalize([row]);
    expect(row.goals).toBe(0);
  });

  // Covers `finalize`'s `if (totals === undefined) return appearance;` arm —
  // the one branch the other 19 cases leave untaken, which otherwise holds
  // branches at 93.33% against a 95% gate. Task 5 finalizes exactly the rows
  // the index was built from, so the arm is defensive; a row carrying
  // NON-ZERO pre-existing totals is used so the assertion distinguishes
  // "passed through unchanged" from "reset to zero".
  it('passes through an appearance row the index never saw', () => {
    const index = new AppearanceEventIndex([key(1, 101)]);
    index.accumulate(key(1, 101), event('goal'));
    const unindexed: FullAppearanceRow = { gameId: 9, playerId: 999, goals: 7, assists: 3, redCards: 2 };
    expect(index.finalize([unindexed])).toEqual([
      { gameId: 9, playerId: 999, goals: 7, assists: 3, redCards: 2 },
    ]);
  });
});
