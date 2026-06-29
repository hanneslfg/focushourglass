import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  maxLength?: number;
}

/**
 * Minimalist multi-tag input. Press Enter or Comma to commit a tag.
 * Backspace on empty input removes the last tag.
 */
export function TagInput({
  tags,
  onChange,
  placeholder = "Add tag…",
  maxTags = 8,
  maxLength = 24,
}: TagInputProps) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const cleaned = raw.trim().replace(/,+$/g, "").slice(0, maxLength);
    if (!cleaned) return;
    const lower = cleaned.toLowerCase();
    if (tags.some((t) => t.toLowerCase() === lower)) {
      setDraft("");
      return;
    }
    if (tags.length >= maxTags) {
      setDraft("");
      return;
    }
    onChange([...tags, cleaned]);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  function remove(idx: number) {
    onChange(tags.filter((_, i) => i !== idx));
  }

  return (
    <div className="w-full">
      <label className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 text-center">
        Tags
      </label>
      <div className="flex flex-wrap items-center justify-center gap-1.5 min-h-9 px-2 py-1.5 rounded-md border border-border bg-transparent focus-within:border-foreground/60 transition-colors">
        {tags.map((t, i) => (
          <span
            key={`${t}-${i}`}
            className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-foreground/[0.06] border border-border/60 text-xs text-foreground/90"
          >
            <span className="max-w-[8rem] truncate">{t}</span>
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove ${t}`}
              className="h-4 w-4 rounded-full inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
            >
              <X className="h-3 w-3" strokeWidth={2} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, maxLength))}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[6rem] bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 py-1 px-1"
        />
      </div>
      <div className="mt-1 text-[10px] text-right text-muted-foreground/60 tabular-nums">
        {tags.length}/{maxTags}
      </div>
    </div>
  );
}
