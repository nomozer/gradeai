"""
memory.py — Dual-Store Memory Manager (SQLite + ChromaDB)
Purpose: Provides synchronized persistent storage for HITL grading lessons
         using relational (SQLite) and vector (ChromaDB) backends.

Field semantics in this project:
    task          → essay topic
    wrong_code    → AI's incorrect grade JSON
    correct_code  → teacher's corrected grade JSON (optional)
    lesson_text   → teacher's instructional note (the constraint to learn)

Author: [Your Name]
Research Project: Tác tử AI hỗ trợ chấm điểm tự luận đa phương thức kết hợp
                  phản hồi từ giáo viên (Human-in-the-loop VLM Grading Agent)
"""

from __future__ import annotations

import datetime
import logging
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import chromadb
from sqlalchemy import (
    DateTime,
    Float,
    Integer,
    Text,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker, mapped_column, Mapped


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# SQLAlchemy Models (SQLAlchemy 2.x style)
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    pass


class Lesson(Base):
    """A single grading lesson learned from a teacher correction cycle.

    See module docstring for field-name → semantic mapping.
    """

    __tablename__ = "lessons"

    # BUG-1 FIX: Use Mapped[type] + mapped_column() — the correct SQLAlchemy 2.x pattern.
    # Previously the code mixed bare Column() with type annotations which caused
    # ArgumentError in SQLAlchemy 2.x.
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task: Mapped[str] = mapped_column(Text, nullable=False)
    wrong_code: Mapped[str] = mapped_column(Text, nullable=False)
    correct_code: Mapped[str] = mapped_column(Text, nullable=False)
    lesson_text: Mapped[str] = mapped_column(Text, nullable=False)
    # BUG-2 FIX: Replace deprecated datetime.utcnow with timezone-aware now().
    timestamp: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.timezone.utc),
        nullable=False,
    )
    feedback_score: Mapped[float] = mapped_column(Float, nullable=False, default=3.0)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "task": self.task,
            "wrong_code": self.wrong_code,
            "correct_code": self.correct_code,
            "lesson_text": self.lesson_text,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "feedback_score": self.feedback_score,
        }


class PipelineRun(Base):
    """Log entry for each agent pipeline execution (research metrics)."""

    __tablename__ = "pipeline_runs"

    # BUG-1 FIX: Use Mapped[type] + mapped_column()
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # BUG-2 FIX: timezone-aware default
    timestamp: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.timezone.utc),
        nullable=False,
    )
    task: Mapped[str] = mapped_column(Text, nullable=False)
    iterations: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    auto_fixed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # SQLite boolean as int
    # Links re-grade runs into a chain: run #1 → run #2 → run #3 (approved).
    # NULL for the first grading of an essay.
    parent_run_id: Mapped[int] = mapped_column(Integer, nullable=True, default=None)


class ApprovedGrade(Base):
    """Record of a teacher-approved AI grade (positive HITL signal).

    Captures the grades the AI got RIGHT — useful for:
      - Measuring approval rate over time (research metric)
      - Building few-shot example pools for future prompts
      - Proving the HITL loop improves grading quality
    """

    __tablename__ = "approved_grades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.timezone.utc),
        nullable=False,
    )
    task: Mapped[str] = mapped_column(Text, nullable=False)
    grade_json: Mapped[str] = mapped_column(Text, nullable=False)
    run_id: Mapped[int] = mapped_column(Integer, nullable=True)


# ---------------------------------------------------------------------------
# Memory Manager
# ---------------------------------------------------------------------------

CHROMA_COLLECTION = "hitl_grading_lessons_v1"


class MemoryManager:
    """Dual-backend memory for grading lessons.

    SQLite stores the structured record (essay topic, AI grade JSON,
    teacher grade JSON, instructional note) and ChromaDB indexes the
    free-text lesson for semantic retrieval at prompt-build time.
    """

    def __init__(self, db_dir: Path | None = None) -> None:
        if db_dir is None:
            db_dir = Path(__file__).resolve().parent / "data"
        db_dir.mkdir(parents=True, exist_ok=True)

        # --- SQLite ---
        db_path = db_dir / "hitl_mirror.db"
        self._engine = create_engine(
            f"sqlite:///{db_path}",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(self._engine)
        # BUG-3 FIX: sessionmaker produces context-manager-compatible sessions in SQLAlchemy 2.x
        # when used with `with self._SessionLocal() as session:` syntax.
        self._SessionLocal = sessionmaker(bind=self._engine, expire_on_commit=False)

        # --- ChromaDB ---
        chroma_path = db_dir / "chroma"
        self._chroma_client = chromadb.PersistentClient(path=str(chroma_path))
        self._collection = self._chroma_client.get_or_create_collection(
            name=CHROMA_COLLECTION,
            metadata={"hnsw:space": "cosine"},
        )

    # ---- helpers ----------------------------------------------------------

    @contextmanager
    def _get_session(self):
        """BUG-3 FIX: Proper session context manager that commits and rolls back correctly."""
        session: Session = self._SessionLocal()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    # ---- public API -------------------------------------------------------

    def save_lesson(
        self,
        task: str,
        wrong_code: str,
        correct_code: str,
        lesson_text: str,
        feedback_score: float = 3.0,
    ) -> int:
        """Persist a grading lesson to both SQLite and ChromaDB with compensation.

        Args:
            task:          essay topic
            wrong_code:    AI's incorrect grade JSON (or empty)
            correct_code:  teacher's corrected grade JSON (or empty)
            lesson_text:   teacher's instructional note
            feedback_score: 1.0–5.0 priority weight (higher = stronger constraint)

        Returns:
            The auto-generated lesson ID.
        """
        with self._get_session() as session:
            lesson = Lesson(
                task=task,
                wrong_code=wrong_code,
                correct_code=correct_code,
                lesson_text=lesson_text,
                feedback_score=feedback_score,
            )
            session.add(lesson)
            session.flush()   # flush to get auto-generated ID before commit
            lesson_id = lesson.id

        try:
            # Mirror into ChromaDB. Embed ``task`` + ``lesson_text`` together so
            # future-task retrieval works even when the teacher's note is terse
            # (e.g. "[Câu 1] sai ý a") — the topic context still anchors the vector.
            embed_text = f"{task}\n{lesson_text}".strip() or lesson_text
            self._collection.upsert(
                ids=[str(lesson_id)],
                documents=[embed_text],
                metadatas=[{"lesson_id": lesson_id, "task": task}],
            )
        except Exception:
            # SQLite committed first, so compensate to keep both stores aligned.
            try:
                with self._get_session() as session:
                    persisted = session.get(Lesson, lesson_id)
                    if persisted is not None:
                        session.delete(persisted)
            except Exception:
                logger.exception(
                    "Failed to roll back SQLite lesson %s after Chroma upsert error",
                    lesson_id,
                )
            raise
        return lesson_id

    # Cosine-distance cutoff for the *semantic* leg of retrieval.
    # Default embeddings (MiniLM) compress Vietnamese short-text distances
    # into 0.4–0.7. Empirically ≤ 0.4 catches near-duplicates and slight
    # rewordings of the same topic while filtering out unrelated Vietnamese
    # essays (which cluster around 0.48–0.56). Tune if you swap embedding
    # models to one with stronger Vietnamese coverage.
    SIMILARITY_DISTANCE_THRESHOLD: float = 0.4

    def search_relevant_lessons(
        self, task_description: str, top_k: int = 3
    ) -> list[dict[str, Any]]:
        """Hybrid retrieval of grading lessons relevant to the current task.

        Strategy:
          1. Exact task match via Chroma metadata — always included (this is
             the "same essay prompt re-uploaded" path that powered the
             original HITL loop).
          2. Semantic nearest-neighbour on the lesson text, filtered by
             ``SIMILARITY_DISTANCE_THRESHOLD``. Lets teacher corrections on
             one "binary arithmetic" prompt carry over to a different but
             related one, without polluting unrelated essays.

        Exact matches come first (strongest signal); semantic expansions
        fill any remaining slots up to ``top_k``.
        """
        total = self._collection.count()
        if total == 0 or not (task_description or "").strip():
            return []

        seen: set[int] = set()
        ordered_ids: list[int] = []

        # Leg 1 — exact task metadata match
        try:
            exact = self._collection.get(
                where={"task": task_description},
                limit=top_k,
            )
            for lid in exact.get("ids", []) or []:
                try:
                    i = int(lid)
                except (TypeError, ValueError):
                    continue
                if i not in seen:
                    seen.add(i)
                    ordered_ids.append(i)
        except Exception:
            logger.exception("Exact-match lesson retrieval failed")

        # Leg 2 — semantic expansion (only if we still have capacity)
        remaining = top_k - len(ordered_ids)
        if remaining > 0:
            try:
                sem = self._collection.query(
                    query_texts=[task_description],
                    n_results=min(top_k * 2, total),
                )
                ids = (sem.get("ids") or [[]])[0]
                distances = (sem.get("distances") or [[]])[0]
                for lid, dist in zip(ids, distances):
                    if remaining <= 0:
                        break
                    if dist is not None and dist > self.SIMILARITY_DISTANCE_THRESHOLD:
                        continue
                    try:
                        i = int(lid)
                    except (TypeError, ValueError):
                        continue
                    if i in seen:
                        continue
                    seen.add(i)
                    ordered_ids.append(i)
                    remaining -= 1
            except Exception:
                logger.exception("Semantic lesson retrieval failed")

        if not ordered_ids:
            return []

        with self._get_session() as session:
            lessons = (
                session.query(Lesson).filter(Lesson.id.in_(ordered_ids)).all()
            )
            by_id = {les.id: les.to_dict() for les in lessons}

        return [by_id[lid] for lid in ordered_ids if lid in by_id]


    def log_pipeline_run(
        self,
        task: str,
        iterations: int = 1,
        auto_fixed: bool = False,
        parent_run_id: int | None = None,
    ) -> int:
        """Record a pipeline execution for research metrics.

        Args:
            parent_run_id: ID of the previous run when this is a teacher-
                           triggered re-grade, forming a chain for analysis.
        """
        with self._get_session() as session:
            run = PipelineRun(
                task=task,
                iterations=iterations,
                auto_fixed=int(auto_fixed),
                parent_run_id=parent_run_id,
            )
            session.add(run)
            session.flush()
            return run.id

    def save_approved_grade(
        self, task: str, grade_json: str, run_id: int | None = None
    ) -> int:
        """Persist a teacher-approved grade as a positive HITL signal."""
        with self._get_session() as session:
            record = ApprovedGrade(
                task=task, grade_json=grade_json, run_id=run_id,
            )
            session.add(record)
            session.flush()
            return record.id

    def backfill_correct_code(self, task: str, correct_code: str) -> int:
        """Fill in ``correct_code`` on lessons that lack it for *task*.

        Called when the teacher approves a grade after one or more
        revise/reject cycles.  The approved grade JSON is back-propagated
        to every lesson that was created during those cycles (they were
        stored with ``correct_code=""`` because the correct answer was
        not yet known).

        Returns the number of lessons updated.
        """
        with self._get_session() as session:
            lessons = (
                session.query(Lesson)
                .filter(Lesson.task == task, Lesson.correct_code == "")
                .all()
            )
            for les in lessons:
                les.correct_code = correct_code
            return len(lessons)
