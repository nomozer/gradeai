/**
 * features/history/utils.ts — pure formatters for the grade-history dropdown.
 *
 * Shared between GradeHistoryDropdown (search filter) and HistoryRow (row
 * rendering). Recency-bucketing logic stays in the dropdown itself since
 * only the list view groups by bucket.
 */

// "5 phút trước" / "2 giờ trước" / "3 ngày trước" — friendlier than a raw
// ISO timestamp for a history dropdown where exact time rarely matters.
export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} ngày trước`;
  return new Date(ts).toLocaleDateString("vi-VN");
}

// Decode the task-context string that ``buildTaskContext`` produces and
// any legacy variants still present in stored history:
//
//   current  : "<Môn X> · <tên đề>"                  (no class)
//   current  : "<Môn X>" / ""                        (subject only / empty)
//   legacy   : "Môn X · Lớp Y · <tên đề>"            (pre header-cleanup)
//
// Returns:
//   body       = the essay's actual name (shown as the row title)
//   classLabel = "Lớp 10" / "" — only populated by legacy entries; the
//                current header has no class pill so new entries always
//                return "". The dropdown still renders the label when
//                present so the teacher's older stored grades don't
//                lose their visual breadcrumb.
//
// Subject itself is read from entry.subject (the backend code), so the
// regex only needs to skip the "Môn X" prefix. The subject segment can
// be multi-word ("Sinh học", "Vật lý", "Hoá học") so it matches
// ``[^·]+?`` instead of ``\S+`` — the old single-token regex bailed on
// 2-word subjects and left the entire prefix in the title.
export function parseTaskContext(task: string): {
  body: string;
  classLabel: string;
} {
  const legacy = task.match(/^Môn\s+[^·]+?\s*·\s*(Lớp\s+\d+)\s*·\s*(.+)$/iu);
  if (legacy) {
    return { classLabel: legacy[1].trim(), body: legacy[2].trim() || "(không tên)" };
  }
  const current = task.match(/^Môn\s+[^·]+?\s*·\s*(.+)$/iu);
  if (current) {
    return { classLabel: "", body: current[1].trim() || "(không tên)" };
  }
  return { classLabel: "", body: (task || "").trim() || "(không tên)" };
}
