'use client';

import { useEffect, useRef, useState } from 'react';

interface ScoreCounterProps {
  /** Current total score. */
  score: number;
}

const numberFormatter = new Intl.NumberFormat('en-US');

/**
 * Live score readout shown beside the match summary during gameplay.
 * A quiet full-width line with a mono "SCORE" label and an Anton display value.
 * The value pulses (scale 1 → 1.15 → 1 over 300ms) whenever the score changes.
 */
export default function ScoreCounter({ score }: ScoreCounterProps) {
  const [pulsing, setPulsing] = useState(false);
  const prevScoreRef = useRef(score);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (score !== prevScoreRef.current) {
      prevScoreRef.current = score;
      setPulsing(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setPulsing(false), 300);
    }
  }, [score]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="flex w-full items-center justify-between border-y border-ink/10 py-2">
      <span className="font-mono text-xs uppercase tracking-[0.08em] text-ink/55">Score</span>
      <span
        aria-live="polite"
        key={score}
        className={`font-display text-[30px] leading-none text-ink ${pulsing ? 'animate-score-pulse' : ''}`}
      >
        {numberFormatter.format(score)}
      </span>
    </div>
  );
}
