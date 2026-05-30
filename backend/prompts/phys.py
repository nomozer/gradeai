"""
prompts/phys.py — Vật lý-specific prompt content.

Provides Rule 8 (calibration examples) + Rule 9 (physics crosscheck) for
Physics grading. The rest of the prompt (Rules 1–7, 9b anchors, persona,
rubric) is shared via ``prompts.base``.

Upgrade tips:
  - When you see recurring teacher corrections on Physics, add a new example
    to _RULE_8_PHYS so the Grader calibrates scoring against it.
  - When Gemini misses a specific physics pitfall (wrong unit, sign error on
    vector direction, missing condition), add a bullet to _RULE_9_PHYS.
"""

from __future__ import annotations

from .base import compose_grader_system


_RULE_8_PHYS = (
    "8. VÍ DỤ HIỆU CHỈNH (KHÔNG chép các ví dụ này vào transcript):\n\n"
    "— CHÉP TRANSCRIPT —\n"
    "• Công thức học sinh viết: chép nguyên ký hiệu, chỉ số, đơn vị — dù"
    " sai đơn vị hay ký hiệu không chuẩn. 'F=m.a (N/kg)' CHÉP là"
    " 'F=m.a (N/kg)', KHÔNG tự sửa thành '(kg·m/s²)'.\n"
    "• Số và đơn vị: '15 m/s' CHÉP đúng, KHÔNG tính lại hoặc chuyển đổi"
    " sang đơn vị khác. Nhãn 'a)', 'b)' phải xuất hiện.\n"
    "• Bài ≥5 dòng/câu: chép TOÀN BỘ — dừng sớm là thất bại nghiêm trọng.\n\n"
    "— CHẤM ĐIỂM VẬT LÝ (calibrate theo tiêu chí per-câu) —\n"
    "Ví dụ minh hoạ với câu 3.0 điểm, phân bổ: Tóm tắt 0.5 / Công thức "
    "1.0 / Tính toán 1.0 / Đáp số 0.5. Điền 'criteria' theo mẫu sau:\n"
    "• Đúng công thức, sai thay số (nhầm km/h thay m/s): Tóm tắt 0.5/0.5, "
    "Công thức 1.0/1.0, Tính toán 0/1.0, Đáp số 0/0.5 → score 1.5/3.0.\n"
    "• Đúng phương pháp, sai dấu vectơ (lực ngược chiều): Tóm tắt 0.5/0.5, "
    "Công thức 1.0/1.0, Tính toán 0.5/1.0, Đáp số 0/0.5 → score 2.0/3.0.\n"
    "• Đúng đáp án số nhưng không ghi đơn vị ở kết quả cuối: Tóm tắt "
    "0.5/0.5, Công thức 1.0/1.0, Tính toán 1.0/1.0, Đáp số 0/0.5 → "
    "score 2.5/3.0.\n"
    "• Áp dụng đúng bảo toàn năng lượng nhưng bỏ qua ma sát khi đề đề cập: "
    "Tóm tắt 0.5/0.5, Công thức 0.5/1.0, Tính toán 0.5/1.0, Đáp số "
    "0.5/0.5 → score 2.0/3.0.\n"
    "• Chỉ ghi kết quả đúng, không bước giải + sơ đồ lực: Tóm tắt 0/0.5, "
    "Công thức 0/1.0, Tính toán 0.5/1.0, Đáp số 0.5/0.5 → score 1.0/3.0."
)


_RULE_9_PHYS = (
    "9. ĐỐI SOÁT LOGIC (VẬT LÝ):\n"
    "• Kiểm tra chiều suy luận vật lý: định luật / công thức áp dụng có đúng"
    " điều kiện không? Vd: 'áp dụng định luật Hooke' — lò xo có trong giới"
    " hạn đàn hồi không? 'áp dụng bảo toàn động lượng' — hệ có cô lập không?\n"
    "• Quét các lỗi phổ biến:\n"
    "  - Sai đơn vị hoặc không đổi đơn vị trước khi thay số (km/h → m/s,"
    " g → kg, cm → m)\n"
    "  - Sai dấu / chiều vector: lực, vận tốc, gia tốc có chiều âm/dương"
    " nhất quán theo trục tọa độ đã chọn không?\n"
    "  - Bỏ quên điều kiện / lực: ma sát, lực cản không khí, phân tích"
    " lực trên mặt phẳng nghiêng đủ thành phần chưa?\n"
    "  - Nhầm công thức: v² = v₀² + 2as (thẳng đều biến đổi) dùng nhầm"
    " cho chuyển động tròn, hoặc ngược lại.\n"
    "  - Sai bước kiểm tra nghiệm: nghiệm âm của vận tốc / khối lượng có"
    " hợp lý về mặt vật lý không?\n"
    "  - Không ghi đơn vị ở kết quả cuối mỗi câu.\n"
    "• Tự tính lại đáp án chuẩn trong đầu (KHÔNG ghi vào transcript)."
    " Dùng để kiểm tra đáp án học sinh.\n"
    "• Lỗi PHẢI ghi RÕ trong per_question_feedback.errors: chỉ đích danh"
    " bước sai + lý do vật lý. Vd: 'Em dùng v=30 m/s nhưng đề cho 108 km/h"
    " — phải đổi: 108 km/h = 30 m/s (đúng) nhưng em thay 108 vào công thức"
    " → kết quả sai.'\n"
    "• Với bài đồ thị / sơ đồ lực: kiểm tra học sinh đọc đúng hệ số góc,"
    " gốc tọa độ, và ghi đủ chú thích (tên trục, đơn vị).\n"
    "• Tiêu chí 'Đáp số' phản ánh độ đúng của KẾT QUẢ; 'Công thức' phản"
    " ánh chọn đúng định luật; 'Tính toán' phản ánh thay số / biến đổi"
    " đúng — KHÔNG độ đẹp chữ. Đáp số số đúng nhưng dùng sai định luật"
    " KHÔNG được điểm 'Công thức' cao.\n"
    "• Kết quả đối soát CHỈ xuất hiện ở comment / errors — KHÔNG sửa transcript."
)


GRADER_SYSTEM_PHYS = compose_grader_system(_RULE_8_PHYS, _RULE_9_PHYS)
