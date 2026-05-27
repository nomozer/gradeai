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
    RUBRIC_KEYS,
    compute_per_question_deltas,
    compute_score_deltas,
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


class TestComputeScoreDeltas:
    def test_only_above_threshold_kept(self):
        ai = {"content": 8.0, "argument": 7.5, "expression": 9.0, "creativity": 6.0}
        teacher = {
            "content": 8.3,    # delta 0.3 — kept (≥ 0.25)
            "argument": 7.6,   # delta 0.1 — filtered
            "expression": 9.0, # delta 0.0 — filtered
            "creativity": 6.5, # delta 0.5 — kept
        }
        out = compute_score_deltas(ai, teacher, threshold=0.25)
        assert out == {"content": 0.3, "creativity": 0.5}

    def test_negative_deltas_pass_threshold(self):
        # abs() in the filter — teacher rating lower than AI is still a signal.
        ai = {"content": 9.0, "argument": 8.0, "expression": 7.0, "creativity": 6.0}
        teacher = {"content": 8.0, "argument": 8.0, "expression": 7.0, "creativity": 6.0}
        out = compute_score_deltas(ai, teacher, threshold=0.25)
        assert out == {"content": -1.0}

    def test_threshold_boundary_inclusive(self):
        # |delta| == threshold is KEPT (`>=` semantics). Note that
        # safe_delta ROUNDS to 2 decimals BEFORE filtering, so a teacher
        # score of 7.249 rounds to 0.25 and slips through — use clearly
        # sub-threshold values (0.20) to test the negative case.
        ai = {"content": 7.0, "argument": 7.0, "expression": 7.0, "creativity": 7.0}
        teacher = {
            "content": 7.25,    # delta 0.25 — kept exactly at boundary
            "argument": 7.20,   # delta 0.20 — filtered, well below threshold
            "expression": 7.0,
            "creativity": 7.0,
        }
        out = compute_score_deltas(ai, teacher, threshold=0.25)
        assert "content" in out
        assert "argument" not in out

    def test_missing_rubric_key_skipped(self):
        # Pydantic envelopes guarantee 4 keys, but defensive code keeps the
        # contract: missing → safe_delta(None,_) → None → skipped.
        ai = {"content": 8.0}  # only one key
        teacher = {"content": 8.0, "argument": 9.0}
        out = compute_score_deltas(ai, teacher, threshold=0.25)
        assert out == {}

    def test_only_iterates_rubric_keys(self):
        # Extra keys in either map are ignored — RUBRIC_KEYS is the
        # authoritative list (matches the prompt rubric).
        ai = dict.fromkeys(RUBRIC_KEYS, 7.0) | {"extra_bogus_key": 3.0}
        teacher = dict.fromkeys(RUBRIC_KEYS, 7.0) | {"extra_bogus_key": 9.0}
        out = compute_score_deltas(ai, teacher, threshold=0.1)
        assert "extra_bogus_key" not in out


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
            ai_scores={},
            teacher_scores={},
            rubric_deltas={},
        )
        assert "Tổng điểm" in out
        assert "AI chấm 9.0" in out
        assert "giảm" in out  # negative delta → "giảm"
        assert "8.0" in out
        # Always ends with the imperative call to use this as future
        # retrieval guidance.
        assert out.rstrip().endswith("khớp với chuẩn chấm của giáo viên.")

    def test_overall_below_threshold_skipped(self):
        # The function uses 0.1 as the overall threshold INSIDE the formatter.
        # This is independent of the per-rubric threshold the caller passed
        # to compute_score_deltas; encodes the same 0.10 cutoff as main.py.
        out = format_delta_lesson(
            ai_overall=8.0,
            teacher_overall=8.05,  # delta 0.05 < 0.1
            overall_delta=0.05,
            ai_scores={},
            teacher_scores={},
            rubric_deltas={},
        )
        assert "Tổng điểm" not in out

    def test_rubric_lines_use_nâng_for_positive(self):
        out = format_delta_lesson(
            ai_overall=None,
            teacher_overall=None,
            overall_delta=None,
            ai_scores={"content": 7.0},
            teacher_scores={"content": 8.0},
            rubric_deltas={"content": 1.0},
        )
        assert "nâng" in out
        assert "hạ" not in out

    def test_rubric_lines_use_hạ_for_negative(self):
        out = format_delta_lesson(
            ai_overall=None,
            teacher_overall=None,
            overall_delta=None,
            ai_scores={"argument": 9.0},
            teacher_scores={"argument": 7.5},
            rubric_deltas={"argument": -1.5},
        )
        assert "hạ" in out

    def test_per_cau_sorted_numerically(self):
        # Without numeric sort, "10" would land between "1" and "2"
        # lexicographically. Verify "1" → "2" → "10" ordering.
        out = format_delta_lesson(
            ai_overall=None,
            teacher_overall=None,
            overall_delta=None,
            ai_scores={},
            teacher_scores={},
            rubric_deltas={},
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
        # whole per-câu section (still emits rubric / overall lines).
        out = format_delta_lesson(
            ai_overall=8.0,
            teacher_overall=7.0,
            overall_delta=-1.0,
            ai_scores={},
            teacher_scores={},
            rubric_deltas={},
            per_question_deltas={"1": -1.0},
            ai_per_question=None,        # missing one of the trio
            teacher_per_question={"1": 4.0},
        )
        assert "Câu 1" not in out
        assert "Tổng điểm" in out

    def test_combined_axes_produce_single_string(self):
        # The whole point of this formatter: rubric + per-câu fold into ONE
        # lesson so retrieval doesn't double-count a single correction.
        out = format_delta_lesson(
            ai_overall=9.0,
            teacher_overall=7.5,
            overall_delta=-1.5,
            ai_scores={"content": 9.0},
            teacher_scores={"content": 7.5},
            rubric_deltas={"content": -1.5},
            ai_per_question={"1": 5.0},
            teacher_per_question={"1": 3.5},
            per_question_deltas={"1": -1.5},
        )
        # One contiguous lesson — not three.
        assert out.count("Hiệu chỉnh điểm") == 1
        assert "Tổng điểm" in out
        assert "content" in out
        assert "Câu 1" in out
