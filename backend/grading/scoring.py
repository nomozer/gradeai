"""
scoring.py — Score-delta utilities for the HITL finalize path.

Pure functions that compare an AI grade against a teacher-corrected grade
and emit (a) the numeric delta dict consumed by the API response and
(b) the Vietnamese lesson text persisted into HITL memory.

Kept free of Pydantic / FastAPI imports so the grading domain does not
depend on the api/schemas layer — the HTTP handler in ``main.py`` does
the model-to-primitive unwrap before calling in.

Pattern B (Phase 3): two delta axes — per-câu total + per-câu per-criterion.
The legacy global rubric (content / argument / expression / creativity)
is GONE; ``compute_score_deltas`` and ``RUBRIC_KEYS`` no longer exist.
"""

from __future__ import annotations

from typing import Mapping


def safe_delta(ai: float | None, teacher: float | None) -> float | None:
    """Compute ``teacher - ai`` with graceful handling of missing values."""
    if ai is None or teacher is None:
        return None
    try:
        return round(float(teacher) - float(ai), 2)
    except (TypeError, ValueError):
        return None


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


def compute_per_step_deltas(
    ai: Mapping[str, Mapping[str, float]] | None,
    teacher: Mapping[str, Mapping[str, float]] | None,
    threshold: float,
) -> dict[str, dict[str, float]]:
    """Pattern B per-câu per-criterion delta map.

    Input shape: ``{cau_str: {criterion_label: points}}`` for both sides.
    Output keeps the same nesting but only retains criterion entries whose
    absolute delta crosses ``threshold``. Empty câus (no significant
    criterion deltas) are dropped so the lesson formatter doesn't emit
    blank bullets.

    Threshold typically tuned lower than per-câu (e.g. 0.15 vs 0.25)
    because criterion-level corrections are finer-grained than full câu
    overrides — the smallest meaningful step at the sub-câu level is
    half of a smallest meaningful step at the câu level.
    """
    if not ai or not teacher:
        return {}
    out: dict[str, dict[str, float]] = {}
    for cau, ai_criteria in ai.items():
        if not isinstance(ai_criteria, Mapping):
            continue
        teacher_criteria = teacher.get(cau)
        if not isinstance(teacher_criteria, Mapping):
            continue
        cau_deltas: dict[str, float] = {}
        for label, ai_val in ai_criteria.items():
            d = safe_delta(ai_val, teacher_criteria.get(label))
            if d is not None and abs(d) >= threshold:
                cau_deltas[label] = d
        if cau_deltas:
            out[cau] = cau_deltas
    return out


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
    ai_per_question: Mapping[str, float] | None = None,
    teacher_per_question: Mapping[str, float] | None = None,
    per_question_deltas: Mapping[str, float] | None = None,
    ai_per_step: Mapping[str, Mapping[str, float]] | None = None,
    teacher_per_step: Mapping[str, Mapping[str, float]] | None = None,
    per_step_deltas: Mapping[str, Mapping[str, float]] | None = None,
) -> str:
    """Render a Vietnamese lesson describing the teacher's corrections.

    Combines TWO axes (per-câu + per-step Pattern B) into a single lesson
    so the HITL retrieval corpus sees one lesson per finalize event. Per-
    step entries nest as ``Câu N → tiêu chí`` bullets so the lesson reads
    top-down: overall → câu → step.
    """
    parts = ["Hiệu chỉnh điểm của giáo viên cho bài tương tự:"]
    if overall_delta is not None and abs(overall_delta) >= 0.1:
        direction = "giảm" if overall_delta < 0 else "tăng"
        parts.append(
            f"- Tổng điểm: AI chấm {ai_overall} → giáo viên {direction} "
            f"còn {teacher_overall} (chênh {overall_delta:+})."
        )
    if per_question_deltas and ai_per_question and teacher_per_question:
        for cau in sorted(per_question_deltas, key=_cau_sort_key):
            d = per_question_deltas[cau]
            direction = "hạ" if d < 0 else "nâng"
            parts.append(
                f"- Câu {cau}: AI {ai_per_question.get(cau)} → giáo viên "
                f"{direction} {teacher_per_question.get(cau)} (chênh {d:+})."
            )
    if per_step_deltas and ai_per_step and teacher_per_step:
        for cau in sorted(per_step_deltas, key=_cau_sort_key):
            cau_steps = per_step_deltas.get(cau) or {}
            ai_cau = ai_per_step.get(cau) or {}
            te_cau = teacher_per_step.get(cau) or {}
            for label, d in cau_steps.items():
                direction = "hạ" if d < 0 else "nâng"
                parts.append(
                    f"  · Câu {cau} → {label}: AI {ai_cau.get(label)} → "
                    f"giáo viên {direction} {te_cau.get(label)} "
                    f"(chênh {d:+})."
                )
    parts.append(
        "Khi gặp bài tương tự, cần điều chỉnh theo hướng này để khớp "
        "với chuẩn chấm của giáo viên."
    )
    return "\n".join(parts)


__all__ = [
    "safe_delta",
    "compute_per_question_deltas",
    "compute_per_step_deltas",
    "format_delta_lesson",
]
