import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import { T } from "../../theme/tokens";
import { Icon } from "../../components/ui/Icon";
import { OriginalImageModal } from "../../components/ui/OriginalImageModal";
import { getStageableLesson } from "../../lib/hitl";
import { analyzeComment } from "../../api";
import { useIsMobile } from "../../hooks/useIsMobile";
import { MOCK_REVIEW } from "./__mocks__/review.mock";
import type { MockQuestion, ReviewPayload } from "./types";
import {
  alignByQuestionNumber,
  buildAnalyzeQuestionContext,
  deriveStepReviewData,
  normalizeAiAnalysisText,
  parseIntoQuestions,
} from "./utils";
import { MucLucSidebar } from "./components/MucLucSidebar";
import { BanChamAiModal } from "./components/BanChamAiModal";
import { Step3Toolbar } from "./components/Step3Toolbar";
import { PaperHead } from "./components/PaperHead";
import { QuestionBox } from "./components/QuestionBox";
import { VerdictRow } from "./components/VerdictRow";
import type {
  BackendSubject,
  CommentThreads,
  CommentVerdict,
  EssayFile,
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

// MOCK_REVIEW + Mock* type fixtures live in __mocks__/review.mock.ts.
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
  onGoToRegrade,
}: {
  isMobile: boolean;
  review?: ReviewPayload;
  onViewOriginal?: () => void;
  essayAvailable?: boolean;
  teacherAnnotations?: SelectionAnnotation[];
  onAddAnnotation?: (a: SelectionAnnotation) => void;
  onUpdateAnnotation?: (id: string, patch: Partial<SelectionAnnotation>) => void;
  onRemoveAnnotation?: (id: string) => void;
  /** Forward to step 4 — used by the "Bản chấm AI" peek modal's CTA so
   *  teacher can jump straight to scoring after revealing AI's verdict. */
  onGoToRegrade?: () => void;
}) {
  const [activeQ, setActiveQ] = useState<number>(review.initialActiveQuestionNum);
  // Rail can be collapsed to a pull-tab so the teacher can reclaim full
  // page width on long transcripts. Mobile starts collapsed (paper first).
  const [tocOpen, setTocOpen] = useState(!isMobile);
  const [aiPeekOpen, setAiPeekOpen] = useState(false);
  // ``flashCau`` drives a brief peach pulse on the câu in the document
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
  return (
    <div>
      <Step3Toolbar
        review={review}
        onViewOriginal={onViewOriginal}
        essayAvailable={essayAvailable}
        onPeekAi={() => setAiPeekOpen(true)}
      />
      <div
        style={{
          display: isMobile ? "block" : "grid",
          gridTemplateColumns: isMobile
            ? undefined
            : tocOpen
              ? "180px minmax(0, 1fr)"
              : "24px minmax(0, 1fr)",
          gap: tocOpen ? 24 : 12,
          alignItems: "start",
          transition: "grid-template-columns 0.18s ease, gap 0.18s ease",
        }}
      >
        {!isMobile && (
          <MucLucSidebar
            review={review}
            activeQ={activeQ}
            onJumpToCau={jumpToCau}
            teacherAnnotations={teacherAnnotations}
            collapsed={!tocOpen}
            onToggle={() => setTocOpen((v) => !v)}
          />
        )}
        <PaperContainer
          review={review}
          flashCau={flashCau}
          teacherAnnotations={teacherAnnotations}
          onAddAnnotation={onAddAnnotation}
          onUpdateAnnotation={onUpdateAnnotation}
          onRemoveAnnotation={onRemoveAnnotation}
        />
      </div>
      <BanChamAiModal
        open={aiPeekOpen}
        onClose={() => setAiPeekOpen(false)}
        review={review}
        onGoToRegrade={onGoToRegrade}
      />
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
}) {
  return (
    <div
      style={{
        background: T.paper,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        boxShadow: T.shadowSoft,
        minWidth: 0,
        // overflow:hidden keeps the elevated paper-head bg clipped to the
        // outer rounded corners — without it the head bleeds past the radius.
        overflow: "hidden",
      }}
    >
      <PaperHead review={review} />
      <div style={{ padding: "16px 20px 4px" }}>
        <AnnotatedAnswer
          questions={review.questions}
          flashCau={flashCau}
          teacherAnnotations={teacherAnnotations}
          onAddAnnotation={onAddAnnotation}
          onUpdateAnnotation={onUpdateAnnotation}
          onRemoveAnnotation={onRemoveAnnotation}
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
// reads blind and only reveals AI's verdict at step 4 or via the
// "Bản chấm AI" peek modal in the toolbar.
function AnnotatedAnswer({
  questions,
  flashCau,
  teacherAnnotations,
  onAddAnnotation,
  onUpdateAnnotation,
  onRemoveAnnotation,
}: {
  questions: MockQuestion[];
  /** Câu number to briefly pulse with a peach background. Set by the
   *  mục lục jump action; auto-clears after ~1.2s. */
  flashCau: number | null;
  teacherAnnotations?: SelectionAnnotation[];
  onAddAnnotation?: (a: SelectionAnnotation) => void;
  onUpdateAnnotation?: (id: string, patch: Partial<SelectionAnnotation>) => void;
  onRemoveAnnotation?: (id: string) => void;
}) {
  // Floating mini-toolbar state. ``pending`` captures the selection
  // snapshot at the moment of mouseup so it survives the click on the
  // "Bình luận" button (browsers collapse the native selection as soon
  // as focus leaves the text). ``x``/``y`` are viewport coords.
  const [pending, setPending] = useState<
    | {
        cau: number;
        lineIdx: number;
        endLineIdx: number;
        quote: string;
        x: number;
        y: number;
      }
    | null
  >(null);
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
    async (id: string, cau: number, comment: string) => {
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
        });
        if (!mountedRef.current) return;
        onUpdateAnnotation(id, {
          verdict: (data.verdict as CommentVerdict) || "agree",
          analysis: (data.analysis || "").trim(),
          lesson: (data.lesson || "").trim(),
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
    [questions, onUpdateAnnotation],
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
    const startLine = (range.startContainer.parentElement?.closest(
      "[data-cau][data-line]",
    ) as HTMLElement) || null;
    const endLine = (range.endContainer.parentElement?.closest(
      "[data-cau][data-line]",
    ) as HTMLElement) || null;
    if (!startLine) {
      setPending(null);
      return;
    }
    // Allow selections that span multiple lines within the same câu
    // (teacher often highlights a 2–3 line block when commenting on a
    // multi-step proof). Cross-câu selections are still rejected — those
    // would need to stage two separate lessons. The annotation is anchored
    // to the START line; the highlight renders best-effort per line.
    if (endLine && endLine !== startLine) {
      if (startLine.dataset.cau !== endLine.dataset.cau) {
        setPending(null);
        return;
      }
    }
    const cau = Number(startLine.dataset.cau);
    const lineIdx = Number(startLine.dataset.line);
    if (Number.isNaN(cau) || Number.isNaN(lineIdx)) {
      setPending(null);
      return;
    }
    const endLineRaw = endLine
      ? Number(endLine.dataset.line)
      : lineIdx;
    const endLineIdx = Number.isNaN(endLineRaw) ? lineIdx : endLineRaw;
    // Anchor the toolbar to the FIRST visual line of the selection, not
    // the whole bounding box. For multi-line selections, getBoundingClientRect
    // returns a rect spanning every line — its .bottom is the bottom of the
    // last line, which would push the toolbar far away from the highlight.
    // getClientRects()[0] is the first line's rect, so the toolbar sits
    // right under where the teacher started selecting.
    const rects = range.getClientRects();
    const anchorRect =
      rects.length > 0 ? rects[0] : range.getBoundingClientRect();
    setPending({
      cau,
      lineIdx,
      endLineIdx,
      quote: trimmed,
      x: anchorRect.left + anchorRect.width / 2,
      y: anchorRect.bottom,
    });
  }, [onAddAnnotation]);

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

  // Locate the active annotation across all câu for the bubble — null
  // means no bubble open.
  const activeAnn = activeAnnId
    ? (teacherAnnotations ?? []).find((a) => a.id === activeAnnId) ?? null
    : null;

  // Outside-click dismiss for the bubble. Skips clicks on any <mark>,
  // inside the bubble itself, AND the selection toolbar — without the
  // toolbar skip, clicking "Bình luận" to create a 2nd annotation would
  // race with this handler: button click bubbles up → handler sees the
  // prior empty annotation → removes it + resets state → final activeAnnId
  // ends up null and the new bubble never shows. If the teacher leaves
  // an empty comment behind by clicking truly outside, the annotation is
  // dropped — keeps the corpus free of placeholder rows.
  useEffect(() => {
    if (!activeAnnId) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("mark[data-ann-id]")) return;
      if (target.closest("#step3-annotation-bubble")) return;
      if (target.closest("#step3-selection-toolbar")) return;
      // Discard if the bubble is hosting an unfinished new annotation.
      if (activeAnn && !activeAnn.comment.trim()) {
        onRemoveAnnotation?.(activeAnn.id);
      }
      setActiveAnnId(null);
      setEditingId(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [activeAnnId, activeAnn, onRemoveAnnotation]);

  // Escape closes the bubble (mirrors outside-click).
  useEffect(() => {
    if (!activeAnnId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (activeAnn && !activeAnn.comment.trim()) {
        onRemoveAnnotation?.(activeAnn.id);
      }
      setActiveAnnId(null);
      setEditingId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeAnnId, activeAnn, onRemoveAnnotation]);

  return (
    <div
      ref={containerRef}
      onMouseUp={handleMouseUp}
      style={{
        fontFamily: T.mono,
        fontSize: 16,
        color: T.textSoft,
        lineHeight: 1.85,
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
              padding: "14px 16px",
              margin: "0 -16px 18px",
              borderRadius: 8,
              background: flashing ? "#FBEEEA" : "transparent",
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
          x={pending.x}
          y={pending.y}
          onComment={commitPending}
          onDismiss={() => setPending(null)}
        />
      )}
      {activeAnn && (
        <AnnotationBubble
          ann={activeAnn}
          editing={editingId === activeAnn.id}
          analyzing={analyzingIds.has(activeAnn.id)}
          onStartEdit={() => setEditingId(activeAnn.id)}
          onCancelEdit={(currentComment) => {
            if (!currentComment.trim()) {
              onRemoveAnnotation?.(activeAnn.id);
              setActiveAnnId(null);
            }
            setEditingId(null);
          }}
          onSave={(comment) => {
            const trimmed = comment.trim();
            if (!trimmed) {
              onRemoveAnnotation?.(activeAnn.id);
              setActiveAnnId(null);
              setEditingId(null);
              return;
            }
            onUpdateAnnotation?.(activeAnn.id, {
              comment: trimmed,
              verdict: undefined,
              analysis: undefined,
              lesson: undefined,
              disputeDecision: undefined,
            });
            setEditingId(null);
            void analyzeAnnotation(activeAnn.id, activeAnn.cau, trimmed);
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
  borderColor?: string;
  strike?: boolean;
} {
  // No verdict yet (analyzing or backend error) → default peach.
  if (!ann.verdict) {
    return { bg: active ? "#F8C9B9" : "#FBEEEA" };
  }
  if (ann.verdict === "dispute" && ann.disputeDecision === "skip") {
    return { bg: active ? "#E3DDD3" : "#EFE9DF", strike: true };
  }
  if (ann.verdict === "agree") {
    return { bg: active ? "#C9E8D6" : "#E3F4EA" };
  }
  if (ann.verdict === "partial") {
    return { bg: active ? "#F7E2A8" : "#FCF1D8" };
  }
  // dispute (pending or applied) — same warm-red base; applied gets a
  // border so the teacher sees their override is locked in.
  return {
    bg: active ? "#F7C8BF" : "#FBE3DF",
    borderColor: ann.disputeDecision === "apply" ? "#A1392A" : undefined,
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
      needleSource = ann.quote.split("\n")[0] ?? ann.quote;
    } else if (lineIdx === endIdx) {
      const parts = ann.quote.split("\n");
      needleSource = parts[parts.length - 1] ?? ann.quote;
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
    if (!seg.ann) return <span key={i}>{seg.text}</span>;
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
          padding: 0,
          borderRadius: 0,
          cursor: "pointer",
          transition: "background 0.12s",
          textDecoration: colors.strike ? "line-through" : "none",
          border: colors.borderColor
            ? `1px solid ${colors.borderColor}`
            : "1px solid transparent",
        }}
      >
        {seg.text}
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
  x,
  y,
  onComment,
  onDismiss,
}: {
  x: number;
  y: number;
  onComment: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState({ left: x, top: y + 8 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const vw = window.innerWidth;
    const half = w / 2;
    const left = Math.max(half + 6, Math.min(vw - half - 6, x));
    setClamped({ left, top: y + 8 });
  }, [x, y]);
  return (
    <div
      id="step3-selection-toolbar"
      ref={ref}
      style={{
        position: "fixed",
        left: clamped.left,
        top: clamped.top,
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
          e.currentTarget.style.background = "#FBEEEA";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = T.bgCard;
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 12,
            height: 12,
            background: "#FBEEEA",
            border: `1px solid ${T.accent}`,
            borderRadius: 2,
          }}
        />
        Bình luận
      </button>
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
          fontSize: 14,
          borderRadius: 4,
        }}
      >
        ×
      </button>
    </div>
  );
}

// AnnotationBubble — floating popover anchored to the highlighted
// `<mark>` whose id matches ``ann.id``. Positions itself below the mark
// (preferring below; flips above when there isn't enough space), clamped
// to the viewport. Repositions on scroll/resize. The bubble owns ONE
// annotation at a time — clicking a different mark switches the bubble
// via the parent's ``activeAnnId`` state, not via remounting.
function AnnotationBubble({
  ann,
  editing,
  analyzing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onRemove,
  onDecideDispute,
}: {
  ann: SelectionAnnotation;
  editing: boolean;
  analyzing: boolean;
  onStartEdit: () => void;
  onCancelEdit: (currentComment: string) => void;
  onSave: (comment: string) => void;
  onRemove: () => void;
  onDecideDispute: (decision: "apply" | "skip") => void;
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

  // Try to position. Returns true on success (mark found + measured),
  // false otherwise so the caller can decide to retry next frame.
  const reposition = useCallback((): boolean => {
    const mark = document.querySelector(`mark[data-ann-id="${ann.id}"]`);
    const bubble = bubbleRef.current;
    if (!bubble) return false;
    const bubbleRect = bubble.getBoundingClientRect();
    if (bubbleRect.width === 0 || bubbleRect.height === 0) return false;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // No mark found → center the bubble in the viewport so the teacher
    // always has somewhere to type. Without this fallback the bubble
    // would stay at (-9999, -9999) and look like the button did nothing.
    if (!(mark instanceof HTMLElement)) {
      setPos({
        left: Math.max(8, (vw - bubbleRect.width) / 2),
        top: Math.max(8, (vh - bubbleRect.height) / 2),
      });
      return true;
    }
    const markRect = mark.getBoundingClientRect();
    let left = markRect.left + markRect.width / 2 - bubbleRect.width / 2;
    left = Math.max(8, Math.min(vw - bubbleRect.width - 8, left));
    let top = markRect.bottom + 6;
    if (top + bubbleRect.height > vh - 8) {
      const above = markRect.top - bubbleRect.height - 6;
      if (above >= 8) {
        top = above;
      } else {
        // Neither below nor above fits cleanly — clamp to viewport so
        // the bubble stays visible instead of hanging off the bottom.
        top = Math.max(8, vh - bubbleRect.height - 8);
      }
    }
    setPos({ left, top });
    return true;
  }, [ann.id]);

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

  return (
    <div
      id="step3-annotation-bubble"
      ref={bubbleRef}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        width: "min(420px, calc(100vw - 32px))",
        zIndex: 100,
      }}
    >
      <AnnotationCard
        ann={ann}
        editing={editing}
        analyzing={analyzing}
        onStartEdit={onStartEdit}
        onCancelEdit={onCancelEdit}
        onSave={onSave}
        onRemove={onRemove}
        onDecideDispute={onDecideDispute}
      />
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
}: {
  ann: SelectionAnnotation;
  editing: boolean;
  analyzing: boolean;
  onStartEdit: () => void;
  onCancelEdit: (currentComment: string) => void;
  onSave: (comment: string) => void;
  onRemove: () => void;
  onDecideDispute: (decision: "apply" | "skip") => void;
}) {
  const [draft, setDraft] = useState(ann.comment);
  useEffect(() => {
    setDraft(ann.comment);
  }, [ann.comment, editing]);

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
        gap: 6,
        padding: "10px 12px",
        background: T.paper,
        border: `1px solid ${T.border}`,
        borderLeft: `3px solid ${T.accent}`,
        borderRadius: 2,
        boxShadow: "0 4px 14px rgba(0,0,0,0.10)",
      }}
    >
      {editing ? (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSave(draft);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCancelEdit(draft);
              }
            }}
            placeholder="Ghi nhận xét của bạn…"
            style={{
              flex: 1,
              padding: "6px 10px",
              borderRadius: 2,
              border: `1px solid ${T.border}`,
              background: T.paper,
              fontFamily: T.font,
              fontSize: 13.5,
              color: T.text,
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={!draft.trim()}
            style={{
              padding: "6px 12px",
              borderRadius: 2,
              border: "none",
              background: draft.trim() ? T.accent : T.borderLight,
              color: draft.trim() ? "#fff" : T.textFaint,
              fontFamily: T.font,
              fontSize: 13,
              fontWeight: 600,
              cursor: draft.trim() ? "pointer" : "not-allowed",
            }}
          >
            Lưu
          </button>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <span
            style={{
              flex: 1,
              whiteSpace: "pre-wrap",
              minWidth: 0,
              color: T.text,
              lineHeight: 1.5,
              cursor: "text",
            }}
            onClick={onStartEdit}
            role="button"
            tabIndex={0}
          >
            {ann.comment || (
              <span style={{ color: T.textFaint, fontStyle: "italic" }}>
                Bấm để thêm nhận xét
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
            }}
          >
            ×
          </button>
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
        />
      )}
    </div>
  );
}

// VerdictRow + VERDICT_TONE live in components/VerdictRow.tsx.

// Step3Toolbar + ToolbarButton + PrinterIcon live in components/Step3Toolbar.tsx.

// MucLucSidebar lives in components/MucLucSidebar.tsx.

// BanChamAiModal lives in components/BanChamAiModal.tsx.



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
  /** Primary forward action — go to step 4 (Chấm lại) for per-câu
   *  review. */
  onGoToRegrade?: () => void;
  /** Back action — go to step 1 so the teacher can re-upload / swap
   *  files. "Đọc lại" reads as "đọc lại đề + bài làm" in this flow. */
  onPrev?: () => void;
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
}

export function StepReview({
  grade,
  pipeline,
  feedbackHook,
  onApprove,
  onGoToRegrade,
  onPrev,
  backendSubject,
  task,
  t,
  essayImage,
  teacherAnnotations,
  setTeacherAnnotations,
}: StepReviewProps) {
  const [commentThreads, setCommentThreads] = useState<CommentThreads>({});
  const [analyzingQ, setAnalyzingQ] = useState<number | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const isMobile = useIsMobile();
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
        onGoToRegrade={onGoToRegrade}
        teacherAnnotations={teacherAnnotations}
        onAddAnnotation={(a) => {
          setTeacherAnnotations((prev) => [...prev, a]);
        }}
        onUpdateAnnotation={(id, patch) => {
          setTeacherAnnotations((prev) =>
            prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
          );
        }}
        onRemoveAnnotation={(id) => {
          setTeacherAnnotations((prev) => prev.filter((a) => a.id !== id));
        }}
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
          ← Đọc lại
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
          Bạn là người chấm cuối. AI chỉ đề xuất.
        </div>
        <button
          onClick={onGoToRegrade}
          disabled={pipeline.phase === "generating" || !onGoToRegrade}
          style={{
            padding: "12px 22px",
            fontSize: 14,
            color: "#fff",
            background: T.red,
            border: "none",
            borderRadius: 10,
            cursor:
              pipeline.phase === "generating" || !onGoToRegrade
                ? "not-allowed"
                : "pointer",
            transition: "all 0.2s",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            opacity:
              pipeline.phase === "generating" || !onGoToRegrade ? 0.5 : 1,
            fontWeight: 600,
            boxShadow:
              pipeline.phase === "generating" ? "none" : T.shadowSoft,
            whiteSpace: "nowrap",
          }}
          title="Mở bảng chấm lại — sửa điểm từng câu, chat với AI về phần chưa chắc."
        >
          Chấm lại / Phản hồi
          <Icon.ChevronRight size={14} color="#fff" />
        </button>
      </div>
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
