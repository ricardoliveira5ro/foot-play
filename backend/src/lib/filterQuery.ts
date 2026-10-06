import { Prisma } from '../generated/prisma/client';

/** Backend copy of the frozen frontend filter wire shape. */
export interface GameFilterParams {
  teamIds: number[] | null;
  opponentIds: number[] | null;
  competitionIds: string[] | null;
  seasonFrom: number | null;
  seasonTo: number | null;
}

export type FilterDimension = 'team' | 'opponent' | 'competition' | 'season';

export function teamWhere(ids: number[]): Prisma.Sql {
  if (ids.length === 0) return Prisma.empty;
  return Prisma.sql`g."targetTeamId" IN (${Prisma.join(ids)})`;
}

export function opponentWhere(ids: number[]): Prisma.Sql {
  if (ids.length === 0) return Prisma.empty;
  return Prisma.sql`g."opponentTeamId" IN (${Prisma.join(ids)})`;
}

export function competitionWhere(ids: string[]): Prisma.Sql {
  if (ids.length === 0) return Prisma.empty;
  return Prisma.sql`g."competitionId" IN (${Prisma.join(ids)})`;
}

export function seasonWhere(from: number | null, to: number | null): Prisma.Sql {
  const clauses: Prisma.Sql[] = [];
  if (from !== null) clauses.push(Prisma.sql`g."season" >= ${from}`);
  if (to !== null) clauses.push(Prisma.sql`g."season" <= ${to}`);
  return joinClauses(clauses, false);
}

export function allFiltersWhere(filters: GameFilterParams): Prisma.Sql {
  return joinClauses([
    teamWhere(filters.teamIds ?? []),
    opponentWhere(filters.opponentIds ?? []),
    competitionWhere(filters.competitionIds ?? []),
    seasonWhere(filters.seasonFrom, filters.seasonTo),
  ]);
}

export function filtersExcluding(filters: GameFilterParams, omit: FilterDimension): Prisma.Sql {
  return joinClauses([
    omit === 'team' ? Prisma.empty : teamWhere(filters.teamIds ?? []),
    omit === 'opponent' ? Prisma.empty : opponentWhere(filters.opponentIds ?? []),
    omit === 'competition' ? Prisma.empty : competitionWhere(filters.competitionIds ?? []),
    omit === 'season' ? Prisma.empty : seasonWhere(filters.seasonFrom, filters.seasonTo),
  ]);
}

function joinClauses(clauses: Prisma.Sql[], prefixAnd = true): Prisma.Sql {
  const present = clauses.filter((clause) => clause.text.length > 0);
  if (present.length === 0) return Prisma.empty;
  const joined = Prisma.join(present, ' AND ');
  return prefixAnd ? Prisma.sql`AND ${joined}` : joined;
}
