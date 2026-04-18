"""
prompt_orchestrator.py — Prompt Orchestration Layer
Purpose: Modular prompt builder for the HITL VLM Grading Agent. Decomposes
         prompts into System / Memory / Dynamic components, retrieves teacher
         lessons from MemoryManager (SQLite + ChromaDB), and produces a
         PromptBundle suitable for transparency, UI debugging, and research
         logging.
Author: [Your Name]
Research Project: Tác tử AI hỗ trợ chấm điểm tự luận đa phương thức kết hợp
                  phản hồi từ giáo viên (Human-in-the-loop VLM Grading Agent)
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Optional

from memory import MemoryManager

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class Role(str, Enum):
    GRADER = "grader"      # Giám khảo (VLM): đọc ảnh bài làm, chấm điểm


class Subject(str, Enum):
    """Coarse subject family — controls which 4-rubric set is used.

    The JSON score keys remain ``content/argument/expression/creativity`` for
    backward compatibility, but the *meaning* of each key shifts with the
    subject (see ``RUBRIC_LABELS``).
    """

    LITERATURE = "literature"   # Văn / Nghị luận — the historical default
    STEM = "stem"               # Toán / Tin / Lý — math, code, logic
    LANGUAGE = "language"       # Ngoại ngữ — English/French essays
    HISTORY = "history"         # Sử / GDCD — events, analysis, context


# ---------------------------------------------------------------------------
# Per-subject rubric labels — the JSON keys stay the same but semantics shift.
# ---------------------------------------------------------------------------

# Labels by subject/lang. Each block contains four (key, label, description)
# triples. The Grader sees these in-prompt so it understands what each score
# means for this particular subject; the UI uses the same labels for display
# (see frontend/src/i18n/*.js ``rubricBySubject``).
RUBRIC_LABELS: dict[Subject, dict[str, dict[str, tuple[str, str]]]] = {
    Subject.LITERATURE: {
        "vi": {
            "content":    ("Nội dung",     "ý tưởng, luận điểm, kiến thức bài học"),
            "argument":   ("Lập luận",     "luận điểm, dẫn chứng, mạch logic"),
            "expression": ("Diễn đạt",     "văn phong, từ ngữ, câu văn"),
            "creativity": ("Sáng tạo",     "góc nhìn mới, liên hệ bất ngờ"),
        },
        "en": {
            "content":    ("Content",      "ideas, theses, subject knowledge"),
            "argument":   ("Argument",     "claims, evidence, logical flow"),
            "expression": ("Expression",   "style, diction, sentence craft"),
            "creativity": ("Creativity",   "original angle, fresh connections"),
        },
    },
    Subject.STEM: {
        "vi": {
            "content":    ("Tính chính xác",  "đáp án đúng, kết quả cuối cùng"),
            "argument":   ("Phương pháp",     "cách giải, lựa chọn công thức/thuật toán"),
            "expression": ("Trình bày",       "các bước rõ ràng, ký hiệu chuẩn"),
            "creativity": ("Hiểu bản chất",   "giải thích vì sao, cách làm hay/gọn"),
        },
        "en": {
            "content":    ("Accuracy",         "correctness of the final answer"),
            "argument":   ("Method",           "approach, choice of formula/algorithm"),
            "expression": ("Presentation",     "clarity of steps, standard notation"),
            "creativity": ("Conceptual Depth", "why it works, elegant alternatives"),
        },
    },
    Subject.LANGUAGE: {
        "vi": {
            "content":    ("Hoàn thành nhiệm vụ", "đúng yêu cầu, đủ ý chính"),
            "argument":   ("Ngữ pháp",            "cấu trúc câu, thì, sự hoà hợp"),
            "expression": ("Từ vựng",             "độ phong phú, chính xác"),
            "creativity": ("Lưu loát",            "tự nhiên, mạch viết, liên kết"),
        },
        "en": {
            "content":    ("Task Completion", "addresses the prompt, key points"),
            "argument":   ("Grammar",         "sentence structure, tenses, agreement"),
            "expression": ("Vocabulary",      "range and precision"),
            "creativity": ("Fluency",         "natural flow, cohesion, voice"),
        },
    },
    Subject.HISTORY: {
        "vi": {
            "content":    ("Sự kiện",     "tính chính xác của mốc, số liệu, tên riêng"),
            "argument":   ("Phân tích",   "nguyên nhân, hệ quả, ý nghĩa"),
            "expression": ("Trình bày",   "mạch lạc, khách quan, có dẫn chứng"),
            "creativity": ("Bối cảnh",    "so sánh, liên hệ thời đại, đánh giá đa chiều"),
        },
        "en": {
            "content":    ("Facts",       "accuracy of dates, figures, names"),
            "argument":   ("Analysis",    "causes, consequences, significance"),
            "expression": ("Presentation", "coherence, objectivity, citation"),
            "creativity": ("Context",     "comparisons, multi-perspective evaluation"),
        },
    },
}


# ---------------------------------------------------------------------------
# Shared transcription + formatting + JSON-schema rules (subject-independent).
#
# The rules are split into 7 labelled parts so each can be edited / A-B tested
# independently. They are composed in order by ``_compose_shared_rules``.
#
#   1. FORBIDDEN        — hard "do not" constraints
#   2. SCOPE            — transcript is a cross-check layer: questions ONLY
#   3. PROCEDURE        — top-down scanning order
#   4. UNCERTAINTY      — markers for unreadable tokens
#   5. FORMATTING       — indentation + Unicode symbol rules
#   6. STRUCTURE        — per-question output layout
#   7. OUTPUT           — strict JSON schema
# ---------------------------------------------------------------------------

# --- Part 1 — FORBIDDEN ----------------------------------------------------
_RULES_FORBIDDEN: dict[str, str] = {
    "en": (
        "1. FORBIDDEN:\n"
        "• NO LaTeX commands (\\Rightarrow, \\times, \\le, \\text, \\frac, "
        "\\sqrt, \\cdot, $…$, \\(…\\)).\n"
        "• NO wrapping inline arithmetic in '[Formula: …]' — write it directly.\n"
        "• NO flattening source code / nested lists to the left margin.\n"
        "• NO 'correcting' the student's mistakes in transcript. You MUST copy whatever "
        "wrong number / misspelled word / grammatical error / flawed step is on the page EXACTLY. "
        "Auto-correcting student's spelling or grammar destroys the cross-check layer.\n"
        "• NO paraphrasing or summarising. Even if the text is very long (like a literature essay), you MUST NOT summarize. You MUST copy it entirely.\n"
        "• NO guessing unclear characters — if unsure, use the uncertainty marker in rule 4.\n"
        "• NO harsh language or empty praise — keep a pedagogical, supportive tone.\n"
        "• Scope of what counts as 'the student's answer' is defined in rule 2 — do not transcribe anything outside that scope."
    ),
    "vi": (
        "1. ĐIỀU CẤM:\n"
        "• TUYỆT ĐỐI KHÔNG dùng lệnh LaTeX (\\Rightarrow, \\times, \\le, \\text, "
        "\\frac, \\sqrt, \\cdot, $…$, \\(…\\)).\n"
        "• KHÔNG bọc phép tính đơn giản trong '[Công thức: …]' — viết thẳng.\n"
        "• KHÔNG dồn mã nguồn / danh sách lồng về lề trái.\n"
        "• TUYỆT ĐỐI KHÔNG tự ý 'sửa' lỗi chính tả hay ngữ pháp của học sinh. Chép ĐÚNG "
        "từng con số sai, từ viết sai, bước tính sai có trên giấy. Việc bạn tự động sửa lỗi làm hỏng toàn bộ ý nghĩa của lớp đối soát.\n"
        "• TUYỆT ĐỐI KHÔNG diễn giải hay tóm tắt bài làm. Kể cả với bài văn/sử rất dài, bạn PHẢI chép ĐẦY ĐỦ từng câu, từng chữ, không được rút gọn.\n"
        "• KHÔNG đoán chữ khó đọc — nếu không chắc, dùng ký hiệu đánh dấu bất định ở quy tắc 4.\n"
        "• KHÔNG dùng từ nặng nề hoặc khen xã giao — giữ giọng sư phạm.\n"
        "• Phạm vi thế nào là 'bài làm của học sinh' được định nghĩa ở quy tắc 2 — tuyệt đối không chép gì ngoài phạm vi đó."
    ),
}


# --- Part 2 — SCOPE (transcript = cross-check layer) -----------------------
_RULES_SCOPE: dict[str, str] = {
    "en": (
        "2. SCOPE (transcript = CROSS-CHECK LAYER):\n"
        "• Transcript is unarguable legal evidence layer between the image and the score — "
        "it must mirror EXACTLY, CHARACTER-BY-CHARACTER, what the student WROTE. "
        "Any alteration is considered a severe hallucination error.\n"
        "• Scan ONLY the ANSWER AREA of each question.\n"
        "• OUT OF SCOPE — do NOT transcribe any of these: student name, class, "
        "date, exam-paper heading, school watermark / logo, pre-printed question "
        "text, page numbers, printed line numbers, teacher signature or marks.\n"
        "• Do NOT re-copy the prompt / pre-printed question text.\n"
        "• If a student left an answer area blank, leave that question's body EMPTY."
    ),
    "vi": (
        "2. PHẠM VI QUÉT (transcript = LỚP ĐỐI SOÁT):\n"
        "• Transcript đóng vai trò như 'bằng chứng pháp lý' giữa ảnh và điểm số — "
        "phải phản chiếu ĐÚNG TỪNG CHỮ MỘT (CHARACTER-BY-CHARACTER) những gì HỌC SINH VIẾT. "
        "Bất kỳ sự thêm thắt, cắt gọt, hay tự sửa đổi nào đều bị coi là lỗi ảo giác nghiêm trọng.\n"
        "• CHỈ quét VÙNG TRẢ LỜI của từng câu.\n"
        "• NGOÀI PHẠM VI — TUYỆT ĐỐI KHÔNG chép các phần sau: họ tên, lớp, ngày "
        "tháng, tiêu đề đề thi, logo, câu hỏi in sẵn, chữ ký/điểm của giáo viên.\n"
        "• KHÔNG chép lại đề bài / câu hỏi in sẵn. Transcript chỉ giữ trọn vẹn phần học sinh tự viết.\n"
        "• Nếu học sinh để trống, tuyệt đối không bịa nội dung lấp chỗ trống."
    ),
}


# --- Part 3 — PROCEDURE ----------------------------------------------------
_RULES_PROCEDURE: dict[str, str] = {
    "en": (
        "3. HOW TO TRANSCRIBE (PROCEDURE — follow in order):\n"
        "a) Scan the page top-to-bottom to locate each question's ANSWER AREA.\n"
        "b) Act as a mindless text photocopier. Identify the first token, copy it, locate the second, copy it, and so on. "
        "If a token is not clear in the pixels, do NOT guess — use an uncertainty marker [?].\n"
        "c) Do NOT drop attention. For long texts, make sure you don't grow tired and start skipping paragraphs. "
        "You must maintain 100% fidelity to the very end.\n"
        "d) If handwriting is imperfect but legible, copy EVERY intermediate step, never drop whole lines.\n"
        "e) POST-COPY VERIFICATION (MANDATORY): After finishing the transcript, go back and compare EVERY token "
        "in your transcript against the original image pixel-by-pixel. Check for: missing digits (e.g. '142' vs '14'), "
        "dropped sub-labels ('a)', 'b)'), missing mathematical symbols (absolute value bars |x|, parentheses, "
        "subscripts). If you find ANY discrepancy, FIX IT before outputting the JSON."
    ),
    "vi": (
        "3. QUY TRÌNH CHÉP (theo đúng thứ tự):\n"
        "a) Quét ảnh từ trên xuống để xác định VÙNG TRẢ LỜI của từng câu.\n"
        "b) Hãy hoạt động như một cái máy photocopy chữ vô tri (mindless text photocopier). Bạn nhìn thấy chữ gì trên ảnh, hãy chép y hệt chữ đó. "
        "Nếu một token không nhìn rõ, TUYỆT ĐỐI KHÔNG đoán ngữ cảnh — phải dùng ký hiệu [?].\n"
        "c) Không được giảm sự chú ý. Đối với bài làm văn dài trên 3 trang, tuyệt đối không được 'lười' mà bỏ sót đoạn văn. "
        "Bạn phải chép đầy đủ từ đoạn mở bài đến đoạn kết bài.\n"
        "d) Nếu chữ viết tay xấu nhưng đọc được (các bước giải toán, sơ đồ), PHẢI chép đủ TỪNG bước, không bỏ cả dòng.\n"
        "e) ĐỐI SOÁT SAU KHI CHÉP (BẮT BUỘC): Sau khi chép xong, hãy QUAY LẠI so từng TOKEN trong transcript với ảnh gốc. "
        "Kiểm tra: thiếu chữ số (ví dụ: '142' bị thành '14'), mất nhãn phụ ('a)', 'b)'), "
        "mất ký hiệu toán học (dấu trị tuyệt đối |x|, ngoặc, chỉ số). "
        "Nếu phát hiện SAI LỆCH BẤT KỲ, SỬA NGAY trước khi xuất JSON."
    ),
}


# --- Part 4 — UNCERTAINTY MARKERS ------------------------------------------
_RULES_UNCERTAINTY: dict[str, str] = {
    "en": (
        "4. UNCERTAINTY MARKERS (use these EXACT shapes, replacing '<…>' with "
        "what you actually see — do NOT keep the angle brackets literally):\n"
        "• '<token>[?]'     → entire token unreadable\n"
        "• '<a>[<a>|<b>]'   → ambiguous between two readings a and b\n"
        "• '<var>_[?]'      → subscript unreadable (same shape for '^[?]' superscript)\n"
        "• '[gạch: <nội dung>]' → crossed-out but still legible\n"
        "• '[gạch]'         → crossed-out and illegible\n"
        "Do NOT invent other tags (e.g. '[strikeout]', '[crossed]', '[unclear]')."
    ),
    "vi": (
        "4. KÝ HIỆU ĐÁNH DẤU BẤT ĐỊNH (giữ ĐÚNG khuôn, thay '<…>' bằng thứ bạn "
        "thực sự thấy — KHÔNG giữ nguyên dấu ngoặc nhọn):\n"
        "• '<token>[?]'       → cả token không đọc được\n"
        "• '<a>[<a>|<b>]'     → phân vân giữa hai cách đọc a và b\n"
        "• '<var>_[?]'        → chỉ số dưới không rõ (tương tự '^[?]' cho chỉ số trên)\n"
        "• '[gạch: <nội dung>]' → chữ bị gạch ngang nhưng vẫn đọc được\n"
        "• '[gạch]'           → chữ bị gạch ngang và không đọc được\n"
        "TUYỆT ĐỐI KHÔNG tự chế marker khác như '[strikeout]', '[strikethrough]', "
        "'[crossed]', '[unclear]'."
    ),
}


# --- Part 5 — FORMATTING ---------------------------------------------------
_RULES_FORMATTING: dict[str, str] = {
    "en": (
        "5. FORMATTING (once content is copied):\n"
        "• Indentation: 4 real spaces per level (Python if/for/while/def bodies, "
        "inner bullet lists, nested steps).\n"
        "• Preserve line breaks, sub-labels ('a)', 'b)'), and intermediate steps.\n"
        "• Plain Unicode symbols only: +, -, ×, ÷, =, ≈, ≠, <, ≤, >, ≥, ⇒, →, "
        "^ (powers), / (fractions), subscripts with '_', sqrt().\n"
        "• CRITICAL: Mathematical symbols such as absolute value bars |x|, parentheses (), "
        "brackets [], braces {}, subscripts, superscripts are PART OF THE CONTENT — "
        "they are NOT formatting artifacts. You MUST preserve every single one of them "
        "exactly as the student wrote. Dropping |y| to just y is a transcription ERROR."
    ),
    "vi": (
        "5. ĐỊNH DẠNG KÝ TỰ (sau khi đã chép xong):\n"
        "• Thụt lề: 4 space thật cho mỗi cấp (trong if/for/while/def của Python, "
        "bullet lồng, các bước giải có cấp bậc).\n"
        "• Giữ xuống dòng, nhãn câu ('a)', 'b)'), các bước giải trung gian.\n"
        "• Chỉ dùng ký hiệu Unicode thuần: +, -, ×, ÷, =, ≈, ≠, <, ≤, >, ≥, ⇒, →, "
        "^ (luỹ thừa), / (phân số), chỉ số dưới với '_', sqrt().\n"
        "• QUAN TRỌNG: Các ký hiệu toán học như dấu trị tuyệt đối |x|, ngoặc tròn (), "
        "ngoặc vuông [], ngoặc nhọn {}, chỉ số trên/dưới là MỘT PHẦN CỦA NỘI DUNG bài làm "
        "— chúng KHÔNG PHẢI hiệu ứng định dạng. Bạn PHẢI giữ nguyên từng ký hiệu đúng như "
        "học sinh viết. Bỏ |y| thành y là LỖI CHÉP SAI."
    ),
}


# --- Part 6 — QUESTION STRUCTURE -------------------------------------------
_RULES_STRUCTURE: dict[str, str] = {
    "en": (
        "6. QUESTION STRUCTURE:\n"
        "• transcript: verbatim copy organised question-by-question. EACH question "
        "MUST start with 'Question 1:', 'Question 2:', … (the UI splits on this "
        "marker — do not skip or renumber). Copying is character-level; no "
        "rewording.\n"
        "• comment: per-question feedback, also prefixed 'Question 1:', "
        "'Question 2:', … Each ≤50 words. TONE: be warm and encouraging like a "
        "supportive mentor. Always acknowledge what the student did well FIRST, "
        "then gently suggest improvements. Avoid harsh, discouraging, or "
        "condescending language. Use phrases like 'You could try…', 'Consider…', "
        "'Good attempt — next time you might…' instead of 'Wrong', 'Failed', "
        "'Incorrect'.\n"
        "• per_question_feedback: array of {question, good_points, errors}. "
        "good_points: sincerely highlight what the student did right — even "
        "partial work deserves recognition. errors: frame mistakes as learning "
        "opportunities, not failures. Its length MUST equal the number of "
        "'Question N:' sections in transcript.\n"
        "• scores / overall: a SINGLE whole-essay score (do not score per "
        "question here).\n"
        "• Use '[Mind map: …]' or '[Diagram: …]' wrappers ONLY for genuine "
        "non-text elements (mind maps, flowcharts, tables); keep under 120 chars — "
        "longer diagrams: describe in one short sentence."
    ),
    "vi": (
        "6. CẤU TRÚC THEO CÂU:\n"
        "• transcript: chép NGUYÊN VĂN bài làm theo từng câu. MỖI câu PHẢI mở đầu "
        "bằng 'Câu 1:', 'Câu 2:', … (giao diện tách trường này theo marker đó — "
        "không bỏ hoặc đánh lại số). Chép ở mức ký tự — TUYỆT ĐỐI KHÔNG viết lại "
        "theo cách của bạn.\n"
        "• comment: nhận xét cho TỪNG câu, cũng mở đầu 'Câu 1:', 'Câu 2:', … Mỗi "
        "câu ≤50 từ. GIỌNG ĐIỆU: nhẹ nhàng và động viên như một người thầy/cô tận tâm. "
        "LUÔN ghi nhận điểm tốt TRƯỚC, sau đó mới nhẹ nhàng gợi ý cải thiện. "
        "Tuyệt đối KHÔNG dùng giọng phê bình nặng nề, chê bai hay kẻ cả. "
        "Dùng cách nói như 'Em có thể thử…', 'Lần sau em nên…', "
        "'Phần này em làm tốt — có thể hoàn thiện hơn bằng cách…' thay vì "
        "'Sai', 'Chưa đạt', 'Không đúng'.\n"
        "• per_question_feedback: mảng {question, good_points, errors}. "
        "good_points: chân thành ghi nhận những gì học sinh làm đúng — kể cả "
        "làm đúng một phần cũng đáng được khen. errors: diễn đạt lỗi như "
        "CƠ HỘI HỌC HỎI, không phải thất bại. Số phần tử PHẢI khớp số câu "
        "'Câu N:' trong transcript.\n"
        "• scores / overall: một điểm tổng hợp TOÀN bài (không chấm riêng từng "
        "câu ở đây).\n"
        "• Chỉ dùng wrapper '[Sơ đồ: …]' / '[Bảng: …]' cho phần tử THỰC SỰ không "
        "phải văn bản (sơ đồ tư duy, lưu đồ, bảng); giữ dưới 120 ký tự — sơ đồ "
        "dài hơn thì mô tả bằng một câu ngắn."
    ),
}


# --- Part 7 — OUTPUT JSON SCHEMA -------------------------------------------
_RULES_OUTPUT: dict[str, str] = {
    "en": (
        "7. OUTPUT: return ONLY this JSON shape: "
        "{\"transcript\": str, \"scores\": {\"content\": float, \"argument\": float, "
        "\"expression\": float, \"creativity\": float}, \"overall\": float, "
        "\"comment\": str, \"per_question_feedback\": "
        "[{\"question\": str, \"good_points\": str, \"errors\": str}]}."
    ),
    "vi": (
        "7. ĐẦU RA: CHỈ trả về đúng JSON: "
        "{\"transcript\": str, \"scores\": {\"content\": số, \"argument\": số, "
        "\"expression\": số, \"creativity\": số}, \"overall\": số, "
        "\"comment\": str, \"per_question_feedback\": "
        "[{\"question\": str, \"good_points\": str, \"errors\": str}]}."
    ),
}


# --- Part 8 — STEM EXAMPLES ------------------------------------------------
_RULES_EXAMPLES: dict[str, str] = {
    "en": (
        "8. TRANSCRIPTION EXAMPLES (for calibration — DO NOT copy these into transcript):\n"
        "• Binary arithmetic: if student wrote '1111101 + 10001 = 10001110', copy EXACTLY "
        "'1111101 + 10001 = 10001110' — do NOT recalculate or 'correct' the result.\n"
        "• Absolute value: if student wrote '(|x| ≤ 1) AND (|y| ≤ 1)', you MUST keep "
        "the | bars on BOTH x and y. Writing '(y ≤ 1)' without bars is a WRONG transcript.\n"
        "• Sub-labels: if student wrote 'a) 125 + 17 ... b) 125 × 4 ...', each sub-label "
        "'a)' and 'b)' MUST appear in the transcript. Dropping them is an error.\n"
        "• Long answers: if the student's answer fills 5+ lines, you MUST copy ALL lines. "
        "Stopping after the first sentence is a CRITICAL failure."
    ),
    "vi": (
        "8. VÍ DỤ CHÉP MẪU (để hiệu chỉnh — TUYỆT ĐỐI KHÔNG chép các ví dụ này vào transcript):\n"
        "• Số nhị phân: nếu học sinh viết '1111101 + 10001 = 10001110', chép ĐÚNG "
        "'1111101 + 10001 = 10001110' — KHÔNG được tự tính lại hay 'sửa' kết quả.\n"
        "• Trị tuyệt đối: nếu học sinh viết '(|x| ≤ 1) AND (|y| ≤ 1)', bạn PHẢI giữ "
        "dấu | trên CẢ x và y. Viết '(y ≤ 1)' không có dấu | là CHÉP SAI.\n"
        "• Nhãn phụ: nếu học sinh viết 'a) 125 + 17 ... b) 125 × 4 ...', mỗi nhãn "
        "'a)' và 'b)' PHẢI xuất hiện trong transcript. Bỏ nhãn phụ là lỗi.\n"
        "• Bài dài: nếu câu trả lời của học sinh kéo dài 5+ dòng, bạn PHẢI chép TOÀN BỘ. "
        "Dừng lại sau câu đầu tiên là THẤT BẠI NGHIÊM TRỌNG."
    ),
}


# Ordered list of all shared-rule parts — compose in this sequence.
_RULE_PARTS: tuple[dict[str, str], ...] = (
    _RULES_FORBIDDEN,
    _RULES_SCOPE,
    _RULES_PROCEDURE,
    _RULES_UNCERTAINTY,
    _RULES_FORMATTING,
    _RULES_STRUCTURE,
    _RULES_OUTPUT,
    _RULES_EXAMPLES,
)


def _compose_shared_rules(lang: str) -> str:
    """Concatenate all shared-rule parts for the given language."""
    return "\n\n".join(part[lang] for part in _RULE_PARTS)


_SHARED_RULES: dict[str, str] = {
    lang: _compose_shared_rules(lang) for lang in ("vi", "en")
}


# Per-subject persona/focus paragraph (first few sentences of the system prompt).
_SUBJECT_INTRO: dict[Subject, dict[str, str]] = {
    Subject.LITERATURE: {
        "en": (
            "You are an experienced Literature Essay Grader (VLM). Carefully "
            "read the student's paper (typed or handwritten). Grade on a 0–10 "
            "scale using FOUR LITERATURE RUBRICS — in this subject, grading "
            "weighs idea depth, argumentation, language craft, and original voice. "
            "Your feedback should be warm and encouraging — you are a supportive "
            "mentor helping students grow, not a harsh critic."
        ),
        "vi": (
            "Bạn là Giáo viên chấm bài Ngữ văn giàu kinh nghiệm và tận tâm (sử dụng VLM). "
            "Đọc kỹ bài làm của học sinh (đánh máy hoặc viết tay). Chấm trên "
            "thang 0–10 theo BỐN TIÊU CHÍ VĂN HỌC — coi trọng chiều sâu ý tưởng, "
            "lập luận, nghệ thuật ngôn từ và góc nhìn riêng. "
            "Nhận xét của bạn phải nhẹ nhàng, động viên — bạn là người thầy/cô "
            "đồng hành giúp học sinh tiến bộ, không phải người phê bình khắt khe."
        ),
    },
    Subject.STEM: {
        "en": (
            "You are an experienced STEM Grader (VLM) for Math / Computer "
            "Science / Physics. Carefully read the student's paper (typed or "
            "handwritten). Grade on a 0–10 scale using FOUR STEM RUBRICS — in "
            "this subject, correctness outranks style. A right answer with "
            "messy writing scores higher than an elegant but wrong one. Do NOT "
            "penalize lack of literary flair; this is not a literature essay. "
            "Your feedback should be warm and encouraging — you are a supportive "
            "mentor helping students grow, not a harsh critic."
        ),
        "vi": (
            "Bạn là Giáo viên chấm bài Toán / Tin học / Vật lý tận tâm (sử dụng VLM). "
            "Đọc kỹ bài làm của học sinh (đánh máy hoặc viết tay). Chấm trên "
            "thang 0–10 theo BỐN TIÊU CHÍ STEM — trong môn này, tính đúng đắn "
            "quan trọng hơn văn phong. Đáp án đúng với trình bày lộn xộn vẫn "
            "cao điểm hơn cách viết hoa mỹ nhưng sai. KHÔNG trừ điểm vì "
            "'thiếu chất văn' — đây không phải bài Ngữ văn. "
            "Nhận xét phải nhẹ nhàng, động viên — bạn là người đồng hành "
            "giúp học sinh tiến bộ, không phải người phê bình khắt khe."
        ),
    },
    Subject.LANGUAGE: {
        "en": (
            "You are an experienced Foreign Language Essay Grader (VLM). "
            "Carefully read the student's paper (typed or handwritten). Grade "
            "on a 0–10 scale using FOUR LANGUAGE RUBRICS — weighting task "
            "fulfilment, grammatical accuracy, vocabulary range, and fluency. "
            "Your feedback should be warm and encouraging — you are a supportive "
            "mentor helping students grow, not a harsh critic."
        ),
        "vi": (
            "Bạn là Giáo viên chấm bài tự luận Ngoại ngữ tận tâm (sử dụng VLM). Đọc kỹ "
            "bài làm của học sinh (đánh máy hoặc viết tay). Chấm trên thang "
            "0–10 theo BỐN TIÊU CHÍ NGOẠI NGỮ — coi trọng việc hoàn thành đề "
            "bài, độ chính xác ngữ pháp, vốn từ vựng và độ lưu loát. "
            "Nhận xét phải nhẹ nhàng, động viên — bạn là người đồng hành "
            "giúp học sinh tiến bộ, không phải người phê bình khắt khe."
        ),
    },
    Subject.HISTORY: {
        "en": (
            "You are an experienced History / Civics Essay Grader (VLM). "
            "Carefully read the student's paper (typed or handwritten). Grade "
            "on a 0–10 scale using FOUR HISTORY RUBRICS — weighting factual "
            "accuracy, causal analysis, coherent presentation, and contextual "
            "perspective. "
            "Your feedback should be warm and encouraging — you are a supportive "
            "mentor helping students grow, not a harsh critic."
        ),
        "vi": (
            "Bạn là Giáo viên chấm bài Lịch sử / GDCD tận tâm (sử dụng VLM). Đọc kỹ "
            "bài làm của học sinh (đánh máy hoặc viết tay). Chấm trên thang "
            "0–10 theo BỐN TIÊU CHÍ LỊCH SỬ — coi trọng độ chính xác sự kiện, "
            "phân tích nguyên nhân – hệ quả, trình bày mạch lạc và cái nhìn "
            "bối cảnh đa chiều. "
            "Nhận xét phải nhẹ nhàng, động viên — bạn là người đồng hành "
            "giúp học sinh tiến bộ, không phải người phê bình khắt khe."
        ),
    },
}


def _compose_grader_system(subject: Subject, lang: str) -> str:
    """Build the full Grader system prompt: intro + rubric glossary + shared rules."""
    intro = _SUBJECT_INTRO[subject][lang]
    labels = RUBRIC_LABELS[subject][lang]

    if lang == "vi":
        header = "BỐN TIÊU CHÍ CHẤM (dùng đúng các JSON key này):"
        hitl = "Ràng buộc ưu tiên từ giáo viên (HITL) cao hơn quy tắc chung."
    else:
        header = "FOUR RUBRIC DIMENSIONS (use exactly these JSON keys):"
        hitl = "High-priority teacher constraints (HITL) override general rules."

    rubric_lines = [
        f'  - "{k}" → {labels[k][0]}: {labels[k][1]}'
        for k in ("content", "argument", "expression", "creativity")
    ]
    rubric_block = header + "\n" + "\n".join(rubric_lines)
    return f"{intro}\n\n{rubric_block}\n\n{hitl}\n\n{_SHARED_RULES[lang]}"


GRADER_SYSTEM: dict[Subject, dict[str, str]] = {
    subj: {lang: _compose_grader_system(subj, lang) for lang in ("vi", "en")}
    for subj in Subject
}

# ---------------------------------------------------------------------------
# Subject detection — picks the right 4-rubric profile from the task text
# ---------------------------------------------------------------------------

_SUBJECT_PATTERNS: list[tuple[Subject, re.Pattern]] = [
    (
        Subject.STEM,
        re.compile(
            r"("
            r"\bsolve\b|\bcompute\b|\bcalculate\b|\bprove\b|\bderive\b|\bmath\w*|"
            r"\balgorithm\b|\bpseudocode\b|\bfunction\b|\bformula\b|\bequation\b|"
            r"\bmatrix\b|\bbinary\b|\bhex\b|\blogic\b|\bboolean\b|\btruth table\b|"
            # Standalone subject names first (match short task titles like
            # "đề toán" / "kiểm tra tin" / "lý 10").
            r"\btoán\b|\btin\b|\bvật lí\b|\bvật lý\b|\blí\b|\blý\b|"
            r"bài toán|phương trình|bất phương trình|chứng minh|tính(?:\s|$)|"
            r"hệ cơ số|nhị phân|thập phân|ma trận|đạo hàm|tích phân|"
            r"biểu thức|công thức|thuật toán|lập trình|mã giả|code|"
            r"mệnh đề|hàm số|đồ thị|hình học|đại số|giải tích|vectơ|xác suất|thống kê"
            r")",
            re.IGNORECASE,
        ),
    ),
    (
        Subject.HISTORY,
        re.compile(
            r"("
            r"\bhistor\w+|\bcentury\b|\bdynasty\b|\bwar\b|\brevolution\b|"
            r"\bcivic\w*|\bgovernment\b|"
            r"lịch sử|triều đại|vua\s|chiến tranh|kháng chiến|cách mạng|"
            r"hiệp định|phong trào|sự kiện|nhân vật lịch sử|gdcd|công dân|"
            r"hiến pháp|pháp luật"
            r")",
            re.IGNORECASE,
        ),
    ),
    (
        Subject.LANGUAGE,
        re.compile(
            r"("
            r"\bwrite (?:an? )?(?:essay|paragraph|letter) in (?:english|french|german|japanese|chinese)\b|"
            r"\bin at least \d+ words\b|\busing appropriate vocabulary\b|"
            r"tiếng anh|tiếng pháp|tiếng trung|tiếng nhật|tiếng hàn|"
            r"viết (?:một )?(?:đoạn văn|bức thư|bài luận) bằng tiếng"
            r")",
            re.IGNORECASE,
        ),
    ),
]


def detect_subject(task: str) -> Subject:
    """Keyword-based subject detection. Defaults to LITERATURE (the historical
    profile of this app and the safest fallback for Vietnamese essays)."""
    for subject, pattern in _SUBJECT_PATTERNS:
        if pattern.search(task or ""):
            return subject
    return Subject.LITERATURE


def _sanitize(s: Optional[str], max_len: int = 8000) -> str:
    """Neutralize role-impersonation prefixes and cap length."""
    if s is None:
        return ""
    s = str(s)
    s = re.sub(r"(?im)^\s*(system|assistant|user)\s*:", "", s)
    s = s.replace("```system", "```")
    return s[:max_len]


# ---------------------------------------------------------------------------
# Prompt Bundle — the transparent artifact of one build_prompt() call
# ---------------------------------------------------------------------------


@dataclass
class PromptBundle:
    """Fully assembled prompt, split by component for transparency & replay."""

    role: Role
    lang: str
    system: str
    memory: str
    dynamic: str
    user_content: str
    full: str
    subject: Subject = Subject.LITERATURE
    lessons_used: list[dict[str, Any]] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "role": self.role.value,
            "subject": self.subject.value,
            "lang": self.lang,
            "system": self.system,
            "memory": self.memory,
            "dynamic": self.dynamic,
            "user_content": self.user_content,
            "full": self.full,
            "lessons_used": self.lessons_used,
            "meta": self.meta,
        }


# ---------------------------------------------------------------------------
# Prompt Orchestrator
# ---------------------------------------------------------------------------


class PromptOrchestrator:
    """Builds structured prompts for the VLM grading pipeline.

    Inputs combined: essay topic + (AI grade JSON | rubric) + teacher feedback +
    retrieved teacher lessons. The actual essay image is supplied separately to
    the Gemini Vision call by the AgentOrchestrator.
    """

    def __init__(
        self,
        memory: MemoryManager,
        *,
        k_lessons: int = 3,
        log_dir: Path | str | None = None,
    ) -> None:
        self.memory = memory
        self.k = k_lessons
        self.log_dir: Path | None = Path(log_dir) if log_dir else None
        if self.log_dir:
            self.log_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ API

    def build_prompt(
        self,
        task: str,
        feedback: Optional[str] = None,
        *,
        lang: str = "en",
        subject: Subject | None = None,
    ) -> PromptBundle:
        """Assemble the Grader PromptBundle for this essay.

        Args:
            task:     The essay topic / question / rubric prompt.
            feedback: Optional human teacher feedback to inject on a re-grade.
            lang:     'en' or 'vi'.
            subject:  Optional explicit subject family — auto-detected otherwise.
                      Controls which 4-rubric profile the Grader uses.
        """
        lang = lang if lang in ("en", "vi") else "en"

        task = _sanitize(task, 4000)
        feedback = _sanitize(feedback or "", 2000)

        subject = subject or detect_subject(task)

        # 1. System component -------------------------------------------------
        system = GRADER_SYSTEM[subject][lang]

        # 2. Memory component -------------------------------------------------
        lessons = (
            self.memory.search_relevant_lessons(task, top_k=self.k) if task else []
        )
        lessons = sorted(
            lessons, key=lambda l: -float(l.get("feedback_score", 0.0))
        )
        memory_block = self._format_lessons(lessons, lang)

        # 3. Dynamic component (Topic / Teacher feedback) ---------------------
        topic_label = "ESSAY TOPIC" if lang == "en" else "ĐỀ BÀI TỰ LUẬN"
        feedback_label = (
            "TEACHER FEEDBACK" if lang == "en" else "PHẢN HỒI CỦA GIÁO VIÊN"
        )

        dynamic_parts: list[str] = [f"### {topic_label}\n{task}"]
        if feedback:
            dynamic_parts.append(f"### {feedback_label}\n{feedback}")
        dynamic = "\n\n".join(dynamic_parts)

        # 4. Assemble ---------------------------------------------------------
        user_content = f"{memory_block}\n\n{dynamic}".strip()
        full = "### SYSTEM\n" + system + "\n\n### USER\n" + user_content + "\n"

        bundle = PromptBundle(
            role=Role.GRADER,
            subject=subject,
            lang=lang,
            system=system,
            memory=memory_block,
            dynamic=dynamic,
            user_content=user_content,
            full=full,
            lessons_used=lessons,
            meta={
                "k": self.k,
                "ts": time.time(),
                "prompt_hash": hashlib.sha1(full.encode("utf-8")).hexdigest()[:16],
                "subject": subject.value,
            },
        )
        self._log(bundle)
        return bundle

    def ingest_feedback(
        self,
        *,
        task: str,
        wrong_code: str,
        correct_code: str,
        lesson_text: str,
        score: float = 3.0,
    ) -> int:
        """Persist a teacher correction as a reusable grading lesson.

        Field semantics in this project:
            task          → essay topic
            wrong_code    → AI's incorrect grade JSON
            correct_code  → teacher's corrected grade JSON (may be empty)
            lesson_text   → teacher's instructional note
        """
        return self.memory.save_lesson(
            task=task,
            wrong_code=wrong_code,
            correct_code=correct_code,
            lesson_text=lesson_text,
            feedback_score=score,
        )

    # -------------------------------------------------------------- helpers

    @staticmethod
    def _format_lessons(
        lessons: list[dict[str, Any]], lang: str
    ) -> str:
        if not lessons:
            return ""

        if lang == "en":
            header = "PAST TEACHER CORRECTIONS (Priority Constraints):"
            instruction = (
                "The following are corrections made by a human teacher on past essays "
                "for this exact topic. CRITICAL RULE: ONLY apply these constraints if "
                "the current essay exhibits the exact same characteristics. Do NOT assume "
                "the current essay has these flaws unless you visually detect them."
            )
        else:
            header = "CÁC LỖI ĐÃ TỪNG SỬA (Ràng buộc ưu tiên):"
            instruction = (
                "Dưới đây là các đúc kết từ những lần giáo viên sửa điểm cho đề bài này "
                "trong quá khứ. LUẬT QUAN TRỌNG: CHỈ áp dụng các ràng buộc này nếu bài "
                "làm hiện tại mắc chính xác lỗi hoặc có đặc điểm tương tự. TUYỆT ĐỐI "
                "KHÔNG tự ý trừ/cộng điểm nếu bạn không thực sự nhìn thấy nội dung đó "
                "trong ảnh bài làm."
            )

        bullets: list[str] = []
        for les in lessons:
            text = str(les.get("lesson_text", "")).strip()
            bullets.append(f"- ĐIỀU KIỆN KIỂM TRA (RULE to check): {text}")

        body = "\n".join(bullets)
        return f"### {header}\n{instruction}\n\n{body}"

    def _log(self, bundle: PromptBundle) -> None:
        logger.info(
            "prompt_built role=%s subject=%s hash=%s lessons=%d",
            bundle.role.value,
            bundle.subject.value,
            bundle.meta["prompt_hash"],
            len(bundle.lessons_used),
        )
        if not self.log_dir:
            return
        filename = (
            f"{int(bundle.meta['ts'])}_{bundle.role.value}_{bundle.meta['prompt_hash']}.json"
        )
        path = self.log_dir / filename
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(bundle.to_dict(), f, ensure_ascii=False, indent=2)
        except OSError as exc:  # non-fatal — logging must not break pipeline
            logger.warning("Failed to write prompt log %s: %s", path, exc)
