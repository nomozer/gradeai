/**
 * review.mock.ts — UI fixture data for StepReview's "Trần Minh Khôi" mockup.
 *
 * Two roles in the live app:
 *   • Fallback when a grade has no per-question scored data (legacy or
 *     salvaged Gemini responses) so the layout doesn't crash.
 *   • Default for ReviewMockup's `review` prop so the visual mockup can be
 *     rendered standalone without a live pipeline.
 *
 * Types live in features/review/types.ts so consumers do not depend on
 * `typeof MOCK_REVIEW` — changing this data file no longer ripples into
 * the type system.
 */

import type {
  MockAnnotation,
  MockQuestion,
  MockReferencedLesson,
  ReviewPayload,
} from "../types";

export type { MockAnnotation, MockQuestion, MockReferencedLesson, ReviewPayload };

export const MOCK_REVIEW: ReviewPayload = {
  studentName: "Trần Minh Khôi",
  studentClass: "Lớp 10A1",
  runNumber: 1,
  lessonsUsed: 3,
  modelName: "gemini-3-flash-preview",
  durationSec: 4.8,
  overallScore: 8.5,
  overallMax: 10.0,
  correctCount: 1,
  needsReviewCount: 2,
  /** Default focus on mount — Câu 1 mirrors the reference screenshot. */
  initialActiveQuestionNum: 1,
  referencedLessons: [
    {
      id: "L-0247",
      subject: "Toán",
      score: 4.0,
      text: "Khi học sinh giải pt bậc hai bằng Δ, không trừ điểm vì thiếu khẳng định a ≠ 0 nếu hệ số đã hiển nhiên bằng 1.",
      similarity: 0.91,
      date: "2026-04-22",
    },
    {
      id: "L-0193",
      subject: "Toán",
      score: 3.5,
      text: "Với câu hỏi 'tìm m để có 2 nghiệm phân biệt', cần kết luận miền m, KHÔNG chỉ ghi bất phương trình kết quả.",
      similarity: 0.88,
      date: "2026-04-15",
    },
    {
      id: "L-0166",
      subject: "Toán",
      score: 3.0,
      text: "Vi-ét chỉ áp dụng được khi pt có nghiệm (Δ ≥ 0). Bài đề cho biết đã có 2 nghiệm thì không cần nhắc lại điều kiện.",
      similarity: 0.74,
      date: "2026-03-30",
    },
  ],
  questions: [
    {
      num: 1,
      earned: 3.0,
      max: 3.0,
      summary: "Trình bày đầy đủ, tính Δ và nghiệm chính xác.",
      lines: [
        "Câu 1.",
        "x² - 5x + 6 = 0",
        "Δ = 25 - 24 = 1",
        "x = (5 ± 1) / 2",
        "→ x = 3  hoặc  x = 2",
        "Vậy phương trình có hai nghiệm  x = 2, x = 3.",
      ],
      annotations: [
        { line: 1, kind: "good", text: "Tính Δ đúng" },
        { line: 4, kind: "good", text: "Kết luận đầy đủ" },
      ],
    },
    {
      num: 2,
      earned: 3.0,
      max: 4.0,
      summary: "Tính toán đúng nhưng chưa loại trừ điều kiện a ≠ 0 và chưa nói rõ pt bậc hai.",
      lines: [
        "Câu 2.",
        "Để pt có 2 nghiệm phân biệt → Δ' > 0",
        "Δ' = (m+1)² - (m² - 3)",
        "    = m² + 2m + 1 - m² + 3",
        "    = 2m + 4",
        "2m + 4 > 0  →  m > -2",
        "Vậy m > -2 thì pt có 2 nghiệm phân biệt.",
      ],
      annotations: [
        { line: 1, kind: "error", text: "Thiếu khẳng định a = 1 ≠ 0 (pt bậc hai)" },
        { line: 5, kind: "good", text: "Biến đổi đúng" },
        { line: 6, kind: "error", text: "Cần KẾT LUẬN miền m ⇒ trừ 0.5đ" },
      ],
    },
    {
      num: 3,
      earned: 2.5,
      max: 3.0,
      summary: "Dùng Vi-ét hợp lý, nhưng cần ghi rõ điều kiện áp dụng và thử lại.",
      lines: [
        "Câu 3.",
        "Theo Vi-ét:",
        "x₁ + x₂ = -b   →   2 + (-5) = -b   →   b = 3",
        "x₁ · x₂ = c     →   2 · (-5) = c     →   c = -10",
        "Vậy b = 3, c = -10.",
      ],
      annotations: [
        { line: 2, kind: "error", text: "Thiếu điều kiện Δ ≥ 0 để áp dụng Vi-ét" },
        { line: 3, kind: "good", text: "Tính b đúng" },
        { line: 4, kind: "good", text: "Tính c đúng" },
      ],
    },
  ],
};
