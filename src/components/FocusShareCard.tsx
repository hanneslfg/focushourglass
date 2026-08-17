/**
 * Focus Share Card — read-only export/share surface.
 *
 * Renders a 1080x1920 (Instagram Story) card that is visually downscaled for
 * preview via a CSS transform on a *wrapper* (the card node itself stays at
 * full pixel size so html-to-image exports crisply at 1080x1920).
 *
 * Export-friendly by design: no backdrop-filter, no blur, only solid colors
 * and simple linear gradients.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Flame, Download, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { getSessions } from "@/lib/sessions";
import { getDailyStreak } from "@/lib/streaks";
import { effectiveDayKey } from "@/lib/settings";
import {
  RANGE_LABELS,
  RANGE_PHRASES,
  TIME_RANGES,
  focusedMinutesInRange,
  formatFocusedMinutes,
  type TimeRange,
} from "@/lib/timeAggregation";

const CARD_W = 1080;
const CARD_H = 1920;
const BLOCK_MIN = 90;

const TAB_LABELS: Record<TimeRange, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  year: "Year",
  all: "All-time",
};

function ShareHourglass({ fill }: { fill: number }) {
  const p = Math.max(0, Math.min(1, fill));
  const id = p.toFixed(3).replace(".", "");
  const topFillY = 8 + (34 - 8) * p;
  const bottomFillY = 62 - (62 - 40) * p;
  const done = p >= 1;
  const stroke = done ? "#f2cd82" : "rgba(255,255,255,0.45)";
  return (
    <svg viewBox="0 0 48 72" width="140" height="210" aria-hidden="true">
      <defs>
        <clipPath id={`sh-top-${id}`}>
          <polygon points="8,8 40,8 26,36 22,36" />
        </clipPath>
        <clipPath id={`sh-bot-${id}`}>
          <polygon points="22,38 26,38 40,64 8,64" />
        </clipPath>
        <linearGradient id={`sh-sand-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f7dfae" />
          <stop offset="100%" stopColor="#c8933f" />
        </linearGradient>
      </defs>
      <line x1="6" y1="6" x2="42" y2="6" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="6" y1="66" x2="42" y2="66" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" />
      {p > 0 && (
        <>
          <g clipPath={`url(#sh-top-${id})`}>
            <rect x="0" y={topFillY} width="48" height="40" fill={`url(#sh-sand-${id})`} />
          </g>
          <g clipPath={`url(#sh-bot-${id})`}>
            <rect x="0" y={bottomFillY} width="48" height="40" fill={`url(#sh-sand-${id})`} />
          </g>
        </>
      )}
      <polygon
        points="8,8 40,8 26,36 26,38 40,64 8,64 22,38 22,36"
        fill="none"
        stroke={stroke}
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FocusShareCard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [range, setRange] = useState<TimeRange>("week");
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [scale, setScale] = useState(0.28);
  const cardRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const bump = () => setTick((t) => t + 1);
    bump();
    window.addEventListener("hourglass:sessions", bump);
    window.addEventListener("hourglass:settings", bump);
    return () => {
      window.removeEventListener("hourglass:sessions", bump);
      window.removeEventListener("hourglass:settings", bump);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // Fit the full-size card into the available preview width.
  useEffect(() => {
    if (!open) return;
    const fit = () => {
      const w = frameRef.current?.clientWidth ?? 320;
      setScale(Math.min(w / CARD_W, 520 / CARD_H));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open]);

  const { streak, todayMinutes, value } = useMemo(() => {
    if (typeof window === "undefined" || !open)
      return { streak: 0, todayMinutes: 0, value: "0m" };
    const sessions = getSessions();
    const today = effectiveDayKey(new Date());
    const todayMinutes = sessions
      .filter((s) => effectiveDayKey(s.startedAt || s.completedAt) === today)
      .reduce((sum, s) => sum + (s.focusedMinutes || 0), 0);
    return {
      streak: getDailyStreak(),
      todayMinutes,
      value: formatFocusedMinutes(focusedMinutesInRange(range, sessions), range),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, tick, open]);

  const blocks = [0, 1, 2].map((i) =>
    Math.max(0, Math.min(1, (todayMinutes - i * BLOCK_MIN) / BLOCK_MIN)),
  );

  const shareText = `${streak} day streak on Focus Hourglass — ${value} focused ${RANGE_PHRASES[range]}.`;

  async function renderPng(): Promise<Blob | null> {
    const node = cardRef.current;
    if (!node) return null;
    // Custom fonts must be resolved before rasterizing, otherwise the export
    // falls back to a system serif.
    if (document.fonts?.ready) await document.fonts.ready;
    const { toBlob } = await import("html-to-image");
    return toBlob(node, {
      width: CARD_W,
      height: CARD_H,
      pixelRatio: 1,
      cacheBust: true,
      backgroundColor: "#0a0a0b",
      style: { transform: "none", margin: "0" },
    });
  }

  async function handleSaveImage() {
    setBusy(true);
    try {
      const blob = await renderPng();
      if (!blob) throw new Error("render failed");
      const file = new File([blob], "focus-hourglass.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], text: shareText });
        toast.success("Shared");
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "focus-hourglass.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast.success("Saved");
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast.error("Couldn't create the image");
    } finally {
      setBusy(false);
    }
  }

  async function handleShareText() {
    try {
      if (navigator.share) {
        await navigator.share({ text: shareText });
        toast.success("Shared");
        return;
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener");
      toast.success("Shared");
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast.error("Couldn't share");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label="Focus share card"
        className="relative w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-2xl max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Share your focus
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="h-8 w-8 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center"
            aria-label="Close"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </div>

        {/* Range tabs — not part of the exported image */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {TIME_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 rounded-full border text-[10px] uppercase tracking-[0.18em] transition-colors ${
                range === r
                  ? "border-[var(--gold-2)] text-[var(--gold-1)]"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {TAB_LABELS[r]}
            </button>
          ))}
        </div>

        {/* Preview frame: card renders at full 1080x1920 and is scaled down */}
        <div ref={frameRef} className="w-full overflow-hidden rounded-xl">
          <div style={{ height: CARD_H * scale }}>
            <div
              style={{
                width: CARD_W,
                height: CARD_H,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              <div
                ref={cardRef}
                style={{
                  width: CARD_W,
                  height: CARD_H,
                  background: "linear-gradient(180deg, #101013 0%, #0a0a0b 55%, #0d0b08 100%)",
                  color: "#f5f3ef",
                  display: "flex",
                  flexDirection: "column",
                  padding: "96px 88px",
                  boxSizing: "border-box",
                }}
              >
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 30,
                      letterSpacing: "0.28em",
                      textTransform: "uppercase",
                      color: "rgba(245,243,239,0.6)",
                    }}
                  >
                    Focus Hourglass
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, color: "#f2cd82" }}>
                    <Flame width={40} height={40} strokeWidth={1.6} />
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 56, lineHeight: 1 }}>
                      {streak}
                    </span>
                  </div>
                </div>

                {/* Centerpiece */}
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 24,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 34,
                      letterSpacing: "0.3em",
                      textTransform: "uppercase",
                      color: "rgba(245,243,239,0.55)",
                    }}
                  >
                    {RANGE_LABELS[range]}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 260,
                      lineHeight: 1,
                      color: "#f2cd82",
                    }}
                  >
                    {value}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 32,
                      letterSpacing: "0.24em",
                      textTransform: "uppercase",
                      color: "rgba(245,243,239,0.45)",
                    }}
                  >
                    focused
                  </div>

                  {/* Today's three blocks */}
                  <div style={{ display: "flex", gap: 56, marginTop: 96 }}>
                    {blocks.map((f, i) => (
                      <ShareHourglass key={i} fill={f} />
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div style={{ borderTop: "1px solid rgba(245,243,239,0.14)", paddingTop: 36 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 28,
                      letterSpacing: "0.22em",
                      textTransform: "uppercase",
                      color: "rgba(245,243,239,0.5)",
                      textAlign: "center",
                    }}
                  >
                    day {streak} streak · never miss twice
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Export actions */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button
            onClick={handleSaveImage}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--gold-2)] text-[var(--gold-1)] px-4 py-2.5 text-[11px] uppercase tracking-[0.2em] disabled:opacity-50 hover:bg-[var(--gold-2)]/10 transition-colors"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
            {busy ? "Rendering…" : "Save image"}
          </button>
          <button
            onClick={handleShareText}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-border text-foreground px-4 py-2.5 text-[11px] uppercase tracking-[0.2em] hover:border-foreground/60 transition-colors"
          >
            <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.8} />
            Share as text
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground/70 text-center">“{shareText}”</p>
      </div>
    </div>
  );
}

export { Share2 as ShareCardIcon };
