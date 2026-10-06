import { Prisma } from '../generated/prisma/client';
import { prisma } from '../prisma';
import { completeLineupsWhere } from '../lib/lineupCompleteness';
import {
  allFiltersWhere,
  filtersExcluding,
  type GameFilterParams,
} from '../lib/filterQuery';

export interface FilterOptionGroup {
  id: number;
  name: string;
  count: number;
  isNationalTeam: boolean;
}

export interface FilterOptionsResponse {
  teams: FilterOptionGroup[];
  opponents: FilterOptionGroup[];
  competitions: { id: string; name: string; count: number }[];
  seasons: { season: number; count: number }[];
  total: number;
}

interface RawCountOption {
  id: number;
  count: number;
}

interface RawCompetitionCount {
  id: string;
  count: number;
}

interface RawFilterCounts {
  teams: RawCountOption[];
  opponents: RawCountOption[];
  competitions: RawCompetitionCount[];
  seasons: { season: number; count: number }[];
  total: number;
}

export async function getFilterOptions(filters: GameFilterParams): Promise<FilterOptionsResponse> {
  const query = Prisma.sql`
    WITH teams AS (
      SELECT g."targetTeamId" AS k, COUNT(*)::int AS c
      FROM "Game" g
      WHERE ${completeLineupsWhere()} ${filtersExcluding(filters, 'team')}
      GROUP BY 1
    ), opponents AS (
      SELECT g."opponentTeamId" AS k, COUNT(*)::int AS c
      FROM "Game" g
      WHERE ${completeLineupsWhere()} ${filtersExcluding(filters, 'opponent')}
      GROUP BY 1
    ), competitions AS (
      SELECT g."competitionId" AS k, COUNT(*)::int AS c
      FROM "Game" g
      WHERE ${completeLineupsWhere()} ${filtersExcluding(filters, 'competition')}
      GROUP BY 1
    ), seasons AS (
      SELECT g."season" AS k, COUNT(*)::int AS c
      FROM "Game" g
      WHERE ${completeLineupsWhere()}
        AND g."season" BETWEEN 2013 AND 2025
        ${filtersExcluding(filters, 'season')}
      GROUP BY 1
    ), total_base AS (
      SELECT COUNT(*)::int AS c
      FROM "Game" g
      WHERE ${completeLineupsWhere()} ${allFiltersWhere(filters)}
    )
    SELECT json_build_object(
      'teams', COALESCE((
        SELECT json_agg(json_build_object('id', t.k, 'count', t.c) ORDER BY t.k)
        FROM teams t
      ), '[]'::json),
      'opponents', COALESCE((
        SELECT json_agg(json_build_object('id', o.k, 'count', o.c) ORDER BY o.k)
        FROM opponents o
      ), '[]'::json),
      'competitions', COALESCE((
        SELECT json_agg(json_build_object('id', c.k, 'count', c.c) ORDER BY c.k)
        FROM competitions c
      ), '[]'::json),
      'seasons', COALESCE((
        SELECT json_agg(json_build_object('season', s.k, 'count', s.c) ORDER BY s.k)
        FROM seasons s
        WHERE s.k IS NOT NULL
      ), '[]'::json),
      'total', (SELECT c FROM total_base)
    ) AS result
  `;

  // Counts share one statement/snapshot. The two metadata queries deliberately
  // read the unfiltered option universe so zero-count options remain selectable.
  const [countRows, clubs, competitions] = await Promise.all([
    prisma.$queryRaw<{ result: RawFilterCounts }[]>(query),
    prisma.club.findMany({
      select: { clubId: true, name: true, isNationalTeam: true },
      orderBy: { name: 'asc' },
    }),
    prisma.competition.findMany({
      select: { competitionId: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const counts = countRows[0]?.result;
  if (!counts) throw new Error('Filter counts query returned no result row');

  const teamCounts = new Map(counts.teams.map(({ id, count }) => [id, count]));
  const opponentCounts = new Map(counts.opponents.map(({ id, count }) => [id, count]));
  const competitionCounts = new Map(counts.competitions.map(({ id, count }) => [id, count]));

  return {
    teams: clubs.map((club) => ({
      id: club.clubId,
      name: club.name,
      count: teamCounts.get(club.clubId) ?? 0,
      isNationalTeam: club.isNationalTeam ?? false,
    })),
    opponents: clubs.map((club) => ({
      id: club.clubId,
      name: club.name,
      count: opponentCounts.get(club.clubId) ?? 0,
      isNationalTeam: club.isNationalTeam ?? false,
    })),
    competitions: competitions.map((competition) => ({
      id: competition.competitionId,
      name: competition.name,
      count: competitionCounts.get(competition.competitionId) ?? 0,
    })),
    seasons: counts.seasons,
    total: counts.total,
  };
}
