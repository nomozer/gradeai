/**
 * Pure helpers for EssayWorkspace — step transition logic.
 */

/** Map the internal step number to the visible 3-step wizard position.
 *  The flow is now Tải lên (1) → Đọc (2) → Xem xét & Chốt (3); the old
 *  step-4 "Xong" screen was folded into step 3 (the review surface owns
 *  both the editable pass and the locked post-finalize summary + print),
 *  so this is an identity map kept as a seam for any future remap. */
export function deriveDisplayStep(step: number): number {
  return step;
}

/** Compute next step when pipeline phase changes. */
export function nextStepOnPhaseChange(step: number, phase: string, error: string | null): number {
  if (phase === "generating") {
    if (step === 1) return 2;
  }
  if (phase === "idle" && error) {
    if (step === 2) return 1;
  }
  return step;
}

/** After a grade is parsed, jump to review if we were loading. */
export function stepAfterGrade(step: number): number {
  return step === 2 ? 3 : step;
}

/** Derive a short task label from the PDF filename. */
export function taskFromPdfName(name: string | null | undefined): string {
  if (!name) return "";
  return name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ");
}

/** Stable task descriptor used for backend retrieval/logging.
 *  Format: ``"<Môn> · <tên đề>"`` (no class — that prefix was removed
 *  with the header class pill). ``parseTaskContext`` in
 *  ``features/history/GradeHistoryDropdown`` is the canonical decoder
 *  for both this format and the legacy 3-part ``"Môn · Lớp · tên"``
 *  still present in older cached entries. */
export function buildTaskContext(
  name: string | null | undefined,
  selectedSubject: string,
): string {
  const label = taskFromPdfName(name);
  const parts = [selectedSubject, label].filter(Boolean);
  return parts.join(" · ");
}

