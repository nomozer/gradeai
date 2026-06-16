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
  const delta = teacherTotal - aiOverall;
  const deltaText = teacherDiffsAI
    ? `lệch ${delta > 0 ? "+" : "−"}${fmt(Math.abs(delta))}`
    : null;
  // Hero colour: green once finalized, indigo when the teacher diverged from
  // the AI (signals "you changed it"), plain ink otherwise.
  const heroColor = finalized ? T.green : teacherDiffsAI ? T.accentDark : T.text;

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      {/* Hero — the teacher's final total is THE number to commit. */}
      <div style={{ display: "inline-flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 10,
            fontFamily: T.font,
            fontWeight: 800,
            color: T.textMute,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Tổng điểm GV
        </span>
        <span style={{ fontFamily: T.font, color: heroColor, fontSize: 26, fontWeight: 800, lineHeight: 1 }}>
          {fmt(teacherTotal)}
        </span>
        <span style={{ fontSize: 13, color: T.textMute, fontWeight: 600 }}>
          / {fmt(totalMax || 10)}
        </span>
      </div>

      {/* Quiet reference line: AI suggestion + divergence + confidence + progress. */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          fontSize: 12,
          fontFamily: T.font,
          fontWeight: 500,
          color: T.textMute,
        }}
      >
        <span>
          AI {fmt(aiOverall)}
          {deltaText && (
            <span style={{ color: T.amber, fontWeight: 700 }}> · {deltaText}</span>
          )}
        </span>
        {confidence && <ConfidenceChip level={confidence} />}
        {showCounter && perCauCount > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon.Check size={12} color={T.textMute} />
            {perCauCount} câu
            {adjustedCount > 0 && (
              <span style={{ color: T.amber, fontWeight: 700 }}>· {adjustedCount} đã chỉnh</span>
            )}
          </span>
        )}
      </div>
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

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
