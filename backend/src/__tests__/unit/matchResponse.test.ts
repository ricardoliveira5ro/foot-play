import { describe, it, expect } from 'vitest';
import { buildMatchResponse, type GameWithRelations } from '../../services/matchService';

type Appearance = GameWithRelations['appearances'][number];

function makeAppearance(overrides: Partial<Appearance> = {}): Appearance {
  return {
    gameId: 1,
    clubId: 1,
    playerId: 1,
    number: 1,
    position: null,
    goals: 0,
    assists: 0,
    redCards: 0,
    isCaptain: null,
    player: { displayName: null, name: null },
    ...overrides,
  } as unknown as Appearance;
}

function makeGame(overrides: Record<string, unknown> = {}): GameWithRelations {
  return {
    gameId: 1,
    date: null,
    season: null,
    competition: null,
    homeClub: null,
    awayClub: null,
    homeClubId: 1,
    awayClubId: 2,
    homeClubFormation: null,
    awayClubFormation: null,
    homeClubGoals: null,
    awayClubGoals: null,
    appearances: [],
    ...overrides,
  } as unknown as GameWithRelations;
}

describe('buildMatchResponse', () => {
  it('degrades to nulls when relations are missing', () => {
    const response = buildMatchResponse(makeGame());

    expect(response.game.competition).toBeNull();
    expect(response.game.homeClub).toBeNull();
    expect(response.game.awayClub).toBeNull();
    expect(response.game.date).toBeNull();
    expect(response.game.season).toBeNull();
    expect(response.game.homeScore).toBe(0);
    expect(response.game.awayScore).toBe(0);
    expect(response.homeLineup).toEqual([]);
    expect(response.awayLineup).toEqual([]);
  });

  it('maps appearances whose player row or names are missing', () => {
    const response = buildMatchResponse(makeGame({
      appearances: [
        makeAppearance({ playerId: 1, number: 1 }),
        makeAppearance({ playerId: 2, number: 2, player: undefined }),
        makeAppearance({
          clubId: 2,
          playerId: 3,
          number: 3,
          position: 'goalkeeper',
          player: { displayName: 'Keeper', name: 'Keeper Full' },
        }),
      ],
    }));

    // Empty resolved names fall back to '' (length 0), the resolved name wins
    // when present, and the away side keeps its own club's players.
    expect(response.homeLineup.map((entry) => entry.nameLength)).toEqual([0, 0]);
    expect(response.awayLineup).toHaveLength(1);
    expect(response.awayLineup[0].nameLength).toBe('keeper'.length);
    expect(response.awayLineup[0].position).toBe('goalkeeper');
  });
});
