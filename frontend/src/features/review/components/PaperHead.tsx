import { T } from "../../../theme/tokens";
import type { ReviewPayload } from "../types";

// PaperHead — slim title strip inside the paper card. The action pills
// (Xem PDF gốc, Bản chấm AI…) live in Step3Toolbar above the grid now,
// so this just carries the student identity as the document's heading.
export function PaperHead({ review }: { review: ReviewPayload }) {
  return (
    <div
      style={{
        padding: "14px 20px",
        background: T.bgElevated,
        borderBottom: `1px solid ${T.border}`,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: T.textFaint,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        Bản chấm AI · Lần {review.runNumber}
      </div>
      <div
        style={{
          fontFamily: T.font,
          fontSize: 18,
          fontWeight: 600,
          color: T.text,
          letterSpacing: "-0.005em",
          lineHeight: 1.25,
        }}
      >
        {review.studentName} · {review.studentClass}
      </div>
    </div>
  );
}
