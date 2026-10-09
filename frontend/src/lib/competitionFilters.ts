/**
 * Pure helpers for the Competition and Season dimensions (v1.1.4).
 *
 * No React, no fetching, no arithmetic over counts: every number here comes
 * straight from the server's grouped option response (v1.1.1).
 */

export interface CompetitionOption {
  id: string;
  name: string;
  count: number;
}

/**
 * Joins server counts to resolved names. Options whose name cannot be
 * resolved are kept with a visible fallback label — never dropped, since a
 * hidden option is one the user cannot select (or escape).
 */
export function toCompetitionOptions(
  groups: { id: string; count: number }[],
  names: ReadonlyMap<string, string>,
): CompetitionOption[] {
  return groups.map((group) => ({
    id: group.id,
    name: names.get(group.id) || `Competition ${group.id}`,
    count: group.count,
  }));
}

/**
 * Toggles a competition id in a selection list. Returns `null` instead of an
 * empty array so "no competitions selected" serialises to an absent URL key
 * rather than `?competitionIds=`.
 */
export function toggleCompetition(list: string[] | null, id: string): string[] | null {
  const current = list ?? [];
  const next = current.includes(id)
    ? current.filter((value) => value !== id)
    : [...new Set([...current, id])];
  return next.length ? next : null;
}

export const SEASON_MIN = 2013;
export const SEASON_MAX = 2025;

/**
 * Clamps a season bound to the supported domain, returning `null` when the
 * value is out of range or not an integer. Matching v1.1.1's `paramsToFilters`
 * coercion is deliberate: the URL and the control must agree about what an
 * out-of-range value such as 1999 means (no bound, not 1999).
 */
export function clampSeason(value: number | null): number | null {
  if (value === null || !Number.isInteger(value)) return null;
  return value < SEASON_MIN || value > SEASON_MAX ? null : value;
}

/**
 * Makes a season range non-inverted, given which bound the user just moved.
 *
 * The two directions of the correction depend on which bound moved, so the
 * caller passes `moved` rather than relying on this helper to guess: raising
 * `from` past `to` pushes `to` up; lowering `to` below `from` pushes `from`
 * down. With the default `'from'` anchor it never returns an inverted range.
 */
export function normaliseSeasonRange(
  from: number | null,
  to: number | null,
  moved: 'from' | 'to' = 'from',
): { from: number | null; to: number | null } {
  if (from === null || to === null) return { from, to };
  if (moved === 'from' && from > to) return { from, to: from };
  if (moved === 'to' && to < from) return { from: to, to };
  return { from, to };
}
