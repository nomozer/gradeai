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
      {/* 1. Blue shape (Stepped block) - drawn first so it can overlap under the black shape */}
      <path
        d="M 66 32 L 78 32 L 78 10 L 90 10 L 90 90 L 78 90 L 78 72 L 45 72 L 45 50 L 66 50 Z"
        fill="#0052A3"
      />

      {/* 2. Black shape - drawn on top of the blue shape */}
      {/* Main black face */}
      <polygon
        points="18,10 35,10 51,72 34,72"
        fill="#1A1A1A"
      />
      {/* Shadow face (pitch black for depth) */}
      <polygon
        points="35,10 38,10 54,72 51,72"
        fill="#000000"
      />

      {/* 3. Red shape (Quarter circle) - drawn last so it overlaps both black and blue shapes */}
      {/* Center is at (0, 100) on a 100x100 grid, radius is 54 */}
      <path
        d="M 0 100 L 0 46 A 54 54 0 0 1 54 100 Z"
        fill="#E1251B"
      />
    </svg>
  );
}
