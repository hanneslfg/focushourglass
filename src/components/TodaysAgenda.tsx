import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Plus } from "lucide-react";
import {
  addAgendaItem,
  deleteAgendaItem,
  fetchTodayAgendaItems,
  toggleAgendaItem,
  type AgendaItem,
} from "@/lib/agenda";

export function TodaysAgenda() {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const rows = await fetchTodayAgendaItems();
    if (rows) setItems(rows);
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async () => {
    const clean = title.trim();
    if (!clean || busy) return;
    setBusy(true);
    setTitle("");
    const res = await addAgendaItem(clean);
    if (res.ok && res.data) setItems((prev) => [...prev, res.data as AgendaItem]);
    setBusy(false);
  };

  const toggle = async (item: AgendaItem) => {
    const next = !item.completed;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, completed: next } : i)),
    );
    const res = await toggleAgendaItem(item.id, next);
    if (!res.ok) void load();
  };

  const remove = async (item: AgendaItem) => {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    const res = await deleteAgendaItem(item.id);
    if (!res.ok) void load();
  };

  const completedCount = items.filter((i) => i.completed).length;

  return (
    <section className="rounded-md border border-border bg-background/40 px-4 py-3.5">
      <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        Today&apos;s agenda
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Add a task for today…"
          className="flex-1 h-9 rounded-md border border-border/60 bg-background/40 px-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-[#E2B05C]/60 focus:ring-1 focus:ring-[#E2B05C]/40 transition-colors"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !title.trim()}
          className="h-9 w-9 shrink-0 rounded-md border border-border/60 flex items-center justify-center text-muted-foreground hover:text-[#E2B05C] hover:border-[#E2B05C]/60 disabled:opacity-40 disabled:hover:text-muted-foreground disabled:hover:border-border/60 transition-colors"
          aria-label="Add agenda item"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground/70 italic">
          Nothing planned yet today. Add your first task above.
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {items.map((item) => (
            <li
              key={item.id}
              className="group flex items-center gap-2 rounded-sm px-1 -mx-1 py-1 hover:bg-white/[0.03] transition-colors"
            >
              <button
                type="button"
                onClick={() => void toggle(item)}
                className="shrink-0 text-muted-foreground hover:text-[#E2B05C] transition-colors"
                aria-label={item.completed ? "Mark as not done" : "Mark as done"}
              >
                {item.completed ? (
                  <CheckCircle2 className="h-4 w-4 text-[#E2B05C]" strokeWidth={1.75} />
                ) : (
                  <Circle className="h-4 w-4" strokeWidth={1.5} />
                )}
              </button>
              <span
                className={`min-w-0 flex-1 truncate text-sm ${
                  item.completed
                    ? "line-through text-muted-foreground/60"
                    : "text-foreground"
                }`}
              >
                {item.title}
              </span>
              {item.estimatedBlocks != null && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {item.estimatedBlocks * 90}m
                </span>
              )}
              <button
                type="button"
                onClick={() => void remove(item)}
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-300 text-sm leading-none px-1"
                aria-label="Delete agenda item"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {completedCount} von {items.length} erledigt
      </div>
    </section>
  );
}
