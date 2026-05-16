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


def format_delta_lesson(
    *,
    ai_overall: float | None,
    teacher_overall: float | None,
    ai_scores: Mapping[str, float],
    teacher_scores: Mapping[str, float],
    deltas: Mapping[str, float],
    overall_delta: float | None,
) -> str:
    """Render a Vietnamese lesson describing the teacher's corrections."""
    parts = ["Hiệu chỉnh điểm của giáo viên cho bài tương tự:"]
    if overall_delta is not None and abs(overall_delta) >= 0.5:
        direction = "giảm" if overall_delta < 0 else "tăng"
        parts.append(
            f"- Tổng điểm: AI chấm {ai_overall} → giáo viên {direction} "
            f"còn {teacher_overall} (chênh {overall_delta:+}). "
        )
    for key, d in deltas.items():
        direction = "hạ" if d < 0 else "nâng"
        parts.append(
            f"- {key}: AI {ai_scores.get(key)} → giáo viên {direction} "
            f"{teacher_scores.get(key)} (chênh {d:+}). "
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
    "format_delta_lesson",
]
