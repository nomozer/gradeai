import { T } from "../../../theme/tokens";
import { Icon } from "../../../components/ui/Icon";

// ViewOriginalButton — pop the raw student PDF for spot-checking AI's
// transcription. Same shape + padding + radius as the lessons pill on
// Step 3 so the two surfaces look like siblings, not cousins. Wired via
// the `onClick` prop — parent owns the modal-toggle state so the same
// click handler can be reused / disabled centrally.
export function ViewOriginalButton({
  onClick,
  disabled = false,
}: {
  onClick?: () => void;
  /** True when no essayImage is available — the button shows greyed
   *  out instead of disappearing, so the affordance doesn't flicker
   *  when the upload finishes mid-render. */
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      title={
        disabled
          ? "Chưa có bài làm gốc trong phiên này."
          : "Mở bài làm gốc để đối chiếu với phần AI đã chép"
      }
      style={{
        // Style values mirror StepReview's MetaPill 1:1. Kept inline here
        // (not imported) so this file stays self-contained; if we ship
        // a third pill anywhere we'll lift MetaPill into components/ui.
        padding: "4px 10px",
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 999,
        fontSize: 12,
        fontFamily: T.font,
        fontWeight: 400,
        lineHeight: 1.45,
        color: disabled ? T.textFaint : T.textSoft,
        cursor: disabled || !onClick ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        margin: 0,
        transition: "color 0.12s, border-color 0.12s",
      }}
      onMouseEnter={(e) => {
        if (disabled || !onClick) return;
        e.currentTarget.style.color = T.accent;
        e.currentTarget.style.borderColor = T.accent;
      }}
      onMouseLeave={(e) => {
        if (disabled || !onClick) return;
        e.currentTarget.style.color = T.textSoft;
        e.currentTarget.style.borderColor = T.border;
      }}
    >
      <Icon.FileText size={11} />
      Xem PDF gốc
    </button>
  );
}

// Chevron — rotates 90° on expand. Inline SVG so the block doesn't reach
// into the shared Icon set for a single-use glyph (the existing
// `Icon.ChevronRight` is a different stroke weight and doesn't support
// the rotate transition cleanly).
export function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        color: T.textMute,
        transform: `rotate(${expanded ? 90 : 0}deg)`,
        transition: "transform 0.15s",
        flexShrink: 0,
      }}
    >
      <svg
        width={12}
        height={12}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </span>
  );
}

// HeaderScoreChip — compact AI score read-out for the collapsed header.
//
// Intentionally NOT a summary statement. Previous version showed
// "AI 2.5 → 2.5 (0.00)" which mirrored the overall tổng kết pattern at
// the top of the paper too closely — teachers reading the bottom-most
// câu's chip could mistake it for the final grade. Fix: collapsed chip
// shows ONLY the AI's per-câu score (with denominator iff the đề
// specified per-câu maxPoints), plus a discrete "đã sửa" pill when the
// teacher has materially overridden it. The full AI-vs-teacher
// comparison with delta lives in the expanded score editor row, where
// it's clearly per-câu by context.
export function HeaderScoreChip({
  aiScore,
  cap,
  isEdited,
}: {
  aiScore: number;
  cap: number | undefined;
  isEdited: boolean;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 6,
        fontFamily: T.mono,
        fontSize: 12.5,
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          color: T.textFaint,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        AI
      </span>
      <span style={{ color: T.text, fontWeight: 600 }}>
        {aiScore.toFixed(1)}
        {cap != null && (
          <span style={{ color: T.textFaint, fontWeight: 400 }}>
            /{cap.toFixed(1)}
          </span>
        )}
      </span>
      {isEdited && (
        // Pill, not a number — clearly a status indicator, not a second
        // score in a comparison. Teacher opens the expanded view to see
        // the actual override value.
        <span
          style={{
            marginLeft: 2,
            padding: "1px 7px",
            borderRadius: 999,
            background: T.redSoft,
            color: T.red,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontFamily: T.font,
          }}
          title="Bạn đã chỉnh điểm câu này — mở rộng để xem giá trị."
        >
          Đã sửa
        </span>
      )}
    </div>
  );
}

// ExpandAllToggle — pill in the paper-head that flips between "Mở rộng
// tất cả" and "Thu gọn tất cả". Same dimensions as ViewOriginalButton so
// the two read as a paired controls cluster.
export function ExpandAllToggle({
  allExpanded,
  onClick,
}: {
  allExpanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={allExpanded ? "Thu gọn tất cả câu" : "Mở rộng tất cả câu"}
      style={{
        padding: "4px 10px",
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 999,
        fontSize: 12,
        fontFamily: T.font,
        fontWeight: 400,
        lineHeight: 1.45,
        color: T.textSoft,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        margin: 0,
        transition: "color 0.12s, border-color 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = T.accent;
        e.currentTarget.style.borderColor = T.accent;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = T.textSoft;
        e.currentTarget.style.borderColor = T.border;
      }}
    >
      <span
        style={{
          display: "inline-flex",
          transform: `rotate(${allExpanded ? 90 : 0}deg)`,
          transition: "transform 0.15s",
        }}
      >
        <svg
          width={11}
          height={11}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </span>
      {allExpanded ? "Thu gọn tất cả" : "Mở rộng tất cả"}
    </button>
  );
}
