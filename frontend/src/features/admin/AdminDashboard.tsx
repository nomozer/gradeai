/**
 * AdminDashboard — the admin's home after login.
 *
 * Admins land HERE (not the grading workspace): a left sidebar + a main area
 * that switches between two sections — "Tổng quan" (system-wide stats) and
 * "Quản lý tài khoản" (user CRUD). Admin is management-only; there is no
 * grading surface here by design. Teachers never see this page.
 */

import { useCallback, useEffect, useState } from "react";
import { T } from "../../theme/tokens";
import { GlobalStyles } from "../../theme/GlobalStyles";
import {
  getOverview,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  logout as logoutApi,
  type Overview,
} from "../../api/authApi";
import { getUser, clearSession, type SessionUser } from "../../api/session";
import { ApiError } from "../../api/client";
import { Icon } from "../../components/ui/Icon";

type Section = "overview" | "accounts";

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

function ActionButton({
  label,
  iconType,
  onClick,
  disabled,
  title,
  variant = "accent",
}: {
  label: string;
  iconType: "password" | "lock" | "unlock" | "delete" | "quota";
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  variant?: "accent" | "amber" | "red";
}) {
  const [hovered, setHovered] = useState(false);

  const colors = {
    accent: { text: T.accent, bg: "rgba(59, 79, 138, 0.05)", border: "rgba(59, 79, 138, 0.15)", hoverBg: "rgba(59, 79, 138, 0.10)" },
    amber: { text: T.amber, bg: "rgba(192, 139, 48, 0.05)", border: "rgba(192, 139, 48, 0.15)", hoverBg: "rgba(192, 139, 48, 0.10)" },
    red: { text: T.red, bg: "rgba(184, 66, 58, 0.05)", border: "rgba(184, 66, 58, 0.15)", hoverBg: "rgba(184, 66, 58, 0.10)" },
  };

  const current = colors[variant];

  const renderIcon = () => {
    switch (iconType) {
      case "password":
        return (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0, width: 12, height: 12 }}>
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
          </svg>
        );
      case "lock":
        return (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0, width: 12, height: 12 }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        );
      case "unlock":
        return (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0, width: 12, height: 12 }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 9.9-1" />
          </svg>
        );
      case "delete":
        return (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0, width: 12, height: 12 }}>
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        );
      case "quota":
        return (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0, width: 12, height: 12 }}>
            <path d="M3 13a9 9 0 0 1 18 0" />
            <line x1="12" y1="13" x2="16" y2="9" />
            <line x1="3" y1="13" x2="3" y2="13" />
            <line x1="21" y1="13" x2="21" y2="13" />
          </svg>
        );
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 8,
        border: `1px solid ${disabled ? T.borderLight : current.border}`,
        background: disabled ? "transparent" : hovered ? current.hoverBg : current.bg,
        color: disabled ? T.textFaint : current.text,
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.15s ease",
        fontFamily: T.font,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {renderIcon()}
      <span>{label}</span>
    </button>
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

  const handleLogout = useCallback(async () => {
    try {
      await logoutApi();
    } catch {
      /* best-effort */
    }
    clearSession();
    window.location.reload();
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg, fontFamily: T.font }}>
      <GlobalStyles />

      {/* Sidebar */}
      <aside
        style={{
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
        }}
      >
        <div
          style={{
            fontFamily: T.display,
            fontSize: T.fontSize.xl,
            fontWeight: 700,
            color: T.accentDark,
            letterSpacing: 1,
            padding: "4px 8px",
            marginBottom: T.space[5],
          }}
        >
          MIRROR
          <span style={{ display: "block", fontSize: T.fontSize.xs, color: T.textMute, fontWeight: 500, marginTop: 2 }}>
            Quản trị
          </span>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <SideLink
            label="Tổng quan hệ thống"
            active={section === "overview"}
            icon="Layout"
            onClick={() => setSection("overview")}
          />
          <SideLink
            label="Quản lý tài khoản"
            active={section === "accounts"}
            icon="User"
            onClick={() => setSection("accounts")}
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
        {section === "overview" ? <OverviewSection /> : <AccountsSection me={me} />}
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

          <div style={{ ...cardStyle, width: "100%" }}>
            <div style={{ ...sectionTitleStyle, fontSize: T.fontSize.base, color: T.text, marginBottom: 4 }}>Hoạt động theo giáo viên</div>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr style={{ textAlign: "left", color: T.textMute }}>
                    <th style={thStyle}>Tài khoản</th>
                    <th style={thStyle}>Vai trò</th>
                    <th style={thStyle}>Trạng thái</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Bài đã chấm</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Lessons</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Token đã dùng</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Hạn mức token</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u, idx) => {
                    const over = !!u.token_quota && u.token_quota > 0 && u.tokens_used >= u.token_quota;
                    return (
                    <TableRow key={u.id} isEven={idx % 2 === 0}>
                      <td style={tdStyle}>{u.username}</td>
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
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
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

  const onCreate = async (e: React.FormEvent) => {
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
      });
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      setNewQuota("");
      await refresh();
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

  const onResetPassword = async (u: SessionUser) => {
    const pw = window.prompt(`Mật khẩu mới cho "${u.username}" (tối thiểu 4 ký tự):`);
    if (pw === null) return;
    if (pw.length < 4) {
      setError("Mật khẩu phải có ít nhất 4 ký tự.");
      return;
    }
    setError("");
    try {
      await updateUser(u.id, { password: pw });
      await refresh();
    } catch (err) {
      setError(errText(err, "Không đặt lại được mật khẩu."));
    }
  };

  const onSetQuota = async (u: SessionUser) => {
    const raw = window.prompt(
      `Hạn mức token cho "${u.username}" (số token tối đa; 0 = không giới hạn):`,
      String(u.token_quota ?? 0),
    );
    if (raw === null) return;
    const quota = parseInt(raw, 10);
    if (isNaN(quota) || quota < 0) {
      setError("Hạn mức phải là số ≥ 0.");
      return;
    }
    setError("");
    try {
      await updateUser(u.id, { token_quota: quota });
      await refresh();
    } catch (err) {
      setError(errText(err, "Không đặt được hạn mức."));
    }
  };

  const onDelete = async (u: SessionUser) => {
    if (!window.confirm(`Xóa tài khoản "${u.username}"? Hành động này không hoàn tác được.`)) return;
    setError("");
    try {
      await deleteUser(u.id);
      await refresh();
    } catch (err) {
      setError(errText(err, "Không xóa được tài khoản."));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.space[5] }}>
      <h1 style={titleStyle}>Quản lý tài khoản</h1>
      {error && <Banner text={error} />}

      <form onSubmit={onCreate} style={cardStyle}>
        <div style={{ ...sectionTitleStyle, fontSize: T.fontSize.base, color: T.text, marginBottom: 4 }}>Tạo tài khoản mới</div>
        <div style={{ display: "flex", gap: T.space[3], flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="Tên đăng nhập">
            <FormInput
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="vd: gv_toan_a"
            />
          </Field>
          <Field label="Mật khẩu">
            <FormInput
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="≥ 4 ký tự"
            />
          </Field>
          <Field label="Vai trò">
            <FormSelect value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              <option value="user">Giáo viên</option>
              <option value="admin">Admin</option>
            </FormSelect>
          </Field>
          <Field label="Hạn mức token (0 = ∞)">
            <FormInput
              type="number"
              value={newQuota}
              onChange={(e) => setNewQuota(e.target.value)}
              placeholder="vd: 1000000"
              style={{ minWidth: 140 }}
            />
          </Field>
          <SubmitButton
            enabled={!!newUsername.trim() && newPassword.length >= 4}
            loading={creating}
            label="Tạo"
            loadingLabel="Đang tạo…"
          />
        </div>
      </form>

      <div style={cardStyle}>
        <div style={{ ...sectionTitleStyle, fontSize: T.fontSize.base, color: T.text, marginBottom: 4 }}>Danh sách tài khoản ({users.length})</div>
        {loading ? (
          <p style={mutedStyle}>Đang tải…</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr style={{ textAlign: "left", color: T.textMute }}>
                  <th style={thStyle}>Tên đăng nhập</th>
                  <th style={thStyle}>Vai trò</th>
                  <th style={thStyle}>Trạng thái</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Hạn mức token</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => {
                  const isSelf = me?.id === u.id;
                  return (
                    <TableRow key={u.id} isEven={idx % 2 === 0}>
                      <td style={{ ...tdStyle, fontWeight: 600, color: T.text }}>
                        {u.username}
                        {isSelf && (
                          <span
                            style={{
                              marginLeft: 8,
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
                      </td>
                      <td style={tdStyle}>{u.role === "admin" ? "Admin" : "Giáo viên"}</td>
                      <td style={tdStyle}>
                        <StatusBadge active={!!u.is_active} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", color: T.textMute }}>
                        {fmtQuota(u.token_quota)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", gap: 8 }}>
                          <ActionButton
                            label="Hạn mức"
                            iconType="quota"
                            onClick={() => onSetQuota(u)}
                            variant="accent"
                          />
                          <ActionButton
                            label="Đổi mật khẩu"
                            iconType="password"
                            onClick={() => onResetPassword(u)}
                            variant="accent"
                          />
                          <ActionButton
                            label={u.is_active ? "Khóa" : "Mở khóa"}
                            iconType={u.is_active ? "lock" : "unlock"}
                            onClick={() => onToggleActive(u)}
                            disabled={isSelf}
                            title={isSelf ? "Không thể tự khóa" : undefined}
                            variant="amber"
                          />
                          <ActionButton
                            label="Xóa"
                            iconType="delete"
                            onClick={() => onDelete(u)}
                            disabled={isSelf}
                            title={isSelf ? "Không thể tự xóa" : undefined}
                            variant="red"
                          />
                        </div>
                      </td>
                    </TableRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
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

