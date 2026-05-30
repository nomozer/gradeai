import type { FeedbackAction } from "./domain";

export interface Lesson {
  id: number;
  task: string;
  wrong_code: string;
  correct_code: string;
  lesson_text: string;
  subject: string;
  timestamp: string | null;
  feedback_score: number;
}

export interface StagedLesson {
  lesson_text: string;
  question_ref: string;
}

/** Inferred AI grade confidence from envelope shape. Drives the
 *  "Độ tin cậy" chip in the unified ActionBar; teacher uses it to
 *  decide skim-vs-deep-dive before reading. Derived server-side by
 *  ``grading.grade_parser.infer_confidence``. */
export type GradeConfidence = "high" | "medium" | "low";

export interface GenerateResponse {
  code: string;
  lessons_used: Lesson[];
  run_id: number | null;
  confidence?: GradeConfidence;
}

export interface GradeHistoryEntry {
  id: string;
  ts: number;
  task: string;
  subject: string | null;
  response: GenerateResponse;
  finalScores?: Record<number, number> | null;
  maxOverrides?: Record<number, number> | null;
}

export interface GradeHistoryResponse {
  items: GradeHistoryEntry[];
}

export interface FeedbackResponse {
  action: FeedbackAction;
  saved: boolean;
  lesson_id: number | null;
  lesson_ids: number[];
  message: string;
}

export interface AnalyzeCommentResponse {
  analysis: string;
  lesson: string;
  /**
   * AI's judgment vs the student work:
   *   - "agree":   teacher comment is correct
   *   - "partial": teacher partially correct, conditions apply
   *   - "dispute": AI thinks teacher misread the student's work — UI
   *                should require explicit confirmation before staging
   *                the lesson into HITL memory
   */
  verdict: "agree" | "partial" | "dispute";
  category?: "error" | "good" | "reasoning" | "expression" | "creative" | "interesting" | "notice" | "other";
}

export interface FinalizeGradeResponse {
  approved_id: number | null;
  delta_lesson_id: number | null;
  comment_lesson_ids: number[];
  deltas: Record<string, number>;
  message: string;
}
