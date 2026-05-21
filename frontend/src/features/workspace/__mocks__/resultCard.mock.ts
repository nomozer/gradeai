/**
 * resultCard.mock.ts — UI fixture data for the ResultCard component.
 *
 * Two pieces of mock data live here:
 *
 *   • MOCK_STUDENT — used unconditionally because the app has no upload-
 *     form field for student name / class / STT yet. When the upload
 *     step gains those fields, swap this for props from the workspace.
 *
 *   • MOCK_QUESTIONS — fallback only, used when the grade payload has no
 *     per_question_feedback with scores (legacy grade or salvaged). Once
 *     every grade carries real max_points + score, this can be deleted.
 */

export const MOCK_STUDENT = {
  name: "Trần Minh Khôi",
  classRoom: "Lớp 10A1",
  roll: "STT 14",
};

export const MOCK_QUESTIONS = [
  {
    num: 1,
    label: "Câu 1",
    prompt: "Giải phương trình x² − 5x + 6 = 0",
    maxPoints: 3.0,
    aiScore: 3.0,
    teacherScore: 3.0,
    goodPoints:
      "Tính Δ chính xác, viết đầy đủ công thức nghiệm, kết luận rõ ràng.",
    improvements: "",
  },
  {
    num: 2,
    label: "Câu 2",
    prompt:
      "Tìm m để phương trình x² − 2(m+1)x + m² − 3 = 0 có hai nghiệm phân biệt.",
    maxPoints: 4.0,
    aiScore: 3.0,
    teacherScore: 3.0,
    goodPoints:
      "Biến đổi Δ' chính xác, dẫn được bất phương trình 2m + 4 > 0.",
    improvements:
      "Cần khẳng định a = 1 ≠ 0 (pt bậc hai) ở đầu bài. Kết luận miền m phải nêu rõ trong câu trả lời cuối.",
  },
  {
    num: 3,
    label: "Câu 3",
    prompt: "Cho phương trình x² + bx + c = 0 có hai nghiệm là 2 và −5. Tìm b, c.",
    maxPoints: 3.0,
    aiScore: 2.5,
    teacherScore: 2.5,
    goodPoints: "Áp dụng Vi-ét hợp lý, tính b và c đều chính xác.",
    improvements:
      "Thiếu kiểm tra điều kiện Δ ≥ 0 trước khi áp dụng Vi-ét.",
  },
];
