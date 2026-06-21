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
import { Icon } from "../../components/ui/Icon";
import { USERNAME_HELP_TEXT, normalizeUsername, validateUsername } from "../../lib/username";
import {
  createUsersBulk,
  type BulkUserItem,
  type BulkCreateResult,
} from "../../api/authApi";
import { ApiError } from "../../api/client";

const TEMPLATE_COLUMNS = [
  "username",
  "password",
  "full_name",
  "teacher_code",
  "role",
  "token_quota",
];

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
    ["gvtoana", "matkhau123", "Nguyễn Văn A", "GV001", "user", 1000000],
    ["gvlyb", "matkhau456", "Trần Thị B", "GV002", "user", 500000],
    ["truongban", "matkhau789", "Lê Văn C", "GV000", "admin", 0],
  ]);
  ws["!cols"] = [
    { wch: 16 },
    { wch: 16 },
    { wch: 20 },
    { wch: 12 },
    { wch: 10 },
    { wch: 14 },
  ];
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
  const [dragOver, setDragOver] = useState(false);

  const reset = () => {
    setRows([]);
    setFileName("");
    setError("");
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const parseFile = async (file: File) => {
    setError("");
    setResult(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      const parsed: BulkUserItem[] = raw
        .map((r) => ({
          username: normalizeUsername(cell(r, "username")),
          password: cell(r, "password"),
          full_name: cell(r, "full_name"),
          teacher_code: cell(r, "teacher_code"),
          role: cell(r, "role").toLowerCase() === "admin" ? "admin" : "user",
          token_quota: parseInt(cell(r, "token_quota"), 10) || 0,
        }))
        .filter((r) => r.username || r.password); // drop fully-empty rows
      if (parsed.length === 0) {
        setError("Không tìm thấy dòng nào. Kiểm tra tiêu đề cột: username, password, full_name, teacher_code, role, token_quota.");
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

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void parseFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void parseFile(file);
  };

  const rowError = (row: BulkUserItem): string | null => {
    const usernameError = validateUsername(row.username);
    if (usernameError) return usernameError;
    if (row.password.length < 6) return "Mật khẩu phải có ít nhất 6 ký tự.";
    return null;
  };
  const invalidCount = rows.filter((r) => rowError(r)).length;
  const validCount = rows.length - invalidCount;

  const onSubmit = async () => {
    if (rows.length === 0 || validCount <= 0) return;
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
    <div style={{ display: "flex", flexDirection: "column", gap: T.space[4] }}>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={onFile}
        style={{ display: "none" }}
      />

      {/* Step 1 — template + column spec */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <StepLabel n={1} text="Tải mẫu rồi điền dữ liệu trong Excel" />
          <button type="button" onClick={downloadTemplate} style={ghostBtn}>
            ⬇ File mẫu (.xlsx)
          </button>
        </div>
        <div
          style={{
            border: `1px solid ${T.borderLight}`,
            borderRadius: 8,
            overflow: "hidden",
            fontSize: T.fontSize.xs,
          }}
        >
          {[
            ["username", USERNAME_HELP_TEXT],
            ["password", "Tối thiểu 6 ký tự"],
            ["full_name", "Tên giáo viên · không bắt buộc"],
            ["teacher_code", "Mã giáo viên · không trùng · không bắt buộc"],
            ["role", "user / admin · để trống = giáo viên"],
            ["token_quota", "0 = không giới hạn"],
          ].map(([col, desc], i) => (
            <div
              key={col}
              style={{
                display: "flex",
                gap: 12,
                padding: "6px 12px",
                background: i % 2 ? "transparent" : "rgba(59, 79, 138, 0.03)",
              }}
            >
              <code style={{ minWidth: 96, color: T.accent, fontWeight: 600, fontFamily: T.mono }}>{col}</code>
              <span style={{ color: T.textMute }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Step 2 — dropzone */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <StepLabel n={2} text="Tải file đã điền lên" />
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          role="button"
          tabIndex={0}
          style={{
            border: `2px dashed ${dragOver ? T.accent : T.border}`,
            borderRadius: 12,
            background: dragOver ? "rgba(59, 79, 138, 0.05)" : T.bgMuted,
            padding: "28px 16px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            transition: "border-color 0.15s ease, background 0.15s ease",
            textAlign: "center",
          }}
        >
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: T.accentSoft,
              color: T.accent,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </span>
          <div style={{ fontSize: T.fontSize.sm, fontWeight: 600, color: T.text }}>
            Kéo thả file Excel vào đây, hoặc bấm để chọn
          </div>
          <div style={{ fontSize: T.fontSize.xs, color: T.textMute }}>Hỗ trợ .xlsx · .xls · .csv</div>
        </div>
        {fileName && (
          <div style={{ fontSize: T.fontSize.sm, color: T.textSoft }}>
            Đã chọn: <b>{fileName}</b> — {rows.length} dòng
            {invalidCount > 0 && (
              <span style={{ color: T.red }}> ({invalidCount} dòng thiếu/sai sẽ bị bỏ qua)</span>
            )}
          </div>
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
                  <th style={cellTh}>full_name</th>
                  <th style={cellTh}>teacher_code</th>
                  <th style={cellTh}>role</th>
                  <th style={{ ...cellTh, textAlign: "right" }}>token_quota</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((r, i) => {
                  const message = rowError(r);
                  const bad = !!message;
                  return (
                    <tr
                      key={i}
                      title={message || undefined}
                      style={{ borderTop: `1px solid ${T.borderLight}`, color: bad ? T.red : T.text }}
                    >
                      <td style={cellTd}>{i + 1}</td>
                      <td style={cellTd}>
                        {r.username || "—"}
                        {message && (
                          <div style={{ fontSize: T.fontSize.xxs, color: T.red, marginTop: 2 }}>
                            {message}
                          </div>
                        )}
                      </td>
                      <td style={cellTd}>{r.password ? "•".repeat(Math.min(8, r.password.length)) : "—"}</td>
                      <td style={cellTd}>{r.full_name || "—"}</td>
                      <td style={cellTd}>{r.teacher_code || "—"}</td>
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
            <button type="button" onClick={onSubmit} disabled={busy || validCount <= 0} style={primaryBtn(!busy && validCount > 0)}>
              {busy ? "Đang tạo…" : `Tạo ${validCount} tài khoản hợp lệ`}
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
          <div style={{ fontSize: T.fontSize.sm, color: T.text, display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: T.greenSoft,
                border: `1.5px solid ${T.green}`,
                color: T.green,
                flexShrink: 0,
              }}
            >
              <Icon.Check size={12} color={T.green} />
            </span>
            <span>
              Đã tạo <b style={{ color: T.green }}>{result.created}</b> tài khoản
              {result.failed > 0 && (
                <>
                  {" "}· <b style={{ color: T.red }}>{result.failed}</b> dòng không tạo được
                </>
              )}
              .
            </span>
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

function StepLabel({ n, text }: { n: number; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: T.accent,
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {n}
      </span>
      <span style={{ fontSize: T.fontSize.sm, fontWeight: 600, color: T.text }}>{text}</span>
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
