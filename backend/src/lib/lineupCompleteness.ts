/** Appearances required on each side for a game to be playable. */
export const LINEUP_SIZE = 11;

export const STARTING_LINEUP = 'starting_lineup';

type GameForCompleteness = {
  appearances: readonly { clubId: number; playerId: number; type: string }[];
  homeClubId: number;
  awayClubId: number;
};

/**
 * Structural input keeps this pure module independent of matchService while
 * still accepting its GameWithRelations projection.
 */
export function hasCompleteLineups(game: GameForCompleteness): boolean {
  const homePlayers = new Set<number>();
  const awayPlayers = new Set<number>();

  for (const appearance of game.appearances) {
    if (appearance.type !== STARTING_LINEUP) continue;
    if (appearance.clubId === game.homeClubId) homePlayers.add(appearance.playerId);
    else if (appearance.clubId === game.awayClubId) awayPlayers.add(appearance.playerId);
  }

  return homePlayers.size === LINEUP_SIZE && awayPlayers.size === LINEUP_SIZE;
}
