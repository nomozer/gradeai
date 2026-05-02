import type { CSSProperties } from "react";
import { T } from "../../theme/tokens";
import { Icon } from "../ui/Icon";
import type { I18nStrings } from "../../types";

interface SidebarProps {
  t: I18nStrings;
  selectedSubject: string;
  onSubjectChange: (value: string) => void;
  selectedClass: string;
  onClassChange: (value: string) => void;
  /** When true, render as a fixed-position slide-in drawer with a backdrop
   *  overlay. Used on mobile (≤900 px) — App.tsx mounts/unmounts this branch
   *  based on a hamburger toggle. */
  drawer?: boolean;
  /** Required when ``drawer`` — fires on backdrop click, ESC, or close button. */
  onClose?: () => void;
}

/**
 * Sidebar — subject + class selectors.
 *
 * Two render modes:
 *   - default: sticky 260 px left rail (desktop)
 *   - drawer:  fixed slide-in panel + backdrop (mobile)
 *
 * The drawer variant matches the reference design — vertical sections with
 * uppercase labels, slide-in from the left, click-outside-to-close.
 */
export function Sidebar({
  t,
  selectedSubject,
  onSubjectChange,
  selectedClass,
  onClassChange,
  drawer = false,
  onClose,
}: SidebarProps) {
  const asideStyle: CSSProperties = drawer
    ? {
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        width: "min(86vw, 320px)",
        background: T.bgCard,
        borderRight: `1px solid ${T.border}`,
        padding: "24px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        boxShadow: T.shadowStrong,
        zIndex: 200,
        animation: "drawerSlideIn 0.24s ease-out",
        overflowY: "auto",
      }
    : {
        background: T.bgCard,
        borderRight: `1px solid ${T.border}`,
        padding: "28px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 28,
        height: "100vh",
        position: "sticky",
        top: 0,
      };

  const sectionLabelStyle: CSSProperties = {
    fontSize: 13,
    color: T.textMute,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    marginBottom: 10,
    fontWeight: 600,
  };

  const content = (
    <aside style={asideStyle}>
      {/* Header — logo + title, inspired by reference UI */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          {/* Logo — reference SVG (transparent) */}
          <img
            src="/favicon.svg"
            alt="MIRROR"
            width={drawer ? 38 : 42}
            height={drawer ? 38 : 42}
            style={{
              flexShrink: 0,
              objectFit: "contain",
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: T.display,
                fontSize: drawer ? 18 : 20,
                fontWeight: 600,
                color: T.text,
                letterSpacing: "-0.01em",
                lineHeight: 1.1,
              }}
            >
              {String(t.title)}
            </div>
            <div
              style={{
                fontSize: 13,
                color: T.textMute,
                marginTop: 3,
                lineHeight: 1.3,
                letterSpacing: "0.01em",
              }}
            >
              Bài chấm tự động
            </div>
          </div>
        </div>
        {drawer && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            title="Đóng"
            style={{
              background: "transparent",
              border: "none",
              color: T.textMute,
              padding: 4,
              marginTop: -2,
              marginRight: -4,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              transition: "color 0.15s, background 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = T.text;
              e.currentTarget.style.background = T.bgHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = T.textMute;
              e.currentTarget.style.background = "transparent";
            }}
          >
            <Icon.X size={16} />
          </button>
        )}
      </div>

      {/* Subject select */}
      <div>
        <div style={sectionLabelStyle}>Môn học</div>
        <div
          style={{
            position: "relative",
            // Pulse the dropdown border when no subject is selected so the
            // teacher's eye is drawn here from the waiting hero in the
            // main pane. Once a subject is picked this dies down.
            borderRadius: 6,
            animation: !selectedSubject ? "subjectPrompt 1.6s ease-in-out infinite" : "none",
          }}
        >
          <select
            value={selectedSubject}
            onChange={(e) => onSubjectChange(e.target.value)}
            style={{
              width: "100%",
              appearance: "none",
              padding: "10px 30px 10px 12px",
              background: T.bg,
              color: selectedSubject ? T.text : T.textFaint,
              fontSize: 16,
              border: `1px solid ${selectedSubject ? T.border : T.accent}`,
              borderRadius: 6,
              cursor: "pointer",
              outline: "none",
            }}
          >
            <option value="" disabled>
              — Chọn môn —
            </option>
            {["Môn Tin", "Môn Toán", "Môn Vật lý"].map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>
          <div
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: T.textFaint,
            }}
          >
            <Icon.ArrowDown size={12} />
          </div>
        </div>
      </div>

      {/* Class select */}
      <div>
        <div style={sectionLabelStyle}>Khối lớp</div>
        <div style={{ position: "relative", borderRadius: 6 }}>
          <select
            value={selectedClass}
            onChange={(e) => onClassChange(e.target.value)}
            style={{
              width: "100%",
              appearance: "none",
              padding: "10px 30px 10px 12px",
              background: T.bg,
              color: T.text,
              fontSize: 16,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              cursor: "pointer",
              outline: "none",
            }}
          >
            {["Lớp 10", "Lớp 11", "Lớp 12"].map((cls) => (
              <option key={cls} value={cls}>
                {cls}
              </option>
            ))}
          </select>
          <div
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: T.textFaint,
            }}
          >
            <Icon.ArrowDown size={12} />
          </div>
        </div>
      </div>
    </aside>
  );

  if (!drawer) return content;

  // Drawer mode: pair the panel with a click-to-close backdrop. Both share a
  // sibling fragment so the panel slides in over the dimmed page.
  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(20, 22, 32, 0.42)",
          zIndex: 190,
          animation: "backdropFadeIn 0.2s ease-out",
        }}
      />
      {content}
    </>
  );
}
