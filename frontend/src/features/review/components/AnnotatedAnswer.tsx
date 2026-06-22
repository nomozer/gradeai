import { useCallback, useEffect, useRef, useState } from "react";
import { T } from "../../../theme/tokens";
import { analyzeComment } from "../../../api";
import type { CommentVerdict, I18nStrings, SelectionAnnotation } from "../../../types";
import type { MockQuestion } from "../types";
import { renderLineWithHighlights } from "../highlight";
import { SelectionToolbar } from "./SelectionToolbar";
import { AnnotationBubble } from "./AnnotationBubble";

// AnnotatedAnswer — step 3 "đối soát" surface. Word-style annotation:
// teacher selects a passage in the AI transcript → a floating mini-
// toolbar appears with "Bình luận" → selection becomes a highlighted
// quote anchored to a comment thread under the câu. Highlights re-
// render on every state change by matching the saved quote against the
// line text (first occurrence wins — adequate for the prototype).
//
// AI scores / annotations are intentionally hidden here; the teacher
// reads blind and only reveals AI's verdict at step 4.
export function AnnotatedAnswer({
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
