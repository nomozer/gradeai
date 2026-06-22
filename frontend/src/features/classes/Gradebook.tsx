import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  getGradebook,
  upsertStudentGrade,
  type ClassRoom,
  type GradebookRow,
} from "../../api";
import { Icon } from "../../components/ui/Icon";
import { T } from "../../theme/tokens";
import { exportClassGradebook } from "../../lib/exportClassGradebook";
import { Btn } from "./components/ClassUI";

export function Gradebook({
  cls,
  onGrade,
}: {
  cls: ClassRoom;
  onGrade: (row: GradebookRow) => void;
}) {
  const [rows, setRows] = useState<GradebookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const refresh = () => {
    setLoading(true);
    getGradebook(cls.id)
      .then((res) => {
        setRows(res.students);
        setError("");
      })
      .catch((e) => setError(e instanceof ApiError ? e.detail : "Không tải được bảng điểm."))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [cls.id]);

  // Inline edit: upsert a student's scores from the table, update the row in
  // place. Covers both adjusting an AI batch grade and entering scores by hand.
  const saveRow = async (studentId: number, scores: Record<number, number>) => {
    try {
      const grade = await upsertStudentGrade(studentId, scores);
      setRows((prev) => prev.map((r) => (r.id === studentId ? { ...r, grade } : r)));
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Lưu điểm thất bại.");
    }
  };

  const cauNums = useMemo(
    () =>
      [
        ...new Set(
          rows.flatMap((r) => (r.grade ? Object.keys(r.grade.scores).map(Number) : [])),
        ),
      ].sort((a, b) => a - b),
    [rows],
  );

  const graded = rows.filter((r) => r.grade);
  const avg =
    graded.length > 0
      ? graded.reduce((s, r) => s + (r.grade?.total ?? 0), 0) / graded.length
      : null;

  const doExport = async () => {
    setExporting(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await exportClassGradebook(cls.name, rows, stamp);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Xuất Excel thất bại.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      {/* Summary + actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <div style={{ color: T.textMute, fontSize: T.fontSize.sm }}>
          Đã chấm <b style={{ color: T.text }}>{graded.length}</b>/{rows.length}
          {avg != null && (
            <>
              {" · "}TB lớp <b style={{ color: T.green }}>{avg.toFixed(1)}</b>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn onClick={refresh} title="Tải lại bảng điểm">
            <Icon.RefreshCw size={14} /> Làm mới
          </Btn>
          <Btn variant="primary" onClick={doExport} disabled={exporting || rows.length === 0}>
            <Icon.ArrowDown size={14} /> {exporting ? "Đang xuất…" : "Xuất Excel"}
          </Btn>
        </div>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: T.redSoft, border: `1px solid ${T.red}`, borderRadius: 8, color: T.red, marginBottom: 14, fontSize: T.fontSize.sm }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: T.textMute, padding: "40px 0", textAlign: "center" }}>Đang tải…</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", background: T.bgCard, border: `1px dashed ${T.border}`, borderRadius: 12, color: T.textMute }}>
          Lớp chưa có học sinh. Thêm học sinh ở tab "Danh sách" trước.
        </div>
      ) : (
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead>
                <tr>
                  <Th style={{ width: 48, textAlign: "center" }}>STT</Th>
                  <Th>Họ tên</Th>
                  {cauNums.map((n) => (
                    <Th key={n} style={{ textAlign: "center", width: 64 }}>{`Câu ${n}`}</Th>
                  ))}
                  <Th style={{ textAlign: "center", width: 70 }}>Tổng</Th>
                  <Th style={{ width: 130 }}>Trạng thái</Th>
                  <Th style={{ width: 96, textAlign: "right" }}></Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <GradeRow
                    key={r.id}
                    index={i + 1}
                    row={r}
                    cauNums={cauNums}
                    onGrade={() => onGrade(r)}
                    onSave={saveRow}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th
      style={{
        textAlign: "left",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: T.textMute,
        padding: "12px 14px",
        background: T.bgElevated,
        borderBottom: `1px solid ${T.border}`,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function GradeRow({
  index,
  row,
  cauNums,
  onGrade,
  onSave,
}: {
  index: number;
  row: GradebookRow;
  cauNums: number[];
  onGrade: () => void;
  onSave: (studentId: number, scores: Record<number, number>) => void;
}) {
  const [hover, setHover] = useState(false);
  // Local editable copy of the per-câu scores (string for the inputs). Re-seed
  // when the row's grade changes (e.g. after a batch run / save round-trip).
  const seed = () => {
    const v: Record<number, string> = {};
    for (const n of cauNums) {
      const s = row.grade?.scores[String(n)];
      v[n] = typeof s === "number" ? String(s) : "";
    }
    return v;
  };
  const [vals, setVals] = useState<Record<number, string>>(seed);
  const seedKey = `${row.grade?.graded_at ?? ""}|${cauNums.join(",")}`;
  const [lastSeed, setLastSeed] = useState(seedKey);
  if (seedKey !== lastSeed) {
    setLastSeed(seedKey);
    setVals(seed());
  }

  const numVals = cauNums
    .map((n) => parseFloat(vals[n]))
    .filter((x) => Number.isFinite(x));
  const hasAny = numVals.length > 0;
  const total = numVals.reduce((a, b) => a + b, 0);

  const commit = () => {
    const scores: Record<number, number> = {};
    for (const n of cauNums) {
      const x = parseFloat(vals[n]);
      if (Number.isFinite(x)) scores[n] = x;
    }
    // Only save when something actually differs from the stored grade.
    const cur = row.grade?.scores ?? {};
    const changed =
      Object.keys(scores).length !== Object.keys(cur).length ||
      cauNums.some((n) => (scores[n] ?? null) !== (cur[String(n)] ?? null));
    if (changed) onSave(row.id, scores);
  };

  return (
    <tr
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ borderBottom: `1px solid ${T.borderLight}`, background: hover ? T.bgHover : "transparent" }}
    >
      <td style={{ padding: "9px 14px", textAlign: "center", color: T.textFaint, fontFamily: T.mono, fontSize: 13 }}>{index}</td>
      <td style={{ padding: "9px 14px", fontSize: T.fontSize.base, fontWeight: 600, color: T.text }}>{row.full_name}</td>
      {cauNums.map((n) => (
        <td key={n} style={{ padding: "6px 8px", textAlign: "center" }}>
          <input
            type="number"
            step="0.25"
            min="0"
            value={vals[n] ?? ""}
            onChange={(e) => setVals((v) => ({ ...v, [n]: e.target.value }))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            style={{
              width: 50,
              textAlign: "center",
              padding: "5px 4px",
              borderRadius: 6,
              border: `1px solid ${T.border}`,
              background: T.bgInput,
              fontFamily: T.mono,
              fontSize: 13,
              color: T.text,
              outline: "none",
            }}
          />
        </td>
      ))}
      <td style={{ padding: "9px 14px", textAlign: "center", fontFamily: T.mono, fontWeight: 700, fontSize: 15, color: hasAny ? T.green : T.textFaint }}>
        {hasAny ? total.toFixed(1) : "—"}
      </td>
      <td style={{ padding: "9px 14px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: T.fontSize.sm, fontWeight: 600, color: hasAny ? T.green : T.textFaint }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: hasAny ? T.green : T.textFaint }} />
          {hasAny ? "Đã chấm" : "Chưa chấm"}
        </span>
      </td>
      <td style={{ padding: "6px 14px", textAlign: "right" }}>
        <button
          type="button"
          onClick={onGrade}
          style={{
            border: "none",
            background: "transparent",
            color: T.accent,
            cursor: "pointer",
            fontFamily: T.font,
            fontSize: T.fontSize.sm,
            fontWeight: 600,
            opacity: hover ? 1 : 0.7,
            transition: "opacity 0.12s ease",
            whiteSpace: "nowrap",
          }}
        >
          Mở bài →
        </button>
      </td>
    </tr>
  );
}
