"""
eval_metrics.py — HITL grading evaluation report (read-only).

Answers the thesis question: *does the human-in-the-loop loop actually
make the AI grade closer to the teacher?* Reads the same SQLite DB the
backend writes (`backend/data/hitl_mirror.db`) and computes, over every
run the teacher finalized:

  • AI↔teacher agreement on the overall score (MAE / RMSE / bias /
    % within ±0.5 and ±1.0 on the VN 10-point scale).
  • The same agreement at the per-câu level.
  • A per-subject MAE breakdown.
  • A LEARNING CURVE: for each graded paper, how many lessons already
    existed when the AI graded it, versus how far off it was. If the loop
    works, |deviation| should fall as the lesson corpus grows — reported
    as binned means plus a correlation coefficient (expected negative).

Pure stdlib (sqlite3 / json / statistics / csv). Opens the DB read-only
so it is safe to run while the server is up, and never touches ChromaDB.

Usage:
    python scripts/eval_metrics.py                 # print report
    python scripts/eval_metrics.py --csv out.csv   # also dump per-paper rows
    python scripts/eval_metrics.py --db <path>     # custom DB location

The overall score is reconstructed as the sum of per-câu scores
(``per_question_feedback[].score``) — matching the backend's definition
"overall = sum of per-câu" — so it does not depend on any frontend-sent
total field that may be absent on older rows.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sqlite3
import statistics
import sys
from dataclasses import dataclass
from pathlib import Path

# Vietnamese output on Windows (cp1252 console) — same trick as main.py.
try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
except Exception:
    pass

DEFAULT_DB = Path(__file__).resolve().parent.parent / "backend" / "data" / "hitl_mirror.db"

_CAU_RE = re.compile(r"^\s*C[âa]u\s+(\d+)", re.IGNORECASE)


def _question_number(raw: str, fallback: int) -> int:
    """Câu number from a 'Câu N …' label, mirroring store.py."""
    match = _CAU_RE.match(raw or "")
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            return fallback
    return fallback


def _per_cau_scores(grade_json: str) -> dict[int, float]:
    """Map câu-number → score from a grade envelope's per_question_feedback."""
    try:
        grade = json.loads(grade_json or "{}")
    except Exception:
        return {}
    pqf = grade.get("per_question_feedback") if isinstance(grade, dict) else None
    if not isinstance(pqf, list):
        return {}
    out: dict[int, float] = {}
    for i, item in enumerate(pqf):
        if not isinstance(item, dict):
            continue
        num = _question_number(str(item.get("question") or ""), i + 1)
        score = item.get("score")
        if isinstance(score, (int, float)):
            out[num] = float(score)
    return out


@dataclass
class Paper:
    run_id: int
    subject: str
    run_ts: str
    ai_cau: dict[int, float]
    teacher_cau: dict[int, float]
    lessons_before: int
    latency_ms: int = 0
    total_tokens: int = 0
    model: str = ""

    @property
    def ai_overall(self) -> float:
        return round(sum(self.ai_cau.values()), 2)

    @property
    def teacher_overall(self) -> float:
        return round(sum(self.teacher_cau.values()), 2)

    @property
    def overall_dev(self) -> float:
        """teacher − AI on the overall score."""
        return round(self.teacher_overall - self.ai_overall, 2)


def load_papers(db_path: Path) -> list[Paper]:
    """Every finalized run, joined to its AI grade, ordered by grade time."""
    uri = f"file:{db_path}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    try:
        # One row per run: a teacher who unlocks + re-finalizes writes
        # several approved_grades for the same run_id, so a naive JOIN
        # double-counts that paper. Take the LATEST approved grade per run
        # (the teacher's final word) by matching on its max id.
        # Perf columns (latency_ms/total_tokens/model_name) were added in v2.
        # This read-only tool doesn't run migrations, so an older DB may lack
        # them — select real columns only when present, else 0/'' placeholders.
        cols = {r[1] for r in conn.execute("PRAGMA table_info(pipeline_runs)")}
        perf = (
            "pr.latency_ms, pr.total_tokens, pr.model_name"
            if {"latency_ms", "total_tokens", "model_name"} <= cols
            else "0 AS latency_ms, 0 AS total_tokens, '' AS model_name"
        )
        rows = conn.execute(
            f"""
            SELECT pr.id, pr.subject, pr.timestamp, pr.grade_json, ag.grade_json,
                   {perf}
            FROM pipeline_runs pr
            JOIN approved_grades ag ON ag.id = (
                SELECT a2.id FROM approved_grades a2
                WHERE a2.run_id = pr.id
                ORDER BY a2.timestamp DESC, a2.id DESC
                LIMIT 1
            )
            ORDER BY pr.timestamp ASC
            """
        ).fetchall()
        # Lesson timestamps, sorted, for the "lessons that existed when this
        # paper was graded" count (causal: only prior lessons could help).
        lesson_ts = [
            ts for (ts,) in conn.execute(
                "SELECT timestamp FROM lessons ORDER BY timestamp ASC"
            ).fetchall()
            if ts
        ]
    finally:
        conn.close()

    papers: list[Paper] = []
    for (run_id, subject, run_ts, ai_json, teacher_json,
         latency_ms, total_tokens, model) in rows:
        ai_cau = _per_cau_scores(ai_json)
        teacher_cau = _per_cau_scores(teacher_json)
        if not ai_cau or not teacher_cau:
            continue  # can't compare a paper with no parseable scores
        before = sum(1 for ts in lesson_ts if ts < run_ts)
        papers.append(
            Paper(
                run_id=run_id,
                subject=(subject or "?"),
                run_ts=run_ts,
                ai_cau=ai_cau,
                teacher_cau=teacher_cau,
                lessons_before=before,
                latency_ms=int(latency_ms or 0),
                total_tokens=int(total_tokens or 0),
                model=(model or ""),
            )
        )
    return papers


# --- metric helpers --------------------------------------------------------

def _mae(devs: list[float]) -> float:
    return round(statistics.mean(abs(d) for d in devs), 3) if devs else 0.0


def _rmse(devs: list[float]) -> float:
    return round((statistics.mean(d * d for d in devs)) ** 0.5, 3) if devs else 0.0


def _pct_within(devs: list[float], tol: float) -> float:
    if not devs:
        return 0.0
    return round(100 * sum(1 for d in devs if abs(d) <= tol) / len(devs), 1)


def _agreement_block(title: str, devs: list[float]) -> list[str]:
    if not devs:
        return [f"{title}: (không có dữ liệu)"]
    bias = round(statistics.mean(devs), 3)
    return [
        f"{title}  (n={len(devs)})",
        f"  MAE            {_mae(devs):.3f}",
        f"  RMSE           {_rmse(devs):.3f}",
        f"  Bias (GV−AI)   {bias:+.3f}",
        f"  Trong ±0.5     {_pct_within(devs, 0.5):.1f}%",
        f"  Trong ±1.0     {_pct_within(devs, 1.0):.1f}%",
    ]


def per_cau_devs(papers: list[Paper]) -> list[float]:
    """All per-câu (teacher − AI) deltas across every paper."""
    devs: list[float] = []
    for p in papers:
        for cau, ai_val in p.ai_cau.items():
            if cau in p.teacher_cau:
                devs.append(round(p.teacher_cau[cau] - ai_val, 2))
    return devs


def learning_curve(papers: list[Paper], bins: int = 3) -> list[str]:
    """Mean |overall deviation| bucketed by lessons-available-at-grade-time."""
    if len(papers) < 2:
        return ["Đường cong học: cần ≥2 bài đã chốt để so sánh."]

    pts = sorted(((p.lessons_before, abs(p.overall_dev)) for p in papers))
    xs = [x for x, _ in pts]
    ys = [y for _, y in pts]

    lines = ["Đường cong học (|lệch tổng| theo số lessons có sẵn lúc chấm):"]
    # Equal-count bins by lesson exposure so early vs late papers compare.
    n = len(pts)
    size = max(1, n // bins)
    for b in range(bins):
        lo = b * size
        hi = n if b == bins - 1 else min(n, (b + 1) * size)
        if lo >= hi:
            continue
        chunk = pts[lo:hi]
        lessons_lo, lessons_hi = chunk[0][0], chunk[-1][0]
        mean_dev = round(statistics.mean(d for _, d in chunk), 3)
        lines.append(
            f"  Bin {b + 1}: lessons {lessons_lo}–{lessons_hi}"
            f"  ·  n={len(chunk)}  ·  |lệch| TB={mean_dev:.3f}"
        )

    # Correlation: negative ⇒ more prior lessons, smaller deviation (good).
    if len(set(xs)) > 1 and len(set(ys)) > 1:
        try:
            r = round(statistics.correlation(xs, ys), 3)
            verdict = (
                "âm → lệch GIẢM khi tích luỹ lessons (HITL có tác dụng)"
                if r < -0.1
                else "dương → lệch tăng" if r > 0.1
                else "≈0 → chưa thấy xu hướng rõ"
            )
            lines.append(f"  Tương quan (lessons, |lệch|): r={r:+.3f}  [{verdict}]")
        except statistics.StatisticsError:
            pass
    else:
        lines.append("  (Chưa đủ biến thiên để tính tương quan.)")
    return lines


def per_subject(papers: list[Paper]) -> list[str]:
    by_sub: dict[str, list[float]] = {}
    for p in papers:
        by_sub.setdefault(p.subject, []).append(p.overall_dev)
    lines = ["MAE điểm tổng theo môn:"]
    for sub in sorted(by_sub):
        devs = by_sub[sub]
        lines.append(f"  {sub:<8} n={len(devs):<3}  MAE={_mae(devs):.3f}")
    return lines


def performance(papers: list[Paper]) -> list[str]:
    """Latency + token-cost summary.

    Only counts papers graded AFTER the v2 telemetry upgrade (latency_ms > 0);
    pre-upgrade rows logged 0 and would bias the averages toward zero.
    """
    timed = [p for p in papers if p.latency_ms > 0]
    if not timed:
        return ["HIỆU NĂNG / CHI PHÍ: (chưa có bài nào chấm sau khi bật telemetry)"]
    lat = sorted(p.latency_ms for p in timed)
    toks = [p.total_tokens for p in timed if p.total_tokens > 0]
    lines = [
        f"HIỆU NĂNG / CHI PHÍ  (n={len(timed)} bài có telemetry)",
        f"  Độ trễ TB        {statistics.mean(lat) / 1000:.1f}s",
        f"  Độ trễ trung vị  {statistics.median(lat) / 1000:.1f}s",
        f"  Độ trễ max       {max(lat) / 1000:.1f}s",
    ]
    if toks:
        lines.append(f"  Token/bài TB     {round(statistics.mean(toks))}")
        lines.append(f"  Token tổng cộng  {sum(toks)}")
    by_model: dict[str, int] = {}
    for p in timed:
        by_model[p.model or "?"] = by_model.get(p.model or "?", 0) + 1
    lines.append("  Model dùng       "
                 + ", ".join(f"{m}×{c}" for m, c in sorted(by_model.items())))
    return lines


def write_csv(papers: list[Paper], path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            ["run_id", "subject", "run_ts", "lessons_before",
             "ai_overall", "teacher_overall", "overall_dev",
             "latency_ms", "total_tokens", "model"]
        )
        for p in papers:
            w.writerow([
                p.run_id, p.subject, p.run_ts, p.lessons_before,
                p.ai_overall, p.teacher_overall, p.overall_dev,
                p.latency_ms, p.total_tokens, p.model,
            ])


def main() -> int:
    ap = argparse.ArgumentParser(description="HITL grading evaluation report.")
    ap.add_argument("--db", type=Path, default=DEFAULT_DB, help="SQLite DB path.")
    ap.add_argument("--csv", type=Path, default=None, help="Write per-paper rows here.")
    ap.add_argument("--bins", type=int, default=3, help="Learning-curve bins.")
    args = ap.parse_args()

    if not args.db.exists():
        print(f"Không tìm thấy DB: {args.db}")
        print("Chạy backend ít nhất một lần để tạo dữ liệu, rồi thử lại.")
        return 1

    papers = load_papers(args.db)
    print("=" * 56)
    print("BÁO CÁO ĐÁNH GIÁ HITL — AI vs Giáo viên")
    print("=" * 56)
    if not papers:
        print("Chưa có bài nào được chốt điểm (approved_grades trống).")
        print("Chấm + chốt điểm vài bài rồi chạy lại để có số liệu.")
        return 0

    ts = sorted(p.run_ts for p in papers)
    print(f"Số bài đã chốt: {len(papers)}   ({ts[0][:10]} → {ts[-1][:10]})")
    print()

    overall_devs = [p.overall_dev for p in papers]
    for line in _agreement_block("ĐIỂM TỔNG", overall_devs):
        print(line)
    print()
    for line in _agreement_block("PER-CÂU", per_cau_devs(papers)):
        print(line)
    print()
    for line in per_subject(papers):
        print(line)
    print()
    for line in learning_curve(papers, bins=args.bins):
        print(line)
    print()
    for line in performance(papers):
        print(line)

    if args.csv:
        write_csv(papers, args.csv)
        print()
        print(f"Đã ghi {len(papers)} dòng → {args.csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
