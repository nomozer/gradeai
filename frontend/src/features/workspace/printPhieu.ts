// printPhieu — fire the browser print dialog for the phiếu chấm.
//
// Split from PrintablePhieu.tsx (which exports a component) so that file
// stays component-only — keeps react-refresh/Fast-Refresh happy. The
// matching hidden print subtree is rendered by <PrintablePhieu/>.
//
// Swaps document.title so the optional browser-rendered print header reads
// "Phiếu chấm — <môn>" instead of the app chrome title; restores it on
// ``afterprint`` (covers print AND cancel in every Chromium/Firefox/Safari
// we target).
export function printPhieu(subjectLabel: string): void {
  if (typeof window === "undefined") return;
  const original = document.title;
  document.title = ["Phiếu chấm", subjectLabel].filter(Boolean).join(" — ");
  const restore = () => {
    document.title = original;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
}
