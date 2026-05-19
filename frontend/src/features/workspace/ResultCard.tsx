import { useState } from "react";
import { T } from "../../theme/tokens";
import { Icon } from "../../components/ui/Icon";
import { parseCauHeader } from "../../lib/grade";
import { PhieuChamPrint } from "./PhieuChamPrint";
import type {
  FinalizedResult,
  Grade,
  I18nStrings,
  RubricScores,
} from "../../types";

// ---------------------------------------------------------------------------
// Step 5 — Hoàn thành / phiếu chấm
//
// Single-card "paper-print" layout per the locked mockup (image 1):
//   • Hero: GIANT italic red final score | name + class | AI ban đầu right
//   • Hairline divider
//   • Per-câu rows (compact): label · prompt · teacher-score/cap · delta
//   • Bottom action bar OUTSIDE the card: ← Sửa lại · In phiếu chấm · Lưu
//
// Intentionally NOT here:
//   • Lessons preview panel — teacher already sees lesson activity in
//     bộ nhớ HITL; cramming it onto step 5 made the page feel busy and
//     duplicated info that's already a click away in the sidebar.
//   • Per-câu expand → PHẦN LÀM TỐT / CẦN CẢI THIỆN. That content
//     lives in step 3 (inline annotations) and step 4 (chat). Step 5
//     is the at-a-glance "phiếu chấm" — print-friendly summary.
//
// Backend wiring: ``onFinalize`` / ``isFinalizing`` / ``finalizeError`` /
// ``finalized`` drive persistence. Per-câu rows come from
// ``grade.per_question_feedback`` (max_points + score emitted by the
// Gemini grader since the schema bump in prompts/base.py Rule 6+7) and
// fall back to MOCK_QUESTIONS for legacy / salvaged grades. Student
// identity is still mocked — no upload-form field for name/class yet.
// ---------------------------------------------------------------------------

// MOCK student identity — used because the app has no UI flow for the
// teacher to enter student name / class / STT yet. When the upload step
// gains those fields, swap this for props passed down from the workspace.
// TODO: wire real student info from upload form.
const MOCK_STUDENT = {
  name: "Trần Minh Khôi",
  classRoom: "Lớp 10A1",
  roll: "STT 14",
};

// MOCK per-câu rows — only used as a fallback when the grade payload
// has no per_question_feedback with scores (legacy grade or salvaged).
// Once every grade carries real max_points + score, this mock can be
// deleted.
const MOCK_QUESTIONS = [
  {
    num: 1,
    label: "Câu 1",
    prompt: "Giải phương trình x² − 5x + 6 = 0",
    maxPoints: 3.0,
    aiScore: 3.0,
    teacherScore: 3.0,
    goodPoints:
      "Tính Δ chính xác, viết đầy đủ công thức nghiệm, kết luận rõ ràng.",
    improvements: "",
  },
  {
    num: 2,
    label: "Câu 2",
    prompt:
      "Tìm m để phương trình x² − 2(m+1)x + m² − 3 = 0 có hai nghiệm phân biệt.",
    maxPoints: 4.0,
    aiScore: 3.0,
    teacherScore: 3.0,
    goodPoints:
      "Biến đổi Δ' chính xác, dẫn được bất phương trình 2m + 4 > 0.",
    improvements:
      "Cần khẳng định a = 1 ≠ 0 (pt bậc hai) ở đầu bài. Kết luận miền m phải nêu rõ trong câu trả lời cuối.",
  },
  {
    num: 3,
    label: "Câu 3",
    prompt: "Cho phương trình x² + bx + c = 0 có hai nghiệm là 2 và −5. Tìm b, c.",
    maxPoints: 3.0,
    aiScore: 2.5,
    teacherScore: 2.5,
    goodPoints: "Áp dụng Vi-ét hợp lý, tính b và c đều chính xác.",
    improvements:
      "Thiếu kiểm tra điều kiện Δ ≥ 0 trước khi áp dụng Vi-ét.",
  },
];

/** Thin label-adapter on top of the shared parseCauHeader — keeps the
 *  row layout's "label" string concern colocated with the row code. */
function parseQuestionField(
  raw: string,
  fallbackNum: number,
): { num: number; label: string; prompt: string } {
  const { num, prompt } = parseCauHeader(raw, fallbackNum);
  return { num, label: `Câu ${num}`, prompt };
}

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

// Per-câu expanded-body block. One component, two tones — the colour pair
// + leading icon is the entire "phần làm tốt vs cần cải thiện" semantic.
// The visually hidden `srLabel` (sr-only via clip-path) keeps screen
// reader users hearing "Phần làm tốt:" before the body text, even though
// nothing is rendered for sighted users.
function FeedbackBlock({
  tone,
  srLabel,
  text,
  marginBottom = 0,
}: {
  tone: "good" | "improve";
  srLabel: string;
  text: string;
  marginBottom?: number;
}) {
  const palette =
    tone === "good"
      ? { bg: T.greenSoft, bar: T.green, icon: <Icon.Check size={12} color={T.green} /> }
      : { bg: T.amberSoft, bar: T.amber, icon: <Icon.Edit size={12} color={T.amber} /> };
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "8px 14px 8px 14px",
        background: palette.bg,
        borderLeft: `3px solid ${palette.bar}`,
        borderRadius: "0 6px 6px 0",
        marginBottom,
        fontSize: 15,
        color: T.textSoft,
        lineHeight: 1.55,
        alignItems: "flex-start",
      }}
    >
      {/* Icon kept on its own line-box so multi-line body text wraps cleanly
          beside it instead of pulling the icon down to the second line. */}
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          flexShrink: 0,
          height: "1.55em",
        }}
      >
        {palette.icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        {/* sr-only label — invisible to sighted users, announced by screen
            readers. Keeps the semantic without the visual pill. */}
        <span
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0,0,0,0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          {srLabel}:
        </span>
        {text}
      </span>
    </div>
  );
}

function ScoreChip({
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
      }}
    >
      {score.toFixed(1)}
      <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.75 }}>
        /{max ? max.toFixed(1) : "—"}
      </span>
    </span>
  );
}

// LearningBanner — post-finalize confirmation that the HITL feedback
// loop landed. Shows the teacher the two signals AI just absorbed:
//   • Comment annotations from step 3 → lessons at score 3.5.
//   • Score-delta lesson from this finalize → score 4.0 (only when the
//     teacher's adjustments crossed the per-câu/rubric threshold).
//
// Counts of per-câu / rubric / overall deltas come from the backend's
// ``deltas`` map — keys "cau:N" (per-câu), "content"/"argument"/...
// (rubric), and "overall". We split them so the message reflects the
// dimension the teacher actually edited.
function LearningBanner({
  commentsSaved,
  commentsSkipped,
  deltaLessonId,
  deltas,
}: {
  commentsSaved: number;
  commentsSkipped: number;
  deltaLessonId: number | null;
  deltas: Record<string, number>;
}) {
  const cauKeys = Object.keys(deltas).filter((k) => k.startsWith("cau:"));
  const rubricKeys = Object.keys(deltas).filter(
    (k) => !k.startsWith("cau:") && k !== "overall",
  );
  return (
    <div
      className="rc-no-print"
      style={{
        marginBottom: 14,
        padding: "12px 16px",
        background: T.greenSoft,
        borderLeft: `4px solid ${T.green}`,
        borderRadius: 8,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <Icon.Lightbulb size={14} color={T.green} />
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: T.green,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          AI đã học từ bài này
        </span>
      </div>
      <ul
        style={{
          margin: 0,
          paddingLeft: 18,
          fontSize: 15,
          color: T.text,
          lineHeight: 1.6,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {commentsSaved > 0 && (
          <li>
            <strong>{commentsSaved}</strong> nhận xét → bộ nhớ HITL{" "}
            <span style={{ color: T.textMute, fontFamily: T.mono }}>
              (điểm tham chiếu 3.5)
            </span>
          </li>
        )}
        {commentsSkipped > 0 && (
          <li style={{ color: T.textSoft }}>
            <strong>{commentsSkipped}</strong> nhận xét bị AI phản biện —
            đã bỏ qua để tránh nhiễu bộ nhớ.
          </li>
        )}
        {deltaLessonId != null && (
          <li>
            Điều chỉnh điểm
            {cauKeys.length > 0 && (
              <>
                {" "}
                <strong>{cauKeys.length} câu</strong>
              </>
            )}
            {rubricKeys.length > 0 && (
              <>
                {cauKeys.length > 0 ? " + " : " "}
                <strong>{rubricKeys.length} tiêu chí</strong>
              </>
            )}{" "}
            → delta lesson #{deltaLessonId}{" "}
            <span style={{ color: T.textMute, fontFamily: T.mono }}>
              (điểm tham chiếu 4.0)
            </span>
          </li>
        )}
        {deltaLessonId == null && commentsSaved > 0 && (
          <li style={{ color: T.textSoft, fontSize: 12.5 }}>
            Điểm bạn chốt khớp với AI — không tạo delta lesson.
          </li>
        )}
      </ul>
    </div>
  );
}

export interface ResultCardProps {
  grade: Grade | null;
  t: I18nStrings;
  finalized: FinalizedResult | null;
  onFinalize: (payload: { scores: RubricScores; overall: number | string }) => void | Promise<void>;
  /** "← Sửa lại" — caller should clear finalized state AND navigate the
   *  workspace back to step 4 (Chấm lại) so the teacher can re-edit. */
  onEdit?: () => void;
  isFinalizing?: boolean;
  finalizeError?: string | null;
  /** Human-readable subject label shown on the printed phiếu chấm
   *  (e.g. "Toán · Lớp 10"). Empty string renders a blank line. */
  subjectLabel?: string;
  /** Teacher per-câu score overrides from step 4. When provided,
   *  ResultCard uses these as `teacherScore` per row (instead of
   *  defaulting to AI's score). Drives the "AI ban đầu" hero column
   *  visibility — if any câu was overridden, the comparison shows. */
  teacherFinalScores?: Record<number, number>;
  /** Teacher per-câu max overrides from step 4 (for câu where the đề
   *  didn't pre-allocate points). Falls back to grade.max_points. */
  teacherMaxOverrides?: Record<number, number>;
}

export function ResultCard({
  grade,
  t,
  finalized,
  onFinalize,
  onEdit,
  isFinalizing = false,
  finalizeError = null,
  subjectLabel = "",
  teacherFinalScores,
  teacherMaxOverrides,
}: ResultCardProps) {
  const locked = !!finalized;

  // Step 4 is the single source of truth for rubric scores. We pass
  // them straight through to /api/finalize-grade — no editing here.
  const scores: RubricScores = {
    content: grade?.scores?.content ?? "",
    argument: grade?.scores?.argument ?? "",
    expression: grade?.scores?.expression ?? "",
    creativity: grade?.scores?.creativity ?? "",
  };
  const overall: number | string = grade?.overall ?? "";

  // Salvage state — warn before committing partial/unparseable AI output.
  const weaknessList = Array.isArray(grade?.weaknesses) ? grade!.weaknesses : [];
  const isSalvaged =
    Boolean(grade?.salvaged) ||
    weaknessList.some(
      (w) =>
        typeof w === "string" &&
        (w.toLowerCase().includes("unparseable") || w.includes("bị cắt")),
    );

  // Per-câu rows — derived from grade.per_question_feedback now that the
  // backend prompt emits max_points + score per question. Fallback to
  // MOCK_QUESTIONS when the grade has no scored per-câu data (legacy
  // payload, or salvaged response where Gemini cut off before emitting
  // the per-câu block). The row shape (num, label, prompt, aiScore,
  // teacherScore, maxPoints, goodPoints, improvements) is the only
  // contract the JSX below relies on.
  //
  // teacherScore: prefer the per-câu override the teacher set in step 4
  // (passed in via teacherFinalScores). Falls back to aiScore so a
  // câu the teacher didn't touch reads as "no delta". Same fallback
  // chain for maxPoints via teacherMaxOverrides — used only when the đề
  // didn't pre-allocate points and the teacher had to set the cap by
  // hand in step 4.
  const pqf = grade?.per_question_feedback ?? [];
  const hasRealRows =
    pqf.length > 0 && pqf.some((q) => typeof q.score === "number");
  const rows = hasRealRows
    ? pqf.map((q, i) => {
        const parsed = parseQuestionField(q.question ?? "", i + 1);
        const aiMax =
          typeof q.max_points === "number" && isFinite(q.max_points)
            ? q.max_points
            : 0;
        const maxPoints =
          teacherMaxOverrides?.[parsed.num] ?? (aiMax > 0 ? aiMax : 0);
        const aiScore =
          typeof q.score === "number" && isFinite(q.score) ? q.score : 0;
        const teacherScore = teacherFinalScores?.[parsed.num] ?? aiScore;
        return {
          num: parsed.num,
          label: parsed.label,
          prompt: parsed.prompt,
          maxPoints,
          aiScore,
          teacherScore,
          goodPoints: q.good_points ?? "",
          improvements: q.errors ?? "",
        };
      })
    : MOCK_QUESTIONS;

  // Per-câu expand state. Default: ALL collapsed — the rows table is the
  // at-a-glance summary; click a row to reveal its PHẦN LÀM TỐT / CẦN
  // CẢI THIỆN. Print rule (@media print) forces all open so the printout
  // is the complete phiếu chấm regardless of which rows are expanded
  // on screen.
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const toggleRow = (n: number) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  const sumTeacher = rows.reduce((s, r) => s + r.teacherScore, 0);
  const sumAI = rows.reduce((s, r) => s + r.aiScore, 0);
  const displayOverall = locked && finalized ? finalized.overall : sumTeacher;
  const aiOriginalOverall = sumAI;
  // Total scale = sum of per-câu max_points. Guard against the all-zero
  // case (legacy grade or fully-salvaged) so we never divide by or
  // display "/ 0.0" — fall back to the canonical 10-scale.
  const maxTotal =
    rows.reduce((s, r) => s + r.maxPoints, 0) || 10.0;
  const totalDelta =
    typeof displayOverall === "number" ? displayOverall - aiOriginalOverall : 0;
  const anyEdited = Math.abs(totalDelta) > 0.001;

  const handleFinalize = () => {
    if (onFinalize && !isFinalizing) {
      // Send the teacher's per-câu sum as the final overall — that's what
      // the hero is showing the teacher right now. The previous version
      // sent ``grade.overall`` (AI's rubric-derived overall), which meant
      // step 4 edits were silently discarded: hero showed 8.0 (teacher's
      // sum after edit), but POST /api/finalize-grade persisted 8.5 (AI's
      // overall), so the locked-state hero snapped BACK to 8.5 after
      // save. Rubric scores stay at AI's values since the current flow
      // has no rubric editor — fine as long as overall reflects the
      // teacher's actual decision.
      const teacherOverall =
        typeof displayOverall === "number" ? displayOverall : overall;
      onFinalize({ scores, overall: teacherOverall });
    }
  };
  const handlePrint = () => {
    if (typeof window === "undefined") return;
    // Swap document.title for the duration of the print job so the
    // browser-rendered header (when the user keeps "Headers and footers"
    // checked in the print dialog) shows something useful — e.g.
    // "Phiếu chấm — Trần Minh Khôi — Toán · Lớp 10" — instead of the app
    // chrome title "MIRROR — A Reader's Grading Desk". URL and page
    // number are still browser-controlled; teachers wanting a fully
    // clean print should uncheck the option.
    const original = document.title;
    const parts = ["Phiếu chấm", MOCK_STUDENT.name, subjectLabel].filter(
      Boolean,
    );
    document.title = parts.join(" — ");
    // ``afterprint`` fires once the dialog closes (print OR cancel) in
    // every Chromium/Firefox/Safari we target — safer than a setTimeout.
    const restore = () => {
      document.title = original;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  const formatFinalizedAt = (iso: string | null | undefined) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  };

  if (!grade) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          color: T.textFaint,
          fontSize: 17,
        }}
      >
        {String(t.noResult ?? "")}
      </div>
    );
  }

  return (
    <>
      {/* Print stylesheet — kept inline so the rule doesn't leak.
          Two-mode contract:
            • SCREEN  → .rc-screen-only visible, .rc-print-only hidden.
            • PRINT   → swap: hide the on-screen card entirely, show the
                        formal phiếu chấm (Times serif, signature blocks).
          The print and screen layouts are intentionally separate
          components — see PhieuChamPrint.tsx for the rationale. */}
      <style>{`
        /* Row body — visibility driven by data-expanded so React can
           render once and CSS handles toggle + print-force. */
        .rc-row-body[data-expanded="false"] { display: none; }
        .rc-print-only { display: none; }
        /* Kill the black browser focus outline on row buttons (it was
           ugly when a user clicked to expand) but preserve keyboard
           a11y via :focus-visible — keyboard users still get a subtle
           accent ring (T.accent), mouse users get nothing. */
        .rc-row-button { outline: none; }
        .rc-row-button:focus-visible {
          outline: 2px solid #3B4F8A;
          outline-offset: -2px;
        }
        @media print {
          @page { size: A4; margin: 15mm; }
          html, body { background: #fff !important; }
          /* Hide the on-screen card entirely. */
          .rc-screen-only { display: none !important; }
          /* Hide every other DOM node on the page (sidebar, header,
             tab bar, step indicator, …) by stripping visibility. We
             keep layout intact (visibility, not display) and then
             re-show ONLY the print-only subtree below. */
          body * { visibility: hidden !important; }
          .rc-print-only,
          .rc-print-only * { visibility: visible !important; }
          /* Float the phiếu over whatever invisible chrome remains
             so it starts at page top-left, full width. */
          .rc-print-only {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
          }
        }
      `}</style>

      {/* ── PRINT-ONLY: formal phiếu chấm ───────────────────────────── */}
      <div className="rc-print-only">
        <PhieuChamPrint
          studentName={MOCK_STUDENT.name}
          studentClass={MOCK_STUDENT.classRoom}
          studentRoll={MOCK_STUDENT.roll}
          subjectLabel={subjectLabel}
          maxTotal={maxTotal}
          overall={displayOverall}
          rows={rows}
          finalizedAt={finalized?.finalizedAt}
        />
      </div>

      <div
        className="rc-print-root rc-screen-only"
        style={{
          maxWidth: 1080,
          margin: "0 auto",
        }}
      >
        {/* Status pill — only shown for the *informative* states: "đã lưu"
            (locked) and "đang lưu" (in-flight). The ready-to-save state is
            implicit; the bottom "Lưu & sang bài kế" button is the
            affordance, the pill was just visual noise above the hero. */}
        {(locked || isFinalizing) && (
          <div
            className="rc-no-print"
            style={{ textAlign: "center", marginBottom: 14 }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontFamily: T.mono,
                color: locked ? T.green : T.accent,
                padding: "5px 14px",
                background: locked ? T.greenSoft : T.accentSoft,
                borderRadius: 999,
                border: `1px solid ${locked ? T.green : T.accent}`,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              {locked ? (
                <>
                  <Icon.Check size={12} color={T.green} />
                  {String(t.done ?? "Đã hoàn thành")}
                  {finalized?.finalizedAt && (
                    <span
                      style={{
                        color: T.textFaint,
                        fontWeight: 400,
                        marginLeft: 6,
                        textTransform: "none",
                        letterSpacing: 0,
                      }}
                    >
                      · {formatFinalizedAt(finalized.finalizedAt)}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <Icon.RefreshCw size={12} color={T.accent} />
                  {String(t.finalizeSaving ?? "Đang lưu điểm…")}
                </>
              )}
            </span>
          </div>
        )}

        {/* "AI đã học" — confirmation banner after finalize. Closes the
            HITL feedback loop visually: shows the teacher exactly which
            of their actions in this run were captured as lessons (comment
            annotations from step 3, score deltas from step 5). Only
            renders when locked AND at least one learning signal landed. */}
        {locked && finalized && (
          ((finalized.commentsSavedCount ?? 0) > 0) ||
          ((finalized.commentsSkippedCount ?? 0) > 0) ||
          finalized.deltaLessonId != null
        ) && (
          <LearningBanner
            commentsSaved={finalized.commentsSavedCount ?? 0}
            commentsSkipped={finalized.commentsSkippedCount ?? 0}
            deltaLessonId={finalized.deltaLessonId ?? null}
            deltas={finalized.deltas ?? {}}
          />
        )}

        {/* Salvage warning */}
        {!locked && isSalvaged && (
          <div
            className="rc-no-print"
            style={{
              padding: "12px 16px",
              marginBottom: 14,
              background: T.amberSoft,
              borderLeft: `4px solid ${T.amber}`,
              borderRadius: 8,
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              fontSize: 14,
              color: T.textSoft,
              lineHeight: 1.55,
            }}
          >
            <Icon.AlertTriangle
              size={14}
              color={T.amber}
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <div>
              <div style={{ fontWeight: 700, color: T.amber, marginBottom: 3 }}>
                {String(t.salvagedFinalizeTitle ?? "Điểm AI không đáng tin")}
              </div>
              {String(
                t.salvagedFinalizeBody ??
                  "AI không hoàn tất chấm — hãy quay lại bước Chấm lại để tự nhập điểm trước khi xác nhận.",
              )}
            </div>
          </div>
        )}

        {/* ── MAIN CARD: hero + per-câu rows ────────────────────────── */}
        <div
          style={{
            background: T.bgCard,
            border: `1px solid ${T.border}`,
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: T.shadowSoft,
            marginBottom: 18,
          }}
        >
          {/* Hero — the right "AI ban đầu" column only appears when the
              teacher actually overrode AI's scores. Without an override
              the column was redundant (AI = teacher) and made the hero
              feel cluttered. Grid template adapts so the centre block
              naturally re-flows when the right column collapses. */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: anyEdited ? "auto 1fr auto" : "auto 1fr",
              gap: 28,
              alignItems: "center",
              padding: "24px 32px",
              borderBottom: `1px solid ${T.borderLight}`,
            }}
          >
            <div
              style={{
                fontFamily: T.display,
                fontStyle: "italic",
                fontWeight: 600,
                fontSize: 72,
                lineHeight: 0.95,
                color: T.red,
                letterSpacing: "-0.02em",
                fontVariantNumeric: "tabular-nums",
                opacity: isFinalizing ? 0.5 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {displayOverall === "" || displayOverall == null
                ? "—"
                : typeof displayOverall === "number"
                  ? displayOverall.toFixed(1)
                  : displayOverall}
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: T.textFaint,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Điểm cuối · {maxTotal.toFixed(1)} tối đa
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: T.text,
                  letterSpacing: "-0.005em",
                  marginBottom: 2,
                }}
              >
                {MOCK_STUDENT.name}
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: T.mono,
                  color: T.textMute,
                }}
              >
                {MOCK_STUDENT.classRoom} · {MOCK_STUDENT.roll}
              </div>
            </div>

            {anyEdited && (
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: T.textFaint,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  AI ban đầu
                </div>
                <div
                  style={{
                    fontFamily: T.mono,
                    fontSize: 20,
                    fontWeight: 600,
                    color: T.textSoft,
                    lineHeight: 1.1,
                  }}
                >
                  {aiOriginalOverall.toFixed(1)}
                  <span
                    style={{
                      fontSize: 13,
                      color: T.textFaint,
                      fontWeight: 400,
                    }}
                  >
                    {" "}
                    / {maxTotal.toFixed(1)}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: T.mono,
                    fontSize: 12,
                    fontWeight: 600,
                    color: totalDelta > 0 ? T.green : T.red,
                  }}
                >
                  Bạn đã điều chỉnh {totalDelta > 0 ? "+" : ""}
                  {totalDelta.toFixed(1)}đ
                </div>
              </div>
            )}
          </div>

          {/* Per-câu rows — compact summary, click to reveal nhận xét.
              Chevron is the affordance (rotates 90° on expand). Each
              row's expanded body sits inside the same border-bounded
              section so the divider between rows still reads.

              Score chip is colour-coded by % of max so the teacher can
              scan the whole column and instantly tell which câu look
              healthy (green) vs need a closer read (amber/red), without
              doing the percentage in their head from "1.5/3.0". */}
          <div>
            {rows.map((r, i) => {
              const delta = r.teacherScore - r.aiScore;
              const hasDelta = Math.abs(delta) > 0.001;
              const expanded = expandedRows.has(r.num);
              const hasBody = !!(r.goodPoints || r.improvements);
              // Collapsed-row preview: a one-line peek so the teacher can
              // decide whether to expand without clicking. Improvements
              // take priority because that is where the disagreement lives;
              // when there are none we summarise the câu as "đúng hoàn
              // toàn" so a green-only câu reads as a positive confirmation
              // rather than blank space.
              let summary = "";
              if (r.improvements) {
                summary = r.improvements.replace(/\s+/g, " ").trim();
              } else if (r.goodPoints) {
                summary = "Đúng hoàn toàn";
              }
              return (
                <div
                  key={r.num}
                  style={{
                    borderBottom:
                      i === rows.length - 1
                        ? "none"
                        : `1px solid ${T.borderLight}`,
                  }}
                >
                  <div
                    className={hasBody ? "rc-row-button" : undefined}
                    role={hasBody ? "button" : undefined}
                    aria-expanded={hasBody ? expanded : undefined}
                    tabIndex={hasBody ? 0 : undefined}
                    onClick={hasBody ? () => toggleRow(r.num) : undefined}
                    onKeyDown={
                      hasBody
                        ? (e) => {
                            if (
                              (e.key === "Enter" || e.key === " ") &&
                              e.target === e.currentTarget
                            ) {
                              e.preventDefault();
                              toggleRow(r.num);
                            }
                          }
                        : undefined
                    }
                    style={{
                      display: "grid",
                      // Drop the trailing delta column entirely when delta=0;
                      // the previous "—" placeholder was visual noise and
                      // stole horizontal room from the prompt.
                      gridTemplateColumns: hasDelta
                        ? "16px 70px minmax(0, 1fr) auto 50px"
                        : "16px 70px minmax(0, 1fr) auto",
                      gap: 14,
                      alignItems: "center",
                      padding: "12px 32px",
                      cursor: hasBody ? "pointer" : "default",
                      userSelect: "none",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      if (hasBody)
                        e.currentTarget.style.background = T.bgElevated;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {hasBody ? (
                      <span
                        aria-hidden="true"
                        style={{
                          color: T.textFaint,
                          transform: `rotate(${expanded ? 90 : 0}deg)`,
                          transition: "transform 0.15s",
                          display: "inline-flex",
                          alignSelf: "center",
                          justifySelf: "center",
                        }}
                      >
                        <svg
                          width={10}
                          height={10}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </span>
                    ) : (
                      <span aria-hidden="true" />
                    )}
                    <span
                      style={{
                        fontFamily: T.mono,
                        fontSize: 12,
                        color: T.textMute,
                        letterSpacing: "0.04em",
                        alignSelf: "center",
                      }}
                    >
                      {r.label}
                    </span>
                    {/* Prompt + collapsed-only summary preview. Wrapped in
                        a vertical flex so the preview sits directly below
                        the prompt; expanded state hides the preview to
                        avoid duplicating the body content shown below. */}
                    <div style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: 14,
                          color: T.textSoft,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          lineHeight: 1.45,
                        }}
                        title={r.prompt}
                      >
                        {r.prompt}
                      </span>
                      {!expanded && summary && (
                        <span
                          style={{
                            display: "block",
                            marginTop: 2,
                            fontSize: 12,
                            color: r.improvements ? T.amber : T.green,
                            fontStyle: "italic",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            lineHeight: 1.4,
                          }}
                          title={summary}
                        >
                          {r.improvements ? "▸ " : "✓ "}
                          {summary}
                        </span>
                      )}
                    </div>
                    <ScoreChip score={r.teacherScore} max={r.maxPoints} />
                    {hasDelta && (
                      <span
                        style={{
                          fontFamily: T.mono,
                          fontSize: 12,
                          fontWeight: 600,
                          color: delta > 0 ? T.green : T.red,
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {delta > 0 ? "+" : ""}
                        {delta.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {hasBody && (
                    // Body is always rendered; CSS controls visibility.
                    // @media print forces .rc-row-body open regardless of
                    // expanded state, so the printout includes all nhận
                    // xét without the teacher having to expand each row.
                    //
                    // Visual hierarchy: the left-coloured bar + leading
                    // icon already carry "tốt vs cải thiện" semantics, so
                    // the old uppercase pill labels ("PHẦN LÀM TỐT" / "CẦN
                    // CẢI THIỆN") were doing redundant work and eating
                    // horizontal room from the actual content. Dropped in
                    // favour of an icon + screen-reader-only label so a11y
                    // is preserved without the visual noise.
                    <div
                      className="rc-row-body"
                      data-expanded={expanded ? "true" : "false"}
                      style={{
                        padding: "0 32px 12px 62px",
                      }}
                    >
                      {r.goodPoints && (
                        <FeedbackBlock
                          tone="good"
                          srLabel={String(t.goodPoints ?? "Phần làm tốt")}
                          text={r.goodPoints}
                          marginBottom={r.improvements ? 6 : 0}
                        />
                      )}
                      {r.improvements && (
                        <FeedbackBlock
                          tone="improve"
                          srLabel={String(t.errors ?? "Cần cải thiện")}
                          text={r.improvements}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Finalize error banner */}
        {!locked && finalizeError && (
          <div
            className="rc-no-print"
            style={{
              maxWidth: 520,
              margin: "0 auto 14px",
              padding: "12px 14px",
              background: T.redSoft,
              border: `1px solid ${T.red}`,
              borderRadius: 10,
              fontSize: 14,
              color: T.red,
              lineHeight: 1.55,
              textAlign: "center",
            }}
          >
            <Icon.AlertTriangle
              size={13}
              color={T.red}
              style={{ marginRight: 6, verticalAlign: "middle" }}
            />
            {finalizeError ||
              String(
                t.finalizeSaveError ??
                  "Không thể lưu điểm cuối cùng. Vui lòng thử lại.",
              )}
          </div>
        )}

        {/* ── BOTTOM ACTION BAR (outside card) ──────────────────────── */}
        <div
          className="rc-no-print"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={onEdit}
            disabled={!onEdit || isFinalizing}
            style={{
              padding: "10px 18px",
              fontSize: 14,
              color: T.textSoft,
              background: T.bgCard,
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              cursor: !onEdit || isFinalizing ? "not-allowed" : "pointer",
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              opacity: !onEdit || isFinalizing ? 0.5 : 1,
              transition: "color 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!onEdit || isFinalizing) return;
              e.currentTarget.style.color = T.text;
              e.currentTarget.style.borderColor = T.textMute;
            }}
            onMouseLeave={(e) => {
              if (!onEdit || isFinalizing) return;
              e.currentTarget.style.color = T.textSoft;
              e.currentTarget.style.borderColor = T.border;
            }}
          >
            ← Sửa lại
          </button>

          <div style={{ display: "inline-flex", gap: 10 }}>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                padding: "10px 18px",
                fontSize: 14,
                color: T.textSoft,
                background: T.bgCard,
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                cursor: "pointer",
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                transition: "color 0.15s, border-color 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = T.text;
                e.currentTarget.style.borderColor = T.textMute;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = T.textSoft;
                e.currentTarget.style.borderColor = T.border;
              }}
              title="In phiếu chấm — xuất bản giấy với chữ ký và điểm bằng chữ."
            >
              <svg
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 9V4h12v5" />
                <rect x={6} y={14} width={12} height={7} />
                <path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
              </svg>
              In phiếu chấm
            </button>

            {locked ? (
              <span
                style={{
                  padding: "10px 22px",
                  fontSize: 14,
                  color: T.green,
                  background: T.greenSoft,
                  border: `1px solid ${T.green}`,
                  borderRadius: 10,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Icon.Check size={14} color={T.green} />
                Đã lưu
              </span>
            ) : (
              <button
                type="button"
                onClick={handleFinalize}
                disabled={isFinalizing}
                style={{
                  padding: "12px 22px",
                  fontSize: 14,
                  color: "#fff",
                  background: isFinalizing ? T.bgElevated : T.red,
                  border: "none",
                  borderRadius: 10,
                  cursor: isFinalizing ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  boxShadow: isFinalizing ? "none" : T.shadowSoft,
                  whiteSpace: "nowrap",
                  transition: "all 0.2s",
                }}
              >
                {isFinalizing ? (
                  <>
                    <Icon.RefreshCw size={14} color={T.textFaint} />
                    {String(t.finalizeSaving ?? "Đang lưu…")}
                  </>
                ) : (
                  <>
                    Lưu &amp; sang bài kế
                    <svg
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
