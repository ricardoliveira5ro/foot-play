import type { ParsedEventType } from './eventMapping';

/** Identity of one appearance row — the join key, gameId + playerId. */
export interface AppearanceKey {
  gameId: number;
  playerId: number;
}

/** The three columns the join writes. */
export interface EventTotals {
  goals: number;
  assists: number;
  redCards: number;
}

/** A raw CSV row, already reduced to what the join needs. */
export interface ParsedEventRow {
  /** Classification from classifyEvent(). 'other' means "not recognised". */
  type: ParsedEventType;
  /**
   * True when this row contributes an assist. Measured: the dataset has no
   * `assist` event type, so the seed emits a separate row carrying
   * `type: 'other', isAssist: true` against the ASSISTER's appearance key
   * (A1). That is why the flag exists separately rather than as an enum
   * member — and why the scorer and the assister are indexed independently.
   */
  isAssist: boolean;
}

/** An appearance row the finalized totals are written back onto. */
export interface FullAppearanceRow extends AppearanceKey, EventTotals {}

/**
 * Streaming join accumulator: events ⋈ appearances on gameId + playerId.
 *
 * R4 / §3.2: this is the ONLY structure the seed is allowed to build, and it
 * indexes APPEARANCES (~219k), never events (~1.27M). The map is
 * pre-populated to zeros from the appearance set, so its size is fixed at
 * construction and a stream of 1.27M unjoinable rows cannot grow it. An
 * event whose key is absent is dropped and the map is left untouched.
 */
export class AppearanceEventIndex {
  private readonly totals = new Map<string, EventTotals>();

  constructor(appearances: AppearanceKey[]) {
    for (const appearance of appearances) {
      this.totals.set(compositeKey(appearance.gameId, appearance.playerId), {
        goals: 0,
        assists: 0,
        redCards: 0,
      });
    }
  }

  /** Number of distinct indexed appearances. */
  get size(): number {
    return this.totals.size;
  }

  /**
   * Fold one event into the totals for `key`.
   *
   * Returns the (mutated) totals, or undefined when the key has no
   * appearance row — the unjoinable case, which is dropped silently because
   * it is a normal outcome (substitute goals, R3; games filtered out of the
   * seed; players missing from players.csv).
   */
  accumulate(key: AppearanceKey, event: ParsedEventRow): EventTotals | undefined {
    const totals = this.totals.get(compositeKey(key.gameId, key.playerId));
    if (totals === undefined) return undefined;

    switch (event.type) {
      case 'goal':
      case 'penalty':
        totals.goals += 1;
        break;
      case 'red_card':
      case 'second_yellow':
        totals.redCards += 1;
        break;
      case 'own_goal':
        // O5: recognized so the label shows up in the seed's breakdown, but
        // deliberately NOT counted. 6,729 measured rows; whether player_id is
        // the scorer or the conceder is unverifiable from this dataset, so no
        // player is credited a goal they may not have scored. Revisit with
        // O4 once the dataset owner confirms the semantics — this switch is
        // the only place that changes.
        break;
      case 'shootout_goal':
        // O3: penalty-shootout goals are deliberately NOT counted.
        break;
      case 'yellow_card':
      case 'substitution':
      case 'other':
        // Not tracked. Anything unrecognised counts nowhere rather than wrong.
        break;
    }

    if (event.isAssist) totals.assists += 1;

    return totals;
  }

  /** Merge accumulated totals back onto the appearance rows for the DB write. */
  finalize(appearances: FullAppearanceRow[]): FullAppearanceRow[] {
    return appearances.map((appearance) => {
      const totals = this.totals.get(compositeKey(appearance.gameId, appearance.playerId));
      if (totals === undefined) return appearance;
      return { ...appearance, goals: totals.goals, assists: totals.assists, redCards: totals.redCards };
    });
  }
}

/**
 * Both ids are non-negative integers with no separator characters, so a colon
 * cannot collide across (gameId, playerId) pairs.
 */
function compositeKey(gameId: number, playerId: number): string {
  return `${gameId}:${playerId}`;
}
