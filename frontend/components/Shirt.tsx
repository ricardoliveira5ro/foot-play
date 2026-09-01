'use client';

import type { CSSProperties } from 'react';
import type { ShirtData, ShirtState } from '@/types';
import type { GuessResult } from '@/lib/wordle';
import { getCorrectLettersByLength } from '@/lib/wordle';

const SHIRT_PATH =
  'M28 10 L32 13 L36 10 L56 14 L62 15 L62 20 L51 22 L51 58 L13 58 L13 22 L2 20 L2 15 L8 14 L28 10 Z';

interface ShirtProps {
  shirt: ShirtData;
  /** Squad index, used to stagger the entrance animation. */
  index: number;
  onClick?: (token: string) => void;
  /** Guess history for this shirt (used for LetterSlots preview) */
  guessHistory?: GuessResult[][];
}

/** State-aware accessible name for the shirt button. */
function shirtAriaLabel(
  state: ShirtState,
  shirtNumber: number | null,
  name?: string,
): string {
  const number = shirtNumber ?? '?';
  switch (state) {
    case 'default':
      return `Shirt ${number}, tap to guess the player`;
    case 'in-progress':
      return `Shirt ${number}, guessing in progress`;
    case 'correct':
      return name
        ? `Shirt ${number}, guessed correctly: ${name}`
        : `Shirt ${number}, guessed correctly`;
    case 'failed':
      return `Shirt ${number}, not guessed`;
  }
}

function LetterSlots({
  nameLength,
  guessHistory,
  wordBoundaries = [],
}: {
  nameLength: number;
  guessHistory?: GuessResult[][];
  wordBoundaries?: number[];
}) {
  const correctLetters = guessHistory
    ? getCorrectLettersByLength(guessHistory, nameLength)
    : [];

  // If no guess history, show placeholder dots
  if (correctLetters.every(l => l === null)) {
    const slots: React.ReactNode[] = [];
    for (let i = 0; i < nameLength; i++) {
      if (wordBoundaries.includes(i)) {
        slots.push(<span key={`spacer-${i}`} className="text-ink/30" aria-hidden="true"> </span>);
      }
      slots.push(<span key={i} className="text-ink/30">·</span>);
    }
    return (
      <span aria-hidden="true" className="font-mono text-xs tracking-[0.15em]">
        {slots}
      </span>
    );
  }

  const slots: React.ReactNode[] = [];
  for (let i = 0; i < correctLetters.length; i++) {
    if (wordBoundaries.includes(i)) {
      slots.push(<span key={`spacer-${i}`} className="text-ink/30" aria-hidden="true"> </span>);
    }
    const letter = correctLetters[i];
    slots.push(
      letter ? (
        <span key={i} className="font-semibold text-correct">
          {letter}
        </span>
      ) : (
        <span key={i} className="text-ink/30">·</span>
      ),
    );
  }
  return (
    <span aria-hidden="true" className="font-mono text-xs tracking-[0.15em]">
      {slots}
    </span>
  );
}

function StateBadge({ state }: { state: Extract<ShirtState, 'correct' | 'failed'> }) {
  const correct = state === 'correct';
  return (
    <span
      aria-hidden="true"
      className={`absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-white ${
        correct ? 'bg-correct' : 'bg-failed'
      }`}
    >
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
        {correct ? (
          <path
            d="M2.5 6.5 L5 9 L9.5 3.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        )}
      </svg>
    </span>
  );
}

/**
 * A single shirt on the tactic board.
 * Four states: default → in-progress → correct → failed.
 * The whole unit is a button with an expanded (>=44px) hit area.
 */
export default function Shirt({ shirt, index, onClick, guessHistory }: ShirtProps) {
  const { token, nameLength, shirtNumber, coords, state } = shirt;

  return (
    <div
      className="@container absolute"
      style={{
        left: `${coords.x}%`,
        top: `${coords.y}%`,
        width: '13%',
        transform: 'translate(-50%, -50%)',
      }}
    >
      <button
        type="button"
        onClick={onClick ? () => onClick(token) : undefined}
        aria-label={shirtAriaLabel(state, shirtNumber, shirt.name)}
        className={`-m-2 block w-[calc(100%+1rem)] rounded-md p-2 transition-[transform,filter] duration-150 ease-out hover:-translate-y-0.5 hover:drop-shadow-[0_4px_6px_rgba(16,24,32,0.35)] ${state === 'failed' ? 'opacity-60 saturate-[0.6]' : ''}`}
      >
        {/* Inner wrapper carries the entrance animation so positional and
            hover transforms on the button are never overridden. */}
        <span
          className="animate-shirt-in relative block w-full"
          style={{ '--stagger-delay': `${index * 28}ms` } as CSSProperties}
        >
          <svg viewBox="0 0 64 64" aria-hidden="true" className="block h-auto w-full drop-shadow-[0_2px_3px_rgba(16,24,32,0.25)]">
            <path d={SHIRT_PATH} fill="#F8FAF8" stroke="#101820" strokeWidth="1" strokeLinejoin="round" />
          </svg>
          {shirtNumber !== null && (
            <span
              className="absolute inset-0 flex items-center justify-center pt-[4%] font-display leading-none text-ink"
              style={{ fontSize: '38cqw' }}
            >
              {shirtNumber}
            </span>
          )}
        </span>

        {(state === 'correct' || state === 'failed') && <StateBadge state={state} />}
      </button>

      {/* Tag below the shirt — absolutely positioned so it never shifts neighbors. */}
      <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 w-max -translate-x-1/2">
        <div className="inline-block rounded-md bg-paper px-2 py-1 shadow-sm">
          {(state === 'default' || state === 'in-progress') && (
            <LetterSlots nameLength={nameLength} guessHistory={guessHistory} wordBoundaries={shirt.wordBoundaries} />
          )}
          {state === 'correct' && (
            <span className="block max-w-35 truncate text-[13px] font-semibold text-correct">
              {shirt.name ?? (shirtNumber !== null ? `#${shirtNumber}` : 'Correct')}
            </span>
          )}
          {state === 'failed' && (
            <span className="block max-w-35 truncate text-[13px] font-semibold text-failed">
              {shirt.name ?? (shirtNumber !== null ? `#${shirtNumber}` : 'Failed')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
