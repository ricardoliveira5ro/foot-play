/**
 * Curated club/nation dataset ids for the Missing Eleven mini-game.
 *
 * Mirrors `scripts/curated-teams.json` (both `clubIds` and `nationalTeamIds`).
 * The DB is seeded so every match has at least one curated team; the opponent
 * can be any team. `pickSide` uses this set to always display a curated team.
 */
export const CURATED_TEAM_IDS: Set<number> = new Set<number>([
  // Clubs
  294, // SL Benfica
  336, // Sporting CP
  720, // FC Porto
  418, // Real Madrid
  13, // Atlético de Madrid
  131, // FC Barcelona
  583, // Paris Saint-Germain
  27, // Bayern Munich
  148, // Tottenham Hotspur
  631, // Chelsea FC
  31, // Liverpool FC
  11, // Arsenal FC
  281, // Manchester City
  985, // Manchester United
  506, // Juventus FC
  5, // AC Milan
  46, // Inter Milan
  // National teams
  3300, // Portugal
  3375, // Spain
  3377, // France
  3262, // Germany
  3299, // England
  3376, // Italy
  3437, // Argentina
  3439, // Brazil
]);
