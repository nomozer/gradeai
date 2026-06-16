/**
 * BulkImportUsers — create many accounts at once from an Excel file.
 *
 * Flow: download a .xlsx template (fixed columns) → fill it in Excel → upload
 * → preview the parsed rows → create. The backend (`/api/auth/users/bulk`)
 * reports a per-row outcome (created / skipped-duplicate / error), shown here
 * so the admin sees exactly which rows landed.
 *
 * Excel parsing runs entirely in the browser (SheetJS) on the admin's own
 * file — no upload of the raw workbook to the server, only the parsed rows.
 */

import { useRef, useState } from "react";
import { T } from "../../theme/tokens";
import {
  createUsersBulk,
  type BulkUserItem,
  type BulkCreateResult,
} from "../../api/authApi";
import { ApiError } from "../../api/client";

const TEMPLATE_COLUMNS = ["username", "password", "role", "token_quota"];

/** Pull a cell by header name, case-insensitive + trimmed. */
function cell(row: Record<string, unknown>, key: string): string {
  for (const k of Object.keys(row)) {
    if (k.trim().toLowerCase() === key) return String(row[k] ?? "").trim();
  }
  return "";
}

async function downloadTemplate() {
  // Lazy-load SheetJS so the ~250KB gzip library only ships to admins who
  // actually use bulk import — not every teacher loading the grading app.
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([
    TEMPLATE_COLUMNS,
    ["gv_toan_a", "matkhau123", "user", 1000000],
    ["gv_ly_b", "matkhau456", "user", 500000],
    ["truong_ban", "matkhau789", "admin", 0],
  ]);
  ws["!cols"] = [{ wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "TaiKhoan");
  XLSX.writeFile(wb, "mau_tai_khoan.xlsx");
}

export function BulkImportUsers({ onDone }: { onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<BulkUserItem[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkCreateResult | null>(null);

  const reset = () => {
    setRows([]);
    setFileName("");
    setError("");
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setResult(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      const parsed: BulkUserItem[] = raw
        .map((r) => ({
          username: cell(r, "username"),
          password: cell(r, "password"),
          role: cell(r, "role").toLowerCase() === "admin" ? "admin" : "user",
          token_quota: parseInt(cell(r, "token_quota"), 10) || 0,
        }))
        .filter((r) => r.username || r.password); // drop fully-empty rows
      if (parsed.length === 0) {
        setError("Không tìm thấy dòng nào. Kiểm tra tiêu đề cột: username, password, role, token_quota.");
        setRows([]);
        return;
      }
      setRows(parsed);
      setFileName(file.name);
    } catch {
      setError("Không đọc được file Excel. Hãy dùng đúng file mẫu (.xlsx).");
      setRows([]);
    }
  };

  const invalidCount = rows.filter((r) => !r.username || r.password.length < 4).length;

  const onSubmit = async () => {
    if (rows.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const res = await createUsersBulk(rows);
      setResult(res);
      if (res.created > 0) onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail || "Tạo hàng loạt thất bại." : "Lỗi kết nối.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.space[3] }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={downloadTemplate} style={ghostBtn}>
          ⬇ Tải file mẫu (.xlsx)
        </button>
      </div>

      <div style={{ fontSize: T.fontSize.xs, color: T.textMute }}>
        Cột: <b>username</b>, <b>password</b> (≥4 ký tự), <b>role</b> (user/admin, trống = giáo viên),{" "}
        <b>token_quota</b> (0 = không giới hạn).
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={onFile}
          style={{ display: "none" }}
        />
        <button type="button" onClick={() => fileRef.current?.click()} style={primaryBtn(true)}>
          Chọn file Excel
        </button>
        {fileName && (
          <span style={{ fontSize: T.fontSize.sm, color: T.textSoft }}>
            {fileName} — <b>{rows.length}</b> dòng
            {invalidCount > 0 && (
              <span style={{ color: T.red }}> ({invalidCount} dòng thiếu/sai sẽ bị bỏ qua)</span>
            )}
          </span>
        )}
      </div>

      {error && (
        <div style={{ fontSize: T.fontSize.sm, color: T.red, background: T.redSoft, border: `1px solid ${T.red}`, borderRadius: 8, padding: "8px 12px" }}>
          {error}
        </div>
      )}

      {/* Preview */}
      {rows.length > 0 && !result && (
        <>
          <div style={{ overflowX: "auto", maxHeight: 280, overflowY: "auto", border: `1px solid ${T.borderLight}`, borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.fontSize.sm }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, background: T.bgElevated, textAlign: "left", color: T.textMute }}>
                  <th style={cellTh}>#</th>
                  <th style={cellTh}>username</th>
                  <th style={cellTh}>password</th>
                  <th style={cellTh}>role</th>
                  <th style={{ ...cellTh, textAlign: "right" }}>token_quota</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((r, i) => {
                  const bad = !r.username || r.password.length < 4;
                  return (
                    <tr key={i} style={{ borderTop: `1px solid ${T.borderLight}`, color: bad ? T.red : T.text }}>
                      <td style={cellTd}>{i + 1}</td>
                      <td style={cellTd}>{r.username || "—"}</td>
                      <td style={cellTd}>{r.password ? "•".repeat(Math.min(8, r.password.length)) : "—"}</td>
                      <td style={cellTd}>{r.role === "admin" ? "Admin" : "Giáo viên"}</td>
                      <td style={{ ...cellTd, textAlign: "right" }}>
                        {r.token_quota ? r.token_quota.toLocaleString("vi-VN") : "∞"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > 100 && (
            <div style={{ fontSize: T.fontSize.xs, color: T.textMute }}>… và {rows.length - 100} dòng nữa.</div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={onSubmit} disabled={busy} style={primaryBtn(!busy)}>
              {busy ? "Đang tạo…" : `Tạo ${rows.length} tài khoản`}
            </button>
            <button type="button" onClick={reset} style={ghostBtn}>
              Hủy
            </button>
          </div>
        </>
      )}

      {/* Result */}
      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: T.fontSize.sm, color: T.text }}>
            ✅ Đã tạo <b style={{ color: T.green }}>{result.created}</b> tài khoản
            {result.failed > 0 && (
              <>
                {" "}· <b style={{ color: T.red }}>{result.failed}</b> dòng không tạo được
              </>
            )}
            .
          </div>
          {result.results.some((r) => r.status !== "created") && (
            <div style={{ maxHeight: 200, overflowY: "auto", border: `1px solid ${T.borderLight}`, borderRadius: 8, padding: "8px 12px", fontSize: T.fontSize.xs }}>
              {result.results
                .filter((r) => r.status !== "created")
                .map((r, i) => (
                  <div key={i} style={{ color: T.textSoft, padding: "2px 0" }}>
                    <span style={{ color: r.status === "skipped" ? T.amber : T.red, fontWeight: 600 }}>
                      {r.status === "skipped" ? "Bỏ qua" : "Lỗi"}
                    </span>{" "}
                    — <b>{r.username}</b>: {r.detail}
                  </div>
                ))}
            </div>
          )}
          <div>
            <button type="button" onClick={reset} style={primaryBtn(true)}>
              Nhập tiếp
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function primaryBtn(enabled: boolean): React.CSSProperties {
  return {
    padding: "9px 16px",
    fontSize: T.fontSize.sm,
    fontWeight: 600,
    color: "#fff",
    background: enabled ? T.accent : T.textFaint,
    border: "none",
    borderRadius: 8,
    cursor: enabled ? "pointer" : "default",
    fontFamily: T.font,
  };
}

const ghostBtn: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: T.fontSize.sm,
  fontWeight: 600,
  color: T.accent,
  background: "rgba(59, 79, 138, 0.05)",
  border: `1px solid rgba(59, 79, 138, 0.15)`,
  borderRadius: 8,
  cursor: "pointer",
  fontFamily: T.font,
};

const cellTh: React.CSSProperties = {
  padding: "8px 12px",
  fontWeight: 600,
  fontSize: T.fontSize.xxs,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};
const cellTd: React.CSSProperties = { padding: "6px 12px" };
