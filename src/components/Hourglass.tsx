interface HourglassProps {
  /** 0 = full top (just started), 1 = empty top (done) */
  progress: number;
  flowing: boolean;
  complete: boolean;
}

/**
 * Visual hourglass. Top chamber drains as progress goes 0 -> 1.
 * Geometry uses a viewBox of 200x300.
 */
export function Hourglass({ progress, flowing, complete }: HourglassProps) {
  const p = Math.max(0, Math.min(1, progress));
  // Top chamber: y from 30 (top) to 145 (neck). Sand surface drops as p grows.
  const topY = 30 + (145 - 30) * p;
  // Bottom chamber: y from 270 (bottom) to 155 (neck). Sand surface rises as p grows.
  const bottomY = 270 - (270 - 155) * p;

  return (
    <svg
      viewBox="0 0 200 300"
      className={`w-full h-full ${complete ? "animate-complete" : ""}`}
      aria-hidden="true"
    >
      <defs>
        {/* Top chamber: triangle pointing down */}
        <clipPath id="top-chamber">
          <polygon points="30,30 170,30 105,148 95,148" />
        </clipPath>
        {/* Bottom chamber: triangle pointing up */}
        <clipPath id="bottom-chamber">
          <polygon points="95,152 105,152 170,270 30,270" />
        </clipPath>
        <linearGradient id="sand-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--sand-glow)" />
          <stop offset="100%" stopColor="var(--sand)" />
        </linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(1 0 0 / 0.06)" />
          <stop offset="50%" stopColor="oklch(1 0 0 / 0.02)" />
          <stop offset="100%" stopColor="oklch(1 0 0 / 0.06)" />
        </linearGradient>
      </defs>

      {/* Frame */}
      <line x1="20" y1="20" x2="180" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
      <line x1="20" y1="280" x2="180" y2="280" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.85" />

      {/* Glass body fill (subtle) */}
      <polygon points="30,30 170,30 105,148 95,148" fill="url(#glass)" />
      <polygon points="95,152 105,152 170,270 30,270" fill="url(#glass)" />

      {/* Top sand */}
      <g clipPath="url(#top-chamber)">
        <rect x="0" y={topY} width="200" height={200} fill="url(#sand-grad)" />
      </g>

      {/* Bottom sand */}
      <g clipPath="url(#bottom-chamber)">
        <rect x="0" y={bottomY} width="200" height={300 - bottomY} fill="url(#sand-grad)" />
        {/* mound peak */}
        {p > 0.02 && (
          <ellipse
            cx="100"
            cy={bottomY + 2}
            rx={6 + 30 * p}
            ry={3 + 6 * p}
            fill="url(#sand-grad)"
          />
        )}
      </g>

      {/* Falling sand stream */}
      {flowing && p > 0 && p < 1 && (
        <rect
          x="99"
          y="148"
          width="2"
          height={Math.max(0, bottomY - 148)}
          fill="var(--sand)"
          className="sand-stream"
          opacity="0.9"
        />
      )}

      {/* Glass outline */}
      <polygon
        points="30,30 170,30 105,148 105,152 170,270 30,270 95,152 95,148"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        opacity="0.55"
      />
    </svg>
  );
}
