"""
normalize_approved_max.py — repair approved_grades rows whose per-câu
``max_points`` got inflated by the old maxOverrides leak.

The previous workspace allowed teacher max-overrides to be hydrated from
``tab.maxPointsTemplate`` on a fresh grade. When the template carried a
stale value from an earlier (different-paper) session, finalize-grade
wrote the corrupted max into ``approved_grades.grade_json``. Even after
the frontend fix (we now drop maxOverrides entirely), the already-saved
rows still misreport their per-câu maxes — most visibly when the teacher
loads the history entry and the hero reads "9.5/17" instead of "9.5/10".

Repair strategy:
  • For each ``approved_grades`` row, look up the corresponding
    ``pipeline_runs.grade_json`` (AI's authoritative output — never
    edited by the frontend).
  • If the per-câu lengths match AND the approved sum_max differs from
    AI's sum_max by more than 0.5 (catch corruption, ignore rounding),
    copy AI's ``max_points`` into the approved envelope verbatim.
  • Recompute ``overall = sum(score)`` so the hero number stays
    consistent with the per-câu rows.
  • Leave ``score``, ``criteria``, ``transcript``, ``comment`` and the
    rest of the envelope alone — only ``max_points`` and ``overall``
    are touched.

Idempotent — re-running on already-clean rows is a no-op. Skips rows
where the per-câu count changed between the run and the approval
(structural divergence we shouldn't blindly merge).

Run: backend/venv/Scripts/python.exe scripts/normalize_approved_max.py
     [--dry-run]
"""

from __future__ import annotations

import argparse
import io
import json
import sqlite3
import sys
from pathlib import Path

# Force UTF-8 stdout on Windows so Vietnamese labels + arrows survive
# the cp1252 default console encoding (which would otherwise crash with
# UnicodeEncodeError mid-loop on the first non-ASCII glyph we print).
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

DB = Path(__file__).resolve().parents[1] / "backend" / "data" / "hitl_mirror.db"
TOLERANCE = 0.5  # sum_max difference above which a row counts as corrupted


def _sum_max(pqf: list[dict]) -> float:
    out = 0.0
    for q in pqf:
        mp = q.get("max_points")
        if isinstance(mp, (int, float)):
            out += float(mp)
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would change without writing.",
    )
    args = parser.parse_args()

    if not DB.exists():
        print(f"!! DB not found: {DB}")
        return 2

    db = sqlite3.connect(DB)
    rows = db.execute(
        """
        SELECT a.id, a.run_id, a.grade_json, p.grade_json
        FROM approved_grades a
        JOIN pipeline_runs p ON a.run_id = p.id
        """
    ).fetchall()

    fixed = 0
    skipped = 0
    clean = 0

    for ag_id, run_id, ag_json, pr_json in rows:
        try:
            ag = json.loads(ag_json)
        except json.JSONDecodeError:
            print(f"  skip approved#{ag_id} (run {run_id}): unparseable approved_grade JSON")
            skipped += 1
            continue
        try:
            pr = json.loads(pr_json) if pr_json else None
        except json.JSONDecodeError:
            pr = None
        if pr is None:
            # Old pipeline_runs rows have empty grade_json (column added
            # later); without AI's reference we can't repair safely.
            print(f"  skip approved#{ag_id} (run {run_id}): no pipeline_run reference")
            skipped += 1
            continue

        ag_pqf = ag.get("per_question_feedback") or []
        pr_pqf = pr.get("per_question_feedback") or []

        if not isinstance(ag_pqf, list) or not isinstance(pr_pqf, list):
            skipped += 1
            continue

        if len(ag_pqf) == 0 or len(pr_pqf) == 0:
            skipped += 1
            continue

        if len(ag_pqf) != len(pr_pqf):
            print(
                f"  skip approved#{ag_id} (run {run_id}): pqf length "
                f"mismatch — approved={len(ag_pqf)} vs run={len(pr_pqf)}"
            )
            skipped += 1
            continue

        ag_sum = _sum_max(ag_pqf)
        pr_sum = _sum_max(pr_pqf)

        if abs(ag_sum - pr_sum) <= TOLERANCE:
            clean += 1
            continue

        # Repair: overwrite max_points per câu from AI's pipeline_run,
        # then recompute overall = sum(score). Scores stay teacher's.
        for ag_q, pr_q in zip(ag_pqf, pr_pqf):
            pr_max = pr_q.get("max_points")
            if isinstance(pr_max, (int, float)):
                ag_q["max_points"] = pr_max

        teacher_overall = 0.0
        for q in ag_pqf:
            s = q.get("score")
            if isinstance(s, (int, float)):
                teacher_overall += float(s)
        # Round to nearest 0.5 (project-wide grading step)
        teacher_overall = round(teacher_overall * 2) / 2
        ag["overall"] = teacher_overall

        print(
            f"  fix approved#{ag_id} (run {run_id}): "
            f"sum_max {ag_sum} → {pr_sum}, overall → {teacher_overall}"
        )

        if not args.dry_run:
            db.execute(
                "UPDATE approved_grades SET grade_json = ? WHERE id = ?",
                (json.dumps(ag, ensure_ascii=False), ag_id),
            )
        fixed += 1

    if not args.dry_run:
        db.commit()

    print()
    print(f"== summary ==")
    print(f"  fixed:   {fixed}")
    print(f"  clean:   {clean}")
    print(f"  skipped: {skipped}")
    print(f"  total:   {len(rows)}")
    if args.dry_run:
        print("\n(dry-run — no writes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
