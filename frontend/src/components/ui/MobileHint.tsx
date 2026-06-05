import { useState } from "react";
import { T } from "../../theme/tokens";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { useLang } from "../../hooks/useLang";
import { vi } from "../../i18n/vi";
import { en } from "../../i18n/en";

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
        gap: 10,
        padding: "8px 14px",
        background: T.amberSoft,
        borderBottom: `1px solid ${T.amber}40`,
        fontFamily: T.font,
        fontSize: 13,
        color: T.textSoft,
        lineHeight: 1.4,
      }}
    >
      <span aria-hidden style={{ flexShrink: 0, fontSize: 15 }}>
        💡
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>{String(dict.mobileHintText)}</span>
      <button
        type="button"
        onClick={dismiss}
        style={{
          flexShrink: 0,
          border: `1px solid ${T.amber}55`,
          background: "transparent",
          color: T.amber,
          borderRadius: 6,
          padding: "4px 10px",
          fontSize: 12,
          fontWeight: 600,
          fontFamily: T.font,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {String(dict.mobileHintDismiss)}
      </button>
    </div>
  );
}
