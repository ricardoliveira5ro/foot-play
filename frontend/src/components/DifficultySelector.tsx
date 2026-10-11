'use client';

import { DIFFICULTIES, DIFFICULTY_CONFIG, type Difficulty } from '../lib/difficulty';

interface DifficultySelectorProps {
  value: Difficulty;
  onChange: (mode: Difficulty) => void;
}

/** One-line summary of what a mode changes. Kept beside the table on
 *  purpose: the copy is derived, so it cannot drift from the config. */
function describeMode(mode: Difficulty): string {
  const c = DIFFICULTY_CONFIG[mode];
  const clues = [
    c.showFirstLetter && 'first letter',
    c.showScorersClue && 'scorers',
    c.showCaptainClue && 'captain',
  ].filter(Boolean) as string[];
  const clueText = clues.length ? clues.join(' + ') : 'no clues';
  return `${c.attempts} attempts · ${clueText} · number shown`;
}

export default function DifficultySelector({ value, onChange }: DifficultySelectorProps) {
  return (
    <fieldset className="difficulty-selector">
      <legend>Difficulty</legend>
      {DIFFICULTIES.map((mode) => (
        <label key={mode} className="difficulty-selector__option">
          <input
            type="radio"
            name="difficulty"
            value={mode}
            checked={value === mode}
            onChange={() => onChange(mode)}
          />
          <span className="difficulty-selector__label">
            {DIFFICULTY_CONFIG[mode].label}
            <small className="difficulty-selector__detail">{describeMode(mode)}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
