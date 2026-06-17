import { useEffect, useState } from "react";

type Variant = "daily" | "record";

interface OverlayPayload {
  variant: Variant;
  minutes?: number;
  previous?: number;
}

function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Full-screen celebratory overlay shown when the user reaches their daily
 * focus goal OR sets a new personal daily record. Auto-dismisses after 3.4s,
 * dismisses on tap.
 */
export function MilestoneOverlay() {
  const [payload, setPayload] = useState<OverlayPayload | null>(null);

  useEffect(() => {
    const onDaily = () => setPayload({ variant: "daily" });
    const onRecord = (e: Event) => {
      const detail = (e as CustomEvent<{ minutes?: number; previous?: number }>).detail ?? {};
      setPayload({ variant: "record", minutes: detail.minutes, previous: detail.previous });
    };
    window.addEventListener("hourglass:milestone:daily", onDaily);
    window.addEventListener("hourglass:milestone:record", onRecord);
    return () => {
      window.removeEventListener("hourglass:milestone:daily", onDaily);
      window.removeEventListener("hourglass:milestone:record", onRecord);
    };
  }, []);

  useEffect(() => {
    if (!payload) return;
    const t = window.setTimeout(() => setPayload(null), 3400);
    return () => window.clearTimeout(t);
  }, [payload]);

  if (!payload) return null;

  // 14 ember particles distributed around the center
  const particles = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2;
    const dist = 120 + (i % 3) * 40;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const delay = (i % 5) * 0.08;
    const size = 4 + (i % 3) * 2;
    return { dx, dy, delay, size, i };
  });

  const isRecord = payload.variant === "record";
  const title = isRecord ? "New daily record" : "Daily goal reached";
  const kicker = isRecord ? "Persönlicher Rekord" : "Tagesziel erreicht";
  const icon = isRecord ? "👑" : "🎯";

  return (
    <button
      onClick={() => setPayload(null)}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in cursor-pointer"
      aria-label="Dismiss"
    >
      {/* radial amber glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at center, rgba(245,158,11,0.22) 0%, rgba(245,158,11,0.06) 30%, transparent 60%)",
        }}
      />

      {/* particles */}
      <div className="absolute left-1/2 top-1/2 pointer-events-none">
        {particles.map((p) => (
          <span
            key={p.i}
            className="absolute block rounded-full"
            style={{
              width: p.size,
              height: p.size,
              left: 0,
              top: 0,
              background: "rgba(252,211,77,0.9)",
              boxShadow: "0 0 12px rgba(245,158,11,0.8)",
              animation: `milestone-ember 2.4s ${p.delay}s ease-out forwards`,
              ["--mx" as never]: `${p.dx}px`,
              ["--my" as never]: `${p.dy}px`,
            }}
          />
        ))}
      </div>

      {/* central card */}
      <div className="relative animate-scale-in text-center px-8 py-10">
        <div
          className="text-6xl md:text-7xl mb-4 select-none"
          style={{ filter: "drop-shadow(0 0 24px rgba(245,158,11,0.6))" }}
        >
          {icon}
        </div>
        <h2
          className="font-display text-3xl md:text-4xl tracking-tight text-amber-200"
          style={{ textShadow: "0 0 24px rgba(245,158,11,0.45)" }}
        >
          {title}
        </h2>
        <p className="mt-2 text-xs uppercase tracking-[0.28em] text-amber-200/60">
          {kicker}
        </p>
        {isRecord && payload.minutes != null && (
          <div className="mt-6 flex items-center justify-center gap-4 text-amber-100/90">
            <div className="text-center">
              <div className="font-display text-2xl md:text-3xl tabular-nums tracking-tight">
                {fmtMinutes(payload.minutes)}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.24em] text-amber-200/50">
                Today
              </div>
            </div>
            {payload.previous != null && payload.previous > 0 && (
              <>
                <div className="h-8 w-px bg-amber-200/20" />
                <div className="text-center">
                  <div className="font-display text-2xl md:text-3xl tabular-nums tracking-tight text-amber-100/50 line-through decoration-amber-200/30">
                    {fmtMinutes(payload.previous)}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.24em] text-amber-200/50">
                    Previous best
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes milestone-ember {
          0%   { transform: translate(0, 0) scale(0.4); opacity: 0; }
          15%  { opacity: 1; }
          100% { transform: translate(var(--mx), var(--my)) scale(1); opacity: 0; }
        }
      `}</style>
    </button>
  );
}
