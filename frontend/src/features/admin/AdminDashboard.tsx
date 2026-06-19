/**
 * AdminDashboard — the admin's home after login.
 *
 * Admins land HERE (not the grading workspace): a left sidebar + a main area
 * that switches between two sections — "Tổng quan" (system-wide stats) and
 * "Quản lý tài khoản" (user CRUD). Admin is management-only; there is no
 * grading surface here by design. Teachers never see this page.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { T } from "../../theme/tokens";
import { GlobalStyles } from "../../theme/GlobalStyles";
import {
  getOverview,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  logout as logoutApi,
  getBackup,
  restoreBackup,
  type Overview,
  type OverviewUserRow,
  type RestoreResult,
} from "../../api/authApi";
import { getUser, clearSession, type SessionUser } from "../../api/session";
import { ApiError } from "../../api/client";
import { Icon } from "../../components/ui/Icon";
import { MirrorLogo } from "../../components/ui/MirrorLogo";
import { openInNewTab } from "../../lib/openInNewTab";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { BulkImportUsers } from "./BulkImportUsers";

type Section = "overview" | "accounts" | "backup";

function errText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.detail || fallback : fallback;
}

/** "1.234.567" — Vietnamese thousands grouping for token counts. */
function fmtNum(n: number | undefined): string {
  return (n || 0).toLocaleString("vi-VN");
}

/** Quota display: 0 (or unset) means no cap. */
function fmtQuota(q: number | undefined): string {
  return q && q > 0 ? fmtNum(q) : "Không giới hạn";
}

// ---------------------------------------------------------------------------
// Styled sub-components for Giao diện Admin Redesign
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon,
  accentColor,
  softBg,
}: {
  label: string;
  value: number;
  icon: keyof typeof Icon;
  accentColor: string;
  softBg: string;
}) {
  const [hovered, setHovered] = useState(false);
  const IconComp = Icon[icon];
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        background: T.bgCard,
        border: `1px solid ${hovered ? accentColor : T.border}`,
        borderRadius: 12,
        padding: "20px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        boxShadow: hovered ? T.shadowStrong : T.shadowSoft,
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        transition: "all 0.2s ease-in-out",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: T.fontSize.xs, color: T.textMute, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: T.fontSize["3xl"], fontWeight: 700, color: T.text, fontFamily: T.display }}>
          {value}
        </div>
      </div>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: softBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: accentColor,
          flexShrink: 0,
        }}
      >
        <IconComp size={22} color="currentColor" style={{ display: "block", flexShrink: 0, width: 22, height: 22 }} />
      </div>
    </div>
  );
}

// Identity cell shared by the overview + accounts tables: shows the teacher's
// display name (falling back to username) with @username + mã GV underneath,
// so the admin reads a real name instead of a cryptic login.
function UserIdentity({ user, isSelf }: { user: SessionUser; isSelf?: boolean }) {
  const name = (user.full_name || "").trim();
  const code = (user.teacher_code || "").trim();
  const sub: string[] = [];
  if (name) sub.push(`@${user.username}`);
  if (code) sub.push(`Mã: ${code}`);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600, color: T.text }}>
        {name || user.username}
        {isSelf && (
          <span
            style={{
              fontSize: 11,
              padding: "2px 6px",
              borderRadius: 4,
              background: T.accentSoft,
              color: T.accent,
              fontWeight: 500,
            }}
          >
            bạn
          </span>
        )}
      </span>
      {sub.length > 0 && (
        <span style={{ fontSize: T.fontSize.xxs, color: T.textMute }}>{sub.join(" · ")}</span>
      )}
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        background: active ? "rgba(46, 125, 91, 0.08)" : "rgba(184, 66, 58, 0.08)",
        color: active ? T.green : T.red,
        border: `1px solid ${active ? "rgba(46, 125, 91, 0.15)" : "rgba(184, 66, 58, 0.15)"}`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: active ? T.green : T.red,
          flexShrink: 0,
        }}
      />
      {active ? "Hoạt động" : "Đã khóa"}
    </span>
  );
}

function TableRow({ children, isEven }: { children: React.ReactNode; isEven?: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? T.bgHover : isEven ? "rgba(255,253,248,0.4)" : "transparent",
        transition: "background 0.15s ease",
        borderBottom: `1px solid ${T.borderLight}`,
      }}
    >
      {children}
    </tr>
  );
}

function FormInput({
  type = "text",
  value,
  onChange,
  placeholder,
  style,
}: {
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...inputStyle,
        borderColor: focused ? T.accent : T.border,
        boxShadow: focused ? "0 0 0 3px rgba(59, 79, 138, 0.12)" : T.shadowSoft,
        transition: "all 0.2s ease-in-out",
        ...style,
      }}
    />
  );
}

function FormSelect({
  value,
  onChange,
  children,
  style,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <select
      value={value}
      onChange={onChange}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ...inputStyle,
        minWidth: 140,
        // Drop the inconsistent native caret and draw our own chevron so it
        // sits at a fixed inset, vertically centred, inside the rounded box.
        appearance: "none",
        WebkitAppearance: "none",
        MozAppearance: "none",
        paddingRight: 34,
        backgroundImage: SELECT_CHEVRON,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 12px center",
        backgroundSize: "16px",
        borderColor: focused ? T.accent : T.border,
        boxShadow: focused ? "0 0 0 3px rgba(59, 79, 138, 0.12)" : T.shadowSoft,
        transition: "all 0.2s ease-in-out",
        cursor: "pointer",
        ...style,
      }}
    >
      {children}
    </select>
  );
}

// Down-chevron as an inline SVG data URI (stroke = T.textMute #7A7C8A).
const SELECT_CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%237A7C8A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")";

function SubmitButton({
  enabled,
  loading,
  label,
  loadingLabel,
}: {
  enabled: boolean;
  loading: boolean;
  label: string;
  loadingLabel: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="submit"
      disabled={loading || !enabled}
      onMouseEnter={() => enabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "9px 20px",
        fontSize: T.fontSize.sm,
        fontWeight: 600,
        color: "#fff",
        background: !enabled
          ? T.textFaint
          : hovered
            ? `linear-gradient(135deg, ${T.accentLight} 0%, ${T.accent} 100%)`
            : `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
        border: "none",
        borderRadius: 8,
        cursor: enabled && !loading ? "pointer" : "default",
        height: 38,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: enabled && hovered ? "0 4px 12px rgba(59, 79, 138, 0.25)" : "none",
        transform: enabled && hovered ? "translateY(-1px)" : "translateY(0)",
        transition: "all 0.18s ease-in-out",
        minWidth: 80,
      }}
    >
      {loading ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <svg
            style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          >
            <circle cx="12" cy="12" r="10" strokeDasharray="40" strokeDashoffset="10" />
          </svg>
          {loadingLabel}
        </span>
      ) : (
        label
      )}
    </button>
  );
}

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
            <MirrorLogo size={24} />
            <span
              style={{
                fontFamily: T.display,
                fontSize: T.fontSize.base,
                fontWeight: 800,
                color: T.accentDark,
                letterSpacing: 0.5,
              }}
            >
              MIRROR
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
              <MirrorLogo size={28} />
              <span
                style={{
                  fontFamily: T.display,
                  fontSize: T.fontSize.lg,
                  fontWeight: 800,
                  color: T.accentDark,
                  letterSpacing: 0.5,
                }}
              >
                MIRROR
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

function SideLink({
  label,
  active,
  icon,
  onClick,
}: {
  label: string;
  active: boolean;
  icon: keyof typeof Icon;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const IconComponent = Icon[icon];
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        textAlign: "left",
        padding: "10px 14px",
        borderRadius: 8,
        border: "none",
        cursor: "pointer",
        fontSize: T.fontSize.sm,
        fontWeight: active ? 600 : 500,
        fontFamily: T.font,
        color: active ? T.accent : hovered ? T.accentLight : T.textSoft,
        background: active
          ? "rgba(59, 79, 138, 0.08)"
          : hovered
            ? "rgba(59, 79, 138, 0.03)"
            : "transparent",
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        transition: "all 0.18s ease-in-out",
        borderLeft: active ? `3px solid ${T.accent}` : "3px solid transparent",
        paddingLeft: active ? 11 : 14,
      }}
    >
      <IconComponent size={16} color={active ? T.accent : hovered ? T.accentLight : T.textMute} style={{ display: "block", flexShrink: 0, width: 16, height: 16 }} />
      <span>{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Overview section
// ---------------------------------------------------------------------------

function OverviewSection() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOverview()
      .then(setData)
      .catch((err) => setError(errText(err, "Không tải được số liệu.")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.space[5] }}>
      <h1 style={titleStyle}>Tổng quan hệ thống</h1>
      {error && <Banner text={error} />}
      {loading ? (
        <p style={mutedStyle}>Đang tải…</p>
      ) : data ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: T.space[4],
            }}
          >
            <StatCard label="Tài khoản" value={data.total_accounts} icon="User" accentColor={T.accent} softBg={T.accentSoft} />
            <StatCard label="Giáo viên" value={data.total_teachers} icon="Award" accentColor={T.amber} softBg={T.amberSoft} />
            <StatCard label="Tổng bài đã chấm" value={data.total_graded} icon="FileText" accentColor={T.green} softBg={T.greenSoft} />
            <StatCard label="Tổng lessons đã học" value={data.total_lessons} icon="Lightbulb" accentColor={T.memory} softBg={T.memorySoft} />
          </div>

          <TeacherActivityTable users={data.users} />
        </>
      ) : null}
    </div>
  );
}

// "Hoạt động theo giáo viên" table — search + pagination so a 40-teacher
// roster doesn't become an endless scroll. Filter reuses the SAME fields as
// the Quản lý tài khoản search (tên / mã GV / username) for muscle-memory
// consistency; both are client-side (the overview payload is already loaded).
const TEACHER_PAGE_SIZE = 15;

function TeacherActivityTable({ users }: { users: OverviewUserRow[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? users.filter((u) =>
        [u.username, u.full_name, u.teacher_code].some((f) =>
          (f || "").toLowerCase().includes(q),
        ),
      )
    : users;

  const totalPages = Math.max(1, Math.ceil(filtered.length / TEACHER_PAGE_SIZE));
  // Clamp: if the filter shrinks the list below the current page, snap back
  // so we never render an empty page mid-roster.
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * TEACHER_PAGE_SIZE;
  const pageRows = filtered.slice(start, start + TEACHER_PAGE_SIZE);

  return (
    <div style={{ ...cardStyle, width: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: T.space[3],
          flexWrap: "wrap",
          marginBottom: 4,
        }}
      >
        <div style={{ ...sectionTitleStyle, fontSize: T.fontSize.base, color: T.text }}>
          Hoạt động theo giáo viên ({filtered.length})
        </div>
        <FormInput
          value={query}
          // Reset to page 1 on every keystroke so the matches are visible
          // instead of stranded on a now-out-of-range page.
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Tìm theo tên, mã GV, tên đăng nhập…"
          style={{ minWidth: 0, width: "100%", maxWidth: 300 }}
        />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr style={{ textAlign: "left", color: T.textMute }}>
              <th style={thStyle}>Tài khoản</th>
              <th style={thStyle}>Vai trò</th>
              <th style={thStyle}>Trạng thái</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Bài đã chấm</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Lessons</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Token đã dùng (30 ngày)</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Hạn mức token</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: T.textMute }}>
                  {q ? `Không có giáo viên khớp “${query.trim()}”.` : "Chưa có dữ liệu."}
                </td>
              </tr>
            ) : (
              pageRows.map((u, idx) => {
                const over = !!u.token_quota && u.token_quota > 0 && u.tokens_used >= u.token_quota;
                return (
                  <TableRow key={u.id} isEven={idx % 2 === 0}>
                    <td style={tdStyle}><UserIdentity user={u} /></td>
                    <td style={tdStyle}>{u.role === "admin" ? "Admin" : "Giáo viên"}</td>
                    <td style={tdStyle}>
                      <StatusBadge active={!!u.is_active} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{u.graded}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{u.lessons}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: over ? T.red : T.text }}>
                      {fmtNum(u.tokens_used)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: T.textMute }}>
                      {fmtQuota(u.token_quota)}
                    </td>
                  </TableRow>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <Pager page={safePage} totalPages={totalPages} onPage={setPage} />
      )}
    </div>
  );
}

// Minimal prev/next pager. ChevronLeft isn't in the Icon pack, so the
// "Trước" arrow is a 180°-rotated ChevronRight.
function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  const btn = (disabled: boolean): React.CSSProperties => ({
    padding: "6px 12px",
    borderRadius: 8,
    border: `1px solid ${T.border}`,
    background: T.bgCard,
    color: disabled ? T.textFaint : T.textSoft,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: T.fontSize.sm,
    fontFamily: T.font,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    opacity: disabled ? 0.5 : 1,
  });
  const atFirst = page <= 1;
  const atLast = page >= totalPages;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 12,
        marginTop: 12,
      }}
    >
      <button type="button" disabled={atFirst} onClick={() => onPage(page - 1)} style={btn(atFirst)}>
        <Icon.ChevronRight size={14} style={{ transform: "rotate(180deg)" }} />
        Trước
      </button>
      <span style={{ fontSize: T.fontSize.sm, color: T.textMute, fontFamily: T.font, fontWeight: 600 }}>
        Trang {page}/{totalPages}
      </span>
      <button type="button" disabled={atLast} onClick={() => onPage(page + 1)} style={btn(atLast)}>
        Sau
        <Icon.ChevronRight size={14} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accounts section (user CRUD)
// ---------------------------------------------------------------------------

function AccountsSection({ me }: { me: SessionUser | null }) {
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [newQuota, setNewQuota] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newTeacherCode, setNewTeacherCode] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setError("");
    try {
      const res = await listUsers();
      setUsers(res.items);
    } catch (err) {
      setError(errText(err, "Không tải được danh sách tài khoản."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCreate = async (e: React.FormEvent, onSuccess?: () => void) => {
    e.preventDefault();
    if (!newUsername.trim() || newPassword.length < 4) return;
    setCreating(true);
    setError("");
    try {
      await createUser({
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
        token_quota: Math.max(0, parseInt(newQuota, 10) || 0),
        full_name: newFullName.trim() || undefined,
        teacher_code: newTeacherCode.trim() || undefined,
      });
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      setNewQuota("");
      setNewFullName("");
      setNewTeacherCode("");
      await refresh();
      onSuccess?.();
    } catch (err) {
      setError(errText(err, "Tạo tài khoản thất bại."));
    } finally {
      setCreating(false);
    }
  };

  const onToggleActive = async (u: SessionUser) => {
    setError("");
    try {
      await updateUser(u.id, { is_active: !u.is_active });
      await refresh();
    } catch (err) {
      setError(errText(err, "Không cập nhật được trạng thái."));
    }
  };

  // Account actions open a styled dialog (below) instead of the browser's
  // native window.prompt/confirm — those render as the ugly "localhost:3000
  // says…" box that clashes with the rest of the admin UI. These helpers are
  // the pure mutations; they throw on failure so the dialog shows the error.
  const doResetPassword = async (u: SessionUser, pw: string) => {
    await updateUser(u.id, { password: pw });
    await refresh();
  };
  const doSetQuota = async (u: SessionUser, quota: number) => {
    await updateUser(u.id, { token_quota: quota });
    await refresh();
  };
  const doDelete = async (u: SessionUser) => {
    await deleteUser(u.id);
    await refresh();
  };

  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [dialog, setDialog] = useState<
    { kind: "password" | "quota" | "delete"; user: SessionUser } | null
  >(null);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? users.filter((u) =>
        [u.username, u.full_name, u.teacher_code]
          .some((f) => (f || "").toLowerCase().includes(q)),
      )
    : users;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.space[5] }}>
      <h1 style={titleStyle}>Quản lý tài khoản</h1>
      {error && <Banner text={error} />}

      <div style={cardStyle}>
        {/* Toolbar: title + actions, then search */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: T.space[3], flexWrap: "wrap" }}>
          <div style={{ ...sectionTitleStyle, fontSize: T.fontSize.base, color: T.text }}>
            Danh sách tài khoản ({users.length})
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={() => setShowCreate(true)} style={toolbarPrimaryBtn}>
              + Tạo tài khoản
            </button>
            <button type="button" onClick={() => setShowBulk(true)} style={toolbarGhostBtn}>
              ⬆ Nhập Excel
            </button>
          </div>
        </div>
        <FormInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm theo tên, mã GV, tên đăng nhập…"
          style={{ minWidth: 0, width: "100%", maxWidth: 360 }}
        />

        {loading ? (
          <p style={mutedStyle}>Đang tải…</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr style={{ textAlign: "left", color: T.textMute }}>
                  <th style={thStyle}>Tài khoản</th>
                  <th style={thStyle}>Vai trò</th>
                  <th style={thStyle}>Trạng thái</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Hạn mức token</th>
                  <th style={{ ...thStyle, textAlign: "right", width: 64 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: T.textMute }}>
                      {q ? `Không có tài khoản khớp “${query.trim()}”.` : "Chưa có tài khoản nào."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((u, idx) => {
                    const isSelf = me?.id === u.id;
                    return (
                      <TableRow key={u.id} isEven={idx % 2 === 0}>
                        <td style={tdStyle}>
                          <UserIdentity user={u} isSelf={isSelf} />
                        </td>
                        <td style={tdStyle}>{u.role === "admin" ? "Admin" : "Giáo viên"}</td>
                        <td style={tdStyle}>
                          <StatusBadge active={!!u.is_active} />
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", color: T.textMute }}>
                          {fmtQuota(u.token_quota)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <RowActions
                            user={u}
                            isSelf={isSelf}
                            onSetQuota={() => setDialog({ kind: "quota", user: u })}
                            onResetPassword={() => setDialog({ kind: "password", user: u })}
                            onToggleActive={() => onToggleActive(u)}
                            onDelete={() => setDialog({ kind: "delete", user: u })}
                          />
                        </td>
                      </TableRow>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <Modal title="Tạo tài khoản mới" onClose={() => setShowCreate(false)}>
          <form
            onSubmit={(e) => onCreate(e, () => setShowCreate(false))}
            style={{ display: "flex", flexDirection: "column", gap: T.space[4] }}
          >
            <Field label="Tên đăng nhập">
              <FormInput
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="vd: gv_toan_a"
                style={{ width: "100%" }}
              />
            </Field>
            <Field label="Mật khẩu">
              <FormInput
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="≥ 4 ký tự"
                style={{ width: "100%" }}
              />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: T.space[3] }}>
              <Field label="Tên giáo viên (không bắt buộc)">
                <FormInput
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="vd: Nguyễn Văn A"
                  style={{ width: "100%", minWidth: 0 }}
                />
              </Field>
              <Field label="Mã giáo viên (không bắt buộc)">
                <FormInput
                  value={newTeacherCode}
                  onChange={(e) => setNewTeacherCode(e.target.value)}
                  placeholder="vd: GV001"
                  style={{ width: "100%", minWidth: 0 }}
                />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: T.space[3] }}>
              <Field label="Vai trò">
                <FormSelect
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  style={{ width: "100%", minWidth: 0 }}
                >
                  <option value="user">Giáo viên</option>
                  <option value="admin">Admin</option>
                </FormSelect>
              </Field>
              <Field label="Hạn mức token / 30 ngày (0 = ∞)">
                <FormInput
                  type="number"
                  value={newQuota}
                  onChange={(e) => setNewQuota(e.target.value)}
                  placeholder="vd: 1000000"
                  style={{ width: "100%", minWidth: 0 }}
                />
              </Field>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
              <button type="button" onClick={() => setShowCreate(false)} style={toolbarGhostBtn}>
                Hủy
              </button>
              <SubmitButton
                enabled={!!newUsername.trim() && newPassword.length >= 4}
                loading={creating}
                label="Tạo"
                loadingLabel="Đang tạo…"
              />
            </div>
          </form>
        </Modal>
      )}

      {/* Bulk import modal */}
      {showBulk && (
        <Modal title="Nhập hàng loạt từ Excel" width={640} onClose={() => setShowBulk(false)}>
          <BulkImportUsers onDone={refresh} />
        </Modal>
      )}

      {/* Row-action dialogs (replace native window.prompt/confirm) */}
      {dialog?.kind === "password" && (
        <PromptModal
          title={`Đổi mật khẩu — ${dialog.user.username}`}
          label="Mật khẩu mới"
          inputType="password"
          placeholder="≥ 4 ký tự"
          confirmLabel="Đổi mật khẩu"
          validate={(v) => (v.length < 4 ? "Mật khẩu phải có ít nhất 4 ký tự." : null)}
          onSubmit={(v) => doResetPassword(dialog.user, v)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "quota" && (
        <PromptModal
          title={`Hạn mức token — ${dialog.user.username}`}
          label="Hạn mức token / 30 ngày (tự reset mỗi 30 ngày · 0 = không giới hạn)"
          inputType="number"
          initialValue={String(dialog.user.token_quota ?? 0)}
          placeholder="vd: 1000000"
          confirmLabel="Lưu hạn mức"
          validate={(v) => {
            const n = parseInt(v, 10);
            return isNaN(n) || n < 0 ? "Hạn mức phải là số ≥ 0." : null;
          }}
          onSubmit={(v) => doSetQuota(dialog.user, Math.max(0, parseInt(v, 10) || 0))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmModal
          title="Xóa tài khoản"
          message={`Xóa tài khoản "${dialog.user.username}"? Hành động này không hoàn tác được.`}
          confirmLabel="Xóa tài khoản"
          danger
          onConfirm={() => doDelete(dialog.user)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// Centered modal dialog — backdrop click + ESC close; body scrolls if tall.
function Modal({
  title,
  onClose,
  children,
  width = 480,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28, 30, 42, 0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "56px 16px",
        zIndex: 300,
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: width,
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: 14,
          boxShadow: T.shadowStrong,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: `1px solid ${T.borderLight}`,
          }}
        >
          <span style={{ fontSize: T.fontSize.base, fontWeight: 600, color: T.text }}>{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
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
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  );
}

// Styled single-input dialog — the designed replacement for window.prompt.
// `validate` returns an error string (or null when valid); it both gates the
// submit button and is shown inline once the user has typed.
function PromptModal({
  title,
  label,
  inputType = "text",
  initialValue = "",
  placeholder,
  confirmLabel = "Lưu",
  validate,
  onSubmit,
  onClose,
}: {
  title: string;
  label: string;
  inputType?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  validate?: (v: string) => string | null;
  onSubmit: (v: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fieldErr = validate ? validate(value.trim()) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fieldErr) return;
    setBusy(true);
    setServerErr(null);
    try {
      await onSubmit(value.trim());
      onClose();
    } catch (err) {
      setServerErr(errText(err, "Thao tác thất bại."));
      setBusy(false);
    }
  };

  const shown = serverErr || (value.length > 0 ? fieldErr : null);
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: T.space[4] }}>
        <Field label={label}>
          <FormInput
            type={inputType}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            style={{ width: "100%" }}
          />
        </Field>
        {shown && <span style={{ fontSize: T.fontSize.xs, color: T.red }}>{shown}</span>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={toolbarGhostBtn}>
            Hủy
          </button>
          <SubmitButton enabled={!fieldErr} loading={busy} label={confirmLabel} loadingLabel="Đang lưu…" />
        </div>
      </form>
    </Modal>
  );
}

// Styled yes/no dialog — the designed replacement for window.confirm.
function ConfirmModal({
  title,
  message,
  confirmLabel = "Xác nhận",
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setErr(errText(e, "Thao tác thất bại."));
      setBusy(false);
    }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: T.space[4] }}>
        <p style={{ margin: 0, color: T.textSoft, fontSize: T.fontSize.sm, lineHeight: 1.6 }}>{message}</p>
        {err && <span style={{ fontSize: T.fontSize.xs, color: T.red }}>{err}</span>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={toolbarGhostBtn}>
            Hủy
          </button>
          <button type="button" onClick={go} disabled={busy} style={danger ? dangerBtn : toolbarPrimaryBtn}>
            {busy ? "Đang xử lý…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Per-row overflow (⋯) menu. Fixed-positioned to the kebab button so it
// isn't clipped by the table's horizontal scroll container.
function RowActions({
  user,
  isSelf,
  onSetQuota,
  onResetPassword,
  onToggleActive,
  onDelete,
}: {
  user: SessionUser;
  isSelf: boolean;
  onSetQuota: () => void;
  onResetPassword: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // Fixed menu would drift on scroll — close it instead.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen((v) => !v);
  };
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label="Thao tác"
        aria-haspopup="menu"
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          border: `1px solid ${open ? T.accent : T.borderLight}`,
          background: open ? "rgba(59, 79, 138, 0.06)" : "transparent",
          color: T.textSoft,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ display: "block" }}>
          <circle cx="12" cy="5" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="12" cy="19" r="1.7" />
        </svg>
      </button>

      {open && pos && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 300 }} />
          <div
            role="menu"
            style={{
              position: "fixed",
              top: pos.top,
              right: pos.right,
              zIndex: 310,
              width: 200,
              background: T.bgCard,
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              boxShadow: T.shadowStrong,
              overflow: "hidden",
              padding: 6,
              animation: "fadeUp 0.14s ease-out",
            }}
          >
            <RowMenuItem label="Đặt hạn mức token" onClick={run(onSetQuota)} />
            <RowMenuItem label="Đổi mật khẩu" onClick={run(onResetPassword)} />
            <RowMenuItem
              label={user.is_active ? "Khóa tài khoản" : "Mở khóa"}
              disabled={isSelf}
              title={isSelf ? "Không thể tự khóa" : undefined}
              onClick={run(onToggleActive)}
            />
            <RowMenuItem
              label="Xóa tài khoản"
              danger
              disabled={isSelf}
              title={isSelf ? "Không thể tự xóa" : undefined}
              onClick={run(onDelete)}
            />
          </div>
        </>
      )}
    </>
  );
}

function RowMenuItem({
  label,
  onClick,
  danger,
  disabled,
  title,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const color = disabled ? T.textFaint : danger ? T.red : T.textSoft;
  return (
    <button
      type="button"
      role="menuitem"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "8px 10px",
        borderRadius: 7,
        border: "none",
        background: hovered ? (danger ? "rgba(184, 66, 58, 0.08)" : "rgba(59, 79, 138, 0.06)") : "transparent",
        color,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: T.fontSize.sm,
        fontFamily: T.font,
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Backup section — download a full snapshot / restore (overwrite) from file
// ---------------------------------------------------------------------------

function BackupSection() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [pendingRestore, setPendingRestore] = useState<unknown | null>(null);

  const onDownload = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await getBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const d = new Date();
      const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      a.href = url;
      a.download = `mirror-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errText(err, "Không tải được bản sao lưu."));
    } finally {
      setBusy(false);
    }
  };

  const onRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setError("");
    setResult(null);
    try {
      setPendingRestore(JSON.parse(await file.text()));
    } catch {
      setError("File không hợp lệ — không phải file sao lưu (.json).");
    }
  };

  // The actual destructive restore — runs once the user confirms in the
  // styled dialog. Throws on failure so the dialog surfaces the error.
  const doRestore = async () => {
    setResult(await restoreBackup(pendingRestore));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.space[5] }}>
      <h1 style={titleStyle}>Sao lưu & Khôi phục</h1>
      {error && <Banner text={error} />}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: T.space[4],
          alignItems: "start",
        }}
      >
      <div style={cardStyle}>
        <div style={{ ...sectionTitleStyle, fontSize: T.fontSize.base, color: T.text }}>
          Tải bản sao lưu
        </div>
        <p style={{ ...mutedStyle, lineHeight: 1.6, margin: 0 }}>
          Tải toàn bộ dữ liệu (tài khoản, lessons AI đã học, điểm đã chấm) về một file{" "}
          <code>.json</code>. Giữ file ở nơi độc lập (máy bạn / Google Drive) — kể cả server
          bị xóa hay hết hạn thuê, bạn vẫn khôi phục lại được.
        </p>
        <div>
          <button type="button" onClick={onDownload} disabled={busy} style={toolbarPrimaryBtn}>
            {busy ? "Đang xử lý…" : "⬇ Tải bản sao lưu"}
          </button>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ ...sectionTitleStyle, fontSize: T.fontSize.base, color: T.text }}>
          Khôi phục từ file
        </div>
        <div
          style={{
            fontSize: T.fontSize.sm,
            color: T.red,
            background: T.redSoft,
            border: `1px solid ${T.red}`,
            borderRadius: 8,
            padding: "8px 12px",
          }}
        >
          ⚠ Khôi phục sẽ <b>ghi đè toàn bộ</b> dữ liệu hiện tại. Bạn có thể phải đăng nhập lại
          sau khi khôi phục.
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={onRestoreFile}
          style={{ display: "none" }}
        />
        <div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            style={toolbarGhostBtn}
          >
            {busy ? "Đang khôi phục…" : "Chọn file backup…"}
          </button>
        </div>
        {result && (
          <div style={{ fontSize: T.fontSize.sm, color: T.green }}>
            ✅ Đã khôi phục: {result.users} tài khoản · {result.lessons} lessons ·{" "}
            {result.pipeline_runs} lượt chấm · {result.approved_grades} điểm.
          </div>
        )}
      </div>
      </div>

      {pendingRestore !== null && (
        <ConfirmModal
          title="Khôi phục dữ liệu"
          message="Khôi phục sẽ GHI ĐÈ toàn bộ dữ liệu hiện tại (tài khoản, lessons, điểm đã chấm). Không hoàn tác được, và bạn có thể phải đăng nhập lại. Tiếp tục?"
          confirmLabel="Ghi đè & khôi phục"
          danger
          onConfirm={doRestore}
          onClose={() => setPendingRestore(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function Banner({ text }: { text: string }) {
  return (
    <div
      style={{
        fontSize: T.fontSize.sm,
        color: T.red,
        background: T.redSoft,
        border: `1px solid ${T.red}`,
        borderRadius: 8,
        padding: "8px 12px",
      }}
    >
      {text}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: T.fontSize.xs, color: T.textMute }}>{label}</span>
      {children}
    </label>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: T.display,
  fontSize: T.fontSize["2xl"],
  fontWeight: 700,
  color: T.text,
  margin: 0,
};

const cardStyle: React.CSSProperties = {
  background: T.bgCard,
  border: `1px solid ${T.border}`,
  borderRadius: 12,
  padding: T.space[5],
  display: "flex",
  flexDirection: "column",
  gap: T.space[3],
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: T.fontSize.sm,
  fontWeight: 600,
  color: T.textSoft,
};

const mutedStyle: React.CSSProperties = { color: T.textMute, fontSize: T.fontSize.sm };

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: T.fontSize.sm,
};

const thStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontWeight: 600,
  fontSize: T.fontSize.xxs,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: T.textMute,
  borderBottom: `2px solid ${T.borderLight}`,
};
const tdStyle: React.CSSProperties = {
  padding: "16px",
  color: T.text,
  fontSize: T.fontSize.sm,
};

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: T.fontSize.sm,
  color: T.text,
  background: T.bgInput,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  outline: "none",
  minWidth: 160,
};

const toolbarPrimaryBtn: React.CSSProperties = {
  padding: "9px 16px",
  fontSize: T.fontSize.sm,
  fontWeight: 600,
  color: "#fff",
  background: T.accent,
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontFamily: T.font,
};

const toolbarGhostBtn: React.CSSProperties = {
  padding: "9px 14px",
  fontSize: T.fontSize.sm,
  fontWeight: 600,
  color: T.accent,
  background: "rgba(59, 79, 138, 0.05)",
  border: `1px solid rgba(59, 79, 138, 0.15)`,
  borderRadius: 8,
  cursor: "pointer",
  fontFamily: T.font,
};

const dangerBtn: React.CSSProperties = {
  padding: "9px 16px",
  fontSize: T.fontSize.sm,
  fontWeight: 600,
  color: "#fff",
  background: T.red,
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontFamily: T.font,
};

