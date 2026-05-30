import { useMemo } from "react";
import { T } from "../../../theme/tokens";
import { Icon } from "../../../components/ui/Icon";
import { parseCauHeader } from "../../../lib/grade";
import type { Grade, GradeConfidence } from "../../../types";

// ScoreInline — compact read-only score panel meant to slot INTO the
// shared ActionBar (left side). The wrapper is the unified sticky
// footer; this is just its score content.
interface ScoreInlineProps {
  grade: Grade;
  finalScores: Record<number, number>;
  maxOverrides: Record<number, number>;
  finalized: boolean;
  /** Render the per-câu adjustment counter ("N câu · M đã chỉnh"). Off
   *  for steps that have their own per-câu UI (step 4 regrade already
   *  shows this prominently) — keeps the bar from feeling busy. */
  showCounter?: boolean;
  /** Server-inferred grade confidence. When null the chip is hidden. */
  confidence?: GradeConfidence | null;
}

export function ScoreInline({
  grade,
  finalScores,
  maxOverrides,
  finalized,
  showCounter = true,
  confidence = null,
}: ScoreInlineProps) {
  const { teacherTotal, totalMax, perCauCount, adjustedCount } = useMemo(() => {
    const questions = grade.per_question_feedback ?? [];
    let teacher = 0;
    let max = 0;
    let adjusted = 0;
    questions.forEach((q, i) => {
      const parsed = parseCauHeader(q.question ?? "", i + 1);
      const aiScore = q.score ?? 0;
      const teacherScore = finalScores[parsed.num] ?? aiScore;
      const qMax = maxOverrides[parsed.num] ?? q.max_points ?? 0;
      teacher += teacherScore;
      max += qMax;
      if (
        finalScores[parsed.num] !== undefined &&
        finalScores[parsed.num] !== aiScore
      ) {
        adjusted += 1;
      }
    });
    return {
      teacherTotal: teacher,
      totalMax: max,
      perCauCount: questions.length,
      adjustedCount: adjusted,
    };
  }, [grade, finalScores, maxOverrides]);

  const aiOverall = useMemo(() => {
    const raw = grade.overall;
    if (typeof raw === "number" && !Number.isNaN(raw)) return raw;
    const parsed = typeof raw === "string" ? parseFloat(raw) : NaN;
    if (!Number.isNaN(parsed)) return parsed;
    return (grade.per_question_feedback ?? []).reduce(
      (s, q) => s + (q.score ?? 0),
      0,
    );
  }, [grade]);

  const teacherDiffsAI = Math.abs(teacherTotal - aiOverall) >= 0.05;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <ScoreBlock
        label="Tổng điểm GV"
        value={fmt(teacherTotal)}
        unit={`/ ${fmt(totalMax || 10)}`}
        tone={finalized ? "green" : teacherDiffsAI ? "accent" : "neutral"}
        emphasis
      />
      <Divider />
      <ScoreBlock
        label="AI đề xuất"
        value={fmt(aiOverall)}
        unit="/ 10"
        tone="muted"
        badge={confidence ? <ConfidenceChip level={confidence} /> : undefined}
      />
      {showCounter && perCauCount > 0 && (
        <>
          <Divider />
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: T.textMute,
              fontFamily: T.font,
              whiteSpace: "nowrap",
              fontWeight: 500,
            }}
          >
            <Icon.Check size={12} color={T.textMute} />
            <span>{perCauCount} câu</span>
            {adjustedCount > 0 && (
              <span style={{ color: T.amber, fontWeight: 700 }}>
                · {adjustedCount} đã chỉnh
              </span>
            )}
          </span>
        </>
      )}
    </div>
  );
}

type BlockTone = "neutral" | "accent" | "muted" | "green";

function ScoreBlock({
  label,
  value,
  unit,
  tone,
  hint,
  emphasis,
  badge,
}: {
  label: string;
  value: string;
  unit: string;
  tone: BlockTone;
  hint?: string;
  emphasis?: boolean;
  badge?: React.ReactNode;
}) {
  const fg =
    tone === "green"
      ? T.green
      : tone === "accent"
        ? T.accentDark
        : tone === "muted"
          ? T.textSoft
          : T.text;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 2,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 10,
            fontFamily: T.font,
            fontWeight: 800,
            color: T.textMute,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            lineHeight: 1.2,
          }}
        >
          {label}
        </span>
        {badge}
      </div>
      <span
        style={{
          display: "inline-flex",
          alignItems: "baseline",
          gap: 4,
          fontFamily: T.font,
          color: fg,
          lineHeight: 1.1,
        }}
      >
        <span
          style={{
            fontSize: emphasis ? 20 : 15,
            fontWeight: 700,
          }}
        >
          {value}
        </span>
        <span
          style={{
            fontSize: T.fontSize.xs,
            color: T.textMute,
            fontWeight: 500,
          }}
        >
          {unit}
        </span>
        {hint && (
          <span
            style={{
              fontSize: T.fontSize.xs,
              color: T.textFaint,
              fontWeight: 500,
              marginLeft: 4,
            }}
          >
            ({hint})
          </span>
        )}
      </span>
    </div>
  );
}

// Small confidence pill — renders inline with "AI đề xuất" label.
function ConfidenceChip({ level }: { level: GradeConfidence }) {
  const palette: Record<
    GradeConfidence,
    { fg: string; bg: string; label: string; title: string }
  > = {
    high: {
      fg: T.green,
      bg: T.greenSoft,
      label: "Tin cậy cao",
      title: "AI chấm đầy đủ shape, comment dài, scores có phân hoá — có thể duyệt nhanh.",
    },
    medium: {
      fg: T.amber,
      bg: T.amberSoft,
      label: "Trung bình",
      title: "AI chấm xong nhưng feedback sparse hoặc comment ngắn — nên đọc kỹ trước khi duyệt.",
    },
    low: {
      fg: T.red,
      bg: T.redSoft,
      label: "Cần xem kỹ",
      title: "AI bỏ sót shape hoặc bị cắt giữa chừng — kiểm tra từng câu trước khi xác nhận điểm.",
    },
  };
  const p = palette[level];
  return (
    <span
      title={p.title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "1px 6px",
        borderRadius: 4,
        background: p.bg,
        color: p.fg,
        fontSize: 9,
        fontWeight: 800,
        fontFamily: T.font,
        letterSpacing: "0.02em",
        lineHeight: 1.3,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: p.fg,
          flex: "0 0 auto",
        }}
      />
      {p.label}
    </span>
  );
}

function Divider() {
  return (
    <span
      aria-hidden
      style={{
        width: 1,
        height: 24,
        background: T.border,
        opacity: 0.6,
        flex: "0 0 auto",
      }}
    />
  );
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
