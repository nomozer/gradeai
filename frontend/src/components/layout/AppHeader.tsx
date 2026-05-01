import { T } from "../../theme/tokens";
import { Icon } from "../ui/Icon";
import type { I18nStrings } from "../../types";

interface AppHeaderProps {
  selectedSubject: string;
  selectedClass: string;
  onToggleLang: () => void;
  /** When provided, renders a hamburger button on the left that opens the
   *  Sidebar drawer. App.tsx only passes this on mobile viewports. */
  onOpenDrawer?: () => void;
  t: I18nStrings;
}

export function AppHeader({
  selectedSubject,
  selectedClass,
  onToggleLang,
  onOpenDrawer,
  t,
}: AppHeaderProps) {
  return (
    <header
      style={{
        padding: "14px clamp(12px, 4vw, 32px)",
        borderBottom: `1px solid ${T.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        background: T.bg,
        position: "sticky",
        top: 0,
        zIndex: 80,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          minWidth: 0,
          flex: 1,
        }}
      >
        {onOpenDrawer && (
          <button
            type="button"
            onClick={onOpenDrawer}
            aria-label="Mở thanh điều khiển"
            title="Mở thanh điều khiển"
            style={{
              background: "transparent",
              border: "none",
              color: T.textSoft,
              padding: 6,
              borderRadius: 6,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "color 0.15s, background 0.15s",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = T.accent;
              e.currentTarget.style.background = T.accentSoft;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = T.textSoft;
              e.currentTarget.style.background = "transparent";
            }}
          >
            <Icon.Menu size={20} />
          </button>
        )}
        <div
          style={{
            fontSize: "clamp(14px, 2.4vw, 18px)",
            color: T.text,
            fontFamily: T.display,
            fontStyle: "italic",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {selectedSubject || (
            <span style={{ color: T.textFaint }}>— Chọn môn —</span>
          )}
          <span style={{ color: T.textFaint, margin: "0 8px" }}>/</span>
          {selectedClass}
        </div>
      </div>

      <button
        onClick={onToggleLang}
        style={{
          background: "transparent",
          border: `1px solid ${T.border}`,
          color: T.textSoft,
          padding: "6px 14px",
          fontSize: 14,
          transition: "all 0.2s",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = T.accent;
          e.currentTarget.style.color = T.accent;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = T.border;
          e.currentTarget.style.color = T.textSoft;
        }}
      >
        <Icon.Languages size={12} />
        {String(t.langSwitch)}
      </button>
    </header>
  );
}
