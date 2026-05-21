import { useEffect, useState } from "react";
import { T } from "../../../theme/tokens";
import { Icon } from "../../../components/ui/Icon";
import type { CommentVerdict } from "../../../types";

// Verdict colour map. Three semantic tones aligned with the rest of the
// app: green = AI concurs, amber = nuance, red = AI disagrees.
const VERDICT_TONE: Record<
  CommentVerdict,
  { color: string; bg: string; label: string }
> = {
  agree: { color: "#1F7A4C", bg: "#E3F4EA", label: "AI đồng ý" },
  partial: { color: "#A8770A", bg: "#FCF1D8", label: "AI đồng ý một phần" },
  dispute: { color: "#A1392A", bg: "#FBE3DF", label: "AI phản biện" },
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
}: {
  analyzing: boolean;
  verdict: CommentVerdict | undefined;
  analysis: string | undefined;
  disputeDecision: "apply" | "skip" | undefined;
  onDecideDispute: (decision: "apply" | "skip") => void;
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
          fontSize: 11.5,
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
          fontSize: 11.5,
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
            · bạn vẫn lưu
          </span>
        )}
        {verdict === "dispute" && disputeDecision === "skip" && (
          <span style={{ fontWeight: 400, color: tone.color }}>
            · đã bỏ qua
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
            fontSize: 12.5,
            color: T.textSoft,
            lineHeight: 1.5,
            background: T.bgMuted,
            border: `1px solid ${T.borderLight}`,
            borderRadius: 2,
            padding: "6px 10px",
          }}
        >
          {analysis}
        </div>
      )}
      {bodyOpen && needsDecision && (
        <div style={{ display: "inline-flex", gap: 6, marginTop: 2 }}>
          <button
            type="button"
            onClick={() => onDecideDispute("apply")}
            style={{
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 600,
              color: "#fff",
              background: T.red,
              border: "none",
              borderRadius: 2,
              cursor: "pointer",
              fontFamily: T.font,
            }}
          >
            Vẫn lưu nhận xét này
          </button>
          <button
            type="button"
            onClick={() => onDecideDispute("skip")}
            style={{
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 500,
              color: T.textSoft,
              background: T.bgCard,
              border: `1px solid ${T.border}`,
              borderRadius: 2,
              cursor: "pointer",
              fontFamily: T.font,
            }}
          >
            Bỏ qua
          </button>
        </div>
      )}
    </div>
  );
}
