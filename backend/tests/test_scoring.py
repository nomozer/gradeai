"""
Tests for grading/scoring.py — score-delta utilities used by /api/finalize-grade.

Locks down:
  - safe_delta arithmetic + None handling
  - threshold filtering for per-rubric AND per-câu deltas
  - lesson rendering combining both axes into a single string
  - sorting of câu keys (numeric, "10" after "2")

These are pure functions — no fixtures needed, no Gemini calls, fast.
"""

from grading.scoring import (
    compute_per_question_deltas,
    compute_per_step_deltas,
    format_delta_lesson,
    safe_delta,
)


class TestSafeDelta:
    def test_basic_subtraction(self):
        assert safe_delta(7.0, 8.5) == 1.5
        assert safe_delta(8.0, 6.5) == -1.5

    def test_returns_zero_for_equal(self):
        assert safe_delta(5.0, 5.0) == 0.0

    def test_rounds_to_two_decimals(self):
        # 8.345 - 7.123 = 1.222 → 1.22
        assert safe_delta(7.123, 8.345) == 1.22

    def test_none_inputs_return_none(self):
        assert safe_delta(None, 5.0) is None
        assert safe_delta(5.0, None) is None
        assert safe_delta(None, None) is None

    def test_string_inputs_coerced(self):
        # safe_delta uses float() so numeric strings work.
        assert safe_delta("7", "8.5") == 1.5

    def test_non_numeric_string_returns_none(self):
        assert safe_delta("oops", 5.0) is None


class TestComputePerQuestionDeltas:
    def test_basic(self):
        ai = {"1": 5.0, "2": 4.5, "3": 6.0}
        teacher = {"1": 5.0, "2": 5.0, "3": 4.5}  # câu 2 +0.5, câu 3 −1.5
        out = compute_per_question_deltas(ai, teacher, threshold=0.25)
        assert out == {"2": 0.5, "3": -1.5}

    def test_iterates_ai_keys_not_teacher(self):
        # Teacher may have stale câu numbers from an old grade; AI map is
        # authoritative (it emits every câu it graded this round).
        ai = {"1": 5.0, "2": 5.0}
        teacher = {"1": 5.0, "2": 5.0, "99": 100.0}
        out = compute_per_question_deltas(ai, teacher, threshold=0.25)
        assert "99" not in out

    def test_empty_or_none_short_circuits(self):
        assert compute_per_question_deltas(None, {"1": 5.0}, 0.25) == {}
        assert compute_per_question_deltas({"1": 5.0}, None, 0.25) == {}
        assert compute_per_question_deltas({}, {"1": 5.0}, 0.25) == {}

    def test_missing_teacher_key_filtered(self):
        # teacher didn't override câu 2 — safe_delta returns None → skipped.
        ai = {"1": 5.0, "2": 4.0}
        teacher = {"1": 5.5}
        out = compute_per_question_deltas(ai, teacher, threshold=0.25)
        assert out == {"1": 0.5}


class TestFormatDeltaLesson:
    def test_overall_only(self):
        out = format_delta_lesson(
            ai_overall=9.0,
            teacher_overall=8.0,
            overall_delta=-1.0,
        )
        assert "Tổng điểm" in out
        assert "AI chấm 9.0" in out
        assert "giảm" in out  # negative delta → "giảm"
        assert "8.0" in out
        # Always ends with the imperative call to use this as future
        # retrieval guidance.
        assert out.rstrip().endswith("khớp với chuẩn chấm của giáo viên.")

    def test_overall_below_threshold_skipped(self):
        # The function uses 0.1 as the overall threshold INSIDE the formatter
        # — independent of the per-câu / per-step thresholds the caller
        # passed. Encodes the same 0.10 cutoff as the API handler.
        out = format_delta_lesson(
            ai_overall=8.0,
            teacher_overall=8.05,  # delta 0.05 < 0.1
            overall_delta=0.05,
        )
        assert "Tổng điểm" not in out

    def test_per_cau_uses_nâng_for_positive(self):
        out = format_delta_lesson(
            ai_overall=None,
            teacher_overall=None,
            overall_delta=None,
            ai_per_question={"1": 5.0},
            teacher_per_question={"1": 6.0},
            per_question_deltas={"1": 1.0},
        )
        assert "nâng" in out
        assert "hạ" not in out

    def test_per_cau_uses_hạ_for_negative(self):
        out = format_delta_lesson(
            ai_overall=None,
            teacher_overall=None,
            overall_delta=None,
            ai_per_question={"1": 9.0},
            teacher_per_question={"1": 7.5},
            per_question_deltas={"1": -1.5},
        )
        assert "hạ" in out

    def test_per_cau_sorted_numerically(self):
        # Without numeric sort, "10" would land between "1" and "2"
        # lexicographically. Verify "1" → "2" → "10" ordering.
        out = format_delta_lesson(
            ai_overall=None,
            teacher_overall=None,
            overall_delta=None,
            ai_per_question={"1": 5.0, "2": 5.0, "10": 5.0},
            teacher_per_question={"1": 4.0, "2": 4.0, "10": 4.0},
            per_question_deltas={"1": -1.0, "2": -1.0, "10": -1.0},
        )
        idx_1 = out.index("Câu 1:")
        idx_2 = out.index("Câu 2:")
        idx_10 = out.index("Câu 10:")
        assert idx_1 < idx_2 < idx_10

    def test_per_cau_skipped_when_partial(self):
        # Per-câu block requires ALL THREE maps; missing any one drops the
        # whole per-câu section (still emits overall line).
        out = format_delta_lesson(
            ai_overall=8.0,
            teacher_overall=7.0,
            overall_delta=-1.0,
            per_question_deltas={"1": -1.0},
            ai_per_question=None,        # missing one of the trio
            teacher_per_question={"1": 4.0},
        )
        assert "Câu 1" not in out
        assert "Tổng điểm" in out

    def test_combined_axes_produce_single_string(self):
        # Per-câu + overall fold into ONE lesson so retrieval doesn't
        # double-count a single correction.
        out = format_delta_lesson(
            ai_overall=9.0,
            teacher_overall=7.5,
            overall_delta=-1.5,
            ai_per_question={"1": 5.0},
            teacher_per_question={"1": 3.5},
            per_question_deltas={"1": -1.5},
        )
        # One contiguous lesson, not two.
        assert out.count("Hiệu chỉnh điểm") == 1
        assert "Tổng điểm" in out
        assert "Câu 1" in out

    def test_per_step_block_renders_under_câu(self):
        # Pattern B per-step axis: each câu's criterion deltas nest as
        # indented bullets under the lesson body. Verifies the formatter
        # walks per_step_deltas correctly and includes labels verbatim.
        out = format_delta_lesson(
            ai_overall=None,
            teacher_overall=None,
            overall_delta=None,
            ai_per_step={"1": {"Đặt vấn đề": 1.0, "Kết quả": 2.5}},
            teacher_per_step={"1": {"Đặt vấn đề": 0.5, "Kết quả": 1.5}},
            per_step_deltas={"1": {"Đặt vấn đề": -0.5, "Kết quả": -1.0}},
        )
        assert "Câu 1 → Đặt vấn đề" in out
        assert "Câu 1 → Kết quả" in out
        # Both should use "hạ" (negative deltas).
        assert out.count("hạ") == 2


class TestComputePerStepDeltas:
    def test_basic(self):
        ai = {
            "1": {"Đặt vấn đề": 1.0, "Biến đổi": 1.5, "Kết quả": 0.5},
            "2": {"Đặt vấn đề": 1.0},
        }
        teacher = {
            "1": {"Đặt vấn đề": 0.5, "Biến đổi": 1.5, "Kết quả": 0.0},
            "2": {"Đặt vấn đề": 1.0},  # no delta
        }
        out = compute_per_step_deltas(ai, teacher, threshold=0.15)
        # Câu 1: "Đặt vấn đề" −0.5 and "Kết quả" −0.5 both above 0.15. "Biến đổi" 0 dropped.
        # Câu 2: nothing crosses threshold → câu dropped entirely.
        assert out == {"1": {"Đặt vấn đề": -0.5, "Kết quả": -0.5}}

    def test_threshold_filters_small_deltas(self):
        ai = {"1": {"Step": 1.0}}
        teacher = {"1": {"Step": 1.1}}  # delta 0.1, below 0.15
        assert compute_per_step_deltas(ai, teacher, threshold=0.15) == {}

    def test_empty_inputs(self):
        assert compute_per_step_deltas(None, {"1": {"Step": 1.0}}, 0.15) == {}
        assert compute_per_step_deltas({"1": {"Step": 1.0}}, None, 0.15) == {}
        assert compute_per_step_deltas({}, {}, 0.15) == {}

    def test_missing_câu_in_teacher_skipped(self):
        ai = {"1": {"Step": 1.0}, "2": {"Step": 1.0}}
        teacher = {"1": {"Step": 0.0}}
        out = compute_per_step_deltas(ai, teacher, threshold=0.15)
        assert "2" not in out
        assert out["1"]["Step"] == -1.0

    def test_missing_label_in_teacher_câu_filtered(self):
        # Teacher câu present but label missing → safe_delta None → drop label
        # but keep the câu if other labels qualify.
        ai = {"1": {"A": 1.0, "B": 1.0}}
        teacher = {"1": {"A": 0.0}}  # B missing
        out = compute_per_step_deltas(ai, teacher, threshold=0.15)
        assert out == {"1": {"A": -1.0}}

    def test_empty_câu_dropped(self):
        # All labels in a câu below threshold → câu dropped (no empty dict).
        ai = {"1": {"A": 1.0, "B": 1.0}}
        teacher = {"1": {"A": 1.0, "B": 1.05}}
        out = compute_per_step_deltas(ai, teacher, threshold=0.15)
        assert out == {}
