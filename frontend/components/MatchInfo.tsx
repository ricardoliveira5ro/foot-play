import type { Game } from '@/types';

function formatMatchDate(date: string | null): string | null {
  if (!date) {
    return null;
  }
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Compact matchday scoreboard with the result aligned between both teams. */
export default function MatchInfo({ match }: { match: Game }) {
  const home = match.homeClub?.name ?? 'Home';
  const away = match.awayClub?.name ?? 'Away';
  const dateLabel = formatMatchDate(match.date) ?? match.season;

  return (
    <div className="w-full">
      <div
        role="group"
        className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-center"
        aria-label={`${home} ${match.homeScore}, ${away} ${match.awayScore}`}
      >
        <div className="min-w-0">
          <p className="font-display text-[48px] leading-[0.9] text-ink">{match.homeScore}</p>
          <p className="mt-2 text-lg font-semibold leading-tight text-ink">{home}</p>
        </div>
        <span aria-hidden="true" className="-mt-5 font-display text-3xl leading-none text-flare">–</span>
        <div className="min-w-0">
          <p className="font-display text-[48px] leading-[0.9] text-ink">{match.awayScore}</p>
          <p className="mt-2 text-lg font-semibold leading-tight text-ink">{away}</p>
        </div>
      </div>

      {(dateLabel || match.competition) && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 text-[12px] uppercase tracking-[0.12em] text-ink/50">
          {dateLabel && <p>{dateLabel}</p>}
          {dateLabel && match.competition && <span aria-hidden="true">·</span>}
          {match.competition && <p>{match.competition}</p>}
        </div>
      )}
    </div>
  );
}
