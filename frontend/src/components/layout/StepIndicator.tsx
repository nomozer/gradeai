import { useState, Fragment } from "react";
import { T } from "../../theme/tokens";
import { Icon } from "../ui/Icon";
import { useBreakpoint } from "../../hooks/useBreakpoint";

interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
  /** Highest step the user has ever reached this session. Steps with
   *  ``n < currentStep`` are always "done" (we walked past them), but
   *  steps the user visited and then navigated BACK from (e.g. "Sửa lại"
   *  from step 5 → step 4) should ALSO read as done. Without this prop
   *  the indicator collapses 4 and 5 back to grey when the teacher
   *  bounces back to step 3 to recheck the review, which felt buggy.
   *  Defaults to currentStep so callers can opt-in. */
  maxStepReached?: number;
  /** Called when the user clicks a navigable completed step.
   *  Omit to render a purely informational indicator. */
  onStepClick?: (step: number) => void;
  /** Per-step gate: return true if the step number is a real checkpoint
   *  the user can revisit. Defaults to "every completed step is navigable".
   *  Use this to mark transient/loading steps (e.g. "AI is reading") as
   *  read-only milestones — they still show as done but can't be clicked. */
  isStepNavigable?: (step: number) => boolean;
}

function getShortStep(step: string): string {
  const s = step.trim().toUpperCase();
  if (s.includes("TẢI LÊN") || s.includes("UPLOAD")) return "Lên";
  if (s.includes("ĐỌC") || s.includes("READ")) return "Đọc";
  if (s.includes("CHỐT") || s.includes("SCORE")) return "Chốt";
  if (s.includes("XEM XÉT") || s.includes("REVIEW")) return "Xét";
  if (s.includes("XONG") || s.includes("DONE") || s.includes("FINISH")) return "Xong";
  return step;
}

/**
 * Horizontal segmented capsule stepper inspired by modern SaaS applications.
 * Clean, compact, and highly visible status states for active/completed/future.
 */
export function StepIndicator({
  steps,
  currentStep,
  maxStepReached,
  onStepClick,
  isStepNavigable,
}: StepIndicatorProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const ceiling = Math.max(currentStep, maxStepReached ?? 0);
  const bp = useBreakpoint();

  // ── Mobile: numbered circle stepper ──────────────────────────────────
  if (bp === "mobile") {
    return (
      <div style={{
        padding: "16px 24px",
        display: "flex",
        justifyContent: "center",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
        }}>
          {steps.map((step, i) => {
            const n = i + 1;
            const isActive = n === currentStep;
            const isDone = n < currentStep || (n !== currentStep && n <= ceiling);
            const isClickable = isDone && !!onStepClick && (isStepNavigable ? isStepNavigable(n) : true);
            return (
              <Fragment key={step}>
                <button
                  type="button"
                  onClick={isClickable ? () => onStepClick!(n) : undefined}
                  disabled={!isClickable}
                  title={isClickable ? `Quay lại: ${step}` : step}
                  aria-current={isActive ? "step" : undefined}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: isActive
                      ? "none"
                      : isDone
                        ? `2px solid ${T.accent}`
                        : `2px solid ${T.border}`,
                    background: isActive
                      ? T.accent
                      : isDone
                        ? "transparent"
                        : "transparent",
                    color: isActive
                      ? "#FFFFFF"
                      : isDone
                        ? T.accent
                        : T.textFaint,
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: T.font,
                    cursor: isClickable ? "pointer" : "default",
                    transition: "all 0.2s ease",
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  {isDone ? <Icon.Check size={14} color={T.accent} /> : n}
                </button>
                {i < steps.length - 1 && (
                  <div style={{
                    width: 28,
                    height: 2,
                    background: (n < currentStep || (n !== currentStep && n + 1 <= ceiling))
                      ? T.accent
                      : T.border,
                    flexShrink: 0,
                    transition: "background 0.3s ease",
                  }} />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Desktop / Laptop / Tablet: capsule stepper ───────────────────────
  return (
    <div
      style={{
        padding: "24px clamp(12px, 3vw, 24px) 20px",
        display: "flex",
        justifyContent: "center",
        overflowX: "auto",
        width: "100%",
      }}
    >
      <div
        className="stepper-capsule"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: 999,
          padding: "6px 8px",
          boxShadow: T.shadowSoft,
          width: "100%",
          maxWidth: 720,
          boxSizing: "border-box",
        }}
      >
        {steps.map((step, i) => {
          const n = i + 1;
          const isActive = n === currentStep;
          const isDone = n < currentStep || (n !== currentStep && n <= ceiling);
          const isClickable =
            isDone && !!onStepClick && (isStepNavigable ? isStepNavigable(n) : true);
          const isHover = hovered === n && isClickable;

          return (
            <Fragment key={step}>
              <button
                type="button"
                className="step-btn"
                onClick={isClickable ? () => onStepClick!(n) : undefined}
                onMouseEnter={() => setHovered(n)}
                onMouseLeave={() => setHovered(null)}
                disabled={!isClickable}
                title={isClickable ? `Quay lại: ${step}` : undefined}
                aria-current={isActive ? "step" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  flex: "1 1 0%",
                  height: 38,
                  padding: "0 16px",
                  background: isActive
                    ? `linear-gradient(135deg, ${T.accent} 0%, ${T.accentLight} 100%)`
                    : isHover
                      ? "rgba(59, 79, 138, 0.04)"
                      : "transparent",
                  border: "none",
                  borderRadius: 999,
                  color: isActive
                    ? "#FFFFFF"
                    : isDone
                      ? T.accent
                      : T.textFaint,
                  fontFamily: `"Inter", "Outfit", system-ui, -apple-system, sans-serif`,
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 600,
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                  cursor: isClickable ? "pointer" : "default",
                  transition: "background-color 0.15s ease, color 0.15s ease, box-shadow 0.25s ease",
                  animation: isActive ? "stepGlow 2s ease-in-out infinite" : undefined,
                  boxShadow: isActive ? `0 0 0 3px ${T.accentSoft}, 0 4px 10px ${T.accentGlow}` : "none",
                  whiteSpace: "nowrap",
                }}
              >
                {isDone && (
                  <Icon.Check
                    size={12}
                    color={isActive ? "#FFFFFF" : T.green}
                    style={{
                      strokeWidth: 3.5,
                      flexShrink: 0,
                      animation: "fadeUp 0.3s ease-out",
                    }}
                  />
                )}
                <span className="step-text-full">{step}</span>
                <span className="step-text-short">{getShortStep(step)}</span>
              </button>
              {i < steps.length - 1 && (
                <span className="step-chevron">
                  <Icon.ChevronRight
                    size={12}
                    color={T.textFaint}
                    style={{
                      opacity: 0.45,
                      flexShrink: 0,
                      margin: "0 2px",
                    }}
                  />
                </span>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

