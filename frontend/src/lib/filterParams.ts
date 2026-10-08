import type { GameFilterParams } from '../../types';

const FILTER_KEYS = [
  'teamIds',
  'competitionIds',
  'seasonFrom',
  'seasonTo',
] as const;

// The four URL keys owned by the filter set. Additive export for the
// delete-then-merge in FilterUrlSync; derived from FILTER_KEYS so the two
// can never drift.
export const FILTER_PARAM_KEYS: readonly string[] = Object.freeze([...FILTER_KEYS]);

// Keys from removed dimensions. FilterUrlSync deletes these from the URL on
// every canonical write so bookmarks predating the removal converge to the
// current contract instead of being preserved as unknown params.
export const LEGACY_FILTER_KEYS: readonly string[] = Object.freeze(['opponentIds']);

const COMPETITION_ID = /^[A-Za-z0-9_-]{1,32}$/;

export function paramsToFilters(params: URLSearchParams): GameFilterParams {
  return {
    teamIds: parseIdList(params.get('teamIds')),
    competitionIds: parseStringList(params.get('competitionIds')),
    seasonFrom: parseSeason(params.get('seasonFrom')),
    seasonTo: parseSeason(params.get('seasonTo')),
  };
}

export function filtersToParams(filters: GameFilterParams): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.teamIds?.length) params.set('teamIds', filters.teamIds.join(','));
  if (filters.competitionIds?.length) params.set('competitionIds', filters.competitionIds.join(','));
  if (filters.seasonFrom !== null) params.set('seasonFrom', String(filters.seasonFrom));
  if (filters.seasonTo !== null) params.set('seasonTo', String(filters.seasonTo));
  return params;
}

export function isValidGameFilters(value: unknown): value is GameFilterParams {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const filters = value as Record<string, unknown>;
  if (Object.keys(filters).sort((a, b) => a.localeCompare(b)).join(',') !== [...FILTER_KEYS].sort((a, b) => a.localeCompare(b)).join(',')) return false;
  return validIdArray(filters.teamIds)
    && validCompetitionArray(filters.competitionIds)
    && validSeason(filters.seasonFrom)
    && validSeason(filters.seasonTo);
}

function parseIdList(raw: string | null): number[] | null {
  if (raw === null) return null;
  const ids = new Set<number>();
  for (const part of raw.split(',')) {
    const token = part.trim();
    if (!/^\d+$/.test(token)) continue;
    const id = Number(token);
    if (Number.isSafeInteger(id) && id > 0) ids.add(id);
  }
  return ids.size ? [...ids] : null;
}

function parseStringList(raw: string | null): string[] | null {
  if (raw === null) return null;
  const values = new Set<string>();
  for (const part of raw.split(',')) {
    const value = part.trim();
    if (COMPETITION_ID.test(value)) values.add(value);
  }
  return values.size ? [...values] : null;
}

function parseSeason(raw: string | null): number | null {
  if (raw === null || !/^-?\d+$/.test(raw.trim())) return null;
  const season = Number(raw);
  return Number.isInteger(season) && season >= 2013 && season <= 2025 ? season : null;
}

function validIdArray(value: unknown): boolean {
  return value === null || (Array.isArray(value)
    && value.every((item) => Number.isSafeInteger(item) && (item as number) > 0));
}

function validCompetitionArray(value: unknown): boolean {
  return value === null || (Array.isArray(value)
    && value.every((item) => typeof item === 'string' && COMPETITION_ID.test(item)));
}

function validSeason(value: unknown): boolean {
  return value === null || (Number.isInteger(value) && (value as number) >= 2013 && (value as number) <= 2025);
}
