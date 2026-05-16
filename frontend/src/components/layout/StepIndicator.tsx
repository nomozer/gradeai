import { useState } from "react";
import { T } from "../../theme/tokens";
import { Icon } from "../ui/Icon";

interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
  /** Called when the user clicks a navigable completed step.
   *  Omit to render a purely informational indicator. */
  onStepClick?: (step: number) => void;
  /** Per-step gate: return true if the step number is a real checkpoint
   *  the user can revisit. Defaults to "every completed step is navigable".
   *  Use this to mark transient/loading steps (e.g. "AI is reading") as
   *  read-only milestones — they still show as done but can't be clicked. */
  isStepNavigable?: (step: number) => boolean;
}

/**
 * Horizontal stepper inspired by Stripe / Shadcn — completed steps show a
 * Check icon (not a duplicated number), the active step gets a filled
 * circle with a subtle glow, and the connector between two completed
 * steps fills with the accent colour. Completed steps are clickable so
 * the user can revisit earlier stages without losing state.
 */
export function StepIndicator({
  steps,
  currentStep,
  onStepClick,
  isStepNavigable,
}: StepIndicatorProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div
      style={{
        padding: "32px clamp(12px, 3vw, 24px) 28px",
        display: "flex",
        justifyContent: "center",
        overflowX: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 0,
          flexShrink: 0,
        }}
      >
        {steps.map((step, i) => {
          const n = i + 1;
          const isActive = n === currentStep;
          const isDone = n < currentStep;
          const isClickable =
            isDone && !!onStepClick && (isStepNavigable ? isStepNavigable(n) : true);
          const isHover = hovered === n && isClickable;

          return (
            <div key={i} style={{ display: "flex", alignItems: "flex-start" }}>
              <button
                type="button"
                onClick={isClickable ? () => onStepClick!(n) : undefined}
                onMouseEnter={() => setHovered(n)}
                onMouseLeave={() => setHovered(null)}
                disabled={!isClickable}
                title={isClickable ? `Quay lại: ${step}` : undefined}
                aria-current={isActive ? "step" : undefined}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                  width: 88,
                  padding: 0,
                  background: "transparent",
                  border: "none",
                  cursor: isClickable ? "pointer" : "default",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: 40,
                    height: 40,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {/* Hover halo on clickable (completed) steps. */}
                  {isHover && (
                    <div
                      style={{
                        position: "absolute",
                        inset: -5,
                        borderRadius: "50%",
                        background: T.accentSoft,
                        transition: "opacity 0.2s",
                      }}
                    />
                  )}
                  <div
                    style={{
                      position: "relative",
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: isActive ? T.accent : T.bgCard,
                      border: `2px solid ${isActive || isDone ? T.accent : T.border}`,
                      color: isActive ? "#FFFFFF" : isDone ? T.accent : T.textFaint,
                      fontFamily: T.mono,
                      fontSize: 14,
                      fontWeight: 600,
                      lineHeight: 1,
                      transition: "transform 0.2s, background 0.25s, border-color 0.25s, box-shadow 0.25s",
                      transform: isHover ? "scale(1.06)" : "scale(1)",
                      boxShadow: isActive
                        ? `0 0 0 4px ${T.accentSoft}, 0 6px 14px ${T.accentGlow}`
                        : undefined,
                    }}
                  >
                    {isDone ? <Icon.Check size={16} color={T.accent} /> : n}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontFamily: T.mono,
                    fontWeight: isActive ? 700 : 500,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: isActive ? T.accent : isDone ? T.textSoft : T.textFaint,
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    transition: "color 0.25s, font-weight 0.25s",
                  }}
                >
                  {step}
                </span>
              </button>
              {i < steps.length - 1 && (
                <div
                  style={{
                    flexShrink: 0,
                    width: 48,
                    height: 2,
                    background: isDone ? T.accent : T.border,
                    marginTop: 19,
                    borderRadius: 1,
                    transition: "background 0.4s",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
