/**
 * Day-key validation, mirrored from frontend/src/lib/daily.ts.
 *
 * This is a deliberate cross-boundary duplicate. The backend must not import
 * from frontend/ (same precedent as v1.1.1's GameFilters re-declaration in
 * backend/src/lib/filterQuery.ts), there is no shared package, and the frozen
 * contract puts the selection function on the client while the endpoint
 * returns an already-resolved GameResponse.
 *
 * The two copies are pinned to identical expectations by the fixture tables
 * in the frontend and backend test suites: any change to one implementation
 * fails its own suite. TIMEZONE: UTC, matching matchService.ts:56.
 */

const DAILY_KEY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

export function toDailyKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isDailyKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DAILY_KEY_SHAPE.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1000) return false;
  return toDailyKey(new Date(Date.UTC(year, month - 1, day))) === value;
}
