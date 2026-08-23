/**
 * The vertical pitch: mowing stripes + chalk markings + vignette.
 * Purely presentational; children (shirts) are layered on top.
 */

const STRIPES =
  'repeating-linear-gradient(to bottom, #17603C 0 12.5%, #1C7147 12.5% 25%)';

interface PitchProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  'aria-hidden'?: boolean;
}

export default function Pitch({ children, className, style, 'aria-hidden': ariaHidden }: PitchProps) {
  return (
    <div
      className={`animate-pitch-in relative aspect-[2/3] w-full rounded-xl shadow-[0_24px_48px_-24px_rgba(16,24,32,0.45)] ${className ?? ''}`}
      style={{ backgroundImage: STRIPES, ...style }}
      aria-hidden={ariaHidden}
    >
      {/* Chalk markings */}
      <svg
        viewBox="0 0 200 300"
        fill="none"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
      >
        <g stroke="#F8FAF8" strokeOpacity=".85" strokeWidth="1.5">
          {/* Boundary */}
          <rect x="6" y="6" width="188" height="288" />
          {/* Halfway line */}
          <line x1="6" y1="150" x2="194" y2="150" />
          {/* Center circle */}
          <circle cx="100" cy="150" r="26" />
          {/* Penalty areas */}
          <rect x="41" y="6" width="118" height="47" />
          <rect x="41" y="247" width="118" height="47" />
          {/* Six-yard boxes */}
          <rect x="73" y="6" width="54" height="16" />
          <rect x="73" y="278" width="54" height="16" />
          {/* Penalty arcs (clipped outside the boxes) */}
          <path d="M 79.1 53 A 26 26 0 0 0 120.9 53" />
          <path d="M 79.1 247 A 26 26 0 0 1 120.9 247" />
        </g>
        <g fill="#F8FAF8" fillOpacity=".85">
          {/* Center spot + penalty spots */}
          <circle cx="100" cy="150" r="1.5" />
          <circle cx="100" cy="37.5" r="1.5" />
          <circle cx="100" cy="262.5" r="1.5" />
        </g>
      </svg>

      {/* Inset vignette */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_80px_rgba(16,24,32,0.28)]"
      />

      {children}
    </div>
  );
}
