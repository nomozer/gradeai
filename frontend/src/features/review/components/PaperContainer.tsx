import { T } from "../../../theme/tokens";
import type { I18nStrings, SelectionAnnotation } from "../../../types";
import type { ReviewPayload } from "../types";
import { PaperHead } from "./PaperHead";
import { AnnotatedAnswer } from "./AnnotatedAnswer";

// PaperContainer — single "sheet of paper" wrapping every câu. Matches the
// reference's ``.paper`` card: one bordered surface with a head section
// (student identity + AI run meta) and a body section (annotated answer).
// q-blocks separated by spacing alone — no per-câu cards. Clicking inside
// a q-block sets that câu as active (peach tint follows the click); the
// rail mirrors the same state in its qcards.
export function PaperContainer({
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
