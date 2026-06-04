"""
run_experiment.py — HITL-RAG ablation experiment (cold vs warm).

Measures the thesis claim "HITL-RAG cải thiện độ chính xác chấm điểm" on the
labelled benchmark from ``gen_benchmark.py``. For every error item it grades:

  • COLD     — retrieval OFF (``use_lessons=False``): the AI as if no teacher
               feedback had ever been given.
  • SAME     — retrieval ON, with the family lesson taught on THIS item
               (exact-task match in retrieval). "Does the lesson stick?"
  • TRANSFER — retrieval ON, with the family lesson taught on a DIFFERENT
               item of the same error family (held-out; relies on semantic
               retrieval). "Does the correction generalise to unseen papers?"

Plus a SPECIFICITY check: grade each clean control with the subject's lessons
injected — a lesson must NOT make the grader deduct on correct work.

Error per item = |AI overall − gold overall|, with gold known by construction
from ``gold.json``. Cold-vs-warm is a PAIRED comparison (same item, two
conditions), reported with a sign test — valid at the small N a thesis pilot
has.

Isolation & safety:
  • Each condition runs against a fresh TEMPORARY MemoryManager (its own temp
    SQLite + Chroma) — the real ``backend/data`` corpus is never touched.
  • Every grade calls Gemini. The run is SEQUENTIAL (≈3 req/min, well under
    the free-tier 60/min) and CACHED per cell to ``results/`` so a quota
    interruption can resume with ``--force`` off.

Usage:
    python scripts/run_experiment.py --dry-run          # plan only, no API
    python scripts/run_experiment.py --limit 2          # smoke: 2 real grades
    python scripts/run_experiment.py                    # full sweep
    python scripts/run_experiment.py --families math.vieta_sign
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import csv
import json
import math
import os
import re
import statistics
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BACKEND = REPO / "backend"
SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND))   # backend uses bare imports (grading, memory)
sys.path.insert(0, str(SCRIPTS))   # for eval_metrics._per_cau_scores

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from eval_metrics import _per_cau_scores  # noqa: E402  (shared score extractor)


def _load_env() -> None:
    """Load backend/.env so GOOGLE_API_KEY is available (vlm_client needs it)."""
    try:
        from dotenv import load_dotenv
        load_dotenv(BACKEND / ".env")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Benchmark loading
# ---------------------------------------------------------------------------

def load_manifest(bench_dir: Path) -> dict:
    gold = bench_dir / "gold.json"
    if not gold.exists():
        sys.exit(f"Không thấy {gold}. Chạy: python scripts/gen_benchmark.py")
    return json.loads(gold.read_text(encoding="utf-8"))


def _pdf_b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


# ---------------------------------------------------------------------------
# Cell planning — one (mode, item) pair to grade
# ---------------------------------------------------------------------------

class Cell:
    """A single grade to run: which item, under which condition."""

    def __init__(self, mode: str, item: dict, *, lesson_task: str | None = None,
                 lesson_texts: list[str] | None = None):
        self.mode = mode                  # cold | same | transfer | spec
        self.item = item
        self.lesson_task = lesson_task    # task to attach the injected lesson to
        self.lesson_texts = lesson_texts or []

    @property
    def key(self) -> str:
        return f"{self.mode}__{self.item['id']}"


def plan_cells(manifest: dict, families_filter: set[str] | None,
               modes: set[str]) -> list[Cell]:
    items = {it["id"]: it for it in manifest["items"]}
    lessons = manifest["lessons"]

    # family -> [item ids] (error items only; ≥2 needed for transfer)
    fams: dict[str, list[str]] = {}
    for it in manifest["items"]:
        for fam in it["error_families"]:
            fams.setdefault(fam, []).append(it["id"])
    fams = {f: ids for f, ids in fams.items() if len(ids) >= 2}
    if families_filter:
        fams = {f: ids for f, ids in fams.items() if f in families_filter}

    cells: list[Cell] = []

    for fam, ids in fams.items():
        lesson = lessons.get(fam, "")
        for tid in ids:
            it = items[tid]
            if "cold" in modes:
                cells.append(Cell("cold", it))
            if "same" in modes:
                cells.append(Cell("same", it, lesson_task=it["de_text"],
                                  lesson_texts=[lesson]))
            if "transfer" in modes:
                # taught on a SIBLING of the same family (held-out)
                sibling = next(s for s in ids if s != tid)
                cells.append(Cell("transfer", it,
                                  lesson_task=items[sibling]["de_text"],
                                  lesson_texts=[lesson]))

    # Specificity: clean controls graded WITH the subject's lessons present.
    if "spec" in modes and not families_filter:
        subj_lessons: dict[str, list[str]] = {}
        for fam, txt in lessons.items():
            subj_lessons.setdefault(fam.split(".")[0], []).append(txt)
        for it in manifest["items"]:
            if not it["is_control"]:
                continue
            # map subject prefix: math/chem/bio share the gold.json prefix
            txts = subj_lessons.get(it["subject"], [])
            cells.append(Cell("cold", it))               # control baseline
            cells.append(Cell("spec", it, lesson_task=it["de_text"],
                              lesson_texts=txts))

    # de-dup (controls may add a duplicate "cold" cell)
    seen: set[str] = set()
    uniq: list[Cell] = []
    for c in cells:
        if c.key not in seen:
            seen.add(c.key)
            uniq.append(c)
    return uniq


# ---------------------------------------------------------------------------
# Grading
# ---------------------------------------------------------------------------

async def grade_cell(cell: Cell, bench_dir: Path, orch, mem) -> dict:
    """Run one grade against the shared orchestrator; return a result row.

    Isolation is per-cell via ``mem.clear_lessons()`` — each warm grade sees
    ONLY the lesson(s) it injects, with no cross-family contamination. A
    single long-lived MemoryManager avoids re-initialising ChromaDB 48 times
    and sidesteps the Windows file-lock that breaks per-cell temp dirs (Chroma
    keeps the sqlite/index handles open, so the dir can't be deleted yet).
    """
    it = cell.item
    de_b64 = _pdf_b64(bench_dir / it["de_pdf"])
    bailam_b64 = _pdf_b64(bench_dir / it["bailam_pdf"])
    use_lessons = cell.mode != "cold"

    mem.clear_lessons()  # reset corpus so this cell starts from a clean slate
    if use_lessons:
        for txt in cell.lesson_texts:
            if txt:
                mem.save_lesson(
                    task=cell.lesson_task or it["de_text"],
                    wrong_code="", correct_code="", lesson_text=txt,
                    feedback_score=4.0, subject=it["subject"],
                )
    # Anchor the point scale to the benchmark's known per-câu max, so the AI
    # grades on the SAME scale as gold (without it the VLM free-guesses a
    # 10-point scale and AI-vs-gold error is meaningless). This mirrors a
    # teacher supplying the point allocation; it holds the scale fixed so the
    # experiment isolates the lesson's effect on the *score*, not the scale.
    max_points_template = {
        str(q["num"]): float(q["max_points"]) for q in it["questions"]
    }
    res = await orch.run_pipeline(
        task=it["de_text"],
        image_b64=bailam_b64,
        task_pdf_b64=de_b64,
        subject=it["subject"],
        max_points_template=max_points_template,
        use_lessons=use_lessons,
    )

    ai_overall = round(sum(_per_cau_scores(res.code).values()), 2)
    gold = float(it["gold_overall"])
    return {
        "cell": cell.key,
        "mode": cell.mode,
        "id": it["id"],
        "subject": it["subject"],
        "family": (it["error_families"][0] if it["error_families"] else ""),
        "is_control": it["is_control"],
        "ai_overall": ai_overall,
        "gold_overall": gold,
        "abs_err": round(abs(ai_overall - gold), 2),
        "lessons_retrieved": len(res.lessons_used),
        # Perf/cost telemetry harvested from the same grade (one Gemini spend
        # → accuracy + performance datasets).
        "latency_ms": res.meta.get("latency_ms", 0),
        "total_tokens": res.meta.get("total_tokens", 0),
        "model": res.meta.get("model_name", ""),
    }


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

def _sign_test_p(improved: int, worse: int) -> float:
    """Two-sided sign-test p-value over items that changed (ties ignored)."""
    n = improved + worse
    if n == 0:
        return 1.0
    k = min(improved, worse)
    tail = sum(math.comb(n, i) for i in range(k + 1)) * (0.5 ** n)
    return round(min(1.0, 2 * tail), 4)


def _paired(rows: dict[str, dict], warm_mode: str) -> list[str]:
    """Cold-vs-<warm_mode> paired summary over error items present in both."""
    pairs = []
    for r in rows.values():
        if r["mode"] != warm_mode or r["is_control"]:
            continue
        cold = rows.get(f"cold__{r['id']}")
        if cold:
            pairs.append((cold["abs_err"], r["abs_err"], r["id"]))
    if not pairs:
        return [f"{warm_mode.upper()}: (chưa có cặp dữ liệu)"]
    cold_errs = [c for c, _, _ in pairs]
    warm_errs = [w for _, w, _ in pairs]
    improved = sum(1 for c, w, _ in pairs if w < c - 1e-9)
    worse = sum(1 for c, w, _ in pairs if w > c + 1e-9)
    same = len(pairs) - improved - worse
    p = _sign_test_p(improved, worse)
    return [
        f"COLD → {warm_mode.upper()}  (n={len(pairs)})",
        f"  MAE cold  {statistics.mean(cold_errs):.3f}",
        f"  MAE warm  {statistics.mean(warm_errs):.3f}",
        f"  Δ MAE     {statistics.mean(warm_errs) - statistics.mean(cold_errs):+.3f}"
        f"   (âm = tốt hơn)",
        f"  Cải thiện {improved} · xấu đi {worse} · không đổi {same}"
        f"   · sign-test p={p}",
    ]


def aggregate(rows: dict[str, dict]) -> list[str]:
    out: list[str] = ["=" * 60, "KẾT QUẢ THÍ NGHIỆM HITL-RAG (cold vs warm)", "=" * 60]
    graded = [r for r in rows.values() if not r["is_control"]]
    out.append(f"Số lượt chấm (bài lỗi): {len(graded)}")
    out.append("")
    out += _paired(rows, "same")
    out.append("")
    out += _paired(rows, "transfer")

    # Specificity
    out.append("")
    out.append("SPECIFICITY (control phải giữ điểm tối đa khi có lesson):")
    spec = [r for r in rows.values() if r["mode"] == "spec"]
    if not spec:
        out.append("  (chưa chạy)")
    for r in spec:
        base = rows.get(f"cold__{r['id']}")
        base_err = base["abs_err"] if base else None
        flag = "✗ TRỪ OAN" if r["abs_err"] > 1e-9 else "✓ giữ nguyên"
        out.append(
            f"  {r['id']:<14} cold_err={base_err} warm_err={r['abs_err']}  {flag}"
        )

    # Retrieval sanity: did transfer actually retrieve a lesson?
    out.append("")
    miss = [r["id"] for r in rows.values()
            if r["mode"] == "transfer" and r["lessons_retrieved"] == 0]
    if miss:
        out.append(f"⚠ transfer KHÔNG retrieve được lesson cho: {miss}")
    else:
        t = [r for r in rows.values() if r["mode"] == "transfer"]
        if t:
            out.append("✓ Mọi lượt transfer đều retrieve được lesson (semantic OK).")
    return out


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def _load_cached(results_dir: Path) -> dict[str, dict]:
    rows: dict[str, dict] = {}
    if results_dir.exists():
        for f in results_dir.glob("*.json"):
            try:
                r = json.loads(f.read_text(encoding="utf-8"))
                rows[r["cell"]] = r
            except Exception:
                pass
    return rows


async def run(args) -> int:
    bench_dir = Path(args.bench).resolve()
    manifest = load_manifest(bench_dir)
    fam_filter = set(args.families.split(",")) if args.families else None
    modes = set(args.modes.split(","))
    cells = plan_cells(manifest, fam_filter, modes)

    # Scope results by pinned model so a baseline A/B (e.g. gemini-3-flash vs
    # gemini-2.5-flash) doesn't clobber the other's cached cells.
    model_tag = re.sub(r"[^0-9A-Za-z._-]", "_", args.model) if args.model else ""
    if args.results_dir:
        results_dir = Path(args.results_dir).resolve()
    elif model_tag:
        results_dir = REPO / "benchmark" / "results" / model_tag
    else:
        results_dir = REPO / "benchmark" / "results"
    cached = {} if args.force else _load_cached(results_dir)
    todo = [c for c in cells if c.key not in cached]

    print(f"Benchmark: {bench_dir}")
    print(f"Cells: {len(cells)} tổng · {len(cached)} đã cache · {len(todo)} cần chấm")
    if args.dry_run:
        print("\n--dry-run: kế hoạch (không gọi Gemini):")
        for c in cells:
            mark = "cache" if c.key in cached else " TODO"
            taught = f" ← dạy trên: {c.lesson_task[:40]!r}" if c.lesson_task else ""
            print(f"  [{mark}] {c.key}{taught}")
        return 0

    _load_env()
    # Pin the model AFTER loading .env so --model wins over any GEMINI_MODEL
    # there; vlm_client.current_model_name() honours this env var.
    if args.model:
        os.environ["GEMINI_MODEL"] = args.model
        print(f"Model ghim: {args.model}")
    results_dir.mkdir(parents=True, exist_ok=True)
    rows = dict(cached)

    # One long-lived isolated memory for the whole run (see grade_cell docstring).
    from grading import AgentOrchestrator
    from memory import MemoryManager
    exp_dir = Path(tempfile.mkdtemp(prefix="hitl_exp_"))
    mem = MemoryManager(db_dir=exp_dir)
    orch = AgentOrchestrator(memory=mem)

    done = 0
    try:
        for c in todo:
            if args.limit and done >= args.limit:
                print(f"\n--limit {args.limit} đạt — dừng (còn {len(todo) - done} cell).")
                break
            try:
                r = await grade_cell(c, bench_dir, orch, mem)
            except Exception as exc:
                print(f"  ✗ {c.key}: {type(exc).__name__}: {exc}")
                continue
            rows[c.key] = r
            (results_dir / f"{c.key}.json").write_text(
                json.dumps(r, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(f"  ✓ {c.key:<24} AI={r['ai_overall']} gold={r['gold_overall']} "
                  f"|err|={r['abs_err']} (lessons={r['lessons_retrieved']})")
            done += 1
    finally:
        # Best-effort temp cleanup; Chroma may hold handles until the process
        # exits, in which case the OS reclaims %TEMP% later — harmless.
        import gc
        import shutil
        del orch, mem
        gc.collect()
        shutil.rmtree(exp_dir, ignore_errors=True)

    print()
    for line in aggregate(rows):
        print(line)

    # CSV dump for the thesis charts.
    csv_path = results_dir / "results.csv"
    if rows:
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(next(iter(rows.values())).keys()))
            w.writeheader()
            for r in rows.values():
                w.writerow(r)
        print(f"\nĐã ghi {len(rows)} dòng → {csv_path}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="HITL-RAG cold-vs-warm experiment.")
    ap.add_argument("--bench", default=str(REPO / "benchmark"))
    ap.add_argument("--results-dir", default="",
                    help="Thư mục kết quả (mặc định: benchmark/results[/<model>]).")
    ap.add_argument("--model", default="",
                    help="Ghim model Gemini (vd gemini-2.5-flash) cho baseline so sánh.")
    ap.add_argument("--families", default="", help="Lọc theo họ lỗi, ngăn bởi dấu phẩy.")
    ap.add_argument("--modes", default="cold,same,transfer,spec",
                    help="Tập điều kiện chạy.")
    ap.add_argument("--limit", type=int, default=0, help="Số lượt chấm tối đa (smoke).")
    ap.add_argument("--force", action="store_true", help="Bỏ qua cache, chấm lại.")
    ap.add_argument("--dry-run", action="store_true", help="In kế hoạch, không gọi API.")
    args = ap.parse_args()
    return asyncio.run(run(args))


if __name__ == "__main__":
    raise SystemExit(main())
