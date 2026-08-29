import type { MatchResponse, PlayerSearchResult, GuessResponse, RevealResponse, TeamSide } from '@/types';
import MOCK_MATCHES from './mockData';
import { evaluateGuess } from '@/lib/wordle';

/**
 * API client for the FootPlay backend.
 *
 * Defaults to real API. Set NEXT_PUBLIC_USE_MOCK_API=true to use mock data
 * for local development without a running backend.
 */

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_API === 'true';

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
        const displayName = (player as unknown as { displayName?: string }).displayName;
        if (displayName && !byId.has(player.playerId) && displayName.toLowerCase().includes(needle)) {
          byId.set(player.playerId, { id: player.playerId, name: displayName });
        }
      }
    }
    return [...byId.values()];
  }
  return requestJson<PlayerSearchResult[]>(`/api/players?name=${encodeURIComponent(query)}`);
}

/** POST /api/guess — server-side wordle evaluation. */
export async function submitGuess(gameId: number, playerId: number, guess: string): Promise<GuessResponse> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY_MS);
    // Find the player in mock data and evaluate locally.
    for (const entry of MOCK_MATCHES) {
      if (entry.match.id !== gameId) continue;
      const player = [...entry.homeLineup, ...entry.awayLineup].find((p) => p.playerId === playerId);
      if (!player) {
        throw new Error(`Player ${playerId} not found in mock dataset`);
      }
      const displayName = (player as unknown as { displayName?: string }).displayName;
      if (!displayName) {
        throw new Error(`Mock player ${playerId} has no displayName`);
      }
      const results = evaluateGuess(guess, displayName);
      const isCorrect = results.every((r) => r.result === 'CORRECT');
      return { results, isCorrect, name: isCorrect ? displayName : undefined };
    }
    throw new Error(`Match ${gameId} not found in mock dataset`);
  }
  const response = await fetch(`${API_BASE_URL}/api/guess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, playerId, guess }),
  });
  if (!response.ok) {
    throw new Error(`API request failed: /api/guess responded ${response.status}`);
  }
  return (await response.json()) as GuessResponse;
}

/** POST /api/reveal — get all player names for game completion. */
export async function fetchReveal(matchId: number, teamSide: TeamSide): Promise<RevealResponse> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY_MS);
    const entry = MOCK_MATCHES.find((e) => e.match.id === matchId);
    if (!entry) {
      throw new Error(`Match ${matchId} not found in mock dataset`);
    }
    const lineup = teamSide === 'home' ? entry.homeLineup : entry.awayLineup;
    const players = lineup.map((p) => {
      const displayName = (p as unknown as { displayName?: string }).displayName ?? 'Unknown';
      return { playerId: p.playerId, name: displayName, shirtNumber: p.shirtNumber };
    });
    return { players };
  }
  const response = await fetch(`${API_BASE_URL}/api/reveal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId, teamSide }),
  });
  if (!response.ok) {
    throw new Error(`API request failed: /api/reveal responded ${response.status}`);
  }
  return (await response.json()) as RevealResponse;
}
