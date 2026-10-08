import { prisma } from '../prisma';
import { fitStartingXI, type LineupPlayer } from './positionMapping';
import { Prisma } from '../generated/prisma/client';
import { normalize, getWordBoundaries } from './wordle';
import { generatePlayerToken, resolvePlayerToken } from './tokenService';
import { completeLineupsWhere } from '../lib/lineupCompleteness';
import { allFiltersWhere, type GameFilterParams } from '../lib/filterQuery';

export type GameWithRelations = Prisma.GameGetPayload<{
  include: {
    competition: true;
    homeClub: true;
    awayClub: true;
    appearances: { include: { player: true } };
  };
}>;

export { hasCompleteLineups } from '../lib/lineupCompleteness';

const EMPTY_GAME_FILTERS: GameFilterParams = {
  teamIds: null,
  competitionIds: null,
  seasonFrom: null,
  seasonTo: null,
};

export async function getRandomMatch(filters: GameFilterParams = EMPTY_GAME_FILTERS): Promise<GameWithRelations | null> {
  const [row] = await prisma.$queryRaw<{
    game: (Omit<GameWithRelations, 'date'> & { date: string | null }) | null;
  }[]>`
    WITH eligible AS MATERIALIZED (
      SELECT g.*
      FROM "Game" g
      WHERE ${completeLineupsWhere()} ${allFiltersWhere(filters)}
    ), picked AS (
      SELECT * FROM eligible
      ORDER BY "gameId"
      OFFSET (SELECT FLOOR(RANDOM() * COUNT(*))::integer FROM eligible)
      LIMIT 1
    )
    SELECT
      to_jsonb(g) || jsonb_build_object(
        'competition', to_jsonb(c),
        'homeClub', to_jsonb(home_club),
        'awayClub', to_jsonb(away_club),
        'appearances', lineup.appearances
      ) AS game
    FROM picked g
    LEFT JOIN "Competition" c ON c."competitionId" = g."competitionId"
    LEFT JOIN "Club" home_club ON home_club."clubId" = g."homeClubId"
    LEFT JOIN "Club" away_club ON away_club."clubId" = g."awayClubId"
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        jsonb_agg(to_jsonb(a) || jsonb_build_object('player', to_jsonb(p))),
        '[]'::jsonb
      ) AS appearances
      FROM "Appearance" a
      LEFT JOIN "Player" p ON p."playerId" = a."playerId"
      WHERE a."gameId" = g."gameId"
    ) lineup ON TRUE
  `;

  if (!row?.game) {
    throw Object.assign(new Error('No playable matches available'), { code: 'NOT_FOUND', status: 404 });
  }

  return {
    ...row.game,
    date: row.game.date ? new Date(row.game.date) : null,
  } as GameWithRelations;
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
    game: {
      gameId: game.gameId,
      date: game.date?.toISOString().slice(0, 10) ?? null,
      season: game.season ? `${game.season}/${game.season + 1}` : null,
      competition: game.competition?.name ?? null,
      homeClub: game.homeClub ? { clubId: game.homeClub.clubId, name: game.homeClub.name } : null,
      awayClub: game.awayClub ? { clubId: game.awayClub.clubId, name: game.awayClub.name } : null,
      homeScore: game.homeClubGoals ?? 0,
      awayScore: game.awayClubGoals ?? 0,
      homeFormation: game.homeClubFormation ?? null,
      awayFormation: game.awayClubFormation ?? null,
    },
    homeLineup: buildLineup(game.gameId, game.appearances, game.homeClubId, game.homeClubFormation),
    awayLineup: buildLineup(game.gameId, game.appearances, game.awayClubId, game.awayClubFormation),
  };
}

function buildLineup(gameId: number, appearances: GameWithRelations['appearances'], clubId: number, formation: string | null) {
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

  return side.map((a, i) => {
    const displayName = a.player?.displayName ?? a.player?.name ?? '';
    return {
      token: generatePlayerToken(gameId, a.playerId),
      nameLength: normalize(displayName).length,
      wordBoundaries: getWordBoundaries(displayName),
      shirtNumber: a.number ?? null,
      position: fitted[i].position,
      coords: fitted[i].coords,
      // Event columns (v1.0.2). These default to 0 and stay 0 on a game that
      // was seeded before v1.0.1 — 0 is indistinguishable from "did not
      // score", which is why degradation is per game and carries no flag.
      goals: a.goals,
      assists: a.assists,
      redCards: a.redCards,
      // Prisma types isCaptain as Boolean?; the wire type is boolean.
      isCaptain: a.isCaptain ?? false,
    };
  });
}

export async function getPlayerNameForAppearance(gameId: number, token: string): Promise<string | null> {
  const playerId = await resolvePlayerToken(gameId, token);

  if (!playerId) return null;

  const appearance = await prisma.appearance.findFirst({
    where: { gameId, playerId },
    include: { player: true }
  })

  return appearance?.player.displayName ?? appearance?.player.name ?? null;
}

export async function getRevealAppearances(gameId: number, clubId: number) {
  return prisma.appearance.findMany({
    where: { gameId, clubId },
    include: { player: { select: { displayName: true, name: true } } },
    orderBy: [{ number: { sort: 'asc', nulls: 'last' } }, { playerId: 'asc' }],
  });
}
