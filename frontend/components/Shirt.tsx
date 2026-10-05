'use client';

import type { CSSProperties } from 'react';
import type { ShirtData, ShirtState } from '@/types';
import type { GuessResult } from '@/lib/wordle';
import { getCorrectLettersByLength } from '@/lib/wordle';
import type { TeamColorEntry } from '@/lib/teamColors';
import { getTextColor } from '@/lib/colorUtils';
import { badgesForShirt, type ShirtBadge } from '@/lib/shirtBadges';

const SHIRT_PATH =
  'M28 10 L32 13 L36 10 L56 14 L62 15 L62 20 L51 22 L51 58 L13 58 L13 22 L2 20 L2 15 L8 14 L28 10 Z';

/** Default shirt fill when no team colors are provided (matches legacy white). */
const DEFAULT_FILL = '#F8FAF8';
/** Default shirt stroke when no team colors are provided (matches legacy ink). */
const DEFAULT_STROKE = '#101820';

interface ShirtProps {
  shirt: ShirtData;
  /** Squad index, used to stagger the entrance animation. */
  index: number;
  onClick?: (token: string) => void;
  /** Guess history for this shirt (used for LetterSlots preview) */
  guessHistory?: GuessResult[][];
  /**
   * Team colors/pattern for this shirt. When omitted, the shirt renders with
   * the default white/ink styling.
   */
  colors?: TeamColorEntry;
}

/**
 * Accessible wording for the badges actually rendered on this shirt.
 *
 * The icons themselves are aria-hidden, so this is the only channel that
 * carries the information to a screen reader. A visible signal that is not
 * in the accessible name is invisible to part of the audience.
 */
const BADGE_LABELS: Record<ShirtBadge, string> = {
  scorer: 'scored in this match',
  'sent-off': 'sent off in this match',
};

/** State-aware accessible name for the shirt button. */
function shirtAriaLabel(
  state: ShirtState,
  shirtNumber: number | null,
  badges: ShirtBadge[],
  name?: string,
): string {
  const number = shirtNumber ?? '?';
  const goalCount = badges.filter((badge) => badge === 'scorer').length;
  const badgeLabels: string[] = [];
  if (goalCount > 0) {
    badgeLabels.push(
      goalCount === 1 ? BADGE_LABELS.scorer : `scored ${goalCount} goals in this match`,
    );
  }
  if (badges.includes('sent-off')) badgeLabels.push(BADGE_LABELS['sent-off']);
  const badgesSuffix = badgeLabels.length > 0 ? `, ${badgeLabels.join(', ')}` : '';
  switch (state) {
    case 'default':
      return `Shirt ${number}, tap to guess the player${badgesSuffix}`;
    case 'in-progress':
      return `Shirt ${number}, guessing in progress${badgesSuffix}`;
    case 'correct':
      return name
        ? `Shirt ${number}, guessed correctly: ${name}${badgesSuffix}`
        : `Shirt ${number}, guessed correctly${badgesSuffix}`;
    case 'failed':
      return `Shirt ${number}, not guessed${badgesSuffix}`;
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
      data-state-badge={state}
      className={`flex h-4 w-4 items-center justify-center rounded-full text-white ${
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
 * Decorative badge glyph. aria-hidden because the badge is already named in
 * the shirt's aria-label via BADGE_LABELS — announcing it twice is noise.
 */
function BadgeIcon({ badge }: { badge: ShirtBadge }) {
  if (badge === 'scorer') {
    // Ball outline + centre panel + five seams. Uniform 1-unit strokes so the
    // shape stays legible at 12px instead of collapsing into a solid dot.
    return (
      <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="4.6" />
          <path d="M6 4.45 L7.47 5.52 L6.91 7.25 L5.09 7.25 L4.53 5.52 Z" />
          <path d="M6 4.45 V1.4" />
          <path d="M7.47 5.52 10.38 4.58" />
          <path d="M6.91 7.25 8.7 9.72" />
          <path d="M5.09 7.25 3.3 9.72" />
          <path d="M4.53 5.52 1.62 4.58" />
        </g>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
      <rect x="2" y="1" width="8" height="10" rx="1.5" fill="currentColor" />
    </svg>
  );
}

/**
 * A single shirt on the tactic board.
 * Four states: default → in-progress → correct → failed.
 * The whole unit is a button with an expanded (>=44px) hit area.
 */
export default function Shirt({ shirt, index, onClick, guessHistory, colors }: ShirtProps) {
  const { token, nameLength, shirtNumber, coords, state } = shirt;

  // §3.1: no event data on this game means [] for every shirt. There is no
  // per-shirt availability signal and this must not invent one.
  const badges = badgesForShirt({ goals: shirt.goals, redCards: shirt.redCards });
  const hasStateBadge = state === 'correct' || state === 'failed';
  const badgeRowWidth =
    badges.length * 16 +
    Math.max(0, badges.length - 1) * 2 +
    (hasStateBadge ? 16 + (badges.length > 0 ? 2 : 0) : 0);

  // Resolve colors with defaults so the legacy white/ink rendering is preserved
  // when no team colors are provided.
  const primary = colors?.primary ?? DEFAULT_FILL;
  const secondary = colors?.secondary ?? DEFAULT_STROKE;
  const pattern = colors?.pattern ?? 'solid';

  // Unique pattern IDs keyed by the shirt token so two shirts sharing a team
  // on the same board never collide.
  const patternId = `pattern-${token}`;
  const clipId = `clip-${token}`;

  let fill: string | undefined;
  let extraDefs: React.ReactNode = null;

  if (pattern === 'stripes-v') {
    fill = `url(#${patternId}-v)`;
    extraDefs = (
      <pattern
        id={`${patternId}-v`}
        width="8"
        height="64"
        patternUnits="userSpaceOnUse"
      >
        <rect width="4" height="64" fill={primary} />
        <rect x="4" width="4" height="64" fill={secondary} />
      </pattern>
    );
  } else if (pattern === 'stripes-h') {
    fill = `url(#${patternId}-h)`;
    extraDefs = (
      <pattern
        id={`${patternId}-h`}
        width="64"
        height="8"
        patternUnits="userSpaceOnUse"
      >
        <rect width="64" height="4" fill={primary} />
        <rect y="4" width="64" height="4" fill={secondary} />
      </pattern>
    );
  } else if (pattern === 'halves') {
    fill = primary;
    extraDefs = (
      <clipPath id={clipId}>
        <path d={SHIRT_PATH} />
      </clipPath>
    );
  } else {
    // solid (or no colors provided)
    fill = primary;
  }

  const textColor = getTextColor(primary);
  const numberClass = textColor === 'light' ? 'text-white' : 'text-ink';

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
        aria-label={shirtAriaLabel(state, shirtNumber, badges, shirt.name)}
        className={`-m-2 block w-[calc(100%+1rem)] cursor-pointer rounded-md p-2 ${state === 'failed' ? 'opacity-60 saturate-[0.6]' : ''}`}
      >
        {/* Inner wrapper carries the entrance animation so positional and
            hover transforms on the button are never overridden. */}
        <span
          className="animate-shirt-in relative block w-full"
          style={{ '--stagger-delay': `${index * 28}ms` } as CSSProperties}
        >
          <svg viewBox="0 0 64 64" aria-hidden="true" className="block h-auto w-full drop-shadow-[0_2px_3px_rgba(16,24,32,0.25)]">
            <defs>{extraDefs}</defs>
            <path d={SHIRT_PATH} fill={fill} stroke={secondary} strokeWidth="1" strokeLinejoin="round" />
            {pattern === 'halves' && (
              <g clipPath={`url(#${clipId})`}>
                <rect x="32" y="0" width="32" height="64" fill={secondary} />
              </g>
            )}
          </svg>
          {shirtNumber !== null && (
            <span
              className={`absolute inset-0 flex items-center justify-center pt-[4%] font-display leading-none ${numberClass}`}
              style={{
                fontSize: '38cqw',
                ...(colors?.numberOutline ? { WebkitTextStroke: '1px #000' } : {}),
              }}
            >
              {shirtNumber}
            </span>
          )}
        </span>

        {(badges.length > 0 || hasStateBadge) && (
          <span
            aria-hidden="true"
            data-badge-row
            className="absolute -left-1 -top-2 flex items-center justify-between"
            style={{ width: `max(100%, ${badgeRowWidth}px)` }}
          >
            <span data-event-badge-group className="flex shrink-0 items-center gap-0.5">
              {badges.map((badge, index) => (
                <span
                  key={`${badge}-${index}`}
                  data-badge={badge}
                  className={`flex h-4 w-4 items-center justify-center rounded-full border border-ink/15 bg-paper shadow-sm ${
                    badge === 'scorer' ? 'text-ink' : 'text-failed'
                  }`}
                >
                  <BadgeIcon badge={badge} />
                </span>
              ))}
            </span>
            {(state === 'correct' || state === 'failed') && <StateBadge state={state} />}
          </span>
        )}
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
