import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Play,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Pause,
  Focus,
  Coffee,
  Pencil,
  X,
  Check,
} from "lucide-react";
import {
  BUILTIN_RHYTHMS,
  activateRhythm,
  deactivateRhythm,
  deleteCustomRhythm,
  getActiveRhythm,
  getAllRhythms,
  saveCustomRhythm,
  type Rhythm,
  type RhythmBlock,
} from "@/lib/rhythms";
import { toast } from "sonner";

function totalMinutes(blocks: RhythmBlock[]) {
  return blocks.reduce((sum, b) => sum + b.minutes, 0);
}

function fmtHM(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function FocusBlocksView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rhythms, setRhythms] = useState<Rhythm[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [editing, setEditing] = useState<Rhythm | null>(null);

  useEffect(() => {
    const sync = () => {
      setRhythms(getAllRhythms());
      const a = getActiveRhythm();
      setActiveId(a?.rhythm.id ?? null);
      setActiveIndex(a?.index ?? 0);
    };
    sync();
    window.addEventListener("hourglass:rhythm", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("hourglass:rhythm", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  function handleActivate(r: Rhythm) {
    activateRhythm(r.id, 0);
    toast(t("focusBlocks.activatedToast", { name: r.name }), {
      description: t("focusBlocks.activatedDesc"),
    });
    navigate({ to: "/" });
  }

  function handleDeactivate() {
    deactivateRhythm();
    toast(t("focusBlocks.deactivatedToast"));
  }

  function handleNewCustom() {
    const id = `custom.${crypto.randomUUID()}`;
    setEditing({
      id,
      name: t("focusBlocks.customRhythmName"),
      builtin: false,
      blocks: [
        { id: crypto.randomUUID(), kind: "focus", minutes: 50 },
        { id: crypto.randomUUID(), kind: "break", minutes: 10 },
      ],
    });
  }

  const builtins = useMemo(() => rhythms.filter((r) => r.builtin), [rhythms]);
  const customs = useMemo(() => rhythms.filter((r) => !r.builtin), [rhythms]);

  return (
    <div className="w-full max-w-4xl mx-auto px-6 md:px-10 py-10 md:py-14">
      <header className="mb-10">
        <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          {t("focusBlocks.eyebrow")}
        </div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight mt-1">
          {t("focusBlocks.title")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground max-w-xl">
          {t("focusBlocks.subtitle")}
        </p>
      </header>

      {/* Built-ins */}
      <section className="mb-10">
        <SectionLabel>{t("focusBlocks.presets")}</SectionLabel>
        <div className="grid gap-3 md:grid-cols-2">
          {builtins.map((r) => (
            <RhythmCard
              key={r.id}
              rhythm={r}
              isActive={activeId === r.id}
              activeIndex={activeIndex}
              onActivate={() => handleActivate(r)}
              onDeactivate={handleDeactivate}
              onEdit={null}
              onDelete={null}
            />
          ))}
        </div>
      </section>

      {/* Custom */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>{t("focusBlocks.yourRhythms")}</SectionLabel>
          <button
            onClick={handleNewCustom}
            className="inline-flex items-center gap-1.5 text-xs px-3 min-h-9 rounded-md border border-border hover:border-foreground/60 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} /> {t("focusBlocks.newRhythm")}
          </button>
        </div>
        {customs.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/70 bg-background/30 px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {t("focusBlocks.noCustomYet")}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/60">
              {t("focusBlocks.buildOneHint")}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {customs.map((r) => (
              <RhythmCard
                key={r.id}
                rhythm={r}
                isActive={activeId === r.id}
                activeIndex={activeIndex}
                onActivate={() => handleActivate(r)}
                onDeactivate={handleDeactivate}
                onEdit={() => setEditing(r)}
                onDelete={() => {
                  void deleteCustomRhythm(r.id).then((ok) => {
                    if (ok) toast(t("focusBlocks.deletedToast", { name: r.name }));
                  });
                }}
              />
            ))}
          </div>
        )}
      </section>

      {editing && (
        <RhythmEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(r) => {
            void saveCustomRhythm(r).then((saved) => {
              if (!saved) return;
              setEditing(null);
              toast(t("focusBlocks.savedToast", { name: saved.name }));
            });
          }}
        />
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground mb-3">
      {children}
    </div>
  );
}

function RhythmCard({
  rhythm,
  isActive,
  activeIndex,
  onActivate,
  onDeactivate,
  onEdit,
  onDelete,
}: {
  rhythm: Rhythm;
  isActive: boolean;
  activeIndex: number;
  onActivate: () => void;
  onDeactivate: () => void;
  onEdit: (() => void) | null;
  onDelete: (() => void) | null;
}) {
  const { t } = useTranslation();
  const total = totalMinutes(rhythm.blocks);
  const focusCount = rhythm.blocks.filter((b) => b.kind === "focus").length;
  return (
    <div
      className={`rounded-lg border bg-card/40 p-5 transition-colors ${
        isActive ? "border-primary/70" : "border-border hover:border-foreground/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg tracking-tight">{rhythm.name}</h3>
          {rhythm.description && (
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
              {rhythm.description}
            </p>
          )}
        </div>
        {isActive && (
          <span className="shrink-0 text-[9px] uppercase tracking-[0.24em] text-primary border border-primary/40 rounded-full px-2 py-0.5">
            {t("focusBlocks.active")}
          </span>
        )}
      </div>

      <div className="mt-4">
        <BlockTimeline
          blocks={rhythm.blocks}
          currentIndex={isActive ? activeIndex : -1}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
        <span>
          {t("focusBlocks.focusCount", {
            focus: focusCount,
            break: rhythm.blocks.length - focusCount,
          })}
        </span>
        <span className="tabular-nums">{fmtHM(total)}</span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {isActive ? (
          <button
            onClick={onDeactivate}
            className="inline-flex items-center gap-1.5 px-3 min-h-9 rounded-md border border-border text-xs hover:border-foreground/60 transition-colors"
          >
            <Pause className="h-3.5 w-3.5" strokeWidth={1.75} /> {t("focusBlocks.deactivate")}
          </button>
        ) : (
          <button
            onClick={onActivate}
            className="inline-flex items-center gap-1.5 px-3 min-h-9 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <Play className="h-3.5 w-3.5" strokeWidth={2} /> {t("focusBlocks.activate")}
          </button>
        )}
        {onEdit && (
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 px-3 min-h-9 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/60 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} /> {t("focusBlocks.edit")}
          </button>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            className="ml-auto inline-flex items-center gap-1.5 px-2.5 min-h-9 rounded-md text-xs text-muted-foreground/70 hover:text-destructive transition-colors"
            aria-label={t("focusBlocks.delete")}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Minimal horizontal timeline: proportional pills for each block. */
export function BlockTimeline({
  blocks,
  currentIndex,
}: {
  blocks: RhythmBlock[];
  currentIndex: number;
}) {
  const { t } = useTranslation();
  const total = totalMinutes(blocks) || 1;
  return (
    <div className="flex h-2 w-full gap-[3px] overflow-hidden rounded-full">
      {blocks.map((b, i) => {
        const pct = (b.minutes / total) * 100;
        const isFocus = b.kind === "focus";
        const isCurrent = i === currentIndex;
        const isPast = currentIndex >= 0 && i < currentIndex;
        return (
          <div
            key={b.id}
            className="h-full rounded-full transition-all"
            style={{
              flexBasis: `${pct}%`,
              background: isFocus
                ? isCurrent
                  ? "hsl(38 92% 62%)"
                  : isPast
                    ? "hsl(38 40% 40% / 0.5)"
                    : "hsl(var(--foreground) / 0.55)"
                : isCurrent
                  ? "hsl(200 70% 55%)"
                  : isPast
                    ? "hsl(200 30% 35% / 0.5)"
                    : "hsl(var(--muted-foreground) / 0.35)",
              boxShadow: isCurrent
                ? isFocus
                  ? "0 0 8px hsl(38 92% 62% / 0.55)"
                  : "0 0 8px hsl(200 70% 55% / 0.5)"
                : "none",
            }}
            title={`${isFocus ? t("focusBlocks.focus") : t("focusBlocks.break")} · ${b.minutes} ${t("focusBlocks.min")}`}
          />
        );
      })}
    </div>
  );
}

/* -------------------- Editor Modal -------------------- */

function RhythmEditor({
  initial,
  onClose,
  onSave,
}: {
  initial: Rhythm;
  onClose: () => void;
  onSave: (r: Rhythm) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial.name);
  const [blocks, setBlocks] = useState<RhythmBlock[]>(initial.blocks);

  function updateBlock(id: string, patch: Partial<RhythmBlock>) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  function move(id: string, dir: -1 | 1) {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  }
  function addBlock(kind: "focus" | "break") {
    setBlocks((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        kind,
        minutes: kind === "focus" ? 25 : 5,
      },
    ]);
  }
  function removeBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }

  const canSave = name.trim().length > 0 && blocks.length > 0;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-2xl"
      >
        <header className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              {t("focusBlocks.rhythmBuilder")}
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              className="mt-1 font-display text-2xl tracking-tight bg-transparent outline-none border-b border-border focus:border-foreground/60 w-full"
              placeholder={t("focusBlocks.rhythmName")}
            />
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center shrink-0 ml-3"
            aria-label={t("focusBlocks.close")}
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </header>

        <div className="space-y-2 mb-4">
          {blocks.map((b, i) => (
            <div
              key={b.id}
              className="flex items-center gap-2 rounded-md border border-border bg-background/40 px-3 py-2"
            >
              <span className="text-[10px] tabular-nums text-muted-foreground w-6">
                {String(i + 1).padStart(2, "0")}
              </span>
              <select
                value={b.kind}
                onChange={(e) =>
                  updateBlock(b.id, { kind: e.target.value as "focus" | "break" })
                }
                className="bg-background border border-border rounded-md px-2 py-1 text-xs"
              >
                <option value="focus">{t("focusBlocks.focus")}</option>
                <option value="break">{t("focusBlocks.break")}</option>
              </select>
              {b.kind === "focus" ? (
                <Focus className="h-3.5 w-3.5 text-amber-400/80" strokeWidth={1.75} />
              ) : (
                <Coffee className="h-3.5 w-3.5 text-sky-400/80" strokeWidth={1.75} />
              )}
              <BlockMinutesInput
                value={b.minutes}
                onCommit={(m) => updateBlock(b.id, { minutes: m })}
              />
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {t("focusBlocks.min")}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => move(b.id, -1)}
                  disabled={i === 0}
                  className="h-7 w-7 rounded-md border border-border hover:border-foreground/60 flex items-center justify-center disabled:opacity-30"
                  aria-label={t("focusBlocks.moveUp")}
                >
                  <ArrowUp className="h-3 w-3" strokeWidth={1.75} />
                </button>
                <button
                  onClick={() => move(b.id, 1)}
                  disabled={i === blocks.length - 1}
                  className="h-7 w-7 rounded-md border border-border hover:border-foreground/60 flex items-center justify-center disabled:opacity-30"
                  aria-label={t("focusBlocks.moveDown")}
                >
                  <ArrowDown className="h-3 w-3" strokeWidth={1.75} />
                </button>
                <button
                  onClick={() => removeBlock(b.id)}
                  className="h-7 w-7 rounded-md text-muted-foreground/70 hover:text-destructive flex items-center justify-center"
                  aria-label={t("focusBlocks.remove")}
                >
                  <Trash2 className="h-3 w-3" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => addBlock("focus")}
            className="inline-flex items-center gap-1.5 text-xs px-3 min-h-9 rounded-md border border-border hover:border-foreground/60"
          >
            <Plus className="h-3.5 w-3.5" /> {t("focusBlocks.focusBlock")}
          </button>
          <button
            onClick={() => addBlock("break")}
            className="inline-flex items-center gap-1.5 text-xs px-3 min-h-9 rounded-md border border-border hover:border-foreground/60"
          >
            <Plus className="h-3.5 w-3.5" /> {t("focusBlocks.breakBlock")}
          </button>
          <span className="ml-auto text-[10px] uppercase tracking-[0.2em] text-muted-foreground tabular-nums">
            {t("focusBlocks.total", { time: fmtHM(totalMinutes(blocks)) })}
          </span>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 min-h-10 rounded-md border border-border text-sm hover:border-foreground/60"
          >
            {t("focusBlocks.cancel")}
          </button>
          <button
            onClick={() =>
              onSave({
                ...initial,
                name: name.trim() || t("focusBlocks.untitledRhythm"),
                blocks,
                builtin: false,
              })
            }
            disabled={!canSave}
            className="inline-flex items-center gap-1.5 px-4 min-h-10 rounded-md bg-foreground text-background text-sm font-medium disabled:opacity-40 hover:opacity-90"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2} /> {t("focusBlocks.saveRhythm")}
          </button>
        </div>
      </div>
    </div>
  );
}

// keep imports referenced (silence unused for preset builtins access)
void BUILTIN_RHYTHMS;

function BlockMinutesInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (minutes: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      max={600}
      value={draft}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const val = e.target.value;
        if (val === "") { setDraft(""); return; }
        const num = e.currentTarget.valueAsNumber;
        if (Number.isNaN(num)) return;
        setDraft(val);
        const capped = Math.min(600, Math.max(0, Math.floor(num)));
        if (capped >= 1) onCommit(capped);
      }}
      onBlur={(e) => {
        const num = e.currentTarget.valueAsNumber;
        if (e.target.value === "" || Number.isNaN(num) || num < 1) {
          setDraft("1");
          onCommit(1);
        } else {
          const clamped = Math.min(600, Math.max(1, Math.floor(num)));
          setDraft(String(clamped));
          onCommit(clamped);
        }
      }}
      className="w-16 bg-background border border-border rounded-md px-2 py-1 text-xs tabular-nums text-center"
    />
  );
}
