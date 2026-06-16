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

type Section = "overview" | "accounts";

function errText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.detail || fallback : fallback;
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
          <span style={{ fontSize: T.fontSize.xs, color: T.textMute, fontWeight: 500, marginLeft: 6 }}>
            Quản trị
          </span>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <SideLink
            label="Tổng quan hệ thống"
            active={section === "overview"}
            onClick={() => setSection("overview")}
          />
          <SideLink
            label="Quản lý tài khoản"
            active={section === "accounts"}
            onClick={() => setSection("accounts")}
          />
        </nav>

        <div style={{ marginTop: "auto", paddingTop: T.space[4], borderTop: `1px solid ${T.borderLight}` }}>
          <div style={{ fontSize: T.fontSize.xs, color: T.textMute, padding: "0 8px 8px" }}>
            Đăng nhập: <strong style={{ color: T.text }}>{me?.username}</strong>
          </div>
          <button onClick={handleLogout} style={logoutBtnStyle}>
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
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: "10px 12px",
        borderRadius: 8,
        border: "none",
        cursor: "pointer",
        fontSize: T.fontSize.sm,
        fontWeight: active ? 600 : 500,
        fontFamily: T.font,
        color: active ? T.accentDark : T.textSoft,
        background: active ? "rgba(59, 79, 138, 0.10)" : "transparent",
      }}
    >
      {label}
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
    <div style={{ display: "flex", flexDirection: "column", gap: T.space[5], maxWidth: 980 }}>
      <h1 style={titleStyle}>Tổng quan hệ thống</h1>
      {error && <Banner text={error} />}
      {loading ? (
        <p style={mutedStyle}>Đang tải…</p>
      ) : data ? (
        <>
          <div style={{ display: "flex", gap: T.space[4], flexWrap: "wrap" }}>
            <StatCard label="Tài khoản" value={data.total_accounts} />
            <StatCard label="Giáo viên" value={data.total_teachers} />
            <StatCard label="Tổng bài đã chấm" value={data.total_graded} />
            <StatCard label="Tổng lessons đã học" value={data.total_lessons} />
          </div>

          <div style={cardStyle}>
            <div style={sectionTitleStyle}>Hoạt động theo giáo viên</div>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr style={{ textAlign: "left", color: T.textMute }}>
                    <th style={thStyle}>Tài khoản</th>
                    <th style={thStyle}>Vai trò</th>
                    <th style={thStyle}>Trạng thái</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Bài đã chấm</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Lessons</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id} style={{ borderTop: `1px solid ${T.borderLight}` }}>
                      <td style={tdStyle}>{u.username}</td>
                      <td style={tdStyle}>{u.role === "admin" ? "Admin" : "Giáo viên"}</td>
                      <td style={tdStyle}>
                        <span style={{ color: u.is_active ? T.green : T.red }}>
                          {u.is_active ? "Hoạt động" : "Đã khóa"}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{u.graded}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{u.lessons}</td>
                    </tr>
                  ))}
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
      await createUser({ username: newUsername.trim(), password: newPassword, role: newRole });
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
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
    <div style={{ display: "flex", flexDirection: "column", gap: T.space[5], maxWidth: 980 }}>
      <h1 style={titleStyle}>Quản lý tài khoản</h1>
      {error && <Banner text={error} />}

      <form onSubmit={onCreate} style={cardStyle}>
        <div style={sectionTitleStyle}>Tạo tài khoản mới</div>
        <div style={{ display: "flex", gap: T.space[3], flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="Tên đăng nhập">
            <input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="vd: gv_toan_a"
              style={inputStyle}
            />
          </Field>
          <Field label="Mật khẩu">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="≥ 4 ký tự"
              style={inputStyle}
            />
          </Field>
          <Field label="Vai trò">
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)} style={{ ...inputStyle, minWidth: 140 }}>
              <option value="user">Giáo viên</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <button
            type="submit"
            disabled={creating || !newUsername.trim() || newPassword.length < 4}
            style={primaryBtnStyle(!creating && !!newUsername.trim() && newPassword.length >= 4)}
          >
            {creating ? "Đang tạo…" : "Tạo"}
          </button>
        </div>
      </form>

      <div style={cardStyle}>
        <div style={sectionTitleStyle}>Danh sách tài khoản ({users.length})</div>
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
                  <th style={{ ...thStyle, textAlign: "right" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = me?.id === u.id;
                  return (
                    <tr key={u.id} style={{ borderTop: `1px solid ${T.borderLight}` }}>
                      <td style={tdStyle}>
                        {u.username}
                        {isSelf && <span style={{ color: T.textFaint, marginLeft: 6 }}>(bạn)</span>}
                      </td>
                      <td style={tdStyle}>{u.role === "admin" ? "Admin" : "Giáo viên"}</td>
                      <td style={tdStyle}>
                        <span style={{ color: u.is_active ? T.green : T.red }}>
                          {u.is_active ? "Hoạt động" : "Đã khóa"}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                        <button style={linkBtnStyle} onClick={() => onResetPassword(u)}>
                          Đổi mật khẩu
                        </button>
                        <button
                          style={linkBtnStyle}
                          onClick={() => onToggleActive(u)}
                          disabled={isSelf}
                          title={isSelf ? "Không thể tự khóa" : undefined}
                        >
                          {u.is_active ? "Khóa" : "Mở khóa"}
                        </button>
                        <button
                          style={{ ...linkBtnStyle, color: T.red }}
                          onClick={() => onDelete(u)}
                          disabled={isSelf}
                          title={isSelf ? "Không thể tự xóa" : undefined}
                        >
                          Xóa
                        </button>
                      </td>
                    </tr>
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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        flex: "1 1 160px",
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        padding: T.space[4],
      }}
    >
      <div style={{ fontSize: T.fontSize.xs, color: T.textMute }}>{label}</div>
      <div style={{ fontSize: T.fontSize["3xl"], fontWeight: 700, color: T.accentDark, fontFamily: T.display }}>
        {value}
      </div>
    </div>
  );
}

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

const thStyle: React.CSSProperties = { padding: "6px 8px", fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: "8px", color: T.text };

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

function primaryBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    padding: "9px 16px",
    fontSize: T.fontSize.sm,
    fontWeight: 600,
    color: "#fff",
    background: enabled ? T.accent : T.textFaint,
    border: "none",
    borderRadius: 8,
    cursor: enabled ? "pointer" : "default",
    height: 36,
  };
}

const linkBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: T.accent,
  cursor: "pointer",
  fontSize: T.fontSize.sm,
  padding: "4px 8px",
  fontFamily: T.font,
};

const logoutBtnStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  fontSize: T.fontSize.sm,
  fontWeight: 600,
  color: T.text,
  background: T.bgElevated,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  cursor: "pointer",
  fontFamily: T.font,
};
