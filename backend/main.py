"""
main.py — FastAPI Backend for the HITL VLM Grading Agent
Purpose: REST API bridging the React frontend with the multimodal grading
         pipeline (Grader → Reviewer) and the Memory subsystem.
Author: [Your Name]
Research Project: Tác tử AI hỗ trợ chấm điểm tự luận đa phương thức kết hợp
                  phản hồi từ giáo viên (Human-in-the-loop VLM Grading Agent)
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import time
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Windows default console encoding is cp1252 — reconfigure stdout/stderr to
# UTF-8 so Vietnamese text in logs does not raise UnicodeEncodeError.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

# uvicorn is launched from backend/, so direct imports (no "backend." prefix).
from agent import AgentOrchestrator
from hitl_logger import log_event as log_hitl_event
from memory import MemoryManager
from prompt_orchestrator import PromptOrchestrator

# ---------------------------------------------------------------------------
# Heartbeat — auto-shutdown when the frontend tab is closed
# ---------------------------------------------------------------------------

HEARTBEAT_TIMEOUT_SEC = int(os.getenv("HEARTBEAT_TIMEOUT", "30"))
DEV_MODE = os.getenv("DEV_MODE", "0").strip().lower() in ("1", "true", "yes")

# None = "no heartbeat received yet" → don't start countdown until frontend connects
last_heartbeat: float | None = None


def _kill_frontend():
    """Find and kill the process serving the frontend (default port 3000)."""
    try:
        if sys.platform == "win32":
            cmd = "netstat -ano | findstr :3000"
            out = subprocess.check_output(cmd, shell=True).decode()
            for line in out.strip().split("\n"):
                if "LISTENING" in line:
                    pid = line.strip().split()[-1]
                    print(f"[HITL] Killing frontend process PID: {pid}")
                    subprocess.run(
                        f"taskkill /F /T /PID {pid}", shell=True, capture_output=True
                    )
        else:
            subprocess.run("fuser -k 3000/tcp", shell=True, capture_output=True)
    except Exception as e:
        print(f"[HITL] Could not kill frontend: {e}")


def _monitor_heartbeat():
    """Background thread: shut the backend down if the browser stops pinging.

    Grace period: the countdown only starts AFTER the first heartbeat is
    received from the frontend, so the backend won't self-destruct during
    startup or when running without a frontend (e.g. API testing).
    """
    global last_heartbeat
    while True:
        time.sleep(5)
        if last_heartbeat is None:
            continue  # Still waiting for the first heartbeat — don't kill anything
        elapsed = time.time() - last_heartbeat
        if elapsed > HEARTBEAT_TIMEOUT_SEC:
            print(f"[HITL] No heartbeat for {HEARTBEAT_TIMEOUT_SEC}s — shutting down.")
            _kill_frontend()
            os._exit(0)


if not DEV_MODE:
    _heartbeat_thread = threading.Thread(target=_monitor_heartbeat, daemon=True)
    _heartbeat_thread.start()
else:
    print("[HITL] DEV_MODE=true — heartbeat auto-shutdown DISABLED.")

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

memory = MemoryManager()
prompt_orch = PromptOrchestrator(
    memory,
    k_lessons=3,
    log_dir=Path(__file__).resolve().parent / "data" / "prompt_logs",
)
orchestrator = AgentOrchestrator(memory=memory, prompt_orchestrator=prompt_orch)

# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class GenerateRequest(BaseModel):
    """Request body for /api/generate (a.k.a. ‘grade essay’).

    Field name kept for frontend backwards-compatibility, but the semantics
    are now: ``task`` = essay topic / rubric, ``image_b64`` = the student's
    essay image, ``wrong_code`` = the AI's previous (incorrect) grade JSON.
    """

    task: str = Field(..., min_length=1, description="Essay topic / rubric")
    lang: str = Field(default="en", description="Language code: 'en' or 'vi'")
    feedback: str | None = Field(
        default=None,
        description="Optional teacher feedback injected into the grader prompt (re-grade round)",
    )
    wrong_code: str | None = Field(
        default=None,
        description="Previous AI-produced grade JSON the teacher rejected — shown to the Grader so it knows exactly what to fix",
    )
    image_b64: str | None = Field(
        default=None,
        description="Base64-encoded essay image (data URL or raw payload). Required for true multimodal grading.",
    )
    task_pdf_b64: str | None = Field(
        default=None,
        description="Base64-encoded PDF of the exam prompt (data URL). Gemini reads the rubric/topic directly from this document.",
    )


class GenerateResponse(BaseModel):
    code: str  # Grader JSON output
    critique: dict[str, Any]
    lessons_used: list[dict[str, Any]]
    run_id: int | None


class StagedLesson(BaseModel):
    """A per-question lesson distilled by /api/analyze-comment.

    The frontend stages these client-side as the teacher annotates each
    question, then submits the full batch when they click "Duyệt". This
    gives the HITL loop per-question granularity instead of a single
    blob-level correction.
    """

    lesson_text: str = Field(..., min_length=1, description="Distilled grading rule")
    question_ref: str = Field(default="", description='e.g. "Câu 1"')


class FeedbackRequest(BaseModel):
    """Structured teacher feedback from the HITL right panel.

    action         : approve | revise | reject
    comment        : free-form aggregate explanation (required for revise/reject)
    staged_lessons : per-question lessons pre-distilled client-side
    task           : essay topic (so the lesson can be retrieved later)
    wrong_code     : the AI grade JSON the teacher is reacting to
    run_id         : optional pointer to the pipeline run being reviewed
    """

    action: str = Field(..., description='"approve" | "revise" | "reject"')
    comment: str = Field(default="", description="Explanation of what is wrong")
    task: str = Field(..., min_length=1)
    wrong_code: str = Field(default="")
    run_id: int | None = None
    staged_lessons: list[StagedLesson] = Field(default_factory=list)


class FeedbackResponse(BaseModel):
    action: str
    saved: bool
    lesson_id: int | None = None
    lesson_ids: list[int] = Field(default_factory=list)
    message: str


class AnalyzeCommentRequest(BaseModel):
    """Request body for /api/analyze-comment.

    The teacher annotates a specific question in the review UI; this
    endpoint sends the context to a lightweight Gemini call that returns
    a concise analysis (≤30 words per error).
    """

    question: str = Field(default="", description="Exam question / topic")
    student_answer: str = Field(
        default="", description="Student's transcribed answer for this question"
    )
    teacher_comment: str = Field(
        ..., min_length=1, description="Teacher's annotation"
    )
    lang: str = Field(default="vi")


class AnalyzeCommentResponse(BaseModel):
    analysis: str
    lesson: str = Field(
        default="",
        description="Distilled ≤50-word grading rule for future HITL retrieval. "
        "Empty if the model could not produce a reusable rule.",
    )


class FinalizeGradeRequest(BaseModel):
    """Persist a teacher-finalized grade + capture score-delta as a lesson.

    Fires when the teacher clicks "Xác nhận điểm" on Tab 5 with scores that
    differ from the AI's suggestion. The numeric delta is itself a HITL
    signal — currently the strongest one the UI captures, since it's a
    concrete correction rather than free-form text.
    """

    task: str = Field(..., min_length=1)
    lang: str = Field(default="vi")
    ai_overall: float | None = None
    teacher_overall: float | None = None
    ai_scores: dict[str, float] = Field(default_factory=dict)
    teacher_scores: dict[str, float] = Field(default_factory=dict)
    approved_grade_json: str = Field(default="")
    run_id: int | None = None


class FinalizeGradeResponse(BaseModel):
    approved_id: int | None = None
    delta_lesson_id: int | None = None
    deltas: dict[str, float] = Field(default_factory=dict)
    message: str


class RegradeRequest(BaseModel):
    """Atomic HITL re-grade: save teacher feedback as a lesson, then
    re-run the VLM pipeline in a single request.  This ensures the
    feedback is always persisted before re-grading begins.
    """

    task: str = Field(..., min_length=1, description="Essay topic / rubric")
    lang: str = Field(default="en")
    action: str = Field(..., description='"revise" | "reject"')
    comment: str = Field(..., min_length=1, description="Teacher correction note")
    wrong_code: str = Field(default="", description="Previous AI grade JSON")
    image_b64: str | None = None
    task_pdf_b64: str | None = None
    run_id: int | None = None


class RegradeResponse(BaseModel):
    """Combines feedback acknowledgement + new pipeline result."""

    code: str
    critique: dict[str, Any]
    lessons_used: list[dict[str, Any]]
    run_id: int | None
    lesson_id: int | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.post("/api/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    """Run the VLM Grader → Reviewer pipeline for a given essay.

    Despite the legacy URL ``/api/generate``, this is a multimodal grading
    endpoint. Provide ``image_b64`` to enable true VLM grading; omit it to
    fall back to topic-only grading.
    """
    try:
        result = await orchestrator.run_pipeline(
            req.task,
            lang=req.lang,
            feedback=req.feedback,
            wrong_code=req.wrong_code,
            image_b64=req.image_b64,
            task_pdf_b64=req.task_pdf_b64,
        )
        return GenerateResponse(
            code=result.code,
            critique=result.critique,
            lessons_used=result.lessons_used,
            run_id=result.run_id,
        )
    except Exception as exc:
        # Preserve timeout semantics for the UI instead of flattening everything to 502.
        import traceback
        detail = str(exc)
        detail_lower = detail.lower()
        status_code = 504 if (
            "504" in detail
            or "timed out" in detail_lower
            or "gateway timeout" in detail_lower
            or "deadline" in detail_lower
        ) else 502
        print(f"[API ERROR] {traceback.format_exc()}")
        raise HTTPException(status_code=status_code, detail=detail) from exc


@app.post("/api/regrade", response_model=RegradeResponse)
async def regrade(req: RegradeRequest):
    """Atomic HITL re-grade: save feedback → re-run pipeline.

    This is the primary endpoint for the revise/reject path.  It guarantees
    that the teacher's correction is persisted as a lesson BEFORE the
    pipeline re-runs, so the Grader always sees the latest feedback.
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

    # 1 — Persist lesson
    score = 5.0 if action == "reject" else 4.0
    lesson_id = prompt_orch.ingest_feedback(
        task=req.task,
        wrong_code=req.wrong_code,
        correct_code="",
        lesson_text=comment,
        score=score,
    )

    # 2 — Build feedback text for the Grader prompt
    feedback_text = f"Teacher action: {action}\nTeacher note: {comment}"
    effective_feedback = feedback_text
    if req.wrong_code and req.wrong_code.strip():
        wrong_section = (
            f"Previous AI grade (had issues):\n```json\n{req.wrong_code.strip()}\n```"
        )
        effective_feedback = f"{wrong_section}\n\n{feedback_text}"

    # 3 — Re-run pipeline
    try:
        result = await orchestrator.run_pipeline(
            req.task,
            lang=req.lang,
            feedback=effective_feedback,
            wrong_code=req.wrong_code,
            image_b64=req.image_b64,
            task_pdf_b64=req.task_pdf_b64,
            parent_run_id=req.run_id,
        )
        return RegradeResponse(
            code=result.code,
            critique=result.critique,
            lessons_used=result.lessons_used,
            run_id=result.run_id,
            lesson_id=lesson_id,
        )
    except Exception as exc:
        import traceback
        detail = str(exc)
        detail_lower = detail.lower()
        status_code = 504 if (
            "504" in detail
            or "timed out" in detail_lower
            or "gateway timeout" in detail_lower
            or "deadline" in detail_lower
        ) else 502
        print(f"[API ERROR] {traceback.format_exc()}")
        raise HTTPException(status_code=status_code, detail=detail) from exc


@app.post("/api/feedback", response_model=FeedbackResponse)
async def feedback(req: FeedbackRequest):
    """Ingest structured teacher feedback from the right-side review panel.

    Routing rules:
      - "approve" → persist the approved grade as a positive HITL signal,
                    then acknowledge.  The record feeds research metrics
                    (approval rate) and can seed few-shot example pools.
      - "revise"  → persist as a lesson (score 4.0) — useful correction.
      - "reject"  → persist as a lesson (score 5.0) — strongest signal,
                    ranks first in the retrieved-lesson ordering so the
                    Grader prompt emphasises it on the next run.

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
        approved_id = None
        grade = req.wrong_code.strip()
        if grade:
            approved_id = memory.save_approved_grade(
                task=req.task,
                grade_json=grade,
                run_id=req.run_id,
            )
            # Back-propagate the approved grade as correct_code into any
            # lessons created during earlier revise/reject cycles for this
            # task.  Previously these were stored with correct_code="" because
            # the right answer was unknown at feedback time.
            memory.backfill_correct_code(task=req.task, correct_code=grade)

        # HITL annotation: teacher approved but left per-question notes.
        # Prefer the structured ``staged_lessons`` (per-question distilled
        # rules from /api/analyze-comment) — they embed much better than the
        # aggregated blob. Fall back to the free-form ``comment`` only if no
        # staged lessons were provided, for backwards-compat.
        lesson_ids: list[int] = []
        if req.staged_lessons:
            for staged in req.staged_lessons:
                text = staged.lesson_text.strip()
                if not text:
                    continue
                # Prefix with question_ref so retrieval hits carry context.
                prefix = f"[{staged.question_ref}] " if staged.question_ref else ""
                lid = prompt_orch.ingest_feedback(
                    task=req.task,
                    wrong_code="",
                    correct_code=grade,
                    lesson_text=f"{prefix}{text}",
                    score=3.5,  # per-question distilled rule > raw annotation (3.0)
                )
                lesson_ids.append(lid)
        else:
            note = req.comment.strip()
            if note:
                lesson_ids.append(
                    prompt_orch.ingest_feedback(
                        task=req.task,
                        wrong_code="",
                        correct_code=grade,
                        lesson_text=note,
                        score=3.0,
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
            action=action,
            saved=saved,
            lesson_id=lesson_ids[0] if lesson_ids else approved_id,
            lesson_ids=lesson_ids,
            message=message,
        )

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
    )
    return FeedbackResponse(
        action=action,
        saved=True,
        lesson_id=lesson_id,
        message="Lesson persisted. Next /api/generate run will retrieve it.",
    )




@app.post("/api/finalize-grade", response_model=FinalizeGradeResponse)
async def finalize_grade(req: FinalizeGradeRequest):
    """Persist a teacher-finalized grade and capture numeric score deltas.

    This is the strongest HITL signal the UI captures — a concrete
    rubric-level correction (e.g. AI gave 7.5 / content, teacher gave 5.0).
    The delta lesson complements the free-form per-question lessons
    persisted by /api/feedback: together they teach the Grader both *how to
    narrate* the correction and *by how much* to adjust the score.
    """
    rubric_keys = ["content", "argument", "expression", "creativity"]

    # Learning thresholds — tuned to the VN 10-point rubric:
    #   • per-rubric: 0.25 (the smallest meaningful step teachers actually use)
    #   • overall:    0.10 (overall = mean of 4 rubrics, so deltas smooth out —
    #                 a 0.25 shift in one rubric only moves overall ~0.06)
    PER_RUBRIC_THRESHOLD = 0.25
    OVERALL_THRESHOLD = 0.10

    # 1 — Compute deltas for each rubric key where both sides have a number.
    deltas: dict[str, float] = {}
    for key in rubric_keys:
        ai_v = req.ai_scores.get(key)
        te_v = req.teacher_scores.get(key)
        if ai_v is None or te_v is None:
            continue
        try:
            d = round(float(te_v) - float(ai_v), 2)
        except (TypeError, ValueError):
            continue
        if abs(d) >= PER_RUBRIC_THRESHOLD:
            deltas[key] = d

    overall_delta: float | None = None
    if req.ai_overall is not None and req.teacher_overall is not None:
        try:
            overall_delta = round(float(req.teacher_overall) - float(req.ai_overall), 2)
        except (TypeError, ValueError):
            overall_delta = None

    # 2 — Persist the approved grade (research-grade audit log).
    approved_id: int | None = None
    if req.approved_grade_json.strip():
        approved_id = memory.save_approved_grade(
            task=req.task,
            grade_json=req.approved_grade_json.strip(),
            run_id=req.run_id,
        )

    # 3 — If any rubric delta is non-trivial, auto-generate a lesson that
    # captures the numeric correction so future grading runs can learn the
    # AI's tendency (e.g. "tends to overgrade expression by ~2 points").
    delta_lesson_id: int | None = None
    if deltas or (overall_delta is not None and abs(overall_delta) >= OVERALL_THRESHOLD):
        if req.lang == "vi":
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
            lesson_text = "\n".join(parts)
        else:
            parts = ["Teacher score adjustment on a similar essay:"]
            if overall_delta is not None and abs(overall_delta) >= 0.5:
                direction = "lowered" if overall_delta < 0 else "raised"
                parts.append(
                    f"- Overall: AI gave {req.ai_overall} → teacher {direction} "
                    f"to {req.teacher_overall} ({overall_delta:+})."
                )
            for key, d in deltas.items():
                direction = "down" if d < 0 else "up"
                parts.append(
                    f"- {key}: AI {req.ai_scores.get(key)} → teacher adjusted "
                    f"{direction} to {req.teacher_scores.get(key)} ({d:+})."
                )
            parts.append(
                "On similar essays, calibrate scores in this direction to match "
                "the teacher's rubric."
            )
            lesson_text = "\n".join(parts)

        delta_lesson_id = prompt_orch.ingest_feedback(
            task=req.task,
            wrong_code="",
            correct_code=req.approved_grade_json.strip(),
            lesson_text=lesson_text,
            score=4.0,  # stronger than per-Q annotations (3.5), weaker than reject (5.0)
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


@app.post("/api/analyze-comment", response_model=AnalyzeCommentResponse)
async def analyze_comment(req: AnalyzeCommentRequest):
    """Analyze a teacher's annotation on a specific question.

    Returns two views of the same correction:
      - ``analysis``: ≤30-word reply shown in the per-question chat thread
      - ``lesson``:   ≤50-word distilled rule that the frontend stages
                      client-side and flushes to Chroma on approve/regrade
    """
    try:
        result = await orchestrator.analyze_teacher_comment(
            question=req.question,
            student_answer=req.student_answer,
            teacher_comment=req.teacher_comment,
            lang=req.lang,
        )
        lesson_text = result.get("lesson", "")
        log_hitl_event(
            "analyze-comment",
            lesson_len=len(lesson_text),
            preview=lesson_text[:80],
        )
        return AnalyzeCommentResponse(
            analysis=result.get("analysis", ""),
            lesson=lesson_text,
        )
    except Exception as exc:
        import traceback

        print(f"[API ERROR] {traceback.format_exc()}")
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/heartbeat")
async def heartbeat():
    """Reset heartbeat timer — called by the frontend every 10 s."""
    global last_heartbeat
    last_heartbeat = time.time()
    return {"status": "ok"}
