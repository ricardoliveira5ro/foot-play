import type { GameFilterParams } from '../../types';

type UnknownRecord = Record<string, unknown>;

export function matchesGameFilters(filters: GameFilterParams, game: unknown): boolean {
  const outer = asRecord(game);
  if (!outer) return !hasActiveFilters(filters);
  const record = asRecord(outer.game) ?? outer;
  const metadata = asRecord(outer.filterMetadata) ?? asRecord(record.filterMetadata) ?? record;
  const homeClub = asRecord(record.homeClub);
  const awayClub = asRecord(record.awayClub);

  const teamIds = activeList(filters.teamIds);
  const teamId = numeric(metadata.teamId ?? metadata.targetTeamId ?? record.targetTeamId);
  const homeId = numeric(homeClub?.clubId);
  const awayId = numeric(awayClub?.clubId);
  if (teamIds && !(teamId !== null ? teamIds.includes(teamId) : [homeId, awayId].some((id) => id !== null && teamIds.includes(id)))) {
    return false;
  }

  const competitionIds = activeList(filters.competitionIds);
  const competitionId = stringValue(metadata.competitionId ?? record.competitionId);
  if (competitionIds && (competitionId === null || !competitionIds.includes(competitionId))) return false;

  const season = numeric(metadata.season) ?? parseSeason(record.season);
  if (filters.seasonFrom !== null && (season === null || season < filters.seasonFrom)) return false;
  if (filters.seasonTo !== null && (season === null || season > filters.seasonTo)) return false;
  return true;
}

export function hasActiveFilters(filters: GameFilterParams): boolean {
  return activeList(filters.teamIds) !== null
    || activeList(filters.competitionIds) !== null
    || filters.seasonFrom !== null
    || filters.seasonTo !== null;
}

/** Counts active dimensions, not the number of selected values. */
export function countActiveFilters(filters: GameFilterParams): number {
  return Number(activeList(filters.teamIds) !== null)
    + Number(activeList(filters.competitionIds) !== null)
    + Number(filters.seasonFrom !== null || filters.seasonTo !== null);
}

function activeList<T>(values: T[] | null): T[] | null {
  return values && values.length > 0 ? values : null;
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseSeason(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})/.exec(value);
  return match ? Number(match[1]) : null;
}
