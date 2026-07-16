import React, { useState, useRef, useEffect } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";

interface PremiumDatePickerProps {
  /** ISO date string YYYY-MM-DD or null */
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  placeholder?: string;
  align?: "left" | "right";
}

function parseIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const PremiumDatePicker: React.FC<PremiumDatePickerProps> = ({
  value,
  onChange,
  placeholder = "Set deadline…",
  align = "left",
}) => {
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  const selectedDate = parseIso(value);
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<Date>(selectedDate ?? new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && selectedDate) setCurrentMonth(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const startOffset = firstDay === 0 ? 6 : firstDay - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  };

  const days = getDaysInMonth(currentMonth);
  const monthNames = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
  ];

  const formatDate = (d: Date) =>
    d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

  const isToday = (date: Date) => {
    const t = new Date();
    return (
      date.getDate() === t.getDate() &&
      date.getMonth() === t.getMonth() &&
      date.getFullYear() === t.getFullYear()
    );
  };
  const isSelected = (date: Date) =>
    !!selectedDate &&
    date.getDate() === selectedDate.getDate() &&
    date.getMonth() === selectedDate.getMonth() &&
    date.getFullYear() === selectedDate.getFullYear();

  if (!hasMounted) {
    return (
      <div
        className="flex items-center gap-2 min-w-[160px] h-9 px-3 rounded-lg border border-white/5 bg-[#0F0F0F]/60"
        aria-hidden="true"
      >
        <Calendar className="w-3.5 h-3.5 text-white/40" strokeWidth={1.75} />
        <span className="text-xs text-white/40">{placeholder}</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <div
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center justify-between gap-2 min-w-[160px] h-9 px-3 rounded-lg border border-white/5 bg-[#0F0F0F]/60 backdrop-blur-md cursor-pointer hover:border-white/10 hover:bg-[#141414]/80 transition-all"
      >
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-white/40" strokeWidth={1.75} />
          <span className={`text-xs tabular-nums ${selectedDate ? "text-white/90" : "text-white/40"}`}>
            {selectedDate ? formatDate(selectedDate) : placeholder}
          </span>
        </div>
        {selectedDate && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            className="p-0.5 rounded-md text-white/40 hover:text-white/80 hover:bg-white/5 transition-all"
            aria-label="Clear deadline"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {isOpen && (
        <div
          className={`absolute ${align === "right" ? "right-0" : "left-0"} mt-2 z-50 w-[300px] p-4 rounded-2xl border border-white/10 bg-[#0F0F0F] shadow-2xl shadow-black/80 animate-in fade-in slide-in-from-top-2 duration-200`}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium tracking-wide text-white/90">
              {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
                }}
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-all"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
                }}
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-all"
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 text-center mb-2">
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day) => (
              <span key={day} className="text-[11px] font-medium text-white/30 tracking-wider">
                {day}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {days.map((date, index) => {
              if (!date) return <div key={`empty-${index}`} />;
              const selected = isSelected(date);
              const today = isToday(date);
              return (
                <button
                  type="button"
                  key={date.toString()}
                  onClick={() => {
                    onChange(toIso(date));
                    setIsOpen(false);
                  }}
                  className={`h-8 w-8 mx-auto rounded-lg text-xs font-medium flex items-center justify-center transition-all duration-150 ${
                    selected
                      ? "bg-[#E2B05C] text-black shadow-md shadow-[#E2B05C]/20 font-bold"
                      : today
                        ? "border border-[#E2B05C]/40 text-[#E2B05C]"
                        : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
            <button
              type="button"
              onClick={() => {
                onChange(toIso(new Date()));
                setIsOpen(false);
              }}
              className="text-xs font-semibold text-[#E2B05C] hover:text-[#f3c77c] transition-all"
            >
              Heute
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setIsOpen(false);
              }}
              className="text-xs font-semibold text-white/40 hover:text-white/80 transition-all"
            >
              Löschen
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PremiumDatePicker;
