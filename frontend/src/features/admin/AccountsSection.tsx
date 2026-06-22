import { useCallback, useEffect, useRef, useState } from "react";
import { T } from "../../theme/tokens";
import { InlineLoader } from "../../components/ui/InlineLoader";
import { createUser, deleteUser, listUsers, updateUser } from "../../api/authApi";
import type { SessionUser } from "../../api/session";
import { normalizeUsername, validateUsername } from "../../lib/username";
import { BulkImportUsers } from "./BulkImportUsers";
import { errText, fmtQuota } from "./adminFormat";
import {
  cardStyle,
  sectionTitleStyle,
  tableStyle,
  tdStyle,
  thStyle,
  titleStyle,
  toolbarGhostBtn,
  toolbarPrimaryBtn,
} from "./adminStyles";
import {
  Banner,
  Field,
  FormInput,
  FormSelect,
  StatusBadge,
  SubmitButton,
  TableRow,
  UserIdentity,
} from "./adminPrimitives";
import { ConfirmModal, Modal, PromptModal } from "./adminModals";

export function AccountsSection({ me }: { me: SessionUser | null }) {
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
  const [createError, setCreateError] = useState("");

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
    const username = normalizeUsername(newUsername);
    const usernameError = validateUsername(username);
    if (usernameError) {
      setCreateError(usernameError);
      return;
    }
    if (newPassword.length < 6) {
      setCreateError("Mật khẩu phải có ít nhất 6 ký tự.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      await createUser({
        username,
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
      setCreateError("");
      await refresh();
      onSuccess?.();
    } catch (err) {
      setCreateError(errText(err, "Tạo tài khoản thất bại."));
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
  const newUsernameError = newUsername.trim() ? validateUsername(newUsername) : null;
  const newPasswordError = newPassword && newPassword.length < 6
    ? "Mật khẩu phải có ít nhất 6 ký tự."
    : null;
  const canCreate = !newUsernameError && !newPasswordError && !!newUsername.trim() && newPassword.length >= 6;

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
            <button
              type="button"
              onClick={() => {
                setCreateError("");
                setShowCreate(true);
              }}
              style={toolbarPrimaryBtn}
            >
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
          <InlineLoader />
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
        <Modal
          title="Tạo tài khoản mới"
          onClose={() => {
            setCreateError("");
            setShowCreate(false);
          }}
        >
          <form
            onSubmit={(e) => onCreate(e, () => setShowCreate(false))}
            style={{ display: "flex", flexDirection: "column", gap: T.space[4] }}
          >
            <Field label="Tên đăng nhập">
              <FormInput
                value={newUsername}
                onChange={(e) => {
                  setNewUsername(e.target.value);
                  if (createError) setCreateError("");
                }}
                placeholder="vd: gvtoana"
                style={{ width: "100%" }}
              />
              {newUsernameError && (
                <span style={{ fontSize: T.fontSize.xs, color: T.red }}>
                  {newUsernameError}
                </span>
              )}
            </Field>
            <Field label="Mật khẩu">
              <FormInput
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (createError) setCreateError("");
                }}
                placeholder="≥ 6 ký tự"
                style={{ width: "100%" }}
              />
              {newPasswordError && (
                <span style={{ fontSize: T.fontSize.xs, color: T.red }}>
                  {newPasswordError}
                </span>
              )}
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
            {createError && !newUsernameError && !newPasswordError && (
              <div style={{ fontSize: T.fontSize.sm, color: T.red }}>
                {createError}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
              <button
                type="button"
                onClick={() => {
                  setCreateError("");
                  setShowCreate(false);
                }}
                style={toolbarGhostBtn}
              >
                Hủy
              </button>
              <SubmitButton
                enabled={canCreate}
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
          placeholder="≥ 6 ký tự"
          confirmLabel="Đổi mật khẩu"
          validate={(v) => (v.length < 6 ? "Mật khẩu phải có ít nhất 6 ký tự." : null)}
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
