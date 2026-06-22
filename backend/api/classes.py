"""
classes.py — Class (lớp) + student roster endpoints.

A teacher creates classes and fills each with a student roster; later stages
link graded papers to students so the class gradebook can be assembled and
exported. Pure persistence here — no grading, no Gemini.

Every handler depends on ``get_current_user`` which both requires a valid
session AND binds the per-request ``user_id`` ContextVar that ClassStore reads
internally to scope all rows to the owning teacher (same multi-tenant idiom as
the memory/history routers).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.auth import get_current_user
from classes import ClassStore

router = APIRouter(prefix="/api/classes", tags=["classes"])

_store: ClassStore | None = None


def attach_classes(store: ClassStore) -> None:
    global _store
    _store = store


def _require_store() -> ClassStore:
    if _store is None:
        raise HTTPException(status_code=500, detail="Class store not attached")
    return _store


# ---- schemas --------------------------------------------------------------


class ClassCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    note: str | None = Field(default=None, max_length=500)


class ClassUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=500)


class StudentCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    student_code: str | None = Field(default=None, max_length=60)


class StudentBulkRow(BaseModel):
    full_name: str = Field(max_length=120)
    student_code: str | None = Field(default=None, max_length=60)


class StudentBulkCreate(BaseModel):
    students: list[StudentBulkRow] = Field(default_factory=list, max_length=1000)


class StudentUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=120)
    student_code: str | None = Field(default=None, max_length=60)


class GradeUpsert(BaseModel):
    # Per-câu scores keyed by câu number: {"1": 5.0, "2": 4.0}. Total is
    # derived server-side as the sum, matching "overall = sum of per-câu".
    scores: dict[int, float] = Field(default_factory=dict)
    run_id: int | None = None


# ---- classes --------------------------------------------------------------


@router.get("")
def list_classes(_user: dict = Depends(get_current_user)):
    return {"classes": _require_store().list_classes()}


@router.post("")
def create_class(body: ClassCreate, _user: dict = Depends(get_current_user)):
    try:
        return _require_store().create_class(body.name, body.note)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{class_id}")
def get_class(class_id: int, _user: dict = Depends(get_current_user)):
    room = _require_store().get_class(class_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy lớp.")
    return room


@router.patch("/{class_id}")
def update_class(
    class_id: int, body: ClassUpdate, _user: dict = Depends(get_current_user)
):
    try:
        ok = _require_store().update_class(class_id, body.name, body.note)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not ok:
        raise HTTPException(status_code=404, detail="Không tìm thấy lớp.")
    return {"ok": True}


@router.delete("/{class_id}")
def delete_class(class_id: int, _user: dict = Depends(get_current_user)):
    if not _require_store().delete_class(class_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy lớp.")
    return {"ok": True}


# ---- students -------------------------------------------------------------


@router.get("/{class_id}/students")
def list_students(class_id: int, _user: dict = Depends(get_current_user)):
    store = _require_store()
    if store.get_class(class_id) is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy lớp.")
    return {"students": store.list_students(class_id)}


@router.post("/{class_id}/students")
def add_student(
    class_id: int, body: StudentCreate, _user: dict = Depends(get_current_user)
):
    try:
        student = _require_store().add_student(
            class_id, body.full_name, body.student_code
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if student is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy lớp.")
    return student


@router.post("/{class_id}/students/bulk")
def add_students_bulk(
    class_id: int, body: StudentBulkCreate, _user: dict = Depends(get_current_user)
):
    inserted = _require_store().add_students_bulk(
        class_id, [r.model_dump() for r in body.students]
    )
    if inserted is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy lớp.")
    return {"inserted": inserted}


@router.patch("/students/{student_id}")
def update_student(
    student_id: int, body: StudentUpdate, _user: dict = Depends(get_current_user)
):
    try:
        ok = _require_store().update_student(
            student_id, body.full_name, body.student_code
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not ok:
        raise HTTPException(status_code=404, detail="Không tìm thấy học sinh.")
    return {"ok": True}


@router.delete("/students/{student_id}")
def delete_student(student_id: int, _user: dict = Depends(get_current_user)):
    if not _require_store().delete_student(student_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy học sinh.")
    return {"ok": True}


# ---- gradebook ------------------------------------------------------------


@router.get("/{class_id}/gradebook")
def get_gradebook(class_id: int, _user: dict = Depends(get_current_user)):
    rows = _require_store().get_gradebook(class_id)
    if rows is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy lớp.")
    return {"students": rows}


@router.put("/students/{student_id}/grade")
def upsert_grade(
    student_id: int, body: GradeUpsert, _user: dict = Depends(get_current_user)
):
    grade = _require_store().upsert_grade(student_id, body.scores, body.run_id)
    if grade is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy học sinh.")
    return grade
