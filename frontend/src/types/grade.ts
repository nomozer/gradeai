import type { Subject } from "./domain";

/** A 4-dimension rubric score. Values may be empty strings while the
 *  teacher is editing (controlled <input type="number">). */
export interface RubricScores {
  content: number | string;
  argument: number | string;
  expression: number | string;
  creativity: number | string;
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
}

/** Normalized grade payload returned by `parseGrade` — always the same
 *  shape even when the backend produced a salvage-mode output. */
export interface Grade {
  scores: RubricScores;
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
  scores: RubricScores;
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
  /** Raw delta map from backend — keys: rubric names + ``cau:N`` +
   *  ``overall``. Used to count per-câu adjustments in the banner. */
  deltas?: Record<string, number>;
}
