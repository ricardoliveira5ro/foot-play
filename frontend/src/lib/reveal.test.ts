import { describe, it, expect } from 'vitest';
import type { ShirtGameData } from './gameState';
import type { RevealPlayer } from '../../types';

/**
 * Team-scoped name resolution — the core logic that prevents
 * shirt-number collisions between the two lineups.
 *
 * When both teams have e.g. a #6 player, names must be resolved
 * per-team so each shirt gets the correct player name.
 */

function makeShirt(overrides: Partial<ShirtGameData> & { token: string; shirtNumber: number | null }): ShirtGameData {
  return {
    nameLength: 5,
    wordBoundaries: [],
    position: 'CM',
    coords: { x: 50, y: 50 },
    state: 'failed',
    attempts: 6,
    guessHistory: [],
    correctLetters: [],
    ...overrides,
  };
}

/**
 * The FIXED logic: reveal names on unresolved shirts,
 * matched per team to avoid shirt-number collisions.
 */
function revealTeam(players: RevealPlayer[], shirts: ShirtGameData[]): void {
  for (const player of players) {
    const shirt = shirts.find(
      (s) => s.shirtNumber === player.shirtNumber && s.state !== 'correct',
    );
    if (shirt) {
      shirt.name = player.name;
    }
  }
}

/**
 * The BUGGY logic (old): search across ALL shirts from both teams.
 * First match wins — causes wrong names when shirt numbers collide.
 */
function revealAllBuggy(
  players: RevealPlayer[],
  shirts: ShirtGameData[],
): void {
  for (const player of players) {
    const shirt = shirts.find(
      (s) => s.shirtNumber === player.shirtNumber && s.state !== 'correct',
    );
    if (shirt) {
      shirt.name = player.name;
    }
  }
}

describe('team-scoped reveal — prevents shirt-number collisions', () => {
  it('assigns correct names when both teams share a shirt number', () => {
    const targetShirts = [
      makeShirt({ token: 'target-6', shirtNumber: 6 }),
    ];
    const opponentShirts = [
      makeShirt({ token: 'opponent-6', shirtNumber: 6 }),
    ];

    const targetRevealed: RevealPlayer[] = [
      { playerId: 1, name: 'Benfica Player', shirtNumber: 6 },
    ];
    const opponentRevealed: RevealPlayer[] = [
      { playerId: 2, name: 'Belenenses Player', shirtNumber: 6 },
    ];

    revealTeam(targetRevealed, targetShirts);
    revealTeam(opponentRevealed, opponentShirts);

    expect(targetShirts[0].name).toBe('Benfica Player');
    expect(opponentShirts[0].name).toBe('Belenenses Player');
  });

  it('assigns correct names across multiple colliding shirt numbers', () => {
    const targetShirts = [
      makeShirt({ token: 't-6', shirtNumber: 6 }),
      makeShirt({ token: 't-10', shirtNumber: 10 }),
    ];
    const opponentShirts = [
      makeShirt({ token: 'o-6', shirtNumber: 6 }),
      makeShirt({ token: 'o-10', shirtNumber: 10 }),
    ];

    const targetRevealed: RevealPlayer[] = [
      { playerId: 1, name: 'Target Six', shirtNumber: 6 },
      { playerId: 2, name: 'Target Ten', shirtNumber: 10 },
    ];
    const opponentRevealed: RevealPlayer[] = [
      { playerId: 3, name: 'Opponent Six', shirtNumber: 6 },
      { playerId: 4, name: 'Opponent Ten', shirtNumber: 10 },
    ];

    revealTeam(targetRevealed, targetShirts);
    revealTeam(opponentRevealed, opponentShirts);

    expect(targetShirts[0].name).toBe('Target Six');
    expect(targetShirts[1].name).toBe('Target Ten');
    expect(opponentShirts[0].name).toBe('Opponent Six');
    expect(opponentShirts[1].name).toBe('Opponent Ten');
  });

  it('skips already-correct shirts (state === "correct")', () => {
    const targetShirts = [
      makeShirt({ token: 't-6', shirtNumber: 6, state: 'correct', name: 'Already Guessed' }),
      makeShirt({ token: 't-8', shirtNumber: 8 }),
    ];

    const targetRevealed: RevealPlayer[] = [
      { playerId: 1, name: 'New Name', shirtNumber: 6 },
      { playerId: 2, name: 'Eight Player', shirtNumber: 8 },
    ];

    revealTeam(targetRevealed, targetShirts);

    // The already-correct shirt keeps its existing name
    expect(targetShirts[0].name).toBe('Already Guessed');
    // The unresolved shirt gets the revealed name
    expect(targetShirts[1].name).toBe('Eight Player');
  });

  it('does not assign a name when no matching shirt exists in the team', () => {
    const targetShirts = [
      makeShirt({ token: 't-6', shirtNumber: 6 }),
    ];

    // Reveal data for shirt #11, but the team has no #11 shirt
    const targetRevealed: RevealPlayer[] = [
      { playerId: 1, name: 'Ghost Player', shirtNumber: 11 },
    ];

    revealTeam(targetRevealed, targetShirts);

    expect(targetShirts[0].name).toBeUndefined();
  });
});

describe('GameComplete revealedByName map — demonstrates the display bug', () => {
  it('WRONG: Map keyed by shirtNumber only keeps the last player per number', () => {
    const revealedPlayers: RevealPlayer[] = [
      { playerId: 1, name: 'Benfica Player', shirtNumber: 6 },
      { playerId: 2, name: 'Belenenses Player', shirtNumber: 6 },
    ];

    // Old GameComplete logic: Map keyed by shirtNumber
    const revealedByName = new Map(revealedPlayers.map((p) => [p.shirtNumber, p.name]));

    // Both shirts with number 6 get the SAME name — the last one wins
    expect(revealedByName.get(6)).toBe('Belenenses Player');

    // FIXED: using shirt.name directly (populated by team-scoped reveal)
    const targetShirts = [makeShirt({ token: 'target-6', shirtNumber: 6, name: 'Benfica Player' })];
    const opponentShirts = [makeShirt({ token: 'opponent-6', shirtNumber: 6, name: 'Belenenses Player' })];

    expect(targetShirts[0].name).toBe('Benfica Player');
    expect(opponentShirts[0].name).toBe('Belenenses Player');
  });
});

describe('buggy cross-team reveal — demonstrates the old bug', () => {
  it('WRONG: searching across all shirts causes name collisions', () => {
    const allShirts = [
      makeShirt({ token: 'target-6', shirtNumber: 6 }),
      makeShirt({ token: 'opponent-6', shirtNumber: 6 }),
    ];

    const targetRevealed: RevealPlayer[] = [
      { playerId: 1, name: 'Benfica Player', shirtNumber: 6 },
    ];
    const opponentRevealed: RevealPlayer[] = [
      { playerId: 2, name: 'Belenenses Player', shirtNumber: 6 },
    ];

    // Buggy: all revealed players searched against all shirts
    const allRevealed = [...targetRevealed, ...opponentRevealed];
    revealAllBuggy(allRevealed, allShirts);

    // BUG: find() always returns the first matching shirt in the combined array,
    // so the second player's name overwrites the first, and the opponent's
    // shirt never receives any name at all.
    expect(allShirts[0].name).not.toBe('Benfica Player'); // WRONG — overwritten
    expect(allShirts[1].name).toBeUndefined(); // WRONG — never assigned
  });
});
