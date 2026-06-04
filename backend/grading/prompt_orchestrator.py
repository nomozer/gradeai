"""
prompt_orchestrator.py — Prompt Orchestration Layer (STEM-only)

Builds the full grader prompt from three pieces:
    system  — GRADER_SYSTEM (static, imported from system_prompts)
    memory  — retrieved teacher lessons relevant to the current task
    dynamic — the essay topic + optional teacher feedback on a re-grade

Emits a PromptBundle carrying each component separately so the UI,
prompt-log files, and research metrics can inspect what was sent.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Optional

from memory import MemoryManager
from prompts import GRADER_SYSTEM, detect_subject, format_criteria_block

logger = logging.getLogger(__name__)


class Role(str, Enum):
    GRADER = "grader"      # Giám khảo (VLM): đọc ảnh bài làm, chấm điểm


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
    lessons_used: list[dict[str, Any]] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "role": self.role.value,
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
    """Builds structured prompts for the VLM grading pipeline (STEM).

    Inputs combined: essay topic + teacher feedback + retrieved teacher
    lessons. The actual essay image is supplied separately to the Gemini
    Vision call by AgentOrchestrator.
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
        wrong_code: Optional[str] = None,
        subject: Optional[str] = None,
        answer_key: Optional[str] = None,
        max_points_template: Optional[dict[str, float]] = None,
        use_lessons: bool = True,
    ) -> PromptBundle:
        """Assemble the Grader PromptBundle for this essay.

        Args:
            task:       Essay topic / question / rubric prompt.
            feedback:   Optional teacher feedback to inject on a re-grade.
            wrong_code: Optional previous AI grade JSON that the teacher
                        rejected. Lives in its own channel (not folded into
                        feedback) because a full grade JSON can be 3–6 KB —
                        jamming it through the short `feedback` channel used
                        to truncate it mid-content under _sanitize's cap.
            subject:    Optional explicit subject hint ("math" / "cs").
                        When absent, ``detect_subject`` keyword-matches the
                        task text; falls back to DEFAULT_SUBJECT.
            answer_key: Optional plain-text answer key / bareme extracted
                        from a teacher-uploaded PDF. Injected verbatim into
                        the dynamic prompt so the Grader can score against
                        the official rubric.
            max_points_template: Optional per-câu max-points scheme decided
                        by the teacher on a prior paper in the same batch.
                        When present, injected as the authoritative scoring
                        scheme (overrides anything the AI might infer from
                        the exam / answer key). Used so an exam without
                        explicit per-câu point values doesn't let the AI
                        guess inconsistently across the batch.
            use_lessons: When False, skip lesson retrieval entirely (the
                        "cold" condition for the HITL ablation experiment).
                        Defaults True so normal grading is unaffected.
        """
        task = _sanitize(task, 4000)
        feedback = _sanitize(feedback or "", 2000)
        # wrong_code = prior Grader JSON envelope → may legitimately be long.
        # Cap at 8000 so a pathologically huge payload still can't run away,
        # but don't truncate realistic essays mid-field.
        wrong_code = _sanitize(wrong_code or "", 8000)

        # Pick subject-specific system prompt — keyword fallback kicks in
        # if the caller didn't supply a hint.
        resolved_subject = detect_subject(task, subject)
        system_prompt = GRADER_SYSTEM[resolved_subject]

        # 1. Memory component — retrieved lessons, sorted by HITL priority.
        # ``use_lessons=False`` forces the no-retrieval ("cold") condition for
        # the HITL ablation experiment — grade as if the lesson corpus were
        # empty, so cold-vs-warm isolates the effect of teacher feedback.
        lessons = (
            self.memory.search_relevant_lessons(
                task,
                top_k=self.k,
                subject=resolved_subject,
            )
            if task and use_lessons
            else []
        )
        lessons = sorted(
            lessons, key=lambda l: -float(l.get("feedback_score", 0.0))
        )
        memory_block = self._format_lessons(lessons)

        # 2. Dynamic component (Answer key / Topic / Previous grade / Feedback)
        dynamic_parts: list[str] = []

        # Answer key goes FIRST so the Grader reads the official rubric
        # before seeing the essay topic — mirrors how a teacher approaches
        # grading: read the answer key, then read the student's work.
        answer_key_text = _sanitize(answer_key or "", 8000)
        if answer_key_text:
            dynamic_parts.append(
                "### ĐÁP ÁN & BAREME CHẤM ĐIỂM CHÍNH THỨC "
                "(Tuân thủ tuyệt đối)\n"
                "Dưới đây là đáp án và hướng dẫn chấm do giáo viên cung cấp. "
                "BẮT BUỘC chấm theo đúng đáp án này. Nếu bài làm học sinh "
                "khác với đáp án, trừ điểm theo biểu điểm.\n\n"
                f"{answer_key_text}"
            )

        # Per-câu sub-criteria template (Pattern B rubric). Authoritative
        # — placed alongside answer key + max-points-template at the top
        # of the dynamic block so the Grader treats the per-câu rubric as
        # binding, not advisory. Sourced from ``prompts/rubric_templates``
        # keyed by ``resolved_subject``; AI must echo each label verbatim
        # in its ``criteria`` array per câu (see Rule 7).
        dynamic_parts.append(format_criteria_block(resolved_subject))

        # Per-câu max-points template (teacher-decided, batch-scoped).
        # Placed AFTER answer key but BEFORE the topic so the Grader reads
        # the official rubric, then the locked point allocation, then the
        # essay topic — same reading order a teacher would follow when
        # standardising grades across a stack of papers.
        if max_points_template:
            try:
                rows = sorted(
                    max_points_template.items(),
                    key=lambda kv: int(kv[0]) if str(kv[0]).isdigit() else 10_000,
                )
            except (TypeError, ValueError):
                rows = list(max_points_template.items())
            lines = "\n".join(
                f"- Câu {k}: {float(v):g} điểm" for k, v in rows
            )
            dynamic_parts.append(
                "### PHÂN BỔ ĐIỂM TỐI ĐA TỪNG CÂU "
                "(Giáo viên quy định — BẮT BUỘC tuân thủ)\n"
                "Đây là biểu điểm chính thức cho đề này, đã được giáo viên "
                "chốt ở bài chấm trước. Mỗi trường ``max_points`` trong "
                "``per_question_feedback`` của output PHẢI khớp đúng giá trị "
                "dưới đây. Điểm chấm cho từng câu (``score``) không được "
                "vượt quá ``max_points`` tương ứng.\n\n"
                f"{lines}"
            )

        dynamic_parts.append(f"### ĐỀ BÀI TỰ LUẬN\n{task}")
        if wrong_code:
            dynamic_parts.append(
                f"### BẢN CHẤM TRƯỚC (giáo viên đã TỪ CHỐI — tham khảo để sửa)\n"
                f"```json\n{wrong_code}\n```"
            )
        if feedback:
            dynamic_parts.append(f"### PHẢN HỒI CỦA GIÁO VIÊN\n{feedback}")
        dynamic = "\n\n".join(dynamic_parts)

        # 3. Assemble final user + full transcript
        user_content = f"{memory_block}\n\n{dynamic}".strip()
        full = "### SYSTEM\n" + system_prompt + "\n\n### USER\n" + user_content + "\n"

        bundle = PromptBundle(
            role=Role.GRADER,
            system=system_prompt,
            memory=memory_block,
            dynamic=dynamic,
            user_content=user_content,
            full=full,
            lessons_used=lessons,
            meta={
                "k": self.k,
                "ts": time.time(),
                "prompt_hash": hashlib.sha1(full.encode("utf-8")).hexdigest()[:16],
                "subject": resolved_subject,
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
        subject: Optional[str] = None,
    ) -> int:
        """Persist a teacher correction as a reusable grading lesson.

        Field semantics in this project:
            task          → essay topic
            wrong_code    → AI's incorrect grade JSON
            correct_code  → teacher's corrected grade JSON (may be empty)
            lesson_text   → teacher's instructional note
        """
        resolved_subject = detect_subject(task, subject)
        return self.memory.save_lesson(
            task=task,
            wrong_code=wrong_code,
            correct_code=correct_code,
            lesson_text=lesson_text,
            feedback_score=score,
            subject=resolved_subject,
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
            "prompt_built role=%s hash=%s lessons=%d",
            bundle.role.value,
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
