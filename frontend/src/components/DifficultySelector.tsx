'use client';

import { DIFFICULTIES, DIFFICULTY_CONFIG, type Difficulty } from '../lib/difficulty';

interface DifficultySelectorProps {
  readonly value: Difficulty;
  readonly onChange: (mode: Difficulty) => void;
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
  const opponentText = c.opponentRequired ? 'opponent required' : 'opponent optional';
  return `${c.attempts} attempts · ${clueText} · ${c.showShirtNumber ? 'number shown' : 'number hidden'} · ${opponentText}`;
}

export default function DifficultySelector({ value, onChange }: DifficultySelectorProps) {
  return (
    <div className="difficulty-selector">
      <div className="flex flex-col gap-3">
        <div className="text-xs uppercase tracking-[0.15em] text-ink/55">Choose difficulty</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {DIFFICULTIES.map((mode) => {
            const isActive = value === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onChange(mode)}
                aria-pressed={isActive}
                className={`group relative rounded-lg border px-4 py-3 text-left transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare ${
                  isActive
                    ? 'border-turf-deep bg-chalk shadow-sm'
                    : 'border-ink/15 bg-paper hover:border-ink/30 hover:bg-chalk/70'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-display text-lg uppercase tracking-[0.08em] text-ink">
                      {DIFFICULTY_CONFIG[mode].label}
                    </div>
                    <div className="mt-1 text-xs text-ink/55">{describeMode(mode)}</div>
                  </div>
                  <div
                    className={`mt-0.5 h-2 w-2 rounded-full transition-colors ${
                      isActive ? 'bg-turf-deep' : 'bg-ink/15 group-hover:bg-ink/25'
                    }`}
                    aria-hidden="true"
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
