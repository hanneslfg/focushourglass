/**
 * Unified date picker used across the whole app (Analytics custom range,
 * goal deadlines, manual session entry). Radix Popover + shadcn Calendar
 * with the app's dark glassmorphism styling — never a native date input.
 */
import * as React from "react";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getLanguage } from "@/lib/i18n";

export function parseIsoDate(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? undefined : dt;
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface DatePickerProps {
  /** ISO date string `YYYY-MM-DD` (or empty/null when unset). */
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  placeholder?: string;
  /** Show a small clear (×) affordance when a date is set. */
  clearable?: boolean;
  align?: "start" | "center" | "end";
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  clearable = true,
  align = "start",
  className,
  disabled,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const selected = parseIsoDate(value);
  const label =
    mounted && selected
      ? selected.toLocaleDateString(getLanguage(), {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel ?? placeholder}
          className={cn(
            "inline-flex h-9 min-w-[150px] items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/40 px-3 backdrop-blur-md transition-colors hover:border-foreground/30 hover:bg-accent/30 disabled:opacity-40",
            className,
          )}
        >
          <span className="flex items-center gap-2">
            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
            <span
              className={cn(
                "text-xs tabular-nums",
                selected ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </span>
          {clearable && selected && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear date"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(null);
              }}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-auto border-border/60 bg-[#0F0F0F]/95 p-0 backdrop-blur-xl shadow-2xl shadow-black/60"
      >
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            if (d) onChange(toIsoDate(d));
            setOpen(false);
          }}
          initialFocus
          className={cn("p-3 pointer-events-auto bg-transparent")}
        />
      </PopoverContent>
    </Popover>
  );
}

export default DatePicker;
