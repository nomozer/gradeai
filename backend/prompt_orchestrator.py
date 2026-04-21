"""
prompt_orchestrator.py — Prompt Orchestration Layer
Purpose: Modular prompt builder for the HITL VLM Grading Agent. Decomposes
         prompts into System / Memory / Dynamic components, retrieves teacher
         lessons from MemoryManager (SQLite + ChromaDB), and produces a
         PromptBundle suitable for transparency, UI debugging, and research
         logging.
Author: [Your Name]
Research Project: Tác tử AI hỗ trợ chấm điểm tự luận đa phương thức kết hợp
                  phản hồi từ giáo viên (Human-in-the-loop VLM Grading Agent)
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
import unicodedata
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Optional

from memory import MemoryManager

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


from system_prompts import (
    Subject,
    RUBRIC_LABELS,
    _RULES_FORBIDDEN,
    _RULES_SCOPE,
    _RULES_PROCEDURE,
    _RULES_UNCERTAINTY,
    _RULES_FORMATTING,
    _RULES_STRUCTURE,
    _RULES_OUTPUT,
    _RULES_EXAMPLES,
    _SUBJECT_EXTRA_RULES,
    _INTRO_COMMON,
    _SUBJECT_PERSONA,
    _SUBJECT_FOCUS,
)

class Role(str, Enum):
    GRADER = "grader"      # Giám khảo (VLM): đọc ảnh bài làm, chấm điểm


# ---------------------------------------------------------------------------
# Shared transcription + formatting + JSON-schema rules (subject-independent).
#
# The rules are split into 8 labelled parts so each can be edited / A-B tested
# independently. They are composed in order by ``_compose_shared_rules``.
#
#   1. FORBIDDEN        — hard "do not" constraints
#   2. SCOPE            — transcript is a cross-check layer: questions ONLY
#   3. PROCEDURE        — top-down scanning order + post-copy verification
#   4. UNCERTAINTY      — markers for unreadable tokens
#   5. FORMATTING       — indentation + Unicode symbol rules
#   6. STRUCTURE        — per-question output layout + tone guidance
#   7. OUTPUT           — strict JSON schema
#   8. EXAMPLES         — calibration examples (binary, |x|, sub-labels, long answers)
# ---------------------------------------------------------------------------

# --- Part 1 — FORBIDDEN ----------------------------------------------------
# Shared prompting rules imported from system_prompts


_SHARED_RULES: str = "\n\n".join((
    _RULES_FORBIDDEN,
    _RULES_SCOPE,
    _RULES_PROCEDURE,
    _RULES_UNCERTAINTY,
    _RULES_FORMATTING,
    _RULES_STRUCTURE,
    _RULES_OUTPUT,
    _RULES_EXAMPLES,
))


# --- Subject-specific EXTRA rules (appended AFTER _SHARED_RULES) -----------
#
# STEM needs a cross-check layer the shared rules don't provide. Rule 3e only
# verifies transcript ↔ image (did we copy correctly?). It says nothing about
# whether the STUDENT'S OWN DERIVATION is internally consistent with the
# original task. Without Rule 9 the grader happily accepts a sign-flipped
# step like "(3x - 15) = 0 ⇒ 3x + 15 = 0" because the copy is faithful; the
# logic error is never surfaced in per_question_feedback.errors.
#
# Kept subject-scoped (not added to _SHARED_RULES) because literature/history/
# language essays don't have an "is this step mathematically valid?" question
# — pushing this rule there would just add noise and token cost.
# Subject-specific EXTRA rules imported from system_prompts


# ---------------------------------------------------------------------------
# Per-subject persona/focus paragraph (first few sentences of the system prompt).
#
# Composed from three reusable pieces to eliminate copy-paste drift:
#   • _SUBJECT_PERSONA — "Bạn là Giáo viên chấm bài … giàu kinh nghiệm …"
#   • _INTRO_COMMON    — shared "đọc bài / thang 0–10 / BỐN TIÊU CHÍ" line
#   • _SUBJECT_FOCUS   — (rubric_label, focus_sentence) per subject
#
# Warm/encouraging tone guidance is NOT repeated here — Rule 6 (STRUCTURE)
# carries the authoritative tone rules with concrete phrase examples.
# ---------------------------------------------------------------------------

# Personas and subject focus imported from system_prompts


def _compose_subject_intro(subject: Subject) -> str:
    persona = _SUBJECT_PERSONA[subject]
    label, focus = _SUBJECT_FOCUS[subject]
    body = _INTRO_COMMON.format(label=label, focus=focus)
    return f"{persona} {body}"


_SUBJECT_INTRO: dict[Subject, str] = {
    subj: _compose_subject_intro(subj) for subj in Subject
}


def _compose_grader_system(subject: Subject) -> str:
    """Build the full Grader system prompt: intro + rubric glossary + shared rules
    + subject-specific extra rules (e.g. STEM cross-check)."""
    intro = _SUBJECT_INTRO[subject]
    labels = RUBRIC_LABELS[subject]
    header = "BỐN TIÊU CHÍ CHẤM (dùng đúng các JSON key này):"
    hitl = "Ràng buộc ưu tiên từ giáo viên (HITL) cao hơn quy tắc chung."

    rubric_lines = [
        f'  - "{k}" → {labels[k][0]}: {labels[k][1]}'
        for k in ("content", "argument", "expression", "creativity")
    ]
    rubric_block = header + "\n" + "\n".join(rubric_lines)

    rules = _SHARED_RULES
    extra = _SUBJECT_EXTRA_RULES.get(subject)
    if extra:
        rules = f"{rules}\n\n{extra}"

    return f"{intro}\n\n{rubric_block}\n\n{hitl}\n\n{rules}"


GRADER_SYSTEM: dict[Subject, str] = {
    subj: _compose_grader_system(subj) for subj in Subject
}

# ---------------------------------------------------------------------------
# Subject detection — picks the right 4-rubric profile from the task text
# ---------------------------------------------------------------------------

_SUBJECT_PATTERNS: list[tuple[Subject, re.Pattern]] = [
    (
        Subject.STEM,
        re.compile(
            r"("
            r"\bsolve\b|\bcompute\b|\bcalculate\b|\bprove\b|\bderive\b|\bmath\w*|"
            r"\balgorithm\b|\bpseudocode\b|\bfunction\b|\bformula\b|\bequation\b|"
            r"\bmatrix\b|\bbinary\b|\bhex\b|\blogic\b|\bboolean\b|\btruth table\b|"
            # Standalone subject names first (tightened to avoid 'thông tin', 'tự tin')
            r"\btoán học\b|\btoán\b|\btin học\b|\bmôn tin\b|\bvật lí\b|\bvật lý\b|\bmôn lí\b|\bmôn lý\b|"
            r"bài toán|phương trình|bất phương trình|chứng minh|tính(?: toán)?(?:\s|$)|"
            r"hệ cơ số|nhị phân|thập phân|ma trận|đạo hàm|tích phân|"
            r"biểu thức|công thức|thuật toán|thuật giải|lưu đồ|lập trình|mã giả|code|chương trình|mã nguồn|"
            r"cơ sở dữ liệu|sql|python|c\+\+|pascal|java|câu lệnh|vòng lặp|kiểu dữ liệu|toán tử|mảng|"
            r"mệnh đề|hàm số|đồ thị|hình học|đại số|giải tích|vectơ|xác suất|thống kê"
            r")",
            re.IGNORECASE,
        ),
    ),
    (
        Subject.HISTORY,
        re.compile(
            r"("
            r"\bhistor\w+|\bcentury\b|\bdynasty\b|\bwar\b|\brevolution\b|"
            r"\bcivic\w*|\bgovernment\b|"
            r"lịch sử|triều đại|vua\s|chiến tranh|kháng chiến|cách mạng|"
            r"hiệp định|phong trào|sự kiện|nhân vật lịch sử|gdcd|công dân|"
            r"hiến pháp|pháp luật"
            r")",
            re.IGNORECASE,
        ),
    ),
    (
        Subject.LANGUAGE,
        re.compile(
            r"("
            r"\bwrite (?:an? )?(?:essay|paragraph|letter) in (?:english|french|german|japanese|chinese)\b|"
            r"\bin at least \d+ words\b|\busing appropriate vocabulary\b|"
            r"tiếng anh|tiếng pháp|tiếng trung|tiếng nhật|tiếng hàn|"
            r"viết (?:một )?(?:đoạn văn|bức thư|bài luận) bằng tiếng"
            r")",
            re.IGNORECASE,
        ),
    ),
]


def detect_subject(task: str) -> Subject:
    """Keyword-based subject detection. Defaults to LITERATURE (the historical
    profile of this app and the safest fallback for Vietnamese essays)."""
    for subject, pattern in _SUBJECT_PATTERNS:
        if pattern.search(task or ""):
            return subject
    return Subject.LITERATURE


def _ascii_fold(text: str | None) -> str:
    """Lowercase + strip accents so UI labels map cleanly to Subject values."""
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", str(text))
    return "".join(c for c in normalized if not unicodedata.combining(c)).casefold()


_SUBJECT_HINT_ALIASES: dict[str, Subject] = {
    "literature": Subject.LITERATURE,
    "language arts": Subject.LITERATURE,
    "ngu van": Subject.LITERATURE,
    "van hoc": Subject.LITERATURE,
    "mon van": Subject.LITERATURE,
    "stem": Subject.STEM,
    "math": Subject.STEM,
    "mathematics": Subject.STEM,
    "computer science": Subject.STEM,
    "informatics": Subject.STEM,
    "physics": Subject.STEM,
    "toan": Subject.STEM,
    "tin hoc": Subject.STEM,
    "mon tin": Subject.STEM,
    "vat ly": Subject.STEM,
    "mon ly": Subject.STEM,
    "language": Subject.LANGUAGE,
    "foreign language": Subject.LANGUAGE,
    "english": Subject.LANGUAGE,
    "ngoai ngu": Subject.LANGUAGE,
    "tieng anh": Subject.LANGUAGE,
    "history": Subject.HISTORY,
    "civics": Subject.HISTORY,
    "lich su": Subject.HISTORY,
    "gdcd": Subject.HISTORY,
}


def resolve_subject(
    task: str = "",
    subject_hint: Subject | str | None = None,
) -> Subject:
    """Prefer an explicit UI/backend subject hint; fall back to keyword detection."""
    if isinstance(subject_hint, Subject):
        return subject_hint

    folded_hint = _ascii_fold(subject_hint)
    if folded_hint:
        for alias, subject in _SUBJECT_HINT_ALIASES.items():
            if alias in folded_hint:
                return subject

    return detect_subject(task)


def _sanitize(s: Optional[str], max_len: int = 8000) -> str:
    """Neutralize role-impersonation prefixes and cap length."""
    if s is None:
        return ""
    s = str(s)
    s = re.sub(r"(?im)^\s*(system|assistant|user)\s*:", "", s)
    s = s.replace("```system", "```")
    return s[:max_len]


# ---------------------------------------------------------------------------
# Prompt Bundle — the transparent artifact of one build_prompt() call
# ---------------------------------------------------------------------------


@dataclass
class PromptBundle:
    """Fully assembled prompt, split by component for transparency & replay."""

    role: Role
    system: str
    memory: str
    dynamic: str
    user_content: str
    full: str
    subject: Subject = Subject.LITERATURE
    lessons_used: list[dict[str, Any]] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "role": self.role.value,
            "subject": self.subject.value,
            "system": self.system,
            "memory": self.memory,
            "dynamic": self.dynamic,
            "user_content": self.user_content,
            "full": self.full,
            "lessons_used": self.lessons_used,
            "meta": self.meta,
        }


# ---------------------------------------------------------------------------
# Prompt Orchestrator
# ---------------------------------------------------------------------------


class PromptOrchestrator:
    """Builds structured prompts for the VLM grading pipeline.

    Inputs combined: essay topic + (AI grade JSON | rubric) + teacher feedback +
    retrieved teacher lessons. The actual essay image is supplied separately to
    the Gemini Vision call by the AgentOrchestrator.
    """

    def __init__(
        self,
        memory: MemoryManager,
        *,
        k_lessons: int = 3,
        log_dir: Path | str | None = None,
    ) -> None:
        self.memory = memory
        self.k = k_lessons
        self.log_dir: Path | None = Path(log_dir) if log_dir else None
        if self.log_dir:
            self.log_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ API

    def build_prompt(
        self,
        task: str,
        feedback: Optional[str] = None,
        *,
        subject: Subject | str | None = None,
    ) -> PromptBundle:
        """Assemble the Grader PromptBundle for this essay.

        Args:
            task:     The essay topic / question / rubric prompt.
            feedback: Optional human teacher feedback to inject on a re-grade.
            subject:  Optional explicit subject family — auto-detected otherwise.
                      Controls which 4-rubric profile the Grader uses.
        """
        task = _sanitize(task, 4000)
        feedback = _sanitize(feedback or "", 2000)

        subject = resolve_subject(task, subject)

        # 1. System component -------------------------------------------------
        system = GRADER_SYSTEM[subject]

        # 2. Memory component -------------------------------------------------
        lessons = (
            self.memory.search_relevant_lessons(
                task, top_k=self.k, subject=subject.value
            )
            if task
            else []
        )
        lessons = sorted(
            lessons, key=lambda l: -float(l.get("feedback_score", 0.0))
        )
        memory_block = self._format_lessons(lessons)

        # 3. Dynamic component (Topic / Teacher feedback) ---------------------
        dynamic_parts: list[str] = [f"### ĐỀ BÀI TỰ LUẬN\n{task}"]
        if feedback:
            dynamic_parts.append(f"### PHẢN HỒI CỦA GIÁO VIÊN\n{feedback}")
        dynamic = "\n\n".join(dynamic_parts)

        # 4. Assemble ---------------------------------------------------------
        user_content = f"{memory_block}\n\n{dynamic}".strip()
        full = "### SYSTEM\n" + system + "\n\n### USER\n" + user_content + "\n"

        bundle = PromptBundle(
            role=Role.GRADER,
            subject=subject,
            system=system,
            memory=memory_block,
            dynamic=dynamic,
            user_content=user_content,
            full=full,
            lessons_used=lessons,
            meta={
                "k": self.k,
                "ts": time.time(),
                "prompt_hash": hashlib.sha1(full.encode("utf-8")).hexdigest()[:16],
                "subject": subject.value,
            },
        )
        self._log(bundle)
        return bundle

    def ingest_feedback(
        self,
        *,
        task: str,
        wrong_code: str,
        correct_code: str,
        lesson_text: str,
        score: float = 3.0,
        subject: str = "",
    ) -> int:
        """Persist a teacher correction as a reusable grading lesson.

        Field semantics in this project:
            task          → essay topic
            wrong_code    → AI's incorrect grade JSON
            correct_code  → teacher's corrected grade JSON (may be empty)
            lesson_text   → teacher's instructional note
            subject       → subject label for ChromaDB pre-filtering
        """
        return self.memory.save_lesson(
            task=task,
            wrong_code=wrong_code,
            correct_code=correct_code,
            lesson_text=lesson_text,
            feedback_score=score,
            subject=subject,
        )

    # -------------------------------------------------------------- helpers

    @staticmethod
    def _format_lessons(lessons: list[dict[str, Any]]) -> str:
        if not lessons:
            return ""

        header = "CÁC LỖI ĐÃ TỪNG SỬA (Ràng buộc ưu tiên):"
        instruction = (
            "Dưới đây là các đúc kết từ những lần giáo viên sửa điểm cho đề bài này "
            "trong quá khứ. LUẬT QUAN TRỌNG: CHỈ áp dụng các ràng buộc này nếu bài "
            "làm hiện tại mắc chính xác lỗi hoặc có đặc điểm tương tự. TUYỆT ĐỐI "
            "KHÔNG tự ý trừ/cộng điểm nếu bạn không thực sự nhìn thấy nội dung đó "
            "trong ảnh bài làm."
        )

        bullets = [
            f"- ĐIỀU KIỆN KIỂM TRA: {str(les.get('lesson_text', '')).strip()}"
            for les in lessons
        ]
        body = "\n".join(bullets)
        return f"### {header}\n{instruction}\n\n{body}"

    def _log(self, bundle: PromptBundle) -> None:
        logger.info(
            "prompt_built role=%s subject=%s hash=%s lessons=%d",
            bundle.role.value,
            bundle.subject.value,
            bundle.meta["prompt_hash"],
            len(bundle.lessons_used),
        )
        if not self.log_dir:
            return
        filename = (
            f"{int(bundle.meta['ts'])}_{bundle.role.value}_{bundle.meta['prompt_hash']}.json"
        )
        path = self.log_dir / filename
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(bundle.to_dict(), f, ensure_ascii=False, indent=2)
        except OSError as exc:  # non-fatal — logging must not break pipeline
            logger.warning("Failed to write prompt log %s: %s", path, exc)
