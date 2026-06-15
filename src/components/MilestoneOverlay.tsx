import { useEffect, useState } from "react";

/**
 * Full-screen celebratory overlay shown when the user reaches their daily
 * focus goal. Listens for the `hourglass:milestone:daily` custom event,
 * auto-dismisses after 3s, and dismisses on tap.
 */
export function MilestoneOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onFire = () => setOpen(true);
    window.addEventListener("hourglass:milestone:daily", onFire);
    return () => window.removeEventListener("hourglass:milestone:daily", onFire);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setOpen(false), 3000);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

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

  return (
    <button
      onClick={() => setOpen(false)}
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
          🎯
        </div>
        <h2
          className="font-display text-3xl md:text-4xl tracking-tight text-amber-200"
          style={{ textShadow: "0 0 24px rgba(245,158,11,0.45)" }}
        >
          Daily goal reached
        </h2>
        <p className="mt-2 text-xs uppercase tracking-[0.28em] text-amber-200/60">
          Tagesziel erreicht
        </p>
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
