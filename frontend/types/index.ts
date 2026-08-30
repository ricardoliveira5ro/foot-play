/**
 * Shared domain types for FootPlay.
 * Shapes mirror the REST API contract (see docs/v0.1/dev-4-frontend-shell.md).
 */

export interface Club {
  id: number;
  name: string;
}

/** Position on the tactic board, in percentages (0-100). */
export interface PositionCoords {
  /** 0 = left touchline, 100 = right touchline. */
  x: number;
  /** 0 = opponent goal (top), 100 = own goal (bottom). */
  y: number;
}

/** One starting-XI entry, as returned by the lineup endpoints. */
export interface LineupPlayer {
  /**
   * Opaque per-game token identifying the player behind this shirt.
   * Replaces the stable DB `playerId` in lineup payloads so a correct guess
   * in one game cannot be reused to cheat in another.
   */
  token: string;
  /** Normalized length of the player's name (no spaces/diacritics). */
  nameLength: number;
  shirtNumber: number | null;
  /** Position code, e.g. 'GK' | 'CB' | 'LB' | 'CM' | 'ST'. */
  position: string | null;
  coords: PositionCoords;
}

export interface Match {
  id: number;
  /** ISO date, 'YYYY-MM-DD'. */
  date: string | null;
  /** e.g. '2022/23'. */
  season: string | null;
  competition: string | null;
  homeClub: Club | null;
  awayClub: Club | null;
  homeScore: number;
  awayScore: number;
  /** e.g. '4-3-3'. */
  homeFormation: string | null;
  awayFormation: string | null;
}

/** Response shape for GET /api/matches/random and GET /api/matches/:id. */
export interface MatchResponse {
  match: Match;
  homeLineup: LineupPlayer[];
  awayLineup: LineupPlayer[];
}

/** One entry of GET /api/players?name=<query>. */
export interface PlayerSearchResult {
  id: number;
  name: string;
}

/** GET /api/players?name=<query> returns a bare array of results. */
export type PlayerSearchResponse = PlayerSearchResult[];

/**
 * Visual state of a shirt on the tactic board.
 * Exactly four values — do not extend without updating Shirt.tsx.
 */
export type ShirtState = 'default' | 'in-progress' | 'correct' | 'failed';

/** Which team's lineup is being played. */
export type TeamSide = 'home' | 'away';

/** A lineup entry plus its current game state, ready for the TacticBoard. */
export interface ShirtData extends LineupPlayer {
  state: ShirtState;
  /** Guess history for shirt preview (optional — only available when game is active) */
  guessHistory?: GuessResult[][];
  /** Player name — only set once the shirt is guessed correctly. */
  name?: string;
}

/** Per-letter feedback for a single guess. */
export interface GuessResult {
  letter: string;
  result: 'CORRECT' | 'PRESENT' | 'ABSENT';
}

/** POST /api/guess response — server-side wordle evaluation. */
export interface GuessResponse {
  results: GuessResult[];
  isCorrect: boolean;
  /** Only present when isCorrect is true. */
  name?: string;
}

/** One entry of POST /api/reveal. */
export interface RevealPlayer {
  playerId: number;
  name: string;
  shirtNumber: number | null;
}

/** POST /api/reveal response — all player names for game completion. */
export interface RevealResponse {
  players: RevealPlayer[];
}
