/**
 * AccessGate — shared-password gate in front of the whole app.
 *
 * A coarse anti-abuse gate for a fixed group of users (NOT per-user auth):
 * it stops the public internet from reaching the backend and spending the
 * Gemini key. The teacher enters the shared access token once; it's kept in
 * localStorage and attached to every `/api/*` request by `client.ts`.
 *
 * The token is NOT verified here — we optimistically render the app, and if
 * any request comes back 401 the client clears the token and fires
 * `AUTH_REQUIRED_EVENT`, which drops us back to this form with an error.
 *
 * When ACCESS_TOKEN is unset on the backend (local dev), the very first
 * request succeeds without a token, so this form is the only friction — set
 * a token in localStorage once and it stays out of the way.
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { T } from "../../theme/tokens";
import { GlobalStyles } from "../../theme/GlobalStyles";
import {
  getAccessToken,
  setAccessToken,
  AUTH_REQUIRED_EVENT,
} from "../../api/accessToken";

export function AccessGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean>(() => !!getAccessToken());
  const [value, setValue] = useState("");
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    const onAuthRequired = () => {
      // A request was rejected (wrong/expired token) — re-show the form.
      setAuthed(false);
      setRejected(true);
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
  }, []);

  if (authed) return <>{children}</>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const token = value.trim();
    if (!token) return;
    setAccessToken(token);
    setRejected(false);
    setAuthed(true);
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
              color: T.text,
              letterSpacing: 1,
            }}
          >
            MIRROR
          </div>
          <div style={{ fontSize: T.fontSize.sm, color: T.textMute, marginTop: 4 }}>
            Nhập mã truy cập để tiếp tục
          </div>
        </div>

        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Mã truy cập"
          aria-label="Mã truy cập"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            fontSize: T.fontSize.base,
            color: T.text,
            background: T.bgInput,
            border: `1px solid ${rejected ? T.red : T.border}`,
            borderRadius: 8,
            outline: "none",
          }}
        />

        {rejected && (
          <div style={{ fontSize: T.fontSize.xs, color: T.red }}>
            Mã truy cập không đúng. Vui lòng thử lại.
          </div>
        )}

        <button
          type="submit"
          disabled={!value.trim()}
          style={{
            width: "100%",
            padding: "10px 12px",
            fontSize: T.fontSize.sm,
            fontWeight: 600,
            color: "#fff",
            background: value.trim() ? T.accent : T.textFaint,
            border: "none",
            borderRadius: 8,
            cursor: value.trim() ? "pointer" : "default",
          }}
        >
          Vào hệ thống
        </button>
      </form>
    </div>
  );
}
