import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Plus, Trash2, X, Pencil } from "lucide-react";
import {
  addProject,
  deleteProject,
  getProjects,
  updateProject,
  TAG_COLORS,
  type ProjectTag,
} from "@/lib/projects";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional: fire when the user picks a project so callers can select it. */
  onSelect?: (tag: ProjectTag) => void;
}

/**
 * Minimalist deep-black modal for managing project tags.
 * Designed to feel premium and quiet: no chrome, no borders, just color
 * dots, names, and tap targets. Used from the timer's project picker and
 * anywhere else that needs full project management without leaving context.
 */
export function ProjectManagerModal({ open, onClose, onSelect }: Props) {
  const [projects, setProjects] = useState<ProjectTag[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [longTermGoal, setLongTermGoal] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(TAG_COLORS[0]);
  const [editGoal, setEditGoal] = useState("");


  useEffect(() => {
    if (!open) return;
    const sync = () => setProjects(getProjects());
    sync();
    window.addEventListener("hourglass:projects", sync);
    return () => window.removeEventListener("hourglass:projects", sync);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const sorted = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  );

  async function commitNew() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const goal = longTermGoal.trim();
    const saved = await addProject(trimmed, color, goal ? goal : null);
    if (!saved) return;
    setName("");
    setLongTermGoal("");
  }

  function startEdit(p: ProjectTag) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditColor(p.color);
    setEditGoal(p.longTermGoal ?? "");
  }
  async function commitEdit() {
    if (!editingId) return;
    const trimmed = editName.trim().slice(0, 30);
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    const goal = editGoal.trim();
    const ok = await updateProject(editingId, {
      name: trimmed,
      color: editColor,
      longTermGoal: goal ? goal : null,
    });
    if (!ok) return;
    setEditingId(null);
  }


  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl"
        style={{ background: "#000000", color: "#ffffff" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 h-7 w-7 rounded-full flex items-center justify-center text-white/40 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>

        <div className="px-7 pt-7 pb-2">
          <div className="text-[10px] uppercase tracking-[0.28em] text-white/40">
            Projects
          </div>
          <h2 className="font-display text-2xl tracking-tight mt-1 text-white">
            Manage
          </h2>
        </div>

        {/* New project */}
        <div className="px-7 pt-5 pb-6">
          <div className="flex items-center gap-3">
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ background: color }}
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 30))}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitNew();
              }}
              placeholder="New project name"
              className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-white/30 py-1.5"
            />
            <button
              onClick={commitNew}
              disabled={!name.trim()}
              className="h-8 w-8 rounded-full flex items-center justify-center text-white/70 hover:text-white disabled:opacity-30 transition-colors"
              aria-label="Create project"
            >
              <Plus className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-5 w-5 rounded-full transition-transform ${
                  color === c ? "ring-2 ring-white/80 scale-110" : ""
                }`}
                style={{ background: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
          <textarea
            value={longTermGoal}
            onChange={(e) => setLongTermGoal(e.target.value.slice(0, 240))}
            placeholder="Why / Long-term Goal (optional) — e.g., To graduate with honors and build my own company..."
            rows={2}
            className="mt-4 w-full bg-transparent outline-none text-[13px] italic text-white/80 placeholder:text-white/25 border-t border-white/[0.06] pt-3 resize-none leading-relaxed"
          />
        </div>


        {/* Divider — single hairline, no card borders elsewhere */}
        <div className="h-px mx-7" style={{ background: "rgba(255,255,255,0.06)" }} />

        {/* Project list */}
        <ul className="max-h-[42vh] overflow-y-auto px-2 py-2">
          {sorted.length === 0 && (
            <li className="px-5 py-8 text-center text-xs text-white/40 italic">
              No projects yet
            </li>
          )}
          {sorted.map((p) => {
            const isEditing = editingId === p.id;
            return (
              <li key={p.id} className="group">
                {isEditing ? (
                  <div className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ background: editColor }}
                      />
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value.slice(0, 30))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="flex-1 bg-transparent outline-none text-sm text-white py-1"
                      />
                      <button
                        onClick={commitEdit}
                        className="h-7 w-7 rounded-full flex items-center justify-center text-white/70 hover:text-white"
                        aria-label="Save"
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="h-7 w-7 rounded-full flex items-center justify-center text-white/40 hover:text-white"
                        aria-label="Cancel"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                    <div className="mt-3 ml-5 flex flex-wrap gap-1.5">
                      {TAG_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setEditColor(c)}
                          className={`h-4 w-4 rounded-full transition-transform ${
                            editColor === c ? "ring-2 ring-white/80 scale-110" : ""
                          }`}
                          style={{ background: c }}
                          aria-label={`Color ${c}`}
                        />
                      ))}
                    </div>
                    <textarea
                      value={editGoal}
                      onChange={(e) => setEditGoal(e.target.value.slice(0, 240))}
                      placeholder="Why / Long-term Goal (optional)"
                      rows={2}
                      className="mt-3 ml-5 w-[calc(100%-1.25rem)] bg-transparent outline-none text-[12px] italic text-white/75 placeholder:text-white/25 resize-none leading-relaxed"
                    />
                  </div>

                ) : (
                  <div className="flex items-center gap-3 px-5 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ background: p.color }}
                    />
                    <button
                      onClick={() => {
                        if (onSelect) {
                          onSelect(p);
                          onClose();
                        }
                      }}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="text-sm text-white/90 truncate">{p.name}</div>
                      {p.longTermGoal && (
                        <div className="text-[11px] italic text-white/40 truncate mt-0.5">
                          {p.longTermGoal}
                        </div>
                      )}
                    </button>

                    <button
                      onClick={() => startEdit(p)}
                      className="h-7 w-7 rounded-full flex items-center justify-center text-white/30 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                      aria-label={`Edit ${p.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete project "${p.name}"?`)) {
                          void deleteProject(p.id);
                        }
                      }}
                      className="h-7 w-7 rounded-full flex items-center justify-center text-white/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                      aria-label={`Delete ${p.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="px-7 py-4 text-[10px] uppercase tracking-[0.22em] text-white/30 text-center">
          Synced across devices
        </div>
      </div>
    </div>,
    document.body,
  );
}
