import { T } from "../../../theme/tokens";
import type { ReviewPayload } from "../types";

// PaperHead — the document's title block at the top of the paper page.
// Flush white with the page body (no tinted strip) so the paper reads
// as one continuous Word-style sheet. The action pills live in
// Step3Toolbar above the grid; this just carries the student identity.
export function PaperHead({ review }: { review: ReviewPayload }) {
  return (
    <div
      style={{
        padding: "32px clamp(24px, 5vw, 64px) 20px",
        background: T.paper,
        borderBottom: `1px solid ${T.borderLight}`,
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
          fontSize: 20,
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
