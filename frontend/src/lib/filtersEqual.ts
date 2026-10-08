import type { GameFilterParams } from '../../types';

const sameIds = (a: number[] | null, b: number[] | null): boolean => {
  if (a === null || b === null) return a === b;
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
};

const sameStrings = (a: string[] | null, b: string[] | null): boolean => {
  if (a === null || b === null) return a === b;
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x.localeCompare(y));
  const sb = [...b].sort((x, y) => x.localeCompare(y));
  return sa.every((v, i) => v === sb[i]);
};

export function filtersEqual(a: GameFilterParams, b: GameFilterParams): boolean {
  return sameIds(a.teamIds, b.teamIds)
    && sameStrings(a.competitionIds, b.competitionIds)
    && a.seasonFrom === b.seasonFrom
    && a.seasonTo === b.seasonTo;
}
