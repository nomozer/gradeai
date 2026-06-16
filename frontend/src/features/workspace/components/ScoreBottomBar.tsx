import { useMemo } from "react";
import { T } from "../../../theme/tokens";
import { parseCauHeader } from "../../../lib/grade";
import type { Grade, GradeConfidence } from "../../../types";

// ScoreInline — minimal read-only score for the shared ActionBar (left side).
// Shows ONLY the teacher's running total + max. AI suggestion, confidence and
// per-câu progress already live in the "Bản chấm AI" chips (PaperHead) and the
// MụcLục sidebar, so the footer stays a clean "final score + commit" bar
// instead of a busy multi-stat strip.
interface ScoreInlineProps {
  grade: Grade;
  finalScores: Record<number, number>;
  maxOverrides: Record<number, number>;
  finalized: boolean;
  // Kept for call-site compatibility (callers still pass these); the minimal
  // bar no longer renders them — confidence/progress live elsewhere now.
  showCounter?: boolean;
  confidence?: GradeConfidence | null;
}

export function ScoreInline({
  grade,
  finalScores,
  maxOverrides,
  finalized,
}: ScoreInlineProps) {
  const { teacherTotal, totalMax } = useMemo(() => {
    const questions = grade.per_question_feedback ?? [];
    let teacher = 0;
    let max = 0;
    questions.forEach((q, i) => {
      const parsed = parseCauHeader(q.question ?? "", i + 1);
      teacher += finalScores[parsed.num] ?? q.score ?? 0;
      max += maxOverrides[parsed.num] ?? q.max_points ?? 0;
    });
    return { teacherTotal: teacher, totalMax: max };
  }, [grade, finalScores, maxOverrides]);

  return (
    <div style={{ display: "inline-flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
      <span
        style={{
          fontSize: 11,
          fontFamily: T.font,
          fontWeight: 700,
          color: T.textMute,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        Tổng điểm GV
      </span>
      <span
        style={{
          fontFamily: T.font,
          color: finalized ? T.green : T.text,
          fontSize: 26,
          fontWeight: 800,
          lineHeight: 1,
        }}
      >
        {fmt(teacherTotal)}
      </span>
      <span style={{ fontSize: 14, color: T.textMute, fontWeight: 600 }}>
        / {fmt(totalMax || 10)}
      </span>
    </div>
  );
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
