import type { Tab } from "../types/tabs";

/**
 * Batch gradebook export.
 *
 * Collects the effective per-câu scores already mirrored onto each tab
 * (``tab.questions`` — teacher's ``finalScores`` when set, else the AI score;
 * see ``EssayWorkspace.tabQuestions``) and writes ONE spreadsheet for the
 * whole batch instead of printing a phiếu per paper. Pure frontend — reads
 * only what's open in the workspace, touches no backend.
 *
 * SheetJS is lazy-loaded (same pattern as ``BulkImportUsers``) so the
 * ~250 KB library only ships when a teacher actually exports.
 */

/** Tabs that carry at least one graded câu — the rows that can be exported. */
export function exportableTabs(tabs: Tab[]): Tab[] {
  return tabs.filter((t) => t.questions && t.questions.length > 0);
}

function statusLabel(t: Tab): string {
  if (t.error) return "Lỗi";
  if (t.finalized) return "Đã chốt";
  if (t.hasGrade) return "Chờ duyệt";
  return "Chưa chấm";
}

/**
 * Build + download an .xlsx gradebook for the given tabs.
 * Returns the number of rows (papers) written; 0 means nothing to export.
 */
export async function exportGradebook(tabs: Tab[]): Promise<number> {
  const rows = exportableTabs(tabs);
  if (rows.length === 0) return 0;

  // Union of câu numbers across every paper, sorted — papers in a batch
  // share the same exam, but compute the union so a stray mismatch still
  // lands every score in the right column instead of silently dropping it.
  const cauNums = [
    ...new Set(rows.flatMap((t) => t.questions!.map((q) => q.num))),
  ].sort((a, b) => a - b);

  const header = [
    "STT",
    "Họ tên / Bài",
    ...cauNums.map((n) => `Câu ${n}`),
    "Tổng",
    "Trạng thái",
  ];

  const aoa: (string | number)[][] = [header];
  rows.forEach((t, i) => {
    const byNum = new Map(t.questions!.map((q) => [q.num, q.score]));
    const total = t.questions!.reduce((s, q) => s + (q.score || 0), 0);
    aoa.push([
      i + 1,
      t.label,
      ...cauNums.map((n) => (byNum.has(n) ? Number(byNum.get(n)!.toFixed(2)) : "")),
      Number(total.toFixed(2)),
      statusLabel(t),
    ]);
  });

  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 5 },
    { wch: 28 },
    ...cauNums.map(() => ({ wch: 8 })),
    { wch: 8 },
    { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BangDiem");

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `bang-diem_${stamp}.xlsx`);
  return rows.length;
}
