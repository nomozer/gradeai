"""
store.py — Class (lớp) + student roster persistence.

A teacher organizes grading by CLASS: a class holds a roster of students, and
(in a later stage) each graded paper links to a student so the class gradebook
can be assembled and exported. This store owns that structure.

Lives in its own ``classes`` package with its own SQLAlchemy engine on the
SAME SQLite file as MemoryManager / UserStore (``data/hitl_mirror.db``) — WAL
mode lets the engines share the file safely. Three tables:

    • classes        — id, user_id (owner teacher), name, note
    • students       — id, user_id, class_id, full_name, student_code, order_index
    • student_grades — one current grade per student (scores JSON + total),
                       fed by the grading desk on finalize

Multi-tenant: every row carries ``user_id`` and every read/write is scoped to
``request_context.current_user_id`` read INSIDE each method (never threaded as
an argument) — exactly how MemoryManager enforces isolation. Offline callers
with no request fall in the ``user_id=0`` bucket.
"""

from __future__ import annotations

import datetime
import json
import logging
from pathlib import Path
from typing import Any

from sqlalchemy import (
    DateTime,
    Float,
    Integer,
    Text,
    create_engine,
    event,
    func,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    sessionmaker,
)

from request_context import get_current_user_id

logger = logging.getLogger(__name__)


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


class Base(DeclarativeBase):
    pass


class ClassRoom(Base):
    __tablename__ = "classes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional free-text note (e.g. "Toán giữa kỳ", "Sĩ số 32").
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    def to_dict(self, student_count: int | None = None) -> dict[str, Any]:
        data: dict[str, Any] = {
            "id": self.id,
            "name": self.name,
            "note": self.note,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if student_count is not None:
            data["student_count"] = student_count
        return data


class Student(Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Denormalized owner id (== the class's user_id) so student reads/writes
    # scope on user_id directly without a join back to ``classes``.
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    class_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    # School's own student code/ID, optional.
    student_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Preserves roster order (import order / manual add order).
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "class_id": self.class_id,
            "full_name": self.full_name,
            "student_code": self.student_code,
            "order_index": self.order_index,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class StudentGrade(Base):
    """A student's CURRENT grade (one row per student — upsert target).

    Fed by the grading desk: when a teacher finalizes a paper opened for a
    specific student, the per-câu scores land here so the class gradebook can
    be assembled + exported without re-deriving anything from the grading runs.
    """

    __tablename__ = "student_grades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    class_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    student_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    # Per-câu scores as a JSON object: {"1": 5.0, "2": 4.0}.
    scores_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    # Optional link back to the grading run that produced this grade.
    run_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    graded_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    def to_dict(self) -> dict[str, Any]:
        try:
            scores = json.loads(self.scores_json or "{}")
        except (ValueError, TypeError):
            scores = {}
        return {
            "scores": scores,
            "total": float(self.total or 0.0),
            "run_id": self.run_id,
            "graded_at": self.graded_at.isoformat() if self.graded_at else None,
        }


class ClassStore:
    """SQLite-backed class + student roster store (multi-tenant)."""

    def __init__(self, db_dir: Path | None = None) -> None:
        if db_dir is None:
            db_dir = Path(__file__).resolve().parent.parent / "data"
        db_dir.mkdir(parents=True, exist_ok=True)
        db_path = db_dir / "hitl_mirror.db"
        self._engine = create_engine(
            f"sqlite:///{db_path}",
            connect_args={"check_same_thread": False},
        )

        # Same concurrency hardening as UserStore/MemoryManager — all engines
        # hit the same file, so every one must enable WAL + a busy timeout or
        # a class write racing a grading write would hit "database is locked".
        @event.listens_for(self._engine, "connect")
        def _set_sqlite_pragmas(dbapi_conn, _record):  # noqa: ANN001
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA busy_timeout=5000")
            cur.execute("PRAGMA synchronous=NORMAL")
            cur.close()

        Base.metadata.create_all(self._engine)
        self._SessionLocal = sessionmaker(bind=self._engine, expire_on_commit=False)

    def _session(self) -> Session:
        return self._SessionLocal()

    @staticmethod
    def _norm(value: str | None) -> str | None:
        value = (value or "").strip()
        return value or None

    # ---- classes ----------------------------------------------------------

    def create_class(self, name: str, note: str | None = None) -> dict[str, Any]:
        """Create a class owned by the current teacher. Raises on empty name."""
        name = (name or "").strip()
        if not name:
            raise ValueError("Tên lớp không được để trống.")
        uid = get_current_user_id()
        with self._session() as session:
            room = ClassRoom(user_id=uid, name=name, note=self._norm(note))
            session.add(room)
            session.commit()
            session.refresh(room)
            return room.to_dict(student_count=0)

    def list_classes(self) -> list[dict[str, Any]]:
        """All of the current teacher's classes, newest first, with counts."""
        uid = get_current_user_id()
        with self._session() as session:
            rooms = (
                session.query(ClassRoom)
                .filter(ClassRoom.user_id == uid)
                .order_by(ClassRoom.created_at.desc())
                .all()
            )
            counts = dict(
                session.query(Student.class_id, func.count(Student.id))
                .filter(Student.user_id == uid)
                .group_by(Student.class_id)
                .all()
            )
            return [r.to_dict(student_count=int(counts.get(r.id, 0))) for r in rooms]

    def get_class(self, class_id: int) -> dict[str, Any] | None:
        """One class scoped to the current teacher, or None if missing/foreign."""
        uid = get_current_user_id()
        with self._session() as session:
            room = session.get(ClassRoom, class_id)
            if room is None or room.user_id != uid:
                return None
            count = (
                session.query(func.count(Student.id))
                .filter(Student.class_id == class_id, Student.user_id == uid)
                .scalar()
            )
            return room.to_dict(student_count=int(count or 0))

    def update_class(
        self, class_id: int, name: str | None = None, note: str | None = None
    ) -> bool:
        uid = get_current_user_id()
        with self._session() as session:
            room = session.get(ClassRoom, class_id)
            if room is None or room.user_id != uid:
                return False
            if name is not None:
                trimmed = name.strip()
                if not trimmed:
                    raise ValueError("Tên lớp không được để trống.")
                room.name = trimmed
            if note is not None:
                room.note = self._norm(note)
            session.commit()
        return True

    def delete_class(self, class_id: int) -> bool:
        """Delete a class and its whole roster (manual cascade)."""
        uid = get_current_user_id()
        with self._session() as session:
            room = session.get(ClassRoom, class_id)
            if room is None or room.user_id != uid:
                return False
            session.query(StudentGrade).filter(
                StudentGrade.class_id == class_id, StudentGrade.user_id == uid
            ).delete()
            session.query(Student).filter(
                Student.class_id == class_id, Student.user_id == uid
            ).delete()
            session.delete(room)
            session.commit()
        return True

    # ---- students ---------------------------------------------------------

    def _owns_class(self, session: Session, class_id: int, uid: int) -> bool:
        room = session.get(ClassRoom, class_id)
        return room is not None and room.user_id == uid

    def _next_order(self, session: Session, class_id: int, uid: int) -> int:
        current = (
            session.query(func.max(Student.order_index))
            .filter(Student.class_id == class_id, Student.user_id == uid)
            .scalar()
        )
        return int(current) + 1 if current is not None else 0

    def add_student(
        self, class_id: int, full_name: str, student_code: str | None = None
    ) -> dict[str, Any] | None:
        """Add one student. Returns None if the class is missing/foreign."""
        full_name = (full_name or "").strip()
        if not full_name:
            raise ValueError("Họ tên học sinh không được để trống.")
        uid = get_current_user_id()
        with self._session() as session:
            if not self._owns_class(session, class_id, uid):
                return None
            student = Student(
                user_id=uid,
                class_id=class_id,
                full_name=full_name,
                student_code=self._norm(student_code),
                order_index=self._next_order(session, class_id, uid),
            )
            session.add(student)
            session.commit()
            session.refresh(student)
            return student.to_dict()

    def add_students_bulk(
        self, class_id: int, rows: list[dict[str, Any]]
    ) -> int | None:
        """Add many students at once (roster import). Blank names are skipped.

        Returns the number inserted, or None if the class is missing/foreign.
        """
        uid = get_current_user_id()
        with self._session() as session:
            if not self._owns_class(session, class_id, uid):
                return None
            order = self._next_order(session, class_id, uid)
            inserted = 0
            for row in rows:
                full_name = str(row.get("full_name") or "").strip()
                if not full_name:
                    continue
                session.add(
                    Student(
                        user_id=uid,
                        class_id=class_id,
                        full_name=full_name,
                        student_code=self._norm(row.get("student_code")),
                        order_index=order,
                    )
                )
                order += 1
                inserted += 1
            session.commit()
            return inserted

    def list_students(self, class_id: int) -> list[dict[str, Any]]:
        uid = get_current_user_id()
        with self._session() as session:
            students = (
                session.query(Student)
                .filter(Student.class_id == class_id, Student.user_id == uid)
                .order_by(Student.order_index.asc(), Student.id.asc())
                .all()
            )
            return [s.to_dict() for s in students]

    def update_student(
        self,
        student_id: int,
        full_name: str | None = None,
        student_code: str | None = None,
    ) -> bool:
        uid = get_current_user_id()
        with self._session() as session:
            student = session.get(Student, student_id)
            if student is None or student.user_id != uid:
                return False
            if full_name is not None:
                trimmed = full_name.strip()
                if not trimmed:
                    raise ValueError("Họ tên học sinh không được để trống.")
                student.full_name = trimmed
            if student_code is not None:
                student.student_code = self._norm(student_code)
            session.commit()
        return True

    def delete_student(self, student_id: int) -> bool:
        uid = get_current_user_id()
        with self._session() as session:
            student = session.get(Student, student_id)
            if student is None or student.user_id != uid:
                return False
            session.query(StudentGrade).filter(
                StudentGrade.student_id == student_id, StudentGrade.user_id == uid
            ).delete()
            session.delete(student)
            session.commit()
        return True

    # ---- grades / gradebook ----------------------------------------------

    def upsert_grade(
        self,
        student_id: int,
        scores: dict[Any, Any],
        run_id: int | None = None,
    ) -> dict[str, Any] | None:
        """Save/replace a student's current grade (total = sum of câu scores).

        Returns the stored grade dict, or None if the student is missing/foreign.
        One row per (user, student) — code-level upsert (sequential per-student
        grading makes a DB unique constraint unnecessary).
        """
        uid = get_current_user_id()
        clean: dict[str, float] = {}
        for k, v in (scores or {}).items():
            try:
                clean[str(int(k))] = round(float(v), 4)
            except (ValueError, TypeError):
                continue
        total = round(sum(clean.values()), 4)
        with self._session() as session:
            student = session.get(Student, student_id)
            if student is None or student.user_id != uid:
                return None
            row = (
                session.query(StudentGrade)
                .filter(
                    StudentGrade.user_id == uid,
                    StudentGrade.student_id == student_id,
                )
                .first()
            )
            if row is None:
                row = StudentGrade(
                    user_id=uid, class_id=student.class_id, student_id=student_id
                )
                session.add(row)
            row.scores_json = json.dumps(clean)
            row.total = total
            row.run_id = run_id
            row.graded_at = _utcnow()
            session.commit()
            session.refresh(row)
            return row.to_dict()

    def get_gradebook(self, class_id: int) -> list[dict[str, Any]] | None:
        """Roster + each student's current grade (``grade`` is None if ungraded).

        Returns None if the class is missing/foreign.
        """
        uid = get_current_user_id()
        with self._session() as session:
            room = session.get(ClassRoom, class_id)
            if room is None or room.user_id != uid:
                return None
            students = (
                session.query(Student)
                .filter(Student.class_id == class_id, Student.user_id == uid)
                .order_by(Student.order_index.asc(), Student.id.asc())
                .all()
            )
            grades = {
                g.student_id: g
                for g in session.query(StudentGrade)
                .filter(
                    StudentGrade.class_id == class_id, StudentGrade.user_id == uid
                )
                .all()
            }
            rows: list[dict[str, Any]] = []
            for s in students:
                entry = s.to_dict()
                g = grades.get(s.id)
                entry["grade"] = g.to_dict() if g else None
                rows.append(entry)
            return rows
