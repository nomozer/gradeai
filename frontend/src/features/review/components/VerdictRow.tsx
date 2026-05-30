import { useEffect, useState } from "react";
import { T } from "../../../theme/tokens";
import { Icon } from "../../../components/ui/Icon";
import type { CommentVerdict, I18nStrings } from "../../../types";

// Verdict colour map. Three distinct hues aligned with the rest of the
// app: green = AI concurs, amber = nuance, indigo = AI disagrees.
// Dispute is deliberately NOT red — a dispute means the AI disagrees
// with the teacher's comment, not that the student erred; red would
// mislabel the transcript. Indigo reads as "contested — review this".
const VERDICT_TONE: Record<
  CommentVerdict,
  { color: string; bg: string; label: string }
> = {
  agree: { color: "#1F7A4C", bg: "#E3F4EA", label: "AI đồng ý" },
  partial: { color: "#A8770A", bg: "#FCF1D8", label: "AI đồng ý một phần" },
  dispute: { color: "#2A3B6B", bg: "#E5E8F2", label: "AI phản biện" },
};

// VerdictRow — surfaces /api/analyze-comment's judgment under each
// annotation card. At rest only the pill is visible (verdict label +
// status). Clicking the pill expands the analysis + dispute buttons.
// Force-expanded when a dispute decision is pending — teacher MUST
// choose "Vẫn lưu" / "Bỏ qua", can't dismiss the prompt.
export function VerdictRow({
  analyzing,
  verdict,
  analysis,
  disputeDecision,
  onDecideDispute,
  t,
}: {
  analyzing: boolean;
  verdict: CommentVerdict | undefined;
  analysis: string | undefined;
  disputeDecision: "apply" | "skip" | undefined;
  onDecideDispute: (decision: "apply" | "skip") => void;
  t: I18nStrings;
}) {
  const needsDecision = verdict === "dispute" && disputeDecision === undefined;
  const [expanded, setExpanded] = useState(false);
  // Reset to collapsed when the verdict changes (re-edit a comment ⇒
  // fresh analysis ⇒ don't leak the previous analysis text into view).
  useEffect(() => {
    setExpanded(false);
  }, [verdict, analysis]);

  if (analyzing) {
    return (
      <div
        style={{
          marginTop: 6,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 8px",
          background: T.bgMuted,
          border: `1px solid ${T.borderLight}`,
          borderRadius: 999,
          fontSize: T.fontSize.xxs,
          color: T.textMute,
          fontStyle: "italic",
          alignSelf: "flex-start",
        }}
      >
        <Icon.RefreshCw size={10} color={T.textMute} />
        AI đang phân tích…
      </div>
    );
  }
  if (!verdict) return null;
  const tone = VERDICT_TONE[verdict];
  const bodyOpen = expanded || needsDecision;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((v) => !v);
        }}
        aria-expanded={bodyOpen}
        title={bodyOpen ? "Thu gọn" : "Xem phân tích của AI"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 9px",
          background: tone.bg,
          border: `1px solid ${tone.color}`,
          borderRadius: 999,
          fontSize: T.fontSize.xxs,
          color: tone.color,
          fontWeight: 600,
          alignSelf: "flex-start",
          cursor: "pointer",
          fontFamily: T.font,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: tone.color,
          }}
        />
        {tone.label}
        {verdict !== "dispute" && (
          <span style={{ fontWeight: 400, color: tone.color }}>
            · sẽ học vào bộ nhớ
          </span>
        )}
        {verdict === "dispute" && disputeDecision === "apply" && (
          <span style={{ fontWeight: 400, color: tone.color }}>
            · {String(t.appliedLabel ?? "đã áp dụng")}
          </span>
        )}
        {verdict === "dispute" && disputeDecision === "skip" && (
          <span style={{ fontWeight: 400, color: tone.color }}>
            · {String(t.skippedLabel ?? "đã bỏ qua")}
          </span>
        )}
        {/* Chevron — rotates when expanded. Hidden during a pending
            dispute decision: the body is force-open and toggling it
            would only confuse the teacher (the buttons must stay). */}
        {!needsDecision && (
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              transform: `rotate(${bodyOpen ? 180 : 0}deg)`,
              transition: "transform 0.15s",
              opacity: 0.7,
              marginLeft: 2,
            }}
          >
            <svg
              width={9}
              height={9}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        )}
      </button>
      {bodyOpen && analysis && (
        <div
          style={{
            fontSize: 13,
            color: T.textSoft,
            lineHeight: 1.55,
            background: "rgba(192, 139, 48, 0.05)",
            border: "1px solid #FAF0D9",
            borderRadius: 8,
            padding: "10px 14px",
            fontStyle: "italic",
            marginTop: 6,
            fontFamily: T.font,
          }}
        >
          "{analysis}"
        </div>
      )}
      {bodyOpen && needsDecision && (
        <div style={{ display: "inline-flex", gap: 8, marginTop: 8 }}>
          <button
            type="button"
            onClick={() => onDecideDispute("apply")}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: T.green,
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: T.font,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 2px 6px rgba(46, 125, 91, 0.15)",
              transition: "opacity 0.15s ease",
            }}
          >
            <span>✓</span> {String(t.verdictDisputeApply ?? "Áp dụng góp ý")}
          </button>
          <button
            type="button"
            onClick={() => onDecideDispute("skip")}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              color: T.textSoft,
              background: "#EBE7DF",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: T.font,
              transition: "background-color 0.15s ease",
            }}
          >
            {String(t.verdictDisputeSkipShort ?? "Bỏ qua")}
          </button>
        </div>
      )}
    </div>
  );
}
