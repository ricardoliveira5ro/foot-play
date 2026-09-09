'use client';

interface TeamTabBarProps {
  targetTeamName: string;
  opponentTeamName: string;
  activeBoard: 'target' | 'opponent';
  targetSolved: number; // 0-11, count of correct shirts
  opponentSolved: number; // 0-11, count of correct shirts
  onToggle: () => void;
}

const TOTAL_PILLS = 11;

/** Segmented tab bar with team names and 11 progress pills per tab. */
export default function TeamTabBar({
  targetTeamName,
  opponentTeamName,
  activeBoard,
  targetSolved,
  opponentSolved,
  onToggle,
}: TeamTabBarProps) {
  return (
    <div role="tablist" aria-label="Team selector" className="flex gap-0">
      <TeamTab
        teamName={targetTeamName}
        isActive={activeBoard === 'target'}
        solved={targetSolved}
        onToggle={onToggle}
      />
      <TeamTab
        teamName={opponentTeamName}
        isActive={activeBoard === 'opponent'}
        solved={opponentSolved}
        onToggle={onToggle}
      />
    </div>
  );
}

interface TeamTabProps {
  teamName: string;
  isActive: boolean;
  solved: number;
  onToggle: () => void;
}

function TeamTab({ teamName, isActive, solved, onToggle }: TeamTabProps) {
  const pillClass = (index: number): string => {
    if (index < solved) {
      // Newest solved pill gets a brief scale pulse; others stay static.
      return `bg-correct ${index === solved - 1 ? 'animate-pill-solve' : ''}`;
    }
    return isActive ? 'bg-chalk/30' : 'bg-ink/10';
  };

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-label={isActive ? undefined : `Switch to ${teamName} lineup`}
      tabIndex={isActive ? 0 : -1}
      onClick={isActive ? undefined : onToggle}
      className={[
        'flex-1 px-2 py-2 text-center transition-colors duration-200',
        'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-flare',
        isActive
          ? 'border-b-2 border-flare bg-ink text-chalk'
          : 'border-b border-ink/10 bg-paper text-ink hover:bg-ink/5',
      ].join(' ')}
    >
      <span className="block truncate text-xs font-semibold uppercase tracking-[0.08em]">
        {teamName}
      </span>
      <span className="mt-1.5 flex justify-center gap-1">
        {Array.from({ length: TOTAL_PILLS }, (_, i) => (
          <span key={i} className={`inline-block h-1.5 w-1.5 rounded-full ${pillClass(i)}`} />
        ))}
      </span>
    </button>
  );
}