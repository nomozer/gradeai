import React from "react";

interface MirrorLogoProps {
  size?: number;
  style?: React.CSSProperties;
}

export function MirrorLogo({ size = 32, style }: MirrorLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", flexShrink: 0, ...style }}
    >
      {/* Mirror axis — the soft line the M reflects across */}
      <line
        x1="13"
        y1="52"
        x2="87"
        y2="52"
        stroke="#CDBCEA"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* The M — twin peaks reading as "up / progress", in brand navy (tokens.accent) */}
      <polyline
        points="16,46 34,16 50,40 66,16 84,46"
        fill="none"
        stroke="#3B4F8A"
        strokeWidth="11"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Its reflection — a softer violet echo: the teacher's fingerprint / HITL (tokens.memory) */}
      <polyline
        points="16,58 34,86 50,62 66,86 84,58"
        fill="none"
        stroke="#7C3AED"
        strokeWidth="9"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}
