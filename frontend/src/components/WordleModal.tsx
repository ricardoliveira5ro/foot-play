'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { GuessResult } from '@/lib/wordle';

interface WordleModalProps {
  /** The player's display name (target to guess) */
  targetName: string;
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
    case 'correct':
      return 'var(--color-correct)';
    case 'present':
      return '#E8A00C';
    case 'absent':
      return '#374151';
  }
}

export default function WordleModal({
  targetName,
  shirtNumber,
  position,
  guesses,
  maxAttempts = 6,
  onGuess,
  onClose,
  isGameOver = false,
  isCorrect = false,
}: WordleModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  const targetLength = targetName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\-']/g, '').length;
  const attemptNumber = guesses.length;
  const canSubmit = inputValue.length === targetLength && !isGameOver;

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle input change - only allow letters, uppercase display
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
    const truncated = value.slice(0, targetLength);
    setInputValue(truncated);
    setInputError(null);
  }, [targetLength]);

  // Handle form submit
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      // Trigger shake animation
      setShakeKey(k => k + 1);
      if (inputValue.length !== targetLength) {
        setInputError(`Enter ${targetLength} letters`);
      }
      return;
    }
    onGuess(inputValue);
    setInputValue('');
  }, [canSubmit, inputValue, onGuess, targetLength]);

  // Handle key down for Enter
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canSubmit) {
      handleSubmit(e);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [canSubmit, handleSubmit, onClose]);

  // Handle overlay click to close
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // Render a single letter box in the feedback grid
  const renderLetterBox = (result: GuessResult, index: number) => {
    const bg = getResultBg(result.result);
    const isRevealed = index < attemptNumber || (isGameOver && index === attemptNumber);

    return (
      <div
        key={`${index}-${result.letter}`}
        className="relative flex h-10 w-10 items-center justify-center font-mono font-semibold text-[18px] select-none"
        style={{
          backgroundColor: isRevealed ? bg : 'var(--color-paper)',
          borderColor: isRevealed ? 'transparent' : 'var(--color-ink/20)',
          color: isRevealed ? 'var(--color-chalk)' : 'var(--color-ink)',
          borderWidth: '2px',
          borderStyle: 'solid',
          borderRadius: '6px',
          transition: 'all 150ms ease-out',
          animation: isRevealed && index === attemptNumber - 1 ? 'flip-in 300ms ease-out' : 'none',
        }}
        aria-label={`${result.letter}, ${result.result}`}
      >
        {isRevealed && result.letter}
      </div>
    );
  };

  // Render a row of letter boxes for a guess
  const renderGuessRow = (guess: GuessResult[], rowIndex: number) => (
    <div
      key={rowIndex}
      className="flex items-center justify-center gap-1.5"
      style={{ animationDelay: `${rowIndex * 60}ms` }}
    >
      {guess.map((result, i) => renderLetterBox(result, i))}
    </div>
  );

  // Render empty row placeholders
  const renderEmptyRow = (rowIndex: number) => (
    <div
      key={`empty-${rowIndex}`}
      className="flex items-center justify-center gap-1.5"
      style={{ animationDelay: `${rowIndex * 60}ms` }}
    >
      {[...Array(targetLength)].map((_, i) => (
        <div
          key={i}
          className="h-10 w-10 font-mono font-semibold text-[18px]"
          style={{
            backgroundColor: 'var(--color-paper)',
            border: '2px solid var(--color-ink/15)',
            borderRadius: '6px',
            color: 'var(--color-ink/30)',
          }}
        >
          {'\u00A0'}
        </div>
      ))}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wordle-modal-title"
      aria-describedby="wordle-modal-desc"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
        aria-hidden="true"
        style={{ animation: 'fade-in 150ms ease-out' }}
      />

      {/* Modal content */}
      <div
        className="relative w-full max-w-md rounded-2xl bg-paper shadow-[0_32px_64px_-12px_rgba(16,24,32,0.5)] overflow-hidden"
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

        {/* Feedback grid */}
        <div className="p-4 pb-2 flex flex-col items-center gap-1.5">
          {/* Previous guesses */}
          {guesses.map((guess, i) => renderGuessRow(guess, i))}

          {/* Current guess (if in progress and not game over) */}
          {!isGameOver && attemptNumber < maxAttempts && (
            <div className="flex items-center justify-center gap-1.5" style={{ animationDelay: `${attemptNumber * 60}ms` }}>
              {[...Array(targetLength)].map((_, i) => (
                <div
                  key={`current-${i}`}
                  className="relative h-10 w-10 font-mono font-semibold text-[18px]"
                  style={{
                    backgroundColor: 'var(--color-paper)',
                    border: '2px solid var(--color-ink/20)',
                    borderRadius: '6px',
                    color: 'var(--color-ink)',
                    transition: 'border-color 150ms',
                  }}
                >
                  {inputValue[i] && (
                    <span className="absolute inset-0 flex items-center justify-center">{inputValue[i]}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Remaining empty rows */}
          {[...Array(maxAttempts - guesses.length - (isGameOver ? 0 : 1))].map((_, i) =>
            renderEmptyRow(guesses.length + (isGameOver ? 0 : 1) + i)
          )}

          {/* Game over reveal row */}
          {isGameOver && attemptNumber < maxAttempts && (
            <div className="flex items-center justify-center gap-1.5" style={{ animationDelay: `${attemptNumber * 60}ms` }}>
              {targetName.split('').map((char, i) => (
                <div
                  key={`reveal-${i}`}
                  className="h-10 w-10 font-mono font-semibold text-[18px] flex items-center justify-center"
                  style={{
                    backgroundColor: isCorrect ? 'var(--color-correct)' : 'var(--color-failed)',
                    borderRadius: '6px',
                    color: 'var(--color-chalk)',
                    animation: 'flip-in 300ms ease-out',
                    animationDelay: `${i * 50}ms`,
                    animationFillMode: 'both',
                  }}
                >
                  {char.toUpperCase()}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Input area */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-ink/10">
          <div className="relative mb-3">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              maxLength={targetLength}
              disabled={isGameOver}
              autoComplete="off"
              spellCheck={false}
              className={`w-full h-12 px-4 text-center font-mono text-[24px] uppercase tracking-[0.2em] rounded-lg border-2 transition-colors ${
                isGameOver
                  ? 'bg-ink/5 text-ink/40 cursor-not-allowed border-ink/10'
                  : 'bg-paper text-ink border-ink/20 focus:border-flare focus:outline-none focus:ring-2 focus:ring-flare/20'
              } ${inputError ? 'border-failed' : ''}`}
              placeholder={targetLength > 0 ? Array(targetLength).fill('·').join(' ') : ''}
              aria-label={`Enter ${targetLength} letter guess`}
              aria-invalid={!!inputError}
              aria-describedby={inputError ? 'input-error' : undefined}
            />
            {inputError && (
              <p id="input-error" className="absolute -bottom-5 left-0 text-xs text-failed" role="alert">
                {inputError}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="submit"
              disabled={!canSubmit}
              className={`flex-1 h-11 rounded-lg font-sans font-semibold text-sm transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare ${
                canSubmit
                  ? 'bg-ink text-chalk hover:bg-flare active:scale-[0.98]'
                  : 'bg-ink/10 text-ink/40 cursor-not-allowed'
              }`}
            >
              {isGameOver ? (isCorrect ? 'Correct!' : 'Revealed') : `Guess ${attemptNumber + 1} of ${maxAttempts}`}
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
        </form>
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
      `}</style>
    </div>
  );
}
