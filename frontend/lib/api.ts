import type {
  FilterOptionsResponse,
  GameFilterParams,
  GameResponse,
  PlayerSearchResult,
  GuessResponse,
  RevealResponse,
  RevealOneResponse,
  TeamSide,
} from '@/types';
import MOCK_MATCHES, {
  getMockFilterOptions,
  getMockRandomMatch,
  searchMockPlayers,
} from './mockData';
import { evaluateGuess } from '@/lib/wordle';
import { EMPTY_FILTERS } from '@/types';
import { filtersToParams } from '@/lib/filterParams';

/**
 * API client for the FootPlay backend.
 *
 * Defaults to real API. Set NEXT_PUBLIC_USE_MOCK_API=true to use mock data
 * for local development without a running backend.
 */

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_API === 'true';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

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

function querySuffix(filters: GameFilterParams): string {
  const query = filtersToParams(filters).toString();
  return query ? `?${query}` : '';
}

async function requestRandomMatch(path: string): Promise<GameResponse | null> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Network error calling ${path}: ${reason}`);
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`API request failed: ${path} responded ${response.status} ${response.statusText}`);
  }
  const body = await response.text();
  return body.trim() ? JSON.parse(body) as GameResponse : null;
}

function isFilterOptionsResponse(value: unknown): value is FilterOptionsResponse {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Partial<FilterOptionsResponse>;
  const isCount = (count: unknown) => typeof count === 'number' && Number.isFinite(count);
  return Array.isArray(result.teams)
    && result.teams.every((option) => typeof option.id === 'number'
      && typeof option.name === 'string'
      && typeof option.isNationalTeam === 'boolean'
      && isCount(option.count))
    && Array.isArray(result.opponents)
    && result.opponents.every((option) => typeof option.id === 'number'
      && typeof option.name === 'string'
      && typeof option.isNationalTeam === 'boolean'
      && isCount(option.count))
    && Array.isArray(result.competitions)
    && result.competitions.every((option) => typeof option.id === 'string'
      && typeof option.name === 'string'
      && isCount(option.count))
    && Array.isArray(result.seasons)
    && result.seasons.every((option) => Number.isInteger(option.season) && isCount(option.count))
    && isCount(result.total);
}

/** GET /api/matches/random — a random match with both full lineups. */
export async function fetchRandomMatch(filters: GameFilterParams = EMPTY_FILTERS): Promise<GameResponse | null> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY_MS);
    return getMockRandomMatch(filters);
  }
  return requestRandomMatch(`/api/matches/random${querySuffix(filters)}`);
}

/** GET /api/matches/filter-options — counts and selectable filter options. */
export async function fetchFilterOptions(filters: GameFilterParams = EMPTY_FILTERS): Promise<FilterOptionsResponse> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY_MS);
    return getMockFilterOptions(filters);
  }
  const path = `/api/matches/filter-options${querySuffix(filters)}`;
  const response = await requestJson<unknown>(path);
  if (!isFilterOptionsResponse(response)) {
    throw new Error(`API request returned invalid filter options: ${path}`);
  }
  return response;
}

/** GET /api/matches/:id — a specific match with both full lineups. */
export async function fetchMatchById(id: number): Promise<GameResponse> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY_MS);
    const found = MOCK_MATCHES.find((entry) => entry.game.gameId === id);
    if (!found) {
      throw new Error(`Match ${id} not found in mock dataset`);
    }
    return found;
  }
  return requestJson<GameResponse>(`/api/matches/${id}`);
}

/** GET /api/players?name=<query> — player search for guess autocompletion. */
export async function searchPlayers(query: string): Promise<PlayerSearchResult[]> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY_MS);
    return searchMockPlayers(query);
  }
  return requestJson<PlayerSearchResult[]>(`/api/players?name=${encodeURIComponent(query)}`);
}

/** POST /api/guess — server-side wordle evaluation. */
export async function submitGuess(gameId: number, token: string, guess: string): Promise<GuessResponse> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY_MS);
    // Find the player by its opaque token in mock data and evaluate locally.
    for (const entry of MOCK_MATCHES) {
      if (entry.game.gameId !== gameId) continue;
      const player = [...entry.homeLineup, ...entry.awayLineup].find((p) => p.token === token);
      if (!player) {
        throw new Error(`Token not found in mock dataset for game ${gameId}`);
      }
      const results = evaluateGuess(guess, player.displayName);
      const isCorrect = results.every((r) => r.result === 'CORRECT');
      return { results, isCorrect, name: isCorrect ? player.displayName : undefined };
    }
    throw new Error(`Match ${gameId} not found in mock dataset`);
  }
  const response = await fetch(`${API_BASE_URL}/api/guess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, token, guess }),
  });
  if (!response.ok) {
    throw new Error(`API request failed: /api/guess responded ${response.status}`);
  }
  return (await response.json()) as GuessResponse;
}

/** POST /api/guess/reveal — get all player names for game completion. */
export async function fetchReveal(gameId: number, teamSide: TeamSide): Promise<RevealResponse> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY_MS);
    const entry = MOCK_MATCHES.find((e) => e.game.gameId === gameId);
    if (!entry) {
      throw new Error(`Match ${gameId} not found in mock dataset`);
    }
    const lineup = teamSide === 'home' ? entry.homeLineup : entry.awayLineup;
    const players = lineup.map((p) => ({
      playerId: p.playerId,
      name: p.displayName,
      shirtNumber: p.shirtNumber,
    }));
    return { players };
  }
  const response = await fetch(`${API_BASE_URL}/api/guess/reveal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, teamSide }),
  });
  if (!response.ok) {
    throw new Error(`API request failed: /api/guess/reveal responded ${response.status}`);
  }
  return (await response.json()) as RevealResponse;
}

/** POST /api/guess/reveal-one — get a single player's name by token (anti-cheat safe). */
export async function revealOnePlayer(gameId: number, token: string): Promise<RevealOneResponse> {
  if (USE_MOCK) {
    await delay(MOCK_DELAY_MS);
    // In mock mode, find the player by token across both lineups
    const entry = MOCK_MATCHES.find((e) => e.game.gameId === gameId);
    if (!entry) throw new Error(`Match ${gameId} not found in mock dataset`);
    const all = [...entry.homeLineup, ...entry.awayLineup];
    const player = all.find((p) => p.token === token);
    if (!player) throw new Error('Player not found');
    return { name: player.displayName };
  }
  const response = await fetch(`${API_BASE_URL}/api/guess/reveal-one`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, token }),
  });
  if (!response.ok) {
    throw new Error(`API request failed: /api/guess/reveal-one responded ${response.status}`);
  }
  return (await response.json()) as RevealOneResponse;
}
