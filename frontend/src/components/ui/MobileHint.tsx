import { useState } from "react";
import { T } from "../../theme/tokens";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { useLang } from "../../hooks/useLang";
import { vi } from "../../i18n/vi";
import { en } from "../../i18n/en";
import { Icon } from "./Icon";

const DISMISS_KEY = "hitl_mobile_hint_dismissed";

/**
 * MobileHint — soft, dismissible advisory shown on small screens.
 *
 * The grading surface (transcript + per-câu scoring + annotations) is built
 * to WORK on mobile/tablet (see the useBreakpoint tiers), but it's genuinely
 * more comfortable on a laptop/desktop. Rather than HARD-gating small devices
 * — which would throw away the responsive work and read as a limitation — we
 * show a one-time hint and let the teacher proceed. Dismissal persists in
 * localStorage so it never nags twice.
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
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        margin: "10px var(--ws-bleed, clamp(16px, 4vw, 32px)) 0",
        padding: "10px 16px",
        background: T.amberSoft,
        border: `1px solid rgba(192, 139, 48, 0.15)`,
        borderLeft: `4px solid ${T.amber}`,
        borderRadius: 8,
        fontFamily: T.font,
        fontSize: 13,
        color: T.textSoft,
        lineHeight: 1.45,
        boxSizing: "border-box",
      }}
    >
      {/* Soft amber icon container */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: T.amber,
          flexShrink: 0,
        }}
      >
        <Icon.Lightbulb size={15} />
      </div>

      <span style={{ flex: 1, minWidth: 0 }}>{String(dict.mobileHintText)}</span>

      <button
        type="button"
        onClick={dismiss}
        style={{
          flexShrink: 0,
          border: `1px solid rgba(192, 139, 48, 0.25)`,
          background: T.paper,
          color: T.amber,
          borderRadius: 6,
          padding: "4px 10px",
          fontSize: 11.5,
          fontWeight: 700,
          fontFamily: T.font,
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "all 0.2s ease",
          outline: "none",
          boxSizing: "border-box",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(192, 139, 48, 0.05)";
          e.currentTarget.style.borderColor = "rgba(192, 139, 48, 0.4)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = T.paper;
          e.currentTarget.style.borderColor = "rgba(192, 139, 48, 0.25)";
        }}
      >
        {String(dict.mobileHintDismiss)}
      </button>
    </div>
  );
}
