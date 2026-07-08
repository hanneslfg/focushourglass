/**
 * Focus Score badge — minimalist chip. When score === 100 a subtle gold
 * outline glow marks the perfect session; anything less keeps its noise low.
 */
import { cn } from "@/lib/utils";

export function FocusScoreBadge({
  score,
  size = "sm",
  className,
}: {
  score: number | undefined | null;
  size?: "xs" | "sm";
  className?: string;
}) {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  const perfect = score >= 100;
  const good = score >= 80 && !perfect;
  const base =
    size === "xs"
      ? "text-[9px] px-1.5 py-[1px]"
      : "text-[10px] px-2 py-[2px]";
  const color = perfect
    ? "text-amber-200"
    : good
      ? "text-amber-100/80"
      : "text-muted-foreground/80";
  const border = perfect
    ? "border-amber-300/70"
    : good
      ? "border-amber-400/30"
      : "border-border/60";
  return (
    <span
      title={perfect ? "Perfect focus — no pauses, target hit" : `Focus Score ${score}/100`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border tabular-nums uppercase tracking-[0.14em]",
        base,
        color,
        border,
        perfect && "focus-score-perfect",
        className,
      )}
    >
      <span className="opacity-60">Score</span>
      <span>{score}</span>
    </span>
  );
}
