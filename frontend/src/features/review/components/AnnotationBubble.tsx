import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { I18nStrings, SelectionAnnotation } from "../../../types";
import { AnnotationCard } from "./AnnotationCard";

// AnnotationBubble — floating popover anchored to the highlighted
// `<mark>` whose id matches ``ann.id``. Positions itself to the right/left
// (preferring side-alignment when space is available to keep the document
// readable), and falls back to bottom/top when space is limited.
// Repositions on scroll/resize.
export function AnnotationBubble({
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
