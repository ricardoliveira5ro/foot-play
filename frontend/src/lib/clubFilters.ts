/**
 * Pure helpers for the Team / Opponent club lists (v1.1.3).
 *
 * No React, no fetching, no arithmetic over counts: every number here comes
 * straight from the server's grouped option response (v1.1.1).
 */

/**
 * One count-bearing entry from `FilterOptionsResponse.teams` / `.opponents`.
 * `name` is optional because a count entry may not resolve against the name
 * map; `TeamOption` is assignable to this shape.
 */
export type FilterOptionGroup = { id: number; name?: string; isNationalTeam: boolean; count: number };

export interface ClubOption {
  id: number;
  name: string;
  isNationalTeam: boolean;
  count: number;
}

/**
 * Joins server counts to resolved names. Options whose name cannot be
 * resolved are kept with a visible fallback label — never dropped, since a
 * hidden option is one the user cannot select (or escape) — and an empty
 * label would be unusable with a screen reader.
 */
export function toClubOptions(groups: FilterOptionGroup[], names: ReadonlyMap<number, string>): ClubOption[] {
  return groups.map((g) => ({
    id: g.id,
    name: names.get(g.id) || g.name || `Club ${g.id}`,
    isNationalTeam: g.isNationalTeam,
    count: g.count,
  }));
}

/** Splits options into clubs and national teams, preserving input order. */
export function groupClubOptions(options: ClubOption[]): { clubs: ClubOption[]; nationalTeams: ClubOption[] } {
  const clubs: ClubOption[] = [];
  const nationalTeams: ClubOption[] = [];
  for (const option of options) {
    (option.isNationalTeam ? nationalTeams : clubs).push(option);
  }
  return { clubs, nationalTeams };
}

/**
 * Case- and diacritic-insensitive substring search, so "medellin" finds
 * "Independiente Medellín". An empty or whitespace-only query returns the
 * input array unchanged (the result is only read, so no copy is needed).
 */
export function filterClubOptions(options: ClubOption[], query: string): ClubOption[] {
  const needle = normalize(query.trim());
  if (!needle) return options;
  return options.filter((option) => normalize(option.name).includes(needle));
}

/**
 * Toggles an id in a selection list. Returns `null` instead of an empty
 * array so "no teams selected" serialises to an absent URL key rather than
 * `?teamIds=`.
 */
export function toggleId(list: number[] | null, id: number): number[] | null {
  const current = list ?? [];
  const next = current.includes(id)
    ? current.filter((value) => value !== id)
    : [...new Set([...current, id])];
  return next.length ? next : null;
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}
