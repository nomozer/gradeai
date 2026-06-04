"""
gen_benchmark.py — Build a LABELLED evaluation benchmark for the HITL
grading experiment.

Unlike ``gen_test_papers.py`` (a quick 3-pair dev smoke set), this emits a
controlled corpus where the *correct grade is known by construction* — so
the HITL-RAG experiment can measure AI↔gold error without any teacher
hand-labelling.

Design (serves the thesis claim "HITL-RAG cải thiện độ chính xác"):

  • Each item targets ONE "error family" (a recurring, well-defined student
    mistake) so a single lesson can plausibly fix it.
  • Every error family has ≥2 items with DIFFERENT surface content (numbers
    /equations) but the SAME conceptual error. This enables the *transfer*
    split: teach the lesson on item #1, test on item #2 (held-out) → if
    grading improves on the unseen item, the model generalised the
    correction rather than memorising the paper.
  • A "clean" control item (no seeded error) checks *specificity*: injecting
    a lesson must NOT make the grader start deducting on correct work.

Output (default ``./benchmark/``):
  • ``<id>_de.pdf`` + ``<id>_bailam.pdf`` per item (fed to the VLM pipeline)
  • ``gold.json`` — machine-readable manifest: per-item per-câu gold score,
    error-family tag, and the teacher lesson text to inject for each family.

The PDF renderer is reused from ``gen_test_papers`` so there is one place
that knows how to lay out Vietnamese glyphs.

Run:
    python scripts/gen_benchmark.py [out_dir]
"""

from __future__ import annotations

import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

# The script's own directory is on sys.path[0], so the sibling module
# imports cleanly whether run from repo root or scripts/.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_test_papers import write_pdf  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class Question:
    """One câu with its known-correct grade for THIS student's answer."""
    num: int
    max_points: float
    gold_score: float          # defensible teacher score for the seeded answer
    error_family: str | None   # None ⇒ câu is fully correct
    error_desc: str            # human note: what was wrong (or "đúng")


@dataclass
class Item:
    id: str
    subject: str               # math / chem / bio
    de_title: str
    de_lines: list[str]
    bailam_title: str
    bailam_lines: list[str]
    questions: list[Question]

    @property
    def gold_overall(self) -> float:
        return round(sum(q.gold_score for q in self.questions), 2)

    @property
    def max_overall(self) -> float:
        return round(sum(q.max_points for q in self.questions), 2)

    @property
    def error_families(self) -> list[str]:
        return sorted({q.error_family for q in self.questions if q.error_family})


# ---------------------------------------------------------------------------
# Lessons — the teacher correction injected for each error family.
# Written as GENERAL rules (not paper-specific) so a genuine transfer test
# is possible: the rule must apply to an unseen item of the same family.
# ---------------------------------------------------------------------------

LESSONS: dict[str, str] = {
    "math.leading_coeff_condition": (
        "Khi phương trình bậc hai có tham số ở hệ số của x² (dạng "
        "(…)x² + … = 0), phải đặt điều kiện hệ số đó khác 0 để phương "
        "trình thực sự là bậc hai, TRƯỚC khi xét Δ. Kết luận miền tham số "
        "phải loại bỏ giá trị làm hệ số bậc hai bằng 0; thiếu là thiếu điều kiện."
    ),
    "math.vieta_sign": (
        "Định lý Vi-ét cho x² + bx + c = 0: tổng hai nghiệm x₁ + x₂ = −b "
        "(có dấu trừ), tích x₁·x₂ = c. Nhầm tổng thành +b sẽ cho b sai dấu — "
        "luôn kiểm tra lại dấu của b từ tổng hai nghiệm."
    ),
    "math.forgot_domain_condition": (
        "Với phương trình chứa căn thức (hoặc ẩn ở mẫu), phải đặt điều kiện "
        "xác định TRƯỚC; bình phương hai vế chỉ tương đương khi cả hai vế "
        "không âm. Sau khi giải, BẮT BUỘC thử lại để loại nghiệm ngoại lai "
        "không thỏa điều kiện."
    ),
    "chem.unbalanced_equation": (
        "Sau khi viết đúng các chất sản phẩm, BẮT BUỘC cân bằng số nguyên tử "
        "của mọi nguyên tố ở hai vế (kể cả H và O). Phương trình tuy đúng chất "
        "nhưng chưa cân bằng hệ số thì vẫn là chưa hoàn chỉnh, không được điểm tối đa."
    ),
    "chem.wrong_oxidation_state": (
        "Số oxi hóa của kim loại trong oxit/muối tính từ tổng đại số số oxi hóa "
        "= 0 (O thường −2, kim loại kiềm +1). Phân biệt các muối cùng kim loại "
        "khác số oxh: KMnO₄ (Mn +7) ≠ K₂MnO₄ (Mn +6); K₂Cr₂O₇ và K₂CrO₄ đều Cr +6."
    ),
    "bio.phenotype_ratio": (
        "Tỉ lệ kiểu hình phụ thuộc số cặp gen dị hợp: lai một cặp Aa × Aa cho "
        "3 : 1; lai hai cặp độc lập AaBb × AaBb cho 9 : 3 : 3 : 1. Không được áp "
        "tỉ lệ của phép lai một cặp cho phép lai nhiều cặp."
    ),
    "bio.conditional_genotype_ratio": (
        "Khi đề hỏi tỉ lệ kiểu gen TRONG SỐ cá thể mang một kiểu hình (vd 'trong "
        "số con không bị bệnh', 'trong số cây hoa đỏ'), phải LOẠI các kiểu gen "
        "không thuộc nhóm đó rồi tính lại tỉ lệ trên tổng mới. Vd loại aa khỏi "
        "1AA : 2Aa : 1aa ⇒ còn 1/3 AA : 2/3 Aa."
    ),
}


# ---------------------------------------------------------------------------
# MATH items — 2 error families × 2 items (train/transfer) + 1 clean control
# ---------------------------------------------------------------------------

def _de(title_line: str, *body: str) -> list[str]:
    return [title_line, "Họ tên học sinh: ……………………  Lớp: ……………", "", *body]


MATH_ITEMS: list[Item] = [
    # --- Family A: leading_coeff_condition --------------------------------
    Item(
        id="math_lcc_01",
        subject="math",
        de_title="ĐỀ — TOÁN 10",
        de_lines=_de(
            "Môn: Toán · Lớp 10",
            "Câu 1 (3.0 điểm). Tìm tất cả giá trị của m để phương trình",
            "      (m − 1)x² − 2mx + (m + 2) = 0",
            "có hai nghiệm phân biệt.",
        ),
        bailam_title="BÀI LÀM (Toán)",
        bailam_lines=[
            "Họ tên: Trần Minh Khôi · Lớp 10A1",
            "",
            "Câu 1.",
            "Δ' = m² − (m − 1)(m + 2)",
            "   = m² − (m² + m − 2)",
            "   = −m + 2 = 2 − m",
            "Để pt có 2 nghiệm phân biệt: Δ' > 0 → 2 − m > 0 → m < 2.",
            "Vậy m < 2.",
        ],
        questions=[
            Question(
                num=1, max_points=3.0, gold_score=2.0,
                error_family="math.leading_coeff_condition",
                error_desc=(
                    "Δ' đúng và m<2 đúng, nhưng QUÊN điều kiện hệ số bậc hai "
                    "m−1≠0 (m≠1). Đáp án đúng phải là m<2 và m≠1. Trừ ~1.0đ."
                ),
            ),
        ],
    ),
    Item(
        id="math_lcc_02",  # transfer: same family, different numbers
        subject="math",
        de_title="ĐỀ — TOÁN 10",
        de_lines=_de(
            "Môn: Toán · Lớp 10",
            "Câu 1 (3.0 điểm). Tìm m để phương trình",
            "      (m + 2)x² + 2(m − 1)x + m = 0",
            "có hai nghiệm phân biệt.",
        ),
        bailam_title="BÀI LÀM (Toán)",
        bailam_lines=[
            "Họ tên: Phạm Gia Hân · Lớp 10A3",
            "",
            "Câu 1.",
            "Δ' = (m − 1)² − (m + 2)·m",
            "   = m² − 2m + 1 − m² − 2m",
            "   = 1 − 4m",
            "Để pt có 2 nghiệm phân biệt: Δ' > 0 → 1 − 4m > 0 → m < 1/4.",
            "Vậy m < 1/4.",
        ],
        questions=[
            Question(
                num=1, max_points=3.0, gold_score=2.0,
                error_family="math.leading_coeff_condition",
                error_desc=(
                    "Δ' đúng và m<1/4 đúng, nhưng QUÊN điều kiện m+2≠0 (m≠−2). "
                    "Đáp án đúng: m<1/4 và m≠−2. Trừ ~1.0đ."
                ),
            ),
        ],
    ),
    # --- Family B: vieta_sign --------------------------------------------
    Item(
        id="math_vieta_01",
        subject="math",
        de_title="ĐỀ — TOÁN 10",
        de_lines=_de(
            "Môn: Toán · Lớp 10",
            "Câu 1 (3.0 điểm). Phương trình x² + bx + c = 0 có hai nghiệm",
            "là 3 và −4. Tìm b và c.",
        ),
        bailam_title="BÀI LÀM (Toán)",
        bailam_lines=[
            "Họ tên: Nguyễn Khánh An · Lớp 10A1",
            "",
            "Câu 1.",
            "Theo Vi-ét:",
            "x₁ + x₂ = b → 3 + (−4) = b → b = −1",
            "x₁ · x₂ = c → 3 · (−4) = c → c = −12",
            "Vậy b = −1, c = −12.",
        ],
        questions=[
            Question(
                num=1, max_points=3.0, gold_score=1.5,
                error_family="math.vieta_sign",
                error_desc=(
                    "Sai dấu Vi-ét: dùng x₁+x₂=b thay vì −b ⇒ b=−1 (sai dấu, "
                    "đúng phải b=1). c=−12 đúng. Trừ ~1.5đ."
                ),
            ),
        ],
    ),
    Item(
        id="math_vieta_02",  # transfer
        subject="math",
        de_title="ĐỀ — TOÁN 10",
        de_lines=_de(
            "Môn: Toán · Lớp 10",
            "Câu 1 (3.0 điểm). Phương trình x² + bx + c = 0 có hai nghiệm",
            "là −2 và 5. Tìm b và c.",
        ),
        bailam_title="BÀI LÀM (Toán)",
        bailam_lines=[
            "Họ tên: Lê Hoàng Long · Lớp 10A2",
            "",
            "Câu 1.",
            "Theo Vi-ét:",
            "x₁ + x₂ = b → (−2) + 5 = b → b = 3",
            "x₁ · x₂ = c → (−2) · 5 = c → c = −10",
            "Vậy b = 3, c = −10.",
        ],
        questions=[
            Question(
                num=1, max_points=3.0, gold_score=1.5,
                error_family="math.vieta_sign",
                error_desc=(
                    "Sai dấu Vi-ét: b=3 (sai dấu, đúng phải b=−3). c=−10 đúng. "
                    "Trừ ~1.5đ."
                ),
            ),
        ],
    ),
    # --- Family C: forgot_domain_condition (web-documented top error) ------
    Item(
        id="math_dkxd_01",
        subject="math",
        de_title="ĐỀ — TOÁN 10",
        de_lines=_de(
            "Môn: Toán · Lớp 10",
            "Câu 1 (3.0 điểm). Giải phương trình  √(x + 3) = x − 3.",
        ),
        bailam_title="BÀI LÀM (Toán)",
        bailam_lines=[
            "Họ tên: Đỗ Thu Trang · Lớp 10A2",
            "",
            "Câu 1.",
            "Bình phương hai vế: x + 3 = (x − 3)²",
            "x + 3 = x² − 6x + 9",
            "x² − 7x + 6 = 0",
            "→ x = 1 hoặc x = 6.",
            "Vậy phương trình có hai nghiệm x = 1 và x = 6.",
        ],
        questions=[
            Question(
                num=1, max_points=3.0, gold_score=1.5,
                error_family="math.forgot_domain_condition",
                error_desc=(
                    "Biến đổi đúng nhưng KHÔNG đặt ĐK (x−3≥0) và không thử lại: "
                    "x=1 là nghiệm ngoại lai (√4=2 ≠ −2). Đáp án đúng chỉ x=6. "
                    "Trừ ~1.5đ."
                ),
            ),
        ],
    ),
    Item(
        id="math_dkxd_02",  # transfer
        subject="math",
        de_title="ĐỀ — TOÁN 10",
        de_lines=_de(
            "Môn: Toán · Lớp 10",
            "Câu 1 (3.0 điểm). Giải phương trình  √(2x + 1) = x − 1.",
        ),
        bailam_title="BÀI LÀM (Toán)",
        bailam_lines=[
            "Họ tên: Bùi Tuấn Kiệt · Lớp 10A3",
            "",
            "Câu 1.",
            "Bình phương hai vế: 2x + 1 = (x − 1)²",
            "2x + 1 = x² − 2x + 1",
            "x² − 4x = 0",
            "→ x = 0 hoặc x = 4.",
            "Vậy phương trình có hai nghiệm x = 0 và x = 4.",
        ],
        questions=[
            Question(
                num=1, max_points=3.0, gold_score=1.5,
                error_family="math.forgot_domain_condition",
                error_desc=(
                    "Biến đổi đúng nhưng không đặt ĐK (x−1≥0) và không thử lại: "
                    "x=0 ngoại lai (√1=1 ≠ −1). Đáp án đúng chỉ x=4. Trừ ~1.5đ."
                ),
            ),
        ],
    ),
    # --- Control: fully correct (specificity check) -----------------------
    Item(
        id="math_clean_01",
        subject="math",
        de_title="ĐỀ — TOÁN 10",
        de_lines=_de(
            "Môn: Toán · Lớp 10",
            "Câu 1 (3.0 điểm). Giải phương trình x² − 5x + 6 = 0.",
        ),
        bailam_title="BÀI LÀM (Toán)",
        bailam_lines=[
            "Họ tên: Vũ Bảo Ngọc · Lớp 10A1",
            "",
            "Câu 1.",
            "Δ = 25 − 24 = 1",
            "x = (5 ± 1)/2 → x = 3 hoặc x = 2.",
            "Vậy phương trình có hai nghiệm x = 2 và x = 3.",
        ],
        questions=[
            Question(
                num=1, max_points=3.0, gold_score=3.0,
                error_family=None,
                error_desc="Đúng hoàn toàn — dùng làm đối chứng specificity.",
            ),
        ],
    ),
]


# ---------------------------------------------------------------------------
# CHEM items — 2 error families × 2 (train/transfer) + 1 clean control
# ---------------------------------------------------------------------------

CHEM_ITEMS: list[Item] = [
    # --- Family: unbalanced_equation -------------------------------------
    Item(
        id="chem_bal_01",
        subject="chem",
        de_title="ĐỀ — HOÁ HỌC 10",
        de_lines=_de(
            "Môn: Hoá học · Lớp 10",
            "Câu 1 (3.0 điểm). Cân bằng phương trình hoá học sau:",
            "      Cu + H₂SO₄ (đặc, nóng) → CuSO₄ + SO₂ + H₂O",
        ),
        bailam_title="BÀI LÀM (Hoá)",
        bailam_lines=[
            "Họ tên: Nguyễn Khánh An · Lớp 10A1",
            "",
            "Câu 1.",
            "Cu + H₂SO₄ → CuSO₄ + SO₂ + H₂O",
            "Vậy phương trình đã cân bằng.",
        ],
        questions=[
            Question(
                num=1, max_points=3.0, gold_score=1.5,
                error_family="chem.unbalanced_equation",
                error_desc=(
                    "Đúng chất nhưng CHƯA cân bằng hệ số (H, O lệch). Đúng phải "
                    "là Cu + 2H₂SO₄ → CuSO₄ + SO₂ + 2H₂O. Trừ ~1.5đ."
                ),
            ),
        ],
    ),
    Item(
        id="chem_bal_02",  # transfer
        subject="chem",
        de_title="ĐỀ — HOÁ HỌC 10",
        de_lines=_de(
            "Môn: Hoá học · Lớp 10",
            "Câu 1 (3.0 điểm). Cân bằng phương trình hoá học sau:",
            "      Al + HCl → AlCl₃ + H₂",
        ),
        bailam_title="BÀI LÀM (Hoá)",
        bailam_lines=[
            "Họ tên: Trần Bảo Long · Lớp 10A2",
            "",
            "Câu 1.",
            "Al + HCl → AlCl₃ + H₂",
            "Vậy phương trình đã cân bằng.",
        ],
        questions=[
            Question(
                num=1, max_points=3.0, gold_score=1.5,
                error_family="chem.unbalanced_equation",
                error_desc=(
                    "Đúng chất nhưng chưa cân bằng. Đúng phải là "
                    "2Al + 6HCl → 2AlCl₃ + 3H₂. Trừ ~1.5đ."
                ),
            ),
        ],
    ),
    # --- Family: wrong_oxidation_state -----------------------------------
    Item(
        id="chem_oxh_01",
        subject="chem",
        de_title="ĐỀ — HOÁ HỌC 10",
        de_lines=_de(
            "Môn: Hoá học · Lớp 10",
            "Câu 1 (3.0 điểm). Xác định số oxi hoá của Mn trong các chất:",
            "      MnO₂, KMnO₄, MnSO₄, K₂MnO₄.",
        ),
        bailam_title="BÀI LÀM (Hoá)",
        bailam_lines=[
            "Họ tên: Lê Minh Châu · Lớp 10A1",
            "",
            "Câu 1.",
            "MnO₂  : Mn = +4",
            "KMnO₄ : Mn = +7",
            "MnSO₄ : Mn = +2",
            "K₂MnO₄: Mn = +7",
        ],
        questions=[
            Question(
                num=1, max_points=3.0, gold_score=2.25,
                error_family="chem.wrong_oxidation_state",
                error_desc=(
                    "3/4 đúng; K₂MnO₄ ghi +7 là SAI, đúng là +6 (manganat). "
                    "Trừ ~0.75đ (1/4 ý)."
                ),
            ),
        ],
    ),
    Item(
        id="chem_oxh_02",  # transfer
        subject="chem",
        de_title="ĐỀ — HOÁ HỌC 10",
        de_lines=_de(
            "Môn: Hoá học · Lớp 10",
            "Câu 1 (3.0 điểm). Xác định số oxi hoá của Cr trong các chất:",
            "      Cr₂O₃, K₂CrO₄, K₂Cr₂O₇, CrCl₃.",
        ),
        bailam_title="BÀI LÀM (Hoá)",
        bailam_lines=[
            "Họ tên: Phạm Quỳnh Anh · Lớp 10A3",
            "",
            "Câu 1.",
            "Cr₂O₃  : Cr = +3",
            "K₂CrO₄ : Cr = +6",
            "K₂Cr₂O₇: Cr = +7",
            "CrCl₃  : Cr = +3",
        ],
        questions=[
            Question(
                num=1, max_points=3.0, gold_score=2.25,
                error_family="chem.wrong_oxidation_state",
                error_desc=(
                    "3/4 đúng; K₂Cr₂O₇ ghi +7 là SAI, đúng là +6. Trừ ~0.75đ."
                ),
            ),
        ],
    ),
    # --- Control: fully correct ------------------------------------------
    Item(
        id="chem_clean_01",
        subject="chem",
        de_title="ĐỀ — HOÁ HỌC 10",
        de_lines=_de(
            "Môn: Hoá học · Lớp 10",
            "Câu 1 (3.0 điểm). Cân bằng phương trình hoá học sau:",
            "      Fe + H₂SO₄ (loãng) → FeSO₄ + H₂",
        ),
        bailam_title="BÀI LÀM (Hoá)",
        bailam_lines=[
            "Họ tên: Vũ Hải Đăng · Lớp 10A1",
            "",
            "Câu 1.",
            "Fe + H₂SO₄ → FeSO₄ + H₂",
            "Số nguyên tử mỗi nguyên tố hai vế đã bằng nhau → đã cân bằng.",
        ],
        questions=[
            Question(
                num=1, max_points=3.0, gold_score=3.0,
                error_family=None,
                error_desc="Đúng hoàn toàn (tỉ lệ 1:1:1:1) — đối chứng specificity.",
            ),
        ],
    ),
]


# ---------------------------------------------------------------------------
# BIO items — 2 error families × 2 (train/transfer) + 1 clean control
# ---------------------------------------------------------------------------

BIO_ITEMS: list[Item] = [
    # --- Family: phenotype_ratio -----------------------------------------
    Item(
        id="bio_ph_01",
        subject="bio",
        de_title="ĐỀ — SINH HỌC 12",
        de_lines=_de(
            "Môn: Sinh học · Lớp 12",
            "Câu 1 (3.0 điểm). Gen A (hoa đỏ) trội hoàn toàn so với a (hoa trắng).",
            "Cho Aa × Aa. Xác định tỉ lệ kiểu gen và kiểu hình ở đời con.",
        ),
        bailam_title="BÀI LÀM (Sinh)",
        bailam_lines=[
            "Họ tên: Lê Thị Hà · Lớp 12A2",
            "",
            "Câu 1.",
            "Aa × Aa",
            "Kiểu gen: 1 AA : 2 Aa : 1 aa.",
            "Kiểu hình: 1 đỏ : 1 trắng.",
        ],
        questions=[
            Question(
                num=1, max_points=3.0, gold_score=1.5,
                error_family="bio.phenotype_ratio",
                error_desc=(
                    "Kiểu gen 1:2:1 đúng; kiểu hình SAI: ghi 1:1, đúng phải 3 đỏ "
                    ": 1 trắng. Trừ ~1.5đ."
                ),
            ),
        ],
    ),
    Item(
        id="bio_ph_02",  # transfer
        subject="bio",
        de_title="ĐỀ — SINH HỌC 12",
        de_lines=_de(
            "Môn: Sinh học · Lớp 12",
            "Câu 1 (3.0 điểm). Cho AaBb × AaBb (hai gen phân li độc lập, trội",
            "hoàn toàn). Xác định tỉ lệ kiểu hình ở đời con.",
        ),
        bailam_title="BÀI LÀM (Sinh)",
        bailam_lines=[
            "Họ tên: Đặng Gia Bảo · Lớp 12A1",
            "",
            "Câu 1.",
            "AaBb × AaBb, hai gen độc lập.",
            "Mỗi cặp cho 3 : 1 nên đời con có tỉ lệ kiểu hình 3 : 1.",
        ],
        questions=[
            Question(
                num=1, max_points=3.0, gold_score=1.0,
                error_family="bio.phenotype_ratio",
                error_desc=(
                    "Áp tỉ lệ phép lai MỘT cặp (3:1) cho phép lai HAI cặp. Đúng "
                    "phải là 9 : 3 : 3 : 1. Trừ ~2.0đ."
                ),
            ),
        ],
    ),
    # --- Family: conditional_genotype_ratio (web-documented) -------------
    Item(
        id="bio_cond_01",
        subject="bio",
        de_title="ĐỀ — SINH HỌC 12",
        de_lines=_de(
            "Môn: Sinh học · Lớp 12",
            "Câu 1 (3.0 điểm). Gen A (bình thường) trội hoàn toàn so với a (bệnh).",
            "Bố mẹ Aa × Aa. Trong số những người con KHÔNG bị bệnh,",
            "tỉ lệ kiểu gen là bao nhiêu?",
        ),
        bailam_title="BÀI LÀM (Sinh)",
        bailam_lines=[
            "Họ tên: Hoàng Mai Phương · Lớp 12A2",
            "",
            "Câu 1.",
            "Aa × Aa → đời con 1 AA : 2 Aa : 1 aa.",
            "Người không bị bệnh có kiểu gen AA hoặc Aa.",
            "Tỉ lệ kiểu gen: 1/4 AA : 2/4 Aa.",
        ],
        questions=[
            Question(
                num=1, max_points=3.0, gold_score=1.0,
                error_family="bio.conditional_genotype_ratio",
                error_desc=(
                    "Không LOẠI aa và không tính lại trên tổng mới. Đúng phải là "
                    "1/3 AA : 2/3 Aa (trong số con không bệnh). Trừ ~2.0đ."
                ),
            ),
        ],
    ),
    Item(
        id="bio_cond_02",  # transfer
        subject="bio",
        de_title="ĐỀ — SINH HỌC 12",
        de_lines=_de(
            "Môn: Sinh học · Lớp 12",
            "Câu 1 (3.0 điểm). Gen A (hoa đỏ) trội hoàn toàn so với a (hoa trắng).",
            "Cho Aa × Aa. Trong số các cây hoa ĐỎ ở đời con,",
            "tỉ lệ kiểu gen là bao nhiêu?",
        ),
        bailam_title="BÀI LÀM (Sinh)",
        bailam_lines=[
            "Họ tên: Ngô Tuấn Anh · Lớp 12A3",
            "",
            "Câu 1.",
            "Aa × Aa → đời con 1 AA : 2 Aa : 1 aa.",
            "Cây hoa đỏ gồm AA và Aa.",
            "Tỉ lệ kiểu gen: 1 AA : 2 Aa : 1 aa.",
        ],
        questions=[
            Question(
                num=1, max_points=3.0, gold_score=1.0,
                error_family="bio.conditional_genotype_ratio",
                error_desc=(
                    "Giữ nguyên 1:2:1 (còn cả aa) thay vì lọc nhóm hoa đỏ. Đúng "
                    "phải là 1/3 AA : 2/3 Aa. Trừ ~2.0đ."
                ),
            ),
        ],
    ),
    # --- Control: fully correct ------------------------------------------
    Item(
        id="bio_clean_01",
        subject="bio",
        de_title="ĐỀ — SINH HỌC 12",
        de_lines=_de(
            "Môn: Sinh học · Lớp 12",
            "Câu 1 (3.0 điểm). Gen A (hoa đỏ) trội hoàn toàn so với a (hoa trắng).",
            "Cho cây thuần chủng AA × aa. Xác định tỉ lệ kiểu gen, kiểu hình ở F1.",
        ),
        bailam_title="BÀI LÀM (Sinh)",
        bailam_lines=[
            "Họ tên: Trịnh Khánh Vy · Lớp 12A1",
            "",
            "Câu 1.",
            "P: AA × aa → F1: 100% Aa.",
            "Kiểu hình F1: 100% hoa đỏ.",
        ],
        questions=[
            Question(
                num=1, max_points=3.0, gold_score=3.0,
                error_family=None,
                error_desc="Đúng hoàn toàn — đối chứng specificity.",
            ),
        ],
    ),
]


ALL_ITEMS: list[Item] = MATH_ITEMS + CHEM_ITEMS + BIO_ITEMS


# ---------------------------------------------------------------------------
# Emit
# ---------------------------------------------------------------------------

def build(out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest_items: list[dict] = []
    for it in ALL_ITEMS:
        de_path = out_dir / f"{it.id}_de.pdf"
        bailam_path = out_dir / f"{it.id}_bailam.pdf"
        write_pdf(de_path, it.de_title, it.de_lines)
        write_pdf(bailam_path, it.bailam_title, it.bailam_lines)
        manifest_items.append({
            "id": it.id,
            "subject": it.subject,
            "de_pdf": de_path.name,
            "bailam_pdf": bailam_path.name,
            "de_text": "\n".join(it.de_lines),
            "gold_overall": it.gold_overall,
            "max_overall": it.max_overall,
            "error_families": it.error_families,
            "is_control": not it.error_families,
            "questions": [asdict(q) for q in it.questions],
        })
        tag = "control" if not it.error_families else ", ".join(it.error_families)
        print(f"  ✓ {it.id:<16} gold {it.gold_overall}/{it.max_overall}  [{tag}]")

    manifest = {
        "lessons": LESSONS,
        "items": manifest_items,
    }
    gold_path = out_dir / "gold.json"
    gold_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\n  ✓ gold.json ({len(manifest_items)} items, "
          f"{len(LESSONS)} lessons) → {gold_path}")

    # Sanity summary for the transfer split.
    fams: dict[str, list[str]] = {}
    for it in ALL_ITEMS:
        for fam in it.error_families:
            fams.setdefault(fam, []).append(it.id)
    print("\n  Họ lỗi (cần ≥2 bài để test transfer):")
    for fam, ids in fams.items():
        ok = "✓" if len(ids) >= 2 else "✗ thiếu bài"
        print(f"    {ok} {fam}: {ids}")


def main(argv: list[str]) -> int:
    out_dir = Path(argv[1] if len(argv) > 1 else "benchmark").resolve()
    print(f"Benchmark dir: {out_dir}\n")
    build(out_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
