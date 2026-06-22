import { useEffect, useState } from "react";
import {
  ApiError,
  createClass,
  deleteClass,
  listClasses,
  updateClass,
  type ClassRoom,
} from "../../api";
import { Icon } from "../../components/ui/Icon";
import { T } from "../../theme/tokens";
import { Btn, Field, Modal } from "./components/ClassUI";

type EditState =
  | { mode: "create" }
  | { mode: "edit"; cls: ClassRoom }
  | null;

export function ClassList({ onOpen }: { onOpen: (cls: ClassRoom) => void }) {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<EditState>(null);
  const [confirmDelete, setConfirmDelete] = useState<ClassRoom | null>(null);

  const refresh = () => {
    setLoading(true);
    listClasses()
      .then((res) => {
        setClasses(res.classes);
        setError("");
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.detail : "Không tải được danh sách lớp."),
      )
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px clamp(16px, 4vw, 32px) 80px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 22,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: T.accent,
              marginBottom: 6,
            }}
          >
            Lớp học
          </div>
          <h1
            style={{
              fontFamily: T.display,
              fontSize: T.fontSize["3xl"],
              fontWeight: 700,
              margin: 0,
              color: T.text,
            }}
          >
            Các lớp của bạn
          </h1>
        </div>
        <Btn variant="primary" onClick={() => setEdit({ mode: "create" })}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Tạo lớp
        </Btn>
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: T.redSoft,
            border: `1px solid ${T.red}`,
            borderRadius: 8,
            color: T.red,
            marginBottom: 16,
            fontSize: T.fontSize.sm,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: T.textMute, padding: "40px 0", textAlign: "center" }}>Đang tải…</div>
      ) : classes.length === 0 ? (
        <EmptyState onCreate={() => setEdit({ mode: "create" })} />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {classes.map((cls) => (
            <ClassCard
              key={cls.id}
              cls={cls}
              onOpen={() => onOpen(cls)}
              onEdit={() => setEdit({ mode: "edit", cls })}
              onDelete={() => setConfirmDelete(cls)}
            />
          ))}
        </div>
      )}

      {edit && (
        <ClassFormModal
          initial={edit.mode === "edit" ? edit.cls : null}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            refresh();
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteModal
          cls={confirmDelete}
          onClose={() => setConfirmDelete(null)}
          onDeleted={() => {
            setConfirmDelete(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ClassCard({
  cls,
  onOpen,
  onEdit,
  onDelete,
}: {
  cls: ClassRoom;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      style={{
        background: T.bgCard,
        border: `1px solid ${hover ? T.accent : T.border}`,
        borderRadius: 12,
        padding: 18,
        cursor: "pointer",
        boxShadow: hover ? T.shadowSoft : "none",
        transition: "border-color 0.15s ease, box-shadow 0.15s ease",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: 130,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: T.accentSoft,
            color: T.accent,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon.Layout size={18} />
        </span>
        <div style={{ display: "flex", gap: 2 }} onClick={(e) => e.stopPropagation()}>
          <IconBtn title="Sửa lớp" onClick={onEdit}>
            <Icon.Edit size={15} />
          </IconBtn>
          <IconBtn title="Xóa lớp" danger onClick={onDelete}>
            <Icon.X size={15} />
          </IconBtn>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: T.display,
            fontSize: T.fontSize.lg,
            fontWeight: 700,
            color: T.text,
            lineHeight: 1.25,
          }}
        >
          {cls.name}
        </div>
        {cls.note && (
          <div style={{ fontSize: T.fontSize.sm, color: T.textMute, marginTop: 4 }}>{cls.note}</div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: T.textMute, fontSize: T.fontSize.sm }}>
        <Icon.User size={14} />
        <span>{cls.student_count ?? 0} học sinh</span>
      </div>
    </div>
  );
}

function IconBtn({
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
        background: hover ? (danger ? "rgba(184,66,58,0.08)" : T.bgHover) : "transparent",
        color: danger ? T.red : T.textMute,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 0.12s ease, color 0.12s ease",
      }}
    >
      {children}
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "56px 20px",
        background: T.bgCard,
        border: `1px dashed ${T.border}`,
        borderRadius: 14,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: T.accentSoft,
          color: T.accent,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
        }}
      >
        <Icon.Layout size={24} />
      </div>
      <div style={{ fontFamily: T.display, fontSize: T.fontSize.xl, fontWeight: 700, color: T.text }}>
        Chưa có lớp nào
      </div>
      <div style={{ color: T.textMute, fontSize: T.fontSize.sm, margin: "6px 0 18px" }}>
        Tạo lớp đầu tiên rồi thêm danh sách học sinh để bắt đầu.
      </div>
      <Btn variant="primary" onClick={onCreate}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Tạo lớp
      </Btn>
    </div>
  );
}

function ClassFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: ClassRoom | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    const op = initial
      ? updateClass(initial.id, { name: name.trim(), note: note.trim() })
      : createClass(name.trim(), note.trim());
    op.then(onSaved)
      .catch((e) => setError(e instanceof ApiError ? e.detail : "Lưu lớp thất bại."))
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      title={initial ? "Sửa lớp" : "Tạo lớp mới"}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Hủy</Btn>
          <Btn variant="primary" onClick={save} disabled={!name.trim() || busy}>
            {busy ? "Đang lưu…" : initial ? "Lưu" : "Tạo lớp"}
          </Btn>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field
          label="Tên lớp"
          value={name}
          onChange={setName}
          placeholder="VD: Toán 10A"
          autoFocus
          maxLength={120}
          onEnter={save}
        />
        <Field
          label="Ghi chú (tùy chọn)"
          value={note}
          onChange={setNote}
          placeholder="VD: Kiểm tra giữa kỳ"
          maxLength={500}
          onEnter={save}
        />
        {error && <div style={{ color: T.red, fontSize: T.fontSize.sm }}>{error}</div>}
      </div>
    </Modal>
  );
}

function ConfirmDeleteModal({
  cls,
  onClose,
  onDeleted,
}: {
  cls: ClassRoom;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const remove = () => {
    setBusy(true);
    setError("");
    deleteClass(cls.id)
      .then(onDeleted)
      .catch((e) => setError(e instanceof ApiError ? e.detail : "Xóa lớp thất bại."))
      .finally(() => setBusy(false));
  };
  return (
    <Modal
      title="Xóa lớp?"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Hủy</Btn>
          <Btn variant="danger" onClick={remove} disabled={busy}>
            {busy ? "Đang xóa…" : "Xóa lớp"}
          </Btn>
        </>
      }
    >
      <div style={{ fontSize: T.fontSize.base, color: T.textSoft, lineHeight: 1.5 }}>
        Xóa lớp <b>{cls.name}</b> sẽ xóa luôn toàn bộ {cls.student_count ?? 0} học sinh trong danh
        sách. Hành động này không thể hoàn tác.
      </div>
      {error && <div style={{ color: T.red, fontSize: T.fontSize.sm, marginTop: 10 }}>{error}</div>}
    </Modal>
  );
}
