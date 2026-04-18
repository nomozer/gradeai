/**
 * Pure helpers for StepReview — no React, no state.
 */

export function deriveReviewState({ action, comment, phase, isSubmitting }) {
  const trimmedComment = (comment ?? "").trim();
  const requiresComment = !!action && action !== "approve";
  const canApprove =
    action === "approve" && !isSubmitting && phase !== "generating";
  const canRegrade =
    phase !== "generating" &&
    !isSubmitting &&
    requiresComment &&
    trimmedComment.length > 0;
  return { trimmedComment, requiresComment, canApprove, canRegrade };
}

/**
 * Map a numeric score to a semantic tier.
 * "top" ≥ 8 · "mid" ≥ 6.5 · "low" ≥ 5 · "fail" < 5 · "none" if NaN.
 */
export function scoreTier(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return "none";
  if (num >= 8) return "top";
  if (num >= 6.5) return "mid";
  if (num >= 5) return "low";
  return "fail";
}

export function scoreColor(value, T) {
  switch (scoreTier(value)) {
    case "top": return T.green;
    case "mid": return T.accent;
    case "low": return T.amber;
    case "fail": return T.red;
    default: return T.textMute;
  }
}

export function buildRegradeFeedback(action, comment) {
  const trimmed = (comment ?? "").trim();
  if (trimmed && action && action !== "approve") {
    return `Teacher action: ${action}\nTeacher note: ${trimmed}`;
  }
  return trimmed || null;
}
