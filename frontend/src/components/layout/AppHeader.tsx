import { useEffect, useRef, useState, type ReactNode } from "react";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { Icon } from "../ui/Icon";
import { T } from "../../theme/tokens";
import type { Tab } from "../../types";
import { MirrorLogo } from "../ui/MirrorLogo";

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
  // Logged-in user shown in the avatar account-menu.
  username?: string;
  onLogout?: () => void;
  // Admin-only: jump to the management dashboard (rendered in the avatar menu
  // only when provided, i.e. the current user is an admin).
  onOpenAdmin?: () => void;
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

/**
 * Top app bar — global navigation.
 *
 *   [☰ (mobile)]  [MIRROR]   …student navigator…   [ avatar ▾ ]
 *
 * All workspace actions — Bài đã chấm / Bộ nhớ AI / Hướng dẫn / Đăng xuất —
 * live in the avatar account-menu at the far right (see ``AccountMenu``),
 * keeping the bar uncluttered. The avatar's own rect anchors the history
 * popover, which clamps itself on-screen.
 */
export function AppHeader({
  brand: _brand,
  onOpenMemory,
  onOpenHelp,
  onToggleHistory,
  historyActive,
  onOpenSidebar,
  tabs,
  activeId,
  onSelectTab,
  username,
  onLogout,
  onOpenAdmin,
}: AppHeaderProps) {
  const bp = useBreakpoint();
  const [hamburgerHovered, setHamburgerHovered] = useState(false);

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
      <div
        className="header-brand"
        style={{
          display: bp === "desktop" ? "flex" : "none",
          alignItems: "center",
          gap: 8,
          flex: "0 0 auto",
        }}
      >
        {/* Logo stays at its original 28px (not enlarged — it wasn't the
            problem); only the wordmark is sized UP to read EQUAL to it, so the
            two lock up as one unit without the overall mark growing. The
            translateY (in %, scales with size) corrects the artwork's
            bottom-heavy mass — red arc + filled base, empty top-left sits ~15%
            below the box's geometric centre — so the ink reads optically level
            with the text instead of low. */}
        <MirrorLogo size={28} style={{ transform: "translateY(-6%)" }} />
        <span
          style={{
            // Wordmark in Poppins (T.brand) + title-case "Mirror" — geometric &
            // friendly, replacing the heavier all-caps Be Vietnam Pro lockup.
            fontFamily: T.brand,
            // Sized to read EQUAL to the 28px mark (title-case caps ~0.7em).
            // 30 balances the lockup without enlarging the logo — fixes the old
            // "text too small beside the mark" without making the brand bigger.
            fontSize: 30,
            fontWeight: 700,
            color: T.accentDark,
            // Slight negative tracking — Poppins title-case looks tighter/cleaner.
            letterSpacing: -0.3,
            lineHeight: 1,
          }}
        >
          Mirror
        </span>
      </div>

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

      <AccountMenu
        username={username}
        historyActive={historyActive}
        onToggleHistory={onToggleHistory}
        onOpenMemory={onOpenMemory}
        onOpenHelp={onOpenHelp}
        onLogout={onLogout}
        onOpenAdmin={onOpenAdmin}
      />
    </header>
  );
}

// Avatar account-menu at the far right. Holds every workspace action
// (history / memory / help / logout) so the bar stays a single chip. The
// avatar's own rect anchors the history popover (which clamps on-screen).
function AccountMenu({
  username,
  historyActive,
  onToggleHistory,
  onOpenMemory,
  onOpenHelp,
  onLogout,
  onOpenAdmin,
}: {
  username?: string;
  historyActive: boolean;
  onToggleHistory: (anchorRect: DOMRect | null) => void;
  onOpenMemory: () => void;
  onOpenHelp: () => void;
  onLogout?: () => void;
  onOpenAdmin?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = (username || "GV").slice(0, 2).toUpperCase();
  const run = (fn?: () => void) => () => {
    setOpen(false);
    fn?.();
  };
  // History is a separate popover anchored under the avatar; close the menu
  // first, then hand its rect to the parent so the popover hangs beneath.
  const openHistory = () => {
    const rect = btnRef.current?.getBoundingClientRect() ?? null;
    setOpen(false);
    onToggleHistory(rect);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Tài khoản"
        title={username || "Tài khoản"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 38,
          height: 38,
          borderRadius: "50%",
          border: `1px solid ${open || historyActive ? T.accent : "rgba(59, 79, 138, 0.18)"}`,
          background: T.accentSoft,
          color: T.accentDark,
          fontWeight: 700,
          fontSize: 13,
          fontFamily: T.display,
          letterSpacing: 0.3,
          cursor: "pointer",
          transition: "border-color 0.15s ease, box-shadow 0.15s ease",
          boxShadow: open ? "0 0 0 3px rgba(59, 79, 138, 0.12)" : "none",
        }}
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: 46,
            right: 0,
            width: 224,
            background: T.bgCard,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            boxShadow: T.shadowStrong,
            zIndex: 90,
            overflow: "hidden",
            animation: "fadeUp 0.16s ease-out",
          }}
        >
          <div
            style={{
              padding: "12px 14px",
              borderBottom: `1px solid ${T.borderLight}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: T.accentSoft,
                color: T.accentDark,
                fontWeight: 700,
                fontSize: 12,
                fontFamily: T.display,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {initials}
            </span>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: T.fontSize.sm,
                  fontWeight: 600,
                  color: T.text,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {username || "Giáo viên"}
              </div>
              <div
                style={{
                  fontSize: T.fontSize.xxs,
                  color: T.textMute,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  fontWeight: 600,
                }}
              >
                Giáo viên
              </div>
            </div>
          </div>

          <div style={{ padding: 6 }}>
            {onOpenAdmin && (
              <MenuItem
                label="Trang quản trị"
                icon={<Icon.Layout size={16} />}
                onClick={run(onOpenAdmin)}
              />
            )}
            <MenuItem
              label="Bài đã chấm"
              icon={<Icon.FileText size={16} />}
              active={historyActive}
              onClick={openHistory}
            />
            <MenuItem label="Bộ nhớ AI" icon={<Icon.Lightbulb size={16} />} onClick={run(onOpenMemory)} />
            <MenuItem label="Hướng dẫn" icon={<Icon.HelpCircle size={16} />} onClick={run(onOpenHelp)} />
          </div>

          {onLogout && (
            <div style={{ padding: 6, borderTop: `1px solid ${T.borderLight}` }}>
              <MenuItem
                label="Đăng xuất"
                danger
                icon={
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ display: "block", flexShrink: 0, width: 16, height: 16 }}
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                }
                onClick={run(onLogout)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  icon,
  onClick,
  active,
  danger,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const color = danger ? T.red : active ? T.accentDark : T.textSoft;
  const background = hovered
    ? danger
      ? "rgba(184, 66, 58, 0.08)"
      : "rgba(59, 79, 138, 0.06)"
    : active
      ? "rgba(59, 79, 138, 0.06)"
      : "transparent";
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 10px",
        borderRadius: 8,
        border: "none",
        background,
        color,
        cursor: "pointer",
        fontSize: T.fontSize.sm,
        fontWeight: active ? 600 : 500,
        fontFamily: T.font,
        textAlign: "left",
        transition: "background-color 0.12s ease, color 0.12s ease",
      }}
    >
      <span style={{ display: "inline-flex", flexShrink: 0 }}>{icon}</span>
      <span>{label}</span>
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
