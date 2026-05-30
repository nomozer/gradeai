import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OriginalImageModal } from "../../components/ui/OriginalImageModal";
import { ActionBar, GhostButton, PrimaryButton } from "../../components/ui/ActionBar";
import { Icon } from "../../components/ui/Icon";
import {
  buildSyntheticAnnotations,
  parseCauHeader,
  splitTranscriptByCau,
} from "../../lib/grade";
import { i18n } from "../../i18n";
import type {
  EssayFile,
  Grade,
  GradeConfidence,
  SelectionAnnotation,
} from "../../types";
import { MOCK_REGRADE } from "./__mocks__/regrade.mock";
import type { RegradePayload, RegradeQuestion } from "./types";
import { PaperRegrade } from "./components/PaperRegrade";
import { ScoreInline } from "../workspace/components/ScoreBottomBar";

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

function defaultExpandedQuestions(questions: RegradeQuestion[]): Set<number> {
  const init = new Set<number>();
  for (const q of questions) {
    const hasError = q.annotations.some((a) => a.kind === "error");
    const lostPoints = q.maxPoints != null && q.aiScore < q.maxPoints - 0.001;
    if (hasError || lostPoints) init.add(q.num);
  }
  return init;
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
  subject?: any;
  /** Server-inferred grade confidence — surfaced as a small chip in the
   *  unified sticky ActionBar. */
  confidence?: GradeConfidence | null;
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
  subject,
  confidence,
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
    return defaultExpandedQuestions(review.questions);
  });
  const questionSignature = useMemo(
    () =>
      review.questions
        .map((q) => {
          const annotationKinds = q.annotations.map((a) => a.kind).join(",");
          return `${q.num}:${q.aiScore}:${q.maxPoints ?? ""}:${annotationKinds}`;
        })
        .join("|"),
    [review.questions],
  );
  const lastQuestionSignature = useRef(questionSignature);
  useEffect(() => {
    if (lastQuestionSignature.current === questionSignature) return;
    lastQuestionSignature.current = questionSignature;
    setExpandedQs(defaultExpandedQuestions(review.questions));
  }, [questionSignature, review.questions]);

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
  const allExpanded =
    review.questions.length > 0 &&
    review.questions.every((q) => expandedQs.has(q.num));

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
        subject={subject}
      />

      <ActionBar
        status={
          anyEdited
            ? "Mỗi thay đổi sẽ lưu khi bạn xác nhận điểm."
            : "Nhận xét và điểm sẽ lưu khi bạn xác nhận điểm ở bước cuối."
        }
        scoreSlot={
          grade ? (
            <ScoreInline
              grade={grade}
              finalScores={finalScores}
              maxOverrides={maxOverrides}
              finalized={false}
              showCounter={false}
              confidence={confidence}
            />
          ) : undefined
        }
      >
        <GhostButton onClick={onPrev} disabled={!onPrev}>
          <Icon.ArrowLeft size={14} />
          Xem lại bản chấm
        </GhostButton>
        <PrimaryButton
          onClick={handleFinish}
          disabled={!onFinish}
          title="Sang bước Hoàn thành. Nhận xét HITL sẽ lưu khi bạn xác nhận điểm."
        >
          Hoàn tất bài này
          <Icon.ChevronRight size={14} color="#fff" />
        </PrimaryButton>
      </ActionBar>

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
