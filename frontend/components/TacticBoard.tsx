import type { ShirtData } from '@/types';
import Pitch from './Pitch';
import Shirt from './Shirt';

interface TacticBoardProps {
  teamName: string;
  formation: string | null;
  shirts: ShirtData[];
  onShirtClick?: (token: string) => void;
}

/** Team caption + formation label above the pitch, shirts positioned inside. */
export default function TacticBoard({ teamName, formation, shirts, onShirtClick }: TacticBoardProps) {
  return (
    <section aria-label={`${teamName} tactic board`}>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink">{teamName}</h2>
        {formation && (
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink/55">{formation}</p>
        )}
      </div>
      <Pitch>
        {shirts.map((shirt, index) => (
          <Shirt key={shirt.token} shirt={shirt} index={index} onClick={onShirtClick} guessHistory={shirt.guessHistory} />
        ))}
      </Pitch>
    </section>
  );
}
