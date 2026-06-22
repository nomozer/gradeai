/**
 * AdminDashboard — the admin's home after login.
 *
 * Admins land HERE (not the grading workspace): a left sidebar + a main area
 * that switches between three sections — "Tổng quan" (system-wide stats),
 * "Quản lý tài khoản" (user CRUD) and "Sao lưu" (backup/restore). Admin is
 * management-only; the grading surface opens in a separate #grade tab.
 * Teachers never see this page.
 *
 * The section components + their shared UI kit were extracted into siblings:
 *   • OverviewSection / AccountsSection / BackupSection
 *   • adminPrimitives (StatCard, FormInput, SideLink, …), adminModals
 *   • adminStyles (shared CSSProperties), adminFormat (errText/fmtNum/…)
 * This file owns only the shell: the sidebar, drawer, and section routing.
 */

import { useCallback, useEffect, useState } from "react";
import { T } from "../../theme/tokens";
import { GlobalStyles } from "../../theme/GlobalStyles";
import { logout as logoutApi } from "../../api/authApi";
import { getUser, clearSession } from "../../api/session";
import { Icon } from "../../components/ui/Icon";
import { MirrorLogo } from "../../components/ui/MirrorLogo";
import { openInNewTab } from "../../lib/openInNewTab";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { SideLink } from "./adminPrimitives";
import { OverviewSection } from "./OverviewSection";
import { AccountsSection } from "./AccountsSection";
import { BackupSection } from "./BackupSection";

type Section = "overview" | "accounts" | "backup";

export function AdminDashboard() {
  const me = getUser();
  const [section, setSection] = useState<Section>("overview");

  // Below the desktop tier the 240px fixed sidebar eats the horizontal space
  // the account / overview tables need, so it collapses into an off-canvas ☰
  // drawer — matching the workspace's "sidebar hidden < 1200px" convention
  // (see useBreakpoint).
  const bp = useBreakpoint();
  const isNarrow = bp !== "desktop";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const MenuIcon = Icon.Menu;

  // Picking a section also dismisses the drawer (narrow mode only).
  const selectSection = useCallback((s: Section) => {
    setSection(s);
    setDrawerOpen(false);
  }, []);

  // Close the drawer when the viewport grows back to desktop, and on ESC.
  useEffect(() => {
    if (!isNarrow) setDrawerOpen(false);
  }, [isNarrow]);
  useEffect(() => {
    if (!isNarrow || !drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isNarrow, drawerOpen]);

  const handleLogout = useCallback(async () => {
    try {
      await logoutApi();
    } catch {
      /* best-effort */
    }
    clearSession();
    window.location.reload();
  }, []);

  // Admin can also grade: open the grading workspace (#grade) in a new tab so
  // the dashboard stays put. Uses an anchor click (not window.open with a
  // features string) so the popup blocker doesn't eat it on the deployed site.
  const openGrading = useCallback(() => {
    setDrawerOpen(false);
    openInNewTab(window.location.origin + window.location.pathname + "#grade");
  }, []);

  const asideStyle: React.CSSProperties = isNarrow
    ? {
        width: 248,
        maxWidth: "82vw",
        background: T.bgCard,
        borderRight: `1px solid ${T.border}`,
        display: "flex",
        flexDirection: "column",
        padding: T.space[4],
        position: "fixed",
        top: 0,
        left: 0,
        height: "100vh",
        zIndex: 340,
        overflowY: "auto",
        transform: drawerOpen ? "translateX(0)" : "translateX(-110%)",
        transition: "transform 0.25s ease",
        boxShadow: drawerOpen ? T.shadowStrong : "none",
      }
    : {
        width: 240,
        flex: "0 0 240px",
        background: T.bgCard,
        borderRight: `1px solid ${T.border}`,
        display: "flex",
        flexDirection: "column",
        padding: T.space[4],
        position: "sticky",
        top: 0,
        height: "100vh",
      };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isNarrow ? "column" : "row",
        minHeight: "100vh",
        background: T.bg,
        fontFamily: T.font,
      }}
    >
      <GlobalStyles />

      {/* Narrow-mode top bar: the ☰ that opens the sidebar drawer */}
      {isNarrow && (
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 40,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            background: T.bgCard,
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Mở menu quản trị"
            onMouseEnter={(e) => (e.currentTarget.style.background = T.bgHover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: T.textSoft,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "background 0.15s ease",
            }}
          >
            <MenuIcon size={20} color="currentColor" style={{ display: "block" }} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {/* Balanced lockup (see AppHeader): wordmark sized ≈ the logo,
                logo nudged up -6% for its bottom-heavy mass. */}
            <MirrorLogo size={24} style={{ transform: "translateY(-6%)" }} />
            <span
              style={{
                fontFamily: T.brand,
                fontSize: 26,
                fontWeight: 700,
                color: T.accentDark,
                letterSpacing: -0.3,
                lineHeight: 1,
              }}
            >
              Mirror
            </span>
          </div>
        </header>
      )}

      {/* Drawer backdrop (narrow + open) */}
      {isNarrow && drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(28, 30, 42, 0.45)", zIndex: 330 }}
        />
      )}

      {/* Sidebar (sticky rail on desktop, off-canvas drawer below it) */}
      <aside style={asideStyle}>
        <div
          style={{
            padding: "4px 8px",
            marginBottom: T.space[5],
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Balanced lockup (see AppHeader): wordmark sized ≈ the logo,
                  logo nudged up -6% for its bottom-heavy mass. */}
              <MirrorLogo size={28} style={{ transform: "translateY(-6%)" }} />
              <span
                style={{
                  fontFamily: T.brand,
                  fontSize: 30,
                  fontWeight: 700,
                  color: T.accentDark,
                  letterSpacing: -0.3,
                  lineHeight: 1,
                }}
              >
                Mirror
              </span>
            </div>
            {isNarrow && (
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Đóng menu"
                style={{
                  border: "none",
                  background: "transparent",
                  color: T.textMute,
                  cursor: "pointer",
                  fontSize: 20,
                  lineHeight: 1,
                  padding: 4,
                }}
              >
                ✕
              </button>
            )}
          </div>
          <span
            style={{
              display: "block",
              fontFamily: T.display,
              fontSize: T.fontSize.xs,
              color: T.textMute,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginTop: 4,
            }}
          >
            Quản trị
          </span>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <SideLink
            label="Tổng quan hệ thống"
            active={section === "overview"}
            icon="Layout"
            onClick={() => selectSection("overview")}
          />
          <SideLink
            label="Quản lý tài khoản"
            active={section === "accounts"}
            icon="User"
            onClick={() => selectSection("accounts")}
          />
          <SideLink
            label="Sao lưu dữ liệu"
            active={section === "backup"}
            icon="RefreshCw"
            onClick={() => selectSection("backup")}
          />
          <SideLink
            label="Chấm bài"
            active={false}
            icon="PenTool"
            onClick={openGrading}
          />
        </nav>

        <div
          style={{
            marginTop: "auto",
            paddingTop: T.space[4],
            borderTop: `1px solid ${T.borderLight}`,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px",
              background: T.bgMuted,
              borderRadius: 10,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: T.accentSoft,
                border: `1px solid rgba(59, 79, 138, 0.15)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: T.accent,
                fontWeight: 700,
                fontSize: 14,
                fontFamily: T.display,
                textTransform: "uppercase",
                flexShrink: 0,
              }}
            >
              {me?.username ? me.username.slice(0, 2) : "AD"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span
                style={{
                  fontSize: T.fontSize.sm,
                  fontWeight: 600,
                  color: T.text,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {me?.username || "Admin"}
              </span>
              <span
                style={{
                  fontSize: T.fontSize.xxs,
                  color: T.textMute,
                  textTransform: "uppercase",
                  fontWeight: 600,
                  letterSpacing: 0.5,
                }}
              >
                {me?.role === "admin" ? "Quản trị viên" : "Giáo viên"}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              width: "100%",
              padding: "9px 12px",
              fontSize: T.fontSize.sm,
              fontWeight: 600,
              color: T.red,
              background: "rgba(184, 66, 58, 0.05)",
              border: `1px solid rgba(184, 66, 58, 0.15)`,
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: T.font,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(184, 66, 58, 0.08)";
              e.currentTarget.style.borderColor = T.red;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(184, 66, 58, 0.05)";
              e.currentTarget.style.borderColor = "rgba(184, 66, 58, 0.15)";
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ display: "block", flexShrink: 0, width: 14, height: 14 }}
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, minWidth: 0, padding: "clamp(16px, 3vw, 36px)", overflowX: "auto" }}>
        {section === "overview" ? (
          <OverviewSection />
        ) : section === "accounts" ? (
          <AccountsSection me={me} />
        ) : (
          <BackupSection />
        )}
      </main>
    </div>
  );
}
