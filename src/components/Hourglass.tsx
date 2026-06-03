import { useMemo } from "react";

interface HourglassProps {
  /** 0 = full top (just started), 1 = empty top (done) */
  progress: number;
  flowing: boolean;
  complete: boolean;
}

interface Grain {
  x: number;
  delay: number;
  duration: number;
  r: number;
}

/**
 * Hourglass with fine-grain sand: stippled texture in the chambers and a
 * stream of tiny individual grains falling through the neck.
 */
export function Hourglass({ progress, flowing, complete }: HourglassProps) {
  const p = Math.max(0, Math.min(1, progress));
  const topY = 30 + (145 - 30) * p;
  const bottomY = 270 - (270 - 155) * p;

  // Stable per-mount grain configuration so animation timing doesn't reshuffle each render.
  const grains = useMemo<Grain[]>(() => {
    const list: Grain[] = [];
    const count = 26;
    for (let i = 0; i < count; i++) {
      list.push({
        x: 100 + (Math.random() - 0.5) * 1.8,
        delay: -Math.random() * 0.9,
        duration: 0.55 + Math.random() * 0.45,
        r: 0.35 + Math.random() * 0.3,
      });
    }
    return list;
  }, []);

  // Mound grain decoration (resting on top of the pile)
  const moundGrains = useMemo(
    () =>
      Array.from({ length: 18 }).map(() => ({
        dx: (Math.random() - 0.5) * 2,
        dy: Math.random() * 1.2,
        r: 0.3 + Math.random() * 0.25,
      })),
    [],
  );

  return (
    <svg
      viewBox="0 0 200 300"
      className={`w-full h-full ${complete ? "animate-complete" : ""}`}
      aria-hidden="true"
    >
      <defs>
        <clipPath id="top-chamber">
          <polygon points="30,30 170,30 105,148 95,148" />
        </clipPath>
        <clipPath id="bottom-chamber">
          <polygon points="95,152 105,152 170,270 30,270" />
        </clipPath>

        {/* Fine grain texture for the sand body */}
        <pattern
          id="sand-grain"
          width="2.4"
          height="2.4"
          patternUnits="userSpaceOnUse"
        >
          <rect width="2.4" height="2.4" fill="var(--sand)" />
          <circle cx="0.4" cy="0.6" r="0.35" fill="oklch(0.82 0.05 80)" opacity="0.55" />
          <circle cx="1.7" cy="1.5" r="0.3" fill="oklch(0.86 0.04 80)" opacity="0.45" />
          <circle cx="1.1" cy="2.1" r="0.25" fill="oklch(0.78 0.05 80)" opacity="0.4" />
          <circle cx="2.2" cy="0.3" r="0.22" fill="oklch(0.9 0.03 80)" opacity="0.5" />
        </pattern>

        {/* Slightly grainy top edge so the surface doesn't read as a solid bar */}
        <pattern
          id="sand-edge"
          width="2"
          height="1.6"
          patternUnits="userSpaceOnUse"
        >
          <rect width="2" height="1.6" fill="var(--sand)" />
          <circle cx="0.5" cy="0.4" r="0.35" fill="var(--background)" opacity="0.35" />
          <circle cx="1.5" cy="1.2" r="0.3" fill="var(--background)" opacity="0.3" />
        </pattern>

        <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(1 0 0 / 0.06)" />
          <stop offset="50%" stopColor="oklch(1 0 0 / 0.02)" />
          <stop offset="100%" stopColor="oklch(1 0 0 / 0.06)" />
        </linearGradient>
      </defs>

      {/* Caps */}
      <line x1="20" y1="20" x2="180" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
      <line x1="20" y1="280" x2="180" y2="280" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.85" />

      {/* Glass body */}
      <polygon points="30,30 170,30 105,148 95,148" fill="url(#glass)" />
      <polygon points="95,152 105,152 170,270 30,270" fill="url(#glass)" />

      {/* Top sand */}
      <g clipPath="url(#top-chamber)">
        <rect x="0" y={topY + 1.2} width="200" height={200} fill="url(#sand-grain)" />
        {/* Grainy top surface line */}
        <rect x="0" y={topY} width="200" height="1.6" fill="url(#sand-edge)" />
      </g>

      {/* Bottom chamber: pile + falling grains */}
      <g clipPath="url(#bottom-chamber)">
        <rect x="0" y={bottomY + 1} width="200" height={300 - bottomY} fill="url(#sand-grain)" />
        {/* Mound */}
        {p > 0.02 && (
          <>
            <ellipse
              cx="100"
              cy={bottomY + 2}
              rx={6 + 30 * p}
              ry={3 + 6 * p}
              fill="url(#sand-grain)"
            />
            {moundGrains.map((g, i) => (
              <circle
                key={i}
                cx={100 + g.dx * (6 + 30 * p) * 0.9}
                cy={bottomY + 1.5 + g.dy}
                r={g.r}
                fill="var(--sand)"
                opacity={0.85}
              />
            ))}
          </>
        )}
        {/* Falling individual grains */}
        {flowing && p > 0 && p < 1 && (
          <g>
            {grains.map((g, i) => (
              <circle
                key={i}
                cx={g.x}
                cy="0"
                r={g.r}
                fill="var(--sand)"
                opacity={0.9}
                style={{
                  animation: `grain-fall ${g.duration}s linear ${g.delay}s infinite`,
                }}
              />
            ))}
          </g>
        )}
      </g>

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
