"""Runtime smoke of the merged Step-3 flow — NO backend needed.

Injects a fake graded paper straight into the workspace via the same
``hitl.openHistoryEntry`` CustomEvent App.tsx listens for, then exercises:
  • Step 3 review surface renders (sidebar scores, paper, "Đã học từ bạn" chip)
  • "Chốt điểm & lưu" → locked state (Đã lưu pill, In phiếu chấm button)
  • "Sửa lại" → back to editable

Captures any console errors / page errors the whole time — that's the
real point (tsc/lint can't see runtime crashes). Screenshots to
screenshots/debug_*.png for eyeballing.
"""

from pathlib import Path
import json
import sys

# Windows console defaults to cp1252 → printing Vietnamese check names
# crashes. Match how backend/main.py forces UTF-8 on import.
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent.parent / "screenshots"
OUT.mkdir(exist_ok=True)

# A minimal but realistic grade envelope (matches what parseGrade expects:
# overall + per_question_feedback[] with score/max_points/good_points/errors).
GRADE = {
    "subject": "stem",
    "overall": 9.5,
    "transcript": "Câu 1.\nx^2 - 5x + 6 = 0\nΔ = 25 - 24 = 1\n→ x = 3 hoặc x = 2\n\nCâu 2.\nGiải đúng.\n\nCâu 3.\nKết luận hợp lý.",
    "comment": "[Câu 1] Tốt.",
    "weaknesses": [],
    "per_question_feedback": [
        {"question": "Câu 1", "score": 3.0, "max_points": 3.0,
         "good_points": "Tính Δ chính xác.", "errors": ""},
        {"question": "Câu 2", "score": 3.5, "max_points": 4.0,
         "good_points": "Lập luận rõ.", "errors": "Thiếu một bước."},
        {"question": "Câu 3", "score": 3.0, "max_points": 3.0,
         "good_points": "Kết luận đúng.", "errors": ""},
    ],
}

# Inject as a history entry. ``response.code`` is the JSON grade string;
# lessons_used carries one lesson so the violet "Đã học từ bạn" chip shows.
INJECT_JS = """
(payload) => {
  const entry = {
    id: 'debug-1',
    task: payload.task,
    subject: 'math',
    response: {
      code: payload.code,
      lessons_used: [
        { id: 7, task: payload.task, wrong_code: '', correct_code: '',
          lesson_text: 'F2 phải 3:1 chứ không phải 1:1.', subject: 'math',
          timestamp: '2026-05-01T00:00:00Z', feedback_score: 4.0 },
      ],
      run_id: 999,
      confidence: 'high',
    },
    finalScores: null,
  };
  window.dispatchEvent(new CustomEvent('hitl.openHistoryEntry', { detail: { entry, step: 3 } }));
}
"""


def main() -> None:
    errors: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(f"[console.{m.type}] {m.text}")
                if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))

        page.goto("http://localhost:3000/", wait_until="domcontentloaded")
        page.wait_for_timeout(1500)

        page.evaluate(INJECT_JS, {"code": json.dumps(GRADE, ensure_ascii=False),
                                  "task": "Toán · Đề kiểm tra"})
        page.wait_for_timeout(1500)

        # --- Assert Step 3 review rendered -----------------------------------
        checks = []
        def has(text):
            try:
                return page.get_by_text(text, exact=False).first.is_visible(timeout=2000)
            except Exception:
                return False

        checks.append(("Step3 paper (Bản chấm AI)", has("Bản chấm AI")))
        checks.append(("Memory chip (Đã học từ bạn)", has("Đã học từ bạn")))
        checks.append(("Finalize button (Chốt điểm)", has("Chốt điểm")))
        page.screenshot(path=str(OUT / "debug_step3_review.png"), full_page=True)

        # --- Finalize → locked state ----------------------------------------
        try:
            page.get_by_text("Chốt điểm", exact=False).first.click(timeout=4000)
            page.wait_for_timeout(1500)
        except Exception as e:
            errors.append(f"[action] click Chốt điểm failed: {e}")

        checks.append(("Locked: In phiếu chấm btn", has("In phiếu chấm")))
        checks.append(("Locked: Đã lưu pill", has("Đã lưu")))
        checks.append(("Locked: Sửa lại btn", has("Sửa lại")))
        page.screenshot(path=str(OUT / "debug_step3_locked.png"), full_page=True)

        # --- Unlock → editable again ----------------------------------------
        try:
            page.get_by_text("Sửa lại", exact=False).first.click(timeout=4000)
            page.wait_for_timeout(1200)
            checks.append(("Unlocked: Chốt điểm back", has("Chốt điểm")))
        except Exception as e:
            errors.append(f"[action] click Sửa lại failed: {e}")

        ctx.close()
        browser.close()

    print("\n=== CHECKS ===")
    for name, ok in checks:
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    print("\n=== CONSOLE / PAGE ERRORS ===")
    real = [e for e in errors if e]
    if not real:
        print("  (none)")
    for e in real:
        print(f"  {e}")
    print(f"\nScreenshots in {OUT}")


if __name__ == "__main__":
    main()
