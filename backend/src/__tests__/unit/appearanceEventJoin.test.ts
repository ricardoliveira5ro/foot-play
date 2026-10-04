import { describe, it, expect } from 'vitest';
import {
  AppearanceEventIndex,
  type AppearanceKey,
  type FullAppearanceRow,
} from '../../lib/appearanceEventJoin';
import type { ParsedEventType } from '../../lib/eventMapping';

const key = (gameId: number, playerId: number): AppearanceKey => ({ gameId, playerId });

const event = (type: ParsedEventType, isAssist = false) => ({ type, isAssist });

/**
 * One row per event type a single event row can carry, with the totals that
 * type must contribute to its appearance: every row is the same assertion, so
 * the mapping is table-driven (and each case keeps its own test name) instead
 * of eight near-identical bodies. The zero rows are the meaningful ones — the
 * event types that must NOT be credited.
 */
const SINGLE_EVENT_CASES: ReadonlyArray<
  readonly [
    label: string,
    type: ParsedEventType,
    expected: { goals: number; assists: number; redCards: number },
  ]
> = [
  ['a goal', 'goal', { goals: 1, assists: 0, redCards: 0 }],
  // O5: an own goal is a recognised event type but deliberately deferred — it
  // is not credited to anyone, in either direction.
  ['an own goal (O5 — recognized, deliberately deferred)', 'own_goal', { goals: 0, assists: 0, redCards: 0 }],
  // O3: shootout goals are outside this competition's goal tally.
  ['a shootout goal (O3)', 'shootout_goal', { goals: 0, assists: 0, redCards: 0 }],
  ['a direct red card', 'red_card', { goals: 0, assists: 0, redCards: 1 }],
  // A second yellow is a sending-off, so it counts as a red card.
  ['a second-yellow dismissal', 'second_yellow', { goals: 0, assists: 0, redCards: 1 }],
  ['a yellow card', 'yellow_card', { goals: 0, assists: 0, redCards: 0 }],
  ['a substitution', 'substitution', { goals: 0, assists: 0, redCards: 0 }],
  ['an unrecognised row', 'other', { goals: 0, assists: 0, redCards: 0 }],
];

describe('AppearanceEventIndex', () => {
  it('reports the number of distinct indexed appearances', () => {
    const index = new AppearanceEventIndex([key(1, 101), key(1, 101), key(1, 102)]);
    expect(index.size).toBe(2);
  });

  it.each(SINGLE_EVENT_CASES)('counts %s', (_label, type, expected) => {
    const index = new AppearanceEventIndex([key(1, 101)]);
    expect(index.accumulate(key(1, 101), event(type))).toEqual(expected);
  });

  it('accumulates a penalty goal', () => {
    const index = new AppearanceEventIndex([key(1, 101)]);
    index.accumulate(key(1, 101), event('penalty'));
    expect(index.accumulate(key(1, 101), event('penalty'))).toEqual({ goals: 2, assists: 0, redCards: 0 });
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
    // Both keys are indexed, so the second goal must land on key(2,101) and
    // NOT continue key(1,101)'s total. Asserting 1 here is what proves the
    // games are separate: a shared bucket would report 2.
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

  // The generic signature on `finalize` exists for exactly this shape: Task 5
  // hands it rows carrying clubId/number/type/position/isCaptain and feeds the
  // result to `toAppearanceData`, which reads all five. A `FullAppearanceRow[]`
  // return type would drop them at compile time (TS2322). Asserting they
  // survive makes the spread's column preservation falsifiable rather than
  // incidental.
  it("preserves the caller's extra columns while writing the totals", () => {
    const index = new AppearanceEventIndex([key(1, 101)]);
    index.accumulate(key(1, 101), event('goal'));
    expect(
      index.finalize([
        {
          gameId: 1,
          playerId: 101,
          clubId: 55,
          number: 10,
          type: 'starter',
          position: 'GK',
          isCaptain: true,
          goals: 0,
          assists: 0,
          redCards: 0,
        },
      ]),
    ).toEqual([
      {
        gameId: 1,
        playerId: 101,
        clubId: 55,
        number: 10,
        type: 'starter',
        position: 'GK',
        isCaptain: true,
        goals: 1,
        assists: 0,
        redCards: 0,
      },
    ]);
  });
});
