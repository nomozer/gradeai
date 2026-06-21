/**
 * LoginPage — username + password gate in front of the whole app.
 *
 * Replaces the old shared-code AccessGate. On success it stores the session
 * (token + user) and calls `onAuthed` so the app mounts. Credentials are
 * verified by the backend (`/api/auth/login`); a 401 surfaces as an inline
 * error here rather than as a session-expiry.
 *
 * Layout follows a Mentimeter-style login: brand mark top-left of the page,
 * a centred card with a big "welcome" heading, bold field labels, rounded
 * inputs, a password show/hide toggle and a solid accent primary button.
 */

import { useState } from "react";
import { T } from "../../theme/tokens";
import { GlobalStyles } from "../../theme/GlobalStyles";
import { login } from "../../api/authApi";
import { setSession } from "../../api/session";
import { ApiError } from "../../api/client";
import { MirrorLogo } from "../../components/ui/MirrorLogo";
import { useBreakpoint } from "../../hooks/useBreakpoint";

export function LoginPage({ onAuthed }: { onAuthed: () => void }) {
  const bp = useBreakpoint();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const clearError = () => {
    if (error) setError("");
  };

  const updateUsername = (value: string) => {
    setUsername(value);
    clearError();
  };

  const updatePassword = (value: string) => {
    setPassword(value);
    clearError();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!username.trim() || !password) {
      setError("Vui lòng nhập tên đăng nhập và mật khẩu.");
      return;
    }
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
        position: "relative",
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

      {/* Brand mark — top-left of the page, like the reference. */}
      <div
        style={{
          position: "absolute",
          top: 24,
          left: 28,
        }}
      >
        <MirrorLogo size={40} />
      </div>

      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 420,
          background: T.bgCard,
          border: `1px solid ${T.borderLight}`,
          borderRadius: 22,
          padding: "40px clamp(24px, 5vw, 40px)",
          boxShadow: "0 12px 40px rgba(44, 46, 58, 0.10)",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Heading */}
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <h1
            style={{
              fontFamily: T.display,
              fontSize: T.fontSize["3xl"],
              fontWeight: 800,
              color: T.text,
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            Chào mừng trở lại!
          </h1>
          <p style={{ fontSize: T.fontSize.base, color: T.textMute, margin: "8px 0 0" }}>
            Đăng nhập vào Mirror
          </p>
        </div>

        {/* Username */}
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <label htmlFor="login-username" style={labelStyle}>
            Tên đăng nhập
          </label>
          <Input
            id="login-username"
            type="text"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={updateUsername}
            placeholder="Nhập tên đăng nhập"
            hasError={!!error}
          />
        </div>

        {/* Password + show/hide */}
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <label htmlFor="login-password" style={labelStyle}>
            Mật khẩu
          </label>
          <Input
            id="login-password"
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={updatePassword}
            placeholder="Nhập mật khẩu"
            hasError={!!error}
            trailing={
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                title={showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                style={{
                  border: "none",
                  background: "transparent",
                  color: T.textMute,
                  cursor: "pointer",
                  display: "inline-flex",
                  padding: 4,
                }}
              >
                {showPw ? EyeOff : Eye}
              </button>
            }
          />
        </div>

        {error && (
          <div style={{ fontSize: T.fontSize.sm, color: T.red, marginTop: -4 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%",
            padding: "13px 12px",
            fontSize: T.fontSize.base,
            fontWeight: 700,
            color: "#fff",
            background: T.accent,
            border: "none",
            borderRadius: 12,
            cursor: busy ? "default" : "pointer",
            marginTop: 4,
            transition: "background 0.15s ease",
          }}
          onMouseEnter={(e) => {
            if (!busy) e.currentTarget.style.background = T.accentDark;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = T.accent;
          }}
        >
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>

        <div style={{ textAlign: "center", fontSize: T.fontSize.xs, color: T.textMute }}>
          Quên mật khẩu? Liên hệ quản trị viên để được cấp lại.
        </div>
      </form>

      {/* Decorative climbing stick figure at the bottom-right (hidden on mobile) */}
      {bp !== "mobile" && (
        <div
          style={{
            position: "absolute",
            bottom: 40,
            right: 60,
            color: T.text,
            opacity: 0.85,
          }}
        >
          <svg
            width="160"
            height="200"
            viewBox="0 0 160 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Base line */}
            <path
              d="M 0 198 Q 80 196 160 198"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* Stairs */}
            {/* Step 0 */}
            <path
              d="M 0 198 Q 8 198 16 198 M 16 198 Q 15 190 16 183 Q 32 184 48 183 M 48 183 L 48 198"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Step 1 */}
            <path
              d="M 48 183 Q 47 166 48 148 Q 66 147 84 148 L 84 198"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Step 2 */}
            <path
              d="M 84 148 Q 83 131 84 113 Q 102 114 120 113 L 120 198"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Step 3 */}
            <path
              d="M 120 113 Q 119 96 120 78 Q 136 79 152 78 L 152 198"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Stick Figure */}
            {/* Head */}
            <circle
              cx="84"
              cy="28"
              r="11"
              stroke="currentColor"
              strokeWidth="2.5"
            />
            
            {/* Neck */}
            <path
              d="M 84 39 L 83 52"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* Torso & Legs (Single continuous hand-drawn outline for body + thick legs) */}
            <path
              d="M 83 52 Q 90 70 80 96 Q 92 90 96 88 Q 102 100 106 113 L 98 113 Q 92 102 82 98 Q 75 124 72 148 L 62 148 Q 66 124 70 96 Q 73 75 83 52 Z"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Left arm */}
            <path
              d="M 76 60 Q 64 80 58 102"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Right arm */}
            <path
              d="M 85 58 Q 96 68 108 70"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: T.fontSize.sm,
  fontWeight: 700,
  color: T.text,
};

function Input({
  id,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  autoFocus,
  hasError,
  trailing,
}: {
  id?: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
  autoFocus?: boolean;
  hasError?: boolean;
  trailing?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const borderColor = hasError ? T.red : focused ? T.accent : T.border;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        background: hasError ? T.redSoft : T.bgInput,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 12,
        boxShadow: focused ? "0 0 0 3px rgba(59, 79, 138, 0.12)" : "none",
        transition: "border-color 0.15s ease, box-shadow 0.15s ease",
        paddingRight: trailing ? 8 : 0,
      }}
    >
      <input
        id={id}
        type={type}
        value={value}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          minWidth: 0,
          boxSizing: "border-box",
          padding: "12px 14px",
          fontSize: T.fontSize.base,
          color: T.text,
          background: "transparent",
          border: "none",
          borderRadius: 12,
          outline: "none",
        }}
      />
      {trailing}
    </div>
  );
}

const Eye = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOff = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);
