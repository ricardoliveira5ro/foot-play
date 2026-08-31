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

/**
 * Match summary: teams + score first, then date and competition.
 * Mobile: centered column with the score alone and prominent.
 * Desktop: one baseline row (name · score · name) with labels beneath.
 */
export default function MatchInfo({ match }: { match: Game }) {
  const home = match.homeClub?.name ?? 'Home';
  const away = match.awayClub?.name ?? 'Away';
  const dateLabel = formatMatchDate(match.date) ?? match.season;

  return (
    <div>
      <div className="flex flex-col items-center gap-1 text-center md:flex-row md:flex-wrap md:items-baseline md:gap-x-3 md:gap-y-1 md:text-left">
        {/* Score — never smaller than 40px */}
        <p className="order-4 font-display text-[40px] leading-none text-ink md:order-2 md:text-[44px]">
          {match.homeScore} – {match.awayScore}
        </p>
        <p className="order-1 text-base font-semibold leading-snug text-ink md:order-1 md:text-xl">
          {home}
        </p>
        <p aria-hidden="true" className="order-2 text-base font-medium text-ink/55 md:hidden">
          v
        </p>
        <p className="order-3 text-base font-semibold leading-snug text-ink md:order-3 md:text-xl">
          {away}
        </p>
      </div>

      {(dateLabel || match.competition) && (
        <div className="mt-2 flex flex-col items-center gap-0.5 md:items-start">
          {dateLabel && (
            <p className="text-xs uppercase tracking-[0.08em] text-ink/55">{dateLabel}</p>
          )}
          {match.competition && (
            <p className="text-xs uppercase tracking-[0.08em] text-ink/55">{match.competition}</p>
          )}
        </div>
      )}
    </div>
  );
}
