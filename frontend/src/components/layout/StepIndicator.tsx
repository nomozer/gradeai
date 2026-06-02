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
   *  from step 4 → step 3) should ALSO read as done. */
  maxStepReached?: number;
  /** Called when the user clicks a navigable completed step.
   *  Omit to render a purely informational indicator. */
  onStepClick?: (step: number) => void;
  /** Per-step gate: return true if the step number is a real checkpoint
   *  the user can revisit. */
  isStepNavigable?: (step: number) => boolean;
}

function getShortStep(step: string): string {
  const s = step.trim().toUpperCase();
  if (s.includes("TẢI LÊN") || s.includes("UPLOAD")) return "Lên";
  if (s.includes("ĐỌC") || s.includes("READ")) return "Đọc";
  if (s.includes("CHẤM") || s.includes("GRADE") || s.includes("SCORE")) return "Chấm";
  if (s.includes("XONG") || s.includes("DONE") || s.includes("FINISH")) return "Xong";
  return step;
}

/**
 * Horizontal step indicators modeled as modern pill badges connected by thin lines.
 * Clean, minimalistic design with unified responsive code.
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

  const isMobile = bp === "mobile";
  const isTablet = bp === "tablet";

  return (
    <div
      style={{
        padding: isMobile ? "16px 12px 12px" : "24px clamp(12px, 3vw, 24px) 20px",
        display: "flex",
        justifyContent: "center",
        overflowX: "auto",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: isMobile ? 8 : 12,
          width: "100%",
          maxWidth: isMobile ? 320 : 760,
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

          // Resolve visual colors based on step state
          const bg = isActive
            ? `linear-gradient(135deg, ${T.accent} 0%, ${T.accentLight} 100%)`
            : isDone
              ? `${T.accent}0a` // Translucent accent blue
              : T.bgCard;

          const border = isActive
            ? "none"
            : isDone
              ? `1.5px solid ${T.accent}33`
              : `1.5px solid ${T.border}`;

          const color = isActive
            ? "#FFFFFF"
            : isDone
              ? T.accent
              : T.textFaint;

          const circleBg = isActive
            ? "rgba(255, 255, 255, 0.22)"
            : isDone
              ? T.greenSoft
              : "rgba(0, 0, 0, 0.04)";

          const circleColor = isActive
            ? "#FFFFFF"
            : isDone
              ? T.green
              : T.textFaint;

          return (
            <Fragment key={step}>
              {/* Step pill / circle button */}
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
                  gap: isMobile ? 0 : 8,
                  height: 38,
                  padding: isMobile ? "0" : "0 16px",
                  width: isMobile ? 38 : "auto",
                  flex: isMobile ? "0 0 38px" : "1 1 0%",
                  background: isHover ? `${T.accent}12` : bg,
                  border: border,
                  borderRadius: 999,
                  color: color,
                  fontFamily: `"Inter", "Outfit", system-ui, -apple-system, sans-serif`,
                  fontSize: 12.5,
                  fontWeight: isActive ? 700 : 600,
                  letterSpacing: "0.02em",
                  textTransform: "uppercase",
                  cursor: isClickable ? "pointer" : "default",
                  transition: "background-color 0.15s ease, color 0.15s ease, box-shadow 0.25s ease",
                  animation: isActive ? "stepGlow 2s ease-in-out infinite" : undefined,
                  boxShadow: isActive
                    ? `0 0 0 3px ${T.accentSoft}, 0 4px 10px ${T.accentGlow}`
                    : "none",
                  whiteSpace: "nowrap",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              >
                {/* Step Circle Badge (Number or Checkmark) */}
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: circleBg,
                    color: circleColor,
                    fontSize: 10.5,
                    fontWeight: 800,
                    flexShrink: 0,
                    transition: "all 0.2s ease",
                  }}
                >
                  {isDone ? (
                    <Icon.Check
                      size={12}
                      color={circleColor}
                      style={{ strokeWidth: 3.5 }}
                    />
                  ) : (
                    n
                  )}
                </span>

                {/* Step Text Label (Hidden on mobile) */}
                {!isMobile && (
                  <span style={{ transition: "color 0.2s" }}>
                    {isTablet ? getShortStep(step) : step}
                  </span>
                )}
              </button>

              {/* Connecting Line */}
              {i < steps.length - 1 && (
                <div
                  style={{
                    height: 2,
                    background: (n < currentStep || (n !== currentStep && n + 1 <= ceiling))
                      ? T.accent
                      : T.border,
                    flex: "1 1 20px",
                    minWidth: isMobile ? 12 : 20,
                    opacity: (n < currentStep || (n !== currentStep && n + 1 <= ceiling)) ? 0.8 : 0.4,
                    transition: "background 0.3s ease, opacity 0.3s ease",
                  }}
                />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}


