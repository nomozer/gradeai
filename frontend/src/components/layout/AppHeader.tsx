import { T } from "../../theme/tokens";
import { Icon } from "../ui/Icon";

interface AppHeaderProps {
  /** Mobile-only — opens the Sidebar drawer when defined. */
  onOpenDrawer?: () => void;
  onOpenMemory: () => void;
  onOpenHelp: () => void;
  memoryActive: boolean;
}

/**
 * Top app bar — global navigation. Visible on both desktop and mobile.
 *
 * Layout:
 *   [hamburger? | brand]    [Bộ nhớ HITL] [Hướng dẫn]
 *
 * On mobile the hamburger opens the Sidebar drawer (subject/class), and
 * action buttons drop their text labels to keep the row compact.
 */
export function AppHeader({
  onOpenDrawer,
  onOpenMemory,
  onOpenHelp,
  memoryActive,
}: AppHeaderProps) {
  return (
    <header
      style={{
        padding: "10px clamp(12px, 4vw, 32px)",
        borderBottom: `1px solid ${T.border}`,
        background: T.bg,
        position: "sticky",
        top: 0,
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
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
      </div>

      <nav style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <HeaderAction
          label="Bộ nhớ HITL"
          icon={<Icon.Lightbulb size={14} color={memoryActive ? "#FFFDF8" : T.amber} />}
          onClick={onOpenMemory}
          active={memoryActive}
          collapseLabel={!!onOpenDrawer}
        />
        <HeaderAction
          label="Hướng dẫn"
          icon={<Icon.FileText size={14} />}
          onClick={onOpenHelp}
          collapseLabel={!!onOpenDrawer}
        />
      </nav>
    </header>
  );
}

function HeaderAction({
  label,
  icon,
  onClick,
  active = false,
  collapseLabel = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  collapseLabel?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        background: active ? T.accent : "transparent",
        border: `1px solid ${active ? T.accent : T.border}`,
        color: active ? "#FFFDF8" : T.textSoft,
        padding: collapseLabel ? "6px 8px" : "6px 14px",
        fontSize: 14,
        fontFamily: T.font,
        borderRadius: 6,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = T.accent;
          e.currentTarget.style.color = T.accent;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = T.border;
          e.currentTarget.style.color = T.textSoft;
        }
      }}
    >
      {icon}
      {!collapseLabel && <span>{label}</span>}
    </button>
  );
}
