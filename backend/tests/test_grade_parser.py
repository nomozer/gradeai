"""
Tests for grading/grade_parser.py — defensive parsing of Gemini output.

Locks down the failure modes the module exists to handle:
  - markdown-fenced JSON (```json … ```)
  - truncated JSON (unfinished string / missing brackets)
  - completely unparseable output → regex salvage path
  - soft truncation (parseable JSON but missing required fields)
  - comment-analysis fallback when model under-delivers
  - is_meaningful_text word-count guards (the "Đúng," failure mode)
"""

import json

from grading.grade_parser import (
    ANALYZE_COMMENT_FALLBACK,
    fallback_comment_analysis,
    is_meaningful_text,
    parse_comment_analysis,
    parse_grade_json,
)


# ---------------------------------------------------------------------------
# parse_grade_json — the Grader envelope
# ---------------------------------------------------------------------------


def _complete_grade(**overrides) -> dict:
    """Build a complete grade envelope; overrides patch specific fields.

    Pattern B envelope: no global ``scores`` field — ``overall`` is the
    only top-level score; rubric breakdown lives in per_question_feedback
    criteria.
    """
    base = {
        "transcript": "Câu 1: Lời giải đúng.",
        "overall": 7.75,
        "comment": "Bài làm tốt.",
        "per_question_feedback": [
            {"question": "Câu 1", "score": 5.0, "max_points": 5.0},
        ],
    }
    base.update(overrides)
    return base


class TestParseGradeJsonHappyPath:
    def test_plain_json(self):
        out = parse_grade_json(json.dumps(_complete_grade()))
        assert out["overall"] == 7.75
        assert out.get("salvaged") is not True

    def test_markdown_fenced_json(self):
        text = "```json\n" + json.dumps(_complete_grade()) + "\n```"
        out = parse_grade_json(text)
        assert out["overall"] == 7.75
        assert out.get("salvaged") is not True

    def test_bare_fence_no_lang(self):
        text = "```\n" + json.dumps(_complete_grade()) + "\n```"
        out = parse_grade_json(text)
        assert out["overall"] == 7.75


class TestParseGradeJsonSoftTruncation:
    def test_missing_overall_flagged_salvaged(self):
        bad = _complete_grade()
        del bad["overall"]
        out = parse_grade_json(json.dumps(bad))
        assert out["salvaged"] is True
        # Default supplied so UI doesn't crash on null arithmetic.
        assert out["overall"] == 0

    def test_missing_per_question_feedback_defaulted(self):
        bad = _complete_grade()
        del bad["per_question_feedback"]
        out = parse_grade_json(json.dumps(bad))
        assert out["salvaged"] is True
        assert out["per_question_feedback"] == []

    def test_salvage_note_appended_to_weaknesses(self):
        bad = _complete_grade()
        del bad["comment"]
        out = parse_grade_json(json.dumps(bad))
        assert out["salvaged"] is True
        assert any("cắt giữa chừng" in w for w in out["weaknesses"])


class TestParseGradeJsonHardFailure:
    def test_total_garbage_returns_default_envelope(self):
        out = parse_grade_json("this is not JSON at all")
        assert out["salvaged"] is True
        assert out["overall"] == 0
        assert out["per_question_feedback"] == []
        assert isinstance(out["weaknesses"], list)

    def test_truncated_mid_string_repaired(self):
        # Gemini cuts off mid-value. _repair_truncated_json closes the
        # string + braces so it parses, then soft-truncation defaults
        # fill the missing required fields.
        text = '{"transcript": "Câu 1: lời giả'
        out = parse_grade_json(text)
        assert out["transcript"].startswith("Câu 1")
        assert out["salvaged"] is True

    def test_regex_salvage_pulls_transcript_when_unparseable(self):
        # JSON so broken not even truncation repair recovers it — regex
        # still extracts the transcript field directly.
        text = '{"transcript": "Câu 1: ok", malformed garbage }}}'
        out = parse_grade_json(text)
        assert "Câu 1" in out["transcript"]


# ---------------------------------------------------------------------------
# parse_comment_analysis — analyze-comment envelope
# ---------------------------------------------------------------------------


class TestParseCommentAnalysis:
    def test_basic_envelope(self):
        text = json.dumps({
            "verdict": "agree",
            "analysis": "Học sinh đã làm đúng.",
            "lesson": "Khi gặp bài tương tự, cần làm tương tự.",
        })
        out = parse_comment_analysis(text)
        assert out == {
            "verdict": "agree",
            "analysis": "Học sinh đã làm đúng.",
            "lesson": "Khi gặp bài tương tự, cần làm tương tự.",
        }

    def test_unknown_verdict_normalized_to_agree(self):
        text = json.dumps({"verdict": "kinda", "analysis": "", "lesson": ""})
        out = parse_comment_analysis(text)
        assert out["verdict"] == "agree"

    def test_dispute_verdict_preserved(self):
        text = json.dumps({
            "verdict": "dispute",
            "analysis": "Bài làm đúng, không cần trừ.",
            "lesson": "Khi gặp X, KHÔNG kết luận sai chỉ vì thiếu Y.",
        })
        out = parse_comment_analysis(text)
        assert out["verdict"] == "dispute"

    def test_verdict_case_insensitive(self):
        text = json.dumps({"verdict": "PARTIAL", "analysis": "", "lesson": ""})
        assert parse_comment_analysis(text)["verdict"] == "partial"

    def test_fenced_json(self):
        text = "```json\n" + json.dumps({
            "verdict": "agree", "analysis": "x", "lesson": "y",
        }) + "```"
        out = parse_comment_analysis(text)
        assert out["verdict"] == "agree"

    def test_field_level_salvage_on_total_failure(self):
        # Garbled output → regex extracts whatever it can field-by-field.
        text = 'verdict: "dispute", analysis: "salvaged text", random junk'
        out = parse_comment_analysis(text)
        # verdict regex isn't perfect on freeform; ensures we get a valid
        # enum value back regardless.
        assert out["verdict"] in ("agree", "partial", "dispute")


# ---------------------------------------------------------------------------
# is_meaningful_text — word-count guard against "Đúng," responses
# ---------------------------------------------------------------------------


class TestIsMeaningfulText:
    def test_none_or_empty(self):
        assert is_meaningful_text(None) is False
        assert is_meaningful_text("") is False
        assert is_meaningful_text("   ") is False

    def test_punctuation_only(self):
        # Pure JSON / punctuation slop should not surface to the UI.
        assert is_meaningful_text(',.;:"') is False
        assert is_meaningful_text("{}[]") is False

    def test_too_few_letters_filtered(self):
        # Need at least 3 word characters even if word count satisfies.
        assert is_meaningful_text("ab") is False

    def test_normal_sentence_accepted(self):
        assert is_meaningful_text("Học sinh làm đúng bài này.") is True

    def test_min_words_guard(self):
        # The "Đúng," failure mode CLAUDE.md mentions: technically valid
        # JSON, single word, useless to teacher. min_words filter catches it.
        assert is_meaningful_text("Đúng", min_words=8) is False
        assert is_meaningful_text("Đúng", min_words=1) is True

    def test_vietnamese_diacritics_counted(self):
        # The letter-count regex uses unicode flag, so diacritics in
        # "tế bào" / "phương trình" should count as letters.
        assert is_meaningful_text("phương trình") is True


# ---------------------------------------------------------------------------
# fallback_comment_analysis — synthesize a useful reply
# ---------------------------------------------------------------------------


class TestFallbackCommentAnalysis:
    def test_empty_comment_returns_canonical_fallback(self):
        out = fallback_comment_analysis("")
        assert out["analysis"] == ANALYZE_COMMENT_FALLBACK
        assert out["verdict"] == "agree"
        assert out["lesson"] == ""

    def test_positive_comment_path(self):
        # "tốt, có thể mở rộng" should hit the positive-cue branch and emit
        # the praise-style lesson, NOT echo the raw teacher note.
        out = fallback_comment_analysis(
            "bài em làm tốt, có thể mở rộng thêm chi tiết"
        )
        assert out["verdict"] == "agree"
        assert "tốt" in out["analysis"].lower() or "ghi nhận" in out["analysis"].lower()
        # Lesson is a reusable rule, not a verbatim copy.
        assert out["lesson"]
        assert len(out["lesson"].split()) <= 50

    def test_negative_comment_path(self):
        # "sai", "thiếu" cues route to the error-analysis branch.
        out = fallback_comment_analysis("em sai chỗ này, thiếu công thức Vi-et")
        assert out["verdict"] == "agree"
        assert "sửa" in out["analysis"].lower() or "đối chiếu" in out["analysis"].lower()

    def test_nham_cau_pattern(self):
        # Very specific phrase the fallback handles for clarity.
        out = fallback_comment_analysis("học sinh làm nhầm câu 1")
        assert "nhầm" in out["analysis"] or "đối chiếu" in out["analysis"]

    def test_lesson_truncated_to_50_words(self):
        long_comment = " ".join(["thiếu"] * 200)
        out = fallback_comment_analysis(long_comment)
        assert len(out["lesson"].split()) <= 51  # 50 + period word


# ---------------------------------------------------------------------------
# Smoke: anti-poisoning lesson shape
# ---------------------------------------------------------------------------


class TestAntiPoisoning:
    """The /api/analyze-comment dispute path emits a DEFENSIVE lesson —
    "Khi gặp X, KHÔNG kết luận sai chỉ vì thiếu Y" — never an echo of the
    teacher's wrong claim. The shape is enforced by prompts/base.py and
    parsed verbatim here. We assert parse_comment_analysis preserves the
    `dispute` verdict so the UI can require confirmation."""

    def test_dispute_verdict_round_trips(self):
        defensive_lesson = (
            "Khi gặp bài có yếu tố thiếu công thức rõ ràng, KHÔNG kết luận "
            "sai chỉ vì cách trình bày khác chuẩn."
        )
        text = json.dumps({
            "verdict": "dispute",
            "analysis": "Bài làm đúng, không cần trừ.",
            "lesson": defensive_lesson,
        })
        out = parse_comment_analysis(text)
        assert out["verdict"] == "dispute"
        assert out["lesson"].startswith("Khi gặp")
        assert "KHÔNG" in out["lesson"]
