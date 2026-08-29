import { prisma } from '../prisma';
import { fitStartingXI, type LineupPlayer } from './positionMapping';
import type { Prisma } from '../generated/prisma/client';
import { normalize } from './wordle';

type GameWithRelations = Prisma.GameGetPayload<{
  include: {
    competition: true;
    homeClub: true;
    awayClub: true;
    appearances: { include: { player: true } };
  };
}>;

export async function getRandomMatch(): Promise<GameWithRelations | null> {
  const count = await prisma.game.count();
  
  if (count === 0) {
    throw Object.assign(new Error('No matches available'), { code: 'NOT_FOUND', status: 404 });
  }

  const [game] = await prisma.game.findMany({
    skip: Math.floor(Math.random() * count),
    take: 1,
    include: {
      competition: true,
      homeClub: true,
      awayClub: true,
      appearances: { include: { player: true } },
    },
  });

  return game as GameWithRelations | null;
}

export async function getMatchById(id: number) {
  const game = await prisma.game.findUnique({
    where: { gameId: id },
    include: {
      competition: true,
      homeClub: true,
      awayClub: true,
      appearances: { include: { player: true } },
    },
  })

  return game as GameWithRelations | null;
}

export function buildMatchResponse(game: GameWithRelations) {
  return {
    match: {
      id: game.gameId,
      date: game.date?.toISOString().slice(0, 10) ?? null,
      season: game.season ? `${game.season}/${game.season + 1}` : null,
      competition: game.competition?.name ?? null,
      homeClub: game.homeClub ? { id: game.homeClub.id, name: game.homeClub.name } : null,
      awayClub: game.awayClub ? { id: game.awayClub.id, name: game.awayClub.name } : null,
      homeScore: game.homeClubGoals ?? 0,
      awayScore: game.awayClubGoals ?? 0,
      homeFormation: game.homeClubFormation ?? null,
      awayFormation: game.awayClubFormation ?? null,
    },
    homeLineup: buildLineup(game.appearances, game.homeClubId, game.homeClubFormation),
    awayLineup: buildLineup(game.appearances, game.awayClubId, game.awayClubFormation),
  };
}

function buildLineup(appearances: GameWithRelations['appearances'],clubId: number,formation: string | null) {
  const side = appearances
    .filter((a) => a.clubId === clubId)
    .sort((a, b) => {
      const na = a.number ?? Number.MAX_SAFE_INTEGER;
      const nb = b.number ?? Number.MAX_SAFE_INTEGER;
      if (na !== nb) return na - nb;
      return a.playerId - b.playerId;
    });

  const lineupPlayers: LineupPlayer[] = side.map((a) => ({
    playerId: a.playerId,
    position: a.position ?? a.player?.position ?? null,
  }));

  const fitted = fitStartingXI(lineupPlayers, formation);

  return side.map((a, i) => ({
    playerId: a.playerId,
    nameLength: normalize(a.player?.displayName ?? a.player?.name ?? '').length,
    shirtNumber: a.number ?? null,
    position: fitted[i].position,
    coords: fitted[i].coords,
  }));
}
