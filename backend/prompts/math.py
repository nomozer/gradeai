"""
prompts/math.py — Toán-specific prompt content.

Provides Rule 8 (calibration examples) + Rule 9 (algebra crosscheck) for
Math grading. The rest of the prompt (Rules 1–7, 9b anchors, persona,
rubric) is shared via ``prompts.base``.

Upgrade tips:
  - When you see recurring teacher corrections on Math, add a new example
    to _RULE_8_MATH so the Grader calibrates scoring against it.
  - When Gemini misses a specific algebra pitfall (sign flip, missing case,
    equivalence transforms), add a bullet to _RULE_9_MATH.
"""

from __future__ import annotations

from .base import compose_grader_system


_RULE_8_MATH = (
    "8. VÍ DỤ HIỆU CHỈNH (KHÔNG chép các ví dụ này vào transcript):\n\n"
    "— CHÉP TRANSCRIPT —\n"
    "• Dấu tương đương '⇔' viết vội dễ nhầm '⇒'. Nếu sau đó là ngoặc vuông "
    "phân nhánh (vd: ⇔ [ x = a …), LUÔN dùng '⇔' — dùng '⇒' là sai logic.\n"
    "• Giữ ký hiệu gốc: '(|x| ≤ 1) AND (|y| ≤ 1)' giữ dấu | cả hai. Nhãn "
    "'a)', 'b)' phải xuất hiện.\n"
    "• Bài ≥5 dòng/câu: chép TOÀN BỘ — dừng sớm là thất bại nghiêm trọng.\n\n"
    "— CHẤM ĐIỂM TOÁN (calibrate theo tiêu chí per-câu) —\n"
    "Ví dụ minh hoạ với câu 3.0 điểm, phân bổ: Đặt vấn đề 0.5 / Biến đổi "
    "1.0 / Kết quả 1.0 / Trình bày 0.5. Điền 'criteria' theo mẫu sau:\n"
    "• Đúng phương pháp, sai dấu bước cuối (x=3 thay x=−3): Đặt vấn đề "
    "0.5/0.5, Biến đổi 1.0/1.0, Kết quả 0/1.0, Trình bày 0.5/0.5 → "
    "score 2.0/3.0.\n"
    "• Đúng đáp án, bỏ 1 trường hợp ẩn mẫu: Đặt vấn đề 0.5/0.5, Biến đổi "
    "0.5/1.0, Kết quả 0.5/1.0, Trình bày 0.5/0.5 → score 2.0/3.0.\n"
    "• Chỉ ghi đáp án đúng không có bước: Đặt vấn đề 0/0.5, Biến đổi "
    "0/1.0, Kết quả 1.0/1.0, Trình bày 0/0.5 → score 1.0/3.0.\n"
    "• Chứng minh đúng ý nhưng bỏ bước chuyển đổi tương đương quan trọng: "
    "Đặt vấn đề 0.5/0.5, Biến đổi 0.5/1.0, Kết quả 1.0/1.0, Trình bày "
    "0.5/0.5 → score 2.5/3.0.\n"
    "• Giải hệ ra nghiệm phụ không thử lại điều kiện: Đặt vấn đề 0.5/0.5, "
    "Biến đổi 1.0/1.0, Kết quả 0.5/1.0, Trình bày 0.5/0.5 → score 2.5/3.0."
)


_RULE_9_MATH = (
    "9. ĐỐI SOÁT LOGIC (TOÁN):\n"
    "• Sau khi chép xong, đối chiếu từng bước suy luận với đề gốc và dòng "
    "ngay trên: bước này có suy ra TƯƠNG ĐƯƠNG từ dòng trên? Kiểm dấu "
    "(+/−), hệ số, vế trái/phải, biến, chỉ số, phép toán áp dụng đồng nhất "
    "hai vế.\n"
    "• Tự tính lại đáp án đúng (lời giải tham chiếu) trong đầu — KHÔNG ghi "
    "vào transcript. Dùng để so với đáp án cuối của học sinh.\n"
    "• Bước sai (đổi dấu, sai hệ số, không tương đương, thiếu trường hợp, "
    "quên điều kiện nghiệm) PHẢI ghi RÕ trong per_question_feedback.errors: "
    "chỉ đích danh bước + sai ở đâu. Vd: 'Từ (3x − 15) = 0 phải suy ra "
    "3x − 15 = 0, không phải 3x + 15 = 0 — em đổi dấu hạng tử thứ hai, "
    "dẫn đến x = −5 thay x = 5.'\n"
    "• Với bài chứng minh: kiểm tra mỗi mệnh đề có dẫn chứng từ bước trên "
    "hay tiên đề không; phát hiện lập luận vòng vèo (circular reasoning) "
    "hoặc nhảy bước.\n"
    "• Với bài hình học: kiểm tra điều kiện áp dụng định lý (vd: 'áp dụng "
    "Pytago cho △ABC vuông tại A' — có thực sự vuông tại A không?).\n"
    "• Tiêu chí 'Kết quả' phản ánh độ đúng của ĐÁP SỐ; 'Biến đổi' phản "
    "ánh CHUỖI SUY LUẬN — KHÔNG phải độ đẹp chữ. Đáp số sai vì biến đổi "
    "lỗi KHÔNG được điểm 'Kết quả' cao dù 'Trình bày' đẹp.\n"
    "• Kết quả đối soát CHỈ xuất hiện ở comment / errors — KHÔNG sửa transcript."
)


GRADER_SYSTEM_MATH = compose_grader_system(_RULE_8_MATH, _RULE_9_MATH)
