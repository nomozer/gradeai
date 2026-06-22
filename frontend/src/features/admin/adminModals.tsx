import { useEffect, useState } from "react";
import { T } from "../../theme/tokens";
import { dangerBtn, toolbarGhostBtn, toolbarPrimaryBtn } from "./adminStyles";
import { errText } from "./adminFormat";
import { Field, FormInput, SubmitButton } from "./adminPrimitives";

// Centered modal dialog — backdrop click + ESC close; body scrolls if tall.
export function Modal({
  title,
  onClose,
  children,
  width = 480,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28, 30, 42, 0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "56px 16px",
        zIndex: 300,
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: width,
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: 14,
          boxShadow: T.shadowStrong,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: `1px solid ${T.borderLight}`,
          }}
        >
          <span style={{ fontSize: T.fontSize.base, fontWeight: 600, color: T.text }}>{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            style={{
              border: "none",
              background: "transparent",
              color: T.textMute,
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  );
}

// Styled single-input dialog — the designed replacement for window.prompt.
// `validate` returns an error string (or null when valid); it both gates the
// submit button and is shown inline once the user has typed.
export function PromptModal({
  title,
  label,
  inputType = "text",
  initialValue = "",
  placeholder,
  confirmLabel = "Lưu",
  validate,
  onSubmit,
  onClose,
}: {
  title: string;
  label: string;
  inputType?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  validate?: (v: string) => string | null;
  onSubmit: (v: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fieldErr = validate ? validate(value.trim()) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fieldErr) return;
    setBusy(true);
    setServerErr(null);
    try {
      await onSubmit(value.trim());
      onClose();
    } catch (err) {
      setServerErr(errText(err, "Thao tác thất bại."));
      setBusy(false);
    }
  };

  const shown = serverErr || (value.length > 0 ? fieldErr : null);
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: T.space[4] }}>
        <Field label={label}>
          <FormInput
            type={inputType}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            style={{ width: "100%" }}
          />
        </Field>
        {shown && <span style={{ fontSize: T.fontSize.xs, color: T.red }}>{shown}</span>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={toolbarGhostBtn}>
            Hủy
          </button>
          <SubmitButton enabled={!fieldErr} loading={busy} label={confirmLabel} loadingLabel="Đang lưu…" />
        </div>
      </form>
    </Modal>
  );
}

// Styled yes/no dialog — the designed replacement for window.confirm.
export function ConfirmModal({
  title,
  message,
  confirmLabel = "Xác nhận",
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setErr(errText(e, "Thao tác thất bại."));
      setBusy(false);
    }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: T.space[4] }}>
        <p style={{ margin: 0, color: T.textSoft, fontSize: T.fontSize.sm, lineHeight: 1.6 }}>{message}</p>
        {err && <span style={{ fontSize: T.fontSize.xs, color: T.red }}>{err}</span>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={toolbarGhostBtn}>
            Hủy
          </button>
          <button type="button" onClick={go} disabled={busy} style={danger ? dangerBtn : toolbarPrimaryBtn}>
            {busy ? "Đang xử lý…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
