import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { T } from "../../theme/tokens";
import { Icon } from "../../components/ui/Icon";
import { ActionBar, PrimaryButton, SecondaryButton } from "../../components/ui/ActionBar";
import { OriginalImageModal } from "../../components/ui/OriginalImageModal";
import { getStageableLesson } from "../../lib/hitl";
import { analyzeComment } from "../../api";
import { useIsMobile } from "../../hooks/useIsMobile";
import {
  alignByQuestionNumber,
  buildAnalyzeQuestionContext,
  deriveStepReviewData,
  normalizeAiAnalysisText,
  parseIntoQuestions,
} from "./utils";
import { ReviewMockup } from "./components/ReviewMockup";
import { QuestionBox } from "./components/QuestionBox";
import { ScoreInline } from "../workspace/components/ScoreBottomBar";
import { LearnToast } from "../workspace/components/LearnToast";
import { PrintablePhieu } from "../workspace/PrintablePhieu";
import { printPhieu } from "../workspace/printPhieu";
import type {
  BackendSubject,
  CommentThreads,
  EssayFile,
  FinalizedResult,
  Grade,
  I18nStrings,
  SelectionAnnotation,
  StagedLesson,
  Subject,
} from "../../types";
import type { UseAgentPipelineResult } from "../../hooks/useAgentPipeline";
import type { UseFeedbackResult } from "../../hooks/useFeedback";

// The step-3 review surface is composed from presentational sub-components
// that live under ./components and ./highlight:
//   • ReviewMockup → PaperContainer → AnnotatedAnswer (đối-soát surface)
//   • SelectionToolbar / AnnotationBubble / AnnotationCard (annotation UI)
//   • highlight.tsx (highlightColors / normalizeForMatch / renderLineWithHighlights)
//   • MucLucSidebar / Step3Toolbar / PaperHead / QuestionBox / VerdictRow / CommentThread
// parseIntoQuestions, alignByQuestionNumber, buildAnalyzeQuestionContext,
// normalizeAiAnalysisText and deriveStepReviewData live in ./utils;
// getStageableLesson lives in lib/hitl.ts. This file owns only the
// StepReview container + its review/finalize state machine.

// ---------------------------------------------------------------------------
// Main StepReview
// ---------------------------------------------------------------------------
interface StepReviewProps {
  grade: Grade | null;
  pipeline: UseAgentPipelineResult;
  feedbackHook: UseFeedbackResult;
  /** Legacy rubber-stamp callback. Kept on the props so the workspace
   *  still wires it (for the eventual backend rewire of an "approve"
   *  verdict). Currently no UI surfaces it — every grade now flows
   *  through step 4 → step 5 finalize, and the approve semantics are
   *  expected to be derived from "no scores changed" at step 5. */
  onApprove: () => void;
  onFinish?: () => void;
  backendSubject: BackendSubject | null;
  task: string;
  t: I18nStrings;
  essayImage: EssayFile | null;
  /** Teacher's Word-style annotations — each anchored to a quote in the
   *  AI transcript with a comment. Owned by the workspace so they survive
   *  step navigation and feed into step 4. */
  teacherAnnotations: SelectionAnnotation[];
  setTeacherAnnotations: React.Dispatch<
    React.SetStateAction<SelectionAnnotation[]>
  >;
  /** Per-câu score overrides (from step 4 if the teacher has been there
   *  already). Empty Map ⇒ score panel shows pure AI proposal. Passed
   *  through to ScoreInline so the unified footer shows the running
   *  total even when the teacher navigates back to step 3. */
  finalScores?: Record<number, number>;
  setFinalScores?: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  /** The old Step-4 "Xong" screen is folded into this single surface.
   *  Null ⇒ editable review (đối soát + scoring + the "Chốt điểm" commit).
   *  Non-null ⇒ the grade is locked: score inputs go read-only, the
   *  "AI đã học" banner shows, and the action bar swaps to Sửa lại / Đã
   *  lưu. ``onFinish`` is the finalize commit; ``onUnlock`` releases the
   *  lock back to editable. ``isFinalizing`` / ``finalizeError`` drive the
   *  commit button's in-flight + error states. */
  finalizedResult?: FinalizedResult | null;
  onUnlock?: () => void;
  /** Called whenever the teacher modifies a score or đối-soát comment, so the
   *  workspace can mark an already-finalized paper as "needs re-chốt". Unlike
   *  ``onUnlock`` (screen-only), this fires on the actual edit, not on opening. */
  onEdit?: () => void;
  /** "Lưu nháp" — persist scores + comments without finalizing (no lock, no
   *  AI learning). Returns whether the save succeeded so the button can show
   *  a transient confirmation. */
  onSaveDraft?: () => Promise<boolean>;
  isFinalizing?: boolean;
  finalizeError?: string | null;
  /** Subject label for the printed phiếu chấm (e.g. "Sinh · Lớp 11"). */
  subjectLabel?: string;
}

export function StepReview({
  grade,
  pipeline,
  feedbackHook,
  onApprove,
  onFinish,
  backendSubject,
  task,
  t,
  essayImage,
  teacherAnnotations,
  setTeacherAnnotations,
  finalScores,
  setFinalScores,
  finalizedResult,
  onUnlock,
  onEdit,
  onSaveDraft,
  isFinalizing,
  finalizeError,
  subjectLabel = "",
}: StepReviewProps) {
  const locked = !!finalizedResult;
  const [commentThreads, setCommentThreads] = useState<CommentThreads>({});
  const [analyzingQ, setAnalyzingQ] = useState<number | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    const handleOpen = () => {
      setShowOriginal(true);
    };
    window.addEventListener("mirror.viewOriginalImage", handleOpen);
    return () => {
      window.removeEventListener("mirror.viewOriginalImage", handleOpen);
    };
  }, []);

  // Click-to-edit a locked score: unlock the grade and focus that câu's input
  // so the teacher edits in one motion instead of hunting for "Sửa lại". The
  // câu is stashed in a ref because the unlock + re-render is async; the
  // effect picks it up once `locked` flips false.
  const focusCauAfterUnlockRef = useRef<number | null>(null);
  const handleEditLockedScore = useCallback(
    (cau: number) => {
      focusCauAfterUnlockRef.current = cau;
      onUnlock?.();
    },
    [onUnlock],
  );
  useEffect(() => {
    if (locked) return;
    const cau = focusCauAfterUnlockRef.current;
    if (cau == null) return;
    focusCauAfterUnlockRef.current = null;
    requestAnimationFrame(() => {
      const el = document.querySelector(`.score-input[data-cau-score="${cau}"]`);
      if (el instanceof HTMLInputElement) {
        el.focus();
        el.select();
      }
    });
  }, [locked]);

  // "Lưu nháp" button state: idle → saving → saved (auto-reverts after 2s).
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved">("idle");
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    },
    [],
  );
  const handleSaveDraft = useCallback(async () => {
    if (!onSaveDraft || draftState === "saving") return;
    setDraftState("saving");
    const ok = await onSaveDraft();
    setDraftState(ok ? "saved" : "idle");
    if (ok) {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => setDraftState("idle"), 2000);
    }
  }, [onSaveDraft, draftState]);
  // dataUrl→blob conversion + revoke lifecycle now lives inside
  // OriginalImageModal (shared with step 4) — caller just owns the
  // open/close toggle.

  // IMPORTANT: hooks must be called before any conditional return. These
  // `useMemo`s used to live AFTER the `if (!grade) return null` check, which
  // was a legacy JS pattern TS/React would flag as a rule-of-hooks violation
  // once the component becomes typed.
  const studentParts = useMemo(() => parseIntoQuestions(grade?.transcript), [grade?.transcript]);
  const commentParts = useMemo(() => parseIntoQuestions(grade?.comment), [grade?.comment]);
  const questionPairs = useMemo(
    () => alignByQuestionNumber(studentParts, commentParts),
    [studentParts, commentParts],
  );

  const handleSendComment = useCallback(
    async (qIdx: number, text: string) => {
      setCommentThreads((prev) => ({
        ...prev,
        [qIdx]: [...(prev[qIdx] || []), { type: "teacher", text }],
      }));

      setAnalyzingQ(qIdx);
      try {
        const pair = questionPairs[qIdx];
        const data = await analyzeComment({
          question: buildAnalyzeQuestionContext(task, pair),
          student_answer: (pair?.student?.body || "").slice(0, 2000),
          teacher_comment: text,
        });
        setCommentThreads((prev) => ({
          ...prev,
          [qIdx]: [
            ...(prev[qIdx] || []),
            {
              type: "ai",
              text: normalizeAiAnalysisText(data.analysis, t),
              lesson: (data.lesson || "").trim(),
              verdict: data.verdict,
            },
          ],
        }));
      } catch (err) {
        console.error("Comment analysis failed:", err);
      }
      setAnalyzingQ(null);
    },
    [task, questionPairs, t],
  );

  /**
   * Teacher decides whether to apply or skip a disputed AI lesson.
   * Mutates the message in-place by index — the dispute UI only renders
   * decision buttons when ``disputeDecision`` is undefined, so subsequent
   * clicks are inert.
   */
  const handleDisputeDecide = useCallback(
    (qIdx: number, msgIdx: number, decision: "apply" | "skip") => {
      setCommentThreads((prev) => {
        const msgs = prev[qIdx];
        if (!msgs || !msgs[msgIdx]) return prev;
        const next = msgs.slice();
        next[msgIdx] = { ...next[msgIdx], disputeDecision: decision };
        return { ...prev, [qIdx]: next };
      });
    },
    [],
  );

  // Derive the "Word-print" review payload from grade + pipeline state.
  // useMemo so we don't re-build the questions array on every render
  // when the active câu changes inside ReviewMockup. ``runCount`` from
  // pipeline starts at 0 on first PIPELINE_SUCCESS, so +1 reads as
  // "Lần 1" to the teacher. MUST live before the `if (!grade) return`
  // early return — react-hooks/rules-of-hooks.
  const reviewData = useMemo(
    () =>
      deriveStepReviewData(
        grade,
        pipeline.lessonsUsed,
        pipeline.runCount + 1,
      ),
    [grade, pipeline.lessonsUsed, pipeline.runCount],
  );

  if (!grade) return null;

  const questionCount = questionPairs.length;

  const weaknesses = Array.isArray(grade.weaknesses) ? grade.weaknesses : [];
  const isSalvaged =
    Boolean(grade.salvaged) ||
    weaknesses.some((w) => typeof w === "string" && w.toLowerCase().includes("unparseable"));

  // ``subject`` is still threaded into QuestionBox for math-aware transcript
  // formatting (formatTranscript). The user-facing badge that used to show
  // subjectName has been removed — Sidebar already displays the subject
  // selection, and grade.subject is hard-stamped to "stem" so the badge was
  // surfacing the wrong label anyway.
  const subject: Subject | string = grade.subject || "literature";

  const refForIdx = (idx: number | string) => questionPairs[Number(idx)]?.num ?? Number(idx) + 1;

  const stagedLessons: StagedLesson[] = Object.entries(commentThreads).flatMap(([idx, msgs]) => {
    // getStageableLesson returns "" for disputed lessons that the
    // teacher hasn't explicitly applied — that's the anti-poison guard.
    const lessonText = getStageableLesson(msgs);
    if (!lessonText) return [];
    return [
      {
        lesson_text: lessonText,
        question_ref: `Câu ${refForIdx(idx)}`,
      },
    ];
  });

  const aggregatedNote = Object.entries(commentThreads)
    .flatMap(([idx, msgs]) =>
      msgs.filter((m) => m.type === "teacher").map((m) => `[Câu ${refForIdx(idx)}] ${m.text}`),
    )
    .join("\n");

  const handleApproveClick = async () => {
    if (feedbackHook.isSubmitting || pipeline.phase === "generating") return;
    const res = await feedbackHook.submit({
      action: "approve",
      comment: aggregatedNote || "",
      stagedLessons,
      task: task || "",
      wrongCode: pipeline.code || "",
      runId: pipeline.runId,
      subject: backendSubject,
    });
    if (res && onApprove) onApprove();
  };

  const canApprove = !feedbackHook.isSubmitting && pipeline.phase !== "generating";

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        // Fill at least the viewport (minus header) so the spacer below can
        // push the sticky ActionBar to the bottom even on short papers —
        // without this, sticky-bottom only hugs the bottom when content is
        // tall enough, leaving the bar floating mid-page on short ones.
        minHeight: "calc(100vh - 64px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top toolbar — horizontal padding matches the QuestionBox card's
          internal padding (20 px). Now hosts only the staged-lessons
          counter (lightbulb badge); the "Xem PDF gốc" affordance moved
          into PaperHead as a MetaPill so the document and its actions
          stay co-located. */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          minHeight: 28,
          padding: "0 20px",
        }}
      >
        {/* Left side intentionally empty — both meta-controls (lightbulb +
            view-original) cluster on the right per design 2026-04-26. The
            empty div keeps justifyContent: "space-between" pushing the
            right cluster to the edge without restructuring the flex parent. */}
        <div />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {stagedLessons.length > 0 && (
            // Lightbulb-with-counter: ``key`` set to the count so React
            // remounts the wrapper on every increment, replaying the
            // ``lessonPop`` keyframe — gives the teacher a quick visual
            // cue that a new lesson was just staged from their last comment.
            <span
              key={stagedLessons.length}
              title={`${stagedLessons.length} ${t.lessonsStaged ?? "bài học chờ lưu khi duyệt"}`}
              aria-label={`${stagedLessons.length} ${
                t.lessonsStaged ?? "bài học chờ lưu khi duyệt"
              }`}
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                animation: "lessonPop 0.32s ease-out",
              }}
            >
              <Icon.Lightbulb size={20} color={T.amber} />
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -6,
                  minWidth: 16,
                  height: 16,
                  padding: "0 4px",
                  borderRadius: 8,
                  background: T.amber,
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: T.mono,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                  boxShadow: T.shadowSoft,
                }}
              >
                {stagedLessons.length}
              </span>
            </span>
          )}
          {/* "Xem PDF gốc" affordance lives inside the paper-head as a
              MetaPill alongside the lessons-used pill — keeps the action
              cluster co-located with the document it acts on. */}
        </div>
      </div>

      <OriginalImageModal
        open={showOriginal}
        essayImage={essayImage}
        onClose={() => setShowOriginal(false)}
        t={t}
      />

      {/* Hidden print-only phiếu chấm. Always mounted so the toolbar's
          "In phiếu chấm" button can fire window.print() at any time —
          no dedicated finalize screen. Renders nothing on screen. */}
      <PrintablePhieu
        grade={grade}
        teacherFinalScores={finalScores}
        teacherAnnotations={teacherAnnotations}
        subjectLabel={subjectLabel}
        finalizedAt={finalizedResult?.finalizedAt}
      />

      {/* Post-finalize confirmation. Only shown when it carries something
          NOT already on screen: i.e. the teacher's đối-soát comments were
          saved (or skipped) to HITL memory. A pure score-delta lesson is
          deliberately NOT enough to trigger it — the delta is already
          visible on the sidebar (red "đã chỉnh") and the "Đã học từ bạn"
          header chip, so a banner repeating it just read as duplicate
          memory-tinted clutter. Comments, by contrast, have no other
          on-screen confirmation that they reached memory. */}
      {locked && finalizedResult && (
        ((finalizedResult.commentsSavedCount ?? 0) > 0) ||
        ((finalizedResult.commentsSkippedCount ?? 0) > 0)
      ) && (
        <LearnToast
          commentsSaved={finalizedResult.commentsSavedCount ?? 0}
          deltaLessonId={finalizedResult.deltaLessonId ?? null}
        />
      )}

      {isSalvaged && (
        <div
          style={{
            padding: "10px 14px",
            marginBottom: 12,
            background: T.amberSoft,
            borderLeft: `4px solid ${T.amber}`,
            borderRadius: 8,
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            fontSize: 13,
            color: T.textSoft,
            lineHeight: 1.55,
          }}
        >
          <Icon.AlertTriangle size={14} color={T.amber} style={{ marginTop: 2, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, color: T.amber, marginBottom: 2 }}>
              {String(t.salvagedTitle ?? "Kết quả chấm chưa đầy đủ")}
            </div>
            {String(
              t.salvagedBody ??
                "Mô hình đã trả về JSON không hợp lệ — nội dung bên dưới được trích xuất từng phần. Hãy kiểm tra kỹ trước khi duyệt, hoặc chấm lại bài.",
            )}
          </div>
        </div>
      )}

      {/* "Word-print" review layout. The data is now derived from the
          live grade + pipeline state — student-identity fields stay
          mocked until the upload form gains them. Falls back to the
          full mock when grade has no scored per-câu data (salvaged /
          legacy) so the layout never breaks. The legacy QuestionBox +
          questionPairs plumbing below is suspended via void-references
          while we phase it out. */}
      <ReviewMockup
        isMobile={isMobile}
        review={reviewData}
        essayAvailable={!!essayImage?.dataUrl}
        onViewOriginal={() => setShowOriginal(true)}
        onPrint={() => printPhieu(subjectLabel)}
        finalScores={finalScores}
        // Always pass the score setter (unless finalizing) so inputs remain editable.
        // Editing unlocks a locked grade and marks it "needs re-chốt" (onEdit).
        setFinalScores={
          isFinalizing
            ? undefined
            : (updater) => {
                if (locked) {
                  onUnlock?.();
                }
                onEdit?.();
                setFinalScores?.(updater);
              }
        }
        // Keep click-to-edit handler as fallback
        onEditLockedScore={locked ? handleEditLockedScore : undefined}
        teacherAnnotations={teacherAnnotations}
        t={t}
        // Always pass annotation setters (unless finalizing). Editing unlocks a
        // locked grade and marks it "needs re-chốt" (onEdit).
        onAddAnnotation={
          isFinalizing
            ? undefined
            : (a) => {
                if (locked) {
                  onUnlock?.();
                }
                onEdit?.();
                setTeacherAnnotations?.((prev) => [...prev, a]);
              }
        }
        onUpdateAnnotation={
          isFinalizing
            ? undefined
            : (id, patch) => {
                if (locked) {
                  onUnlock?.();
                }
                onEdit?.();
                setTeacherAnnotations?.((prev) =>
                  prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
                );
              }
        }
        onRemoveAnnotation={
          isFinalizing
            ? undefined
            : (id) => {
                if (locked) {
                  onUnlock?.();
                }
                onEdit?.();
                setTeacherAnnotations?.((prev) => prev.filter((a) => a.id !== id));
              }
        }
      />
      {/* Acknowledge the legacy plumbing as "intentionally suspended" so
          the compiler doesn't complain about unused locals while we wait
          for the design to be approved. These all come back once we wire
          the mockup to real data. */}
      {(() => {
        void questionPairs;
        void questionCount;
        void commentThreads;
        void analyzingQ;
        void isSalvaged;
        void subject;
        void handleSendComment;
        void handleDisputeDecide;
        void QuestionBox;
        return null;
      })()}

      {/* Bottom action bar — back / disclaimer / forward.
          Approve shortcut intentionally removed: every grade now flows
          through step 4 (Chấm lại) so the teacher engages per-câu before
          committing. "Approve" semantics will be derived at step 5
          finalize ("no scores changed" → approve verdict) when backend
          is re-wired. The disclaimer text reminds the teacher of their
          role in the HITL loop. */}
      {feedbackHook.error && (
        <div
          style={{
            marginTop: 16,
            padding: "8px 12px",
            background: T.redSoft,
            borderRadius: 6,
            fontSize: 14,
            color: T.red,
            textAlign: "center",
          }}
        >
          <Icon.AlertTriangle size={12} color={T.red} style={{ marginRight: 4 }} />
          {feedbackHook.error}
        </div>
      )}
      {finalizeError && (
        <div
          style={{
            marginTop: 16,
            padding: "8px 12px",
            background: T.redSoft,
            borderRadius: 6,
            fontSize: 14,
            color: T.red,
            textAlign: "center",
          }}
        >
          <Icon.AlertTriangle size={12} color={T.red} style={{ marginRight: 4 }} />
          {finalizeError}
        </div>
      )}
      {/* Spacer — soaks up leftover height on short papers so the sticky
          ActionBar sits at the bottom instead of floating mid-page. On long
          papers it collapses to 0 and the bar behaves as before. */}
      <div style={{ flex: "1 0 0" }} />
      <ActionBar
        // No center status line. The "AI chỉ đề xuất" reminder it used to
        // carry is already implicit in the flow (the teacher types the
        // scores; the button says "Chốt điểm"), so the sentence was just
        // preaching in the bar's most valuable space. Dropping it lets the
        // score cluster (left) and the action (right) breathe.
        scoreSlot={
          grade ? (
            // Just the running totals. The old "Quay lại" button was
            // dropped — the stepper's "TẢI LÊN" chip already navigates back
            // to upload (step 1 is navigable), so a second back affordance
            // here was redundant.
            <ScoreInline
              grade={grade}
              finalScores={finalScores ?? {}}
              maxOverrides={{}}
              finalized={locked}
              confidence={pipeline.confidence}
            />
          ) : undefined
        }
      >
        {locked ? (
          <>
            {/* The explicit "Sửa lại" unlock button was removed — returning to
                a graded paper now auto-unlocks for editing, and a locked score
                is click-to-edit, so the button was redundant. ``onUnlock`` stays
                wired for those two paths. */}
            {/* Print is also reachable from the toolbar at any time, but
                surface it here too: right after chốt is exactly when the
                teacher wants the slip, so they don't have to scroll back
                up to the toolbar to get it. */}
            <SecondaryButton
              onClick={() => printPhieu(subjectLabel)}
              title="In phiếu chấm — xuất bản giấy với chữ ký và điểm bằng chữ."
            >
              <Icon.Printer size={14} />
              In phiếu chấm
            </SecondaryButton>
            <span
              style={{
                padding: "0 22px",
                height: 40,
                fontSize: 14,
                color: T.green,
                background: T.greenSoft,
                border: `1.5px solid ${T.green}`,
                borderRadius: 8,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                fontFamily: T.font,
                boxSizing: "border-box",
              }}
            >
              <Icon.Check size={14} color={T.green} />
              Đã lưu
            </span>
          </>
        ) : (
          <>
            {onSaveDraft && (
              // Lưu nháp — save progress without finalizing (no lock, no AI
              // learning). Lets the teacher leave a paper half-graded and
              // come back later. Distinct from "Chốt" which is the commit.
              <SecondaryButton
                onClick={handleSaveDraft}
                disabled={pipeline.phase === "generating" || !!isFinalizing || draftState === "saving"}
                title="Lưu nháp — giữ tiến độ để chấm tiếp sau, chưa chốt điểm và chưa dạy AI."
              >
                {draftState === "saving" ? (
                  <>
                    <Icon.RefreshCw size={14} />
                    Đang lưu…
                  </>
                ) : draftState === "saved" ? (
                  <>
                    <Icon.Check size={14} color={T.green} />
                    Đã lưu nháp
                  </>
                ) : (
                  <>
                    <Icon.FileText size={14} />
                    Lưu nháp
                  </>
                )}
              </SecondaryButton>
            )}
            <PrimaryButton
              onClick={onFinish}
              disabled={pipeline.phase === "generating" || !!isFinalizing}
              title="Chốt điểm và lưu — nhận xét HITL được lưu cùng lúc."
            >
              {isFinalizing ? (
                <>
                  <Icon.RefreshCw size={14} color="#fff" />
                  {String(t.finalizeSaving ?? "Đang lưu…")}
                </>
              ) : (
                <>
                  Chốt điểm &amp; lưu
                  <Icon.ChevronRight size={14} color="#fff" />
                </>
              )}
            </PrimaryButton>
          </>
        )}
      </ActionBar>
      {/* Suspend the approve plumbing we no longer render but want to
          keep alive for the eventual backend rewire (mirrors the legacy
          QuestionBox suspension a few hundred lines up). */}
      {(() => {
        void handleApproveClick;
        void canApprove;
        void onApprove;
        return null;
      })()}
    </div>
  );
}
