import type { Session } from "@/lib/sessions";

function pauseMinutes(totalPauseSeconds?: number) {
  return Math.max(0, Math.round((totalPauseSeconds || 0) / 60));
}

/**
 * Micro-breakdown of active focus vs. pause time for a historical session.
 * Renders nothing when there was no pause time, keeping the UI quiet.
 */
export function SessionTimeBreakdown({
  session,
  className = "",
}: {
  session: Session;
  className?: string;
}) {
  const pauseMins = pauseMinutes(session.totalPauseSeconds);
  if (pauseMins <= 0) return null;

  return (
    <span
      className={`inline-block text-[10px] tabular-nums text-muted-foreground/60 ${className}`}
    >
      {session.focusedMinutes}m focus · {pauseMins}m pause
    </span>
  );
}
