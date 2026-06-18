/**
 * openInNewTab — open a URL in a new browser tab, popup-blocker-safe.
 *
 * `window.open(url, "_blank", "noopener,noreferrer")` passes a window-features
 * string, which makes Chrome open a stripped POPUP window (not a tab) and trips
 * the popup blocker on real domains — so it works on localhost but silently
 * fails once deployed (e.g. the admin's "Chấm bài" button on Vercel). A
 * programmatic anchor click initiated from a user gesture opens a genuine tab
 * and is not blocked, while `rel="noopener noreferrer"` still severs the opener
 * reference.
 */
export function openInNewTab(url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
