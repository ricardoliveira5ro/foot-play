import type { MatchResponse, PlayerSearchResult } from '@/types';
import MOCK_MATCHES from './mockData';

/**
 * API client for the FootPlay backend.
 *
 * While the backend is not wired up, USE_MOCK stays true and every function
 * resolves from the static mock dataset (with a small artificial delay so
 * loading states are exercised). Set NEXT_PUBLIC_USE_MOCK_API=false to hit
 * the real API at NEXT_PUBLIC_API_URL.
 */

export const USE_MOCK = (process.env.NEXT_PUBLIC_USE_MOCK_API ?? 'true') !== 'false';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const MOCK_DELAY_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function requestJson<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Network error calling ${path}: ${reason}`);
  }
  if (!response.ok) {
    throw new Error(`API request failed: ${path} responded ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

/** GET /api/matches/random — a random match with both full lineups. */
export async function fetchRandomMatch(): Promise<MatchResponse> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY_MS);
    return MOCK_MATCHES[Math.floor(Math.random() * MOCK_MATCHES.length)];
  }
  return requestJson<MatchResponse>('/api/matches/random');
}

/** GET /api/matches/:id — a specific match with both full lineups. */
export async function fetchMatchById(id: number): Promise<MatchResponse> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY_MS);
    const found = MOCK_MATCHES.find((entry) => entry.match.id === id);
    if (!found) {
      throw new Error(`Match ${id} not found in mock dataset`);
    }
    return found;
  }
  return requestJson<MatchResponse>(`/api/matches/${id}`);
}

/** GET /api/players?name=<query> — player search for guess autocompletion. */
export async function searchPlayers(query: string): Promise<PlayerSearchResult[]> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY_MS);
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return [];
    }
    const byId = new Map<number, PlayerSearchResult>();
    for (const entry of MOCK_MATCHES) {
      for (const player of [...entry.homeLineup, ...entry.awayLineup]) {
        if (!byId.has(player.playerId) && player.displayName.toLowerCase().includes(needle)) {
          byId.set(player.playerId, { id: player.playerId, name: player.displayName });
        }
      }
    }
    return [...byId.values()];
  }
  return requestJson<PlayerSearchResult[]>(`/api/players?name=${encodeURIComponent(query)}`);
}
