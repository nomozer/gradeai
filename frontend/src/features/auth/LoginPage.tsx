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

  // Decoration scales with the breakpoint and sits BEHIND the card (zIndex 0),
  // so it can grow without colliding with the centred form.
  const artW = bp === "desktop" ? 300 : bp === "laptop" ? 230 : 175;

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
          position: "relative",
          zIndex: 1,
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

      {/* Decorative hand-drawn "climb" — a figure striding up 3D blocks toward a
          violet summit star, in the deep-indigo ink + warm parchment surfaces of
          the system (the memory-violet marks the goal so the HITL motif reads).
          feDisplacementMap gives a light marker "wobble"; a soft ground shadow +
          spark halo add depth. Sits BEHIND the card so it can be large without
          colliding with the form. Hidden on mobile. */}
      {bp !== "mobile" && (
        <div
          style={{
            position: "absolute",
            bottom: 26,
            right: bp === "tablet" ? 24 : 48,
            zIndex: 0,
            color: T.accentDark,
          }}
        >
          <svg
            width={artW}
            height={Math.round((artW * 248) / 260)}
            viewBox="0 0 260 248"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <defs>
              <filter id="login-sketch" x="-20%" y="-20%" width="140%" height="140%">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.02"
                  numOctaves="2"
                  seed="9"
                  result="noise"
                />
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="noise"
                  scale="1.8"
                  xChannelSelector="R"
                  yChannelSelector="G"
                />
              </filter>
              <filter id="login-soft" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="3.2" />
              </filter>
            </defs>

            {/* Ground shadow + spark halo (unfiltered, soft) */}
            <ellipse cx="120" cy="233" rx="106" ry="9" fill="rgba(42, 59, 107, 0.07)" filter="url(#login-soft)" />
            <circle cx="226" cy="66" r="13" fill="rgba(124, 58, 237, 0.13)" />

            <g
              filter="url(#login-sketch)"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            >
              <g strokeWidth="2.6">
                {/* Box 3 — highest / back, drawn first */}
                <polygon points="150,168 214,168 214,136 150,136" fill={T.bgElevated} />
                <polygon points="214,168 214,136 238,122 238,154" fill={T.border} />
                <polygon points="150,136 214,136 238,122 174,122" fill="rgba(124, 58, 237, 0.14)" />
                {/* Box 2 — middle */}
                <polygon points="96,196 160,196 160,164 96,164" fill={T.bgElevated} />
                <polygon points="160,196 160,164 184,150 184,182" fill={T.border} />
                <polygon points="96,164 160,164 184,150 120,150" fill={T.bgCard} />
                {/* Box 1 — lowest / front, drawn last so it overlaps cleanly */}
                <polygon points="24,224 88,224 88,192 24,192" fill={T.bgElevated} />
                <polygon points="88,224 88,192 112,178 112,210" fill={T.border} />
                <polygon points="24,192 88,192 112,178 48,178" fill={T.bgCard} />
              </g>

              {/* Figure mid-stride, climbing up-right */}
              <g strokeWidth="3.2">
                <circle cx="190" cy="82" r="10" />
                <path d="M 198 75 L 205 71" />
                <path d="M 190 92 L 188 98" />
                <path d="M 188 98 L 180 134" />
                <path d="M 188 98 L 177 110 L 168 122" />
                <path d="M 188 98 L 201 92 L 214 80" />
                <path d="M 180 134 L 170 150 L 158 162" />
                <path d="M 180 134 L 197 148 L 208 140" />
              </g>
            </g>

            {/* Summit star — crisp violet against the rough lines (the goal) */}
            <path
              d="M 226 55 C 227.5 62.5 228.5 63.5 235 65 C 228.5 66.5 227.5 67.5 226 75 C 224.5 67.5 223.5 66.5 217 65 C 223.5 63.5 224.5 62.5 226 55 Z"
              fill={T.memory}
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
