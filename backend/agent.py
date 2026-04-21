"""
agent.py — End-to-End Gemini Vision Grading Engine
Purpose: Single Gemini VLM call to grade essays from images. Quality
         assurance is handled by the human teacher via HITL feedback loop.
Author: [Your Name]
Research Project: Tác tử AI hỗ trợ chấm điểm tự luận đa phương thức kết hợp
                  phản hồi từ giáo viên (Human-in-the-loop VLM Grading Agent)
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import collections
import json
import logging
import os
import re
from dataclasses import dataclass, field
from typing import Any

import google.generativeai as genai
from dotenv import load_dotenv

from memory import MemoryManager
from prompt_orchestrator import PromptOrchestrator
from system_prompts import ANALYZE_COMMENT_SYSTEM, ANALYZE_COMMENT_USER_TEMPLATE, Subject

load_dotenv(override=True)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data containers
# ---------------------------------------------------------------------------


@dataclass
class PipelineResult:
    """Immutable output of a single grading pipeline run.

    The historical field name `code` now carries the Grader's JSON output
    (transcript + scores + comment). Kept as `code` for frontend compat.
    """

    code: str  # Grader JSON (essay grade)
    critique: dict[str, Any]
    lessons_used: list[dict[str, Any]] = field(default_factory=list)
    run_id: int | None = None


# ---------------------------------------------------------------------------
# Agent wrappers
# ---------------------------------------------------------------------------

# Ordered by quality — auto-rotation falls through this list when quota is hit.
# All listed models support multimodal (image) inputs via Gemini Vision.
CANDIDATE_MODELS: list[str] = [
    # "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
    # "gemini-2.5-pro",
    # "gemini-2.5-flash",
]

# Safety settings: allow everything to avoid empty "blocked" responses
SAFETY_SETTINGS = {
    "HARM_CATEGORY_HARASSMENT": "BLOCK_NONE",
    "HARM_CATEGORY_HATE_SPEECH": "BLOCK_NONE",
    "HARM_CATEGORY_SEXUALLY_EXPLICIT": "BLOCK_NONE",
    "HARM_CATEGORY_DANGEROUS_CONTENT": "BLOCK_NONE",
}


def _configure_genai() -> None:
    """Re-read .env and configure Gemini API. Called before every pipeline run."""
    load_dotenv(override=True)
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise EnvironmentError(
            "GOOGLE_API_KEY is missing. Set it in your .env file."
        )
    genai.configure(api_key=api_key)


def _create_model(
    system_instruction: str,
    model_name: str,
    *,
    json_mode: bool = False,
    max_output_tokens: int = 16384,
) -> genai.GenerativeModel:
    """Build a Gemini model. When ``json_mode`` is True the response is forced
    to ``application/json`` which prevents the text-truncation failures that
    previously produced partial JSON in the grader output."""
    gen_config: dict[str, Any] = {"max_output_tokens": max_output_tokens}
    if json_mode:
        gen_config["response_mime_type"] = "application/json"
    return genai.GenerativeModel(
        model_name=model_name,
        system_instruction=system_instruction,
        safety_settings=SAFETY_SETTINGS,
        generation_config=gen_config,
    )


def _decode_image(image_b64: str | None) -> dict[str, Any] | None:
    """Decode a base64-encoded essay file into a Gemini inline data part.

    Accepts either a raw base64 payload or a data URL
    (e.g. ``data:image/png;base64,XXXX`` or ``data:application/pdf;base64,XXXX``).
    Supports images (PNG, JPEG, etc.) and PDF files — Gemini handles both natively.
    Returns None when no file is given.
    """
    if not image_b64:
        return None
    payload = image_b64.strip()
    mime = "image/png"
    if payload.startswith("data:"):
        try:
            header, payload = payload.split(",", 1)
            mime = header.split(";")[0].removeprefix("data:") or mime
        except ValueError:
            pass
    try:
        raw = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError(f"Invalid base64 essay image: {exc}") from exc
    return {"mime_type": mime, "data": raw}


def _repair_truncated_json(text: str) -> str | None:
    """Attempt to repair a truncated JSON object by closing unclosed strings,
    arrays and objects. Returns the repaired string, or None when there is no
    JSON-like content to repair.

    Handles the common Gemini failure mode where max_output_tokens is hit
    mid-value: unfinished string, incomplete key, trailing comma, missing
    ``}``/``]``.
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
    # Close an unterminated string
    if in_string:
        result += '"'
    # Drop orphan trailing key/comma that can't close a valid value
    result = result.rstrip()
    while result.endswith((",", ":")):
        result = result[:-1].rstrip()
    # Close remaining brackets/braces in reverse order
    result += "".join(reversed(stack))
    return result


def _extract_field(text: str, field_name: str) -> str:
    """Best-effort scalar extraction for a top-level JSON string field."""
    pattern = rf'"{field_name}"\s*:\s*"((?:[^"\\]|\\.)*)"?'
    match = re.search(pattern, text, re.DOTALL)
    if not match:
        return ""
    raw = match.group(1)
    try:
        return json.loads(f'"{raw}"')
    except json.JSONDecodeError:
        return raw


def _parse_grade_json(text: str) -> dict[str, Any]:
    """Best-effort extraction of a Grader JSON object from VLM output.

    Strategy:
      1. Direct parse.
      2. Parse the ``{…}`` slice.
      3. Repair truncated JSON (close strings/braces) and re-parse.
      4. Regex-extract ``transcript`` / ``comment`` and synthesize an envelope.
    """
    cleaned = re.sub(r"```(?:json)?\s*\n?", "", text).strip()
    cleaned = cleaned.rstrip("`").strip()

    # Attempt 1 — direct parse (happy path)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Attempt 2 — extract first {…} slice
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    # Attempt 3 — repair truncation
    repaired = _repair_truncated_json(cleaned)
    if repaired:
        try:
            return json.loads(repaired)
        except json.JSONDecodeError:
            pass

    # Attempt 4 — salvage individual fields
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



# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

MAX_RETRIES = len(CANDIDATE_MODELS) + 2  # enough attempts to cycle all models
RETRY_BASE_DELAY = 5  # seconds — only used for per-minute rate limits
# Server-side file cache: keep decoded image/pdf parts so regrade requests
# don't need to re-upload the same 10–30 MB base64 payload.
MAX_FILE_CACHE = 50


def _parse_retry_delay(err_str: str) -> float | None:
    """Extract the retry delay (in seconds) from a Google API 429 error."""
    match = re.search(r"retry(?:_delay)?.*?(\d+(?:\.\d+)?)\s*s", err_str, re.IGNORECASE)
    if match:
        return float(match.group(1))
    match = re.search(r"retry\s+in\s+(\d+(?:\.\d+)?)", err_str, re.IGNORECASE)
    if match:
        return float(match.group(1))
    return None


def _is_timeout_like_error(exc: Exception) -> bool:
    """Classify local and upstream timeout failures as retryable."""
    err_str = str(exc)
    err_lower = err_str.lower()
    return isinstance(exc, asyncio.TimeoutError) or (
        "504" in err_str
        or "timed out" in err_lower
        or "gateway timeout" in err_lower
        or ("deadline" in err_lower and ("exceed" in err_lower or "expired" in err_lower))
    )


class AgentOrchestrator:
    """Runs the end-to-end VLM Grading pipeline with retry & memory integration.

    Single Gemini call per grading request — the teacher provides quality
    assurance via the HITL feedback loop instead of an AI Reviewer agent.
    """

    def __init__(
        self,
        memory: MemoryManager | None = None,
        prompt_orchestrator: PromptOrchestrator | None = None,
    ) -> None:
        self.memory = memory or MemoryManager()
        self.prompts = prompt_orchestrator or PromptOrchestrator(self.memory)
        # Index into CANDIDATE_MODELS; advances when quota is hit.
        # Ignored when GEMINI_MODEL env var is explicitly set.
        self._model_idx: int = 0
        # LRU file cache: run_id → (image_part, task_pdf_part)
        # Avoids re-uploading large base64 payloads on regrade requests.
        self._file_cache: collections.OrderedDict[int, tuple] = collections.OrderedDict()

    # ---- internal ---------------------------------------------------------

    def _current_model_name(self) -> str:
        """Return active model: explicit env override, or current candidate."""
        override = os.getenv("GEMINI_MODEL", "").strip()
        return override if override else CANDIDATE_MODELS[self._model_idx]

    def _rotate_model(self) -> None:
        """Advance to the next candidate.

        No-op when GEMINI_MODEL env var is pinned, or when only a single
        candidate is configured (rotating to itself buys nothing).
        """
        if os.getenv("GEMINI_MODEL", "").strip():
            return  # pinned — don't rotate
        if len(CANDIDATE_MODELS) <= 1:
            logger.warning(
                "[HITL] Quota exhausted on %s — no fallback model configured",
                CANDIDATE_MODELS[self._model_idx],
            )
            return
        next_idx = (self._model_idx + 1) % len(CANDIDATE_MODELS)
        logger.warning(
            "[HITL] Quota exhausted on %s — rotating to %s",
            CANDIDATE_MODELS[self._model_idx],
            CANDIDATE_MODELS[next_idx],
        )
        self._model_idx = next_idx

    def _cache_files(
        self, run_id: int, image_part: dict | None, task_pdf_part: dict | None,
    ) -> None:
        """Store decoded file parts so regrade can reuse them."""
        if run_id is None:
            return
        self._file_cache[run_id] = (image_part, task_pdf_part)
        while len(self._file_cache) > MAX_FILE_CACHE:
            self._file_cache.popitem(last=False)

    def _get_cached_files(
        self, run_id: int | None,
    ) -> tuple[dict | None, dict | None]:
        """Retrieve cached file parts for a previous pipeline run."""
        if run_id is None:
            return None, None
        entry = self._file_cache.get(run_id)
        if entry:
            self._file_cache.move_to_end(run_id)  # refresh LRU position
            return entry
        return None, None

    async def _call_with_retry(
        self,
        system_instruction: str,
        prompt: str,
        image_part: dict[str, Any] | None = None,
        task_pdf_part: dict[str, Any] | None = None,
        *,
        json_mode: bool = False,
        max_output_tokens: int = 16384,
    ) -> str:
        """Call Gemini Vision with auto model-rotation on quota errors.

        When ``image_part`` is supplied, the call is multimodal — the essay
        image is sent alongside the textual prompt so the VLM can read both
        printed and handwritten student work.

        When ``task_pdf_part`` is supplied, the exam prompt PDF is included
        so the VLM reads the rubric/topic directly from the document.

        When ``json_mode`` is True the response is constrained to JSON via
        Gemini's ``response_mime_type``.  ``max_output_tokens`` raises the
        ceiling so long rubric responses are not truncated mid-value.
        """
        last_exc: Exception | None = None
        for attempt in range(1, MAX_RETRIES + 1):
            model = _create_model(
                system_instruction,
                self._current_model_name(),
                json_mode=json_mode,
                max_output_tokens=max_output_tokens,
            )
            try:
                payload_count = int(image_part is not None) + int(task_pdf_part is not None)
                default_timeout_secs = 60 + (30 * payload_count)
                timeout_secs = int(
                    os.getenv("GEMINI_TIMEOUT", str(default_timeout_secs))
                )
                watchdog_timeout = timeout_secs + 15
                payload: list[Any] = [prompt]
                if task_pdf_part is not None:
                    payload.insert(0, task_pdf_part)
                if image_part is not None:
                    payload.insert(0, image_part)
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        model.generate_content,
                        payload,
                        request_options={"timeout": timeout_secs},
                    ),
                    timeout=watchdog_timeout,
                )
                if not response.candidates:
                    raise ValueError("Model returned no candidates.")
                if not response.text:
                    raise ValueError("Model output is empty. Please try again.")
                return response.text
            except Exception as exc:
                last_exc = exc
                err_str = str(exc)
                err_lower = err_str.lower()
                is_timeout = _is_timeout_like_error(exc)
                is_quota = "429" in err_str
                is_daily_quota = is_quota and (
                    "PerDay" in err_str or "per_day" in err_lower
                    or "limit: 0," in err_str
                )
                retryable = is_timeout or is_quota or "503" in err_str

                if is_quota:
                    self._rotate_model()

                if not retryable or attempt >= MAX_RETRIES:
                    raise

                if is_daily_quota:
                    logger.warning(
                        "[HITL] Daily quota exhausted — switching to %s (attempt %d/%d)",
                        self._current_model_name(), attempt, MAX_RETRIES,
                    )
                    continue

                api_delay = _parse_retry_delay(err_str)
                delay = (api_delay if api_delay else RETRY_BASE_DELAY * attempt) + 3
                logger.warning(
                    "[HITL] %s — waiting %.0fs (attempt %d/%d, next model=%s)",
                    "Rate limited" if is_quota else "Transient error",
                    delay, attempt, MAX_RETRIES, self._current_model_name(),
                )
                await asyncio.sleep(delay)

        if last_exc is not None:
            raise last_exc
        raise RuntimeError("Pipeline retry loop exited unexpectedly.")

    # ---- public -----------------------------------------------------------

    async def run_pipeline(
        self,
        task: str,
        feedback: str | None = None,
        wrong_code: str | None = None,
        image_b64: str | None = None,
        task_pdf_b64: str | None = None,
        parent_run_id: int | None = None,
        subject: Subject | str | None = None,
    ) -> PipelineResult:
        """Execute the end-to-end VLM Grading pipeline (single Gemini call).

        Args:
            task:       Essay topic / question / rubric description.
            feedback:   Optional teacher feedback to inject on a re-grade.
            wrong_code: AI's previous (incorrect) grade JSON, shown to the
                        Grader so it can self-correct.
            image_b64:  Base64-encoded essay image (PNG/JPEG). Optional —
                        if omitted, the Grader works from the topic alone.
            parent_run_id: ID of the previous pipeline run when this is a
                        teacher-triggered re-grade (forms a chain).
            subject:    Optional explicit subject family from the UI. When
                        omitted, PromptOrchestrator falls back to keyword
                        detection from ``task``.

        Steps:
            1. Build Grader PromptBundle (system + lessons + topic [+ feedback]).
            2. Call Gemini VLM with the essay image to produce a grade JSON.
            3. Log the pipeline run to SQLite + cache files for regrade.
        """
        # 0 — Re-read .env to pick up any API key / model changes
        _configure_genai()

        # Decode the essay image once.
        image_part = _decode_image(image_b64)

        # Decode the task/exam prompt PDF (if provided).
        task_pdf_part = _decode_image(task_pdf_b64)  # reuse decoder — works for PDF data URLs

        # Regrade shortcut: if no files were sent but a parent run exists,
        # pull the decoded parts from cache to avoid re-uploading.
        if image_part is None and parent_run_id is not None:
            cached_img, cached_pdf = self._get_cached_files(parent_run_id)
            if cached_img is not None:
                image_part = cached_img
                logger.info("[HITL] Reusing cached essay image from run %d", parent_run_id)
            if task_pdf_part is None and cached_pdf is not None:
                task_pdf_part = cached_pdf
                logger.info("[HITL] Reusing cached task PDF from run %d", parent_run_id)

        # 1 — Merge wrong_code into feedback so the Grader sees exactly what
        #     it produced before and what the teacher found wrong with it.
        effective_feedback = feedback
        if wrong_code and wrong_code.strip():
            wrong_section = (
                f"Previous AI grade (had issues):\n```json\n{wrong_code.strip()}\n```"
            )
            effective_feedback = (
                f"{wrong_section}\n\nTeacher correction: {feedback}"
                if feedback else wrong_section
            )

        grader_bundle = self.prompts.build_prompt(
            task=task,
            feedback=effective_feedback,
            subject=subject,
        )

        # 2 — Call Grader VLM (multimodal: text prompt + task PDF + essay image).
        # Force JSON mime-type + raised token ceiling so the Grader cannot emit
        # truncated / markdown-wrapped output that breaks the review UI.
        raw_grade = await self._call_with_retry(
            grader_bundle.system, grader_bundle.user_content,
            image_part=image_part, task_pdf_part=task_pdf_part,
            json_mode=True, max_output_tokens=16384,
        )
        grade_json = _parse_grade_json(raw_grade)
        # Stamp the detected subject onto the payload so the UI can pick the
        # right rubric labels (Literature vs STEM vs Language vs History).
        grade_json["subject"] = grader_bundle.subject.value
        grade_str = json.dumps(grade_json, ensure_ascii=False, indent=2)

        # 3 — Log pipeline run + cache files for regrade
        run_id = self.memory.log_pipeline_run(
            task=task, iterations=1, auto_fixed=False,
            parent_run_id=parent_run_id,
        )
        self._cache_files(run_id, image_part, task_pdf_part)

        return PipelineResult(
            code=grade_str,
            critique={},
            lessons_used=grader_bundle.lessons_used,
            run_id=run_id,
        )

    async def analyze_teacher_comment(
        self,
        question: str,
        student_answer: str,
        teacher_comment: str,
    ) -> dict[str, str]:
        """Analyze a teacher's comment and distill it into a reusable lesson.

        Returns a dict with two fields:
          - ``analysis``: ≤30-word conversational response shown in the
            per-question chat thread (helps the teacher calibrate).
          - ``lesson``:   ≤50-word distilled rule suitable for embedding and
            injection into future Grader prompts (the HITL signal).

        Both fields come from a single Gemini call in JSON mode to minimise
        latency and token cost — the chat-facing text and the learning-facing
        text are two views of the same teacher correction.
        """
        _configure_genai()

        system = ANALYZE_COMMENT_SYSTEM
        prompt = ANALYZE_COMMENT_USER_TEMPLATE.format(
            question=question,
            student_answer=student_answer,
            teacher_comment=teacher_comment,
        )

        raw = await self._call_with_retry(system, prompt, json_mode=True)
        try:
            parsed = json.loads(raw)
            analysis = str(parsed.get("analysis", "")).strip()
            lesson = str(parsed.get("lesson", "")).strip()
        except (json.JSONDecodeError, TypeError, ValueError):
            # Fall back gracefully: surface the raw text as analysis, leave
            # lesson empty so the caller skips persistence for this round.
            analysis = raw.strip()
            lesson = ""
        return {"analysis": analysis, "lesson": lesson}
