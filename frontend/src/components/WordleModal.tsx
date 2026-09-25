'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { GuessResult } from '@/lib/wordle';

interface WordleModalProps {
  /** The normalized length of the player's name (target to guess) */
  nameLength: number;
  /** Normalized indices where a word separator occurs — render a gap before these tiles. */
  wordBoundaries?: number[];
  /** The player's shirt number */
  shirtNumber: number | null;
  /** The player's position (e.g., 'ST', 'CB', 'GK') */
  position: string | null;
  /** Previous guesses with their results */
  guesses: GuessResult[][];
  /** Maximum number of attempts (default 6) */
  maxAttempts?: number;
  /** Called when user submits a guess */
  onGuess: (guess: string) => void;
  /** Called when modal is closed */
  onClose: () => void;
  /** Whether the game is over for this shirt (correct or failed) */
  isGameOver?: boolean;
  /** Whether the guess was correct */
  isCorrect?: boolean;
}

const POSITION_LABELS: Record<string, string> = {
  GK: 'Goalkeeper',
  CB: 'Centre-Back',
  LB: 'Left-Back',
  RB: 'Right-Back',
  LWB: 'Left Wing-Back',
  RWB: 'Right Wing-Back',
  DM: 'Defensive Midfielder',
  CM: 'Central Midfielder',
  AM: 'Attacking Midfielder',
  CAM: 'Attacking Midfielder',
  LM: 'Left Midfielder',
  RM: 'Right Midfielder',
  LW: 'Left Winger',
  RW: 'Right Winger',
  ST: 'Centre-Forward',
  CF: 'Centre-Forward',
};

function getPositionLabel(position: string | null): string {
  if (!position) return 'Player';
  return POSITION_LABELS[position] ?? position;
}

function getResultBg(result: GuessResult['result']): string {
  switch (result) {
    case 'CORRECT':
      return 'var(--color-correct)';
    case 'PRESENT':
      return '#E8A00C';
    case 'ABSENT':
      return '#374151';
  }
}

// --- On-screen keyboard ---

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Enter', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Backspace'],
];

type KeyState = 'unused' | 'correct' | 'present' | 'absent';

const KEY_STATE_PRIORITY: Record<KeyState, number> = {
  unused: 0,
  absent: 1,
  present: 2,
  correct: 3,
};

/**
 * Map the API's uppercase GuessResult values to the keyboard's internal
 * lowercase KeyState. The keyboard state is a UI-internal concept, so it
 * stays lowercase; only the boundary translation happens here.
 */
const RESULT_TO_KEY_STATE: Record<GuessResult['result'], KeyState> = {
  CORRECT: 'correct',
  PRESENT: 'present',
  ABSENT: 'absent',
};

function getKeyStates(guesses: GuessResult[][]): Map<string, KeyState> {
  const states = new Map<string, KeyState>();

  for (const guess of guesses) {
    for (const { letter, result } of guess) {
      if (!letter) continue;
      const key = letter.toUpperCase();
      const newState: KeyState = RESULT_TO_KEY_STATE[result];
      const current = states.get(key) ?? 'unused';
      if (KEY_STATE_PRIORITY[newState] > KEY_STATE_PRIORITY[current]) {
        states.set(key, newState);
      }
    }
  }

  return states;
}

function getKeyStyle(state: KeyState): React.CSSProperties {
  switch (state) {
    case 'correct':
      return { backgroundColor: 'var(--color-correct)', color: 'var(--color-chalk)' };
    case 'present':
      return { backgroundColor: '#E8A00C', color: 'var(--color-chalk)' };
    case 'absent':
      return { backgroundColor: '#374151', color: 'var(--color-chalk)' };
    default:
      return { backgroundColor: 'var(--color-ink/10)', color: 'var(--color-ink)' };
  }
}

function getTileTextColor(isRevealed: boolean, hasLetter: boolean): string {
  if (isRevealed) return 'var(--color-chalk)';
  if (hasLetter) return 'var(--color-ink)';
  return 'transparent';
}

function getTileAriaLabel(letter: string | null, result: GuessResult['result'] | null): string {
  if (!letter) return 'empty';
  return result ? `${letter}, ${result}` : letter;
}

function getKeyLabel(key: string): string {
  if (key === 'Backspace') return '⌫';
  if (key === 'Enter') return '↵';
  return key;
}

function getKeyAriaLabel(key: string): string {
  if (key === 'Backspace') return 'Delete';
  if (key === 'Enter') return 'Submit';
  return key;
}

function getSubmitButtonClass(isGameOver: boolean, canSubmit: boolean): string {
  if (isGameOver) return 'bg-ink/10 text-ink/40 cursor-not-allowed';
  if (canSubmit) return 'bg-ink text-chalk hover:bg-flare active:scale-[0.98]';
  return 'bg-ink/10 text-ink/40 cursor-not-allowed';
}

function getSubmitButtonLabel(
  isGameOver: boolean,
  isCorrect: boolean,
  attemptNumber: number,
  maxAttempts: number,
): string {
  if (isGameOver) return isCorrect ? 'Correct!' : 'Revealed';
  return `Guess ${attemptNumber + 1} of ${maxAttempts}`;
}

// --- Main component ---

export default function WordleModal({
  nameLength,
  wordBoundaries = [],
  shirtNumber,
  position,
  guesses,
  maxAttempts = 6,
  onGuess,
  onClose,
  isGameOver = false,
  isCorrect = false,
}: Readonly<WordleModalProps>) {
  const gridRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  const targetLength = nameLength;
  const attemptNumber = guesses.length;

  const canSubmit = inputValue.length === targetLength && !isGameOver;
  const keyStates = useMemo(() => getKeyStates(guesses), [guesses]);

  // Open as a modal dialog on mount (native focus trap + top layer).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  // Auto-focus grid on mount
  useEffect(() => {
    gridRef.current?.focus();
  }, []);

  // Handle physical keyboard input. Escape is handled by the native dialog
  // (fires `cancel` -> onClose), so only typing keys are handled here.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isGameOver) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        if (inputValue.length === targetLength) {
          onGuess(inputValue);
          setInputValue('');
          setInputError(null);
        } else {
          setShakeKey(k => k + 1);
          setInputError(`Enter ${targetLength} letters`);
        }
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        setInputValue(v => v.slice(0, -1));
        setInputError(null);
        return;
      }

      // Only accept single letters A-Z
      if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        setInputValue(v => {
          if (v.length >= targetLength) return v;
          return v + e.key.toUpperCase();
        });
        setInputError(null);
      }
    },
    [isGameOver, inputValue, targetLength, onGuess],
  );

  // Handle on-screen keyboard press
  const handleKeyPress = useCallback(
    (key: string) => {
      if (isGameOver) return;

      if (key === 'Enter') {
        if (inputValue.length === targetLength) {
          onGuess(inputValue);
          setInputValue('');
          setInputError(null);
        } else {
          setShakeKey(k => k + 1);
          setInputError(`Enter ${targetLength} letters`);
        }
        return;
      }

      if (key === 'Backspace') {
        setInputValue(v => v.slice(0, -1));
        setInputError(null);
        return;
      }

      // Single letter
      if (inputValue.length < targetLength) {
        setInputValue(v => v + key);
        setInputError(null);
      }
    },
    [isGameOver, inputValue, targetLength, onGuess],
  );

  // Build the grid rows
  const gridRows = useMemo(() => {
    const rows: {
      key: string;
      tiles: {
        letter: string | null;
        result: GuessResult['result'] | null;
        isCurrentRow: boolean;
        isEmpty: boolean;
        isSpacer?: boolean;
      }[];
    }[] = [];

    // Insert a spacer tile BEFORE the tile at index i whenever i is a word boundary.
    const withSpacers = (
      tiles: {
        letter: string | null;
        result: GuessResult['result'] | null;
        isCurrentRow: boolean;
        isEmpty: boolean;
      }[],
    ): {
      letter: string | null;
      result: GuessResult['result'] | null;
      isCurrentRow: boolean;
      isEmpty: boolean;
      isSpacer?: boolean;
    }[] => {
      const out: {
        letter: string | null;
        result: GuessResult['result'] | null;
        isCurrentRow: boolean;
        isEmpty: boolean;
        isSpacer?: boolean;
      }[] = [];
      for (let i = 0; i < tiles.length; i++) {
        if (wordBoundaries.includes(i)) {
          out.push({
            letter: null,
            result: null,
            isCurrentRow: false,
            isEmpty: true,
            isSpacer: true,
          });
        }
        out.push(tiles[i]);
      }
      return out;
    };

    // Previous guess rows
    for (let r = 0; r < guesses.length; r++) {
      const guess = guesses[r];
      const tiles = guess.map((g) => ({
        letter: g.letter,
        result: g.result,
        isCurrentRow: false,
        isEmpty: false,
      }));
      rows.push({ key: `guess-${r}`, tiles: withSpacers(tiles) });
    }

    // Current typing row (if not game over and attempts remain)
    if (!isGameOver && attemptNumber < maxAttempts) {
      const tiles: {
        letter: string | null;
        result: GuessResult['result'] | null;
        isCurrentRow: boolean;
        isEmpty: boolean;
      }[] = [];
      for (let i = 0; i < targetLength; i++) {
        tiles.push({
          letter: inputValue[i] ?? null,
          result: null,
          isCurrentRow: true,
          isEmpty: !inputValue[i],
        });
      }
      rows.push({ key: `current-${attemptNumber}`, tiles: withSpacers(tiles) });
    }

    // Remaining empty rows
    const filledRows = guesses.length + (isGameOver ? 0 : 1);
    for (let r = filledRows; r < maxAttempts; r++) {
      const tiles = Array.from({ length: targetLength }, () => ({
        letter: null,
        result: null,
        isCurrentRow: false,
        isEmpty: true,
      }));
      rows.push({ key: `empty-${r}`, tiles: withSpacers(tiles) });
    }

    return rows;
  }, [guesses, inputValue, attemptNumber, targetLength, maxAttempts, isGameOver, wordBoundaries]);

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 m-0 flex max-h-none max-w-none items-center justify-center bg-transparent p-4"
      onCancel={onClose}
      aria-labelledby="wordle-modal-title"
      aria-describedby="wordle-modal-desc"
    >
      {/*
        Backdrop: an interactive full-screen button handles click-to-close.
        tabIndex={-1} keeps it out of sequential tab order because it is a
        redundant dismissal control — keyboard users already have Escape
        (onCancel) and the visible close / Give Up buttons.
      */}
      <button
        type="button"
        aria-label="Close modal"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
        style={{ animation: 'fade-in 150ms ease-out' }}
      />

      {/* Modal content */}
      <div
        className="relative mx-auto w-max min-w-md max-w-[calc(100vw-2rem)] shrink-0 rounded-2xl bg-paper shadow-[0_32px_64px_-12px_rgba(16,24,32,0.5)] overflow-hidden"
        style={{
          animation: `slide-up 200ms ease-out, shake ${shakeKey > 0 ? '300ms' : '0ms'} ease-out`,
        }}
      >
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b border-ink/10">
          <div>
            <p id="wordle-modal-title" className="font-sans font-semibold text-ink text-base">
              {shirtNumber !== null ? `#${shirtNumber}` : 'Player'}
            </p>
            <p id="wordle-modal-desc" className="text-xs text-ink/55 mt-0.5">
              Guess the {getPositionLabel(position)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="-mr-2 -mt-2 flex h-10 w-10 items-center justify-center rounded-md text-ink/55 hover:text-ink hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {/* Grid */}
        <div
          ref={gridRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="p-4 pb-2 flex flex-col items-center gap-1.5 outline-none"
          role="grid"
          aria-label="Guessing grid"
        >
          {gridRows.map((row) => (
            <div
              key={row.key}
              role="row"
              className="flex items-center justify-center gap-1.5"
            >
              {row.tiles.map((tile, i) => {
                if (tile.isSpacer) {
                  return (
                    <div key={`${row.key}-${i}`} className="relative flex h-10 w-6 select-none" aria-hidden="true" />
                  );
                }

                const isRevealed = tile.result !== null;
                const bg = tile.result
                  ? getResultBg(tile.result)
                  : 'var(--color-paper)';
                const borderColor = tile.isCurrentRow ? 'var(--color-ink)' : 'transparent';
                const textColor = getTileTextColor(isRevealed, Boolean(tile.letter));

                return (
                  <div
                    key={`${row.key}-${i}`}
                    role="gridcell"
                    className="relative flex h-10 w-10 items-center justify-center font-mono font-semibold text-[18px] select-none"
                    style={{
                      backgroundColor: bg,
                      borderWidth: '2px',
                      borderStyle: 'solid',
                      borderColor: isRevealed ? 'transparent' : borderColor,
                      borderRadius: '6px',
                      color: textColor,
                      transition: 'all 150ms ease-out',
                      animation: isRevealed && row.key.startsWith('guess-')
                        ? `flip-in 300ms ease-out ${i * 50}ms both`
                        : 'none',
                    }}
                    aria-label={getTileAriaLabel(tile.letter, tile.result)}
                  >
                    {tile.letter}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Error message */}
          {inputError && (
            <p className="text-xs text-failed mt-1" role="alert">
              {inputError}
            </p>
          )}
        </div>

        {/* On-screen keyboard */}
        <div className="px-4 pb-3 flex flex-col items-center gap-1.5">
          {KEYBOARD_ROWS.map((row, ri) => (
            <div key={ri} className="flex gap-1.5">
              {row.map((key) => {
                const isWide = key === 'Enter' || key === 'Backspace';
                const label = getKeyLabel(key);
                const state = keyStates.get(key) ?? 'unused';

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleKeyPress(key)}
                    disabled={isGameOver}
                    className="flex items-center justify-center rounded-md font-mono font-semibold text-sm transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      ...getKeyStyle(state),
                      height: '42px',
                      minWidth: isWide ? '56px' : '34px',
                      padding: isWide ? '0 8px' : '0 4px',
                    }}
                    aria-label={getKeyAriaLabel(key)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                if (canSubmit) {
                  onGuess(inputValue);
                  setInputValue('');
                  setInputError(null);
                } else {
                  setShakeKey(k => k + 1);
                  if (inputValue.length !== targetLength) {
                    setInputError(`Enter ${targetLength} letters`);
                  }
                }
              }}
              disabled={isGameOver || !canSubmit}
              className={`flex-1 h-11 rounded-lg font-sans font-semibold text-sm transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare ${getSubmitButtonClass(isGameOver, canSubmit)}`}
            >
              {getSubmitButtonLabel(isGameOver, isCorrect, attemptNumber, maxAttempts)}
            </button>

            {!isGameOver && (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-11 rounded-lg bg-ink/10 text-ink/70 font-sans font-semibold text-sm hover:bg-ink/20 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare"
              >
                Give Up
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Global styles for animations */}
      <style jsx global>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        @keyframes flip-in {
          from { opacity: 0; transform: rotateX(90deg) scale(0.9); }
          to { opacity: 1; transform: rotateX(0) scale(1); }
        }
        dialog::backdrop {
          background: transparent;
        }
      `}</style>
    </dialog>
  );
}
