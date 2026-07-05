/**
 * Click-to-edit details for a previously logged session. Lets the user roll
 * back forgotten "I left the timer running" minutes via the same premium
 * slider used to live in the post-session screen. Saves optimistically and
 * pushes the patch to Supabase.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdjustFocusTime } from "./AdjustFocusTime";
import { updateSession, type Session } from "@/lib/sessions";
import { updateSessionMinutesRemote } from "@/lib/supabase";
import { findGoalByText, isGoalAchieved } from "@/lib/goals";
import { Check } from "lucide-react";
import { toast } from "sonner";

function fmtClock(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function fmtLongDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

interface Props {
  session: Session | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SessionDetailModal({ session, open, onOpenChange }: Props) {
  const [saving, setSaving] = useState(false);

  // Reset saving flag whenever the modal is reopened with a new session.
  useEffect(() => {
    if (open) setSaving(false);
  }, [open, session?.id]);

  if (!session) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md border-amber-500/20 bg-[#0e0e0e]/95 backdrop-blur" />
      </Dialog>
    );
  }

  async function handleConfirm(newMinutes: number) {
    if (!session || saving) return;
    if (newMinutes === session.focusedMinutes) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    // Optimistic local update — graphs & lists react instantly.
    updateSession(session.id, { focusedMinutes: newMinutes });
    const res = await updateSessionMinutesRemote({
      id: session.id,
      startedAt: session.startedAt,
      taskName: session.task,
      actualMinutes: newMinutes,
    });
    if (!res.ok) {
      // Rollback local change.
      updateSession(session.id, { focusedMinutes: session.focusedMinutes });
      toast.error("Couldn't update session", {
        description: "We'll keep the original duration.",
      });
    } else {
      toast.success("Session updated", {
        description: `${newMinutes} min focused`,
      });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-amber-500/20 bg-[#0e0e0e]/95 backdrop-blur">
        <DialogHeader>
          <DialogTitle className="font-display text-xl tracking-tight text-amber-100">
            {session.task || "Untitled session"}
          </DialogTitle>
          <div className="text-[10px] uppercase tracking-[0.28em] text-amber-400/60 mt-1">
            {fmtLongDate(session.completedAt)} · {fmtClock(session.startedAt)}
          </div>
        </DialogHeader>

        {session.projectName && (
          <div className="mt-1 inline-flex items-center gap-1.5 pl-1.5 pr-2.5 h-5 rounded-full text-[10px] uppercase tracking-[0.18em] self-start w-fit"
            style={{
              background: `${session.projectColor ?? "#666"}22`,
              border: `1px solid ${session.projectColor ?? "#666"}55`,
              color: session.projectColor ?? "var(--muted-foreground)",
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: session.projectColor ?? "#888" }} />
            {session.projectName}
          </div>
        )}

        {(session.goalText ?? session.tags?.[0]) && (
          <div className="mt-2">
            <GoalChipInline
              goalText={session.goalText ?? session.tags?.[0] ?? ""}
              projectId={session.projectId}
              focusedMinutes={session.focusedMinutes}
            />
          </div>
        )}

        <div className="mt-4">
          <AdjustFocusTime
            trackedMinutes={session.focusedMinutes}
            taskName={session.task || "Untitled session"}
            maxMinutes={Math.max(session.focusedMinutes + 240, 480)}
            startExpanded
            onConfirm={handleConfirm}
          />
        </div>

      </DialogContent>
    </Dialog>
  );
}

function GoalChipInline({
  goalText,
  projectId,
  focusedMinutes,
}: { goalText: string; projectId?: string; focusedMinutes: number }) {
  const goal = projectId ? findGoalByText(projectId, goalText) : null;
  const color = goal?.color ?? "#94a3b8";
  const achieved = isGoalAchieved(goal, focusedMinutes);
  return (
    <span
      className="inline-flex items-center gap-1.5 pl-2 pr-2.5 h-6 rounded-full text-[10px] tracking-wide self-start w-fit"
      style={{
        background: `${color}1a`,
        border: `1px solid ${color}55`,
        color,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span className="truncate max-w-[16rem]">{goalText}</span>
      {achieved && <Check className="h-3 w-3" strokeWidth={2.5} />}
    </span>
  );
}
