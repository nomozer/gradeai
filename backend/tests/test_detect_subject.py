"""
Tests for prompts/__init__.py — subject detection logic.

Locks down the behaviour that motivated the score-based rewrite (per
docstring + CLAUDE.md):
  - explicit hint always wins when known
  - UI prefix "Môn Tin · Lớp 10 · …" doesn't bias toward CS
  - score-based counting (not first-match-wins)
  - tie-break priority chem > bio > phys > math > cs
  - empty / no-signal text falls back to DEFAULT_SUBJECT
"""

from prompts import (
    DEFAULT_SUBJECT,
    GRADER_SYSTEM,
    detect_subject,
    pick_top_subject,
    score_subjects,
)


class TestDetectSubjectHint:
    def test_known_hint_wins_over_keywords(self):
        # Body screams math, but hint=cs should still win — explicit
        # frontend choice trumps detection.
        task = "phương trình bậc hai có nghiệm khi delta dương"
        assert detect_subject(task, hint="cs") == "cs"

    def test_unknown_hint_falls_through_to_detection(self):
        task = "phương trình bậc hai"
        assert detect_subject(task, hint="bogus") == "math"

    def test_none_hint_falls_through(self):
        task = "tế bào nhân thực có nhiễm sắc thể"
        assert detect_subject(task, hint=None) == "bio"


class TestScoreSubjects:
    def test_counts_distinct_keywords(self):
        # "phương trình" + "đại số" + "chứng minh" = 3 math hits
        scores = score_subjects("Chứng minh phương trình đại số")
        assert scores["math"] >= 3

    def test_ui_prefix_stripped_before_scoring(self):
        # CLAUDE.md scenario: UI prefix "Môn Tin · …" used to free-point
        # CS. After strip, the math body wins.
        scores = score_subjects("Môn Tin · ĐỀ TOÁN: phương trình bậc 2 đại số")
        assert scores["math"] > scores["cs"]

    def test_ui_prefix_legacy_with_lop_stripped(self):
        # Older history rows: "Môn Tin · Lớp 10 · …"
        scores = score_subjects("Môn Tin · Lớp 10 · phương trình đại số")
        assert scores["math"] > scores["cs"]

    def test_empty_text_zero_scores(self):
        scores = score_subjects("")
        assert all(v == 0 for v in scores.values())

    def test_returns_all_subject_keys(self):
        scores = score_subjects("nothing relevant here just plain text")
        assert set(scores.keys()) == set(GRADER_SYSTEM.keys())


class TestPickTopSubject:
    def test_clear_winner(self):
        code, score = pick_top_subject({"math": 5, "cs": 1, "phys": 0, "chem": 0, "bio": 0})
        assert code == "math"
        assert score == 5

    def test_all_zero_returns_default(self):
        code, score = pick_top_subject({"math": 0, "cs": 0, "phys": 0, "chem": 0, "bio": 0})
        assert code == DEFAULT_SUBJECT
        assert score == 0

    def test_tie_uses_priority_chem_first(self):
        # chem and bio tied → chem wins per _TIE_PRIORITY = ("chem","bio",...)
        code, _ = pick_top_subject({"math": 0, "cs": 0, "phys": 0, "chem": 3, "bio": 3})
        assert code == "chem"

    def test_tie_chem_beats_math(self):
        # When chem ties with math (less-specific), specific wins.
        code, _ = pick_top_subject({"math": 4, "cs": 0, "phys": 0, "chem": 4, "bio": 0})
        assert code == "chem"

    def test_tie_phys_beats_math(self):
        # phys (specific science vocab) beats math when tied.
        code, _ = pick_top_subject({"math": 2, "cs": 0, "phys": 2, "chem": 0, "bio": 0})
        assert code == "phys"

    def test_math_beats_cs_when_tied(self):
        # math (specific-ish) beats cs (the generic catch-all default).
        code, _ = pick_top_subject({"math": 2, "cs": 2, "phys": 0, "chem": 0, "bio": 0})
        assert code == "math"


class TestDetectSubjectIntegration:
    def test_math_body(self):
        text = "Cho phương trình đại số. Chứng minh hình học rằng tam giác cân."
        assert detect_subject(text) == "math"

    def test_chem_body(self):
        text = "Cân bằng phản ứng oxi hoá khử. Tính nồng độ mol dung dịch axit."
        assert detect_subject(text) == "chem"

    def test_bio_body(self):
        text = "Tế bào nhân thực có nhiễm sắc thể. Quá trình phiên mã, dịch mã ADN."
        assert detect_subject(text) == "bio"

    def test_phys_body(self):
        text = "Định luật Newton về lực và gia tốc. Tính động lượng và năng lượng."
        assert detect_subject(text) == "phys"

    def test_cs_body(self):
        text = "Viết thuật toán lập trình Python với vòng lặp và kiểu dữ liệu mảng."
        assert detect_subject(text) == "cs"

    def test_ui_prefix_does_not_force_cs(self):
        # The headline regression test: a CS UI tag with a math body must
        # still route to math.
        text = "Môn Tin · Lớp 10 · ĐỀ TOÁN: phương trình bậc 2, chứng minh đại số."
        assert detect_subject(text) == "math"

    def test_empty_task_returns_default(self):
        assert detect_subject("") == DEFAULT_SUBJECT

    def test_no_keyword_match_returns_default(self):
        assert detect_subject("Lorem ipsum dolor sit amet") == DEFAULT_SUBJECT

    def test_returned_subject_always_in_grader_system(self):
        # Whatever detect_subject returns must be a valid GRADER_SYSTEM key.
        for task in ["", "math", "Môn Tin", "tế bào", "axit", "lực", "gibberish"]:
            assert detect_subject(task) in GRADER_SYSTEM
