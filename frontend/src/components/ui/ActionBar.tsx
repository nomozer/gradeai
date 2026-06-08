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
  justifyContent: "center",
  height: 40,
  boxSizing: "border-box",
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
  padding: "0 22px",
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
  padding: "0 18px",
  color: disabled ? T.textFaint : T.accent,
  background: T.bgCard,
  border: `1.5px solid ${disabled ? T.borderLight : T.accent}40`,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
});

/* Ghost / back — minimal, text-only until hovered */
const ghostStyle = (disabled: boolean): React.CSSProperties => ({
  ...base,
  padding: "0 14px",
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
  /** Optional left-side score panel (e.g. ScoreInline from step 3/4/5).
   *  When provided, it sits to the LEFT of the prev/back button so the
   *  teacher always sees the running total in the same place. Replaces
   *  the previous standalone sticky ScoreBottomBar — one footer instead
   *  of two stacked strips. */
  scoreSlot?: React.ReactNode;
}

/**
 * ActionBar — sticky bottom navigation shared across step 3, 4, 5.
 *
 * Layout: [score slot] · [left button] — [center status] — [right buttons]
 *
 * Position is ``sticky; bottom: 0`` so the bar stays glued to the
 * viewport edge as the teacher scrolls through long essays. Opaque
 * background + top shadow give the lift effect over scrolled content
 * (the previous ``position: relative`` version only showed at the end of
 * page flow, leaving the score panel feeling disconnected when the
 * teacher was in the middle of a long câu).
 */
export function ActionBar({ children, status, scoreSlot }: ActionBarProps) {
  return (
    <div
      className="action-bar"
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 40,
        marginTop: 20,
        // Full-bleed: cancel the workspace-container's horizontal padding so
        // the bar's background/border span edge-to-edge, then push content
        // back in via matching padding. Both read the SAME --ws-bleed var that
        // the container sets per breakpoint, so they can never drift apart
        // (the earlier hard-coded clamp here overshot the px-overridden
        // container padding at mobile/tablet → horizontal scroll + clipped
        // left content). Fallback clamp = the desktop value when no
        // --ws-bleed is in scope.
        marginLeft: "calc(-1 * var(--ws-bleed, clamp(16px, 4vw, 32px)))",
        marginRight: "calc(-1 * var(--ws-bleed, clamp(16px, 4vw, 32px)))",
        padding: "14px var(--ws-bleed, clamp(16px, 4vw, 32px))",
        // Opaque paper, no blur. The earlier glass effect (translucent +
        // backdrop-blur) let dense transcript text bleed through the bar as
        // it scrolled behind, which read as clutter. A solid bg cleanly
        // occludes the content under it — readability over the glass look.
        background: T.paper,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        flexWrap: "wrap",
        borderTop: `1px solid ${T.border}`,
        boxShadow: "0 -6px 20px -8px rgba(44, 46, 58, 0.08)",
      }}
    >
      {/* Zone 1: Scores (Left) */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          flex: "0 1 auto",
          minWidth: 0,
        }}
      >
        {scoreSlot}
      </div>

      {/* Zone 2: Contextual Status Message (Center) */}
      {status ? (
        <div
          className="action-bar-status"
          style={{
            fontFamily: T.font,
            fontSize: 13,
            color: T.textMute,
            textAlign: "center",
            flex: "1 1 200px",
            minWidth: 0,
            lineHeight: 1.5,
            fontWeight: 500,
          }}
        >
          {status}
        </div>
      ) : (
        /* Flexible spacer when status is empty to push actions to the far right */
        <div style={{ flex: "1 1 0%" }} />
      )}

      {/* Zone 3: Actions Cluster (Right) */}
      <div
        className="action-bar-actions"
        style={{
          display: "inline-flex",
          gap: 12,
          alignItems: "center",
          flex: "0 0 auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}
