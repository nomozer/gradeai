import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { T } from "../../../theme/tokens";

type Variant = "primary" | "ghost" | "danger";

/** Shared button for the class screens — three variants on the Mirror palette. */
export function Btn({
  children,
  onClick,
  variant = "ghost",
  disabled = false,
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
}) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: "9px 16px",
    borderRadius: 9,
    fontFamily: T.font,
    fontSize: T.fontSize.sm,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    transition: "background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
    whiteSpace: "nowrap",
    border: "1px solid transparent",
  };
  const styles: Record<Variant, React.CSSProperties> = {
    primary: {
      background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentLight} 100%)`,
      color: "#FFFDF8",
      boxShadow: disabled ? "none" : "0 4px 12px -4px rgba(59, 79, 138, 0.4)",
    },
    ghost: {
      background: T.bgCard,
      color: T.textSoft,
      borderColor: T.border,
    },
    danger: {
      background: T.bgCard,
      color: T.red,
      borderColor: "rgba(184, 66, 58, 0.35)",
    },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{ ...base, ...styles[variant] }}
    >
      {children}
    </button>
  );
}

/** Labelled text input used in the create/edit modals + roster add row. */
export function Field({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  onEnter,
  maxLength,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  maxLength?: number;
}) {
  return (
    <label style={{ display: "block" }}>
      {label && (
        <span
          style={{
            display: "block",
            fontSize: T.fontSize.xs,
            fontWeight: 600,
            color: T.textMute,
            marginBottom: 6,
          }}
        >
          {label}
        </span>
      )}
      <input
        value={value}
        autoFocus={autoFocus}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = T.accent;
          e.currentTarget.style.boxShadow = `0 0 0 3px ${T.accentSoft}`;
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = T.border;
          e.currentTarget.style.boxShadow = "none";
        }}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "10px 12px",
          fontSize: T.fontSize.base,
          fontFamily: T.font,
          color: T.text,
          background: T.bgInput,
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          outline: "none",
        }}
      />
    </label>
  );
}

/** Centered modal dialog, portaled to <body>. Click-scrim or Esc to close. */
export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 440,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(28, 30, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: `min(${width}px, 100%)`,
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: 14,
          boxShadow: T.shadowStrong,
          padding: 24,
          fontFamily: T.font,
          animation: "fadeUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div
          style={{
            fontFamily: T.display,
            fontSize: T.fontSize.lg,
            fontWeight: 700,
            color: T.text,
            marginBottom: 14,
          }}
        >
          {title}
        </div>
        {children}
        {footer && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              marginTop: 22,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
