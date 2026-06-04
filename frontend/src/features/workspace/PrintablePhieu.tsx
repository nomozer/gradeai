import { PhieuChamPrint, type PhieuChamPrintRow } from "./PhieuChamPrint";
import { parseCauHeader } from "../../lib/grade";
import { MOCK_QUESTIONS } from "./fixtures/phieu";
import type { Grade, SelectionAnnotation } from "../../types";

/** Collapse the teacher's đối-soát annotations into one note string per
 *  câu, for the printed slip. Mirrors the staging gate used at finalize:
 *  an annotation only counts when it has a non-empty comment AND isn't a
 *  comment AI disputed that the teacher chose not to apply (anti-poison).
 *  Multiple notes on the same câu are joined with " · " in line order. */
function teacherNotesByCau(
  annotations: SelectionAnnotation[] | undefined,
): Record<number, string> {
  const out: Record<number, string> = {};
  if (!annotations) return out;
  const accepted = annotations.filter(
    (a) =>
      a.comment.trim().length > 0 &&
      !(a.verdict === "dispute" && a.disputeDecision !== "apply"),
  );
  // Stable order: by câu, then by the line the highlight anchors to, so a
  // câu's notes read top-to-bottom the way the teacher wrote them.
  accepted
    .slice()
    .sort((x, y) => x.cau - y.cau || x.lineIdx - y.lineIdx)
    .forEach((a) => {
      const note = a.comment.trim();
      out[a.cau] = out[a.cau] ? `${out[a.cau]} · ${note}` : note;
    });
  return out;
}

// ---------------------------------------------------------------------------
// PrintablePhieu — the print-only formal grading slip, decoupled from any
// on-screen card.
//
// History: the phiếu used to live inside ResultCard (the old Step-4 "Xong"
// screen). When that screen was folded into Step 3, the slip + its print
// mechanism moved here so the "In phiếu chấm" toolbar button on the review
// surface can print without a dedicated screen. Pure side-DOM: renders a
// hidden ``.rc-print-only`` subtree + the @media print rule; nothing shows
// on screen. The matching window.print() helper is ``printPhieu`` in
// ./printPhieu.ts (kept separate so this file stays component-only).
// ---------------------------------------------------------------------------

/** Build the per-câu rows + scale for the printed slip from a live grade.
 *  teacherScore prefers the teacher's per-câu override (finalScores),
 *  falling back to AI's score. maxPoints comes straight from AI's
 *  q.max_points (teacher can't edit per-câu max). Falls back to the mock
 *  fixture when the grade has no scored per-câu data (legacy / salvaged). */
function buildPhieuRows(
  grade: Grade,
  teacherFinalScores: Record<number, number> | undefined,
  teacherAnnotations: SelectionAnnotation[] | undefined,
): { rows: PhieuChamPrintRow[]; maxTotal: number; overall: number } {
  const pqf = grade.per_question_feedback ?? [];
  const notes = teacherNotesByCau(teacherAnnotations);
  const hasReal = pqf.length > 0 && pqf.some((q) => typeof q.score === "number");
  const rows: PhieuChamPrintRow[] = hasReal
    ? pqf.map((q, i) => {
        const { num, prompt } = parseCauHeader(q.question ?? "", i + 1);
        const aiMax =
          typeof q.max_points === "number" && isFinite(q.max_points)
            ? q.max_points
            : 0;
        const aiScore =
          typeof q.score === "number" && isFinite(q.score) ? q.score : 0;
        const teacherScore = teacherFinalScores?.[num] ?? aiScore;
        return {
          num,
          label: `Câu ${num}`,
          prompt,
          maxPoints: aiMax,
          aiScore,
          teacherScore,
          goodPoints: q.good_points ?? "",
          improvements: q.errors ?? "",
          teacherNote: notes[num] ?? "",
        };
      })
    : MOCK_QUESTIONS;

  const maxTotal = rows.reduce((s, r) => s + r.maxPoints, 0) || 10;
  const overall = rows.reduce((s, r) => s + r.teacherScore, 0);
  return { rows, maxTotal, overall };
}

export function PrintablePhieu({
  grade,
  teacherFinalScores,
  teacherAnnotations,
  subjectLabel,
  finalizedAt,
}: {
  grade: Grade | null;
  teacherFinalScores?: Record<number, number>;
  /** Teacher's đối-soát notes — gathered onto the printed slip per câu,
   *  replacing the AI nhận xét for câu the teacher commented on. */
  teacherAnnotations?: SelectionAnnotation[];
  subjectLabel: string;
  finalizedAt?: string | null;
}) {
  if (!grade) return null;
  const { rows, maxTotal, overall } = buildPhieuRows(
    grade,
    teacherFinalScores,
    teacherAnnotations,
  );

  return (
    <>
      {/* Print contract: on screen ``.rc-print-only`` is display:none.
          In print, hide every node by visibility, then re-show only the
          phiếu subtree and float it to the page's top-left. Inactive tabs
          (display:none from App.tsx) never enter print flow, so only the
          active tab's slip renders. */}
      <style>{`
        .rc-print-only { display: none; }
        @media print {
          @page { size: A4; margin: 15mm; }
          html, body { background: #fff !important; }
          body * { visibility: hidden !important; }
          .rc-print-only,
          .rc-print-only * { visibility: visible !important; }
          .rc-print-only {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
          }
        }
      `}</style>
      <div className="rc-print-only">
        <PhieuChamPrint
          studentName=""
          studentClass=""
          studentRoll=""
          subjectLabel={subjectLabel}
          maxTotal={maxTotal}
          overall={overall}
          rows={rows}
          finalizedAt={finalizedAt}
        />
      </div>
    </>
  );
}
