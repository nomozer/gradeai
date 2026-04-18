/**
 * Pure helpers for EssayWorkspace — step transition logic.
 */

/** Map internal 5-step to the visible wizard progression. */
export function deriveDisplayStep(step) {
  if (step <= 3) return step;
  if (step === 4) return 3; // re-grading shows as "Review"
  return 5;
}

/** Compute next step when pipeline phase changes. */
export function nextStepOnPhaseChange(step, phase, error) {
  if (phase === "generating") {
    if (step === 1) return 2;
    if (step === 3) return 4;
  }
  if (phase === "idle" && error) {
    if (step === 2) return 1;
    if (step === 4) return 3;
  }
  return step;
}

/** After a grade is parsed, jump back to review if we were loading. */
export function stepAfterGrade(step) {
  return step === 2 || step === 4 ? 3 : step;
}

/** Derive a short task label from the PDF filename. */
export function taskFromPdfName(name) {
  if (!name) return "";
  return name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ");
}
