/**
 * Subtle horizontal row of tag toggles for the timer view. Driven by the
 * currently selected project's tag pool — no input field, just taps.
 */
import { useEffect, useState } from "react";
import { getProjectTags } from "@/lib/tags";
import type { ProjectTag } from "@/lib/projects";

interface Props {
  project: ProjectTag | null;
  active: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

export function SessionTagBar({ project, active, onChange, disabled }: Props) {
  const [pool, setPool] = useState<string[]>(() =>
    project ? getProjectTags(project.id) : [],
  );

  useEffect(() => {
    const sync = () => setPool(project ? getProjectTags(project.id) : []);
    sync();
    window.addEventListener("hourglass:tags", sync);
    window.addEventListener("hourglass:sessions", sync);
    return () => {
      window.removeEventListener("hourglass:tags", sync);
      window.removeEventListener("hourglass:sessions", sync);
    };
  }, [project?.id]);

  if (!project || pool.length === 0) return null;

  const accent = project.color || "#f4a261";
  const activeLower = new Set(active.map((t) => t.toLowerCase()));

  function toggle(tag: string) {
    if (disabled) return;
    const has = activeLower.has(tag.toLowerCase());
    onChange(
      has
        ? active.filter((t) => t.toLowerCase() !== tag.toLowerCase())
        : [...active, tag],
    );
  }

  return (
    <div className="w-full flex flex-wrap justify-center gap-1.5 -mt-2">
      {pool.map((t) => {
        const on = activeLower.has(t.toLowerCase());
        return (
          <button
            key={t}
            type="button"
            onClick={() => toggle(t)}
            disabled={disabled}
            className="h-6 px-2.5 rounded-full text-[11px] tracking-wide transition-all duration-150 disabled:opacity-60"
            style={
              on
                ? {
                    background: `${accent}26`,
                    border: `1px solid ${accent}`,
                    color: accent,
                    boxShadow: `0 0 12px ${accent}33`,
                  }
                : {
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: "rgba(255,255,255,0.55)",
                  }
            }
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}
