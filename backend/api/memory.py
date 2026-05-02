"""
memory.py — HITL Memory inspection router.

Exposes the lesson corpus to the frontend so a teacher can:
  • see what Gemini has learned from past corrections (transparency)
  • prune lessons that turned out to be wrong (curation)
  • check that subject-tagging stays balanced (auditing)

Mounted under ``/api/memory`` from ``main.py`` after the singleton
``MemoryManager`` is constructed; ``attach_memory()`` injects it.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from memory import MemoryManager, log_event as log_hitl_event


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/memory", tags=["memory"])

_memory: MemoryManager | None = None


def attach_memory(manager: MemoryManager) -> None:
    """Inject the singleton MemoryManager built in ``main.py``."""
    global _memory
    _memory = manager


def _require_memory() -> MemoryManager:
    if _memory is None:
        raise HTTPException(status_code=500, detail="Memory manager not attached")
    return _memory


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class LessonOut(BaseModel):
    id: int
    task: str
    wrong_code: str
    correct_code: str
    lesson_text: str
    subject: str
    timestamp: str | None = None
    feedback_score: float


class ListLessonsResponse(BaseModel):
    items: list[LessonOut]
    total: int


class MemoryStatsResponse(BaseModel):
    total_lessons: int
    total_approved_grades: int
    total_pipeline_runs: int
    by_subject: dict[str, int] = Field(default_factory=dict)
    by_tier: dict[str, int] = Field(default_factory=dict)


class DeleteLessonResponse(BaseModel):
    deleted: bool
    lesson_id: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/lessons", response_model=ListLessonsResponse)
def list_lessons(
    subject: str = Query(default="", description='Subject filter ("cs"|"math"|"phys"|"")'),
    search: str = Query(default="", description="Substring filter on lesson_text/task"),
    limit: int = Query(default=200, ge=1, le=500),
):
    """Return lessons sorted by feedback_score DESC then timestamp DESC."""
    manager = _require_memory()
    rows: list[dict[str, Any]] = manager.list_lessons(
        subject=subject.strip(),
        search=search.strip(),
        limit=limit,
    )
    return ListLessonsResponse(
        items=[LessonOut(**row) for row in rows],
        total=len(rows),
    )


@router.get("/stats", response_model=MemoryStatsResponse)
def memory_stats():
    manager = _require_memory()
    return MemoryStatsResponse(**manager.get_memory_stats())


@router.delete("/lessons/{lesson_id}", response_model=DeleteLessonResponse)
def delete_lesson(lesson_id: int):
    """Hard-delete a lesson from both SQLite and ChromaDB.

    Used by the Memory inspector when the teacher decides a lesson was
    wrong (e.g. they corrected the AI based on a misread of the student
    work, or a previously-valid rule no longer applies). Logs a HITL
    event so the audit trail captures the curation step.
    """
    manager = _require_memory()
    deleted = manager.delete_lesson(lesson_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Lesson {lesson_id} not found")
    log_hitl_event("memory-delete", lesson_id=lesson_id, via="memory-inspector")
    return DeleteLessonResponse(deleted=True, lesson_id=lesson_id)
