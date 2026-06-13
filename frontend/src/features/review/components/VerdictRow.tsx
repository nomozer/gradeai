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
  {
    color: string;
    bg: string;
    border: string;
    bgHover: string;
    glow: string;
    label: string;
    bgBox: string;
    borderBox: string;
  }
> = {
  agree: {
    color: "#1F7A4C",
    bg: "rgba(31, 122, 76, 0.05)",
    border: "rgba(31, 122, 76, 0.15)",
    bgHover: "rgba(31, 122, 76, 0.1)",
    glow: "rgba(31, 122, 76, 0.1)",
    label: "AI đồng ý",
    bgBox: "rgba(31, 122, 76, 0.02)",
    borderBox: "rgba(31, 122, 76, 0.08)",
  },
  partial: {
    color: "#A8770A",
    bg: "rgba(168, 119, 10, 0.05)",
    border: "rgba(168, 119, 10, 0.15)",
    bgHover: "rgba(168, 119, 10, 0.1)",
    glow: "rgba(168, 119, 10, 0.1)",
    label: "AI đồng ý một phần",
    bgBox: "rgba(168, 119, 10, 0.02)",
    borderBox: "rgba(168, 119, 10, 0.08)",
  },
  dispute: {
    color: "#2A3B6B",
    bg: "rgba(42, 59, 107, 0.05)",
    border: "rgba(42, 59, 107, 0.15)",
    bgHover: "rgba(42, 59, 107, 0.1)",
    glow: "rgba(42, 59, 107, 0.1)",
    label: "AI phản biện",
    bgBox: "rgba(42, 59, 107, 0.02)",
    borderBox: "rgba(42, 59, 107, 0.08)",
  },
};

const RESOLVED_TONE = {
  color: "#64748B", // Slate gray for resolved states
  bg: "rgba(100, 116, 139, 0.05)",
  border: "rgba(100, 116, 139, 0.15)",
  bgHover: "rgba(100, 116, 139, 0.08)",
  glow: "rgba(100, 116, 139, 0.05)",
  label: "AI phản biện",
  bgBox: "rgba(100, 116, 139, 0.02)",
  borderBox: "rgba(100, 116, 139, 0.08)",
};

function getVerdictIcon(verdict: CommentVerdict, color: string, isResolved?: boolean) {
  if (isResolved) {
    return <Icon.Check size={10} color={color} style={{ flexShrink: 0 }} />;
  }
  if (verdict === "agree") {
    return <Icon.Check size={10} color={color} style={{ flexShrink: 0 }} />;
  }
  if (verdict === "partial") {
    return <Icon.HelpCircle size={11} color={color} style={{ flexShrink: 0 }} />;
  }
  return <Icon.AlertTriangle size={11} color={color} style={{ flexShrink: 0 }} />;
}

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
  const isResolved = verdict === "dispute" && disputeDecision !== undefined;
  const [expanded, setExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

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
          padding: "4px 10px",
          background: T.bgMuted,
          border: `1px solid ${T.borderLight}`,
          borderRadius: 8,
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
  const tone = isResolved ? RESOLVED_TONE : VERDICT_TONE[verdict];
  const bodyOpen = expanded || needsDecision;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}
    >
      <button
        type="button"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
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
          padding: "4px 10px",
          background: isHovered ? tone.bgHover : tone.bg,
          border: `1px solid ${isHovered ? tone.color : tone.border}`,
          borderRadius: 8,
          fontSize: T.fontSize.xxs,
          color: tone.color,
          fontWeight: 600,
          alignSelf: "flex-start",
          cursor: "pointer",
          fontFamily: T.font,
          boxShadow: isHovered
            ? `0 4px 12px ${tone.glow}`
            : "0 1px 2px rgba(0, 0, 0, 0.02)",
          transform: isHovered ? "translateY(-1px)" : "translateY(0)",
          transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          outline: "none",
        }}
      >
        {getVerdictIcon(verdict, tone.color, isResolved)}
        <span>{tone.label}</span>
        {verdict !== "dispute" && (
          <span style={{ fontWeight: 400, opacity: 0.8 }}>
            · sẽ học vào bộ nhớ
          </span>
        )}
        {verdict === "dispute" && disputeDecision === "apply" && (
          <span style={{ fontWeight: 400, opacity: 0.8 }}>
            · {String(t.appliedLabel ?? "đã áp dụng")}
          </span>
        )}
        {verdict === "dispute" && disputeDecision === "skip" && (
          <span style={{ fontWeight: 400, opacity: 0.8 }}>
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
            background: tone.bgBox,
            border: `1px solid ${tone.borderBox}`,
            borderRadius: 8,
            padding: "12px 14px",
            marginTop: 6,
            fontFamily: T.font,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: tone.color,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Phân tích của AI
          </span>
          <span style={{ fontStyle: "italic" }}>"{analysis}"</span>
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
              background: `linear-gradient(135deg, ${T.green} 0%, #226b48 100%)`,
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
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "0.9";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "1";
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
              color: T.text,
              background: "linear-gradient(135deg, #f4f2ee 0%, #e1ded8 100%)",
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: T.font,
              transition: "opacity 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "0.9";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "1";
            }}
          >
            {String(t.verdictDisputeSkipShort ?? "Bỏ qua")}
          </button>
        </div>
      )}
    </div>
  );
}

