/**
 * Daily selection, mirrored from frontend/src/lib/daily.ts.
 * See that file and backend/src/lib/dailyKey.ts for why the duplication
 * exists and how it is pinned. No Math.random, no Date.now().
 */

export function dailyHash32(key: string): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.codePointAt(index) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectDailyGameId(candidates: number[], key: string): number {
  if (candidates.length === 0) {
    throw new Error('selectDailyGameId requires at least one candidate game id');
  }
  const ordered = [...candidates].sort((a, b) => a - b);
  return ordered[dailyHash32(key) % ordered.length];
}
