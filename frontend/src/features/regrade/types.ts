/**
 * features/regrade/types.ts — canonical domain types for the step-4 "Chấm lại" UI.
 *
 * Same pattern as features/review/types.ts: types live here, MOCK_REGRADE
 * just satisfies them. Lets the regrade panel and its sub-components depend
 * on the type shape rather than on the demo data file.
 */

/** A ✓ / × markup placed on a specific line of student work. */
export interface MockAnn {
  line: number;
  kind: "good" | "error";
  text: string;
}

/** One câu (question) in the step-4 regrade panel. */
export interface RegradeQuestion {
  num: number;
  label: string;
  prompt: string;
  /** Per-câu cap from the exam paper, when the đề explicitly partitions
   *  points (e.g. "Câu 1 (3.0đ)"). Optional because many K-12 đề only
   *  give an overall total — in that case the UI hides the "/X.Y"
   *  denominator and skips per-câu max validation, falling back to the
   *  exam-level cap (``RegradePayload.maxTotal``) at the header. */
  maxPoints?: number;
  aiScore: number;
  /** Short rubric note — surfaced as the gợi-ý seed message in chat. */
  summary: string;
  lines: string[];
  annotations: MockAnn[];
  /** Per-câu suggested questions the teacher can one-click to autofill the
   *  chat textarea. Reference prototype hard-codes them per câu so each
   *  câu's seed prompts feel grounded in its own marking. */
  chatSuggestions: string[];
}

/**
 * The full payload that drives the step-4 regrade panel. Built from a live
 * grade via deriveReview(); falls back to MOCK_REGRADE for legacy /
 * salvaged grades.
 */
export interface RegradePayload {
  aiOverall: number;
  maxTotal: number;
  questions: RegradeQuestion[];
}
