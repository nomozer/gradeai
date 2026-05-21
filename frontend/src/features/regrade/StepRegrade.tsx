import { useCallback, useMemo, useState } from "react";
import { T } from "../../theme/tokens";
import { OriginalImageModal } from "../../components/ui/OriginalImageModal";
import {
  buildSyntheticAnnotations,
  parseCauHeader,
  splitTranscriptByCau,
} from "../../lib/grade";
import { i18n } from "../../i18n";
import type {
  EssayFile,
  Grade,
  SelectionAnnotation,
} from "../../types";
import { MOCK_REGRADE } from "./__mocks__/regrade.mock";
import type { RegradePayload, RegradeQuestion } from "./types";
import { PaperRegrade } from "./components/PaperRegrade";

// ---------------------------------------------------------------------------
// StepRegrade — Step 4 "Chốt điểm".
//
// Layout: single-column paper. Per-câu blocks list AI's annotations + a
// score editor row. The teacher's "đối soát" notes from step 3 are
// surfaced read-only above each câu's score row so prior judgment stays
// visible while the score is locked. No AI chat surface — the per-câu
// /api/analyze-comment loop was removed in favour of step 3 annotations
// feeding the HITL memory directly.
//
// Wired vs still-mock:
//   ✓ Per-câu rows come from grade.per_question_feedback.
//   ✓ Lines come from splitTranscriptByCau(grade.transcript).
//   ✓ Score edits propagate up via finalScores / maxOverrides props.
//   ✓ Teacher annotations come from workspace state (step 3 input).
//
// Annotations: Gemini doesn't emit line-level annotations yet, so we
// synthesise two badges per câu — green "good" pinned to line 1 and
// red "error" pinned to the last line.
// ---------------------------------------------------------------------------

// MOCK_REGRADE + RegradeQuestion type fixtures live in __mocks__/regrade.mock.ts
// so this file stays focused on layout and behavior.

/** Derive the regrade panel's `review` payload from a live grade. Falls
 *  through to MOCK_REGRADE when the grade has no scored per-câu data —
 *  preserves the UI for salvaged / legacy grades + dev runs without a
 *  real backend call. parseCauHeader + buildSyntheticAnnotations come
 *  from lib/grade so step 3 + step 5 share the same logic. */
function deriveReview(grade: Grade | null | undefined): RegradePayload {
  const pqf = grade?.per_question_feedback ?? [];
  const hasReal =
    pqf.length > 0 && pqf.some((q) => typeof q.score === "number");
  if (!hasReal) return MOCK_REGRADE;

  const linesByCau = splitTranscriptByCau(grade?.transcript ?? "");
  const questions: RegradeQuestion[] = pqf.map((q, i) => {
    const parsed = parseCauHeader(q.question ?? "", i + 1);
    const lines = linesByCau.get(parsed.num) ?? [];
    const maxPoints =
      typeof q.max_points === "number" && isFinite(q.max_points)
        ? q.max_points
        : undefined;
    const score =
      typeof q.score === "number" && isFinite(q.score) ? q.score : 0;
    return {
      num: parsed.num,
      label: `Câu ${parsed.num}`,
      prompt: parsed.prompt,
      maxPoints,
      aiScore: score,
      summary: q.good_points || q.errors || "",
      lines:
        lines.length > 0
          ? lines
          : [`Câu ${parsed.num}.`, "(không có nội dung trong transcript)"],
      annotations: buildSyntheticAnnotations(q, lines.length),
      chatSuggestions: [
        "Tại sao chấm điểm câu này như vậy?",
        "Đáp án đã đúng, không cần trừ.",
        "Có cần điều chỉnh lại không?",
      ],
    };
  });

  const totalMax = questions.reduce((s, q) => s + (q.maxPoints ?? 0), 0);
  return {
    aiOverall: typeof grade?.overall === "number" ? grade.overall : 0,
    maxTotal: totalMax > 0 ? totalMax : 10,
    questions,
  };
}

export interface StepRegradeProps {
  /** Back action — go to step 3 to re-read AI's review. */
  onPrev?: () => void;
  /** Forward action — moves to Step 5. HITL memory is saved atomically
   *  with the final grade from Step 5, not from this review screen. */
  onFinish?: () => void;
  /** Live grade payload from the agent pipeline. Used to derive per-câu
   *  rows (max_points, score, good_points, errors) + the student work
   *  lines via transcript splitting. Falls back to a built-in mock when
   *  the grade has no scored per-câu data (legacy / salvaged). */
  grade?: Grade | null;
  /** Original student bài làm (image or PDF). When present the "Xem PDF
   *  gốc" button opens a lightbox over the page. Optional so dev / mock
   *  renders without a real upload still work. */
  essayImage?: EssayFile | null;
  /** Teacher's per-câu score overrides. Lifted to the caller so step 5
   *  can read them on transition. Keyed by câu num. */
  finalScores: Record<number, number>;
  setFinalScores: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  /** Teacher's per-câu max overrides (only when đề didn't allocate
   *  points). Same lift rationale as finalScores. */
  maxOverrides: Record<number, number>;
  setMaxOverrides: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  /** Read-only mirror of teacher's step 3 Word-style annotations
   *  (highlight + comment anchored to a quote). Surfaced next to each
   *  câu's score input so the teacher can recall their independent
   *  judgment when finalizing. Step 5 saves them with the final grade. */
  teacherAnnotations?: SelectionAnnotation[];
}

export function StepRegrade({
  onPrev,
  onFinish,
  grade,
  essayImage,
  finalScores,
  setFinalScores,
  maxOverrides,
  setMaxOverrides,
  teacherAnnotations,
}: StepRegradeProps) {
  // Derive the review payload: real grade data when the pipeline produced
  // scored per-câu, else the legacy mock so the UI still renders for
  // dev-time visual review or salvaged grades.
  const review = useMemo(() => deriveReview(grade), [grade]);
  // OriginalImageModal toggle. Lifted here (instead of inside PaperRegrade)
  // so the modal renders at the StepRegrade root.
  const [showOriginal, setShowOriginal] = useState(false);
  // Per-câu expand/collapse state. Default: expand câu where AI lost points
  // OR has any "error" annotation — those are the ones the teacher actually
  // needs to look at. Câu that AI nailed start collapsed so the page scales
  // from 3 to 10+ câu without becoming a wall. Teacher can override either
  // direction; opening chat on a câu also forces it expanded (see openChat).
  const [expandedQs, setExpandedQs] = useState<Set<number>>(() => {
    const init = new Set<number>();
    for (const q of review.questions) {
      const hasError = q.annotations.some((a) => a.kind === "error");
      const lostPoints =
        q.maxPoints != null && q.aiScore < q.maxPoints - 0.001;
      if (hasError || lostPoints) init.add(q.num);
    }
    return init;
  });

  const toggleExpanded = (n: number) =>
    setExpandedQs((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  const expandAll = () =>
    setExpandedQs(new Set(review.questions.map((q) => q.num)));
  const collapseAll = () => setExpandedQs(new Set());
  const allExpanded = expandedQs.size === review.questions.length;

  // "Hoàn tất bài này" is now pure navigation. Saving HITL lessons in Step
  // 4 used to mark the AI's original grade as approved before the teacher
  // finalized score edits. Step 5 has the complete final grade, so it owns
  // the single atomic save to /api/finalize-grade.
  const handleFinish = useCallback(() => {
    onFinish?.();
  }, [onFinish]);

  // Resolve the cap for a câu: đề-specified first, teacher override
  // second, else undefined (free input).
  const effectiveMax = (q: RegradeQuestion): number | undefined =>
    q.maxPoints ?? maxOverrides[q.num];

  // Total = sum across all câu, falling back to AI score where teacher hasn't
  // touched yet. We always have a number here so the header always shows a
  // value; the "—" sentinel from the reference appears only when nothing is
  // set, but in our flow defaulting to AI matches the teacher's mental model.
  const teacherTotal = review.questions.reduce(
    (s, q) => s + (finalScores[q.num] ?? q.aiScore),
    0,
  );
  const anyEdited =
    Object.keys(finalScores).length > 0 || Object.keys(maxOverrides).length > 0;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <PaperRegrade
        review={review}
        finalScores={finalScores}
        setFinalScores={setFinalScores}
        maxOverrides={maxOverrides}
        setMaxOverrides={setMaxOverrides}
        effectiveMax={effectiveMax}
        teacherTotal={teacherTotal}
        anyEdited={anyEdited}
        expandedQs={expandedQs}
        toggleExpanded={toggleExpanded}
        expandAll={expandAll}
        collapseAll={collapseAll}
        allExpanded={allExpanded}
        essayImage={essayImage}
        onViewOriginal={() => setShowOriginal(true)}
        teacherAnnotations={teacherAnnotations}
      />

      {/* Bottom action bar — mirrors step 3's pattern: back / status /
          forward. Status text uses the live teacher total when anything
          has been edited, otherwise the "lessons sẽ lưu" disclaimer so
          the teacher knows what committing means. */}
      <div
        style={{
          marginTop: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={onPrev}
          disabled={!onPrev}
          style={{
            padding: "10px 18px",
            fontSize: 14,
            color: T.textSoft,
            background: T.bgCard,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            cursor: onPrev ? "pointer" : "not-allowed",
            transition: "color 0.15s, border-color 0.15s",
            fontWeight: 500,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            opacity: onPrev ? 1 : 0.5,
          }}
          onMouseEnter={(e) => {
            if (!onPrev) return;
            e.currentTarget.style.color = T.text;
            e.currentTarget.style.borderColor = T.textMute;
          }}
          onMouseLeave={(e) => {
            if (!onPrev) return;
            e.currentTarget.style.color = T.textSoft;
            e.currentTarget.style.borderColor = T.border;
          }}
        >
          ← Xem lại bản chấm
        </button>
        <div
          style={{
            fontSize: 13,
            color: T.textMute,
            textAlign: "center",
            flex: "1 1 200px",
            minWidth: 0,
          }}
        >
          {anyEdited ? (
            <>
              Điểm cuối:{" "}
              <span
                style={{
                  fontFamily: T.mono,
                  fontWeight: 700,
                  color: T.text,
                }}
              >
                {teacherTotal.toFixed(1)}
              </span>
              <span style={{ color: T.textFaint }}>
                {" "}
                / {review.maxTotal.toFixed(1)}đ
              </span>
              <span style={{ color: T.textFaint }}> · </span>
              Mỗi thay đổi sẽ lưu khi bạn xác nhận điểm.
            </>
          ) : (
            "Nhận xét và điểm sẽ lưu khi bạn xác nhận điểm ở bước cuối."
          )}
        </div>
        <button
          type="button"
          onClick={handleFinish}
          disabled={!onFinish}
          style={{
            padding: "12px 22px",
            fontSize: 14,
            color: "#fff",
            background: T.red,
            border: "none",
            borderRadius: 10,
            cursor: !onFinish ? "not-allowed" : "pointer",
            transition: "all 0.2s",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontWeight: 600,
            boxShadow: T.shadowSoft,
            opacity: !onFinish ? 0.5 : 1,
            whiteSpace: "nowrap",
          }}
          title="Sang bước Hoàn thành. Nhận xét HITL sẽ lưu khi bạn xác nhận điểm."
        >
          Hoàn tất bài này
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
        </button>
      </div>

      <OriginalImageModal
        open={showOriginal}
        essayImage={essayImage ?? null}
        onClose={() => setShowOriginal(false)}
        t={i18n.vi}
      />
    </div>
  );
}

// PaperRegrade, RegradeQuestionBlock and the header controls
// (ViewOriginalButton / Chevron / HeaderScoreChip / ExpandAllToggle)
// live in components/.
