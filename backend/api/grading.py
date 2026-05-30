"""
grading.py — Core grading & feedback endpoints.

Houses the six route handlers that drive the HITL grading loop:
    • POST /api/generate         — run the Gemini VLM pipeline
    • POST /api/regrade          — atomic save-feedback-then-regrade
    • POST /api/feedback         — approve / revise / reject
    • POST /api/finalize-grade   — persist teacher's final scores + deltas
    • POST /api/detect-subject   — keyword-score the task PDF
    • POST /api/analyze-comment  — per-question chat verdict + distilled lesson

Singletons (memory / prompt_orch / orchestrator) are injected via
``attach_grading()`` from ``main.py`` after bootstrap — same pattern as
``api/memory.py`` and ``api/history.py``.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException

from api.schemas import (
    AnalyzeCommentRequest,
    AnalyzeCommentResponse,
    DetectSubjectRequest,
    DetectSubjectResponse,
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
    compute_per_question_deltas,
    compute_per_step_deltas,
    extract_pdf_text,
    format_delta_lesson,
    infer_confidence,
    looks_like_timeout,
    parse_grade_json,
    safe_delta,
)
from memory import MemoryManager, log_event as log_hitl_event
from prompts import DEFAULT_SUBJECT, pick_top_subject, score_subjects


logger = logging.getLogger(__name__)
router = APIRouter(tags=["grading"])

_memory: MemoryManager | None = None
_prompt_orch: PromptOrchestrator | None = None
_orchestrator: AgentOrchestrator | None = None


def attach_grading(
    memory: MemoryManager,
    prompt_orch: PromptOrchestrator,
    orchestrator: AgentOrchestrator,
) -> None:
    """Inject the singletons built in ``main.py``.

    Same wiring style as ``attach_memory`` / ``attach_history_memory`` —
    keeps the router import-free of bootstrap concerns so tests can
    construct fakes without touching FastAPI.
    """
    global _memory, _prompt_orch, _orchestrator
    _memory = memory
    _prompt_orch = prompt_orch
    _orchestrator = orchestrator


def _require_deps() -> tuple[MemoryManager, PromptOrchestrator, AgentOrchestrator]:
    if _memory is None or _prompt_orch is None or _orchestrator is None:
        raise HTTPException(status_code=500, detail="Grading deps not attached")
    return _memory, _prompt_orch, _orchestrator


def _pipeline_http_error(exc: Exception) -> HTTPException:
    """Map a pipeline exception to 504 (timeout) or 502 (upstream).

    Keeps the UI's timeout-vs-upstream distinction intact instead of
    flattening everything to 502. Shares its timeout phrase-matching with
    the retry classifier via ``grading.looks_like_timeout``.
    """
    detail = str(exc)
    status_code = 504 if looks_like_timeout(detail) else 502
    logger.exception("Pipeline error (returning %d): %s", status_code, detail)
    safe_detail = (
        "AI upstream timed out. Please try again."
        if status_code == 504
        else "AI upstream request failed. Please check backend logs."
    )
    return HTTPException(status_code=status_code, detail=safe_detail)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/api/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    """Run the Gemini VLM Grader pipeline for a given essay.

    Despite the legacy URL ``/api/generate``, this is a multimodal grading
    endpoint. Provide ``image_b64`` to enable true VLM grading; omit it to
    fall back to topic-only grading.
    """
    _, _, orchestrator = _require_deps()
    try:
        answer_key = None
        if req.answer_key_pdf_b64:
            answer_key = await extract_pdf_text(req.answer_key_pdf_b64, max_pages=30)

        result = await orchestrator.run_pipeline(
            req.task,
            feedback=req.feedback,
            wrong_code=req.wrong_code,
            image_b64=req.image_b64,
            task_pdf_b64=req.task_pdf_b64,
            answer_key=answer_key,
            subject=req.subject,
            max_points_template=req.max_points_template,
        )
        return GenerateResponse(
            code=result.code,
            lessons_used=result.lessons_used,
            run_id=result.run_id,
            confidence=infer_confidence(parse_grade_json(result.code)),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise _pipeline_http_error(exc) from exc


@router.post("/api/regrade", response_model=RegradeResponse)
async def regrade(req: RegradeRequest):
    """Atomic HITL re-grade: save feedback → re-run pipeline.

    Primary endpoint for the revise/reject path.  Guarantees the teacher's
    correction is persisted as a lesson BEFORE the pipeline re-runs, so
    the Grader always sees the latest feedback.
    """
    _, prompt_orch, orchestrator = _require_deps()
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
    lesson_id = await asyncio.to_thread(
        prompt_orch.ingest_feedback,
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
        answer_key = None
        if req.answer_key_pdf_b64:
            answer_key = await extract_pdf_text(req.answer_key_pdf_b64, max_pages=30)

        result = await orchestrator.run_pipeline(
            req.task,
            feedback=feedback_text,
            wrong_code=req.wrong_code,
            image_b64=req.image_b64,
            task_pdf_b64=req.task_pdf_b64,
            answer_key=answer_key,
            parent_run_id=req.run_id,
            subject=req.subject,
            max_points_template=req.max_points_template,
        )
        return RegradeResponse(
            code=result.code,
            lessons_used=result.lessons_used,
            run_id=result.run_id,
            lesson_id=lesson_id,
            confidence=infer_confidence(parse_grade_json(result.code)),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise _pipeline_http_error(exc) from exc


@router.post("/api/feedback", response_model=FeedbackResponse)
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
    _, prompt_orch, _ = _require_deps()
    action = req.action.lower().strip()
    if action not in {"approve", "revise", "reject"}:
        raise HTTPException(
            status_code=400,
            detail='action must be one of "approve", "revise", "reject"',
        )

    if action == "approve":
        return await _handle_approve(req)

    if not req.comment.strip():
        raise HTTPException(
            status_code=400,
            detail='"comment" is required when action is "revise" or "reject".',
        )

    # reject > revise: stronger rejection must dominate retrieval ordering
    score = 5.0 if action == "reject" else 4.0
    lesson_id = await asyncio.to_thread(
        prompt_orch.ingest_feedback,
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


async def _handle_approve(req: FeedbackRequest) -> FeedbackResponse:
    """Approve path of /api/feedback — extracted to keep the router flat.

    Persists the approved grade, back-fills correct_code on earlier lessons,
    and stores per-question annotations (preferring staged lessons over the
    raw aggregated comment).
    """
    memory, prompt_orch, _ = _require_deps()
    approved_id: int | None = None
    grade = req.wrong_code.strip()
    if grade:
        approved_id = await asyncio.to_thread(
            memory.save_approved_grade,
            task=req.task,
            grade_json=grade,
            run_id=req.run_id,
        )
        # Back-propagate the approved grade as correct_code into any lessons
        # created during earlier revise/reject cycles for this task.
        await asyncio.to_thread(memory.backfill_correct_code, task=req.task, correct_code=grade)

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
                await asyncio.to_thread(
                    prompt_orch.ingest_feedback,
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
            await asyncio.to_thread(
                prompt_orch.ingest_feedback,
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


@router.post("/api/finalize-grade", response_model=FinalizeGradeResponse)
async def finalize_grade(req: FinalizeGradeRequest):
    """Persist a teacher-finalized grade and capture numeric score deltas.

    Strongest HITL signal the UI captures — a concrete rubric-level
    correction (e.g. AI gave 7.5 / content, teacher gave 5.0).  The delta
    lesson complements per-question lessons from /api/feedback: together
    they teach the Grader both *how to narrate* the correction and *by how
    much* to adjust the score.

    Learning thresholds tuned to the VN 10-point rubric:
      • per-rubric:  0.25  (the smallest meaningful step teachers use)
      • per-câu:     0.25  (same step size — câu scores live on the same scale)
      • overall:     0.10  (overall = sum of per-câu, deltas smooth out)

    Two score axes are compared independently and folded into ONE lesson:
      * Rubric (content/argument/expression/creativity) — legacy 4-dim.
      * Per-câu (Câu 1/2/…) — what the current UI actually edits in step 4.
    Combining them in a single lesson avoids double-counting one correction
    in the score-weighted retrieval ranking. Dedup via ``find_recent_lesson``
    keeps double-clicks on "Đã lưu" from polluting the corpus.
    """
    memory, prompt_orch, _ = _require_deps()
    PER_QUESTION_THRESHOLD = 0.25
    # Sub-câu criteria use a tighter threshold than full-câu since they're
    # finer-grained corrections (a 0.5đ shift on "Tính toán" within a 3đ
    # câu is more diagnostic than the same shift on the câu total).
    PER_STEP_THRESHOLD = 0.15
    OVERALL_THRESHOLD = 0.10
    DEDUP_WINDOW_SECONDS = 300

    per_question_deltas = compute_per_question_deltas(
        req.ai_per_question, req.teacher_per_question, PER_QUESTION_THRESHOLD
    )
    per_step_deltas = compute_per_step_deltas(
        req.ai_per_step, req.teacher_per_step, PER_STEP_THRESHOLD
    )
    overall_delta = safe_delta(req.ai_overall, req.teacher_overall)

    # Persist the approved grade (research-grade audit log). Idempotent via
    # the UNIQUE INDEX on approved_grades — no need to pre-check.
    approved_id: int | None = None
    approved_grade_json = req.approved_grade_json.strip()
    if approved_grade_json:
        approved_id = await asyncio.to_thread(
            memory.save_approved_grade,
            task=req.task,
            grade_json=approved_grade_json,
            run_id=req.run_id,
        )
        # Finalize is the one place that knows the teacher-approved JSON.
        # Back-fill older revise/reject lessons here so Step 4 no longer
        # needs to call /api/feedback with a premature "approve" signal.
        await asyncio.to_thread(
            memory.backfill_correct_code,
            task=req.task,
            correct_code=approved_grade_json,
        )

    # Save review annotations atomically with finalization. Prefer the
    # distilled per-question lessons staged by the frontend; fall back to an
    # aggregate comment only when no structured lessons were staged.
    comment_lesson_ids: list[int] = []

    async def _save_comment_lesson(text: str, score: float) -> int:
        existing_id = await asyncio.to_thread(
            memory.find_recent_lesson,
            task=req.task,
            lesson_text=text,
            feedback_score=score,
            within_seconds=DEDUP_WINDOW_SECONDS,
        )
        if existing_id is not None:
            return existing_id
        return await asyncio.to_thread(
            prompt_orch.ingest_feedback,
            task=req.task,
            wrong_code="",
            correct_code=approved_grade_json,
            lesson_text=text,
            score=score,
            subject=req.subject,
        )

    if req.staged_lessons:
        for staged in req.staged_lessons:
            text = staged.lesson_text.strip()
            if not text:
                continue
            prefix = f"[{staged.question_ref}] " if staged.question_ref else ""
            comment_lesson_ids.append(
                await _save_comment_lesson(f"{prefix}{text}", 3.5)
            )
    elif req.comment.strip():
        comment_lesson_ids.append(await _save_comment_lesson(req.comment.strip(), 3.0))

    # Auto-generate a lesson capturing the numeric correction so future
    # grading runs can learn the AI's tendency. Fires if ANY axis has a
    # delta above its threshold — including per-câu, which is the path that
    # 100% of teacher edits flow through under the current step-4 UI.
    delta_lesson_id: int | None = None
    has_signal = (
        bool(per_question_deltas)
        or bool(per_step_deltas)
        or (overall_delta is not None and abs(overall_delta) >= OVERALL_THRESHOLD)
    )
    if has_signal:
        lesson_text = format_delta_lesson(
            ai_overall=req.ai_overall,
            teacher_overall=req.teacher_overall,
            overall_delta=overall_delta,
            ai_per_question=req.ai_per_question,
            teacher_per_question=req.teacher_per_question,
            per_question_deltas=per_question_deltas,
            ai_per_step=req.ai_per_step,
            teacher_per_step=req.teacher_per_step,
            per_step_deltas=per_step_deltas,
        )
        # Idempotent save: a recent identical lesson (same task + same
        # rendered text + same score tier) means the teacher already
        # finalized this correction. Returning the existing id keeps the
        # corpus clean instead of duplicating the embedding/row.
        existing_id = await asyncio.to_thread(
            memory.find_recent_lesson,
            task=req.task,
            lesson_text=lesson_text,
            feedback_score=4.0,
            within_seconds=DEDUP_WINDOW_SECONDS,
        )
        if existing_id is not None:
            delta_lesson_id = existing_id
        else:
            delta_lesson_id = await asyncio.to_thread(
                prompt_orch.ingest_feedback,
                task=req.task,
                wrong_code="",
                correct_code=approved_grade_json,
                lesson_text=lesson_text,
                score=4.0,  # stronger than per-Q annotations (3.5), weaker than reject (5.0)
                subject=req.subject,
            )

    # Per-câu keys prefixed "cau:N", per-step keys nested as "step:CAU:LABEL"
    # so the frontend can split them back into per-câu / per-criterion views
    # without parsing nested JSON. Label may contain spaces — UI splits on
    # ":" with maxsplit=2.
    deltas_out: dict[str, float] = {}
    for cau, d in per_question_deltas.items():
        deltas_out[f"cau:{cau}"] = d
    for cau, step_map in per_step_deltas.items():
        for label, d in step_map.items():
            deltas_out[f"step:{cau}:{label}"] = d
    if overall_delta is not None:
        deltas_out["overall"] = overall_delta

    cau_count = len(per_question_deltas)
    step_count = sum(len(v) for v in per_step_deltas.values())
    if delta_lesson_id:
        message = (
            f"Finalized. Captured {cau_count} per-câu delta(s), "
            f"{step_count} per-step delta(s)."
        )
    else:
        message = "Finalized. No significant delta to learn from."
    log_hitl_event(
        "finalize",
        task=req.task,
        approved_id=approved_id,
        delta_lesson_id=delta_lesson_id,
        comment_lesson_ids=comment_lesson_ids,
        deltas=deltas_out,
    )
    return FinalizeGradeResponse(
        approved_id=approved_id,
        delta_lesson_id=delta_lesson_id,
        comment_lesson_ids=comment_lesson_ids,
        deltas=deltas_out,
        message=message,
    )


@router.post("/api/detect-subject", response_model=DetectSubjectResponse)
async def detect_subject_endpoint(req: DetectSubjectRequest):
    """Auto-classify the subject of an uploaded exam PDF.

    Pipeline: decode PDF → extract text from first ``_DETECT_MAX_PAGES``
    pages (PyMuPDF, no Gemini call) → keyword-score against each subject's
    vocabulary list → return the top pick + confidence + raw scores.

    Confidence rule (matches what the frontend chip needs to decide
    "auto-apply" vs "ask the teacher to confirm"):
      * ``high`` — top1 ≥ 5 hits AND top1 ≥ top2 + 3. Big margin + enough
                   absolute signal to trust the verdict silently.
      * ``low``  — some signal (top1 ≥ 1) but margin too narrow or count
                   too small. UI should highlight the chip and require
                   an explicit confirmation click.
      * ``none`` — no keyword matched at all. ``detected`` falls back to
                   DEFAULT_SUBJECT but the chip should ask the teacher to
                   pick manually.
    """
    HIGH_MIN_TOP = 5
    HIGH_MIN_MARGIN = 3

    try:
        text = await extract_pdf_text(req.task_pdf_b64)
    except Exception as exc:  # decode/IO problems
        logger.exception("detect-subject text extraction failed")
        raise HTTPException(status_code=400, detail=f"Cannot read PDF: {exc}") from exc

    scores = score_subjects(text)
    detected, top_score = pick_top_subject(scores)

    if top_score == 0:
        confidence = "none"
        detected = DEFAULT_SUBJECT
    else:
        second = sorted(scores.values(), reverse=True)[1] if len(scores) > 1 else 0
        if top_score >= HIGH_MIN_TOP and (top_score - second) >= HIGH_MIN_MARGIN:
            confidence = "high"
        else:
            confidence = "low"

    log_hitl_event(
        "detect-subject",
        detected=detected,
        confidence=confidence,
        top_score=top_score,
        text_len=len(text),
    )
    return DetectSubjectResponse(
        detected=detected,
        confidence=confidence,
        scores=scores,
    )


@router.post("/api/analyze-comment", response_model=AnalyzeCommentResponse)
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
    _, _, orchestrator = _require_deps()
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
