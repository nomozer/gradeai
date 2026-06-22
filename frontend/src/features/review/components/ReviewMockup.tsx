import { useCallback, useEffect, useState } from "react";
import { MOCK_REVIEW } from "../fixtures/review";
import type { ReviewPayload } from "../types";
import type { I18nStrings, SelectionAnnotation } from "../../../types";
import { MucLucSidebar, MucLucChips } from "./MucLucSidebar";
import { Step3Toolbar } from "./Step3Toolbar";
import { PaperContainer } from "./PaperContainer";

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
//
// MOCK_REVIEW + Mock* type fixtures live in fixtures/review.ts.
// deriveStepReviewData (live grade → ReviewPayload) lives in ./utils.
// ---------------------------------------------------------------------------
export function ReviewMockup({
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
