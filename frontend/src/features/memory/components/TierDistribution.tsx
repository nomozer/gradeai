import { T } from "../../../theme/tokens";
import type { Lesson } from "../../../types";

// TierDistribution — 4-bar histogram of HITL lessons by feedback_score.
// REVISE and Δ-GRADE both fall in 4.0 so the chart shows the combined
// "score 4" column; the table column still distinguishes them via NGUỒN.
export function TierDistribution({ lessons }: { lessons: Lesson[] }) {
  const buckets: Array<{ score: number; label: string; color: string }> = [
    { score: 5.0, label: "score 5",   color: T.red },
    { score: 4.0, label: "score 4",   color: T.amber },
    { score: 3.5, label: "score 3.5", color: T.accent },
    { score: 3.0, label: "score 3",   color: T.green },
  ];
  const counts = buckets.map((b) => ({
    ...b,
    count: lessons.filter((l) => Math.abs(l.feedback_score - b.score) < 0.01).length,
  }));
  const max = Math.max(1, ...counts.map((b) => b.count));
  const barAreaHeight = 64;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: T.space[4],
      }}
    >
      {counts.map((b) => {
        const h = b.count === 0 ? 4 : Math.max(8, (b.count / max) * barAreaHeight);
        return (
          <div
            key={b.score}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: T.space[1],
            }}
          >
            <span
              style={{
                fontFamily: T.mono,
                fontSize: T.fontSize.xs,
                color: b.color,
                fontWeight: 600,
                lineHeight: 1,
              }}
            >
              {b.count}
            </span>
            <div
              style={{
                width: 24,
                height: h,
                background: b.color,
                opacity: b.count === 0 ? 0.25 : 1,
                borderRadius: 2,
                transition: "height 0.3s ease",
              }}
            />
            <span
              style={{
                fontFamily: T.mono,
                fontSize: T.fontSize.xs,
                color: T.textMute,
                lineHeight: 1,
              }}
            >
              {b.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
