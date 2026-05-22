import { T } from "../../../theme/tokens";
import type { ReviewPayload } from "../types";

// PaperHead — the document's title block at the top of the paper page.
// Flush white with the page body (no tinted strip) so the paper reads
// as one continuous Word-style sheet. The action pills live in
// Step3Toolbar above the grid; this just carries the student identity.
export function PaperHead({ review }: { review: ReviewPayload }) {
  // The paper identity has no data source yet — show a neutral placeholder
  // rather than a fake default name. Class is appended only when present.
  const name = review.studentName.trim();
  const studentClass = review.studentClass.trim();
  const identity = [name, studentClass].filter(Boolean).join(" · ");
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
          color: identity ? T.text : T.textMute,
          fontStyle: identity ? "normal" : "italic",
          letterSpacing: "-0.005em",
          lineHeight: 1.25,
        }}
      >
        {identity || "Chưa rõ tên học sinh"}
      </div>
    </div>
  );
}
