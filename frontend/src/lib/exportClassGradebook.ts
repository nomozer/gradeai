import type { GradebookRow } from "../api/classes";

/**
 * Export one class's gradebook to a single .xlsx — the batch deliverable that
 * replaces printing a phiếu per paper. Rows come from the backend
 * (GET /classes/{id}/gradebook), so the scores are the teacher's finalized
 * per-câu numbers. SheetJS is lazy-loaded (same pattern as BulkImportUsers).
 *
 * Returns the number of rows written (0 ⇒ empty roster, nothing exported).
 */
export async function exportClassGradebook(
  className: string,
  rows: GradebookRow[],
  dateStamp: string,
): Promise<number> {
  if (rows.length === 0) return 0;

  // Union of câu numbers across every graded student, sorted.
  const cauNums = [
    ...new Set(
      rows.flatMap((r) => (r.grade ? Object.keys(r.grade.scores).map(Number) : [])),
    ),
  ].sort((a, b) => a - b);

  const header = [
    "STT",
    "Họ tên",
    "Mã HS",
    ...cauNums.map((n) => `Câu ${n}`),
    "Tổng",
    "Trạng thái",
  ];

  const aoa: (string | number)[][] = [header];
  rows.forEach((r, i) => {
    const g = r.grade;
    aoa.push([
      i + 1,
      r.full_name,
      r.student_code || "",
      ...cauNums.map((n) => {
        const v = g?.scores[String(n)];
        return typeof v === "number" ? v : "";
      }),
      g ? g.total : "",
      g ? "Đã chấm" : "Chưa chấm",
    ]);
  });

  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 5 },
    { wch: 26 },
    { wch: 12 },
    ...cauNums.map(() => ({ wch: 8 })),
    { wch: 8 },
    { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BangDiem");

  const safe = className.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 40) || "lop";
  XLSX.writeFile(wb, `bang-diem_${safe}_${dateStamp}.xlsx`);
  return rows.length;
}
