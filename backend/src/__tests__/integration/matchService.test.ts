import { describe, it, expect } from 'vitest';
import { prisma } from '../../prisma';
import {
  getRandomMatch,
  getMatchById,
  buildMatchResponse,
  getPlayerNameForAppearance,
  getRevealAppearances,
} from '../../services/matchService';
import { generatePlayerToken } from '../../services/tokenService';
import { seed } from '../setup/seed';

describe('getRandomMatch', () => {
  it('returns a game with relations', async () => {
    // Scope the DB to game 1 so the random pick is deterministic
    await prisma.appearance.deleteMany({ where: { gameId: { in: [2, 3] } } });
    await prisma.game.deleteMany({ where: { gameId: { in: [2, 3] } } });
    const game = await getRandomMatch();
    expect(game).not.toBeNull();
    expect(game!.competition.name).toBe('Test League');
    expect(game!.homeClub.name).toBe('Test FC');
    expect(game!.awayClub.name).toBe('Test United');
    expect(game!.appearances.length).toBeGreaterThan(0);
    await seed();
  });

  it('throws NOT_FOUND when no games exist', async () => {
    await prisma.appearance.deleteMany();
    await prisma.game.deleteMany();
    await expect(getRandomMatch()).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    await seed();
  });
});

describe('getMatchById', () => {
  it('returns the game with relations', async () => {
    const game = await getMatchById(1);
    expect(game?.gameId).toBe(1);
    expect(game?.appearances.length).toBeGreaterThan(0);
  });

  it('returns null for unknown id', async () => {
    expect(await getMatchById(999)).toBeNull();
  });
});

describe('buildMatchResponse', () => {
  it('builds the full response shape for game 1', async () => {
    const game = await getMatchById(1);
    const response = buildMatchResponse(game!);
    expect(response.game.gameId).toBe(1);
    expect(response.game.date).toBe('2023-05-01');
    expect(response.game.season).toBe('2023/2024');
    expect(response.game.competition).toBe('Test League');
    expect(response.game.homeClub).toEqual({ clubId: 1, name: 'Test FC' });
    expect(response.game.awayClub).toEqual({ clubId: 2, name: 'Test United' });
    expect(response.game.homeScore).toBe(2);
    expect(response.game.awayScore).toBe(1);
    expect(response.game.homeFormation).toBe('4-3-3');
    expect(response.game.awayFormation).toBe('4-4-2');
    expect(response.homeLineup).toHaveLength(8);
    expect(response.awayLineup).toHaveLength(5);
    const first = response.homeLineup[0];
    expect(first.token).toBe(generatePlayerToken(1, 108));
    expect(first.nameLength).toBe(5); // 'Neuer'
    expect(first.wordBoundaries).toEqual([]);
    expect(first.shirtNumber).toBe(1);
    expect(first.position).toBe('goalkeeper');
    expect(first.coords).toEqual({ x: 50, y: 90 });
  });

  it('handles null fields for game 3', async () => {
    const game = await getMatchById(3);
    const response = buildMatchResponse(game!);
    expect(response.game.date).toBeNull();
    expect(response.game.season).toBeNull();
    expect(response.game.homeScore).toBe(0);
    expect(response.game.awayScore).toBe(0);
    expect(response.game.homeFormation).toBeNull();
    expect(response.homeLineup).toEqual([]);
    expect(response.awayLineup).toEqual([]);
  });

  it('falls back to player name when displayName is null', async () => {
    const game = await getMatchById(2);
    const response = buildMatchResponse(game!);
    const awayLineup = response.awayLineup;
    const testPlayer = awayLineup.find(l => l.token === generatePlayerToken(2, 114));
    expect(testPlayer?.nameLength).toBe(10); // 'Test Player' normalized -> 'testplayer'
  });

  it('sorts by number then playerId, nulls last, when numbers tie', async () => {
    // Duplicate shirt numbers exercise the sort tiebreaker; a null number in
    // the MIDDLE of the input exercises the null-number fallback in the
    // comparator (V8's sort uses it as the second arg 'b' when it precedes
    // a smaller-numbered element).
    await prisma.game.create({
      data: {
        gameId: 4,
        competitionId: 'TEST-COMP',
        season: 2025,
        date: new Date('2025-01-01T00:00:00Z'),
        homeClubId: 1,
        awayClubId: 2,
        targetTeamId: 1,
        opponentTeamId: 2,
        homeClubGoals: 1,
        awayClubGoals: 0,
        homeClubFormation: '4-3-3',
        awayClubFormation: '4-4-2',
      },
    });
    await prisma.appearance.createMany({
      data: [
        // Null-number in the middle: V8 sort compares (108, 111) then
        // (111, 109), making 111 the 'b' arg in the first comparison.
        { gameId: 4, clubId: 1, playerId: 108, number: 1, type: 'starting_lineup', position: 'goalkeeper' },
        { gameId: 4, clubId: 1, playerId: 111, number: null, type: 'starting_lineup', position: null },
        { gameId: 4, clubId: 1, playerId: 109, number: 1, type: 'starting_lineup', position: 'centre-back' },
      ],
    });
    const game = await getMatchById(4);
    const response = buildMatchResponse(game!);
    const tokens = response.homeLineup.map(l => l.token);
    expect(tokens).toEqual([
      generatePlayerToken(4, 108),
      generatePlayerToken(4, 109),
      generatePlayerToken(4, 111),
    ]);
    await seed();
  });
});

describe('getPlayerNameForAppearance', () => {
  it('returns displayName for a valid token', async () => {
    expect(await getPlayerNameForAppearance(1, generatePlayerToken(1, 101))).toBe('Messi');
  });

  it('falls back to name when displayName is null', async () => {
    expect(await getPlayerNameForAppearance(2, generatePlayerToken(2, 114))).toBe('Test Player');
  });

  it('returns null for an unknown token', async () => {
    expect(await getPlayerNameForAppearance(1, 'bogus-token')).toBeNull();
  });
});

describe('getRevealAppearances', () => {
  it('returns appearances ordered by number asc, nulls last', async () => {
    const appearances = await getRevealAppearances(1, 1);
    expect(appearances).toHaveLength(8);
    expect(appearances[0].number).toBe(1);
    expect(appearances[appearances.length - 1].number).toBeNull();
    expect(appearances[appearances.length - 1].player.displayName).toBe('Mbappe');
  });

  it('returns [] for a club with no appearances in the game', async () => {
    expect(await getRevealAppearances(3, 1)).toEqual([]);
  });
});