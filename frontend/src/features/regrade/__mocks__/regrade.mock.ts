/**
 * regrade.mock.ts — UI fixture data for the step-4 StepRegrade component.
 *
 * Acts as the fallback payload when a live grade has no per_question_feedback
 * with scores (legacy or salvaged Gemini responses). Types live in
 * features/regrade/types.ts so consumers do not depend on
 * `typeof MOCK_REGRADE` — changing this data file no longer ripples into
 * the type system.
 */

import type { MockAnn, RegradePayload, RegradeQuestion } from "../types";

export type { MockAnn, RegradePayload, RegradeQuestion };

export const MOCK_REGRADE: RegradePayload = {
  aiOverall: 8.5,
  maxTotal: 10.0,
  questions: [
    {
      num: 1,
      label: "Câu 1",
      prompt: "Giải phương trình x² - 5x + 6 = 0",
      maxPoints: 3.0,
      aiScore: 3.0,
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
      chatSuggestions: [
        "Bài làm có cần trừ điểm nào không?",
        "Đáp án đã đúng, không cần sửa.",
      ],
    },
    {
      num: 2,
      label: "Câu 2",
      prompt: "Tìm m để phương trình x² - 2(m+1)x + m² - 3 = 0 có hai nghiệm phân biệt.",
      maxPoints: 4.0,
      aiScore: 3.0,
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
      chatSuggestions: [
        "Tại sao trừ điểm câu này?",
        "Đáp án đã đúng, không cần trừ.",
        "Học sinh thiếu kết luận miền m.",
      ],
    },
    {
      num: 3,
      label: "Câu 3",
      prompt: "Cho phương trình x² + bx + c = 0 có hai nghiệm là 2 và -5. Tìm b, c.",
      // ``maxPoints`` intentionally omitted to demo the "đề không quy định"
      // case — teacher gets a free-form input, exam-level cap (10đ) is
      // enforced at the header total only.
      aiScore: 2.5,
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
      chatSuggestions: [
        "Tại sao trừ điểm câu này?",
        "Đáp án đã đúng, không cần trừ.",
        "Học sinh thiếu kết luận miền m.",
      ],
    },
  ],
};
