/**
 * LoginPage — username + password gate in front of the whole app.
 *
 * Replaces the old shared-code AccessGate. On success it stores the session
 * (token + user) and calls `onAuthed` so the app mounts. Credentials are
 * verified by the backend (`/api/auth/login`); a 401 surfaces as an inline
 * error here rather than as a session-expiry.
 *
 * Flat / minimal by request: no logo mark, gradient or shadow — just the
 * wordmark, two thin-bordered fields and a solid accent button.
 */

import { useState } from "react";
import { T } from "../../theme/tokens";
import { GlobalStyles } from "../../theme/GlobalStyles";
import { login } from "../../api/authApi";
import { setSession } from "../../api/session";
import { ApiError } from "../../api/client";

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
          maxWidth: 360,
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 28,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div>
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
          <div style={{ fontSize: T.fontSize.sm, color: T.textMute, marginTop: 4 }}>
            Đăng nhập để tiếp tục
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input
            type="text"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={setUsername}
            placeholder="Tên đăng nhập"
            ariaLabel="Tên đăng nhập"
            hasError={!!error}
          />
          <Input
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
          <div style={{ fontSize: T.fontSize.xs, color: T.red }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            width: "100%",
            padding: "11px 12px",
            fontSize: T.fontSize.sm,
            fontWeight: 600,
            color: canSubmit ? "#fff" : T.textMute,
            background: canSubmit ? T.accent : T.bgElevated,
            border: canSubmit ? "none" : `1px solid ${T.border}`,
            borderRadius: 8,
            cursor: canSubmit ? "pointer" : "default",
            transition: "background 0.15s ease, color 0.15s ease",
          }}
        >
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
    </div>
  );
}

function Input({
  type,
  value,
  onChange,
  placeholder,
  ariaLabel,
  autoComplete,
  autoFocus,
  hasError,
}: {
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
  return (
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
        padding: "11px 14px",
        fontSize: T.fontSize.base,
        color: T.text,
        background: T.bgInput,
        border: `1px solid ${hasError ? T.red : focused ? T.accent : T.border}`,
        borderRadius: 8,
        outline: "none",
        transition: "border-color 0.15s ease",
      }}
    />
  );
}
