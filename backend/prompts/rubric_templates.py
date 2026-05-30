"""
prompts/rubric_templates.py — Per-subject per-câu criteria templates.

Pattern B rubric. STEM tự luận is graded per-câu per-step (Setup → Solve →
Answer for math, Equation → Stoich → Calc → Units for chem, etc.), not via
global summed buckets like the legacy văn rubric (content / argument /
expression / creativity). Each subject's template is the canonical set of
sub-criteria its teachers decompose a câu into when grading.

The orchestrator picks ``RUBRIC_TEMPLATES[resolved_subject]`` and injects
the rendered block (``format_criteria_block``) into the grader prompt's
dynamic section. The grader is then required to emit a ``criteria`` array
inside every ``per_question_feedback`` item whose labels match the
template and whose ``max`` values sum to the câu's ``max_points``.

Number of criteria intentionally varies per subject (3–4) — STEM teachers
don't all use the same shape. ``RUBRIC_KEYS`` (the legacy 4-tuple in
``grading.scoring``) is the old global-bucket axis and survives this
release for backward-compat; it'll retire once the criteria column is
verified in production.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CriterionDef:
    """One sub-criterion within a câu, per subject."""

    label: str  # Vietnamese label — chép đúng thành tên field trong JSON output
    default_weight: float  # Default fraction of câu max_points (sums to 1.0)
    description: str = ""  # Optional hint shown to the grader


# Each list's default_weight values sum to ~1.0 — they're the default
# allocation across a câu's max_points. AI may shift ±10% per câu if the
# specific question warrants it (e.g. a chem câu that's pure calculation
# may bump Tính toán up and drop Phương trình to 0).
RUBRIC_TEMPLATES: dict[str, list[CriterionDef]] = {
    "math": [
        CriterionDef("Đặt vấn đề", 0.20, "Nhận diện dạng bài, viết giả thiết / kết luận"),
        CriterionDef("Biến đổi", 0.35, "Áp dụng công thức, lập luận từng bước"),
        CriterionDef("Kết quả", 0.30, "Đáp số đúng, có đơn vị nếu cần"),
        CriterionDef("Trình bày", 0.15, "Sạch sẽ, ký hiệu chuẩn, đủ bước trung gian"),
    ],
    "cs": [
        CriterionDef("Thuật toán", 0.45, "Logic giải đúng, chọn cấu trúc dữ liệu hợp lý"),
        CriterionDef("Hiện thực", 0.40, "Code chạy được, đúng cú pháp, edge case"),
        CriterionDef("Độ phức tạp", 0.15, "Phân tích thời gian / không gian"),
    ],
    "phys": [
        CriterionDef("Tóm tắt", 0.15, "Liệt kê đại lượng cho / cần tìm, đổi đơn vị"),
        CriterionDef("Công thức", 0.35, "Chọn định luật / công thức đúng cho hiện tượng"),
        CriterionDef("Tính toán", 0.30, "Thay số đúng, biến đổi không sai"),
        CriterionDef("Đáp số", 0.20, "Kết quả đúng kèm đơn vị SI"),
    ],
    "chem": [
        CriterionDef("Phương trình", 0.30, "Viết & cân bằng đúng phản ứng"),
        CriterionDef("Tỉ lệ mol", 0.30, "Quy đổi mol theo đúng tỉ lệ phương trình"),
        CriterionDef("Tính toán", 0.25, "Tính nồng độ / khối lượng / thể tích đúng"),
        CriterionDef("Đơn vị", 0.15, "Đơn vị đúng + làm tròn hợp lý"),
    ],
    "bio": [
        CriterionDef("Khái niệm", 0.45, "Định nghĩa, gọi tên hiện tượng / cơ chế đúng"),
        CriterionDef("Giải thích", 0.40, "Cơ chế, nguyên nhân, hệ quả rõ ràng"),
        CriterionDef("Liên hệ", 0.15, "Ví dụ thực tế / ứng dụng / so sánh"),
    ],
}


def get_criteria(subject: str) -> list[CriterionDef]:
    """Return the per-câu criteria template for a subject.

    Falls back to ``math`` if the subject code is unknown — same fallback
    spirit as ``DEFAULT_SUBJECT`` in ``prompts/__init__.py``, but keyed
    specifically to a "safe generic" rubric rather than the UI default.
    """
    return RUBRIC_TEMPLATES.get(subject) or RUBRIC_TEMPLATES["math"]


def format_criteria_block(subject: str) -> str:
    """Render the criteria template as the dynamic-block prompt section.

    The orchestrator concatenates this after the answer key (if any) and
    before the topic — same authority slot as ``max_points_template`` —
    so the grader reads it as a binding constraint, not a hint.
    """
    criteria = get_criteria(subject)
    lines: list[str] = []
    for c in criteria:
        weight_pct = int(round(c.default_weight * 100))
        suffix = f": {c.description}" if c.description else ""
        lines.append(f"  • {c.label} (~{weight_pct}%){suffix}")
    body = "\n".join(lines)
    return (
        "### TIÊU CHÍ CHẤM TỪNG CÂU (Per-câu rubric — BẮT BUỘC)\n"
        "Mỗi câu được chấm theo các tiêu chí phụ dưới đây. Tỷ lệ % là "
        "phân bổ gợi ý trên max_points của câu — có thể điều chỉnh ±10% "
        "tuỳ yêu cầu cụ thể của từng câu, miễn TỔNG max các tiêu chí = "
        "max_points của câu đó.\n\n"
        f"{body}\n\n"
        "Output: mỗi phần tử per_question_feedback BẮT BUỘC có field "
        "'criteria' là mảng các object {label, points, max, errors}:\n"
        "  - label: chép ĐÚNG chữ tiếng Việt từ danh sách trên (kể cả dấu).\n"
        "  - max: điểm tối đa cho tiêu chí đó ở câu này (bội 0.5).\n"
        "  - points: điểm AI cho tiêu chí (0 ≤ points ≤ max, bội 0.5).\n"
        "  - errors: ghi chú ngắn (≤25 từ) chỉ điểm cần cải thiện; '' "
        "nếu tiêu chí trọn điểm.\n"
        "Ràng buộc cứng: sum(max trong criteria) = max_points của câu; "
        "sum(points trong criteria) = score của câu (sai số làm tròn ≤ 0.5)."
    )


__all__ = [
    "CriterionDef",
    "RUBRIC_TEMPLATES",
    "get_criteria",
    "format_criteria_block",
]
