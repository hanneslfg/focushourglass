import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, Pause, RotateCcw, Minus, Plus } from "lucide-react";
import { Hourglass } from "@/components/Hourglass";

type Theme = "light" | "dark";

const TITLE = "Focus Hourglass — Embeddable Focus Timer";
const DESCRIPTION = "A compact hourglass focus timer you can embed on any website.";

export const Route = createFileRoute("/embed")({
  validateSearch: (s: Record<string, unknown>): { theme?: Theme } => ({
    theme: s.theme === "light" ? "light" : s.theme === "dark" ? "dark" : undefined,
  }),
  headers: () => ({
    "Content-Security-Policy": "frame-ancestors *",
  }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmbedPage,
});

function fmt(sec: number) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const THEMES: Record<Theme, React.CSSProperties> = {
  dark: {
    ["--embed-fg" as string]: "oklch(0.96 0.005 270)",
    ["--embed-muted" as string]: "oklch(0.7 0.01 270)",
    ["--embed-border" as string]: "oklch(0.96 0.005 270 / 0.2)",
    ["--sand" as string]: "oklch(0.97 0.012 85)",
    ["--sand-glow" as string]: "oklch(0.92 0.04 80)",
  },
  light: {
    ["--embed-fg" as string]: "oklch(0.2 0.01 270)",
    ["--embed-muted" as string]: "oklch(0.45 0.01 270)",
    ["--embed-border" as string]: "oklch(0.2 0.01 270 / 0.2)",
    ["--sand" as string]: "oklch(0.72 0.09 75)",
    ["--sand-glow" as string]: "oklch(0.78 0.1 75)",
  },
};

function EmbedPage() {
  const { theme = "dark" } = Route.useSearch();
  const [minutes, setMinutes] = useState(25);
  // Timestamp-based: endAt while running, frozen remaining while paused.
  const [endAt, setEndAt] = useState<number | null>(null);
  const [pausedRemaining, setPausedRemaining] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const total = minutes * 60;
  const running = endAt !== null;
  const remaining = running
    ? Math.max(0, (endAt - now) / 1000)
    : pausedRemaining ?? total;
  const complete = running && remaining <= 0;

  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [running]);

  // Transparent page background so the host site shows through.
  useEffect(() => {
    const prev = [document.documentElement.style.background, document.body.style.background];
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      document.documentElement.style.background = prev[0];
      document.body.style.background = prev[1];
    };
  }, []);

  const start = () => {
    const t = Date.now();
    setNow(t);
    setEndAt(t + (pausedRemaining ?? total) * 1000);
    setPausedRemaining(null);
  };
  const pause = () => {
    setPausedRemaining(remaining);
    setEndAt(null);
  };
  const reset = () => {
    setEndAt(null);
    setPausedRemaining(null);
  };
  const idle = !running && pausedRemaining === null;
  const progress = total > 0 ? 1 - remaining / total : 1;

  const btn =
    "inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md border text-sm transition-opacity hover:opacity-80";

  return (
    <div
      style={{ ...THEMES[theme], color: "var(--embed-fg)", minWidth: 280, minHeight: 360 }}
      className="h-screen w-full flex flex-col items-center justify-between gap-2 p-3 overflow-hidden bg-transparent"
    >
      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div className="h-full max-h-60 aspect-[4/5]">
          <Hourglass progress={progress} flowing={running && !complete} complete={complete} />
        </div>
      </div>

      <div className="font-display text-4xl tabular-nums tracking-tight">{fmt(remaining)}</div>

      {idle && (
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--embed-muted)" }}>
          <button
            aria-label="Decrease minutes"
            onClick={() => setMinutes((m) => Math.max(1, m - 5))}
            className="h-7 w-7 rounded-full border flex items-center justify-center"
            style={{ borderColor: "var(--embed-border)" }}
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="tabular-nums w-14 text-center">{minutes} min</span>
          <button
            aria-label="Increase minutes"
            onClick={() => setMinutes((m) => Math.min(600, m + 5))}
            className="h-7 w-7 rounded-full border flex items-center justify-center"
            style={{ borderColor: "var(--embed-border)" }}
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        {running && !complete ? (
          <button onClick={pause} className={btn} style={{ borderColor: "var(--embed-border)" }}>
            <Pause className="h-3.5 w-3.5" /> Pause
          </button>
        ) : (
          <button
            onClick={start}
            disabled={complete}
            className={`${btn} disabled:opacity-30`}
            style={{ borderColor: "var(--embed-border)" }}
          >
            <Play className="h-3.5 w-3.5" /> {pausedRemaining !== null ? "Resume" : "Start"}
          </button>
        )}
        <button onClick={reset} className={btn} style={{ borderColor: "var(--embed-border)" }}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
      </div>

      <a
        href="https://focushourglass.com"
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] hover:underline"
        style={{ color: "var(--embed-muted)" }}
      >
        Focus Hourglass ↗
      </a>
    </div>
  );
}
