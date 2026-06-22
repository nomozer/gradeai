import pytest

from classes import ClassStore
from request_context import current_user_id


@pytest.fixture
def store(tmp_path):
    return ClassStore(db_dir=tmp_path)


def _as_user(uid: int):
    """Bind the request-scoped user id (what the auth dependency does live)."""
    return current_user_id.set(uid)


def test_create_list_get_class_with_student_count(store):
    token = _as_user(1)
    try:
        created = store.create_class("Lớp 10A", note="Toán giữa kỳ")
        assert created["name"] == "Lớp 10A"
        assert created["student_count"] == 0

        store.add_student(created["id"], "Nguyễn Văn An")
        store.add_student(created["id"], "Trần Thị Bình")

        listed = store.list_classes()
        assert len(listed) == 1
        assert listed[0]["student_count"] == 2

        fetched = store.get_class(created["id"])
        assert fetched["student_count"] == 2
    finally:
        current_user_id.reset(token)


def test_create_class_rejects_blank_name(store):
    token = _as_user(1)
    try:
        with pytest.raises(ValueError):
            store.create_class("   ")
    finally:
        current_user_id.reset(token)


def test_students_keep_roster_order_and_bulk_skips_blanks(store):
    token = _as_user(1)
    try:
        cls = store.create_class("10A")
        store.add_student(cls["id"], "An")
        inserted = store.add_students_bulk(
            cls["id"],
            [
                {"full_name": "Bình", "student_code": "002"},
                {"full_name": "   "},  # blank → skipped
                {"full_name": "Cường"},
            ],
        )
        assert inserted == 2

        names = [s["full_name"] for s in store.list_students(cls["id"])]
        assert names == ["An", "Bình", "Cường"]
    finally:
        current_user_id.reset(token)


def test_update_and_delete_student(store):
    token = _as_user(1)
    try:
        cls = store.create_class("10A")
        s = store.add_student(cls["id"], "An")

        assert store.update_student(s["id"], full_name="An Nguyễn", student_code="001")
        assert store.list_students(cls["id"])[0]["full_name"] == "An Nguyễn"

        assert store.delete_student(s["id"])
        assert store.list_students(cls["id"]) == []
    finally:
        current_user_id.reset(token)


def test_delete_class_cascades_students(store):
    token = _as_user(1)
    try:
        cls = store.create_class("10A")
        store.add_student(cls["id"], "An")
        assert store.delete_class(cls["id"])
        assert store.list_classes() == []
        # Roster is gone too, not orphaned.
        assert store.list_students(cls["id"]) == []
    finally:
        current_user_id.reset(token)


def test_multi_tenant_isolation(store):
    # Teacher 1 owns a class with a roster.
    t1 = _as_user(1)
    try:
        cls = store.create_class("Lớp của GV1")
        store.add_student(cls["id"], "An")
    finally:
        current_user_id.reset(t1)

    # Teacher 2 sees none of it and cannot reach into it.
    t2 = _as_user(2)
    try:
        assert store.list_classes() == []
        assert store.get_class(cls["id"]) is None
        assert store.list_students(cls["id"]) == []
        # Adding a student to a foreign class is refused (None ⇒ 404 upstream).
        assert store.add_student(cls["id"], "Kẻ lạ") is None
        assert store.add_students_bulk(cls["id"], [{"full_name": "X"}]) is None
        assert store.update_class(cls["id"], name="Đổi tên") is False
        assert store.delete_class(cls["id"]) is False
    finally:
        current_user_id.reset(t2)

    # Teacher 1's data is intact.
    t1b = _as_user(1)
    try:
        assert len(store.list_classes()) == 1
        assert [s["full_name"] for s in store.list_students(cls["id"])] == ["An"]
    finally:
        current_user_id.reset(t1b)
