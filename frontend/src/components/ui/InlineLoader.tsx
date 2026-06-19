import { T } from "../../theme/tokens";

interface InlineLoaderProps {
  /** Text shown next to the ring. Defaults to "Đang tải…". */
  label?: string;
  /** Diameter of the spinning ring in px. */
  size?: number;
}

/**
 * InlineLoader — a small, reusable "loading" affordance for inline spots
 * (admin tables, dropdowns) where the full-screen grading `LoadingSpinner`
 * would be wildly oversized. A thin accent ring spinning over the bare
 * "Đang tải…" text. Reuses the global `spin` keyframe (theme/GlobalStyles).
 */
export function InlineLoader({ label = "Đang tải…", size = 16 }: InlineLoaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "28px 0",
        color: T.textMute,
        fontFamily: T.font,
        fontSize: T.fontSize.sm,
      }}
    >
      <span
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: `2px solid ${T.border}`,
          borderTopColor: T.accent,
          animation: "spin 0.8s linear infinite",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {label}
    </div>
  );
}
