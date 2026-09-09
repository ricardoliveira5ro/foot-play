import type { ShirtData } from '@/types';
import { getTeamColors, type TeamColorEntry } from '@/lib/teamColors';
import Pitch from './Pitch';
import Shirt from './Shirt';
import TeamTabBar from './TeamTabBar';

interface TacticBoardProps {
  teamName: string;
  formation: string | null;
  shirts: ShirtData[];
  onShirtClick?: (token: string) => void;
  clubId?: number;
  activeBoard?: 'target' | 'opponent';
  targetTeamName: string;
  opponentTeamName: string;
  targetSolved: number;
  opponentSolved: number;
  onToggleBoard: () => void;
}

/** Team caption + formation label above the pitch, shirts positioned inside. */
export default function TacticBoard({ teamName, formation, shirts, onShirtClick, clubId, activeBoard, targetTeamName, opponentTeamName, targetSolved, opponentSolved, onToggleBoard }: TacticBoardProps) {
  const colors: TeamColorEntry | undefined = clubId != null ? getTeamColors(clubId) : undefined;

  return (
    <section aria-label={`${teamName} tactic board`}>
      <div className="mb-3">
        <TeamTabBar
          targetTeamName={targetTeamName}
          opponentTeamName={opponentTeamName}
          activeBoard={activeBoard ?? 'target'}
          targetSolved={targetSolved}
          opponentSolved={opponentSolved}
          onToggle={onToggleBoard}
        />
        {formation && (
          <p className="mt-4 text-right font-mono text-xs uppercase tracking-[0.08em] text-ink/55">{formation}</p>
        )}
      </div>
      <Pitch key={activeBoard ?? 'target'}>
        {shirts.map((shirt, index) => (
          <Shirt key={shirt.token} shirt={shirt} index={index} onClick={onShirtClick} guessHistory={shirt.guessHistory} colors={colors} />
        ))}
      </Pitch>
    </section>
  );
}
