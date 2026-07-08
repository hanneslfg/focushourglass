/**
 * Focus Score algorithm (1–100).
 *
 * A perfect 100 is only possible when the session ran the full planned
 * duration AND zero pauses were made. Any pause caps the score at 99, and
 * frequent short pauses degrade the score exponentially harder than one
 * single longer pause — fragmentation destroys deep work flow.
 */
export function calculateFocusScore(
  targetMinutes: number,
  actualMinutes: number,
  totalPauseDurationMinutes: number,
  pauseCount: number,
  isCompletedSuccessfully: boolean,
): number {
  const completionRatio = isCompletedSuccessfully
    ? 1
    : Math.min(actualMinutes / Math.max(1, targetMinutes), 1);

  let score = completionRatio * 70;

  if (pauseCount > 0) {
    const countPenaltyFactor = Math.pow(1.5, pauseCount - 1);
    const durationPenalty = totalPauseDurationMinutes * 2;
    const totalPenalty = pauseCount * 5 * countPenaltyFactor + durationPenalty;
    const pauseScore = Math.max(0, 30 - totalPenalty);
    score += pauseScore;
  } else {
    score += 30;
  }

  // The unforgiving 100-rule: a clean 100 requires zero pauses.
  if (pauseCount > 0 && score > 99) score = 99;

  return Math.max(1, Math.round(score));
}
