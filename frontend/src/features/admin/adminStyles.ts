import { T } from "../../theme/tokens";

// Shared style objects + the custom select chevron for the admin dashboard.
// Pure data (no JSX) so every admin module can import without dragging in a
// component dependency.

// Down-chevron as an inline SVG data URI (stroke = T.textMute #7A7C8A).
export const SELECT_CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%237A7C8A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")";

export const titleStyle: React.CSSProperties = {
  fontFamily: T.display,
  fontSize: T.fontSize["2xl"],
  fontWeight: 700,
  color: T.text,
  margin: 0,
};

export const cardStyle: React.CSSProperties = {
  background: T.bgCard,
  border: `1px solid ${T.border}`,
  borderRadius: 12,
  padding: T.space[5],
  display: "flex",
  flexDirection: "column",
  gap: T.space[3],
};

export const sectionTitleStyle: React.CSSProperties = {
  fontSize: T.fontSize.sm,
  fontWeight: 600,
  color: T.textSoft,
};

export const mutedStyle: React.CSSProperties = { color: T.textMute, fontSize: T.fontSize.sm };

export const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: T.fontSize.sm,
};

export const thStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontWeight: 600,
  fontSize: T.fontSize.xxs,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: T.textMute,
  borderBottom: `2px solid ${T.borderLight}`,
};
export const tdStyle: React.CSSProperties = {
  padding: "16px",
  color: T.text,
  fontSize: T.fontSize.sm,
};

export const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: T.fontSize.sm,
  color: T.text,
  background: T.bgInput,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  outline: "none",
  minWidth: 160,
};

export const toolbarPrimaryBtn: React.CSSProperties = {
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

export const toolbarGhostBtn: React.CSSProperties = {
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

export const dangerBtn: React.CSSProperties = {
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
