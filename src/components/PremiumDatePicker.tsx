import React, { useState, useRef, useEffect } from "react";
import { Calendar } from "lucide-react";
import { DatePicker } from "./DatePicker";

interface PremiumDatePickerProps {
  /** ISO date string YYYY-MM-DD or null */
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  placeholder?: string;
  align?: "left" | "right";
}

/**
 * Thin compatibility wrapper. All date pickers in the app now render the same
 * unified <DatePicker /> (Radix Popover + shadcn Calendar).
 */
export const PremiumDatePicker: React.FC<PremiumDatePickerProps> = ({
  value,
  onChange,
  placeholder = "Set deadline…",
  align = "left",
}) => {
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => setHasMounted(true), []);
  const ref = useRef<HTMLDivElement>(null);

  if (!hasMounted) {
    return (
      <div
        className="flex h-9 min-w-[150px] items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3"
        aria-hidden="true"
      >
        <Calendar className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
        <span className="text-xs text-muted-foreground">{placeholder}</span>
      </div>
    );
  }

  return (
    <div ref={ref}>
      <DatePicker
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        align={align === "right" ? "end" : "start"}
      />
    </div>
  );
};

export default PremiumDatePicker;
