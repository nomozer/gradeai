"""
scoring.py — Score-delta utilities for the HITL finalize path.

Pure functions that compare an AI grade against a teacher-corrected grade
and emit (a) the numeric delta dict consumed by the API response and
(b) the Vietnamese lesson text persisted into HITL memory.

Kept free of Pydantic / FastAPI imports so the grading domain does not
depend on the api/schemas layer — the HTTP handler in ``main.py`` does
the model-to-primitive unwrap before calling in.

Rubric-aware: ``RUBRIC_KEYS`` matches the VN 10-point STEM rubric the
prompts in ``prompts/base.py`` ask the Grader to fill.
"""

from __future__ import annotations

from typing import Mapping


RUBRIC_KEYS: tuple[str, ...] = ("content", "argument", "expression", "creativity")


def safe_delta(ai: float | None, teacher: float | None) -> float | None:
    """Compute ``teacher - ai`` with graceful handling of missing values."""
    if ai is None or teacher is None:
        return None
    try:
        return round(float(teacher) - float(ai), 2)
    except (TypeError, ValueError):
        return None


def compute_score_deltas(
    ai_scores: Mapping[str, float],
    teacher_scores: Mapping[str, float],
    threshold: float,
) -> dict[str, float]:
    """Per-rubric delta dict, only keeping entries above ``threshold``."""
    deltas: dict[str, float] = {}
    for key in RUBRIC_KEYS:
        d = safe_delta(ai_scores.get(key), teacher_scores.get(key))
        if d is not None and abs(d) >= threshold:
            deltas[key] = d
    return deltas


def compute_per_question_deltas(
    ai: Mapping[str, float] | None,
    teacher: Mapping[str, float] | None,
    threshold: float,
) -> dict[str, float]:
    """Per-câu delta dict keyed by câu number string.

    Iterates over the AI map (the authoritative key set — AI always emits
    every câu it graded) so a teacher map missing a câu reads as
    ``teacher_score = ai_score`` ⇒ delta 0 ⇒ filtered out by threshold.
    Threshold matches ``compute_score_deltas`` (0.25 in main.py) so the
    two axes share one tuning knob.
    """
    if not ai or not teacher:
        return {}
    deltas: dict[str, float] = {}
    for key, ai_val in ai.items():
        d = safe_delta(ai_val, teacher.get(key))
        if d is not None and abs(d) >= threshold:
            deltas[key] = d
    return deltas


def _cau_sort_key(k: str) -> int:
    """Numeric sort for câu keys so "10" comes after "2" in the lesson text."""
    try:
        return int(k)
    except (TypeError, ValueError):
        return 10_000  # non-numeric keys sink to the bottom


def format_delta_lesson(
    *,
    ai_overall: float | None,
    teacher_overall: float | None,
    overall_delta: float | None,
    ai_scores: Mapping[str, float],
    teacher_scores: Mapping[str, float],
    rubric_deltas: Mapping[str, float],
    ai_per_question: Mapping[str, float] | None = None,
    teacher_per_question: Mapping[str, float] | None = None,
    per_question_deltas: Mapping[str, float] | None = None,
) -> str:
    """Render a Vietnamese lesson describing the teacher's corrections.

    Combines BOTH axes (rubric + per-câu) into a single lesson so the
    HITL retrieval corpus sees one lesson per finalize event, not two.
    Splitting them would double-count a single correction in the score-
    weighted retrieval ranking.
    """
    parts = ["Hiệu chỉnh điểm của giáo viên cho bài tương tự:"]
    if overall_delta is not None and abs(overall_delta) >= 0.1:
        direction = "giảm" if overall_delta < 0 else "tăng"
        parts.append(
            f"- Tổng điểm: AI chấm {ai_overall} → giáo viên {direction} "
            f"còn {teacher_overall} (chênh {overall_delta:+})."
        )
    for key, d in rubric_deltas.items():
        direction = "hạ" if d < 0 else "nâng"
        parts.append(
            f"- {key}: AI {ai_scores.get(key)} → giáo viên {direction} "
            f"{teacher_scores.get(key)} (chênh {d:+})."
        )
    if per_question_deltas and ai_per_question and teacher_per_question:
        for cau in sorted(per_question_deltas, key=_cau_sort_key):
            d = per_question_deltas[cau]
            direction = "hạ" if d < 0 else "nâng"
            parts.append(
                f"- Câu {cau}: AI {ai_per_question.get(cau)} → giáo viên "
                f"{direction} {teacher_per_question.get(cau)} (chênh {d:+})."
            )
    parts.append(
        "Khi gặp bài tương tự, cần điều chỉnh theo hướng này để khớp "
        "với chuẩn chấm của giáo viên."
    )
    return "\n".join(parts)


__all__ = [
    "RUBRIC_KEYS",
    "safe_delta",
    "compute_score_deltas",
    "compute_per_question_deltas",
    "format_delta_lesson",
]
