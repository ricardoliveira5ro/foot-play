import { describe, it, expect } from 'vitest';
import { revealMatches } from './reveal';
import type { ShirtGameData } from './gameState';
import type { RevealPlayer } from '../../types';

function makeShirt(overrides: Partial<ShirtGameData> & { token: string }): ShirtGameData {
  return {
    nameLength: 5,
    wordBoundaries: [],
    shirtNumber: 10,
    position: 'CM',
    coords: { x: 50, y: 50 },
    goals: 0,
    assists: 0,
    redCards: 0,
    isCaptain: false,
    state: 'failed',
    attempts: 6,
    guessHistory: [],
    correctLetters: [],
    ...overrides,
  };
}

function makeReveal(overrides: Partial<RevealPlayer> & { token: string; name: string }): RevealPlayer {
  return { playerId: 0, shirtNumber: 10, ...overrides };
}

describe('revealMatches', () => {
  it('matches a revealed player to the shirt carrying the same token', () => {
    const shirts = [makeShirt({ token: 't-6', shirtNumber: 6 })];
    const result = revealMatches([makeReveal({ token: 't-6', name: 'Target Six' })], shirts);
    expect(result).toEqual([{ token: 't-6', name: 'Target Six' }]);
  });

  it('assigns distinct names to two shirts that both have a null number (R1(a))', () => {
    // R1(a), the live defect. `Appearance.number` is `Int?`, so two
    // null-numbered players in one team are the normal case, not an edge
    // case. Matching on `shirtNumber` sends both names to the FIRST shirt
    // and leaves the second blank. `null === null` is true.
    const shirts = [
      makeShirt({ token: 't-a', shirtNumber: null }),
      makeShirt({ token: 't-b', shirtNumber: null }),
    ];
    const result = revealMatches(
      [
        makeReveal({ token: 't-a', name: 'First Player', shirtNumber: null }),
        makeReveal({ token: 't-b', name: 'Second Player', shirtNumber: null }),
      ],
      shirts,
    );
    expect(result).toEqual([
      { token: 't-a', name: 'First Player' },
      { token: 't-b', name: 'Second Player' },
    ]);
  });

  it('separates two players who share a shirt number within one team', () => {
    const shirts = [
      makeShirt({ token: 't-x', shirtNumber: 6 }),
      makeShirt({ token: 't-y', shirtNumber: 6 }),
    ];
    const result = revealMatches(
      [
        makeReveal({ token: 't-x', name: 'Numbersman', shirtNumber: 6 }),
        makeReveal({ token: 't-y', name: 'Trickster', shirtNumber: 6 }),
      ],
      shirts,
    );
    expect(result).toEqual([
      { token: 't-x', name: 'Numbersman' },
      { token: 't-y', name: 'Trickster' },
    ]);
  });

  it('produces the same result regardless of the order of the reveal array', () => {
    const shirts = [makeShirt({ token: 't-1' }), makeShirt({ token: 't-2' })];
    const players = [
      makeReveal({ token: 't-1', name: 'One' }),
      makeReveal({ token: 't-2', name: 'Two' }),
    ];
    const forward = revealMatches(players, shirts);
    const reversed = revealMatches([...players].reverse(), shirts);
    expect(reversed).toEqual(forward);
  });

  it('never overwrites a shirt that is already correct', () => {
    const shirts = [
      makeShirt({ token: 't-1', state: 'correct', name: 'Already Guessed' }),
      makeShirt({ token: 't-2', state: 'failed' }),
    ];
    const result = revealMatches(
      [
        makeReveal({ token: 't-1', name: 'Server Name' }),
        makeReveal({ token: 't-2', name: 'New Name' }),
      ],
      shirts,
    );
    expect(result).toEqual([{ token: 't-2', name: 'New Name' }]);
  });

  it('ignores a revealed player with no shirt on this board', () => {
    const shirts = [makeShirt({ token: 't-1' })];
    const result = revealMatches([makeReveal({ token: 'ghost', name: 'Ghost' })], shirts);
    expect(result).toEqual([]);
  });

  it('leaves an already-named failed shirt matchable and unchanged in value', () => {
    const shirts = [makeShirt({ token: 't-1', state: 'failed', name: 'Stale' })];
    const result = revealMatches([makeReveal({ token: 't-1', name: 'Fresh' })], shirts);
    expect(result).toEqual([{ token: 't-1', name: 'Fresh' }]);
    expect(shirts[0].name).toBe('Stale'); // pure: no mutation
  });

  it('returns one distinct pair per shirt when the whole team is revealed', () => {
    const shirts = Array.from({ length: 11 }, (_, i) => makeShirt({ token: `t-${i}`, shirtNumber: null }));
    const players = Array.from({ length: 11 }, (_, i) =>
      makeReveal({ token: `t-${i}`, name: `Player ${i}`, shirtNumber: null }),
    );
    const result = revealMatches(players, shirts);
    expect(result).toHaveLength(11);
    expect(new Set(result.map((r) => r.token)).size).toBe(11);
    expect(new Set(result.map((r) => r.name)).size).toBe(11);
  });
});
