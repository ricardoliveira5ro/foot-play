'use client';

import { useState } from 'react';
import TeamTabBar from '@/components/TeamTabBar';
import type { Game } from '@/types';
import type { ShirtGameData } from '@/lib/gameState';
import { computeTotalScore } from '@/lib/scoring';
import type { PerPlayerScore } from '@/lib/scoring';

interface GameCompleteProps {
  /** The match data */
  match: Game;
  /** Target team shirts with their final states */
  targetShirts: ShirtGameData[];
  /** Opponent team shirts with their final states */
  opponentShirts: ShirtGameData[];
  /** Target team name */
  targetTeamName: string;
  /** Opponent team name */
  opponentTeamName: string;
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

export default function GameComplete({ match, targetShirts, opponentShirts, targetTeamName, opponentTeamName, onPlayAgain }: GameCompleteProps) {
  const home = match.homeClub?.name ?? 'Home';
  const away = match.awayClub?.name ?? 'Away';
  const dateLabel = formatMatchDate(match.date) ?? match.season;

  // Combine both teams for stats
  const allShirts = [...targetShirts, ...opponentShirts];
  const totalShirts = allShirts.length;
  const correctCount = allShirts.filter(s => s.state === 'correct').length;
  const allCorrect = correctCount === totalShirts;
  const targetSolved = targetShirts.filter(s => s.state === 'correct').length;
  const opponentSolved = opponentShirts.filter(s => s.state === 'correct').length;

  const [activeTab, setActiveTab] = useState<'target' | 'opponent'>('target');
  
  // Score breakdown — computed once from the final state
  const scoreBreakdown = computeTotalScore(targetShirts, opponentShirts, targetTeamName, opponentTeamName);
  const scoreMap = new Map(scoreBreakdown.perPlayer.map(p => [p.token, p]));

  function renderTeamSection(shirts: ShirtGameData[], scores: Map<string, PerPlayerScore>) {
    return (
      <div>
        <div className="space-y-2">
          {shirts
            .slice()
            .sort((a, b) => (POSITION_ORDER[a.position ?? ''] ?? 99) - (POSITION_ORDER[b.position ?? ''] ?? 99))
            .map((shirt) => {
              const isCorrect = shirt.state === 'correct';
              const isFailed = shirt.state === 'failed';
              const showName = isCorrect || isFailed;

              return (
                <div
                  key={shirt.token}
                  className="flex items-center gap-2 p-2 rounded-lg transition-colors"
                  style={{
                    backgroundColor: isCorrect
                      ? 'var(--color-correct)/10'
                      : isFailed
                      ? 'var(--color-failed)/10'
                      : 'var(--color-ink/5)',
                    border: `1px solid ${isCorrect ? 'var(--color-correct)/30' : isFailed ? 'var(--color-failed)/30' : 'var(--color-ink/10)'}`,
                  }}
                >
                  <span className="shrink-0 w-8 text-center font-display text-base text-ink/60" aria-label={`Shirt ${shirt.shirtNumber ?? '?'}`}>
                    {shirt.shirtNumber ?? '?'}
                  </span>
                  <span className="shrink-0 min-w-[2.5rem] text-xs font-mono text-ink/50 text-left uppercase">
                    {getPositionLabel(shirt.position)}
                  </span>
                  <span
                    className="flex-1 truncate font-semibold text-sm"
                    style={{
                      color: isCorrect ? 'var(--color-correct)' : isFailed ? 'var(--color-failed)' : 'var(--color-ink/40)',
                    }}
                  >
                    {showName && shirt.name ? shirt.name : '—'}
                  </span>
                  {showName && (() => {
                    const score = scores.get(shirt.token);
                    if (!score) return null;
                    return (
                      <span
                        className={`shrink-0 font-mono text-xs ${
                          isCorrect ? 'text-correct' : 'text-failed'
                        }`}
                        aria-label={`${score.attempts} attempts, ${score.totalPoints} points`}
                      >
                        {score.attempts}T · {score.totalPoints}pt
                      </span>
                    );
                  })()}
                  {showName && (
                    <span
                      className="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full"
                      style={{ backgroundColor: isCorrect ? 'var(--color-correct)' : 'var(--color-failed)' }}
                      aria-label={isCorrect ? 'Correct' : 'Failed'}
                    >
                      {isCorrect ? (
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M2.5 6.5 L5 9 L9.5 3.5" />
                        </svg>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-labelledby="game-complete-title">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/70 backdrop-blur-sm"
        aria-hidden="true"
        style={{ animation: 'fade-in 200ms ease-out' }}
      />

      {/* Modal content */}
      <div className="relative w-full max-w-lg max-h-[90dvh] scrollbar-hide rounded-2xl bg-paper shadow-[0_32px_64px_-12px_rgba(16,24,32,0.5)] overflow-y-auto">
        {/* Header with result */}
        <header className="relative px-6 py-6 text-center overflow-hidden">
          <div className="relative flex items-center justify-center gap-8  py-1">
            {/* Result: icon + title */}
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{
                  backgroundColor: allCorrect ? 'var(--color-correct)/15' : 'var(--color-failed)/15',
                  border: `2px solid ${allCorrect ? 'var(--color-correct)' : 'var(--color-failed)'}`,
                }}
                aria-hidden="true"
              >
                {allCorrect ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-correct)' }}>
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-failed)' }}>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                )}
              </div>
              <h1 id="game-complete-title" className="font-display uppercase text-[clamp(20px,3.5vw,26px)] leading-none" style={{ color: allCorrect ? 'var(--color-correct)' : 'var(--color-failed)' }}>
                {allCorrect ? 'Perfect Score!' : 'Game Over'}
              </h1>
            </div>

            {/* Divider */}
            <div className="h-10 w-px bg-ink/10" aria-hidden="true" />

            {/* Score — the hero */}
            <span className="font-display text-[clamp(36px,6vw,44px)] leading-none text-ink">
              {scoreBreakdown.grandTotal.toLocaleString('en-US')}
            </span>
          </div>
        </header>

        {/* Player reveal list with team tabs */}
        <div className="px-6 pb-4">
          <TeamTabBar
            targetTeamName={targetTeamName}
            opponentTeamName={opponentTeamName}
            activeBoard={activeTab}
            targetSolved={targetSolved}
            opponentSolved={opponentSolved}
            onToggle={() => setActiveTab(prev => (prev === 'target' ? 'opponent' : 'target'))}
          />
          <div className="mt-4 max-h-[40vh] scrollbar-hide overflow-y-auto">
            {activeTab === 'target'
              ? renderTeamSection(targetShirts, scoreMap)
              : renderTeamSection(opponentShirts, scoreMap)}
          </div>
        </div>

        {/* Match summary */}
        <div className="border-t border-ink/10 px-6 py-3">
          <div className="flex items-center justify-center gap-4">
            <p className="font-display text-[32px] leading-none text-ink">
              {match.homeScore} – {match.awayScore}
            </p>
            <div className="flex flex-col items-start gap-0.5">
              <p className="font-semibold text-base text-ink">{home}</p>
              <p className="font-semibold text-base text-ink">{away}</p>
            </div>
          </div>

          {(dateLabel || match.competition) && (
            <div className="mt-2 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.08em] text-ink/55">
              {dateLabel && <span>{dateLabel}</span>}
              {dateLabel && match.competition && <span aria-hidden="true">·</span>}
              {match.competition && <span>{match.competition}</span>}
            </div>
          )}
        </div>

        {/* Play Again button */}
        <div className="border-t border-ink/10 px-6 py-3">
          <button
            type="button"
            onClick={onPlayAgain}
            className="w-full h-11 rounded-lg bg-ink text-chalk font-sans font-semibold text-base transition-colors hover:bg-flare focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare active:scale-[0.98]"
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
