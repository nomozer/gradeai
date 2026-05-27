import React from "react";
import { T } from "../../theme/tokens";

/* ── Shared button style helpers ──────────────────────────────────────── */

const base: React.CSSProperties = {
  fontFamily: `"Inter", "Outfit", system-ui, -apple-system, sans-serif`,
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  cursor: "pointer",
  transition: "all 0.2s ease",
  whiteSpace: "nowrap",
  border: "none",
  outline: "none",
  position: "relative",
  overflow: "hidden",
};

/* Primary — indigo gradient with glow shadow */
const primaryStyle = (disabled: boolean): React.CSSProperties => ({
  ...base,
  padding: "12px 26px",
  color: "#fff",
  background: disabled
    ? T.bgElevated
    : `linear-gradient(135deg, ${T.accent} 0%, ${T.accentDark} 100%)`,
  boxShadow: disabled
    ? "none"
    : `0 2px 8px rgba(59,79,138,0.25), 0 1px 3px rgba(59,79,138,0.15)`,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
  letterSpacing: "0.01em",
});

/* Secondary — outline accent with subtle fill on hover */
const secondaryStyle = (disabled: boolean): React.CSSProperties => ({
  ...base,
  padding: "10px 20px",
  color: disabled ? T.textFaint : T.accent,
  background: T.bgCard,
  border: `1.5px solid ${disabled ? T.borderLight : T.accent}40`,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
});

/* Ghost / back — minimal, text-only until hovered */
const ghostStyle = (disabled: boolean): React.CSSProperties => ({
  ...base,
  padding: "10px 18px",
  fontWeight: 500,
  color: disabled ? T.textFaint : T.textSoft,
  background: "transparent",
  border: `1px solid transparent`,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.5 : 1,
});

/* ── Hover / Active handlers ──────────────────────────────────────────── */

function primaryHover(e: React.MouseEvent<HTMLButtonElement>) {
  if ((e.currentTarget as HTMLButtonElement).disabled) return;
  e.currentTarget.style.opacity = "0.9";
}
function primaryLeave(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.opacity = "1";
}
function secondaryHover(e: React.MouseEvent<HTMLButtonElement>) {
  if ((e.currentTarget as HTMLButtonElement).disabled) return;
  e.currentTarget.style.background = `${T.accent}08`;
  e.currentTarget.style.borderColor = `${T.accent}80`;
  e.currentTarget.style.color = T.accentDark;
}
function secondaryLeave(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = T.bgCard;
  e.currentTarget.style.borderColor = `${T.accent}40`;
  e.currentTarget.style.color = T.accent;
}

function ghostHover(e: React.MouseEvent<HTMLButtonElement>) {
  if ((e.currentTarget as HTMLButtonElement).disabled) return;
  e.currentTarget.style.color = T.text;
  e.currentTarget.style.borderColor = T.border;
  e.currentTarget.style.background = T.bgHover;
}
function ghostLeave(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.color = T.textSoft;
  e.currentTarget.style.borderColor = "transparent";
  e.currentTarget.style.background = "transparent";
}

/* ── Individual button components ─────────────────────────────────────── */

interface BtnProps {
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}

export function PrimaryButton({ onClick, disabled, title, children }: BtnProps) {
  const off = !onClick || !!disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={off}
      style={primaryStyle(off)}
      onMouseEnter={primaryHover}
      onMouseLeave={primaryLeave}
      onMouseUp={primaryHover}
      title={title}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ onClick, disabled, title, children }: BtnProps) {
  const off = !onClick || !!disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={off}
      style={secondaryStyle(off)}
      onMouseEnter={secondaryHover}
      onMouseLeave={secondaryLeave}
      title={title}
    >
      {children}
    </button>
  );
}

export function GhostButton({ onClick, disabled, title, children }: BtnProps) {
  const off = !onClick || !!disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={off}
      style={ghostStyle(off)}
      onMouseEnter={ghostHover}
      onMouseLeave={ghostLeave}
      title={title}
    >
      {children}
    </button>
  );
}

/* ── ActionBar layout ─────────────────────────────────────────────────── */

interface ActionBarProps {
  children: React.ReactNode;
  /** Optional center text / status info */
  status?: React.ReactNode;
}

/**
 * ActionBar — bottom navigation bar shared across step 3, 4, 5.
 *
 * Layout: [left slot] — [center status] — [right slot]
 * Uses a glassmorphism-inspired frosted look with top border.
 */
export function ActionBar({ children, status }: ActionBarProps) {
  const childArray = React.Children.toArray(children);
  const left = childArray[0] ?? null;
  const right = childArray.slice(1);

  return (
    <div
      className="action-bar"
      style={{
        marginTop: 20,
        padding: "16px 4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        borderTop: `1px solid ${T.borderLight}`,
      }}
    >
      {left}
      {status && (
        <div
          className="action-bar-status"
          style={{
            fontSize: 13,
            color: T.textMute,
            textAlign: "center",
            flex: "1 1 200px",
            minWidth: 0,
            lineHeight: 1.5,
          }}
        >
          {status}
        </div>
      )}
      <div className="action-bar-actions" style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
        {right}
      </div>
    </div>
  );
}
