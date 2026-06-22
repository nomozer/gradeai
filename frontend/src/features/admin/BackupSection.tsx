import { useRef, useState } from "react";
import { T } from "../../theme/tokens";
import { getBackup, restoreBackup, type RestoreResult } from "../../api/authApi";
import { errText } from "./adminFormat";
import {
  cardStyle,
  mutedStyle,
  sectionTitleStyle,
  titleStyle,
  toolbarGhostBtn,
  toolbarPrimaryBtn,
} from "./adminStyles";
import { Banner } from "./adminPrimitives";
import { ConfirmModal } from "./adminModals";

export function BackupSection() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [pendingRestore, setPendingRestore] = useState<unknown | null>(null);

  const onDownload = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await getBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const d = new Date();
      const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      a.href = url;
      a.download = `mirror-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errText(err, "Không tải được bản sao lưu."));
    } finally {
      setBusy(false);
    }
  };

  const onRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setError("");
    setResult(null);
    try {
      setPendingRestore(JSON.parse(await file.text()));
    } catch {
      setError("File không hợp lệ — không phải file sao lưu (.json).");
    }
  };

  // The actual destructive restore — runs once the user confirms in the
  // styled dialog. Throws on failure so the dialog surfaces the error.
  const doRestore = async () => {
    setResult(await restoreBackup(pendingRestore));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.space[5] }}>
      <h1 style={titleStyle}>Sao lưu & Khôi phục</h1>
      {error && <Banner text={error} />}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: T.space[4],
          alignItems: "start",
        }}
      >
      <div style={cardStyle}>
        <div style={{ ...sectionTitleStyle, fontSize: T.fontSize.base, color: T.text }}>
          Tải bản sao lưu
        </div>
        <p style={{ ...mutedStyle, lineHeight: 1.6, margin: 0 }}>
          Tải toàn bộ dữ liệu (tài khoản, lessons AI đã học, điểm đã chấm) về một file{" "}
          <code>.json</code>. Giữ file ở nơi độc lập (máy bạn / Google Drive) — kể cả server
          bị xóa hay hết hạn thuê, bạn vẫn khôi phục lại được.
        </p>
        <div>
          <button type="button" onClick={onDownload} disabled={busy} style={toolbarPrimaryBtn}>
            {busy ? "Đang xử lý…" : "⬇ Tải bản sao lưu"}
          </button>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ ...sectionTitleStyle, fontSize: T.fontSize.base, color: T.text }}>
          Khôi phục từ file
        </div>
        <div
          style={{
            fontSize: T.fontSize.sm,
            color: T.red,
            background: T.redSoft,
            border: `1px solid ${T.red}`,
            borderRadius: 8,
            padding: "8px 12px",
          }}
        >
          ⚠ Khôi phục sẽ <b>ghi đè toàn bộ</b> dữ liệu hiện tại. Bạn có thể phải đăng nhập lại
          sau khi khôi phục.
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={onRestoreFile}
          style={{ display: "none" }}
        />
        <div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            style={toolbarGhostBtn}
          >
            {busy ? "Đang khôi phục…" : "Chọn file backup…"}
          </button>
        </div>
        {result && (
          <div style={{ fontSize: T.fontSize.sm, color: T.green }}>
            ✅ Đã khôi phục: {result.users} tài khoản · {result.lessons} lessons ·{" "}
            {result.pipeline_runs} lượt chấm · {result.approved_grades} điểm.
          </div>
        )}
      </div>
      </div>

      {pendingRestore !== null && (
        <ConfirmModal
          title="Khôi phục dữ liệu"
          message="Khôi phục sẽ GHI ĐÈ toàn bộ dữ liệu hiện tại (tài khoản, lessons, điểm đã chấm). Không hoàn tác được, và bạn có thể phải đăng nhập lại. Tiếp tục?"
          confirmLabel="Ghi đè & khôi phục"
          danger
          onConfirm={doRestore}
          onClose={() => setPendingRestore(null)}
        />
      )}
    </div>
  );
}
