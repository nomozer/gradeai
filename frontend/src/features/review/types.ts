/**
 * features/review/types.ts — canonical domain types for the step-3 review UI.
 *
 * These used to live alongside MOCK_REVIEW in __mocks__/review.mock.ts and
 * consumers depended on `typeof MOCK_REVIEW`. That coupled the type system
 * to the demo data — renaming a mock field broke every component. The
 * types are now defined here, MOCK_REVIEW just satisfies them, and any
 * component that holds a review payload references ReviewPayload directly.
 *
 * Why the names: kept the `Mock*` prefix on the per-câu shapes (MockAnnotation,
 * MockQuestion, MockReferencedLesson) because they are still partially mock
 * — fields like `similarity` and `date` aren't populated from the backend
 * yet. When that wiring lands the prefix can drop.
 */

/** A teacher-style ✓ / × markup placed on a specific line of student work. */
export interface MockAnnotation {
  /** Zero-based index into the parent question's ``lines`` array. */
  line: number;
  kind: "good" | "error";
  text: string;
}

/** One câu (question) on the locked Trần Minh Khôi reference layout. */
export interface MockQuestion {
  num: number;
  earned: number;
  max: number;
  /** Short rubric note shown in the right-side "TỪNG CÂU" summary card. */
  summary: string;
  /** Raw student work, one entry per visual line. Whitespace is preserved
   *  so indented continuation lines line up under their parent expression. */
  lines: string[];
  annotations: MockAnnotation[];
  /** Pattern B per-câu sub-criteria. Pulled from grade.per_question_feedback[i].criteria
   *  when present. MucLucSidebar uses this to render per-criterion teacher
   *  overrides under the câu's total score; the câu total stays the sum of
   *  the criterion points so the two surfaces stay coherent. */
  criteria?: import("../../types").Criterion[];
}

/** A HITL memory lesson surfaced in the right-rail "Bài học đã tham chiếu". */
export interface MockReferencedLesson {
  id: string;
  subject: string;
  score: number;
  text: string;
  similarity: number;
  date: string;
}

/**
 * The full payload that drives step-3 review (ReviewMockup, PaperContainer,
 * MucLucSidebar, BanChamAiModal, …).
 *
 * Shape is the same as MOCK_REVIEW. Built from a live grade via
 * deriveStepReviewData() in StepReview.tsx; falls back to MOCK_REVIEW for
 * legacy / salvaged grades that don't carry per-câu scores.
 */
export interface ReviewPayload {
  studentName: string;
  studentClass: string;
  runNumber: number;
  lessonsUsed: number;
  modelName: string;
  durationSec: number;
  overallScore: number;
  overallMax: number;
  correctCount: number;
  needsReviewCount: number;
  /** Default focus on mount — matches the câu the layout opens to. */
  initialActiveQuestionNum: number;
  referencedLessons: MockReferencedLesson[];
  questions: MockQuestion[];
}

// ---------------------------------------------------------------------------
// Transcript parsing shapes — a flat grade string ("Câu 1: …\nCâu 2: …")
// is split into per-question QuestionParts, then student parts are aligned
// with AI-comment parts into QuestionPairs. Used by review/utils.ts and
// the QuestionBox component.
// ---------------------------------------------------------------------------

export interface QuestionPart {
  idx: number;
  label: string;
  num: number | null;
  body: string;
}

export interface QuestionPair {
  num: number;
  student: QuestionPart;
  ai: QuestionPart;
}
