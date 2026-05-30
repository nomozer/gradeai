import type { Subject } from "./domain";

/** A sub-criterion within a câu (Pattern B per-câu rubric).
 *
 *  Emitted by the backend when the resolved subject's rubric template
 *  (``backend/prompts/rubric_templates.py``) is injected into the grader
 *  prompt — current default for every subject. ``label`` is the
 *  Vietnamese label from the template (e.g. "Đặt vấn đề" for math, "Cân
 *  bằng phương trình" for chem); ``max`` is the per-câu max-points
 *  allocation; ``points`` is the AI's score for that criterion.
 *
 *  Optional at the type level so older grade JSONs (no criteria) parse
 *  cleanly via ``parseGrade``.
 */
export interface Criterion {
  label: string;
  points: number;
  max: number;
  errors?: string;
}

export interface PerQuestionFeedback {
  question?: string;
  /** Per-question max points on the 10-scale (e.g. 3.0). Backend started
   *  emitting this alongside the textual feedback so step-5 phiếu chấm
   *  can render real scores instead of mocked ones. Optional because
   *  older grade JSONs (pre-schema-bump) won't carry it. */
  max_points?: number;
  /** AI's score for this question (0 ≤ score ≤ max_points, step 0.5).
   *  Optional for the same backward-compat reason as max_points. */
  score?: number;
  good_points?: string;
  errors?: string;
  /** Per-câu sub-rubric breakdown (Pattern B). Each entry maps a step in
   *  the câu (Setup / Solve / Answer for math; Equation / Stoich / Calc /
   *  Units for chem; etc.) to its own points + max + errors. Sum of
   *  ``max`` over the array equals the câu's ``max_points``; sum of
   *  ``points`` equals the câu's ``score``. */
  criteria?: Criterion[];
}

/** Normalized grade payload returned by `parseGrade` — always the same
 *  shape even when the backend produced a salvage-mode output.
 *
 *  Pattern B (Phase 3): the legacy 4-trục global rubric (content /
 *  argument / expression / creativity) is gone. ``overall`` is the only
 *  top-level score; per-câu rubric breakdown lives in
 *  ``per_question_feedback[i].criteria``.
 */
export interface Grade {
  overall: number | string;
  strengths: string[];
  weaknesses: string[];
  comment: string;
  transcript: string;
  per_question_feedback: PerQuestionFeedback[];
  salvaged: boolean;
  subject: Subject | string;
}

export interface TaskFile {
  dataUrl: string;
  name: string;
}

export interface EssayFile {
  dataUrl: string;
  name: string;
  isPdf: boolean;
}

export interface FinalizedResult {
  overall: number | string;
  finalizedAt: string;
  /** Number of step 3 annotations saved as HITL lessons via the prior
   *  /api/feedback approve call. Excludes annotations AI disputed and
   *  teacher chose to skip. Surfaced in step 5 so the teacher sees AI
   *  has learned from their comments. */
  commentsSavedCount?: number;
  /** Number of annotations the teacher wrote but AI disputed AND
   *  teacher accepted the dispute (didn't override). Surfaced in step
   *  5 so the teacher sees the anti-poisoning gate at work. */
  commentsSkippedCount?: number;
  /** ID of the auto-generated delta lesson when teacher's score diverged
   *  from AI by ≥ threshold. Null = no significant delta (AI already
   *  matched). Drives the "AI đã học cách bạn chấm điểm" indicator. */
  deltaLessonId?: number | null;
  /** Raw delta map from backend — keys: ``cau:N``, ``step:N:label``,
   *  ``overall``. Used to count per-câu adjustments in the banner. */
  deltas?: Record<string, number>;
}
