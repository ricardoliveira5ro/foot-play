'use client';

import { useState } from 'react';
import { DIFFICULTY_CONFIG, type Difficulty } from '../lib/difficulty';

interface FinishButtonProps {
  readonly difficulty: Difficulty;
  /** Shirts already `correct` or `failed`, across both boards. */
  readonly resolved: number;
  /** Shirts on the board. 22 for a full game, less for a partial lineup. */
  readonly total: number;
  readonly onFinish: () => void;
}

/** A full game is 11 + 11. Anything less is a partial lineup, which cannot be finished. */
const FULL_BOARD = 22;

/**
 * The finish control, for modes whose row says the opponent is required.
 *
 * Two rules, both from the table and never from a mode name:
 *   - `opponentRequired === false` renders NOTHING, not a disabled control. A
 *     permanently disabled Finish in Easy reads as a broken feature, and
 *     worse, as a requirement the game does not have (roadmap §5.2, RD1).
 *   - `total === FULL_BOARD` guards the count against a partial lineup being
 *     "finished" by arithmetic.
 *
 * The confirmation is part of the affordance: finishing is irreversible and
 * the reward depends on the resolved count, so the player is asked once.
 *
 * `disabled` is a courtesy. The real gate is `checkGameComplete` inside the
 * reducer (v1.2.4), so a click that slips through the DOM is still refused.
 */
export default function FinishButton({ difficulty, resolved, total, onFinish }: FinishButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const config = DIFFICULTY_CONFIG[difficulty];

  if (!config.opponentRequired) return null;

  const locked = total !== FULL_BOARD || resolved < FULL_BOARD;

  if (confirming) {
    return (
      <fieldset className="finish min-w-0 border-0 p-0">
        <legend className="sr-only">Confirm finish</legend>
        <p className="finish__confirm">
          Finish with {resolved} of {FULL_BOARD} resolved? This cannot be undone.
        </p>
        <button type="button" className="finish__confirm-yes" onClick={onFinish}>
          Confirm
        </button>
        <button type="button" className="finish__confirm-no" onClick={() => setConfirming(false)}>
          Keep playing
        </button>
      </fieldset>
    );
  }

  return (
    <div className="finish">
      <button
        type="button"
        className="finish__button"
        disabled={locked}
        onClick={() => setConfirming(true)}
      >
        {locked ? `Finish — ${resolved} of ${FULL_BOARD} resolved` : 'Finish'}
      </button>
      {locked && (
        <p className="finish__hint">
          In {config.label} the opponent lineup is required. Every shirt on both teams
          must be identified.
        </p>
      )}
    </div>
  );
}
