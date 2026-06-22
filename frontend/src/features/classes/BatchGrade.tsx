import { useMemo, useRef, useState } from "react";
import {
  detectSubject,
  generate,
  upsertStudentGrade,
  type ClassRoom,
  type Student,
} from "../../api";
import type { BackendSubject } from "../../types";
import { Icon } from "../../components/ui/Icon";
import { T } from "../../theme/tokens";
import { readOptimizedUploadDataUrl } from "../../lib/file";
import { parseGrade, parseCauHeader } from "../../lib/grade";
import { Btn } from "./components/ClassUI";

const SUBJECTS: { key: BackendSubject; label: string }[] = [
  { key: "math", label: "Toán" },
  { key: "cs", label: "Tin" },
  { key: "phys", label: "Lý" },
  { key: "chem", label: "Hóa" },
  { key: "bio", label: "Sinh" },
];
const MAX_CONCURRENCY = 3; // matches App.tsx batch — Gemini free-tier safe

/** Strip diacritics + non-alphanumerics → lowercase, for fuzzy name matching. */
function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

/** Parse "01_Nguyen Van An.pdf" → { stt: 1, namePart: "Nguyen Van An" }. */
function parseFilename(name: string): { stt: number | null; namePart: string } {
  const base = name.replace(/\.[^.]+$/, "");
  const m = base.match(/^\s*(\d+)\s*[_\-.\s]+(.*)$/);
  if (m) return { stt: parseInt(m[1], 10), namePart: m[2].trim() };
  return { stt: null, namePart: base.trim() };
}

/** Best-effort file → student match: name first, then STT (position / code). */
function matchStudent(file: File, students: Student[]): number | null {
  const { stt, namePart } = parseFilename(file.name);
  const nName = normalizeName(namePart);
  if (nName) {
    const exact = students.find((s) => normalizeName(s.full_name) === nName);
    if (exact) return exact.id;
    const partial = students.find((s) => {
      const sn = normalizeName(s.full_name);
      return sn.length > 3 && (sn.includes(nName) || nName.includes(sn));
    });
    if (partial) return partial.id;
  }
  if (stt != null) {
    const byCode = students.find(
      (s) => s.student_code && parseInt(s.student_code, 10) === stt,
    );
    if (byCode) return byCode.id;
    if (stt >= 1 && stt <= students.length) return students[stt - 1].id;
  }
  return null;
}

type RowStatus = "pending" | "grading" | "done" | "error" | "skipped";

interface BatchRow {
  file: File;
  studentId: number | null;
  status: RowStatus;
  score?: number;
  error?: string;
}

export function BatchGrade({
  cls,
  students,
  onBack,
  onDone,
}: {
  cls: ClassRoom;
  students: Student[];
  onBack: () => void;
  onDone: () => void;
}) {
  const [deFile, setDeFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [subject, setSubject] = useState<BackendSubject>("math");
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState("");
  const deRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  );

  const onPickDe = async (file: File) => {
    setDeFile(file);
    setError("");
    // Auto-detect subject from the đề once (best-effort).
    try {
      const b64 = await readOptimizedUploadDataUrl(file);
      if (b64) {
        const res = await detectSubject({ task_pdf_b64: b64 });
        if (res.confidence !== "none") setSubject(res.detected);
      }
    } catch {
      /* detection is best-effort; teacher can pick manually */
    }
  };

  const onPickFiles = (fileList: FileList) => {
    const incoming = Array.from(fileList);
    setRows((prev) => {
      const existing = new Set(prev.map((r) => r.file.name));
      const added: BatchRow[] = incoming
        .filter((f) => !existing.has(f.name))
        .map((f) => ({
          file: f,
          studentId: matchStudent(f, students),
          status: "pending" as RowStatus,
        }));
      return [...prev, ...added];
    });
  };

  const setRow = (i: number, patch: Partial<BatchRow>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const matchedCount = rows.filter((r) => r.studentId != null).length;
  const doneCount = rows.filter((r) => r.status === "done").length;
  const errorCount = rows.filter((r) => r.status === "error").length;

  const runBatch = async () => {
    if (!deFile) {
      setError("Cần tải lên Đề bài trước.");
      return;
    }
    if (matchedCount === 0) {
      setError("Chưa có file nào khớp học sinh.");
      return;
    }
    setRunning(true);
    setError("");
    setFinished(false);
    try {
      const taskB64 = await readOptimizedUploadDataUrl(deFile);
      const keyB64 = keyFile ? await readOptimizedUploadDataUrl(keyFile) : null;
      const subjectLabel = SUBJECTS.find((s) => s.key === subject)?.label ?? "";
      const task = `Chấm bài kiểm tra môn ${subjectLabel} — lớp ${cls.name}`;

      // Reset statuses for a (re)run.
      setRows((prev) =>
        prev.map((r) => ({
          ...r,
          status: r.studentId == null ? "skipped" : "pending",
          error: undefined,
          score: undefined,
        })),
      );

      const indices = rows
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.studentId != null)
        .map(({ i }) => i);

      let cursor = 0;
      const worker = async () => {
        while (cursor < indices.length) {
          const i = indices[cursor++];
          const row = rows[i];
          if (row.studentId == null) continue;
          setRow(i, { status: "grading" });
          try {
            const img = await readOptimizedUploadDataUrl(row.file);
            const resp = await generate({
              task,
              lang: "vi",
              image_b64: img,
              task_pdf_b64: taskB64,
              answer_key_pdf_b64: keyB64,
              subject,
            });
            const grade = parseGrade(resp.code);
            const scores: Record<number, number> = {};
            (grade?.per_question_feedback ?? []).forEach((q, j) => {
              const { num } = parseCauHeader(q.question ?? "", j + 1);
              scores[num] =
                typeof q.score === "number" && Number.isFinite(q.score) ? q.score : 0;
            });
            await upsertStudentGrade(row.studentId, scores, resp.run_id);
            const total = Object.values(scores).reduce((a, b) => a + b, 0);
            setRow(i, { status: "done", score: total });
          } catch (e) {
            setRow(i, {
              status: "error",
              error: e instanceof Error ? e.message : "lỗi",
            });
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(MAX_CONCURRENCY, indices.length) }, worker),
      );
      setFinished(true);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px clamp(16px, 4vw, 32px) 80px" }}>
      <button
        type="button"
        onClick={onBack}
        disabled={running}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          border: "none",
          color: T.textMute,
          cursor: running ? "default" : "pointer",
          fontFamily: T.font,
          fontSize: T.fontSize.sm,
          fontWeight: 600,
          padding: "4px 0",
          marginBottom: 12,
          opacity: running ? 0.5 : 1,
        }}
      >
        <Icon.ArrowLeft size={16} /> Quay lại lớp
      </button>

      <h1 style={{ fontFamily: T.display, fontSize: T.fontSize["2xl"], fontWeight: 700, margin: "0 0 4px", color: T.text }}>
        Chấm cả lớp — {cls.name}
      </h1>
      <p style={{ color: T.textMute, fontSize: T.fontSize.sm, margin: "0 0 18px" }}>
        Tải đề chung + thả tất cả bài làm (đặt tên <b>STT_HọTên</b>, vd <code>01_NguyenVanAn.pdf</code>).
        Hệ thống tự khớp học sinh, AI chấm song song, điểm tự vào bảng điểm.
      </p>

      {/* Setup row: đề + đáp án + subject */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <input ref={deRef} type="file" accept=".pdf,image/*" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickDe(f); }} />
        <Btn onClick={() => deRef.current?.click()} disabled={running}>
          <Icon.FileText size={15} /> {deFile ? `Đề: ${deFile.name}` : "Tải Đề bài *"}
        </Btn>
        <input ref={keyRef} type="file" accept=".pdf,image/*" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) setKeyFile(f); }} />
        <Btn onClick={() => keyRef.current?.click()} disabled={running}>
          <Icon.FileText size={15} /> {keyFile ? `Đáp án: ${keyFile.name}` : "Tải Đáp án (tùy chọn)"}
        </Btn>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: T.fontSize.sm, color: T.textMute }}>
          Môn
          <select
            value={subject}
            disabled={running}
            onChange={(e) => setSubject(e.target.value as BackendSubject)}
            style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgInput, fontFamily: T.font, fontSize: T.fontSize.sm, color: T.text }}
          >
            {SUBJECTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Drop zone for student files */}
      <input ref={filesRef} type="file" multiple accept=".pdf,image/*" style={{ display: "none" }}
        onChange={(e) => { if (e.target.files) onPickFiles(e.target.files); if (filesRef.current) filesRef.current.value = ""; }} />
      <div
        onClick={() => !running && filesRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (!running && e.dataTransfer.files) onPickFiles(e.dataTransfer.files); }}
        style={{
          border: `1.5px dashed ${T.border}`,
          borderRadius: 12,
          padding: "22px 16px",
          textAlign: "center",
          color: T.textMute,
          background: T.bgCard,
          cursor: running ? "default" : "pointer",
          marginBottom: 16,
        }}
      >
        <Icon.Upload size={22} color={T.textFaint} />
        <div style={{ marginTop: 6, fontSize: T.fontSize.sm }}>
          Kéo–thả nhiều file bài làm vào đây, hoặc nhấp để chọn
        </div>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: T.redSoft, border: `1px solid ${T.red}`, borderRadius: 8, color: T.red, marginBottom: 14, fontSize: T.fontSize.sm }}>
          {error}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <div style={{ fontSize: T.fontSize.sm, color: T.textMute }}>
              {rows.length} file · <b style={{ color: T.text }}>{matchedCount}</b> khớp
              {rows.length - matchedCount > 0 && <> · <span style={{ color: T.amber }}>{rows.length - matchedCount} chưa khớp</span></>}
              {(doneCount > 0 || errorCount > 0) && <> · <span style={{ color: T.green }}>{doneCount} xong</span>{errorCount > 0 && <span style={{ color: T.red }}> · {errorCount} lỗi</span>}</>}
            </div>
            <Btn variant="primary" onClick={runBatch} disabled={running || matchedCount === 0}>
              <Icon.Bot size={15} /> {running ? `Đang chấm… (${doneCount}/${matchedCount})` : finished ? "Chấm lại" : `Bắt đầu chấm (${matchedCount})`}
            </Btn>
          </div>

          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>File</th>
                    <th style={thStyle}>Học sinh</th>
                    <th style={{ ...thStyle, width: 150 }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.file.name} style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                      <td style={{ padding: "10px 14px", fontSize: T.fontSize.sm, color: T.textSoft, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.file.name}
                      </td>
                      <td style={{ padding: "8px 14px" }}>
                        <select
                          value={row.studentId ?? ""}
                          disabled={running}
                          onChange={(e) => setRow(i, { studentId: e.target.value ? Number(e.target.value) : null })}
                          style={{
                            padding: "6px 8px",
                            borderRadius: 7,
                            border: `1px solid ${row.studentId == null ? T.amber : T.border}`,
                            background: T.bgInput,
                            fontFamily: T.font,
                            fontSize: T.fontSize.sm,
                            color: row.studentId == null ? T.amber : T.text,
                            maxWidth: 220,
                          }}
                        >
                          <option value="">⚠ Chưa khớp (bỏ qua)</option>
                          {students.map((s) => (
                            <option key={s.id} value={s.id}>{s.full_name}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <StatusCell row={row} student={row.studentId != null ? byId.get(row.studentId) : undefined} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {finished && (
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ color: T.textSoft, fontSize: T.fontSize.sm }}>
                Xong {doneCount}/{matchedCount} bài{errorCount > 0 ? ` · ${errorCount} lỗi` : ""}. Điểm đã vào bảng điểm (điểm tạm — soát/sửa ở bảng điểm).
              </div>
              <Btn variant="primary" onClick={onDone}>
                <Icon.ArrowDown size={14} style={{ transform: "rotate(-90deg)" }} /> Xem bảng điểm
              </Btn>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
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
};

function StatusCell({ row, student }: { row: BatchRow; student?: Student }) {
  if (row.studentId == null)
    return <span style={{ color: T.textFaint, fontSize: T.fontSize.sm }}>— bỏ qua</span>;
  if (row.status === "grading")
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.accent, fontSize: T.fontSize.sm, fontWeight: 600 }}>
        <Icon.RefreshCw size={13} style={{ animation: "spin 1.5s linear infinite" }} /> Đang chấm…
      </span>
    );
  if (row.status === "done")
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.green, fontSize: T.fontSize.sm, fontWeight: 700 }}>
        <Icon.Check size={13} /> {row.score?.toFixed(1)} điểm
      </span>
    );
  if (row.status === "error")
    return (
      <span title={row.error} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.red, fontSize: T.fontSize.sm, fontWeight: 600 }}>
        <Icon.AlertTriangle size={13} /> Lỗi
      </span>
    );
  // pending
  return (
    <span style={{ color: T.textFaint, fontSize: T.fontSize.sm }}>
      {student ? "Sẵn sàng" : ""}
    </span>
  );
}
