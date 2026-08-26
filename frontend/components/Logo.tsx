'use client';

import { forwardRef } from 'react';

interface LogoProps extends React.SVGAttributes<SVGSVGElement> {
  /** Visual size — the SVG scales via width/height */
  size?: number | string;
  /** Variant for different contexts */
  variant?: 'default' | 'wordmark' | 'icon-only';
}

const Logo = forwardRef<SVGSVGElement, LogoProps>(
  ({ size = 48, variant = 'default', className, style, children, ...props }, ref) => {
    const dimension = typeof size === 'number' ? `${size}px` : size;

    return (
      <svg
        ref={ref}
        width={dimension}
        height={dimension}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="FootPlay"
        className={className}
        style={{ ...style, width: dimension, height: dimension, flexShrink: 0 }}
        {...props}
      >
        {/* Outer ring — turf */}
        <circle
          cx="32"
          cy="32"
          r="28"
          stroke="#17603C"
          strokeWidth="4"
          fill="none"
        />
        {/* Inner ring — chalk line */}
        <circle
          cx="32"
          cy="32"
          r="22"
          stroke="#F8FAF8"
          strokeWidth="2.5"
          fill="none"
          strokeOpacity="0.9"
        />
        {/* Centre spot — flare (the "play" moment) */}
        <circle
          cx="32"
          cy="32"
          r="6"
          fill="#E8590C"
        />
        {/* Optional: subtle highlight on spot for depth at large sizes */}
        {variant !== 'icon-only' && (
          <circle
            cx="30"
            cy="30"
            r="1.5"
            fill="#FFB36B"
            fillOpacity="0.6"
          />
        )}
        {children}
      </svg>
    );
  }
);

Logo.displayName = 'Logo';

export default Logo;
