import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Check, Settings2 } from "lucide-react";
import {
  addProject,
  getProjects,
  TAG_COLORS,
  type ProjectTag,
} from "@/lib/projects";
import { ProjectManagerModal } from "./ProjectManagerModal";

interface Props {
  selectedId: string | null;
  onSelect: (tag: ProjectTag | null) => void;
  disabled?: boolean;
}

export function ProjectPickerCompact({ selectedId, onSelect, disabled }: Props) {
  const [tags, setTags] = useState<ProjectTag[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => setTags(getProjects());
    sync();
    window.addEventListener("hourglass:projects", sync);
    return () => window.removeEventListener("hourglass:projects", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const selected = tags.find((t) => t.id === selectedId) ?? null;

  async function commitNew() {
    const name = newName.trim();
    if (!name) {
      setAdding(false);
      setNewName("");
      return;
    }
    const tag = await addProject(name, newColor);
    if (!tag) return;
    onSelect(tag);
    setNewName("");
    setAdding(false);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 h-7 rounded-full text-[11px] uppercase tracking-[0.18em] text-muted-foreground/90 hover:text-foreground border border-border/60 hover:border-foreground/40 bg-background/30 transition-colors disabled:opacity-40"
      >
        {selected ? (
          <>
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: selected.color }}
            />
            <span className="text-foreground/85 normal-case tracking-normal text-xs">
              {selected.name}
            </span>
          </>
        ) : (
          <span>No project</span>
        )}
        <ChevronDown className="h-3 w-3 opacity-70" strokeWidth={1.75} />
      </button>

      {open && (
        <div className="absolute z-30 left-1/2 -translate-x-1/2 mt-2 w-56 rounded-md border border-border bg-card shadow-xl overflow-hidden">
          <button
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
            className="w-full px-3 py-2 flex items-center justify-between text-xs hover:bg-foreground/5"
          >
            <span className="text-muted-foreground">No project</span>
            {!selected && <Check className="h-3 w-3" strokeWidth={2} />}
          </button>
          <div className="border-t border-border max-h-60 overflow-y-auto">
            {tags.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  onSelect(t);
                  setOpen(false);
                }}
                className="w-full px-3 py-2 flex items-center gap-2 text-xs hover:bg-foreground/5"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: t.color }}
                />
                <span className="flex-1 text-left truncate">{t.name}</span>
                {selected?.id === t.id && <Check className="h-3 w-3" strokeWidth={2} />}
              </button>
            ))}
            {tags.length === 0 && !adding && (
              <div className="px-3 py-3 text-[11px] text-muted-foreground/70 italic">
                No projects yet
              </div>
            )}
          </div>
          <div className="border-t border-border">
            {!adding ? (
              <>
                <button
                  onClick={() => setAdding(true)}
                  className="w-full px-3 py-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                >
                  <Plus className="h-3 w-3" strokeWidth={1.75} /> New project
                </button>
                <button
                  onClick={() => {
                    setOpen(false);
                    setManageOpen(true);
                  }}
                  className="w-full px-3 py-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 border-t border-border"
                >
                  <Settings2 className="h-3 w-3" strokeWidth={1.75} /> Manage projects
                </button>
              </>
            ) : (
              <div className="px-3 py-2.5 space-y-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: newColor }}
                  />
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value.slice(0, 30))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitNew();
                      if (e.key === "Escape") {
                        setAdding(false);
                        setNewName("");
                      }
                    }}
                    placeholder="Project name"
                    className="flex-1 bg-transparent border-b border-border focus:border-foreground/60 outline-none text-xs py-0.5"
                  />
                  <button
                    onClick={commitNew}
                    className="h-6 w-6 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center"
                  >
                    <Check className="h-3 w-3" strokeWidth={1.75} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {TAG_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewColor(c)}
                      className={`h-4 w-4 rounded-full transition-transform ${
                        newColor === c ? "ring-1 ring-foreground/70 scale-110" : ""
                      }`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <ProjectManagerModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        onSelect={(tag) => onSelect(tag)}
      />
    </div>
  );
}
