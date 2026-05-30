"""
Smoke test for Pattern B end-to-end.

Hits /api/generate with the math test PDFs and asserts the new Phase 3
contract:
  - envelope has ``overall``, ``per_question_feedback``, ``comment``,
    ``transcript`` (NO legacy ``scores`` field required)
  - per_question_feedback[i].criteria is present and well-formed
  - sum(criteria.max) per câu == câu's max_points (within 0.5 rounding)
  - sum(criteria.points) per câu == câu's score (within 0.5 rounding)
  - all criteria labels appear in the subject's rubric template

Run: python scripts/smoke_phase3.py
Requires the dev server (npm run dev) running on localhost:8000.
"""

from __future__ import annotations

import base64
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from prompts.rubric_templates import get_criteria  # noqa: E402

DE_PDF = ROOT / "test_papers" / "test_math_de.pdf"
BAILAM_PDF = ROOT / "test_papers" / "test_math_baLam.pdf"
API = "http://localhost:8000/api/generate"
TIMEOUT_S = 240  # Gemini can take a minute on math


def _b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> int:
    if not DE_PDF.exists() or not BAILAM_PDF.exists():
        print(f"!! missing PDFs: {DE_PDF} / {BAILAM_PDF}")
        return 2

    payload = {
        "task": "Môn Toán · Đề kiểm tra",
        "image_b64": _b64(BAILAM_PDF),
        "task_pdf_b64": _b64(DE_PDF),
        "subject": "math",
    }

    req = urllib.request.Request(
        API,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Origin": "http://localhost:3000"},
    )
    print(f">> POST {API}")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"!! HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:400]}")
        return 1

    code = body.get("code", "")
    print(f"<< confidence={body.get('confidence')!r}  run_id={body.get('run_id')!r}")

    try:
        envelope = json.loads(code)
    except json.JSONDecodeError as e:
        print(f"!! envelope unparseable: {e}")
        print(code[:500])
        return 1

    # ----- Envelope shape ----------------------------------------------
    print("\n=== envelope shape ===")
    keys = list(envelope.keys())
    print(f"keys: {keys}")
    has_scores = "scores" in envelope
    has_overall = "overall" in envelope
    has_pqf = "per_question_feedback" in envelope
    print(f"  scores present:   {has_scores}  (Pattern B: should be False — but tolerated)")
    print(f"  overall present:  {has_overall}")
    print(f"  pqf present:      {has_pqf}")
    print(f"  salvaged:         {envelope.get('salvaged')!r}")

    if not has_overall or not has_pqf:
        print("!! envelope missing required Pattern B fields")
        return 1

    # ----- Per-câu criteria --------------------------------------------
    pqf = envelope.get("per_question_feedback") or []
    template_labels = {c.label for c in get_criteria("math")}
    print(f"\n=== per-câu criteria ({len(pqf)} câu, math template has {len(template_labels)} labels) ===")
    print(f"template labels: {sorted(template_labels)}")

    issues: list[str] = []
    for i, q in enumerate(pqf):
        cau_id = q.get("question", f"#{i+1}")
        score = q.get("score")
        maxp = q.get("max_points")
        criteria = q.get("criteria") or []
        print(f"\n  {cau_id}  score={score}  max={maxp}")
        if not criteria:
            issues.append(f"{cau_id}: NO criteria array")
            print("    !! NO criteria array")
            continue

        sum_pts = 0.0
        sum_max = 0.0
        labels_seen: set[str] = set()
        for c in criteria:
            lbl = c.get("label", "")
            pts = c.get("points")
            mx = c.get("max")
            sum_pts += float(pts or 0)
            sum_max += float(mx or 0)
            labels_seen.add(lbl)
            tag = " ✓" if lbl in template_labels else " ✗ UNKNOWN LABEL"
            print(f"    - {lbl}: {pts}/{mx}{tag}  errors={c.get('errors', '')[:60]!r}")

        # Constraint checks
        if isinstance(score, (int, float)) and abs(sum_pts - score) > 0.5:
            issues.append(f"{cau_id}: sum(points)={sum_pts} ≠ score={score}")
        if isinstance(maxp, (int, float)) and abs(sum_max - maxp) > 0.5:
            issues.append(f"{cau_id}: sum(max)={sum_max} ≠ max_points={maxp}")
        missing = template_labels - labels_seen
        if missing:
            issues.append(f"{cau_id}: missing labels {sorted(missing)}")
        unknown = labels_seen - template_labels
        if unknown:
            issues.append(f"{cau_id}: unknown labels {sorted(unknown)}")

    print("\n=== verdict ===")
    if issues:
        print(f"!! {len(issues)} issue(s):")
        for x in issues:
            print(f"  - {x}")
        return 1
    print(f"OK — {len(pqf)} câu × {sum(len(q.get('criteria') or []) for q in pqf)} criteria, all constraints satisfied.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
