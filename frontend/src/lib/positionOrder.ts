/**
 * Row order for lineup positions. Unknown and missing positions compare as
 * 99 so they sort last, which is what the game-over list has always done.
 *
 * Lives in its own module because two consumers need the same order and a
 * share block whose order disagrees with the list above it reads as a bug:
 * the share grid and the game-over table both import this.
 */
export const POSITION_ORDER: Record<string, number> = {
  // Goalkeeper
  'Goalkeeper': 0, 'GK': 0,
  // Defenders
  'Centre-Back': 10, 'CB': 10,
  'Left-Back': 11, 'LB': 11,
  'Right-Back': 12, 'RB': 12,
  'Defender': 15, 'Sweeper': 15,
  // Midfielders
  'Defensive Midfield': 20, 'DM': 20,
  'Central Midfield': 21, 'CM': 21,
  'Attacking Midfield': 22, 'AM': 22, 'CAM': 22,
  'Midfield': 23,
  'Left Midfield': 24, 'LM': 24,
  'Right Midfield': 25, 'RM': 25,
  // Forwards
  'Left Winger': 30, 'LW': 30, 'LWB': 30,
  'Right Winger': 31, 'RW': 31, 'RWB': 31,
  'Second Striker': 32,
  'Centre-Forward': 33, 'ST': 33, 'CF': 34,
  'Attack': 35,
};

/**
 * Comparator over the two fields the order depends on, so a full shirt object
 * can be handed to `Array.prototype.sort` without a wrapper lambda. Ties
 * return 0 and `sort` is stable, so same-role shirts keep input order.
 */
export function compareShirtPosition(
  a: { position: string | null },
  b: { position: string | null },
): number {
  return (POSITION_ORDER[a.position ?? ''] ?? 99) - (POSITION_ORDER[b.position ?? ''] ?? 99);
}

/** Display label for a position. `CF` renders as the striker label. */
export function getPositionLabel(position: string | null): string {
  const labels: Record<string, string> = {
    GK: 'GK',
    CB: 'CB',
    LB: 'LB',
    RB: 'RB',
    LWB: 'LWB',
    RWB: 'RWB',
    DM: 'DM',
    CM: 'CM',
    AM: 'AM',
    CAM: 'CAM',
    LM: 'LM',
    RM: 'RM',
    LW: 'LW',
    RW: 'RW',
    ST: 'ST',
    CF: 'ST',
  };
  return position ? labels[position] ?? position : '?';
}
