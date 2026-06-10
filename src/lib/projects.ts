export interface ProjectTag {
  id: string;
  name: string;
  /** CSS color string (hex). */
  color: string;
}

const KEY = "hourglass.projects.v1";

export const TAG_COLORS = [
  "#d4a373", // sand
  "#e9c46a", // amber
  "#f4a261", // orange
  "#e76f51", // terracotta
  "#9c6644", // umber
  "#a3b18a", // sage
  "#8ecae6", // sky
  "#bc8cff", // lilac
  "#e5989b", // rose
  "#94a3b8", // slate
];

function read(): ProjectTag[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ProjectTag[]) : [];
  } catch {
    return [];
  }
}

function write(list: ProjectTag[]) {
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("hourglass:projects"));
}

export function getProjects(): ProjectTag[] {
  return read();
}

export function addProject(name: string, color: string): ProjectTag {
  const trimmed = name.trim().slice(0, 30);
  const existing = read().find(
    (p) => p.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (existing) return existing;
  const tag: ProjectTag = {
    id: crypto.randomUUID(),
    name: trimmed,
    color,
  };
  write([...read(), tag]);
  return tag;
}

export function updateProject(id: string, patch: Partial<Omit<ProjectTag, "id">>) {
  write(read().map((p) => (p.id === id ? { ...p, ...patch } : p)));
}

export function deleteProject(id: string) {
  write(read().filter((p) => p.id !== id));
}
