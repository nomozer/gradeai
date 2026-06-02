"""Runtime smoke of the multi-tab finalize → toast → auto-advance flow.

The single-tab debug (debug_step3.py) couldn't exercise the toast: it only
fires when finalizing a tab that HAS a next ungraded-but-pending tab to jump
to. So here we inject TWO graded papers as separate tabs, finalize the
active one, and assert:
  • a Toast appears naming the just-finalized paper
  • the active tab auto-advances to the other paper

No backend — both grades are injected via the same hitl.openHistoryEntry
CustomEvent App.tsx listens for (distinct entry ids ⇒ two tabs).
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
    "overall": 8.0,
    "transcript": "Câu 1.\n2 + 2 = 4.\n\nCâu 2.\nĐúng.",
    "comment": "",
    "weaknesses": [],
    "per_question_feedback": [
        {"question": "Câu 1", "score": 4.0, "max_points": 5.0,
         "good_points": "Đúng.", "errors": "Thiếu bước."},
        {"question": "Câu 2", "score": 4.0, "max_points": 5.0,
         "good_points": "Đúng.", "errors": ""},
    ],
}

# Inject one history entry → one tab. Called twice with distinct ids/labels.
INJECT_JS = """
(payload) => {
  const entry = {
    id: payload.id,
    task: payload.task,
    subject: 'math',
    response: { code: payload.code, lessons_used: [], run_id: payload.runId, confidence: 'high' },
    finalScores: null,
  };
  window.dispatchEvent(new CustomEvent('hitl.openHistoryEntry', { detail: { entry, step: 3 } }));
}
"""


def main() -> None:
    errors: list[str] = []
    checks: list[tuple[str, bool]] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(f"[console.{m.type}] {m.text}")
                if m.type in ("error",) else None)
        page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))

        page.goto("http://localhost:3000/", wait_until="domcontentloaded")
        page.wait_for_timeout(1500)

        code = json.dumps(GRADE, ensure_ascii=False)
        # Tab A (Nguyễn Văn A), then Tab B (Trần Thị B) — B becomes active.
        page.evaluate(INJECT_JS, {"id": "dbg-A", "task": "Toán · Nguyễn Văn A", "code": code, "runId": 101})
        page.wait_for_timeout(800)
        page.evaluate(INJECT_JS, {"id": "dbg-B", "task": "Toán · Trần Thị B", "code": code, "runId": 102})
        page.wait_for_timeout(1200)

        # All graded tabs stay mounted (display:none for inactive ones), so
        # scope every query to :visible — otherwise .first hits a hidden
        # tab's element. This is a harness concern, not an app behaviour.
        # All graded tabs stay mounted (display:none for inactive ones), so
        # ".first" may hit a hidden tab's node. Return True only if SOME
        # match is actually visible. Harness concern, not app behaviour.
        def has(text):
            try:
                loc = page.get_by_text(text, exact=False)
                page.wait_for_timeout(150)
                for i in range(loc.count()):
                    try:
                        if loc.nth(i).is_visible():
                            return True
                    except Exception:
                        continue
                return False
            except Exception:
                return False

        # Active tab should be B (newest). Finalize it.
        checks.append(("Two tabs: B active shows review", has("Chốt điểm")))
        page.screenshot(path=str(OUT / "debug_toast_before.png"), full_page=True)

        try:
            # Click the VISIBLE "Chốt điểm & lưu" (active tab B's button).
            btn = page.get_by_role("button", name="Chốt điểm", exact=False)
            clicked = False
            for i in range(btn.count()):
                if btn.nth(i).is_visible():
                    btn.nth(i).click(timeout=4000)
                    clicked = True
                    break
            if not clicked:
                errors.append("[action] no visible 'Chốt điểm' button found")
            page.wait_for_timeout(800)  # toast window is ~2.6s; capture mid-flight
        except Exception as e:
            errors.append(f"[action] click Chốt điểm failed: {e}")

        # Toast should name the just-finalized paper (B) and advance to A.
        toast_visible = has("chuyển tới bài kế tiếp")
        toast_names_b = has("Trần Thị B")
        checks.append(("Toast appeared", toast_visible))
        checks.append(("Toast names finalized paper (B)", toast_names_b))
        page.screenshot(path=str(OUT / "debug_toast_shown.png"), full_page=True)

        # After advance, active tab is A — which is NOT finalized, so its
        # action bar shows the editable "Chốt điểm" again (not "Đã lưu").
        page.wait_for_timeout(3000)  # let toast auto-dismiss
        toast_gone = not has("chuyển tới bài kế tiếp")
        advanced_to_editable = has("Chốt điểm")
        checks.append(("Toast auto-dismissed (~2.6s)", toast_gone))
        checks.append(("Advanced to pending tab A (editable)", advanced_to_editable))
        page.screenshot(path=str(OUT / "debug_toast_after.png"), full_page=True)

        ctx.close()
        browser.close()

    print("\n=== CHECKS ===")
    for name, ok in checks:
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    print("\n=== CONSOLE / PAGE ERRORS ===")
    real = [e for e in errors if e]
    print("  (none)" if not real else "")
    for e in real:
        print(f"  {e}")
    print(f"\nScreenshots in {OUT}")


if __name__ == "__main__":
    main()
