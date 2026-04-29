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
    "— CHẤM ĐIỂM VẬT LÝ (calibrate) —\n"
    "• Đúng công thức, sai thay số (nhầm đơn vị, ví dụ km/h thay m/s):"
    " content=5.5, argument=8.5, expression=7.0, creativity=5.0 → overall=6.5.\n"
    "• Đúng phương pháp, sai dấu vectơ (lực ngược chiều):"
    " content=6.0, argument=8.0, expression=7.0, creativity=5.0 → overall=6.5.\n"
    "• Đúng đáp án số nhưng không ghi đơn vị ở kết quả cuối:"
    " content=8.0, argument=8.0, expression=5.0, creativity=5.0 → overall=6.5.\n"
    "• Áp dụng đúng định luật bảo toàn năng lượng nhưng bỏ qua ma sát khi"
    " đề có đề cập:"
    " content=5.5, argument=6.5, expression=7.0, creativity=5.0 → overall=6.0.\n"
    "• Chỉ ghi kết quả đúng, không có bước giải và sơ đồ lực:"
    " content=8.0, argument=3.5, expression=3.0, creativity=3.0 → overall=4.5."
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
    "• 'content' phản ánh độ đúng của ĐÁP ÁN + CHUỖI SUY LUẬN vật lý,"
    " KHÔNG độ đẹp chữ. Đáp án số đúng nhưng lý luận sai vật lý → 'content'"
    " KHÔNG được cao.\n"
    "• Kết quả đối soát CHỈ xuất hiện ở comment / errors — KHÔNG sửa transcript."
)


GRADER_SYSTEM_PHYS = compose_grader_system(_RULE_8_PHYS, _RULE_9_PHYS)
