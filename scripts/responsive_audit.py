"""Capture full-page screenshots at every breakpoint the app supports.

Breakpoints come from frontend/src/hooks/useBreakpoint.ts:
  mobile   <= 480
  tablet   481-767
  laptop   768-1199
  desktop  >= 1200

Captures: Step 1 (Upload), Step 3 (Review), Step 4 (Regrade), Step 5 (Done)
+ mobile sidebar drawer. Steps 3/4/5 are loaded by dispatching the same
"hitl.loadGrade" CustomEvent that GradeHistoryDropdown fires when a teacher
picks a saved bài from the dropdown.
"""

from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent.parent / "screenshots"
OUT.mkdir(exist_ok=True)

VIEWPORTS = [
    ("mobile", 375, 800),
    ("tablet", 600, 900),
    ("laptop", 1024, 800),
    ("desktop", 1440, 900),
]

# Dispatch the same event GradeHistoryDropdown uses. Pulls the first
# (most-recent) entry from /api/history/grades and replays it with the
# chosen step (3 = Review & Score).
LOAD_GRADE_JS = """
async (step) => {
  const r = await fetch('/api/history/grades?limit=1');
  const j = await r.json();
  const entry = j.items?.[0];
  if (!entry) throw new Error('no history entries');
  window.dispatchEvent(new CustomEvent('hitl.openHistoryEntry', { detail: { entry, step } }));
  return entry.id;
}
"""


def capture(page, fname: str, full: bool = True) -> None:
    page.wait_for_timeout(900)
    out = OUT / fname
    page.screenshot(path=str(out), full_page=full)
    print(f"    -> {out.name}")


def main() -> None:
    # Backend warm-up: uvicorn's first /api response can be slow.
    import urllib.request, time
    for _ in range(30):
        try:
            urllib.request.urlopen("http://localhost:8000/api/history/grades", timeout=2).read()
            break
        except Exception:
            time.sleep(1)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for name, w, h in VIEWPORTS:
            print(f"[{name} {w}x{h}]")
            ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
            page = ctx.new_page()

            page.goto("http://localhost:3000/", wait_until="domcontentloaded")
            page.wait_for_timeout(1500)
            capture(page, f"step1_{name}_{w}x{h}.png")

            # Dismiss welcome modal if visible (mobile/tablet viewports)
            try:
                dismiss_btn = page.locator('button:has-text("Đã hiểu"), button:has-text("Got it")')
                if dismiss_btn.is_visible():
                    dismiss_btn.click()
                    page.wait_for_timeout(600)
                    print("      -> dismissed welcome modal")
            except Exception as e:
                print(f"      modal dismiss failed: {repr(e)}")

            # Load history grade, which defaults to the editable Step 3 page
            try:
                entry_id = page.evaluate(LOAD_GRADE_JS, 3)
                page.wait_for_timeout(2000)
                capture(page, f"step3_editing_{name}_{w}x{h}.png")
                print(f"      (loaded entry id={entry_id} - captured editing state)")
            except Exception as e:
                # Use ascii safe representation to prevent Windows console encoding crashes
                print(f"      step3 load failed: {repr(e)}")
                ctx.close()
                continue

            # Click "Chốt điểm & lưu" to lock and save
            try:
                finalize_btn = page.locator('button:has-text("Chốt điểm & lưu"), button:has-text("Finalize")')
                if finalize_btn.is_visible():
                    finalize_btn.click()
                    page.wait_for_timeout(2000)
                    capture(page, f"step3_locked_{name}_{w}x{h}.png")
                    print("      -> finalized and captured locked state")
                else:
                    print("      finalize button not visible")
            except Exception as e:
                print(f"      step3 finalize failed: {repr(e)}")

            # Click "Sửa lại" to unlock and return to editable state
            try:
                edit_btn = page.locator('button:has-text("Sửa lại"), button:has-text("Edit")')
                if edit_btn.is_visible():
                    edit_btn.click()
                    page.wait_for_timeout(1000)
                    print("      -> clicked edit button to unlock successfully")
                else:
                    print("      edit button not visible after finalize")
            except Exception as e:
                print(f"      step3 unlock failed: {repr(e)}")

            # Sidebar drawer at narrow widths
            if name != "desktop":
                page.goto("http://localhost:3000/", wait_until="domcontentloaded")
                page.wait_for_timeout(800)
                try:
                    page.get_by_role("button", name="Open sidebar").click(timeout=3000)
                    page.wait_for_timeout(600)
                    out = OUT / f"sidebar_{name}_{w}x{h}.png"
                    page.screenshot(path=str(out), full_page=False)
                    print(f"    -> {out.name} (sidebar open)")
                except Exception as e:
                    print(f"    sidebar open failed: {repr(e)}")

            if name == "desktop":
                mem_page = ctx.new_page()
                mem_page.goto("http://localhost:3000/#memory", wait_until="domcontentloaded")
                mem_page.wait_for_timeout(1200)
                capture(mem_page, f"memory_{name}_{w}x{h}.png")
                mem_page.close()

            ctx.close()
        browser.close()


if __name__ == "__main__":
    main()
