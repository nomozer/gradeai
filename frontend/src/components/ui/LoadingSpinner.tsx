import { useEffect, useState } from "react";
import { T } from "../../theme/tokens";

const LOADING_SUB_STEPS = [
  "Đang trích xuất nội dung bài làm và đề thi...",
  "Đang đối chiếu tài liệu với đáp án & bareme...",
  "Mô hình VLM Gemini đang phân tích chi tiết...",
  "Đang tổng hợp điểm số và hoàn thiện nhận xét...",
];

interface LoadingSpinnerProps {
  title: string;
  description: string;
}

export function LoadingSpinner({ title, description }: LoadingSpinnerProps) {
  const [subStep, setSubStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSubStep((prev) => (prev < LOADING_SUB_STEPS.length - 1 ? prev + 1 : prev));
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "55vh",
        gap: 22,
        textAlign: "center",
        animation: "fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        boxSizing: "border-box",
        padding: "0 16px",
      }}
    >
      {/* Upgraded Hourglass Spinner - Multi-layered premium astrolabe loader */}
      <div
        style={{
          position: "relative",
          width: 84,
          height: 84,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 6,
        }}
      >
        {/* Soft radial glow orb behind the spinner */}
        <div
          style={{
            position: "absolute",
            width: 160,
            height: 160,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(59, 79, 138, 0.06) 0%, rgba(247, 245, 240, 0) 70%)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        {/* Elegant dotted academic dial spinning slowly */}
        <div
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            border: `1.5px dashed rgba(59, 79, 138, 0.25)`,
            animation: "spin 12s linear infinite",
            zIndex: 1,
          }}
        />

        {/* Mid solid top-glow ring rotating smoothly */}
        <div
          style={{
            position: "absolute",
            width: "90%",
            height: "90%",
            borderRadius: "50%",
            border: `1.5px solid transparent`,
            borderTopColor: T.accent,
            animation: "spin 2s cubic-bezier(0.4, 0, 0.2, 1) infinite",
            zIndex: 2,
          }}
        />

        {/* Hourglass Container */}
        <div
          style={{
            position: "relative",
            width: 56,
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "hourglassFlip 2.4s cubic-bezier(0.7, 0, 0.3, 1) infinite",
            transformOrigin: "center center",
            zIndex: 3,
          }}
        >
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
            <path
              d="M10 4 H34 M10 40 H34 M12 4 V12 Q12 18 22 22 Q32 26 32 32 V40 M32 4 V12 Q32 18 22 22 Q12 26 12 32 V40"
              stroke={T.accent}
              strokeWidth="2.0"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M14 6 L30 6 Q30 13 22 18 Q14 13 14 6 Z"
              fill={T.accent}
              style={{
                transformOrigin: "22px 6px",
                animation: "sandTop 2.4s cubic-bezier(0.7, 0, 0.3, 1) infinite",
              }}
            />
            <path
              d="M14 38 L30 38 Q30 31 22 26 Q14 31 14 38 Z"
              fill={T.accent}
              style={{
                transformOrigin: "22px 38px",
                animation: "sandBottom 2.4s cubic-bezier(0.7, 0, 0.3, 1) infinite",
              }}
            />
          </svg>
        </div>
      </div>

      {/* Title with perfect font balance */}
      <h2
        style={{
          fontFamily: T.display,
          fontSize: 30,
          fontStyle: "italic",
          fontWeight: 400,
          color: T.text,
          letterSpacing: "-0.02em",
          margin: 0,
        }}
      >
        {title}
      </h2>

      {/* Description with comfortable vertical rhythm */}
      <p
        style={{
          fontFamily: T.font,
          fontSize: 15,
          color: T.textSoft,
          maxWidth: 420,
          lineHeight: 1.6,
          margin: "0 0 6px 0",
        }}
      >
        {description}
      </p>

      {/* Upgraded Capsule Step Indicator - Very balanced, neat and premium */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          marginTop: 8,
        }}
      >
        {/* Capsule Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(59, 79, 138, 0.06)",
            border: "1px solid rgba(59, 79, 138, 0.12)",
            padding: "10px 22px",
            borderRadius: 999,
            transition: "all 0.3s ease",
            boxShadow: "0 2px 10px rgba(59, 79, 138, 0.04)",
          }}
        >
          {/* Pulsing Dot with extra glow shadow */}
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: T.accent,
              display: "inline-block",
              animation: "pulse 1.4s infinite ease-in-out",
              boxShadow: `0 0 8px ${T.accent}`,
            }}
          />
          <span
            style={{
              fontFamily: T.font,
              fontSize: 13.5,
              fontWeight: 600,
              color: T.accentDark,
              letterSpacing: "0.015em",
            }}
          >
            {LOADING_SUB_STEPS[subStep]}
          </span>
        </div>

        {/* Tiny minimalist progress dots */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 2,
          }}
        >
          {LOADING_SUB_STEPS.map((_, idx) => {
            const isActive = idx === subStep;
            return (
              <div
                key={idx}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  backgroundColor: isActive ? T.accent : T.border,
                  transform: isActive ? "scale(1.2)" : "scale(1)",
                  transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
