import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Hourglass as HourglassIcon } from "lucide-react";
import {
  LIFE_EXPECTANCY,
  getSettings,
  setSettings,
  persistMementoToCloud,
  type MementoGender,
} from "@/lib/settings";

import { Hourglass } from "@/components/Hourglass";

const MEMENTO_TEXT =
  "Memento Mori — \u201cRemember that you must die.\u201d This is not meant to inspire fear, but to serve as an ultimate reminder of the value of your time. Every moment spent in distraction is a moment lost forever. Focus on what truly matters now.";

function Overlay({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b0b0d] p-6 shadow-2xl">
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 text-white/40 hover:text-white/80 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- Warning confirmation ---------------- */

export function MementoWarningModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Overlay onClose={onCancel}>
      <h2 className="text-lg font-semibold text-white">Memento Mori Mode</h2>
      <p className="mt-3 text-sm leading-relaxed text-white/65">
        This feature calculates your remaining estimated life expectancy based on
        demographic averages to create an unpausable countdown. It is designed to
        foster urgency and presence, but can be emotionally intense. Are you sure you
        want to proceed?
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 rounded-md border border-white/15 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:border-white/35 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 rounded-md bg-[#E2B05C] px-4 py-2.5 text-sm font-medium text-black hover:brightness-110 transition"
        >
          I Understand, Enable Mode
        </button>
      </div>
    </Overlay>
  );
}

/* ---------------- Demographic input ---------------- */

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 100 }, (_, i) => CURRENT_YEAR - 13 - i);

export function MementoSetupModal({
  onCancel,
  onSaved,
}: {
  onCancel: () => void;
  onSaved: () => void;
}) {
  const existing = typeof window !== "undefined" ? getSettings() : null;
  const [year, setYear] = useState<number>(existing?.mementoBirthYear ?? 1995);
  const [gender, setGender] = useState<MementoGender>(existing?.mementoGender ?? "other");

  return (
    <Overlay onClose={onCancel}>
      <h2 className="text-lg font-semibold text-white">Your baseline</h2>
      <p className="mt-2 text-sm text-white/55">
        We use demographic averages to estimate your remaining time.
      </p>

      <label className="mt-6 block text-[10px] uppercase tracking-[0.22em] text-white/45">
        Birth year
      </label>
      <select
        value={year}
        onChange={(e) => setYear(Number(e.target.value))}
        className="mt-2 w-full rounded-md border border-white/12 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-[#E2B05C]/60"
      >
        {YEARS.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      <label className="mt-5 block text-[10px] uppercase tracking-[0.22em] text-white/45">
        Gender
      </label>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {(["female", "male", "other"] as MementoGender[]).map((g) => (
          <button
            key={g}
            onClick={() => setGender(g)}
            className={`rounded-md border px-3 py-2 text-sm capitalize transition-colors ${
              gender === g
                ? "border-[#E2B05C] text-[#E2B05C]"
                : "border-white/12 text-white/60 hover:border-white/30"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 rounded-md border border-white/15 px-4 py-2.5 text-sm text-white/70 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            setSettings({
              mementoBirthYear: year,
              mementoGender: gender,
              mementoMoriEnabled: true,
            });
            void persistMementoToCloud();
            onSaved();
          }}

          className="flex-1 rounded-md bg-[#E2B05C] px-4 py-2.5 text-sm font-medium text-black hover:brightness-110 transition"
        >
          Start the countdown
        </button>
      </div>
    </Overlay>
  );
}

/* ---------------- Live countdown ---------------- */

interface LifeMath {
  totalSeconds: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  percentElapsed: number;
}

function computeLife(birthYear: number, gender: MementoGender, now: number): LifeMath {
  const years = LIFE_EXPECTANCY[gender] ?? 78;
  const birth = new Date(birthYear, 0, 1).getTime();
  const totalSeconds = years * 365.2425 * 24 * 3600;
  const elapsedSeconds = Math.max(0, (now - birth) / 1000);
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
  return {
    totalSeconds,
    elapsedSeconds,
    remainingSeconds,
    percentElapsed: Math.min(100, (elapsedSeconds / totalSeconds) * 100),
  };
}

function breakdown(seconds: number) {
  const SEC_YEAR = 365.2425 * 24 * 3600;
  const years = Math.floor(seconds / SEC_YEAR);
  let rest = seconds - years * SEC_YEAR;
  const days = Math.floor(rest / 86400);
  rest -= days * 86400;
  const hours = Math.floor(rest / 3600);
  rest -= hours * 3600;
  const minutes = Math.floor(rest / 60);
  const secs = Math.floor(rest - minutes * 60);
  return { years, days, hours, minutes, secs };
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="tabular-nums text-2xl md:text-3xl font-light text-white">
        {String(value).padStart(2, "0")}
      </span>
      <span className="mt-1 text-[9px] uppercase tracking-[0.24em] text-white/40">{label}</span>
    </div>
  );
}

/* ---------------- Perspective grid ---------------- */

type Perspective = "year" | "life";
type Granularity = "days" | "weeks" | "months" | "years";

const LIFETIME_YEARS = 80;

function isLeap(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function gridData(
  perspective: Perspective,
  unit: Granularity,
  birthYear: number | null,
  now: Date,
): { total: number; passed: number; currentIndex: number; noun: string } {
  if (perspective === "year") {
    const year = now.getFullYear();
    const start = new Date(year, 0, 1).getTime();
    const dayOfYear = Math.floor((now.getTime() - start) / 86_400_000);
    if (unit === "weeks") {
      const total = 52;
      const idx = Math.min(total - 1, Math.floor(dayOfYear / 7));
      return { total, passed: idx, currentIndex: idx, noun: "weeks" };
    }
    const total = isLeap(year) ? 366 : 365;
    return { total, passed: dayOfYear, currentIndex: dayOfYear, noun: "days" };
  }

  const by = birthYear ?? now.getFullYear();
  const birth = new Date(by, 0, 1).getTime();
  const livedMs = Math.max(0, now.getTime() - birth);
  if (unit === "years") {
    const idx = Math.min(LIFETIME_YEARS - 1, Math.floor(livedMs / (365.2425 * 86_400_000)));
    return { total: LIFETIME_YEARS, passed: idx, currentIndex: idx, noun: "years" };
  }
  if (unit === "months") {
    const total = LIFETIME_YEARS * 12;
    const idx = Math.min(total - 1, Math.floor(livedMs / (30.436875 * 86_400_000)));
    return { total, passed: idx, currentIndex: idx, noun: "months" };
  }
  const total = Math.round(LIFETIME_YEARS * 52.1775);
  const idx = Math.min(total - 1, Math.floor(livedMs / (7 * 86_400_000)));
  return { total, passed: idx, currentIndex: idx, noun: "weeks" };
}

function PerspectiveGrid({ birthYear }: { birthYear: number | null }) {
  const [perspective, setPerspective] = useState<Perspective>("year");
  const [unit, setUnit] = useState<Granularity>("days");

  const units: Granularity[] =
    perspective === "year" ? ["days", "weeks"] : ["weeks", "months", "years"];

  const switchPerspective = (p: Perspective) => {
    setPerspective(p);
    setUnit(p === "year" ? "days" : "weeks");
  };

  const data = useMemo(
    () => gridData(perspective, unit, birthYear, new Date()),
    [perspective, unit, birthYear],
  );

  const cell =
    data.total > 2000
      ? "h-[5px] w-[5px]"
      : data.total > 700
        ? "h-1.5 w-1.5"
        : data.total > 120
          ? "h-2 w-2"
          : "h-3 w-3";

  return (
    <section className="mt-14 w-full">
      {/* Perspective toggle */}
      <div className="mx-auto flex w-full max-w-xs rounded-full border border-white/10 bg-white/[0.03] p-1">
        {(
          [
            ["year", "This Year"],
            ["life", "My Lifetime"],
          ] as [Perspective, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => switchPerspective(key)}
            className={`flex-1 rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] transition-colors ${
              perspective === key
                ? "bg-[#E2B05C] text-black"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Granularity */}
      <div className="mt-4 flex justify-center gap-2">
        {units.map((u) => (
          <button
            key={u}
            onClick={() => setUnit(u)}
            className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] capitalize transition-colors ${
              unit === u
                ? "border-[#E2B05C]/70 text-[#E2B05C]"
                : "border-white/10 text-white/45 hover:border-white/25"
            }`}
          >
            {u}
          </button>
        ))}
      </div>

      {perspective === "life" && !birthYear ? (
        <p className="mt-8 text-center text-sm text-white/45">
          Add your birth year in Settings → Memento Mori Mode to see your lifetime grid.
        </p>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap justify-center gap-[3px] sm:gap-1">
            {Array.from({ length: data.total }, (_, i) => {
              const isPast = i < data.passed;
              const isNow = i === data.currentIndex;
              return (
                <span
                  key={i}
                  className={`${cell} rounded-[2px] ${
                    isNow
                      ? "animate-pulse bg-[#E2B05C] ring-1 ring-[#E2B05C]/60"
                      : isPast
                        ? "bg-[#E2B05C]/70"
                        : "border border-white/12 bg-transparent"
                  }`}
                />
              );
            })}
          </div>
          <p className="mt-5 text-center text-[11px] uppercase tracking-[0.22em] text-white/35">
            {data.passed.toLocaleString()} of {data.total.toLocaleString()} {data.noun}{" "}
            {perspective === "year" ? "of this year" : "of a life"} spent
          </p>
        </>
      )}
    </section>
  );
}


/**
 * The live, unpausable life countdown. Rendered inline (own route) or inside
 * the fullscreen overlay below.
 */
export function MementoMoriPage() {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [s, setS] = useState<ReturnType<typeof getSettings> | null>(null);

  useEffect(() => {
    setMounted(true);
    setS(getSettings());
    const onSettings = () => setS(getSettings());
    window.addEventListener("hourglass:settings", onSettings);
    // Unpausable: ticks for as long as the view is mounted.
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("hourglass:settings", onSettings);
    };
  }, []);

  const life = useMemo(() => {
    if (!s?.mementoBirthYear || !s?.mementoGender) return null;
    return computeLife(s.mementoBirthYear, s.mementoGender, now);
  }, [s?.mementoBirthYear, s?.mementoGender, now]);

  if (!mounted) return null;

  if (!life) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center text-sm text-white/50">
        Add your birth year and gender in Settings → Memento Mori Mode to start
        the countdown.
      </div>
    );
  }

  const b = breakdown(life.remainingSeconds);


  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-6 py-16">
      <div className="text-[10px] uppercase tracking-[0.32em] text-[#E2B05C]/80">
        Memento Mori
      </div>

      {/* Sand level mirrors the exact elapsed-life percentage: the top chamber
          holds (100 - elapsed)% and the bottom holds elapsed%. */}
      <div className="mt-8 h-64 w-44 text-white/60">
        <Hourglass progress={life.percentElapsed / 100} flowing complete={false} />
      </div>

      <div className="mt-10 grid w-full grid-cols-5 gap-2">
        <Unit value={b.years} label="Years" />
        <Unit value={b.days} label="Days" />
        <Unit value={b.hours} label="Hours" />
        <Unit value={b.minutes} label="Min" />
        <Unit value={b.secs} label="Sec" />
      </div>
      <p className="mt-3 text-[11px] tracking-wide text-white/35">estimated time remaining</p>

      <div className="mt-8 w-full max-w-sm">
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[#E2B05C] transition-[width] duration-1000 ease-linear"
            style={{ width: `${life.percentElapsed}%` }}
          />
        </div>
        <div className="mt-2 text-center text-sm text-white/70 tabular-nums">
          {life.percentElapsed.toFixed(4)}% elapsed
        </div>
      </div>




      <div className="mt-14 w-full border-t border-white/8 pt-8">
        <p className="text-center text-[15px] leading-[1.9] tracking-[0.01em] text-white/55 [font-family:Georgia,'Times_New_Roman',serif]">
          {MEMENTO_TEXT}
        </p>
      </div>

      <div className="mt-10 flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-white/25">
        <HourglassIcon className="h-3 w-3" strokeWidth={1.5} />
        This countdown cannot be paused
      </div>
    </div>
  );
}

export function MementoMoriView({ onClose }: { onClose: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-[#08080a]">
      <button
        onClick={onClose}
        aria-label="Close Memento Mori"
        className="fixed right-5 top-5 z-10 text-white/40 hover:text-white transition-colors"
      >
        <X className="h-5 w-5" />
      </button>
      <MementoMoriPage />
    </div>,
    document.body,
  );
}

