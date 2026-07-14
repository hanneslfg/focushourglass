import { useEffect, useState } from "react";
import { Plus, X, Check } from "lucide-react";
import {
  addProject,
  deleteProject,
  getProjects,
  TAG_COLORS,
  type ProjectTag,
} from "@/lib/projects";

interface Props {
  selectedId: string | null;
  onSelect: (tag: ProjectTag | null) => void;
  disabled?: boolean;
}

export function ProjectPicker({ selectedId, onSelect, disabled }: Props) {
  const [tags, setTags] = useState<ProjectTag[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);

  useEffect(() => {
    const sync = () => setTags(getProjects());
    sync();
    window.addEventListener("hourglass:projects", sync);
    return () => window.removeEventListener("hourglass:projects", sync);
  }, []);

  async function commit() {
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
  }

  return (
    <div className="w-full">
      <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 text-center">
        Project
      </label>
      <div className="flex flex-wrap gap-1.5 justify-center">
        {tags.map((t) => {
          const active = selectedId === t.id;
          return (
            <div key={t.id} className="group relative">
              <button
                disabled={disabled}
                onClick={() => onSelect(active ? null : t)}
                className={`inline-flex items-center gap-1.5 pl-2 pr-2.5 h-8 rounded-full text-xs transition-all touch-manipulation border ${
                  active
                    ? "border-foreground/70 bg-foreground/5"
                    : "border-border hover:border-foreground/40"
                } disabled:opacity-50`}
                style={
                  active
                    ? { boxShadow: `inset 0 0 0 1px ${t.color}66` }
                    : undefined
                }
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: t.color }}
                />
                <span className="text-foreground/90">{t.name}</span>
              </button>
              {!disabled && (
                <button
                  onClick={() => {
                    if (selectedId === t.id) onSelect(null);
                    deleteProject(t.id);
                  }}
                  className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-background border border-border opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  aria-label={`Delete ${t.name}`}
                >
                  <X className="h-2.5 w-2.5" strokeWidth={2} />
                </button>
              )}
            </div>
          );
        })}

        {!adding && !disabled && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 px-2.5 h-8 rounded-full text-xs border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors touch-manipulation"
          >
            <Plus className="h-3 w-3" strokeWidth={1.75} /> New
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-3 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ background: newColor }}
            />
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value.slice(0, 30))}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setAdding(false);
                  setNewName("");
                }
              }}
              placeholder="Tag name"
              className="bg-transparent border-b border-border focus:border-foreground/60 outline-none text-sm py-1 w-40 text-center"
            />
            <button
              onClick={commit}
              className="h-8 w-8 rounded-full border border-border hover:border-foreground/60 flex items-center justify-center touch-manipulation"
              aria-label="Create tag"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </div>
          <div className="flex gap-1.5">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={`h-5 w-5 rounded-full transition-transform ${
                  newColor === c ? "ring-2 ring-foreground/70 scale-110" : ""
                }`}
                style={{ background: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
