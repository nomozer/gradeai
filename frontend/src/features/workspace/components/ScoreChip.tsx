import { T } from "../../../theme/tokens";

// ---------------------------------------------------------------------------
// Score quality buckets — drive the colour of the per-câu ScoreChip.
//
//   ≥80%  good  → green   ("an toàn để duyệt nhanh")
//   50-79 fair  → amber   ("nên đọc nhận xét")
//   <50%  poor  → red     ("cần kiểm tra kỹ")
//   max=0       neutral → grey ("legacy grade, không có thang điểm")
//
// Thresholds match the 10-point VN rubric mental model used elsewhere in
// the app (≥8.0 giỏi · 5.0-7.9 khá-trung bình · <5.0 yếu). One source of
// truth so the chip + any future use of these colours stays consistent.
// ---------------------------------------------------------------------------
type ScoreQuality = "good" | "fair" | "poor" | "neutral";

function scoreQuality(score: number, max: number): ScoreQuality {
  if (!max || max <= 0) return "neutral";
  const ratio = score / max;
  if (ratio >= 0.8) return "good";
  if (ratio >= 0.5) return "fair";
  return "poor";
}

export function ScoreChip({
  score,
  max,
}: {
  score: number;
  max: number;
}) {
  const q = scoreQuality(score, max);
  // Colour pairs chosen so the chip reads at a glance against the card's
  // bgCard surface — same green/amber/red the rest of the app uses (greenSoft
  // for tonal bg + green for the number + green border at low opacity).
  const palette: Record<ScoreQuality, { fg: string; bg: string; border: string }> = {
    good:    { fg: T.green, bg: T.greenSoft, border: T.green },
    fair:    { fg: T.amber, bg: T.amberSoft, border: T.amber },
    poor:    { fg: T.red,   bg: T.redSoft,   border: T.red },
    neutral: { fg: T.textSoft, bg: T.bgElevated, border: T.border },
  };
  const c = palette[q];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 3,
        padding: "3px 9px",
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 999,
        fontFamily: T.mono,
        fontSize: 13,
        fontWeight: 700,
        color: c.fg,
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.15,
        transition: "background 0.3s, color 0.3s, border-color 0.3s",
      }}
    >
      {score.toFixed(1)}
      <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.75 }}>
        /{max ? max.toFixed(1) : "—"}
      </span>
    </span>
  );
}
