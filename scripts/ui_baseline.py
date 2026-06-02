"""Capture baseline screenshots of the main UI screens for a design pass.

No backend needed — Step-3 screens get a fake grade injected via the same
hitl.openHistoryEntry CustomEvent App.tsx listens for. Shots land in
screenshots/baseline_*.png so the teacher can point at concrete pixels
when directing UI edits.
"""

from pathlib import Path
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent.parent / "screenshots"
OUT.mkdir(exist_ok=True)

GRADE = {
    "subject": "stem",
    "overall": 8.5,
    "transcript": "Câu 1.\nx^2 - 5x + 6 = 0\nΔ = 25 - 24 = 1\n→ x = 3 hoặc x = 2\n\nCâu 2.\nGiải đúng.\n\nCâu 3.\nKết luận hợp lý.",
    "comment": "[Câu 1] Tốt.",
    "weaknesses": [],
    "per_question_feedback": [
        {"question": "Câu 1", "score": 3.0, "max_points": 3.0,
         "good_points": "Tính Δ chính xác.", "errors": ""},
        {"question": "Câu 2", "score": 3.5, "max_points": 4.0,
         "good_points": "Lập luận rõ.", "errors": "Thiếu một bước."},
        {"question": "Câu 3", "score": 2.0, "max_points": 3.0,
         "good_points": "", "errors": "Sai kết luận cuối."},
    ],
}

INJECT_JS = """
(payload) => {
  const entry = {
    id: 'baseline-1', task: payload.task, subject: 'math',
    response: {
      code: payload.code,
      lessons_used: [{ id: 7, task: payload.task, wrong_code: '', correct_code: '',
        lesson_text: 'F2 phải 3:1 chứ không phải 1:1.', subject: 'math',
        timestamp: '2026-05-01T00:00:00Z', feedback_score: 4.0 }],
      run_id: 999, confidence: 'high',
    },
    finalScores: null,
  };
  window.dispatchEvent(new CustomEvent('hitl.openHistoryEntry', { detail: { entry, step: 3 } }));
}
"""


def main() -> None:
    shots = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.goto("http://localhost:3000/", wait_until="domcontentloaded")
        page.wait_for_timeout(1500)

        # 1. Upload (Step 1) — the landing screen, no grade.
        page.screenshot(path=str(OUT / "baseline_1_upload.png"), full_page=True)
        shots.append("baseline_1_upload.png")

        # Inject a grade → Step 3 review (editable).
        page.evaluate(INJECT_JS, {"code": json.dumps(GRADE, ensure_ascii=False),
                                  "task": "Toán · Đề kiểm tra"})
        page.wait_for_timeout(1500)
        page.screenshot(path=str(OUT / "baseline_2_review.png"), full_page=True)
        shots.append("baseline_2_review.png")

        # Finalize → Step 3 locked.
        try:
            btn = page.get_by_role("button", name="Chốt điểm", exact=False)
            for i in range(btn.count()):
                if btn.nth(i).is_visible():
                    btn.nth(i).click(timeout=4000)
                    break
            page.wait_for_timeout(3200)  # let toast fade so it isn't in the shot
            page.screenshot(path=str(OUT / "baseline_3_locked.png"), full_page=True)
            shots.append("baseline_3_locked.png")
        except Exception as e:
            print(f"[locked shot failed] {e}")

        ctx.close()
        browser.close()

    print("=== BASELINE SHOTS ===")
    for s in shots:
        print(f"  {OUT / s}")


if __name__ == "__main__":
    main()
