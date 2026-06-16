import { useMemo, useRef, useState, type ReactNode } from "react";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { Icon } from "../ui/Icon";
import { T } from "../../theme/tokens";
import type { Tab } from "../../types";

interface AppHeaderProps {
  brand: string;
  onOpenMemory: () => void;
  onOpenHelp: () => void;
  memoryActive: boolean;
  onToggleHistory: (anchorRect: DOMRect | null) => void;
  historyActive: boolean;
  onOpenSidebar?: () => void;
  // Optional student navigator — when provided, renders the active-tab
  // chip + prev/next controls in the centre of the header. Drives the
  // "teacher language" UX upgrade where the always-visible focal point
  // is "đang chấm bài 2/12" rather than the TabBar metaphor above.
  tabs?: Tab[];
  activeId?: string;
  onSelectTab?: (id: string) => void;
  // Auth controls. ``onOpenAdmin`` only renders its link when ``isAdmin``.
  isAdmin?: boolean;
  onOpenAdmin?: () => void;
  onLogout?: () => void;
}

// Two-letter initials from a label — used by the avatar circle. Falls
// back to "BL" (bài làm) for unnamed tabs so the chip never renders
// empty.
function initialsOf(label: string): string {
  const cleaned = label.trim();
  if (!cleaned) return "BL";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "BL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  // Last two name words — VN names: "Trần Phương Linh" → "PL".
  const last = parts[parts.length - 1];
  const second = parts[parts.length - 2];
  return (second[0] + last[0]).toUpperCase();
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
  tabs,
  activeId,
  onSelectTab,
  isAdmin,
  onOpenAdmin,
  onLogout,
}: AppHeaderProps) {
  const bp = useBreakpoint();
  const [hamburgerHovered, setHamburgerHovered] = useState(false);
  const historyBtnRef = useRef<HTMLButtonElement | null>(null);

  // Student navigator — derived state. Only renders when the parent
  // wires up tabs + activeId + onSelectTab (single source of truth: the
  // workspace owns tab state). Hidden on mobile where header width is
  // too tight; mobile users navigate via the TabBar drawer instead.
  const showNav = !!(tabs && tabs.length > 0 && activeId && onSelectTab);
  const activeIndex = showNav
    ? tabs!.findIndex((tab) => tab.id === activeId)
    : -1;
  const activeTab = activeIndex >= 0 ? tabs![activeIndex] : null;
  const total = tabs?.length ?? 0;
  const goPrev = () => {
    if (!showNav || activeIndex <= 0) return;
    onSelectTab!(tabs![activeIndex - 1].id);
  };
  const goNext = () => {
    if (!showNav || activeIndex < 0 || activeIndex >= total - 1) return;
    onSelectTab!(tabs![activeIndex + 1].id);
  };

  const navItems = useMemo<NavItem[]>(() => {
    const items: NavItem[] = [
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
    ];
    if (isAdmin && onOpenAdmin) {
      items.push({
        id: "admin",
        kind: "text",
        label: "Quản lý TK",
        labelShort: "Tài khoản",
        active: false,
        onClick: onOpenAdmin,
      });
    }
    items.push({
      id: "help",
      kind: "icon",
      label: "Hướng dẫn",
      icon: <Icon.HelpCircle size={16} />,
      active: false,
      onClick: onOpenHelp,
    });
    if (onLogout) {
      items.push({
        id: "logout",
        kind: "text",
        label: "Đăng xuất",
        labelShort: "Thoát",
        active: false,
        onClick: onLogout,
      });
    }
    return items;
  }, [
    historyActive,
    memoryActive,
    onOpenMemory,
    onOpenHelp,
    onToggleHistory,
    isAdmin,
    onOpenAdmin,
    onLogout,
  ]);

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

      {showNav && activeTab && bp !== "mobile" && (
        <StudentNavigator
          tab={activeTab}
          index={activeIndex}
          total={total}
          onPrev={goPrev}
          onNext={goNext}
          compact={bp === "tablet" || bp === "laptop"}
        />
      )}

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

// Student navigator — single-chip focal point that replaces "TabBar
// metaphor" with "teacher language" mental model:
//
//   [ PL ]  Trần Phương Linh   2/12   ◀  ▶
//   └ avatar └ label ──────────└ counter └ prev/next
//
// Status dot on the avatar: green when finalized, amber when graded but
// awaiting review, red on error, neutral otherwise. The chip is purely
// derived from props — no state lives here.
function StudentNavigator({
  tab,
  index,
  total,
  onPrev,
  onNext,
  compact,
}: {
  tab: Tab;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  compact: boolean;
}) {
  const canPrev = index > 0;
  const canNext = index < total - 1;
  const initials = initialsOf(tab.label);

  // Status colour priority: error > finalized > awaiting > idle.
  // Matches TabBar's icon palette so the two stay in sync without an
  // explicit shared enum.
  const statusColor = tab.error
    ? T.red
    : tab.finalized
      ? T.green
      : tab.hasGrade
        ? T.amber
        : T.textFaint;

  return (
    <div
      className="header-student-nav"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flex: "1 1 auto",
        minWidth: 0,
        justifyContent: "center",
        // Cap the chip width so it doesn't push the nav to wrap. The
        // label truncates with ellipsis well before that limit.
        maxWidth: compact ? 320 : 520,
        margin: "0 auto",
      }}
    >
      <NavArrow onClick={onPrev} disabled={!canPrev} dir="prev" />
      <div
        title={`Đang chấm: ${tab.label} (${index + 1}/${total})`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "4px 12px 4px 4px",
          borderRadius: 999,
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          minWidth: 0,
          maxWidth: "100%",
          height: 36,
          boxShadow: "0 1px 2px rgba(44, 46, 58, 0.04)",
        }}
      >
        <span
          style={{
            position: "relative",
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: T.accentSoft,
            color: T.accentDark,
            fontSize: T.fontSize.xs,
            fontWeight: 700,
            fontFamily: T.font,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "0 0 auto",
            letterSpacing: 0.2,
          }}
        >
          {initials}
          <span
            aria-hidden
            style={{
              position: "absolute",
              right: -1,
              bottom: -1,
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: statusColor,
              border: `2px solid ${T.bgCard}`,
            }}
          />
        </span>
        <span
          style={{
            fontSize: T.fontSize.sm,
            fontFamily: T.font,
            fontWeight: 600,
            color: T.text,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
            maxWidth: compact ? 160 : 280,
          }}
        >
          {tab.label || "Bài chưa đặt tên"}
        </span>
        <span
          aria-label={`Bài ${index + 1} trên ${total}`}
          style={{
            fontSize: T.fontSize.xs,
            fontFamily: T.mono,
            fontWeight: 500,
            color: T.textMute,
            padding: "2px 8px",
            background: T.bgElevated,
            borderRadius: 999,
            flex: "0 0 auto",
            letterSpacing: 0.3,
          }}
        >
          {index + 1}/{total}
        </span>
      </div>
      <NavArrow onClick={onNext} disabled={!canNext} dir="next" />
    </div>
  );
}

function NavArrow({
  onClick,
  disabled,
  dir,
}: {
  onClick: () => void;
  disabled: boolean;
  dir: "prev" | "next";
}) {
  const [hovered, setHovered] = useState(false);
  const label = dir === "prev" ? "Bài trước" : "Bài sau";
  return (
    <button
      type="button"
      className="hdr-nav-arrow"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={label}
      title={label}
      style={{
        width: 30,
        height: 30,
        borderRadius: "50%",
        border: "none",
        background: disabled ? "transparent" : hovered ? T.bgHover : "transparent",
        color: disabled ? T.textFaint : T.textSoft,
        cursor: disabled ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
        transition: "background-color 0.15s ease, color 0.15s ease",
        flex: "0 0 auto",
      }}
    >
      {dir === "prev" ? (
        <Icon.ChevronRight size={16} style={{ transform: "rotate(180deg)" }} />
      ) : (
        <Icon.ChevronRight size={16} />
      )}
    </button>
  );
}
