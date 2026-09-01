'use client';

import { useEffect } from 'react';
import type { Game, ShirtData, RevealPlayer } from '@/types';

interface GameCompleteProps {
  /** Whether the player won */
  isWin: boolean;
  /** The match data */
  match: Game;
  /** The team side that was played */
  teamSide: 'home' | 'away';
  /** All shirts with their final states */
  shirts: ShirtData[];
  /** Revealed player names from the server (POST /api/reveal) */
  revealedPlayers: RevealPlayer[];
  /** Callback to start a new game */
  onPlayAgain: () => void;
}

function formatMatchDate(date: string | null): string | null {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

const POSITION_ORDER: Record<string, number> = {
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

function getPositionLabel(position: string | null): string {
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

export default function GameComplete({ isWin, match, teamSide, shirts, revealedPlayers, onPlayAgain }: GameCompleteProps) {
  const home = match.homeClub?.name ?? 'Home';
  const away = match.awayClub?.name ?? 'Away';
  const dateLabel = formatMatchDate(match.date) ?? match.season;
  const teamName = teamSide === 'home' ? home : away;

  // Map revealed players by shirtNumber for name lookup. Shirts carry opaque
  // tokens now, but shirtNumber is present and unique on both sides.
  const revealedByName = new Map((revealedPlayers ?? []).map((p) => [p.shirtNumber, p.name]));

  // Calculate stats
  const totalShirts = shirts.length;
  const failedShirts = shirts.filter(s => s.state === 'failed');
  const failedCount = failedShirts.length;

  useEffect(() => {
    // Play a subtle sound or trigger celebration animation
    if (isWin) {
      // Could add confetti or sound here
    }
  }, [isWin]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="game-complete-title">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/70 backdrop-blur-sm"
        aria-hidden="true"
        style={{ animation: 'fade-in 200ms ease-out' }}
      />

      {/* Modal content */}
      <div className="relative w-full max-w-lg rounded-2xl bg-paper shadow-[0_32px_64px_-12px_rgba(16,24,32,0.5)] overflow-hidden">
        {/* Header with result */}
        <header className="relative p-6 pb-4 text-center overflow-hidden">
          {/* Decorative background */}
          <div
            className="absolute inset-0 opacity-10"
            aria-hidden="true"
            style={{
              background: isWin
                ? 'radial-gradient(circle at center, var(--color-correct) 0%, transparent 70%)'
                : 'radial-gradient(circle at center, var(--color-failed) 0%, transparent 70%)',
            }}
          />
          
          <div className="relative flex flex-col items-center gap-2">
            {/* Trophy or X icon */}
            <div
              className="flex h-20 w-20 items-center justify-center rounded-full mx-auto mb-2"
              style={{
                backgroundColor: isWin ? 'var(--color-correct)/15' : 'var(--color-failed)/15',
                border: `2px solid ${isWin ? 'var(--color-correct)' : 'var(--color-failed)'}`,
              }}
              aria-hidden="true"
            >
              {isWin ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-correct)' }}>
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-failed)' }}>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              )}
            </div>

            <h1 id="game-complete-title" className="font-display uppercase text-[clamp(28px,5vw,40px)] leading-tight" style={{ color: isWin ? 'var(--color-correct)' : 'var(--color-failed)' }}>
              {isWin ? 'Congratulations!' : 'Better luck next time!'}
            </h1>

            <p className="text-lg text-ink/70 max-w-xs">
              {isWin
                ? `You identified all ${totalShirts} players in the ${teamName} lineup.`
                : `The ${teamName} lineup had ${failedCount} player${failedCount !== 1 ? 's' : ''} you couldn't guess.`}
            </p>
          </div>
        </header>

        {/* Player reveal list */}
        <div className="px-6 pb-4 max-h-[50vh] overflow-y-auto">
          <div className="space-y-2">
            {shirts
              .slice()
              .sort((a, b) => (POSITION_ORDER[a.position ?? ''] ?? 99) - (POSITION_ORDER[b.position ?? ''] ?? 99))
              .map((shirt) => {
                const isCorrect = shirt.state === 'correct';
                const isFailed = shirt.state === 'failed';
                const showName = isCorrect || isFailed;
                const revealedName = revealedByName.get(shirt.shirtNumber);

                return (
                  <div
                    key={shirt.token}
                    className="flex items-center gap-3 p-3 rounded-lg transition-colors"
                    style={{
                      backgroundColor: isCorrect
                        ? 'var(--color-correct)/10'
                        : isFailed
                        ? 'var(--color-failed)/10'
                        : 'var(--color-ink/5)',
                      border: `1px solid ${isCorrect ? 'var(--color-correct)/30' : isFailed ? 'var(--color-failed)/30' : 'var(--color-ink/10)'}`,
                    }}
                  >
                    {/* Shirt number */}
                    <span
                      className="shrink-0 w-10 text-center font-display text-lg text-ink/60"
                      aria-label={`Shirt ${shirt.shirtNumber ?? '?'}`}
                    >
                      {shirt.shirtNumber ?? '?'}
                    </span>

                    {/* Position */}
                    <span className="shrink-0 w-28 text-xs font-mono text-ink/50 text-left uppercase">
                      {getPositionLabel(shirt.position)}
                    </span>

                    {/* Name */}
                    <span
                      className="flex-1 truncate font-semibold text-base"
                      style={{
                        color: isCorrect
                          ? 'var(--color-correct)'
                          : isFailed
                          ? 'var(--color-failed)'
                          : 'var(--color-ink/40)',
                      }}
                    >
                      {showName && revealedName ? revealedName : '—'}
                    </span>

                    {/* Status badge */}
                    {showName && (
                      <span
                        className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full"
                        style={{
                          backgroundColor: isCorrect ? 'var(--color-correct)' : 'var(--color-failed)',
                        }}
                        aria-label={isCorrect ? 'Correct' : 'Failed'}
                      >
                        {isCorrect ? (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M2.5 6.5 L5 9 L9.5 3.5" />
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                            <path d="M3 3 L9 9 M9 3 L3 9" />
                          </svg>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {/* Match summary */}
        <div className="border-t border-ink/10 px-6 py-4">
          <div className="flex items-center justify-center gap-4">
            <p className="font-display text-[36px] leading-none text-ink">
              {match.homeScore} – {match.awayScore}
            </p>
            <div className="flex flex-col items-start gap-0.5">
              <p className="font-semibold text-xl text-ink">{home}</p>
              <p className="font-semibold text-xl text-ink">{away}</p>
            </div>
          </div>

          {(dateLabel || match.competition) && (
            <div className="mt-3 flex flex-col items-center gap-0.5 text-xs uppercase tracking-[0.08em] text-ink/55">
              {dateLabel && <p>{dateLabel}</p>}
              {match.competition && <p>{match.competition}</p>}
            </div>
          )}
        </div>

        {/* Play Again button */}
        <div className="border-t border-ink/10 px-6 py-4">
          <button
            type="button"
            onClick={onPlayAgain}
            className="w-full h-12 rounded-lg bg-ink text-chalk font-sans font-semibold text-base transition-colors hover:bg-flare focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare active:scale-[0.98]"
          >
            Play Again
          </button>
        </div>
      </div>

      {/* Global styles for animations */}
      <style jsx global>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
