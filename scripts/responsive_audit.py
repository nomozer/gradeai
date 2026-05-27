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
# chosen step (3 = Review, 4 = Regrade, 5 = Done).
LOAD_GRADE_JS = """
async (step) => {
  const r = await fetch('/api/history/grades?limit=1');
  const j = await r.json();
  const entry = j.items?.[0];
  if (!entry) throw new Error('no history entries');
  window.dispatchEvent(new CustomEvent('hitl.loadGrade', { detail: { entry, step } }));
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

            # Load history grade once, then walk the stepper via clicks —
            # loadHistoryEntry() early-returns on a second dispatch, so
            # re-dispatching with a different step number doesn't navigate.
            try:
                entry_id = page.evaluate(LOAD_GRADE_JS, 3)
                page.wait_for_timeout(1500)
                capture(page, f"step3_{name}_{w}x{h}.png")
                print(f"      (loaded entry id={entry_id})")
            except Exception as e:
                print(f"      step3 load FAILED: {e}")
                ctx.close()
                continue

            for step, vi in ((4, "CHẤM LẠI"), (5, "XONG")):
                try:
                    page.get_by_title(f"Quay lại: {vi}").click(timeout=5000)
                    page.wait_for_timeout(1500)
                    capture(page, f"step{step}_{name}_{w}x{h}.png")
                except Exception as e:
                    print(f"      step{step} nav FAILED: {e}")

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
                    print(f"    sidebar open FAILED: {e}")

            # Memory page — only meaningful at desktop where window.open
            # creates a separate route; capture once
            if name == "desktop":
                page.goto("http://localhost:3000/#memory", wait_until="domcontentloaded")
                page.wait_for_timeout(1200)
                capture(page, f"memory_{name}_{w}x{h}.png")

            ctx.close()
        browser.close()


if __name__ == "__main__":
    main()
