import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import { T } from "../../theme/tokens";
import { Icon } from "../../components/ui/Icon";
import { ActionBar, PrimaryButton, SecondaryButton } from "../../components/ui/ActionBar";
import { OriginalImageModal } from "../../components/ui/OriginalImageModal";
import { getStageableLesson } from "../../lib/hitl";
import { analyzeComment } from "../../api";
import { useIsMobile } from "../../hooks/useIsMobile";
import { MOCK_REVIEW } from "./fixtures/review";
import type { MockQuestion, ReviewPayload } from "./types";
import {
  alignByQuestionNumber,
  buildAnalyzeQuestionContext,
  deriveStepReviewData,
  normalizeAiAnalysisText,
  parseIntoQuestions,
} from "./utils";
import { MucLucSidebar, MucLucChips } from "./components/MucLucSidebar";
import { Step3Toolbar } from "./components/Step3Toolbar";
import { PaperHead } from "./components/PaperHead";
import { QuestionBox } from "./components/QuestionBox";
import { VerdictRow } from "./components/VerdictRow";
import { formatLine } from "../../lib/mathFormat";
import { ScoreInline } from "../workspace/components/ScoreBottomBar";
import { LearnToast } from "../workspace/components/LearnToast";
import { PrintablePhieu } from "../workspace/PrintablePhieu";
import { printPhieu } from "../workspace/printPhieu";
import type {
  BackendSubject,
  CommentThreads,
  CommentVerdict,
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

// QuestionPart / QuestionPair types live in ./types.
// parseIntoQuestions, alignByQuestionNumber, buildAnalyzeQuestionContext,
// normalizeAiAnalysisText, clipText and deriveStepReviewData live in
// ./utils. getStageableLesson lives in lib/hitl.ts so step 4 (StepRegrade)
// can reuse the anti-poison gating.

// CommentThread + verdictStyle live in components/CommentThread.tsx.

// QuestionBox + splitAnnotationLines + AnnotationRow live in components/QuestionBox.tsx.

// ---------------------------------------------------------------------------
// ReviewMockup — UI-first visual design (hardcoded sample data).
//
// Matches the reference Trần Minh Khôi mockup the teacher locked: header
// strip with student identity + AI run metadata, a left "document" column
// with a peach-tinted card per câu showing inline ✓ / × annotations next
// to the lines they refer to and a red italic score footer, and a right
// sticky summary panel with the overall estimated grade plus per-câu
// score cards (one highlighted as the active câu). Pure presentational —
// no props from real grade state yet. Wiring comes after sign-off.
// ---------------------------------------------------------------------------

// MOCK_REVIEW + Mock* type fixtures live in fixtures/review.ts.
// deriveStepReviewData (live grade → ReviewPayload) lives in ./utils.

function ReviewMockup({
  isMobile,
  review = MOCK_REVIEW,
  onViewOriginal,
  essayAvailable = false,
  teacherAnnotations,
  onAddAnnotation,
  onUpdateAnnotation,
  onRemoveAnnotation,
  finalScores,
  setFinalScores,
  onEditLockedScore,
  onPrint,
  t,
}: {
  isMobile: boolean;
  review?: ReviewPayload;
  onViewOriginal?: () => void;
  essayAvailable?: boolean;
  teacherAnnotations?: SelectionAnnotation[];
  onAddAnnotation?: (a: SelectionAnnotation) => void;
  onUpdateAnnotation?: (id: string, patch: Partial<SelectionAnnotation>) => void;
  onRemoveAnnotation?: (id: string) => void;
  finalScores?: Record<number, number>;
  setFinalScores?: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  /** Locked mode: click a read-only score to unlock + focus it (no separate
   *  "Sửa lại" click). Forwarded to MucLucSidebar. */
  onEditLockedScore?: (cau: number) => void;
  onPrint?: () => void;
  t: I18nStrings;
}) {
  const [activeQ, setActiveQ] = useState<number>(review.initialActiveQuestionNum);
  // Rail can be collapsed to a pull-tab so the teacher can reclaim full
  // page width on long transcripts. Mobile starts collapsed (paper first).
  const [tocOpen, setTocOpen] = useState(!isMobile);
  // ``flashCau`` drives a brief indigo pulse on the câu in the document
  // body — set when the teacher clicks a mục lục entry, auto-cleared
  // after ~1.2s. The sidebar's own active state (activeQ) is sticky;
  // the body highlight is just a "you're here" pulse so the teacher
  // doesn't have to hunt for where the scroll landed.
  const [flashCau, setFlashCau] = useState<number | null>(null);
  useEffect(() => {
    if (flashCau === null) return;
    const t = window.setTimeout(() => setFlashCau(null), 1200);
    return () => window.clearTimeout(t);
  }, [flashCau]);

  const jumpToCau = useCallback((n: number) => {
    setActiveQ(n);
    setFlashCau(n);
    // Re-trigger the flash even if the teacher clicks the same câu
    // twice in a row — without this nudge the state stays at the same
    // number and React skips the re-pulse.
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-cau-anchor="${n}"]`);
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }, []);

  useEffect(() => {
    const handleJump = (e: Event) => {
      const qNum = (e as CustomEvent<{ qNum: number }>).detail.qNum;
      if (typeof qNum === "number") {
        jumpToCau(qNum);
      }
    };
    window.addEventListener("hitl.jumpToQuestion", handleJump);
    return () => {
      window.removeEventListener("hitl.jumpToQuestion", handleJump);
    };
  }, [jumpToCau]);

  // Scroll to a specific annotation's highlight (from the toolbar's
  // "Ghi chú" jump-list) — same data-ann-id anchor the bubble queries.
  const jumpToAnnotation = useCallback((id: string) => {
    requestAnimationFrame(() => {
      const el = document.querySelector(`mark[data-ann-id="${id}"]`);
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }, []);

  return (
    <div>
      <Step3Toolbar
        onViewOriginal={onViewOriginal}
        essayAvailable={essayAvailable}
        tocOpen={tocOpen}
        onToggleToc={() => setTocOpen((v) => !v)}
        onPrint={onPrint}
        annotations={teacherAnnotations}
        onJumpToAnnotation={jumpToAnnotation}
      />
      {isMobile && (
        <MucLucChips
          review={review}
          activeQ={activeQ}
          onJumpToCau={jumpToCau}
          finalScores={finalScores}
        />
      )}
      <div
        className="review-layout-grid"
        style={{
          display: isMobile ? "block" : "grid",
          gridTemplateColumns: isMobile
            ? undefined
            : tocOpen
              ? "180px minmax(0, 1fr)"
              : "1fr", // Hide left column completely when collapsed so paper container expands
          gap: tocOpen ? 24 : 0, // No layout gap when collapsed
          alignItems: "start",
          transition: "grid-template-columns 0.18s ease, gap 0.18s ease",
        }}
      >
        {!isMobile && tocOpen && (
          <MucLucSidebar
            review={review}
            activeQ={activeQ}
            onJumpToCau={jumpToCau}
            teacherAnnotations={teacherAnnotations}
            collapsed={false}
            onToggle={() => setTocOpen(false)}
            finalScores={finalScores}
            setFinalScores={setFinalScores}
            onEditLockedScore={onEditLockedScore}
          />
        )}
        <PaperContainer
          review={review}
          flashCau={flashCau}
          teacherAnnotations={teacherAnnotations}
          onAddAnnotation={onAddAnnotation}
          onUpdateAnnotation={onUpdateAnnotation}
          onRemoveAnnotation={onRemoveAnnotation}
          t={t}
        />
      </div>
    </div>
  );
}

// PaperHead lives in components/PaperHead.tsx.


// PaperContainer — single "sheet of paper" wrapping every câu. Matches the
// reference's ``.paper`` card: one bordered surface with a head section
// (student identity + AI run meta) and a body section (annotated answer).
// q-blocks separated by spacing alone — no per-câu cards. Clicking inside
// a q-block sets that câu as active (peach tint follows the click); the
// rail mirrors the same state in its qcards.
function PaperContainer({
  review,
  flashCau,
  teacherAnnotations,
  onAddAnnotation,
  onUpdateAnnotation,
  onRemoveAnnotation,
  t,
}: {
  review: ReviewPayload;
  /** Câu number to briefly pulse — set when the teacher jumps from the
   *  mục lục. Null = no pulse. The container only renders the pulse
   *  bg while this matches; parent auto-clears after the flash window. */
  flashCau: number | null;
  teacherAnnotations?: SelectionAnnotation[];
  onAddAnnotation?: (a: SelectionAnnotation) => void;
  onUpdateAnnotation?: (id: string, patch: Partial<SelectionAnnotation>) => void;
  onRemoveAnnotation?: (id: string) => void;
  t: I18nStrings;
}) {
  return (
    <div
      style={{
        background: T.paper,
        border: `1px solid ${T.borderLight}`,
        borderRadius: 4,
        boxShadow: T.shadowStrong,
        minWidth: 0,
      }}
    >
      <PaperHead review={review} />
      {/* Generous horizontal padding = the document's page margins; the
          clamp shrinks them on narrow screens so the transcript never
          gets squeezed. This is what makes the card read as a Word page. */}
      <div className="paper-body-content" style={{ padding: "40px clamp(24px, 5vw, 64px) 24px" }}>
        <AnnotatedAnswer
          questions={review.questions}
          flashCau={flashCau}
          teacherAnnotations={teacherAnnotations}
          onAddAnnotation={onAddAnnotation}
          onUpdateAnnotation={onUpdateAnnotation}
          onRemoveAnnotation={onRemoveAnnotation}
          t={t}
        />
      </div>
    </div>
  );
}


// AnnotatedAnswer — step 3 "đối soát" surface. Word-style annotation:
// teacher selects a passage in the AI transcript → a floating mini-
// toolbar appears with "Bình luận" → selection becomes a highlighted
// quote anchored to a comment thread under the câu. Highlights re-
// render on every state change by matching the saved quote against the
// line text (first occurrence wins — adequate for the prototype).
//
// AI scores / annotations are intentionally hidden here; the teacher
// reads blind and only reveals AI's verdict at step 4.
function AnnotatedAnswer({
  questions,
  flashCau,
  teacherAnnotations,
  onAddAnnotation,
  onUpdateAnnotation,
  onRemoveAnnotation,
  t,
}: {
  questions: MockQuestion[];
  /** Câu number to briefly pulse with an indigo background. Set by the
   *  mục lục jump action; auto-clears after ~1.2s. */
  flashCau: number | null;
  teacherAnnotations?: SelectionAnnotation[];
  onAddAnnotation?: (a: SelectionAnnotation) => void;
  onUpdateAnnotation?: (id: string, patch: Partial<SelectionAnnotation>) => void;
  onRemoveAnnotation?: (id: string) => void;
  t: I18nStrings;
}) {
  // Floating mini-toolbar state. ``pending`` captures the selection
  // snapshot at the moment of mouseup so it survives the click on the
  // Floating mini-toolbar state. ``pending`` captures the selection
  // snapshot at the moment of mouseup so it survives the click on the
  // "Bình luận" button (browsers collapse the native selection as soon
  // as focus leaves the text). ``range`` allows dynamic repositioning on scroll.
  const [pending, setPending] = useState<{
    cau: number;
    lineIdx: number;
    endLineIdx: number;
    quote: string;
    range: Range;
  } | null>(null);
  // When a fresh annotation is created we auto-open its comment input.
  // null = nothing being edited; string = annotation id whose bubble is
  // in edit mode.
  const [editingId, setEditingId] = useState<string | null>(null);
  // Which annotation's bubble is open. Replaces the old "focusedId" —
  // click a highlight → opens that ann's bubble; click outside →
  // bubble closes (set to null).
  const [activeAnnId, setActiveAnnId] = useState<string | null>(null);
  // Set of annotation IDs currently waiting on /api/analyze-comment.
  // Drives the "AI đang phân tích…" pill on the card. Cleared when the
  // response (or error) lands. Component unmount aborts via the
  // ``mountedRef`` guard inside ``analyzeAnnotation``.
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);

  // Build the analyze-comment payload from the câu context, then update
  // the annotation with the verdict + analysis. Anti-poisoning: comments
  // AI disputes are NOT auto-staged at step 4 — the teacher has to
  // explicitly press "Vẫn lưu" to override. Network failures degrade
  // gracefully (no verdict ⇒ treated like a pending state but doesn't
  // block step 4 finalize; the comment still stages as before).
  const analyzeAnnotation = useCallback(
    async (id: string, cau: number, comment: string, quote?: string) => {
      const q = questions.find((qq) => qq.num === cau);
      if (!q || !onUpdateAnnotation) return;
      // Pull the câu's first line as the question label and the rest as
      // the student work, slicing to keep the API payload compact.
      const studentWork = q.lines.join("\n").slice(0, 2000);
      const questionLabel = q.lines[0] || `Câu ${cau}`;
      setAnalyzingIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      try {
        const data = await analyzeComment({
          question: questionLabel,
          student_answer: studentWork,
          teacher_comment: comment,
          quote: quote,
        });
        if (!mountedRef.current) return;

        // Auto-assign pedagogical color based on AI category response if not manually overridden by teacher
        const currentAnn = (teacherAnnotations ?? []).find((a) => a.id === id);
        const hasCustomColor = currentAnn && currentAnn.color;

        // Map backend category strings to frontend highlight color strings
        const categoryToColor: Record<string, "red" | "green" | "purple" | "orange" | "pink" | "mint" | "yellow" | "blue"> = {
          error: "red",
          good: "green",
          reasoning: "purple",
          expression: "orange",
          creative: "pink",
          interesting: "mint",
          notice: "yellow",
          other: "blue",
        };
        const mappedColor = data.category ? categoryToColor[data.category] : undefined;
        const autoColor = (!hasCustomColor && mappedColor) ? mappedColor : undefined;

        onUpdateAnnotation(id, {
          verdict: (data.verdict as CommentVerdict) || "agree",
          analysis: (data.analysis || "").trim(),
          lesson: (data.lesson || "").trim(),
          ...(autoColor ? { color: autoColor } : {}),
        });
      } catch (err) {
        console.warn("[step3] analyze-comment failed:", err);
        // Don't block staging on network errors — clear the analyzing
        // state and leave verdict undefined so the comment is treated as
        // an un-vetted annotation (will still stage at step 4).
      } finally {
        if (mountedRef.current) {
          setAnalyzingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      }
    },
    [questions, onUpdateAnnotation, teacherAnnotations],
  );

  const handleMouseUp = useCallback(() => {
    if (!onAddAnnotation) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setPending(null);
      return;
    }
    // Normalize to NFC so the stored quote matches the backend
    // transcript (which the Gemini grader emits in NFC). Selection
    // .toString() in some browsers/inputs returns NFD for diacritics
    // — letting that through made indexOf fail later when rendering
    // the `<mark>`, which left the bubble unable to anchor.
    const trimmed = sel.toString().normalize("NFC").replace(/\s+$/, "");
    if (!trimmed) {
      setPending(null);
      return;
    }
    const range = sel.getRangeAt(0);
    // Resolve a node to its enclosing line div. range.startContainer /
    // endContainer can be a TEXT node (use its parent) or an ELEMENT node
    // (use it directly) — the latter happens when the selection ends at a
    // line boundary, which is exactly the multi-line case.
    const lineElOf = (node: Node | null): HTMLElement | null => {
      if (!node) return null;
      const el =
        node.nodeType === Node.TEXT_NODE
          ? node.parentElement
          : (node as HTMLElement);
      return (el?.closest("[data-cau][data-line]") as HTMLElement) ?? null;
    };
    const startLine = lineElOf(range.startContainer);
    const endLine = lineElOf(range.endContainer);
    if (!startLine) {
      setPending(null);
      return;
    }
    // Allow selections that span multiple lines within the same câu
    // (teacher often highlights a 2–3 line block when commenting on a
    // multi-step proof). Cross-câu selections are still rejected — those
    // would need to stage two separate lessons.
    if (endLine && endLine !== startLine) {
      if (startLine.dataset.cau !== endLine.dataset.cau) {
        setPending(null);
        return;
      }
    }
    const cau = Number(startLine.dataset.cau);
    const startIdx = Number(startLine.dataset.line);
    if (Number.isNaN(cau) || Number.isNaN(startIdx)) {
      setPending(null);
      return;
    }
    // Determine the FULL span of lines the selection covers. endLine alone
    // is unreliable: when the drag ends at a line boundary the browser sets
    // range.endContainer to an element node, so the old closest() lookup
    // missed the last line and collapsed multi-line selections to one line
    // (only the first line got highlighted). range.intersectsNode over the
    // câu's line divs is authoritative regardless of container node type.
    const touchedIdxs = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>(
        `[data-cau="${cau}"][data-line]`,
      ) ?? [],
    )
      .filter((el) => range.intersectsNode(el))
      .map((el) => Number(el.dataset.line))
      .filter((n) => !Number.isNaN(n));
    const lineIdx = touchedIdxs.length ? Math.min(...touchedIdxs) : startIdx;
    const endLineIdx = touchedIdxs.length ? Math.max(...touchedIdxs) : startIdx;
    // Anchor the toolbar to the FIRST visual line of the selection, not
    // the whole bounding box. For multi-line selections, getBoundingClientRect
    // returns a rect spanning every line — its .bottom is the bottom of the
    // last line, which would push the toolbar far away from the highlight.
    // getClientRects()[0] is the first line's rect, so the toolbar sits
    // right under where the teacher started selecting.
    setPending({
      cau,
      lineIdx,
      endLineIdx,
      quote: trimmed,
      range,
    });
  }, [onAddAnnotation]);

  // Touch devices: native long-press text selection drives the OS selection
  // handles and does NOT reliably emit a `mouseup`, so the đối-soát toolbar
  // (which we open from `handleMouseUp`) never appeared on phones/tablets.
  // `selectionchange` DOES fire for touch selection — debounce it so we react
  // only once the selection settles (not on every handle nudge), then reuse
  // the exact same handler. Gated to coarse pointers so mouse/desktop keeps
  // its instant, flicker-free `mouseup` path completely unchanged.
  useEffect(() => {
    if (!onAddAnnotation) return;
    if (typeof window === "undefined" || !window.matchMedia) return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    let timer: number | undefined;
    const onSelectionChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => handleMouseUp(), 350);
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [onAddAnnotation, handleMouseUp]);

  // Clear the pending toolbar on outside click. Without this the chip
  // lingers after the user moves on.
  useEffect(() => {
    if (!pending) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      const toolbar = document.getElementById("step3-selection-toolbar");
      if (toolbar?.contains(target)) return;
      setPending(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pending]);

  const commitPending = () => {
    if (!pending || !onAddAnnotation) return;
    const id = `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    onAddAnnotation({
      id,
      cau: pending.cau,
      lineIdx: pending.lineIdx,
      endLineIdx: pending.endLineIdx,
      quote: pending.quote,
      comment: "",
    });
    setPending(null);
    window.getSelection()?.removeAllRanges();
    setEditingId(id);
    setActiveAnnId(id);
  };

  const commitPendingHighlight = (color: "yellow" | "green" | "blue" | "red" | "purple" | "orange" | "pink" | "mint") => {
    if (!pending || !onAddAnnotation) return;
    const id = `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    onAddAnnotation({
      id,
      cau: pending.cau,
      lineIdx: pending.lineIdx,
      endLineIdx: pending.endLineIdx,
      quote: pending.quote,
      comment: "",
      color,
    });
    setPending(null);
    window.getSelection()?.removeAllRanges();
    setTimeout(() => {
      window.getSelection()?.removeAllRanges();
    }, 50);
  };

  // Locate the active annotation across all câu for the bubble — null
  // means no bubble open.
  const activeAnn = activeAnnId
    ? (teacherAnnotations ?? []).find((a) => a.id === activeAnnId) ?? null
    : null;

  // Outside-click dismiss for the bubble. Skips clicks on any <mark>,
  // inside the bubble itself, AND the selection toolbar. If the teacher leaves
  // an empty comment behind while actively editing it, the annotation is
  // dropped — keeps the corpus free of placeholder rows. If they are not
  // editing (highlight-only mode), we preserve it.
  useEffect(() => {
    if (!activeAnnId) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("mark[data-ann-id]")) return;
      if (target.closest("#step3-annotation-bubble")) return;
      if (target.closest("#step3-selection-toolbar")) return;
      // Discard if the bubble is hosting an unfinished new annotation that is being edited.
      if (activeAnn && !activeAnn.comment.trim() && editingId === activeAnn.id && !activeAnn.color) {
        onRemoveAnnotation?.(activeAnn.id);
      }
      setActiveAnnId(null);
      setEditingId(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [activeAnnId, activeAnn, editingId, onRemoveAnnotation]);

  // Escape closes the bubble (mirrors outside-click).
  useEffect(() => {
    if (!activeAnnId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (activeAnn && !activeAnn.comment.trim() && editingId === activeAnn.id && !activeAnn.color) {
        onRemoveAnnotation?.(activeAnn.id);
      }
      setActiveAnnId(null);
      setEditingId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeAnnId, activeAnn, editingId, onRemoveAnnotation]);

  return (
    <div
      ref={containerRef}
      onMouseUp={handleMouseUp}
      style={{
        fontFamily: T.font,
        fontSize: 16,
        color: T.textSoft,
        lineHeight: 1.85,
        position: "relative",
      }}
    >
      {questions.map((q) => {
        const flashing = q.num === flashCau;
        const cauAnns = (teacherAnnotations ?? []).filter(
          (a) => a.cau === q.num,
        );
        return (
          <div
            key={q.num}
            data-cau-anchor={q.num}
            style={{
              padding: "8px 16px",
              margin: "0 -16px 12px",
              // Square corners (no radius): this is a text-highlight tint
              // over a câu, so it should read like Word/Docs highlighting —
              // a flat band hugging the lines — not a rounded card/chip.
              background: flashing ? T.accentGlow : "transparent",
              transition: flashing
                ? "background 0.1s ease-out"
                : "background 0.6s ease-out",
              scrollMarginTop: 12,
            }}
          >
            {q.lines.map((line, i) => {
              // Multi-line selections (endLineIdx > lineIdx) attach the
              // annotation to every line in the inclusive range so each
              // row in the proof gets a highlight.
              const lineAnns = cauAnns.filter((a) => {
                const endIdx = a.endLineIdx ?? a.lineIdx;
                return i >= a.lineIdx && i <= endIdx;
              });
              return (
                <div
                  key={i}
                  data-cau={q.num}
                  data-line={i}
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    minWidth: 0,
                  }}
                >
                  {renderLineWithHighlights(
                    line,
                    lineAnns,
                    i,
                    activeAnnId,
                    (id) => {
                      setActiveAnnId(id);
                      setEditingId(null);
                    },
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      {pending && (
        <SelectionToolbar
          selectionRange={pending.range}
          onComment={commitPending}
          onHighlight={commitPendingHighlight}
          onDismiss={() => {
            setPending(null);
            window.getSelection()?.removeAllRanges();
            setTimeout(() => {
              window.getSelection()?.removeAllRanges();
            }, 50);
          }}
        />
      )}
      {activeAnn && (
        <AnnotationBubble
          ann={activeAnn}
          containerRef={containerRef}
          editing={editingId === activeAnn.id}
          analyzing={analyzingIds.has(activeAnn.id)}
          t={t}
          onStartEdit={() => setEditingId(activeAnn.id)}
          onCancelEdit={(currentComment) => {
            if (!currentComment.trim() && !activeAnn.color) {
              onRemoveAnnotation?.(activeAnn.id);
              setActiveAnnId(null);
            }
            setEditingId(null);
          }}
          onSave={(comment, color) => {
            const trimmed = comment.trim();
            if (!trimmed && !color) {
              onRemoveAnnotation?.(activeAnn.id);
              setActiveAnnId(null);
              setEditingId(null);
              return;
            }
            onUpdateAnnotation?.(activeAnn.id, {
              comment: trimmed,
              color,
              verdict: undefined,
              analysis: undefined,
              lesson: undefined,
              disputeDecision: undefined,
            });
            setEditingId(null);
            if (trimmed) {
              void analyzeAnnotation(activeAnn.id, activeAnn.cau, trimmed, activeAnn.quote);
            }
          }}
          onRemove={() => {
            onRemoveAnnotation?.(activeAnn.id);
            setActiveAnnId(null);
            setEditingId(null);
          }}
          onDecideDispute={(decision) => {
            onUpdateAnnotation?.(activeAnn.id, { disputeDecision: decision });
          }}
        />
      )}
    </div>
  );
}

// Color tokens for `<mark>` highlights, keyed by verdict + dispute
// decision. Rest = soft tone matching the verdict pill; active (= bubble
// open) = a slightly bolder shade so the teacher sees which mark their
// bubble belongs to when several are visible. Dispute+skip falls into a
// muted grey because the lesson is intentionally dropped.
function highlightColors(ann: SelectionAnnotation, active: boolean): {
  bg: string;
  strike?: boolean;
} {
  // If custom color is explicitly selected (e.g. Highlight only annotations)
  if (ann.color) {
    if (ann.color === "green") {
      return {
        bg: active ? "#76EDB2" : "#C6F6D5",
      };
    }
    if (ann.color === "red") {
      return {
        bg: active ? "#FF8A80" : "#FFCDD2",
      };
    }
    if (ann.color === "yellow") {
      return {
        bg: active ? "#FFE082" : "#FFF59D",
      };
    }
    if (ann.color === "blue") {
      return {
        bg: active ? "#A1C2FA" : "#C4E2FF",
      };
    }
    if (ann.color === "purple") {
      return {
        bg: active ? "#D5B4F1" : "#E8D5F6",
      };
    }
    if (ann.color === "orange") {
      return {
        bg: active ? "#FFCC80" : "#FFE0B2",
      };
    }
    if (ann.color === "pink") {
      return {
        bg: active ? "#F48FB1" : "#FBCFE8",
      };
    }
    if (ann.color === "mint") {
      return {
        bg: active ? "#80CBC4" : "#E0F2F1",
      };
    }
  }

  // 1. Chưa có verdict (đang tạo mới, đang nhập nhận xét, hoặc đang chờ AI phân tích) -> màu vàng
  if (!ann.verdict) {
    return {
      bg: active ? "#FFE082" : "#FFF59D",
    };
  }

  // 2. AI đồng ý -> green
  if (ann.verdict === "agree") {
    return {
      bg: active ? "#76EDB2" : "#C6F6D5",
    };
  }

  // 3. AI phản biện (chưa giải quyết) -> xanh dương/indigo
  if (ann.verdict === "dispute" && !ann.disputeDecision) {
    return {
      bg: active ? "#A1C2FA" : "#C4E2FF",
    };
  }

  // 4. Còn lại -> đỏ (đồng ý một phần, hoặc đã chọn Áp dụng/Bỏ qua phản biện)
  return {
    bg: active ? "#FF8A80" : "#FFCDD2",
  };
}

// Normalize a string for quote matching. Vietnamese text + browser
// selection can disagree on:
//   • Unicode normalization (NFC vs NFD — e.g. "đ" as one codepoint vs
//     "d" + combining mark). Selection.toString() sometimes returns NFD
//     while the source string from the backend transcript is NFC.
//   • Non-breaking spaces (\u00A0) — some renderers/copies insert these
//     in place of regular spaces.
// Normalizing both sides before indexOf makes the highlight resilient to
// these mismatches without changing the stored quote (we keep the raw
// teacher-selected text for display in the bubble).
function normalizeForMatch(s: string): string {
  return s.normalize("NFC").replace(/\u00A0/g, " ");
}

// renderLineWithHighlights — split a line into segments where each
// annotation's quote becomes a `<mark>` (colored per verdict) and the
// rest stays plain text. Annotations whose quote can't be found in
// any seg fall back to an invisible end-of-line anchor `<span>` so the
// AnnotationBubble still has a `[data-ann-id="…"]` element to query
// against and position itself — otherwise the bubble would be stranded
// off-screen and the teacher would think commenting didn't work.
function renderLineWithHighlights(
  line: string,
  anns: SelectionAnnotation[],
  lineIdx: number,
  activeAnnId: string | null,
  onClickMark: (id: string) => void,
): React.ReactNode[] {
  type Seg = { text: string; ann: SelectionAnnotation | null };
  let segs: Seg[] = [{ text: line, ann: null }];
  const unmatched: SelectionAnnotation[] = [];
  for (const ann of anns) {
    const next: Seg[] = [];
    let placed = false;
    // Multi-line selections: split the stored quote by line breaks and
    // pick the segment belonging to THIS row. Start row gets the first
    // segment, end row gets the last, middle rows highlight the whole
    // line. Single-line annotations keep the full quote as the needle.
    const endIdx = ann.endLineIdx ?? ann.lineIdx;
    const isMultiline = endIdx > ann.lineIdx;
    let needleSource: string;
    if (!isMultiline) {
      needleSource = ann.quote;
    } else if (lineIdx === ann.lineIdx) {
      // First line: highlight from the quote's first segment to end of
      // line. Fall back to the whole line when that segment doesn't map
      // cleanly — sel.toString() line separators vary across browsers, so
      // the split may not align with this line. The fallback guarantees
      // the line is still highlighted instead of silently dropped.
      const first = ann.quote.split("\n")[0] ?? "";
      needleSource =
        first && normalizeForMatch(line).includes(normalizeForMatch(first))
          ? first
          : line;
    } else if (lineIdx === endIdx) {
      const parts = ann.quote.split("\n");
      const last = parts[parts.length - 1] ?? "";
      needleSource =
        last && normalizeForMatch(line).includes(normalizeForMatch(last))
          ? last
          : line;
    } else {
      // Middle line — highlight the entire line. Using the line itself
      // as the needle guarantees indexOf hits at offset 0.
      needleSource = line;
    }
    const needle = normalizeForMatch(needleSource);
    for (const seg of segs) {
      if (seg.ann || placed) {
        next.push(seg);
        continue;
      }
      const haystack = normalizeForMatch(seg.text);
      const idx = haystack.indexOf(needle);
      if (idx === -1) {
        next.push(seg);
        continue;
      }
      // Use the haystack offset as the slice index — relies on
      // normalize("NFC") + nbsp→space preserving 1:1 char positions for
      // typical Vietnamese text. Both normalization steps are idempotent
      // and length-preserving on this input class.
      if (idx > 0) next.push({ text: seg.text.slice(0, idx), ann: null });
      next.push({ text: seg.text.slice(idx, idx + needleSource.length), ann });
      const tail = seg.text.slice(idx + needleSource.length);
      if (tail.length > 0) next.push({ text: tail, ann: null });
      placed = true;
    }
    segs = next;
    if (!placed) unmatched.push(ann);
  }
  const nodes = segs.map((seg, i) => {
    if (!seg.ann) return <span key={i}>{formatLine(seg.text, `rh-${lineIdx}-${i}`)}</span>;
    const active = activeAnnId === seg.ann.id;
    const colors = highlightColors(seg.ann, active);
    const annId = seg.ann.id;
    return (
      <mark
        key={i}
        data-ann-id={annId}
        onClick={(e) => {
          e.stopPropagation();
          onClickMark(annId);
        }}
        style={{
          background: colors.bg,
          color: T.text,
          padding: "1.5px 4px",
          margin: "0 1px",
          borderRadius: 3,
          cursor: "pointer",
          transition: "background 0.12s",
          textDecoration: colors.strike ? "line-through" : "none",
        }}
      >
        {formatLine(seg.text, `rh-${lineIdx}-m${i}`)}
      </mark>
    );
  });
  // Fallback anchors for annotations whose quote we couldn't find.
  // Invisible <mark> elements at end-of-line — the bubble's reposition
  // uses these as anchor and at least appears somewhere on the right
  // line. Teacher can still edit/delete; the visible highlight is
  // simply missing for that ann.
  for (const ann of unmatched) {
    const active = activeAnnId === ann.id;
    const annId = ann.id;
    nodes.push(
      <mark
        key={`fallback-${ann.id}`}
        data-ann-id={annId}
        onClick={(e) => {
          e.stopPropagation();
          onClickMark(annId);
        }}
        style={{
          background: active ? "rgba(192, 139, 48, 0.20)" : "transparent",
          padding: 0,
          margin: 0,
          // Tiny zero-width-ish anchor — present in the DOM so
          // getBoundingClientRect returns sensible coords, but
          // visually a no-op.
          display: "inline-block",
          width: 0,
          overflow: "hidden",
          cursor: "pointer",
        }}
        title={`Bình luận: ${ann.comment || "(chưa có)"}`}
      >
        {"​"}
      </mark>,
    );
  }
  return nodes;
}

// SelectionToolbar — floating mini-toolbar Word-style. Pinned to viewport
// coords so it survives scroll jitter; positioned just below the selection
// rect. Uses ``onMouseDown`` (not onClick) so the action fires before the
// browser collapses the selection.
function SelectionToolbar({
  selectionRange,
  onComment,
  onHighlight,
  onDismiss,
}: {
  selectionRange: Range;
  onComment: () => void;
  onHighlight: (color: "yellow" | "green" | "blue" | "red" | "purple" | "orange" | "pink" | "mint") => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [showColors, setShowColors] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: -9999,
    top: -9999,
  });

  const reposition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rects = selectionRange.getClientRects();
    const anchorRect =
      rects.length > 0 ? rects[0] : selectionRange.getBoundingClientRect();
    
    const x = anchorRect.left + anchorRect.width / 2;
    const y = anchorRect.bottom;
    
    const w = el.offsetWidth;
    const vw = window.innerWidth;
    const half = w / 2;
    const left = Math.max(half + 6, Math.min(vw - half - 6, x));
    
    setPos({ left, top: y + 8 });
  }, [selectionRange]);

  useLayoutEffect(() => {
    reposition();
  }, [reposition]);

  useEffect(() => {
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [reposition]);

  return (
    <div
      id="step3-selection-toolbar"
      ref={ref}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        transform: "translateX(-50%)",
        background: T.paper,
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: 4,
        zIndex: 50,
        fontFamily: T.font,
      }}
    >
      {/* 1. Bình luận */}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onComment();
        }}
        title="Tô vàng + thêm bình luận"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          fontSize: 12.5,
          fontWeight: 500,
          color: T.text,
          background: T.bgCard,
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          fontFamily: T.font,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = T.bgHover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = T.bgCard;
        }}
      >
        <svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: T.accent }}
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Bình luận
      </button>

      {/* Vertical divider */}
      <div style={{ width: 1, height: 16, background: T.border, margin: "0 2px" }} />

      {/* 2. Tô sáng Dropdown Button */}
      <div style={{ position: "relative", display: "inline-flex" }}>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            setShowColors((prev) => !prev);
          }}
          title="Chọn màu tô sáng..."
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            fontSize: 12.5,
            fontWeight: 500,
            color: T.text,
            background: showColors ? T.bgHover : T.bgCard,
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: T.font,
          }}
          onMouseEnter={(e) => {
            if (!showColors) e.currentTarget.style.background = T.bgHover;
          }}
          onMouseLeave={(e) => {
            if (!showColors) e.currentTarget.style.background = T.bgCard;
          }}
        >
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "#F59E0B" }}
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          Tô sáng
          <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 2 }}>▼</span>
        </button>

        {showColors && (
          <div
            id="step3-selection-toolbar-palette"
            style={{
              position: "absolute",
              top: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              marginTop: 6,
              background: T.paper,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 6,
              padding: 8,
              zIndex: 60,
              animation: "fadeUp 0.12s ease-out",
            }}
          >
            {/* White X block */}
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onComment(); // Default yellow comment with editing card opened
                setShowColors(false);
              }}
              title="Thêm bình luận (Mặc định không màu)"
              style={{
                width: 26,
                height: 26,
                borderRadius: 4,
                background: "#FFFDF8",
                border: "1px solid #D1D5DB",
                cursor: "pointer",
                padding: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 800,
                color: "#EF4444",
                transition: "all 0.12s ease",
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.12)"}
              onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
            >
              ×
            </button>

            {/* 8 Custom Color Blocks */}
            {[
              { value: "yellow", color: "#FFF59D", title: "Màu vàng (Lưu ý)" },
              { value: "green", color: "#C6F6D5", title: "Màu xanh lá (Đúng / Tốt)" },
              { value: "blue", color: "#C4E2FF", title: "Màu xanh dương (Khác)" },
              { value: "red", color: "#FFCDD2", title: "Màu đỏ (Lỗi sai)" },
              { value: "purple", color: "#E8D5F6", title: "Màu tím (Lập luận)" },
              { value: "orange", color: "#FFE0B2", title: "Màu cam (Diễn đạt)" },
              { value: "pink", color: "#FBCFE8", title: "Màu hồng (Sáng tạo)" },
              { value: "mint", color: "#E0F2F1", title: "Màu xanh bạc hà (Ý hay)" },
            ].map((p) => (
              <button
                key={p.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onHighlight(p.value as any);
                  setShowColors(false);
                }}
                title={p.title}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 4,
                  background: p.color,
                  border: "1px solid #D1D5DB",
                  cursor: "pointer",
                  padding: 0,
                  transition: "transform 0.12s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.12)"}
                onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
              />
            ))}
          </div>
        )}
      </div>

      {/* Vertical divider */}
      <div style={{ width: 1, height: 16, background: T.border, margin: "0 2px" }} />

      {/* 3. Dismiss */}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onDismiss();
        }}
        aria-label="Bỏ qua"
        title="Bỏ qua"
        style={{
          width: 24,
          height: 24,
          border: "none",
          background: "transparent",
          color: T.textFaint,
          cursor: "pointer",
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 4,
          transition: "color 0.12s, background 0.12s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = T.text;
          e.currentTarget.style.background = T.bgHover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = T.textFaint;
          e.currentTarget.style.background = "transparent";
        }}
      >
        <svg
          width={10}
          height={10}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// AnnotationBubble — floating popover anchored to the highlighted
// `<mark>` whose id matches ``ann.id``. Positions itself to the right/left
// (preferring side-alignment when space is available to keep the document
// readable), and falls back to bottom/top when space is limited.
// Repositions on scroll/resize.
function AnnotationBubble({
  ann,
  containerRef,
  editing,
  analyzing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onRemove,
  onDecideDispute,
  t,
}: {
  ann: SelectionAnnotation;
  containerRef: React.RefObject<HTMLDivElement>;
  editing: boolean;
  analyzing: boolean;
  onStartEdit: () => void;
  onCancelEdit: (currentComment: string) => void;
  onSave: (comment: string, color?: "yellow" | "green" | "blue" | "red" | "purple" | "orange" | "pink" | "mint") => void;
  onRemove: () => void;
  onDecideDispute: (decision: "apply" | "skip") => void;
  t: I18nStrings;
}) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  // Start off-screen so the bubble is rendered + interactive + focusable
  // immediately (no opacity/pointer-events gating), but invisible until
  // useLayoutEffect finds the anchor mark and sets the real position.
  // Off-screen position is preserved across renders that haven't yet
  // located the mark — never a (0,0) flash, never a stuck-at-fallback
  // dead bubble.
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: -9999,
    top: -9999,
  });
  const [arrowPos, setArrowPos] = useState<{
    leftOrTop: number;
    placement: "top" | "bottom" | "left" | "right";
  }>({
    leftOrTop: 20,
    placement: "top",
  });

  // Try to position. Returns true on success (mark found + measured),
  // false otherwise so the caller can decide to retry next frame.
  const reposition = useCallback((): boolean => {
    const mark = document.querySelector(`mark[data-ann-id="${ann.id}"]`);
    const bubble = bubbleRef.current;
    const container = containerRef.current;
    if (!bubble || !container) return false;
    const bubbleRect = bubble.getBoundingClientRect();
    if (bubbleRect.width === 0 || bubbleRect.height === 0) return false;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    
    // No mark found → center the bubble in the viewport
    if (!(mark instanceof HTMLElement)) {
      const containerRect = container.getBoundingClientRect();
      const viewportTop = -containerRect.top;
      const viewportLeft = -containerRect.left;
      setPos({
        left: viewportLeft + Math.max(8, (vw - bubbleRect.width) / 2),
        top: viewportTop + Math.max(8, (vh - bubbleRect.height) / 2),
      });
      setArrowPos({ leftOrTop: 0, placement: "top" });
      return true;
    }
    const containerRect = container.getBoundingClientRect();
    const markRect = mark.getBoundingClientRect();
    const bubbleWidth = bubbleRect.width;
    const bubbleHeight = bubbleRect.height;
    
    // Viewport boundaries in container coordinates
    const viewportTop = -containerRect.top;
    const viewportBottom = -containerRect.top + vh;
    
    const localMarkTop = markRect.top - containerRect.top;
    const localMarkLeft = markRect.left - containerRect.left;
    const localMarkRight = markRect.right - containerRect.left;
    
    let left = -9999;
    let top = -9999;
    let placement: "top" | "bottom" | "left" | "right" = "top";
    let leftOrTop = 0;

    // Check if the highlight itself is visible in the viewport
    const isHighlightVisible = markRect.bottom > 0 && markRect.top < vh;

    // 1. Try RIGHT placement: Card on the right of highlighted mark (arrow on the left of bubble pointing left)
    if (markRect.right + 8 + bubbleWidth < vw - 12) {
      left = localMarkRight + 8;
      top = localMarkTop + markRect.height / 2 - bubbleHeight / 2;
      
      if (isHighlightVisible) {
        const minTop = viewportTop + 8;
        const maxTop = viewportBottom - bubbleHeight - 8;
        top = Math.max(minTop, Math.min(maxTop, top));
      }
      placement = "left"; // Arrow on the left edge of the bubble

      const markCenterY = localMarkTop + markRect.height / 2;
      const arrowTop = markCenterY - top;
      leftOrTop = Math.max(16, Math.min(bubbleHeight - 16, arrowTop));
    }
    // 2. Try LEFT placement: Card on the left of highlighted mark (arrow on the right of bubble pointing right)
    else if (markRect.left - 8 - bubbleWidth > 12) {
      left = localMarkLeft - 8 - bubbleWidth;
      top = localMarkTop + markRect.height / 2 - bubbleHeight / 2;
      
      if (isHighlightVisible) {
        const minTop = viewportTop + 8;
        const maxTop = viewportBottom - bubbleHeight - 8;
        top = Math.max(minTop, Math.min(maxTop, top));
      }
      placement = "right"; // Arrow on the right edge of the bubble

      const markCenterY = localMarkTop + markRect.height / 2;
      const arrowTop = markCenterY - top;
      leftOrTop = Math.max(16, Math.min(bubbleHeight - 16, arrowTop));
    }
    // 3. Fallback to BOTTOM / TOP placement (classic tooltip style under/above)
    else {
      left = localMarkLeft + markRect.width / 2 - bubbleWidth / 2;
      const localMinLeft = -containerRect.left + 8;
      const localMaxLeft = -containerRect.left + vw - bubbleWidth - 8;
      left = Math.max(localMinLeft, Math.min(localMaxLeft, left));
      
      top = localMarkTop + markRect.height + 8;
      placement = "top"; // Arrow on the top edge of the bubble
      
      if (top + bubbleHeight > viewportBottom - 8) {
        const above = localMarkTop - bubbleHeight - 8;
        if (above >= viewportTop + 8) {
          top = above;
          placement = "bottom"; // Arrow on the bottom edge of the bubble
        } else {
          if (isHighlightVisible) {
            top = Math.max(viewportTop + 8, viewportBottom - bubbleHeight - 8);
          }
          placement = "top";
        }
      }
      
      const markCenterX = localMarkLeft + markRect.width / 2;
      const arrowLeft = markCenterX - left;
      leftOrTop = Math.max(16, Math.min(bubbleWidth - 16, arrowLeft));
    }

    setPos({ left, top });
    setArrowPos({ leftOrTop, placement });
    return true;
  }, [ann.id, containerRef]);

  // Position after each commit. If the first attempt fails (bubble not
  // yet measured), schedule a retry on the next animation frame. Mark
  // missing is handled inside reposition() via a viewport-center fallback.
  useLayoutEffect(() => {
    if (reposition()) return;
    const raf = requestAnimationFrame(() => {
      reposition();
    });
    return () => cancelAnimationFrame(raf);
  }, [reposition, ann.comment, ann.verdict, ann.analysis, editing]);

  useEffect(() => {
    const handler = () => reposition();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [reposition]);

  // Reposition whenever the bubble's dimensions change (e.g., expanding AI analysis details)
  useEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble) return;
    const observer = new ResizeObserver(() => {
      reposition();
    });
    observer.observe(bubble);
    return () => {
      observer.disconnect();
    };
  }, [reposition]);

  return (
    <div
      id="step3-annotation-bubble"
      ref={bubbleRef}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left: pos.left,
        top: pos.top,
        width: "min(420px, calc(100vw - 32px))",
        zIndex: 100,
        display: "flex",
        flexDirection:
          arrowPos.placement === "left"
            ? "row"
            : arrowPos.placement === "right"
              ? "row-reverse"
              : arrowPos.placement === "top"
                ? "column"
                : "column-reverse",
        alignItems:
          arrowPos.placement === "left" || arrowPos.placement === "right"
            ? "flex-start"
            : "stretch",
      }}
    >
      {arrowPos.leftOrTop > 0 && (
        <div
          style={{
            position: "relative",
            left:
              arrowPos.placement === "top" || arrowPos.placement === "bottom"
                ? arrowPos.leftOrTop
                : undefined,
            top:
              arrowPos.placement === "left" || arrowPos.placement === "right"
                ? arrowPos.leftOrTop
                : undefined,
            transform:
              arrowPos.placement === "top" || arrowPos.placement === "bottom"
                ? "translateX(-50%)"
                : "translateY(-50%)",
            zIndex: 101,
            // Negative margins overlap border smoothly
            marginTop: arrowPos.placement === "top" ? 0 : arrowPos.placement === "bottom" ? -1 : undefined,
            marginBottom: arrowPos.placement === "bottom" ? 0 : arrowPos.placement === "top" ? -1 : undefined,
            marginLeft: arrowPos.placement === "left" ? 0 : arrowPos.placement === "right" ? -1 : undefined,
            marginRight: arrowPos.placement === "right" ? 0 : arrowPos.placement === "left" ? -1 : undefined,
          }}
        >
          {arrowPos.placement === "top" && (
            <svg width="16" height="8" viewBox="0 0 16 8" style={{ display: "block" }}>
              <path d="M0 8 L8 0 L16 8 Z" fill="#FAF7ED" stroke="#E6DEC9" strokeWidth="1" />
              <line x1="1.2" y1="8" x2="14.8" y2="8" stroke="#FAF7ED" strokeWidth="2" />
            </svg>
          )}
          {arrowPos.placement === "bottom" && (
            <svg width="16" height="8" viewBox="0 0 16 8" style={{ display: "block" }}>
              <path d="M0 0 L8 8 L16 0 Z" fill="#FAF7ED" stroke="#E6DEC9" strokeWidth="1" />
              <line x1="1.2" y1="0" x2="14.8" y2="0" stroke="#FAF7ED" strokeWidth="2" />
            </svg>
          )}
          {arrowPos.placement === "left" && (
            <svg width="8" height="16" viewBox="0 0 8 16" style={{ display: "block" }}>
              <path d="M8 0 L0 8 L8 16 Z" fill="#FAF7ED" stroke="#E6DEC9" strokeWidth="1" />
              <line x1="8" y1="1.2" x2="8" y2="14.8" stroke="#FAF7ED" strokeWidth="2" />
            </svg>
          )}
          {arrowPos.placement === "right" && (
            <svg width="8" height="16" viewBox="0 0 8 16" style={{ display: "block" }}>
              <path d="M0 0 L8 8 L0 16 Z" fill="#FAF7ED" stroke="#E6DEC9" strokeWidth="1" />
              <line x1="0" y1="1.2" x2="0" y2="14.8" stroke="#FAF7ED" strokeWidth="2" />
            </svg>
          )}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0, width: "100%" }}>
        <AnnotationCard
          ann={ann}
          editing={editing}
          analyzing={analyzing}
          onStartEdit={onStartEdit}
          onCancelEdit={onCancelEdit}
          onSave={onSave}
          onRemove={onRemove}
          onDecideDispute={onDecideDispute}
          t={t}
        />
      </div>
    </div>
  );
}

// AnnotationCard — renders inside the AnnotationBubble. Pure
// presentation: shows the quote + teacher's comment + (verdict row when
// applicable). Verdict's own collapse (pill click → analysis) lives
// inside VerdictRow.
function AnnotationCard({
  ann,
  editing,
  analyzing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onRemove,
  onDecideDispute,
  t,
}: {
  ann: SelectionAnnotation;
  editing: boolean;
  analyzing: boolean;
  onStartEdit: () => void;
  onCancelEdit: (currentComment: string) => void;
  onSave: (comment: string, color?: "yellow" | "green" | "blue" | "red" | "purple" | "orange" | "pink" | "mint") => void;
  onRemove: () => void;
  onDecideDispute: (decision: "apply" | "skip") => void;
  t: I18nStrings;
}) {
  const [draft, setDraft] = useState(ann.comment);
  const [selectedColor, setSelectedColor] = useState<"yellow" | "green" | "blue" | "red" | "purple" | "orange" | "pink" | "mint" | undefined>(ann.color);

  useEffect(() => {
    setDraft(ann.comment);
    setSelectedColor(ann.color);
  }, [ann.comment, ann.color, editing]);

  // Explicit input-focus on each entry into edit mode. ``autoFocus`` only
  // fires on the input's first mount; without this effect, re-entering
  // edit mode from display mode (or hopping between annotations) would
  // leave focus on the previously-focused element.
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing && inputRef.current) {
      // Defer one frame so the bubble's layout-effect-driven repositioning
      // settles before we call focus — keeps the page from scroll-jumping
      // when the input is offscreen mid-mount.
      const t = requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
      return () => cancelAnimationFrame(t);
    }
  }, [editing]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "16px 20px",
        background: "#FAF7ED",
        border: "1px solid #E6DEC9",
        borderRadius: 12,
        boxShadow: T.shadowStrong,
      }}
    >
      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: T.textMute,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                fontFamily: T.display,
              }}
            >
              {String(t.teacherCommentLabel ?? "Nhận xét của giáo viên")}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onSave(draft, selectedColor);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    onCancelEdit(draft);
                  }
                }}
                placeholder="Ghi nhận xét của bạn..."
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  background: "#FFFDF8",
                  fontFamily: T.font,
                  fontSize: 14,
                  color: T.text,
                  outline: "none",
                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)",
                }}
              />
              <button
                type="button"
                onClick={() => onSave(draft, selectedColor)}
                disabled={!draft.trim() && !selectedColor}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: (draft.trim() || selectedColor) ? T.green : "#EBE7DF",
                  color: (draft.trim() || selectedColor) ? "#fff" : T.textMute,
                  fontFamily: T.font,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: (draft.trim() || selectedColor) ? "pointer" : "not-allowed",
                  transition: "all 0.15s ease",
                }}
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: T.textMute,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontFamily: T.display,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%"
            }}
          >
            <span>{String(t.teacherCommentLabel ?? "Nhận xét của giáo viên")}</span>
            {ann.color && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  color:
                    ann.color === "green" ? "#10B981" :
                    ann.color === "red" ? "#EF4444" :
                    ann.color === "yellow" ? "#D97706" :
                    ann.color === "blue" ? "#2563EB" :
                    ann.color === "purple" ? "#7C3AED" :
                    ann.color === "orange" ? "#EA580C" :
                    ann.color === "pink" ? "#DB2777" :
                    "#0D9488",
                  background:
                    ann.color === "green" ? "#ECFDF5" :
                    ann.color === "red" ? "#FEE2E2" :
                    ann.color === "yellow" ? "#FEF3C7" :
                    ann.color === "blue" ? "#EFF6FF" :
                    ann.color === "purple" ? "#F5F3FF" :
                    ann.color === "orange" ? "#FFF7ED" :
                    ann.color === "pink" ? "#FDF2F8" :
                    "#F0FDFA",
                  padding: "2px 6px",
                  borderRadius: 4,
                  border: `1px solid ${
                    ann.color === "green" ? "#A7F3D0" :
                    ann.color === "red" ? "#FECACA" :
                    ann.color === "yellow" ? "#FDE68A" :
                    ann.color === "blue" ? "#BFDBFE" :
                    ann.color === "purple" ? "#DDD6FE" :
                    ann.color === "orange" ? "#FFEDD5" :
                    ann.color === "pink" ? "#FBCFE8" :
                    "#CCFBF1"
                  }`,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background:
                      ann.color === "green" ? "#10B981" :
                      ann.color === "red" ? "#EF4444" :
                      ann.color === "yellow" ? "#F59E0B" :
                      ann.color === "blue" ? "#3B82F6" :
                      ann.color === "purple" ? "#8B5CF6" :
                      ann.color === "orange" ? "#F97316" :
                      ann.color === "pink" ? "#EC4899" :
                      "#14B8A6",
                  }}
                />
                {ann.color === "green" ? "Đúng / Tốt" :
                 ann.color === "red" ? "Lỗi sai" :
                 ann.color === "yellow" ? "Lưu ý" :
                 ann.color === "blue" ? "Khác" :
                 ann.color === "purple" ? "Lập luận" :
                 ann.color === "orange" ? "Diễn đạt" :
                 ann.color === "pink" ? "Sáng tạo" :
                 "Ý hay"}
              </span>
            )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              width: "100%",
            }}
          >
            <span
              style={{
                flex: 1,
                whiteSpace: "pre-wrap",
                minWidth: 0,
                color: T.text,
                fontSize: 15,
                fontWeight: 600,
                lineHeight: 1.5,
                cursor: "text",
              }}
              onClick={onStartEdit}
              role="button"
              tabIndex={0}
            >
              {ann.comment || (
                <span style={{ color: T.textFaint, fontStyle: "italic", fontWeight: 400 }}>
                  Tô sáng đơn thuần (Bấm để viết bình luận...)
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={onRemove}
              title="Xoá"
              style={{
                flexShrink: 0,
                width: 22,
                height: 22,
                borderRadius: "50%",
                border: "none",
                background: "transparent",
                color: T.textFaint,
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "color 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = T.red;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = T.textFaint;
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
      {/* Verdict block — always rendered inside the bubble. The pill
          itself owns the analysis collapse (click pill → expand
          analysis). Hidden only in edit mode to keep the input focused. */}
      {!editing && ann.comment && (
        <VerdictRow
          analyzing={analyzing}
          verdict={ann.verdict}
          analysis={ann.analysis}
          disputeDecision={ann.disputeDecision}
          onDecideDispute={onDecideDispute}
          t={t}
        />
      )}
    </div>
  );
}

// VerdictRow + VERDICT_TONE live in components/VerdictRow.tsx.

// Step3Toolbar + ToolbarButton + PrinterIcon live in components/Step3Toolbar.tsx.

// MucLucSidebar lives in components/MucLucSidebar.tsx.



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
