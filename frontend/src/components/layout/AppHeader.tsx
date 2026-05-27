import { useMemo, useRef, useState, type ReactNode } from "react";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { Icon } from "../ui/Icon";
import { T } from "../../theme/tokens";

interface AppHeaderProps {
  brand: string;
  onOpenMemory: () => void;
  onOpenHelp: () => void;
  memoryActive: boolean;
  onToggleHistory: (anchorRect: DOMRect | null) => void;
  historyActive: boolean;
  onOpenSidebar?: () => void;
}

// Two nav idioms — keeps the top bar legible at all widths and follows
// the convention used by Notion / Linear / Vercel:
//   • "text"  — primary destinations carry a written label, no icon. The
//               label IS the affordance; an icon would only crowd it.
//   • "icon"  — utility actions (help, settings, share-like) collapse to
//               a single recognisable glyph. Tooltip carries the name.
type NavKind = "text" | "icon";

interface NavItem {
  id: string;
  kind: NavKind;
  /** Full label — used by `text` kind at laptop+, and by every kind as
   *  the aria-label / tooltip. */
  label: string;
  /** Shortened label for `text` kind at mobile / tablet. */
  labelShort?: string;
  /** Required when `kind === "icon"`. Ignored otherwise. */
  icon?: ReactNode;
  active: boolean;
  onClick: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}

/**
 * Top app bar — global navigation.
 *
 *   Desktop  : [MIRROR]                  Bài đã chấm   Bộ nhớ AI   (?)
 *   Laptop   : [☰]                       Bài đã chấm   Bộ nhớ AI   (?)
 *   Tablet   : [☰]                       Lịch sử       Bộ nhớ      (?)
 *   Mobile   : [☰]                       Lịch sử       Bộ nhớ      (?)
 *
 * The Help icon's round shape (vs the rounded-square text buttons)
 * already signals "different category" — no separator needed. If we
 * later add 2–3 more utility icons, reintroduce a separator then.
 *
 * To add a new top-level destination or utility, append an entry to the
 * `navItems` array — `kind` determines styling, no other code changes
 * are needed.
 */
export function AppHeader({
  brand,
  onOpenMemory,
  onOpenHelp,
  memoryActive,
  onToggleHistory,
  historyActive,
  onOpenSidebar,
}: AppHeaderProps) {
  const bp = useBreakpoint();
  const [hamburgerHovered, setHamburgerHovered] = useState(false);
  const historyBtnRef = useRef<HTMLButtonElement | null>(null);

  const navItems = useMemo<NavItem[]>(
    () => [
      {
        id: "history",
        kind: "text",
        label: "Bài đã chấm",
        labelShort: "Lịch sử",
        active: historyActive,
        buttonRef: historyBtnRef,
        onClick: () => {
          const rect = historyBtnRef.current?.getBoundingClientRect() ?? null;
          onToggleHistory(rect);
        },
      },
      {
        id: "memory",
        kind: "text",
        label: "Bộ nhớ AI",
        labelShort: "Bộ nhớ",
        active: memoryActive,
        onClick: onOpenMemory,
      },
      {
        id: "help",
        kind: "icon",
        label: "Hướng dẫn",
        icon: <Icon.HelpCircle size={16} />,
        active: false,
        onClick: onOpenHelp,
      },
    ],
    [historyActive, memoryActive, onOpenMemory, onOpenHelp, onToggleHistory],
  );

  // Destinations vs utilities — preserve declaration order within each
  // group so the array stays the source of truth for ordering.
  const textItems = navItems.filter((it) => it.kind === "text");
  const iconItems = navItems.filter((it) => it.kind === "icon");
  const useShortLabel = bp === "mobile" || bp === "tablet";

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
        flexWrap: "wrap",
      }}
    >
      {bp !== "desktop" && onOpenSidebar && (
        <button
          type="button"
          onClick={onOpenSidebar}
          onMouseEnter={() => setHamburgerHovered(true)}
          onMouseLeave={() => setHamburgerHovered(false)}
          aria-label="Open sidebar"
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            border: "none",
            background: hamburgerHovered ? T.bgHover : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: T.text,
            transition: "background 0.15s ease",
          }}
        >
          <Icon.Menu size={20} />
        </button>
      )}
      <span
        className="header-brand"
        style={{
          fontFamily: T.display,
          fontSize: T.fontSize.xl,
          fontWeight: 700,
          color: T.accentDark,
          letterSpacing: 0,
          lineHeight: 1,
          flex: "0 0 auto",
          display: bp === "desktop" ? undefined : "none",
        }}
      >
        {brand}
      </span>

      <nav
        className="header-nav"
        style={{
          display: "flex",
          alignItems: "center",
          gap: bp === "mobile" ? 2 : 4,
          flexShrink: 0,
        }}
      >
        {textItems.map((item) => (
          <NavTextLink key={item.id} item={item} short={useShortLabel} />
        ))}
        {iconItems.map((item) => (
          <NavIconButton key={item.id} item={item} />
        ))}
      </nav>
    </header>
  );
}

function NavTextLink({ item, short }: { item: NavItem; short: boolean }) {
  const [hovered, setHovered] = useState(false);
  const active = item.active;
  const label = short && item.labelShort ? item.labelShort : item.label;

  const color = active ? T.accentDark : hovered ? T.text : T.textSoft;
  const background = active
    ? "rgba(59, 79, 138, 0.10)"
    : hovered
      ? "rgba(44, 46, 58, 0.05)"
      : "transparent";

  return (
    <button
      ref={item.buttonRef}
      type="button"
      onClick={item.onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={item.label}
      title={item.label}
      aria-current={active ? "page" : undefined}
      style={{
        background,
        color,
        border: "none",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: T.fontSize.sm,
        fontFamily: T.font,
        fontWeight: active ? 600 : 500,
        whiteSpace: "nowrap",
        cursor: "pointer",
        transition: "background-color 0.15s ease, color 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}

function NavIconButton({ item }: { item: NavItem }) {
  const [hovered, setHovered] = useState(false);
  const active = item.active;
  const color = active ? T.accentDark : hovered ? T.text : T.textSoft;
  const background = active
    ? "rgba(59, 79, 138, 0.10)"
    : hovered
      ? "rgba(44, 46, 58, 0.05)"
      : "transparent";

  return (
    <button
      ref={item.buttonRef}
      type="button"
      onClick={item.onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={item.label}
      title={item.label}
      aria-current={active ? "page" : undefined}
      style={{
        width: 36,
        height: 36,
        background,
        color,
        border: "none",
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "background-color 0.15s ease, color 0.15s ease",
      }}
    >
      {item.icon}
    </button>
  );
}

