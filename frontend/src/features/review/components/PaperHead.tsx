import type { ReactNode } from "react";
import { T } from "../../../theme/tokens";
import { Icon } from "../../../components/ui/Icon";
import type { ReviewPayload } from "../types";

// PaperHead — the document's title block at the top of the paper page.
// Flush white with the page body (no tinted strip) so the paper reads
// as one continuous Word-style sheet. The action pills live in
// Step3Toolbar above the grid; this just carries the student identity
// plus a TL;DR chip row (structure-ok / error count / AI score) so the
// teacher can decide "skim or deep-dive" before reading further.
export function PaperHead({ review }: { review: ReviewPayload }) {
  // The paper identity has no data source yet — show a neutral placeholder
  // rather than a fake default name. Class is appended only when present.
  const name = review.studentName.trim();
  const studentClass = review.studentClass.trim();
  const identity = [name, studentClass].filter(Boolean).join(" · ");

  // Chip values are pure derivations from the review payload — no
  // separate state, so they stay consistent with the right-rail summary
  // and the MucLucSidebar per-câu pills.
  const totalErrors = review.questions.reduce(
    (sum, q) => sum + q.annotations.filter((a) => a.kind === "error").length,
    0,
  );
  const totalGood = review.questions.reduce(
    (sum, q) => sum + q.annotations.filter((a) => a.kind === "good").length,
    0,
  );
  // "Structure ok" is heuristic: at least one câu parsed and no câu has
  // zero earned points (which would suggest a malformed answer). Mirrors
  // the teacher's manual sanity-check.
  const structureOk =
    review.questions.length > 0 &&
    review.questions.every((q) => q.max > 0);
  const scoreText = formatScore(review.overallScore, review.overallMax);

  return (
    <div
      style={{
        padding: "32px clamp(24px, 5vw, 64px) 20px",
        background: T.paper,
        borderBottom: `1px solid ${T.borderLight}`,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: T.textFaint,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        Bản chấm AI · Lần {review.runNumber}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div
          style={{
            fontFamily: T.font,
            fontSize: 20,
            fontWeight: 600,
            color: identity ? T.text : T.textMute,
            fontStyle: identity ? "normal" : "italic",
            letterSpacing: "-0.005em",
            lineHeight: 1.25,
          }}
        >
          {identity || "Chưa rõ tên học sinh"}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {structureOk && (
            <Chip
              tone="green"
              icon={<Icon.Check size={13} />}
              label="Đúng cấu trúc"
            />
          )}
          {totalErrors > 0 && (
            <Chip
              tone="amber"
              icon={<Icon.AlertTriangle size={13} />}
              label={`${totalErrors} lỗi phát hiện`}
            />
          )}
          {totalGood > 0 && (
            <Chip
              tone="green-soft"
              icon={<Icon.Star size={13} />}
              label={`${totalGood} điểm sáng`}
            />
          )}
          <Chip tone="accent" label={`AI: ${scoreText}`} bold />
        </div>
      </div>
    </div>
  );
}

// Decimal-aware score formatter. 8.5 / 10 → "8.5/10"; 17 / 20 (whole
// numbers) → "17/20". Avoids the off-putting "8.50/10.00".
function formatScore(score: number, max: number): string {
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return `${fmt(score)}/${fmt(max)}`;
}

type ChipTone = "green" | "amber" | "accent" | "green-soft" | "red";

function Chip({
  tone,
  icon,
  label,
  bold,
}: {
  tone: ChipTone;
  icon?: ReactNode;
  label: string;
  bold?: boolean;
}) {
  const palette = chipPalette(tone);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px",
        borderRadius: 999,
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.border}`,
        fontSize: T.fontSize.xs,
        fontFamily: T.font,
        fontWeight: bold ? 700 : 600,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
      }}
    >
      {icon}
      {label}
    </span>
  );
}

function chipPalette(tone: ChipTone): {
  bg: string;
  fg: string;
  border: string;
} {
  switch (tone) {
    case "green":
      return { bg: T.greenSoft, fg: T.green, border: "transparent" };
    case "green-soft":
      return { bg: T.bgElevated, fg: T.green, border: T.borderLight };
    case "amber":
      return { bg: T.amberSoft, fg: T.amber, border: "transparent" };
    case "red":
      return { bg: T.redSoft, fg: T.red, border: "transparent" };
    case "accent":
    default:
      return { bg: T.accentSoft, fg: T.accentDark, border: "transparent" };
  }
}
