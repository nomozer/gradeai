"""
agent.py — Dual-Persona Gemini Engine (Coder + Critic)
Purpose: Orchestrates two Gemini model instances with distinct system
         instructions to simulate an AI self-critique loop.
Author: [Your Name]
Research Project: HITL Agentic Code-Learning System — "Mirror" Edition
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from dataclasses import dataclass, field
from typing import Any

import google.generativeai as genai
from dotenv import load_dotenv

from memory import MemoryManager
from prompt_orchestrator import PromptOrchestrator, Role

load_dotenv(override=True)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data containers
# ---------------------------------------------------------------------------


@dataclass
class PipelineResult:
    """Immutable output of a single pipeline run."""

    code: str
    critique: dict[str, Any]
    lessons_used: list[dict[str, Any]] = field(default_factory=list)
    run_id: int | None = None
    # Transparency: the fully-assembled prompt bundles for UI inspector / research
    coder_prompt: dict[str, Any] | None = None
    critic_prompt: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Agent wrappers
# ---------------------------------------------------------------------------

# Ordered by quality — auto-rotation falls through this list when quota is hit
CANDIDATE_MODELS: list[str] = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash-lite",
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


def _create_model(system_instruction: str, model_name: str) -> genai.GenerativeModel:
    return genai.GenerativeModel(
        model_name=model_name,
        system_instruction=system_instruction,
        safety_settings=SAFETY_SETTINGS,
    )


def _extract_code_block(text: str) -> str:
    """Pull the first ```python ... ``` block out of model output."""
    match = re.search(r"```python\s*\n(.*?)```", text, re.DOTALL)
    return match.group(1).strip() if match else text.strip()


def _parse_critique_json(text: str) -> dict[str, Any]:
    """Best-effort extraction of JSON from critic response."""
    # Strip markdown fences if present
    cleaned = re.sub(r"```(?:json)?\s*\n?", "", text).strip()
    cleaned = cleaned.rstrip("`").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Fallback: try to find first { ... } blob
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
        return {
            "issues": [{"dimension": "Parse Error", "description": cleaned, "line": None}],
            "severity": "medium",
            "suggestion": "Could not parse critic output — review manually.",
        }


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

MAX_RETRIES = len(CANDIDATE_MODELS) + 2  # enough attempts to cycle all models
RETRY_BASE_DELAY = 5  # seconds — only used for per-minute rate limits


def _parse_retry_delay(err_str: str) -> float | None:
    """Extract the retry delay (in seconds) from a Google API 429 error."""
    match = re.search(r"retry(?:_delay)?.*?(\d+(?:\.\d+)?)\s*s", err_str, re.IGNORECASE)
    if match:
        return float(match.group(1))
    # Fallback: look for "retry in Xs" pattern
    match = re.search(r"retry\s+in\s+(\d+(?:\.\d+)?)", err_str, re.IGNORECASE)
    if match:
        return float(match.group(1))
    return None


class AgentOrchestrator:
    """Runs the Coder → Critic pipeline with retry & memory integration.

    Prompt assembly is delegated to PromptOrchestrator (injection-safe
    system/memory/dynamic decomposition + research logging).
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

    # ---- internal ---------------------------------------------------------

    def _current_model_name(self) -> str:
        """Return active model: explicit env override, or current candidate."""
        override = os.getenv("GEMINI_MODEL", "").strip()
        return override if override else CANDIDATE_MODELS[self._model_idx]

    def _rotate_model(self) -> None:
        """Advance to the next candidate (no-op when GEMINI_MODEL is pinned)."""
        if os.getenv("GEMINI_MODEL", "").strip():
            return  # pinned — don't rotate
        next_idx = (self._model_idx + 1) % len(CANDIDATE_MODELS)
        logger.warning(
            "[HITL] Quota exhausted on %s — rotating to %s",
            CANDIDATE_MODELS[self._model_idx],
            CANDIDATE_MODELS[next_idx],
        )
        self._model_idx = next_idx

    async def _call_with_retry(self, system_instruction: str, prompt: str) -> str:
        """Call Gemini with auto model-rotation on quota errors.

        Two types of 429 are handled differently:
        - Per-day quota ("PerDay" in error): rotate immediately, no sleep —
          waiting does nothing since the quota won't reset for hours.
        - Per-minute rate limit (has a retry_delay suggestion): wait the
          suggested delay, then retry the NEW model.
        """
        last_exc: Exception | None = None
        for attempt in range(1, MAX_RETRIES + 1):
            model = _create_model(system_instruction, self._current_model_name())
            try:
                timeout_secs = int(os.getenv("GEMINI_TIMEOUT", "60"))
                response = await asyncio.wait_for(
                    asyncio.to_thread(model.generate_content, prompt),
                    timeout=timeout_secs,
                )
                if not response.candidates:
                    raise ValueError("Model returned no candidates.")
                if not response.text:
                    raise ValueError("Model output is empty. Please try again.")
                return response.text
            except Exception as exc:
                last_exc = exc
                err_str = str(exc)
                is_timeout = isinstance(exc, asyncio.TimeoutError)
                is_quota = "429" in err_str
                is_daily_quota = is_quota and (
                    "PerDay" in err_str or "per_day" in err_str.lower()
                    or "limit: 0," in err_str
                )
                retryable = is_timeout or is_quota or "503" in err_str

                if is_quota:
                    self._rotate_model()

                if not retryable or attempt >= MAX_RETRIES:
                    raise

                if is_daily_quota:
                    # No point sleeping — rotate was already done, retry immediately
                    logger.warning(
                        "[HITL] Daily quota exhausted — switching to %s (attempt %d/%d)",
                        self._current_model_name(), attempt, MAX_RETRIES,
                    )
                    continue

                # Per-minute rate limit or transient error: wait then retry
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
        lang: str = "en",
        feedback: str | None = None,
        wrong_code: str | None = None,
    ) -> PipelineResult:
        """Execute the full Coder → Critic pipeline.

        Args:
            task: Natural-language task description.
            lang: Language code ('en' or 'vi') for prompts and critique output.
            feedback: Optional human feedback to inject on a retry round.

        Steps:
            1. Build coder PromptBundle (system + lessons + task [+ feedback]).
            2. Create Gemini Coder model with bundle.system; generate code.
            3. Wait 2 s (Gemini rate-limit courtesy).
            4. Build critic PromptBundle (system + lessons + task + code).
            5. Create Gemini Critic model with bundle.system; parse JSON critique.
            6. Log the pipeline run to SQLite.

        Returns:
            PipelineResult with code, critique, lessons_used, run_id, and the
            two PromptBundles (as dicts) for UI transparency and research.
        """
        # 0 — Re-read .env to pick up any API key / model changes
        _configure_genai()

        # 1 — Merge wrong_code into feedback so the Coder sees exactly what
        #     it wrote before and what the human found wrong with it.
        #     This is the core of the HITL revision loop: without wrong_code,
        #     the model would only have the human comment ("lacks error handling")
        #     but not the actual code to fix.
        effective_feedback = feedback
        if wrong_code and wrong_code.strip():
            wrong_section = f"Previous attempt (has issues):\n```python\n{wrong_code.strip()}\n```"
            effective_feedback = (
                f"{wrong_section}\n\nHuman correction: {feedback}"
                if feedback else wrong_section
            )

        coder_bundle = self.prompts.build_prompt(
            role=Role.CODER,
            task=task,
            feedback=effective_feedback,
            lang=lang,
        )

        # 2 — Call Coder (model chosen automatically or from GEMINI_MODEL env)
        raw_code = await self._call_with_retry(coder_bundle.system, coder_bundle.user_content)
        code = _extract_code_block(raw_code)

        # 3 — Rate-limit gap
        await asyncio.sleep(2)

        # 4 — Build critic prompt (with generated code attached)
        critic_bundle = self.prompts.build_prompt(
            role=Role.CRITIC,
            task=task,
            code=code,
            lang=lang,
        )

        # 5 — Call Critic with same active model
        raw_critique = await self._call_with_retry(critic_bundle.system, critic_bundle.user_content)
        critique = _parse_critique_json(raw_critique)

        # 6 — Log pipeline run
        # Gemini sometimes returns "Low"/"LOW" — normalise before comparing
        auto_fixed = str(critique.get("severity", "")).strip().lower() == "low"
        run_id = self.memory.log_pipeline_run(
            task=task, iterations=1, auto_fixed=auto_fixed
        )

        return PipelineResult(
            code=code,
            critique=critique,
            lessons_used=coder_bundle.lessons_used,
            run_id=run_id,
            coder_prompt=coder_bundle.to_dict(),
            critic_prompt=critic_bundle.to_dict(),
        )
