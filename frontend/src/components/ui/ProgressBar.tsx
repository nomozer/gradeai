import { T } from "../../theme/tokens";

interface ProgressBarProps {
  completed: number;
  total: number;
  label?: string;
}

export function ProgressBar({ completed, total, label }: ProgressBarProps) {
  const pct = total > 0 ? (completed / total) * 100 : 0;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: `${T.space[2]}px 0 ${T.space[3]}px`,
        fontFamily: '"Inter", "Outfit", system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: T.textSoft,
            letterSpacing: "0.02em",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: T.accent,
            fontFamily: T.mono,
          }}
        >
          {completed}/{total}
          <span
            style={{
              fontWeight: 500,
              color: T.textMute,
              fontSize: 10,
              marginLeft: 6,
              fontFamily: '"Inter", "Outfit", system-ui, -apple-system, sans-serif',
            }}
          >
            ({Math.round(pct)}%)
          </span>
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: T.bgMuted,
          borderRadius: 999,
          position: "relative",
          overflow: "hidden",
          border: `1px solid ${T.borderLight}`,
          boxShadow: "inset 0 1px 2px rgba(44, 46, 58, 0.04)",
        }}
      >
        {/* Animate via transform scaleX instead of width so the progress
            fill runs on the compositor thread — no layout/paint per frame.
            transformOrigin keeps the fill anchored to the left edge. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(90deg, ${T.accent} 0%, ${T.accentLight} 100%)`,
            borderRadius: 999,
            transformOrigin: "left center",
            transform: `scaleX(${pct / 100})`,
            transition: "transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: `0 1px 3px ${T.accentSoft}`,
          }}
        />
      </div>
    </div>
  );
}
