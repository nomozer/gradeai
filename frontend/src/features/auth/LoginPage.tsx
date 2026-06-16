/**
 * LoginPage — username + password gate in front of the whole app.
 *
 * Replaces the old shared-code AccessGate. On success it stores the session
 * (token + user) and calls `onAuthed` so the app mounts. Credentials are
 * verified by the backend (`/api/auth/login`); a 401 surfaces as an inline
 * error here rather than as a session-expiry.
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

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    fontSize: T.fontSize.base,
    color: T.text,
    background: T.bgInput,
    border: `1px solid ${error ? T.red : T.border}`,
    borderRadius: 8,
    outline: "none",
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
          borderRadius: 14,
          padding: T.space[6],
          boxShadow: "0 8px 28px rgba(44, 46, 58, 0.08)",
          display: "flex",
          flexDirection: "column",
          gap: T.space[4],
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
            }}
          >
            MIRROR
          </div>
          <div style={{ fontSize: T.fontSize.sm, color: T.textMute, marginTop: 4 }}>
            Đăng nhập để tiếp tục
          </div>
        </div>

        <input
          type="text"
          autoFocus
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Tên đăng nhập"
          aria-label="Tên đăng nhập"
          style={inputStyle}
        />
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mật khẩu"
          aria-label="Mật khẩu"
          style={inputStyle}
        />

        {error && (
          <div style={{ fontSize: T.fontSize.xs, color: T.red }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            width: "100%",
            padding: "10px 12px",
            fontSize: T.fontSize.sm,
            fontWeight: 600,
            color: "#fff",
            background: canSubmit ? T.accent : T.textFaint,
            border: "none",
            borderRadius: 8,
            cursor: canSubmit ? "pointer" : "default",
          }}
        >
          {busy ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
    </div>
  );
}
