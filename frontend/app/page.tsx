import Link from 'next/link';
import Pitch from '@/components/Pitch';
import Logo from '@/components/Logo';

const games = [
  {
    id: 'missing-eleven',
    name: 'Missing Eleven',
    tagline: 'Guess the starting XI from a famous match. Wordle logic, football heart.',
    status: 'play' as const,
    href: '/missing-eleven',
    accent: '#E8590C',
  },
  {
    id: 'guess-formation',
    name: 'Guess the Formation',
    tagline: 'Spot the tactical shape from the lineup alone.',
    status: 'soon' as const,
    href: '/guess-formation',
    accent: '#15803D',
  },
  {
    id: 'transfer-links',
    name: 'Transfer Links',
    tagline: 'Chain players by their career moves.',
    status: 'soon' as const,
    href: '/transfer-links',
    accent: '#1E40AF',
  },
  {
    id: 'career-path',
    name: 'Career Path',
    tagline: 'Trace a journey from cryptic clues.',
    status: 'soon' as const,
    href: '/career-path',
    accent: '#7C2D12',
  },
  {
    id: 'kit-quiz',
    name: 'Kit Quiz',
    tagline: 'Name the team from the shirt.',
    status: 'soon' as const,
    href: '/kit-quiz',
    accent: '#BE185D',
  },
];

function PlatformPitch({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <Pitch className={className} style={style} aria-hidden={true} />
  );
}

function GameCard({ game, index }: { game: typeof games[0]; index: number }) {
  const isPlayable = game.status === 'play';
  return (
    <article
      className={`group relative flex flex-col h-full rounded-2xl border transition-all duration-300 ${
        isPlayable
          ? 'border-flare/30 bg-[linear-gradient(135deg,#F6F7F4_0%,#F0F2EE_100%)] shadow-[0_4px_24px_-4px_rgba(232,89,12,0.15)]'
          : 'border-ink/10 bg-paper hover:border-flare/20 hover:shadow-[0_8px_32px_-8px_rgba(16,24,32,0.08)]'
      }`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Mini pitch preview */}
      <div className="relative aspect-[2/3] w-full rounded-t-2xl overflow-hidden" aria-hidden="true">
        <PlatformPitch
          className="animate-pitch-in"
          style={{ transform: 'scale(0.85)', transformOrigin: 'center top' }}
        />
        {/* Game-specific accent mark */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1.5"
          style={{
            background: `linear-gradient(90deg, transparent 40%, ${game.accent} 50%, transparent 60%)`,
            opacity: isPlayable ? 1 : 0.3,
          }}
        />
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-sans font-semibold text-ink text-base leading-snug truncate">
            {game.name}
          </h3>
          <span
            className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
              isPlayable
                ? 'bg-flare/10 text-flare'
                : 'bg-ink/5 text-ink/40'
            }`}
          >
            {isPlayable ? 'Play now' : 'Coming soon'}
          </span>
        </div>
        <p className="text-sm text-ink/55 flex-1 mb-4 leading-relaxed">{game.tagline}</p>
        <Link
          href={game.href}
          className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-sans font-medium text-sm transition-all ${
            isPlayable
              ? 'bg-ink text-chalk hover:bg-flare focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare'
              : 'bg-ink/5 text-ink/40 cursor-not-allowed'
          }`}
          aria-disabled={!isPlayable}
          tabIndex={isPlayable ? 0 : -1}
        >
          {isPlayable ? 'Play' : 'Notify me'}
          <span
            className={`transition-transform group-hover:translate-x-1 ${isPlayable ? 'text-chalk' : 'text-ink/40'}`}
            aria-hidden="true"
          >
            →
          </span>
        </Link>
      </div>
    </article>
  );
}

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-8 md:py-12 lg:py-16">
      {/* Hero: The Logo — the platform's identity */}
      <main className="mb-16 md:mb-20 flex flex-col items-center text-center">
        <div className="mb-8 md:mb-12 animate-hero-in" style={{ animationDelay: '100ms' }}>
          <Logo size={120} variant="default" />
        </div>

        <h1 className="font-display uppercase leading-[0.88] text-ink tracking-tight mb-5" style={{ fontSize: 'clamp(44px, 8vw, 96px)', letterSpacing: '-0.03em' }}>
          Football mini-games
        </h1>
        <p className="mx-auto max-w-2xl text-lg md:text-xl text-ink/60 mb-10" style={{ fontFamily: 'var(--font-sans)', lineHeight: 1.75 }}>
          One platform. Many puzzles. Test your football knowledge through interactive games — each a different lens on the beautiful game.
        </p>

        <Link
          href="/missing-eleven"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-8 py-3.5 font-sans font-semibold text-chalk text-base md:text-lg transition-colors hover:bg-flare focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare active:scale-[0.98]"
          style={{ minWidth: '240px' }}
        >
          Start with Missing Eleven
        </Link>
      </main>

      {/* Fixture List: The game roster */}
      <section className="w-full" aria-labelledby="games-title">
        <div className="flex items-center justify-between mb-10">
          <h2 id="games-title" className="font-sans font-semibold text-ink uppercase tracking-wider text-sm md:text-base">
            The fixture list
          </h2>
          <span className="text-xs text-ink/40 uppercase tracking-widest">v0.1</span>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {games.map((game, index) => (
            <GameCard key={game.id} game={game} index={index} />
          ))}
        </div>
      </section>
    </div>
  );
}
