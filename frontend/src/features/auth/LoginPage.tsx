/**
 * LoginPage — username + password gate in front of the whole app.
 *
 * Replaces the old shared-code AccessGate. On success it stores the session
 * (token + user) and calls `onAuthed` so the app mounts. Credentials are
 * verified by the backend (`/api/auth/login`); a 401 surfaces as an inline
 * error here rather than as a session-expiry.
 */

import { useState, type ReactNode } from "react";
import { T } from "../../theme/tokens";
import { GlobalStyles } from "../../theme/GlobalStyles";
import { Icon } from "../../components/ui/Icon";
import { login } from "../../api/authApi";
import { setSession } from "../../api/session";
import { ApiError } from "../../api/client";

const LockIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: "block" }}
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export function LoginPage({ onAuthed }: { onAuthed: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit = !!username.trim() && !!password && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const res = await login(username.trim(), password);
      setSession(res.token, res.user);
      onAuthed();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail || "Đăng nhập thất bại."
          : "Không kết nối được máy chủ.",
      );
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: T.space[4],
        fontFamily: T.font,
      }}
    >
      <GlobalStyles />
      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 380,
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: 16,
          padding: "28px 28px 26px",
          boxShadow: T.shadowStrong,
          display: "flex",
          flexDirection: "column",
          gap: T.space[4],
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              width: 46,
              height: 46,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${T.accentLight} 0%, ${T.accentDark} 100%)`,
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 4px 12px rgba(59, 79, 138, 0.25)",
            }}
          >
            <Icon.PenTool size={22} color="#fff" />
          </span>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: T.display,
                fontSize: T.fontSize["2xl"],
                fontWeight: 700,
                color: T.accentDark,
                letterSpacing: 1,
                lineHeight: 1.1,
              }}
            >
              MIRROR
            </div>
            <div style={{ fontSize: T.fontSize.xs, color: T.textMute, marginTop: 2 }}>
              Chấm bài luận AI
            </div>
          </div>
        </div>

        <div
          style={{
            height: 1,
            background: T.borderLight,
            margin: "2px 0",
          }}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field
            icon={<Icon.User size={16} />}
            type="text"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={setUsername}
            placeholder="Tên đăng nhập"
            ariaLabel="Tên đăng nhập"
            hasError={!!error}
          />
          <Field
            icon={LockIcon}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            placeholder="Mật khẩu"
            ariaLabel="Mật khẩu"
            hasError={!!error}
          />
        </div>

        {error && (
          <div
            style={{
              fontSize: T.fontSize.xs,
              color: T.red,
              background: T.redSoft,
              border: `1px solid ${T.red}`,
              borderRadius: 8,
              padding: "8px 10px",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            width: "100%",
            padding: "11px 12px",
            fontSize: T.fontSize.sm,
            fontWeight: 700,
            color: "#fff",
            background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
            border: "none",
            borderRadius: 10,
            cursor: canSubmit ? "pointer" : "not-allowed",
            opacity: canSubmit ? 1 : 0.5,
            boxShadow: canSubmit ? "0 4px 12px rgba(59, 79, 138, 0.22)" : "none",
            transition: "opacity 0.15s ease, box-shadow 0.15s ease",
          }}
        >
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
    </div>
  );
}

function Field({
  icon,
  type,
  value,
  onChange,
  placeholder,
  ariaLabel,
  autoComplete,
  autoFocus,
  hasError,
}: {
  icon: ReactNode;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
  autoComplete?: string;
  autoFocus?: boolean;
  hasError?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const borderColor = hasError ? T.red : focused ? T.accent : T.border;
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 12,
          display: "inline-flex",
          color: focused ? T.accent : T.textMute,
          transition: "color 0.15s ease",
          pointerEvents: "none",
        }}
      >
        {icon}
      </span>
      <input
        type={type}
        value={value}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "11px 12px 11px 38px",
          fontSize: T.fontSize.base,
          color: T.text,
          background: T.bgInput,
          border: `1px solid ${borderColor}`,
          borderRadius: 10,
          outline: "none",
          boxShadow: focused ? "0 0 0 3px rgba(59, 79, 138, 0.12)" : "none",
          transition: "border-color 0.15s ease, box-shadow 0.15s ease",
        }}
      />
    </div>
  );
}
