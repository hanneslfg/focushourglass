import { format, differenceInCalendarDays, parseISO } from "date-fns";

export type DeadlineState = "overdue" | "today" | "soon" | "future";

export interface DeadlineInfo {
  state: DeadlineState;
  label: string;
  icon: "warn" | "calendar";
  /** tailwind text color class (subtle, dark-theme friendly) */
  colorClass: string;
  daysLeft: number;
}

/**
 * Format a goal deadline (ISO date string, e.g. "2026-07-31") into a subtle,
 * premium badge label. Returns null if input is empty/invalid.
 */
export function formatDeadline(iso: string | null | undefined): DeadlineInfo | null {
  if (!iso) return null;
  let d: Date;
  try {
    d = parseISO(iso);
    if (isNaN(d.getTime())) return null;
  } catch {
    return null;
  }
  const days = differenceInCalendarDays(d, new Date());
  if (days < 0) {
    return {
      state: "overdue",
      label: "Overdue",
      icon: "warn",
      colorClass: "text-red-400/70",
      daysLeft: days,
    };
  }
  if (days === 0) {
    return {
      state: "today",
      label: "Today",
      icon: "warn",
      colorClass: "text-amber-300/85",
      daysLeft: 0,
    };
  }
  if (days <= 7) {
    return {
      state: "soon",
      label: `${days} day${days === 1 ? "" : "s"} left`,
      icon: "calendar",
      colorClass: "text-muted-foreground/80",
      daysLeft: days,
    };
  }
  return {
    state: "future",
    label: format(d, "MMM d"),
    icon: "calendar",
    colorClass: "text-muted-foreground/70",
    daysLeft: days,
  };
}

/** Yield the YYYY-MM-DD string for a Date, useful as input[type=date] value. */
export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = parseISO(iso);
    if (isNaN(d.getTime())) return "";
    return format(d, "yyyy-MM-dd");
  } catch {
    return "";
  }
}
