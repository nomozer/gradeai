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
        d="M 40 100 L 40 50 L 60 50 L 60 20 L 80 20 L 80 0 L 100 0 L 100 100 Z"
        fill="#0052A3"
      />

      {/* 2. Black shape - drawn on top of the blue shape */}
      {/* Main black face */}
      <polygon
        points="24,0 41,0 65,100 48,100"
        fill="#1A1A1A"
      />
      {/* Shadow face (pitch black for depth) */}
      <polygon
        points="41,0 46,0 70,100 65,100"
        fill="#000000"
      />

      {/* 3. Red shape (Quarter circle) - drawn last so it overlaps both black and blue shapes */}
      {/* Center is at (0, 100) on a 100x100 grid, radius is 55 */}
      <path
        d="M 0 100 L 0 45 A 55 55 0 0 1 55 100 Z"
        fill="#E1251B"
      />
    </svg>
  );
}
