import { useState } from "react";
import { T } from "../../theme/tokens";
import { Icon } from "../../components/ui/Icon";
import type { SessionUser } from "../../api/session";
import { inputStyle, SELECT_CHEVRON } from "./adminStyles";

// ---------------------------------------------------------------------------
// Shared presentational primitives for the admin dashboard.
// ---------------------------------------------------------------------------

export function StatCard({
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
export function UserIdentity({ user, isSelf }: { user: SessionUser; isSelf?: boolean }) {
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

export function StatusBadge({ active }: { active: boolean }) {
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

export function TableRow({ children, isEven }: { children: React.ReactNode; isEven?: boolean }) {
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

export function FormInput({
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

export function FormSelect({
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

export function SubmitButton({
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

export function SideLink({
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

// Minimal prev/next pager. ChevronLeft isn't in the Icon pack, so the
// "Trước" arrow is a 180°-rotated ChevronRight.
export function Pager({
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

export function Banner({ text }: { text: string }) {
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

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: T.fontSize.xs, color: T.textMute }}>{label}</span>
      {children}
    </label>
  );
}
