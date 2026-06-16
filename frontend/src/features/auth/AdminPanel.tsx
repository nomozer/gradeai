/**
 * AdminPanel — user management page (opened at #admin in its own window,
 * same pattern as the Memory page).
 *
 * Admin-only: lists accounts and lets the admin create users, reset
 * passwords, disable/enable, and delete. The backend enforces the admin role
 * on every endpoint regardless of what this UI shows, and blocks removing the
 * last admin / self-delete — this surface just renders those errors.
 */

import { useCallback, useEffect, useState } from "react";
import { T } from "../../theme/tokens";
import { GlobalStyles } from "../../theme/GlobalStyles";
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
} from "../../api/authApi";
import { getUser, type SessionUser } from "../../api/session";
import { ApiError } from "../../api/client";

function errText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.detail || fallback : fallback;
}

export function AdminPanel() {
  const me = getUser();
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Create-user form
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
      await createUser({
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
      });
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
    if (!window.confirm(`Xóa tài khoản "${u.username}"? Hành động này không hoàn tác được.`))
      return;
    setError("");
    try {
      await deleteUser(u.id);
      await refresh();
    } catch (err) {
      setError(errText(err, "Không xóa được tài khoản."));
    }
  };

  if (me?.role !== "admin") {
    return (
      <div style={pageStyle}>
        <GlobalStyles />
        <div style={cardStyle}>
          <h1 style={titleStyle}>Quản lý tài khoản</h1>
          <p style={{ color: T.red, fontSize: T.fontSize.sm }}>
            Bạn không có quyền truy cập trang này.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <GlobalStyles />
      <div style={{ width: "100%", maxWidth: 880, display: "flex", flexDirection: "column", gap: T.space[5] }}>
        <h1 style={titleStyle}>Quản lý tài khoản</h1>

        {error && (
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
            {error}
          </div>
        )}

        {/* Create user */}
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
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                style={{ ...inputStyle, width: 140 }}
              >
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

        {/* User list */}
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Danh sách tài khoản ({users.length})</div>
          {loading ? (
            <p style={{ color: T.textMute, fontSize: T.fontSize.sm }}>Đang tải…</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.fontSize.sm }}>
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
                          {isSelf && (
                            <span style={{ color: T.textFaint, marginLeft: 6 }}>(bạn)</span>
                          )}
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

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: T.bg,
  fontFamily: T.font,
  display: "flex",
  justifyContent: "center",
  padding: "clamp(16px, 4vw, 40px)",
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

const titleStyle: React.CSSProperties = {
  fontFamily: T.display,
  fontSize: T.fontSize["2xl"],
  fontWeight: 700,
  color: T.text,
  margin: 0,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: T.fontSize.sm,
  fontWeight: 600,
  color: T.textSoft,
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

const thStyle: React.CSSProperties = { padding: "6px 8px", fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: "8px", color: T.text };

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
