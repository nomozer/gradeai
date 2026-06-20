"""Unit tests for retrieval-time lesson de-duplication.

``_dedup_lessons_by_text`` is the pure helper behind the fix that stops a
duplicated correction from occupying several of the few ``top_k`` prompt slots
(score-DESC retrieval does NOT dedupe, so a repeated lesson would over-weight
itself). Pure — no Chroma/SQLite — so these stay fast like the other suites.
"""
from memory.store import _dedup_lessons_by_text


def _les(lesson_id: int, text: str, score: float) -> dict:
    return {"id": lesson_id, "lesson_text": text, "feedback_score": score}


class TestDedupLessonsByText:
    def test_drops_exact_duplicate_text(self):
        out = _dedup_lessons_by_text(
            [
                _les(1, "Tru 0.5d khi thieu don vi", 4.0),
                _les(2, "Tru 0.5d khi thieu don vi", 4.0),
                _les(3, "Cau 2 sai dau", 3.5),
            ],
            top_k=3,
        )
        assert [l["lesson_text"] for l in out] == [
            "Tru 0.5d khi thieu don vi",
            "Cau 2 sai dau",
        ]

    def test_preserves_first_seen_order(self):
        out = _dedup_lessons_by_text(
            [_les(1, "A", 3.0), _les(2, "B", 3.0), _les(3, "C", 3.0)], top_k=3
        )
        assert [l["lesson_text"] for l in out] == ["A", "B", "C"]

    def test_caps_to_top_k_distinct(self):
        out = _dedup_lessons_by_text(
            [_les(i, f"L{i}", 3.0) for i in range(6)], top_k=3
        )
        assert [l["lesson_text"] for l in out] == ["L0", "L1", "L2"]

    def test_duplicate_does_not_consume_a_slot(self):
        # Two copies of A + B + C, top_k=3 must yield A,B,C — NOT A,A,B.
        out = _dedup_lessons_by_text(
            [
                _les(1, "A", 4.0),
                _les(2, "A", 4.0),
                _les(3, "B", 3.5),
                _les(4, "C", 3.0),
            ],
            top_k=3,
        )
        assert [l["lesson_text"] for l in out] == ["A", "B", "C"]

    def test_keeps_highest_score_copy(self):
        out = _dedup_lessons_by_text([_les(1, "A", 3.0), _les(2, "A", 4.0)], top_k=3)
        assert len(out) == 1
        assert out[0]["id"] == 2 and out[0]["feedback_score"] == 4.0

    def test_blank_text_not_merged(self):
        out = _dedup_lessons_by_text([_les(1, "", 3.0), _les(2, "", 3.0)], top_k=3)
        assert len(out) == 2

    def test_empty_input(self):
        assert _dedup_lessons_by_text([], top_k=3) == []
