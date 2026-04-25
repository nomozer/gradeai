"""
main.py — FastAPI Backend for the HITL VLM Grading Agent

Responsibilities (kept deliberately small):
    • App bootstrap (FastAPI, CORS, lifespan)
    • Singleton wiring (MemoryManager → PromptOrchestrator → AgentOrchestrator)
    • Route handlers for the 5 grading/feedback endpoints
    • Including the heartbeat router from ``api.heartbeat``

Domain layout — each folder = one chapter of the report:
    • api/      — Pydantic schemas + heartbeat router (HTTP surface)
    • grading/  — AgentOrchestrator + Gemini client + file/JSON helpers
    • memory/   — Dual-store (SQLite + ChromaDB) + JSONL event log
    • prompts/  — Subject-aware system prompts (math, cs)

Research Project: Tác tử AI hỗ trợ chấm điểm tự luận đa phương thức kết hợp
                  phản hồi từ giáo viên (Human-in-the-loop VLM Grading Agent)
"""

from __future__ import annotations

import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger(__name__)

# Windows default console encoding is cp1252 — reconfigure stdout/stderr to
# UTF-8 so Vietnamese text in logs does not raise UnicodeEncodeError.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

# uvicorn is launched from backend/, so direct imports (no "backend." prefix).
from api.heartbeat import router as heartbeat_router, start_watchdog
from api.schemas import (
    AnalyzeCommentRequest,
    AnalyzeCommentResponse,
    FeedbackRequest,
    FeedbackResponse,
    FinalizeGradeRequest,
    FinalizeGradeResponse,
    GenerateRequest,
    GenerateResponse,
    RegradeRequest,
    RegradeResponse,
)
from grading import (
    AgentOrchestrator,
    PromptOrchestrator,
    looks_like_timeout,
)
from memory import MemoryManager, log_event as log_hitl_event

# Kick off heartbeat watchdog before FastAPI bootstrap so it catches startup
# failures too. No-op under DEV_MODE=1.
start_watchdog()


# ---------------------------------------------------------------------------
# App bootstrap
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="HITL VLM Grading Agent API",
    lifespan=lifespan,
    version="0.1.0",
    description="Backend for the Human-in-the-Loop multimodal essay-grading system",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(heartbeat_router)

# Singletons: memory drives prompt retrieval, prompt drives grading.
memory = MemoryManager()
prompt_orch = PromptOrchestrator(
    memory,
    k_lessons=3,
    log_dir=Path(__file__).resolve().parent / "data" / "prompt_logs",
)
orchestrator = AgentOrchestrator(memory=memory, prompt_orchestrator=prompt_orch)


# ---------------------------------------------------------------------------
# Helpers (shared by multiple endpoints)
# ---------------------------------------------------------------------------


def _pipeline_http_error(exc: Exception) -> HTTPException:
    """Map a pipeline exception to a 504 (timeout) or 502 (upstream) HTTPException.

    Keeps the UI's timeout-vs-upstream distinction intact instead of
    flattening everything to 502. Shares its timeout phrase-matching with
    the retry classifier via ``agent.looks_like_timeout``.
    """
    detail = str(exc)
    status_code = 504 if looks_like_timeout(detail) else 502
    logger.exception("Pipeline error (returning %d): %s", status_code, detail)
    return HTTPException(status_code=status_code, detail=detail)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.post("/api/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    """Run the Gemini VLM Grader pipeline for a given essay.

    Despite the legacy URL ``/api/generate``, this is a multimodal grading
    endpoint. Provide ``image_b64`` to enable true VLM grading; omit it to
    fall back to topic-only grading.
    """
    try:
        result = await orchestrator.run_pipeline(
            req.task,
            feedback=req.feedback,
            wrong_code=req.wrong_code,
            image_b64=req.image_b64,
            task_pdf_b64=req.task_pdf_b64,
            subject=req.subject,
        )
        return GenerateResponse(
            code=result.code,
            lessons_used=result.lessons_used,
            run_id=result.run_id,
        )
    except Exception as exc:
        raise _pipeline_http_error(exc) from exc


@app.post("/api/regrade", response_model=RegradeResponse)
async def regrade(req: RegradeRequest):
    """Atomic HITL re-grade: save feedback → re-run pipeline.

    Primary endpoint for the revise/reject path.  Guarantees the teacher's
    correction is persisted as a lesson BEFORE the pipeline re-runs, so
    the Grader always sees the latest feedback.
    """
    action = req.action.lower().strip()
    if action not in {"revise", "reject"}:
        raise HTTPException(
            status_code=400,
            detail='action must be "revise" or "reject"',
        )
    comment = req.comment.strip()
    if not comment:
        raise HTTPException(
            status_code=400,
            detail='"comment" is required for regrade.',
        )

    # 1 — Persist lesson (reject=5.0 > revise=4.0, per retrieval ordering)
    score = 5.0 if action == "reject" else 4.0
    lesson_id = prompt_orch.ingest_feedback(
        task=req.task,
        wrong_code=req.wrong_code,
        correct_code="",
        lesson_text=comment,
        score=score,
        subject=req.subject,
    )
    log_hitl_event(
        action,
        task=req.task,
        lesson_id=lesson_id,
        via="regrade",
        run_id=req.run_id,
    )

    # 2 — Build feedback text and re-run pipeline
    feedback_text = f"Teacher action: {action}\nTeacher note: {comment}"
    try:
        result = await orchestrator.run_pipeline(
            req.task,
            feedback=feedback_text,
            wrong_code=req.wrong_code,
            image_b64=req.image_b64,
            task_pdf_b64=req.task_pdf_b64,
            parent_run_id=req.run_id,
            subject=req.subject,
        )
        return RegradeResponse(
            code=result.code,
            lessons_used=result.lessons_used,
            run_id=result.run_id,
            lesson_id=lesson_id,
        )
    except Exception as exc:
        raise _pipeline_http_error(exc) from exc


@app.post("/api/feedback", response_model=FeedbackResponse)
async def feedback(req: FeedbackRequest):
    """Ingest structured teacher feedback from the right-side review panel.

    Routing rules:
      - "approve" → persist the approved grade as a positive HITL signal.
                    Staged per-question lessons (score 3.5) are preferred
                    over the aggregated comment (score 3.0) when both exist.
      - "revise"  → persist as a lesson (score 4.0) — useful correction.
      - "reject"  → persist as a lesson (score 5.0) — strongest signal.

    NOTE: PromptOrchestrator sorts retrieved lessons by feedback_score DESC
    before injecting them into the prompt, so a HIGHER score ⇒ greater
    influence on the next grading round. Reject must therefore be the highest.
    """
    action = req.action.lower().strip()
    if action not in {"approve", "revise", "reject"}:
        raise HTTPException(
            status_code=400,
            detail='action must be one of "approve", "revise", "reject"',
        )

    if action == "approve":
        return _handle_approve(req)

    if not req.comment.strip():
        raise HTTPException(
            status_code=400,
            detail='"comment" is required when action is "revise" or "reject".',
        )

    # reject > revise: stronger rejection must dominate retrieval ordering
    score = 5.0 if action == "reject" else 4.0
    lesson_id = prompt_orch.ingest_feedback(
        task=req.task,
        wrong_code=req.wrong_code,
        correct_code="",  # no teacher-edited corrected grade from this endpoint
        lesson_text=req.comment.strip(),
        score=score,
        subject=req.subject,
    )
    log_hitl_event(
        action,
        task=req.task,
        lesson_id=lesson_id,
        via="feedback",
        run_id=req.run_id,
    )
    return FeedbackResponse(
        action=action,
        saved=True,
        lesson_id=lesson_id,
        message="Lesson persisted. Next /api/generate run will retrieve it.",
    )


def _handle_approve(req: FeedbackRequest) -> FeedbackResponse:
    """Approve path of /api/feedback — extracted to keep the router flat.

    Persists the approved grade, back-fills correct_code on earlier lessons,
    and stores per-question annotations (preferring staged lessons over the
    raw aggregated comment).
    """
    approved_id: int | None = None
    grade = req.wrong_code.strip()
    if grade:
        approved_id = memory.save_approved_grade(
            task=req.task,
            grade_json=grade,
            run_id=req.run_id,
        )
        # Back-propagate the approved grade as correct_code into any lessons
        # created during earlier revise/reject cycles for this task.
        memory.backfill_correct_code(task=req.task, correct_code=grade)

    # Prefer the structured ``staged_lessons`` (per-question distilled rules
    # from /api/analyze-comment) — they embed much better than the aggregated
    # blob. Fall back to the free-form ``comment`` only if none were staged.
    lesson_ids: list[int] = []
    if req.staged_lessons:
        for staged in req.staged_lessons:
            text = staged.lesson_text.strip()
            if not text:
                continue
            prefix = f"[{staged.question_ref}] " if staged.question_ref else ""
            lesson_ids.append(
                prompt_orch.ingest_feedback(
                    task=req.task,
                    wrong_code="",
                    correct_code=grade,
                    lesson_text=f"{prefix}{text}",
                    score=3.5,  # per-question distilled rule > raw annotation (3.0)
                    subject=req.subject,
                )
            )
    elif req.comment.strip():
        lesson_ids.append(
            prompt_orch.ingest_feedback(
                task=req.task,
                wrong_code="",
                correct_code=grade,
                lesson_text=req.comment.strip(),
                score=3.0,
                subject=req.subject,
            )
        )

    saved = approved_id is not None or bool(lesson_ids)
    log_hitl_event(
        "approve",
        task=req.task,
        approved_id=approved_id,
        staged=len(req.staged_lessons),
        lesson_ids=lesson_ids,
    )
    message = (
        f"Grade approved and {len(lesson_ids)} lesson(s) saved."
        if lesson_ids else "Grade approved and recorded."
    )
    return FeedbackResponse(
        action="approve",
        saved=saved,
        lesson_id=lesson_ids[0] if lesson_ids else approved_id,
        lesson_ids=lesson_ids,
        message=message,
    )


@app.post("/api/finalize-grade", response_model=FinalizeGradeResponse)
async def finalize_grade(req: FinalizeGradeRequest):
    """Persist a teacher-finalized grade and capture numeric score deltas.

    Strongest HITL signal the UI captures — a concrete rubric-level
    correction (e.g. AI gave 7.5 / content, teacher gave 5.0).  The delta
    lesson complements per-question lessons from /api/feedback: together
    they teach the Grader both *how to narrate* the correction and *by how
    much* to adjust the score.

    Learning thresholds tuned to the VN 10-point rubric:
      • per-rubric: 0.25  (the smallest meaningful step teachers use)
      • overall:    0.10  (overall = mean of 4 rubrics, deltas smooth out)
    """
    PER_RUBRIC_THRESHOLD = 0.25
    OVERALL_THRESHOLD = 0.10

    deltas = _compute_score_deltas(
        req.ai_scores, req.teacher_scores, PER_RUBRIC_THRESHOLD
    )
    overall_delta = _safe_delta(req.ai_overall, req.teacher_overall)

    # Persist the approved grade (research-grade audit log). Idempotent via
    # the UNIQUE INDEX on approved_grades — no need to pre-check.
    approved_id: int | None = None
    if req.approved_grade_json.strip():
        approved_id = memory.save_approved_grade(
            task=req.task,
            grade_json=req.approved_grade_json.strip(),
            run_id=req.run_id,
        )

    # Auto-generate a lesson capturing the numeric correction so future
    # grading runs can learn the AI's tendency.
    delta_lesson_id: int | None = None
    if deltas or (overall_delta is not None and abs(overall_delta) >= OVERALL_THRESHOLD):
        lesson_text = _format_delta_lesson(req, deltas, overall_delta)
        delta_lesson_id = prompt_orch.ingest_feedback(
            task=req.task,
            wrong_code="",
            correct_code=req.approved_grade_json.strip(),
            lesson_text=lesson_text,
            score=4.0,  # stronger than per-Q annotations (3.5), weaker than reject (5.0)
            subject=req.subject,
        )

    deltas_out = dict(deltas)
    if overall_delta is not None:
        deltas_out["overall"] = overall_delta

    message = (
        f"Finalized. Captured {len(deltas)} rubric delta(s)."
        if delta_lesson_id else "Finalized. No significant delta to learn from."
    )
    log_hitl_event(
        "finalize",
        task=req.task,
        approved_id=approved_id,
        delta_lesson_id=delta_lesson_id,
        deltas=deltas_out,
    )
    return FinalizeGradeResponse(
        approved_id=approved_id,
        delta_lesson_id=delta_lesson_id,
        deltas=deltas_out,
        message=message,
    )


def _safe_delta(ai: float | None, teacher: float | None) -> float | None:
    """Compute ``teacher - ai`` with graceful handling of missing values."""
    if ai is None or teacher is None:
        return None
    try:
        return round(float(teacher) - float(ai), 2)
    except (TypeError, ValueError):
        return None


def _compute_score_deltas(
    ai_scores: dict[str, float],
    teacher_scores: dict[str, float],
    threshold: float,
) -> dict[str, float]:
    """Per-rubric delta dict, only keeping entries above the threshold."""
    rubric_keys = ("content", "argument", "expression", "creativity")
    deltas: dict[str, float] = {}
    for key in rubric_keys:
        d = _safe_delta(ai_scores.get(key), teacher_scores.get(key))
        if d is not None and abs(d) >= threshold:
            deltas[key] = d
    return deltas


def _format_delta_lesson(
    req: FinalizeGradeRequest,
    deltas: dict[str, float],
    overall_delta: float | None,
) -> str:
    """Render a Vietnamese lesson text describing the teacher's corrections."""
    parts = ["Hiệu chỉnh điểm của giáo viên cho bài tương tự:"]
    if overall_delta is not None and abs(overall_delta) >= 0.5:
        direction = "giảm" if overall_delta < 0 else "tăng"
        parts.append(
            f"- Tổng điểm: AI chấm {req.ai_overall} → giáo viên {direction} "
            f"còn {req.teacher_overall} (chênh {overall_delta:+}). "
        )
    for key, d in deltas.items():
        direction = "hạ" if d < 0 else "nâng"
        parts.append(
            f"- {key}: AI {req.ai_scores.get(key)} → giáo viên {direction} "
            f"{req.teacher_scores.get(key)} (chênh {d:+}). "
        )
    parts.append(
        "Khi gặp bài tương tự, cần điều chỉnh theo hướng này để khớp "
        "với chuẩn chấm của giáo viên."
    )
    return "\n".join(parts)


@app.post("/api/analyze-comment", response_model=AnalyzeCommentResponse)
async def analyze_comment(req: AnalyzeCommentRequest):
    """Analyze a teacher's annotation on a specific question.

    Returns three views of the same correction:
      - ``verdict``  ("agree" | "partial" | "dispute"): AI's judgment of
                     whether the teacher's comment matches the student's
                     actual work. The frontend uses this to gate staging
                     of the lesson into HITL memory.
      - ``analysis``: ≤80-word reply shown in the per-question chat thread,
                      with evidence cited from the student answer.
      - ``lesson``:   ≤60-word distilled rule that the frontend stages
                      client-side and flushes to Chroma on approve/regrade.
                      For ``dispute`` verdicts, the lesson is a defensive
                      rule protecting against the teacher's misread.
    """
    try:
        result = await orchestrator.analyze_teacher_comment(
            question=req.question,
            student_answer=req.student_answer,
            teacher_comment=req.teacher_comment,
        )
        lesson_text = result.get("lesson", "")
        verdict = result.get("verdict", "agree")
        log_hitl_event(
            "analyze-comment",
            verdict=verdict,
            lesson_len=len(lesson_text),
            preview=lesson_text[:80],
        )
        return AnalyzeCommentResponse(
            analysis=result.get("analysis", ""),
            lesson=lesson_text,
            verdict=verdict,
        )
    except Exception as exc:
        logger.exception("analyze-comment failed")
        raise HTTPException(status_code=502, detail=str(exc)) from exc
