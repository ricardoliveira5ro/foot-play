/**
 * Static team color lookup for the Missing Eleven mini-game.
 * Maps club IDs to shirt color/pattern data used for tactical-board rendering.
 */

// --- Types ---

export interface TeamColorEntry {
  /** Hex color for the main shirt fill. */
  primary: string;
  /** Hex color for accents/stripes. */
  secondary: string;
  /** Shirt pattern style. */
  pattern: 'solid' | 'stripes-v' | 'stripes-h' | 'halves';
}

// --- Defaults ---

export const DEFAULT_TEAM_COLORS: TeamColorEntry = {
  primary: '#F8FAF8',
  secondary: '#E2E8F0',
  pattern: 'solid',
};

// --- Team colors map (clubId → colors) ---

const TEAM_COLORS: Record<number, TeamColorEntry> = {
  // La Liga
  131: { primary: '#A50044', secondary: '#004D98', pattern: 'stripes-v' },   // FC Barcelona
  418: { primary: '#FFFFFF', secondary: '#FEBE10', pattern: 'solid' },       // Real Madrid
  13:  { primary: '#CB3524', secondary: '#FFFFFF', pattern: 'stripes-h' },   // Atlético de Madrid

  // Premier League
  31:  { primary: '#C8102E', secondary: '#FFFFFF', pattern: 'solid' },       // Liverpool FC
  281: { primary: '#6CABDD', secondary: '#FFFFFF', pattern: 'solid' },       // Manchester City
  11:  { primary: '#EF0107', secondary: '#FFFFFF', pattern: 'solid' },       // Arsenal FC
  148: { primary: '#132257', secondary: '#FFFFFF', pattern: 'solid' },       // Tottenham Hotspur
  631: { primary: '#034694', secondary: '#DBA111', pattern: 'solid' },       // Chelsea FC
  985: { primary: '#DA291C', secondary: '#FBE122', pattern: 'solid' },       // Manchester United

  // Bundesliga
  27:  { primary: '#DC052D', secondary: '#FFFFFF', pattern: 'solid' },       // Bayern Munich

  // Serie A
  506: { primary: '#000000', secondary: '#FFFFFF', pattern: 'halves' },      // Juventus
  5:   { primary: '#FB090B', secondary: '#000000', pattern: 'stripes-v' },   // AC Milan
  46:  { primary: '#0068A8', secondary: '#000000', pattern: 'stripes-v' },   // Inter Milan

  // Ligue 1
  583: { primary: '#004170', secondary: '#DA291C', pattern: 'solid' },       // Paris Saint-Germain

  // Primeira Liga
  294: { primary: '#FF0000', secondary: '#FFFFFF', pattern: 'solid' },       // SL Benfica
  336: { primary: '#00843D', secondary: '#FFFFFF', pattern: 'stripes-v' },   // Sporting CP
  720: { primary: '#003893', secondary: '#FFFFFF', pattern: 'stripes-h' },   // FC Porto

  // National Teams
  3300: { primary: '#006600', secondary: '#FF0000', pattern: 'solid' },      // Portugal
  3375: { primary: '#AA151B', secondary: '#FABD00', pattern: 'solid' },      // Spain
  3377: { primary: '#002395', secondary: '#FFFFFF', pattern: 'solid' },      // France
  3262: { primary: '#000000', secondary: '#FFFFFF', pattern: 'solid' },      // Germany
  3299: { primary: '#FFFFFF', secondary: '#CF081F', pattern: 'solid' },      // England
  3376: { primary: '#004B87', secondary: '#FFFFFF', pattern: 'solid' },      // Italy
  3437: { primary: '#75AADB', secondary: '#FFFFFF', pattern: 'stripes-v' },  // Argentina
  3439: { primary: '#FFDC00', secondary: '#009B3A', pattern: 'solid' },      // Brazil
};

// --- Lookup ---

/**
 * Retrieve team colors by club ID.
 * Falls back to `DEFAULT_TEAM_COLORS` for unknown, null, or undefined IDs.
 */
export function getTeamColors(clubId: number | null | undefined): TeamColorEntry {
  if (clubId == null) return DEFAULT_TEAM_COLORS;
  return TEAM_COLORS[clubId] ?? DEFAULT_TEAM_COLORS;
}
