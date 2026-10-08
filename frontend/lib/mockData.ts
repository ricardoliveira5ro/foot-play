import type {
  FilterOptionsResponse,
  Game,
  GameFilterParams,
  LineupPlayer,
  PlayerSearchResult,
  PositionCoords,
} from '@/types';
import { normalize, getWordBoundaries } from '@/lib/wordle';
import { matchesGameFilters } from '@/lib/filters';

/**
 * Static mock dataset mimicking the Dev 3 API responses exactly.
 * Used by lib/api.ts while the real backend is not wired up.
 *
 * Coordinates are percentages on a vertical tactic board:
 * x: 0 (left touchline) → 100 (right touchline)
 * y: 0 (opponent goal, top) → 100 (own goal, bottom)
 *
 * NOTE: lineup entries expose `token` (opaque, deterministic per game+player)
 * exactly like the real API. The internal `playerId` and `displayName` fields
 * are mock-only: `playerId` is used for search dedup and token derivation,
 * `displayName` lets the mock path evaluate guesses locally. The real API
 * never sends either — it only sends `token` and `nameLength`.
 */

/** Raw mock entry before derived fields (token, nameLength) are added. */
type MockRawPlayer = {
  /** Internal: stable DB id — mock search dedup + token derivation only. */
  playerId: number;
  /** Internal: full display name — local guess evaluation only. */
  displayName: string;
  shirtNumber: number | null;
  position: string | null;
  coords: PositionCoords;
};

/** A lineup entry as the mock dataset exposes it: LineupPlayer + internal fields. */
export interface MockLineupPlayer extends LineupPlayer {
  /** Internal: stable DB id — mock search dedup + token derivation only. */
  playerId: number;
  /** Internal: full display name — local guess evaluation only. */
  displayName: string;
  /** Resolved-name fallback kept for parity with nullable backend displayName. */
  name?: string | null;
}

/** Mock dataset entry: same shape as GameResponse, with internal fields on lineups. */
export interface MockMatchResponse {
  game: Game;
  homeLineup: MockLineupPlayer[];
  awayLineup: MockLineupPlayer[];
}

interface MockFilterMetadata {
  teamId: number;
  opponentId: number;
  competitionId: string;
  season: number;
}

const MOCK_FILTER_METADATA: Record<number, MockFilterMetadata> = {
  1: { teamId: 281, opponentId: 985, competitionId: 'PL', season: 2022 },
  2: { teamId: 131, opponentId: 418, competitionId: 'LL', season: 2010 },
};

const MOCK_CLUBS = [
  { id: 131, name: 'FC Barcelona', isNationalTeam: false },
  { id: 281, name: 'Manchester City', isNationalTeam: false },
  { id: 985, name: 'Manchester United', isNationalTeam: false },
  { id: 418, name: 'Real Madrid', isNationalTeam: false },
];
const MOCK_COMPETITIONS = [
  { id: 'LL', name: 'La Liga' },
  { id: 'PL', name: 'Premier League' },
];

function withMockFilterMetadata(match: MockMatchResponse) {
  return { ...match, filterMetadata: MOCK_FILTER_METADATA[match.game.gameId] };
}

function matchingMockGames(filters: GameFilterParams): MockMatchResponse[] {
  return MOCK_MATCHES.filter((match) =>
    matchesGameFilters(filters, withMockFilterMetadata(match)),
  );
}

/** Mock parity for backend Task 5: counts use the same facet-exclusion rule. */
export function getMockFilterOptions(filters: GameFilterParams): FilterOptionsResponse {
  const teams = MOCK_CLUBS.map((club) => ({
    ...club,
    count: matchingMockGames({ ...filters, teamIds: [club.id] }).length,
  }));
  const competitions = MOCK_COMPETITIONS.map((competition) => ({
    ...competition,
    count: matchingMockGames({ ...filters, competitionIds: [competition.id] }).length,
  }));
  const seasons = [...new Set(Object.values(MOCK_FILTER_METADATA)
    .map(({ season }) => season)
    .filter((season) => season >= 2013 && season <= 2025))]
    .sort((a, b) => a - b)
    .map((season) => ({
      season,
      count: matchingMockGames({ ...filters, seasonFrom: season, seasonTo: season }).length,
    }));

  return {
    teams,
    competitions,
    seasons,
    total: matchingMockGames(filters).length,
  };
}

/** Mock parity for backend Task 6: only return a game that satisfies its filters. */
export function getMockRandomMatch(filters: GameFilterParams): MockMatchResponse | null {
  const matches = matchingMockGames(filters);
  return matches.length > 0 ? matches[Math.floor(Math.random() * matches.length)] : null;
}

/** Mock parity for backend Task 7: search and display the resolved player name. */
export function searchMockPlayers(query: string): PlayerSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const byId = new Map<number, PlayerSearchResult>();
  for (const match of MOCK_MATCHES) {
    for (const player of [...match.homeLineup, ...match.awayLineup]) {
      const resolvedName = player.displayName ?? player.name;
      if (resolvedName && !byId.has(player.playerId) && resolvedName.toLowerCase().includes(needle)) {
        byId.set(player.playerId, { id: player.playerId, name: resolvedName });
      }
    }
  }
  return [...byId.values()];
}

/**
 * Deterministic, URL-safe mock token derived from (gameId, playerId).
 * Mirrors the backend's opaque per-game token semantics without needing the
 * server secret: same (game, player) always yields the same token, and the
 * same player in different games yields different tokens.
 */
function mockToken(gameId: number, playerId: number): string {
  let hash = 2166136261; // FNV-1a offset basis
  const input = `${gameId}:${playerId}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `t${(hash >>> 0).toString(36)}`;
}

/**
 * Deterministic event columns so the v1.0.3 shirt badges are visible when
 * running against the mock dataset. In production these come from
 * GET /api/matches/* (v1.0.2) and are seeded from game_events.csv (v1.0.1).
 */
function mockEvents(playerId: number): Pick<MockLineupPlayer, 'goals' | 'assists' | 'redCards' | 'isCaptain'> {
  return {
    goals: playerId % 4 === 0 ? 1 : 0,
    assists: playerId % 7 === 0 ? 1 : 0,
    redCards: playerId % 11 === 0 ? 1 : 0,
    isCaptain: playerId % 9 === 0,
  };
}

function buildLineup(gameId: number, players: MockRawPlayer[]): MockLineupPlayer[] {
  return players.map((p) => ({
    ...p,
    nameLength: normalize(p.displayName).length,
    wordBoundaries: getWordBoundaries(p.displayName),
    token: mockToken(gameId, p.playerId),
    ...mockEvents(p.playerId),
  }));
}

const MOCK_MATCHES: MockMatchResponse[] = [
  {
    game: {
      gameId: 1,
      date: '2022-10-02',
      season: '2022/23',
      competition: 'Premier League',
      homeClub: { clubId: 281, name: 'Manchester City' },
      awayClub: { clubId: 985, name: 'Manchester United' },
      homeScore: 6,
      awayScore: 3,
      homeFormation: '4-3-3',
      awayFormation: '4-2-3-1',
    },
    homeLineup: buildLineup(1, [
      { playerId: 101, displayName: 'Ederson', shirtNumber: 31, position: 'GK', coords: { x: 50, y: 90 } },
      { playerId: 102, displayName: 'John Stones', shirtNumber: 5, position: 'RB', coords: { x: 90, y: 62 } },
      { playerId: 103, displayName: 'Rúben Dias', shirtNumber: 3, position: 'CB', coords: { x: 68, y: 70 } },
      { playerId: 104, displayName: 'Manuel Akanji', shirtNumber: 25, position: 'CB', coords: { x: 32, y: 70 } },
      { playerId: 105, displayName: 'João Cancelo', shirtNumber: 7, position: 'LB', coords: { x: 10, y: 62 } },
      { playerId: 106, displayName: 'Rodri', shirtNumber: 16, position: 'DM', coords: { x: 50, y: 48 } },
      { playerId: 107, displayName: 'İlkay Gündoğan', shirtNumber: 8, position: 'CM', coords: { x: 28, y: 42 } },
      { playerId: 108, displayName: 'Kevin De Bruyne', shirtNumber: 17, position: 'CM', coords: { x: 72, y: 42 } },
      { playerId: 109, displayName: 'Bernardo Silva', shirtNumber: 20, position: 'LW', coords: { x: 16, y: 24 } },
      { playerId: 110, displayName: 'Erling Haaland', shirtNumber: 9, position: 'ST', coords: { x: 50, y: 14 } },
      { playerId: 111, displayName: 'Phil Foden', shirtNumber: 47, position: 'RW', coords: { x: 84, y: 24 } },
    ]),
    awayLineup: buildLineup(1, [
      { playerId: 201, displayName: 'David de Gea', shirtNumber: 1, position: 'GK', coords: { x: 50, y: 90 } },
      { playerId: 202, displayName: 'Diogo Dalot', shirtNumber: 20, position: 'RB', coords: { x: 88, y: 62 } },
      { playerId: 203, displayName: 'Raphaël Varane', shirtNumber: 19, position: 'CB', coords: { x: 66, y: 70 } },
      { playerId: 204, displayName: 'Lisandro Martínez', shirtNumber: 6, position: 'CB', coords: { x: 34, y: 70 } },
      { playerId: 205, displayName: 'Luke Shaw', shirtNumber: 23, position: 'LB', coords: { x: 12, y: 62 } },
      { playerId: 206, displayName: 'Casemiro', shirtNumber: 18, position: 'DM', coords: { x: 62, y: 48 } },
      { playerId: 207, displayName: 'Christian Eriksen', shirtNumber: 14, position: 'DM', coords: { x: 38, y: 48 } },
      { playerId: 208, displayName: 'Antony', shirtNumber: 21, position: 'RW', coords: { x: 82, y: 30 } },
      { playerId: 209, displayName: 'Bruno Fernandes', shirtNumber: 8, position: 'CAM', coords: { x: 50, y: 30 } },
      { playerId: 210, displayName: 'Marcus Rashford', shirtNumber: 10, position: 'LW', coords: { x: 18, y: 30 } },
      { playerId: 211, displayName: 'Anthony Martial', shirtNumber: 9, position: 'ST', coords: { x: 50, y: 14 } },
    ]),
  },
  {
    game: {
      gameId: 2,
      date: '2010-11-29',
      season: '2010/11',
      competition: 'La Liga',
      homeClub: { clubId: 131, name: 'FC Barcelona' },
      awayClub: { clubId: 418, name: 'Real Madrid' },
      homeScore: 5,
      awayScore: 0,
      homeFormation: '4-3-3',
      awayFormation: '4-2-3-1',
    },
    homeLineup: buildLineup(2, [
      { playerId: 301, displayName: 'Victor Valdés', shirtNumber: 1, position: 'GK', coords: { x: 50, y: 90 } },
      { playerId: 302, displayName: 'Dani Alves', shirtNumber: 2, position: 'RB', coords: { x: 90, y: 62 } },
      { playerId: 303, displayName: 'Gerard Piqué', shirtNumber: 3, position: 'CB', coords: { x: 68, y: 70 } },
      { playerId: 304, displayName: 'Carles Puyol', shirtNumber: 5, position: 'CB', coords: { x: 32, y: 70 } },
      { playerId: 305, displayName: 'Éric Abidal', shirtNumber: 22, position: 'LB', coords: { x: 10, y: 62 } },
      { playerId: 306, displayName: 'Sergio Busquets', shirtNumber: 16, position: 'DM', coords: { x: 50, y: 48 } },
      { playerId: 307, displayName: 'Xavi', shirtNumber: 6, position: 'CM', coords: { x: 28, y: 42 } },
      { playerId: 308, displayName: 'Andrés Iniesta', shirtNumber: 8, position: 'CM', coords: { x: 72, y: 42 } },
      { playerId: 309, displayName: 'Pedro', shirtNumber: 17, position: 'RW', coords: { x: 84, y: 24 } },
      { playerId: 310, displayName: 'Lionel Messi', shirtNumber: 10, position: 'ST', coords: { x: 50, y: 14 } },
      { playerId: 311, displayName: 'David Villa', shirtNumber: 7, position: 'LW', coords: { x: 16, y: 24 } },
    ]),
    awayLineup: buildLineup(2, [
      { playerId: 401, displayName: 'Iker Casillas', shirtNumber: 1, position: 'GK', coords: { x: 50, y: 90 } },
      { playerId: 402, displayName: 'Sergio Ramos', shirtNumber: 4, position: 'RB', coords: { x: 88, y: 62 } },
      { playerId: 403, displayName: 'Pepe', shirtNumber: 3, position: 'CB', coords: { x: 66, y: 70 } },
      { playerId: 404, displayName: 'Ricardo Carvalho', shirtNumber: 2, position: 'CB', coords: { x: 34, y: 70 } },
      { playerId: 405, displayName: 'Marcelo', shirtNumber: 12, position: 'LB', coords: { x: 12, y: 62 } },
      { playerId: 406, displayName: 'Sami Khedira', shirtNumber: 24, position: 'DM', coords: { x: 38, y: 48 } },
      { playerId: 407, displayName: 'Xabi Alonso', shirtNumber: 14, position: 'DM', coords: { x: 62, y: 48 } },
      { playerId: 408, displayName: 'Ángel Di María', shirtNumber: 22, position: 'RW', coords: { x: 82, y: 30 } },
      { playerId: 409, displayName: 'Mesut Özil', shirtNumber: 23, position: 'CAM', coords: { x: 50, y: 30 } },
      { playerId: 410, displayName: 'Cristiano Ronaldo', shirtNumber: 7, position: 'LW', coords: { x: 18, y: 30 } },
      { playerId: 411, displayName: 'Karim Benzema', shirtNumber: 9, position: 'ST', coords: { x: 50, y: 14 } },
    ]),
  },
];

export const MOCK_FILTER_OPTIONS: FilterOptionsResponse = getMockFilterOptions({
  teamIds: null,
  competitionIds: null,
  seasonFrom: null,
  seasonTo: null,
});

export default MOCK_MATCHES;
