import { useState } from "react";
import { T } from "../../theme/tokens";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { useLang } from "../../hooks/useLang";
import { vi } from "../../i18n/vi";
import { en } from "../../i18n/en";

const DISMISS_KEY = "hitl_mobile_hint_dismissed";

/**
 * MobileHint — Standalone Welcome Modal shown once on mobile/tablet screens.
 * Keeps the workspace clean by presenting a single, premium warning overlay
 * on mount, which the teacher can dismiss permanently.
 */
export function MobileHint() {
  const bp = useBreakpoint();
  const { lang } = useLang();
  const [dismissed, setDismissed] = useState<boolean>(
    () => localStorage.getItem(DISMISS_KEY) === "1",
  );

  if ((bp !== "mobile" && bp !== "tablet") || dismissed) return null;

  const dict = lang === "en" ? en : vi;
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private-mode storage may throw — non-fatal, just won't persist */
    }
    setDismissed(true);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(15, 23, 42, 0.55)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        padding: 20,
        animation: "fadeUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-hint-title"
        style={{
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: 16,
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.08)",
          width: "100%",
          maxWidth: 340,
          padding: "28px 24px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          boxSizing: "border-box",
        }}
      >
        {/* Device SVG Illustration */}
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: "50%",
            background: `${T.accent}12`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
            color: T.accent,
          }}
        >
          <svg
            width={40}
            height={40}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Monitor/Desktop outline */}
            <rect x="2" y="3" width="18" height="11" rx="1.5" ry="1.5" />
            <line x1="7" y1="18" x2="15" y2="18" />
            <line x1="11" y1="14" x2="11" y2="18" />
            {/* Smartphone outline overlaying bottom right, with background masking */}
            <rect
              x="15"
              y="9"
              width="6"
              height="11"
              rx="1"
              ry="1"
              fill={T.bgCard}
              stroke="currentColor"
              strokeWidth={1.5}
            />
            <circle cx="18" cy="17" r="0.75" fill="currentColor" stroke="none" />
          </svg>
        </div>

        {/* Title */}
        <h2
          id="mobile-hint-title"
          style={{
            margin: "0 0 10px",
            fontFamily: T.font,
            fontSize: 16.5,
            fontWeight: 700,
            color: T.text,
            lineHeight: 1.3,
          }}
        >
          {String(dict.mobileHintTitle ?? "Tối ưu hóa thiết bị")}
        </h2>

        {/* Description */}
        <p
          style={{
            margin: "0 0 24px",
            fontFamily: T.font,
            fontSize: 13,
            color: T.textSoft,
            lineHeight: 1.5,
          }}
        >
          {String(dict.mobileHintText)}
        </p>

        {/* Got It Primary Button */}
        <button
          type="button"
          onClick={dismiss}
          style={{
            width: "100%",
            height: 40,
            background: `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
            color: "#FFFFFF",
            border: "none",
            borderRadius: 8,
            fontFamily: T.font,
            fontSize: 13.5,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: `0 4px 10px ${T.accentGlow}`,
            transition: "transform 0.15s ease, opacity 0.15s ease",
            outline: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.92";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
        >
          {String(dict.mobileHintDismiss)}
        </button>
      </div>
    </div>
  );
}
