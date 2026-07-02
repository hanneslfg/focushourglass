/**
 * Per-project tag pool editor. Shows the project's curated chips and an
 * input that suggests previously-used tags from anywhere in the user's
 * history (Supabase-synced via `sessions.tags`).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { X, Plus } from "lucide-react";
import {
  addProjectTag,
  getAllUsedTags,
  getProjectTags,
  removeProjectTag,
} from "@/lib/tags";

interface Props {
  projectId: string;
  accent?: string;
}

export function ProjectTagsManager({ projectId, accent = "#f4a261" }: Props) {
  const [pool, setPool] = useState<string[]>([]);
  const [all, setAll] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sync = () => {
      setPool(getProjectTags(projectId));
      setAll(getAllUsedTags());
    };
    sync();
    window.addEventListener("hourglass:tags", sync);
    window.addEventListener("hourglass:sessions", sync);
    return () => {
      window.removeEventListener("hourglass:tags", sync);
      window.removeEventListener("hourglass:sessions", sync);
    };
  }, [projectId]);

  const poolLower = useMemo(
    () => new Set(pool.map((t) => t.toLowerCase())),
    [pool],
  );
  const suggestions = useMemo(() => {
    const q = draft.trim().toLowerCase();
    return all
      .filter((t) => !poolLower.has(t.toLowerCase()))
      .filter((t) => (q ? t.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [all, draft, poolLower]);

  function commit(raw: string) {
    const v = raw.trim().slice(0, 24);
    if (!v) return;
    addProjectTag(projectId, v);
    setDraft("");
    inputRef.current?.focus();
  }

  return (
    <section className="mb-10">
      <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground mb-3">
        Tags
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {pool.map((t) => (
          <span
            key={t}
            className="group inline-flex items-center gap-1 pl-2.5 pr-1 h-7 rounded-full text-[11px] tracking-wide"
            style={{
              background: `${accent}1A`,
              border: `1px solid ${accent}55`,
              color: accent,
            }}
          >
            <span className="max-w-[10rem] truncate">{t}</span>
            <button
              type="button"
              onClick={() => removeProjectTag(projectId, t)}
              aria-label={`Remove ${t}`}
              className="h-5 w-5 rounded-full inline-flex items-center justify-center text-current/70 hover:text-current hover:bg-white/10 transition-colors"
            >
              <X className="h-3 w-3" strokeWidth={2} />
            </button>
          </span>
        ))}

        <div className="relative">
          <div className="inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-full border border-border focus-within:border-foreground/50 transition-colors">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 24))}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  commit(draft);
                } else if (e.key === "Escape") {
                  setDraft("");
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder={pool.length === 0 ? "Add tag…" : "+ add"}
              className="bg-transparent outline-none text-[11px] py-0.5 w-24 placeholder:text-muted-foreground/60"
            />
            {draft.trim() && (
              <button
                type="button"
                onClick={() => commit(draft)}
                aria-label="Add tag"
                className="h-5 w-5 rounded-full inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3" strokeWidth={2} />
              </button>
            )}
          </div>

          {focused && suggestions.length > 0 && (
            <div
              className="absolute left-0 top-full mt-2 z-30 min-w-[180px] max-w-[260px] rounded-lg p-1.5 shadow-2xl"
              style={{
                background: "#0a0a0a",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div className="px-2 pt-1 pb-1.5 text-[9px] uppercase tracking-[0.22em] text-muted-foreground/70">
                Previously used
              </div>
              <ul className="max-h-56 overflow-y-auto">
                {suggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        commit(s);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded-md text-xs text-foreground/85 hover:bg-white/[0.06] flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{s}</span>
                      <Plus className="h-3 w-3 opacity-50" strokeWidth={1.75} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {pool.length === 0 && !focused && (
        <p className="mt-3 text-[11px] text-muted-foreground/60 italic">
          Add tags to refine sessions in this project. They'll be suggested
          everywhere you use them.
        </p>
      )}
    </section>
  );
}
