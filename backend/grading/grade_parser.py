"""
grade_parser.py — JSON parsing + comment-analysis fallback.

Gemini occasionally emits markdown-wrapped JSON, truncates mid-value, or
returns empty ``analysis`` / ``lesson`` fields. This module is the
defensive layer that turns a messy response into a stable dict the UI
can consume without ever seeing raw JSON fragments.

Public entry points:
  • ``parse_grade_json(text)``         — Grader envelope
  • ``parse_comment_analysis(text)``   — analyze-comment envelope
  • ``fallback_comment_analysis(...)`` — synthesize a useful response when
                                         the model returns empty fields
  • ``is_meaningful_text(text)``       — check whether a string has enough
                                         substance to surface to the UI
  • ``ANALYZE_COMMENT_FALLBACK``       — last-resort chat bubble text
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


ANALYZE_COMMENT_FALLBACK = (
    "AI chưa phân tích được nhận xét này. Vui lòng thử lại."
)

# ---------------------------------------------------------------------------
# Low-level string / JSON helpers
# ---------------------------------------------------------------------------


def _strip_fences(text: str) -> str:
    """Remove markdown code fences around model JSON output."""
    cleaned = re.sub(r"```(?:json)?\s*\n?", "", text).strip()
    return cleaned.rstrip("`").strip()


def _repair_truncated_json(text: str) -> str | None:
    """Close unterminated strings/arrays/objects in a truncated JSON blob.

    Handles Gemini's common failure mode where ``max_output_tokens`` is
    hit mid-value: unfinished string, incomplete key, trailing comma,
    missing ``}``/``]``. Returns ``None`` when there is no JSON-like
    content to repair.
    """
    s = text.strip()
    start = s.find("{")
    if start < 0:
        return None
    s = s[start:]

    in_string = False
    escape = False
    stack: list[str] = []

    for c in s:
        if escape:
            escape = False
            continue
        if c == "\\":
            escape = True
            continue
        if c == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if c == "{":
            stack.append("}")
        elif c == "[":
            stack.append("]")
        elif c in "}]":
            if stack:
                stack.pop()

    result = s
    if in_string:
        result += '"'
    result = result.rstrip()
    while result.endswith((",", ":")):
        result = result[:-1].rstrip()
    result += "".join(reversed(stack))
    return result


def _extract_field(text: str, field_name: str) -> str:
    """Regex-extract a top-level JSON string field — best-effort salvage."""
    pattern = rf'"{field_name}"\s*:\s*"((?:[^"\\]|\\.)*)"?'
    match = re.search(pattern, text, re.DOTALL)
    if not match:
        return ""
    raw = match.group(1)
    try:
        return json.loads(f'"{raw}"')
    except json.JSONDecodeError:
        return raw


def _parse_json_best_effort(text: str) -> dict[str, Any] | None:
    """Parse JSON from messy model output.

    Strategy: strip fences → direct parse → extract first ``{…}`` slice →
    repair truncation. Returns ``None`` when no valid JSON object is
    recoverable; callers handle field-level salvage for their schema.
    """
    cleaned = _strip_fences(text)
    candidates: list[str] = [cleaned]
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match and match.group(0) != cleaned:
        candidates.append(match.group(0))
    repaired = _repair_truncated_json(cleaned)
    if repaired and repaired not in candidates:
        candidates.append(repaired)

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except (json.JSONDecodeError, TypeError, ValueError):
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


# ---------------------------------------------------------------------------
# Public parsers — one per schema
# ---------------------------------------------------------------------------


_REQUIRED_GRADE_FIELDS = ("transcript", "comment", "scores", "overall",
                          "per_question_feedback")


def _is_complete_grade(parsed: dict[str, Any]) -> bool:
    """True iff all required Grader-envelope fields are present and populated.

    A "soft truncation" (Gemini stops mid-envelope but emits valid JSON via
    _repair_truncated_json closing braces) leaves us with a parseable dict
    that's silently missing scores/overall/comment. Without this check the
    UI rendered Tab 5 with empty score boxes and no per-question commentary.
    """
    for field in _REQUIRED_GRADE_FIELDS:
        if field not in parsed:
            return False
    scores = parsed.get("scores")
    if not isinstance(scores, dict) or not scores:
        return False
    if parsed.get("overall") is None:
        return False
    return True


def parse_grade_json(text: str) -> dict[str, Any]:
    """Parse the Grader JSON envelope from VLM output.

    Three-tier fallback:
      1. Best-effort JSON parse → check completeness; pass-through if all
         required fields are present.
      2. Best-effort parse but missing fields → fill defaults, flag
         ``salvaged=True`` so the UI surfaces a warning and the teacher
         knows scores/comment are AI-shortfall, not legitimately blank.
      3. Total parse failure → regex-extract transcript/comment and
         synthesize a flagged envelope so the UI doesn't crash.
    """
    parsed = _parse_json_best_effort(text)
    if parsed is not None:
        if _is_complete_grade(parsed):
            return parsed
        # Soft-truncation: parse OK but envelope incomplete. Fill defaults
        # and flag so the salvage banner appears in Tab 3.
        missing = [f for f in _REQUIRED_GRADE_FIELDS if f not in parsed]
        scores = parsed.get("scores")
        if not isinstance(scores, dict) or not scores:
            parsed["scores"] = {
                "content": 0, "argument": 0, "expression": 0, "creativity": 0,
            }
        parsed.setdefault("transcript", "")
        parsed.setdefault("comment", "")
        if parsed.get("overall") is None:
            parsed["overall"] = 0
        parsed.setdefault("per_question_feedback", [])
        parsed.setdefault("strengths", [])
        weak = parsed.get("weaknesses")
        note = ("Phản hồi của AI bị cắt giữa chừng — thiếu "
                + ", ".join(missing or ["scores"]) + ". Hãy chấm lại.")
        if isinstance(weak, list):
            weak.append(note)
        else:
            parsed["weaknesses"] = [note]
        parsed["salvaged"] = True
        logger.warning(
            "[HITL] Grader output incomplete — flagged salvaged. Missing: %s",
            ", ".join(missing) if missing else "none (empty scores/overall)",
        )
        return parsed

    cleaned = _strip_fences(text)
    transcript = _extract_field(cleaned, "transcript")
    comment = _extract_field(cleaned, "comment")
    logger.warning(
        "[HITL] Grader output unparseable — salvaged transcript=%d chars, comment=%d chars",
        len(transcript), len(comment),
    )
    return {
        "transcript": transcript,
        "scores": {"content": 0, "argument": 0, "expression": 0, "creativity": 0},
        "overall": 0,
        "comment": comment or cleaned[:400],
        "per_question_feedback": [],
        "strengths": [],
        "weaknesses": ["unparseable JSON salvaged from partial response"],
        "salvaged": True,
    }


_VALID_VERDICTS = ("agree", "partial", "dispute")


def _normalize_verdict(raw: str) -> str:
    """Coerce a verdict string to one of the allowed enum values.

    Defaults to ``"agree"`` (safe — preserves existing behavior of trusting
    the teacher) when the model emits something we don't recognise.
    """
    folded = raw.strip().lower()
    return folded if folded in _VALID_VERDICTS else "agree"


def parse_comment_analysis(text: str) -> dict[str, str]:
    """Parse the analyze-comment JSON (``{verdict, analysis, lesson}``).

    Field-level salvage on total failure so the UI never sees ``{`` or
    ``"`` fragments in the chat bubble. ``verdict`` defaults to ``"agree"``
    when missing/invalid — the safe fallback that keeps the legacy
    "always trust the teacher" behavior.
    """
    parsed = _parse_json_best_effort(text)
    if parsed is not None:
        return {
            "verdict": _normalize_verdict(str(parsed.get("verdict", ""))),
            "analysis": str(parsed.get("analysis", "")).strip(),
            "lesson": str(parsed.get("lesson", "")).strip(),
        }
    cleaned = _strip_fences(text)
    return {
        "verdict": _normalize_verdict(_extract_field(cleaned, "verdict")),
        "analysis": _extract_field(cleaned, "analysis").strip(),
        "lesson": _extract_field(cleaned, "lesson").strip(),
    }


# ---------------------------------------------------------------------------
# Comment-analysis fallback — defensive against empty model responses
# ---------------------------------------------------------------------------


_POSITIVE_COMMENT_CUES = (
    "tốt", "rất tốt", "ổn", "đúng", "chính xác", "đầy đủ", "rõ", "mạch lạc",
    "hợp lý", "hay", "ổn áp", "được", "ghi nhận", "khen", "mở rộng thêm",
)
_NEGATIVE_COMMENT_CUES = (
    "sai", "thiếu", "lỗi", "nhầm", "chưa", "chưa đúng", "cần sửa", "quên",
    "mất", "bỏ sót", "trừ điểm", "không đúng",
)


def _normalize_ws(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def is_meaningful_text(text: str | None, *, min_words: int = 1) -> bool:
    """True when ``text`` has enough substance to surface to the UI.

    Default ``min_words=1`` only filters out empty / punctuation-only strings.
    Pass a higher ``min_words`` (e.g. 8 for analysis, 6 for lesson) to also
    reject lazy 1-2 word answers like ``"Đúng,"`` that pass JSON validation
    but are useless to the teacher. The fallback synthesizer kicks in when
    this returns False.
    """
    cleaned = _normalize_ws(str(text or ""))
    if not cleaned:
        return False
    if re.fullmatch(r'[\s{}[\]",:.-]+', cleaned):
        return False
    if len(re.sub(r"[\W_]+", "", cleaned, flags=re.UNICODE)) < 3:
        return False
    return len(cleaned.split()) >= min_words


def _truncate_words(text: str, max_words: int) -> str:
    words = _normalize_ws(text).split()
    if len(words) <= max_words:
        return " ".join(words)
    return " ".join(words[:max_words]).rstrip(",;:.") + "."


def _is_likely_positive_comment(teacher_comment: str) -> bool:
    folded = _normalize_ws(teacher_comment).lower()
    if not folded:
        return False
    positive_hits = sum(1 for cue in _POSITIVE_COMMENT_CUES if cue in folded)
    negative_hits = sum(1 for cue in _NEGATIVE_COMMENT_CUES if cue in folded)
    return positive_hits > 0 and negative_hits == 0


def _generalize_teacher_comment(text: str) -> str:
    generalized = _normalize_ws(text)
    replacements = (
        (r"\bbài em\b", "bài làm"),
        (r"\bem\b", "học sinh"),
        (r"\bcó thể\b", "nên"),
        (r"\bhãy\b", "cần"),
    )
    for pattern, replacement in replacements:
        generalized = re.sub(pattern, replacement, generalized, flags=re.IGNORECASE)
    return generalized.rstrip(". ")


def fallback_comment_analysis(
    teacher_comment: str,
    *,
    student_answer: str = "",
) -> dict[str, str]:
    """Synthesize a useful response when the model omits analysis/lesson.

    Keeps the per-question chat usable for praise-only comments such as
    "bài em làm tốt, có thể mở rộng thêm", where the original prompt
    previously overfit to error analysis and often returned empty fields.
    Verdict defaults to ``"agree"`` since the fallback can't independently
    verify the student's answer — the safe choice is to trust the teacher.
    """
    comment = _normalize_ws(teacher_comment)
    if not comment:
        return {
            "verdict": "agree",
            "analysis": ANALYZE_COMMENT_FALLBACK,
            "lesson": "",
        }

    if _is_likely_positive_comment(comment):
        analysis = (
            "Giáo viên đang ghi nhận bài làm tốt và gợi ý mở rộng thêm ý hoặc chi tiết."
        )
        lesson = (
            "Khi bài làm đúng và rõ ý, cần ghi nhận điểm mạnh trước rồi mới gợi ý "
            "mở rộng hoặc đào sâu thêm."
        )
        return {
            "verdict": "agree",
            "analysis": _truncate_words(analysis, 30),
            "lesson": _truncate_words(lesson, 50),
        }

    generalized = _generalize_teacher_comment(comment)
    analysis = _truncate_words(comment, 30)
    # Prefer a reusable imperative lesson over echoing the raw teacher note.
    if student_answer.strip():
        lesson = f"Khi gặp bài tương tự, cần lưu ý: {generalized}."
    else:
        lesson = f"Khi chấm câu này, cần lưu ý: {generalized}."
    return {
        "verdict": "agree",
        "analysis": analysis,
        "lesson": _truncate_words(lesson, 50),
    }
