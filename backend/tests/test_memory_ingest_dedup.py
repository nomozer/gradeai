"""Integration test: save_lesson de-dupes identical corrections at INGEST.

Stops the lesson corpus from growing a new row + Chroma vector every time the
same correction is saved (re-finalize outside the 300 s window, re-grading a
task, the same mistake across students). Uses a throwaway MemoryManager on a
tmp dir (real SQLite + Chroma); ``gc`` at the end releases Chroma's file handles
so Windows can clean the tmp dir.
"""
import gc

from memory.store import Lesson, MemoryManager


def test_identical_correction_reuses_row(tmp_path):
    mm = MemoryManager(db_dir=tmp_path)
    try:
        a = mm.save_lesson(task="T1", wrong_code="", correct_code="",
                           lesson_text="L", feedback_score=4.0)
        b = mm.save_lesson(task="T1", wrong_code="", correct_code="",
                           lesson_text="L", feedback_score=4.0)
        assert a == b, "identical correction must reuse the same row (no bloat)"

        # Different text → new row.
        c = mm.save_lesson(task="T1", wrong_code="", correct_code="",
                           lesson_text="L2", feedback_score=4.0)
        assert c != a

        # Same text but different score = different priority signal → kept apart.
        d = mm.save_lesson(task="T1", wrong_code="", correct_code="",
                           lesson_text="L", feedback_score=5.0)
        assert d != a

        # Same text+score, different task → different lesson → new row.
        e = mm.save_lesson(task="T2", wrong_code="", correct_code="",
                           lesson_text="L", feedback_score=4.0)
        assert e != a

        with mm._get_session() as s:
            assert s.query(Lesson).count() == 4  # a, c, d, e — the dup of `a` didn't add one
    finally:
        del mm
        gc.collect()


def test_dedup_backfills_empty_correct_code(tmp_path):
    mm = MemoryManager(db_dir=tmp_path)
    try:
        a = mm.save_lesson(task="T", wrong_code="", correct_code="",
                           lesson_text="L", feedback_score=4.0)
        # Re-save the same lesson, now carrying correct_code → enrich, not insert.
        b = mm.save_lesson(task="T", wrong_code="", correct_code='{"x":1}',
                           lesson_text="L", feedback_score=4.0)
        assert a == b
        with mm._get_session() as s:
            row = s.get(Lesson, a)
            assert row.correct_code == '{"x":1}'
            assert s.query(Lesson).count() == 1
    finally:
        del mm
        gc.collect()
