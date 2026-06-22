import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  addStudent,
  addStudentsBulk,
  deleteStudent,
  listStudents,
  updateStudent,
  type ClassRoom,
  type Student,
  type StudentBulkRow,
} from "../../api";
import { Icon } from "../../components/ui/Icon";
import { T } from "../../theme/tokens";
import { openInNewTab } from "../../lib/openInNewTab";
import { Btn, Field, Modal } from "./components/ClassUI";
import { Gradebook } from "./Gradebook";

/** Open the grading desk in a new tab, tagged with this class + student so
 *  the finalize step pushes the scores back into the gradebook. */
function gradeStudent(classId: number, studentId: number, name: string) {
  const url =
    window.location.origin +
    window.location.pathname +
    `#grade?cls=${classId}&sid=${studentId}&name=${encodeURIComponent(name)}`;
  openInNewTab(url);
}

/** Case-insensitive lookup across common header spellings (VN + ascii). */
function pick(row: Record<string, unknown>, keys: string[]): string {
  const lower: Record<string, unknown> = {};
  for (const k of Object.keys(row)) lower[k.trim().toLowerCase()] = row[k];
  for (const key of keys) {
    const v = lower[key];
    if (v !== undefined && String(v).trim()) return String(v).trim();
  }
  return "";
}

const NAME_KEYS = ["full_name", "họ tên", "ho ten", "hoten", "họ và tên", "ho va ten", "tên", "ten", "name", "học sinh", "hoc sinh"];
const CODE_KEYS = ["student_code", "mã hs", "ma hs", "mã học sinh", "ma hoc sinh", "mã", "ma", "sbd", "code"];

export function ClassDetail({ cls, onBack }: { cls: ClassRoom; onBack: () => void }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [addName, setAddName] = useState("");
  const [addCode, setAddCode] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);

  const [edit, setEdit] = useState<Student | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Student | null>(null);
  const [view, setView] = useState<"roster" | "gradebook">("roster");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    setLoading(true);
    listStudents(cls.id)
      .then((res) => {
        setStudents(res.students);
        setError("");
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.detail : "Không tải được danh sách học sinh."),
      )
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [cls.id]);

  const submitAdd = () => {
    if (!addName.trim() || addBusy) return;
    setAddBusy(true);
    setError("");
    addStudent(cls.id, addName.trim(), addCode.trim() || null)
      .then((s) => {
        setStudents((prev) => [...prev, s]);
        setAddName("");
        setAddCode("");
        setInfo("");
      })
      .catch((e) => setError(e instanceof ApiError ? e.detail : "Thêm học sinh thất bại."))
      .finally(() => setAddBusy(false));
  };

  const onImportFile = async (file: File) => {
    setImportBusy(true);
    setError("");
    setInfo("");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      const rows: StudentBulkRow[] = raw
        .map((r) => ({ full_name: pick(r, NAME_KEYS), student_code: pick(r, CODE_KEYS) || null }))
        .filter((r) => r.full_name);
      if (rows.length === 0) {
        setError('Không tìm thấy học sinh. Cần cột "Họ tên" (và tùy chọn "Mã HS").');
        return;
      }
      const res = await addStudentsBulk(cls.id, rows);
      setInfo(`Đã thêm ${res.inserted} học sinh từ file.`);
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Không đọc được file Excel (.xlsx).");
    } finally {
      setImportBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px clamp(16px, 4vw, 32px) 80px" }}>
      {/* Back + title */}
      <button
        type="button"
        onClick={onBack}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          border: "none",
          color: T.textMute,
          cursor: "pointer",
          fontFamily: T.font,
          fontSize: T.fontSize.sm,
          fontWeight: 600,
          padding: "4px 0",
          marginBottom: 12,
        }}
      >
        <Icon.ArrowLeft size={16} /> Tất cả lớp
      </button>

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: T.display,
              fontSize: T.fontSize["3xl"],
              fontWeight: 700,
              margin: 0,
              color: T.text,
            }}
          >
            {cls.name}
          </h1>
          <div style={{ color: T.textMute, fontSize: T.fontSize.sm, marginTop: 4 }}>
            {cls.note ? `${cls.note} · ` : ""}
            {students.length} học sinh
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <ViewToggle view={view} onChange={setView} />
          {view === "roster" && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onImportFile(f);
                }}
              />
              <Btn onClick={() => fileRef.current?.click()} disabled={importBusy}>
                <Icon.Upload size={15} /> {importBusy ? "Đang nhập…" : "Nhập danh sách (Excel)"}
              </Btn>
            </>
          )}
        </div>
      </div>

      {view === "gradebook" ? (
        <Gradebook cls={cls} onGrade={(r) => gradeStudent(cls.id, r.id, r.full_name)} />
      ) : (
        <>
      {/* Quick add row */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 14,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "2 1 220px" }}>
          <Field label="Họ tên học sinh" value={addName} onChange={setAddName} placeholder="VD: Nguyễn Văn An" onEnter={submitAdd} maxLength={120} />
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <Field label="Mã HS (tùy chọn)" value={addCode} onChange={setAddCode} placeholder="VD: 001" onEnter={submitAdd} maxLength={60} />
        </div>
        <Btn variant="primary" onClick={submitAdd} disabled={!addName.trim() || addBusy}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Thêm
        </Btn>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: T.redSoft, border: `1px solid ${T.red}`, borderRadius: 8, color: T.red, marginBottom: 14, fontSize: T.fontSize.sm }}>
          {error}
        </div>
      )}
      {info && (
        <div style={{ padding: "10px 14px", background: T.greenSoft, border: `1px solid ${T.green}`, borderRadius: 8, color: T.green, marginBottom: 14, fontSize: T.fontSize.sm }}>
          {info}
        </div>
      )}

      {loading ? (
        <div style={{ color: T.textMute, padding: "40px 0", textAlign: "center" }}>Đang tải…</div>
      ) : students.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", background: T.bgCard, border: `1px dashed ${T.border}`, borderRadius: 12, color: T.textMute }}>
          Chưa có học sinh nào. Thêm tay ở trên hoặc nhập từ file Excel.
        </div>
      ) : (
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 460 }}>
              <thead>
                <tr>
                  <Th style={{ width: 56, textAlign: "center" }}>STT</Th>
                  <Th>Họ tên</Th>
                  <Th style={{ width: 140 }}>Mã HS</Th>
                  <Th style={{ width: 160, textAlign: "right" }}></Th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => (
                  <StudentRow
                    key={s.id}
                    index={i + 1}
                    student={s}
                    onGrade={() => gradeStudent(cls.id, s.id, s.full_name)}
                    onEdit={() => setEdit(s)}
                    onDelete={() => setConfirmDelete(s)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </>
      )}

      {edit && (
        <StudentFormModal
          student={edit}
          onClose={() => setEdit(null)}
          onSaved={(updated) => {
            setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
            setEdit(null);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteStudent
          student={confirmDelete}
          onClose={() => setConfirmDelete(null)}
          onDeleted={(id) => {
            setStudents((prev) => prev.filter((s) => s.id !== id));
            setConfirmDelete(null);
          }}
        />
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
        padding: "12px 16px",
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

function StudentRow({
  index,
  student,
  onGrade,
  onEdit,
  onDelete,
}: {
  index: number;
  student: Student;
  onGrade: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <tr
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ borderBottom: `1px solid ${T.borderLight}`, background: hover ? T.bgHover : "transparent" }}
    >
      <td style={{ padding: "11px 16px", textAlign: "center", color: T.textFaint, fontFamily: T.mono, fontSize: 13 }}>{index}</td>
      <td style={{ padding: "11px 16px", fontSize: T.fontSize.base, fontWeight: 600, color: T.text }}>{student.full_name}</td>
      <td style={{ padding: "11px 16px", fontFamily: T.mono, fontSize: 13, color: T.textMute }}>{student.student_code || "—"}</td>
      <td style={{ padding: "8px 12px", textAlign: "right" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, opacity: hover ? 1 : 0.55, transition: "opacity 0.12s ease" }}>
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
              whiteSpace: "nowrap",
              padding: "4px 6px",
            }}
          >
            Chấm bài →
          </button>
          <RowIconBtn title="Sửa" onClick={onEdit}>
            <Icon.Edit size={15} />
          </RowIconBtn>
          <RowIconBtn title="Xóa" danger onClick={onDelete}>
            <Icon.X size={15} />
          </RowIconBtn>
        </span>
      </td>
    </tr>
  );
}

/** Segmented toggle between the roster (Danh sách) and the gradebook. */
function ViewToggle({
  view,
  onChange,
}: {
  view: "roster" | "gradebook";
  onChange: (v: "roster" | "gradebook") => void;
}) {
  const opt = (key: "roster" | "gradebook", label: string) => {
    const active = view === key;
    return (
      <button
        type="button"
        onClick={() => onChange(key)}
        style={{
          padding: "7px 14px",
          borderRadius: 8,
          border: "none",
          background: active ? T.bgCard : "transparent",
          color: active ? T.accent : T.textMute,
          fontFamily: T.font,
          fontSize: T.fontSize.sm,
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: active ? "0 1px 2px rgba(44,46,58,0.08)" : "none",
          transition: "background 0.15s ease, color 0.15s ease",
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div style={{ display: "inline-flex", gap: 2, padding: 3, background: T.bgElevated, borderRadius: 10, border: `1px solid ${T.border}` }}>
      {opt("roster", "Danh sách")}
      {opt("gradebook", "Bảng điểm")}
    </div>
  );
}

function RowIconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        border: "none",
        background: hover ? (danger ? "rgba(184,66,58,0.08)" : T.bgElevated) : "transparent",
        color: danger ? T.red : T.textMute,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 0.12s ease",
      }}
    >
      {children}
    </button>
  );
}

function StudentFormModal({
  student,
  onClose,
  onSaved,
}: {
  student: Student;
  onClose: () => void;
  onSaved: (s: Student) => void;
}) {
  const [name, setName] = useState(student.full_name);
  const [code, setCode] = useState(student.student_code ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    updateStudent(student.id, { full_name: name.trim(), student_code: code.trim() || null })
      .then(() => onSaved({ ...student, full_name: name.trim(), student_code: code.trim() || null }))
      .catch((e) => setError(e instanceof ApiError ? e.detail : "Lưu thất bại."))
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      title="Sửa học sinh"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Hủy</Btn>
          <Btn variant="primary" onClick={save} disabled={!name.trim() || busy}>
            {busy ? "Đang lưu…" : "Lưu"}
          </Btn>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Họ tên" value={name} onChange={setName} autoFocus maxLength={120} onEnter={save} />
        <Field label="Mã HS (tùy chọn)" value={code} onChange={setCode} maxLength={60} onEnter={save} />
        {error && <div style={{ color: T.red, fontSize: T.fontSize.sm }}>{error}</div>}
      </div>
    </Modal>
  );
}

function ConfirmDeleteStudent({
  student,
  onClose,
  onDeleted,
}: {
  student: Student;
  onClose: () => void;
  onDeleted: (id: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const remove = () => {
    setBusy(true);
    setError("");
    deleteStudent(student.id)
      .then(() => onDeleted(student.id))
      .catch((e) => setError(e instanceof ApiError ? e.detail : "Xóa thất bại."))
      .finally(() => setBusy(false));
  };
  return (
    <Modal
      title="Xóa học sinh?"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Hủy</Btn>
          <Btn variant="danger" onClick={remove} disabled={busy}>
            {busy ? "Đang xóa…" : "Xóa"}
          </Btn>
        </>
      }
    >
      <div style={{ fontSize: T.fontSize.base, color: T.textSoft, lineHeight: 1.5 }}>
        Xóa <b>{student.full_name}</b> khỏi danh sách lớp?
      </div>
      {error && <div style={{ color: T.red, fontSize: T.fontSize.sm, marginTop: 10 }}>{error}</div>}
    </Modal>
  );
}
