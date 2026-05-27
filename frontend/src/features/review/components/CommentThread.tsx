import React, { useState } from "react";
import { T } from "../../../theme/tokens";
import { Icon } from "../../../components/ui/Icon";
import type {
  CommentVerdict,
  I18nStrings,
  ThreadMessage,
} from "../../../types";

// ---------------------------------------------------------------------------
// Word-style Comment Thread
// ---------------------------------------------------------------------------
interface CommentThreadProps {
  comments: ThreadMessage[];
  onSend: (text: string) => void;
  /** Fires when teacher decides on a disputed AI lesson. */
  onDisputeDecide: (msgIdx: number, decision: "apply" | "skip") => void;
  isLoading: boolean;
  t: I18nStrings;
}

/** Color/icon styling per AI verdict — kept in one place so dispute UI
 *  stays consistent across bubble + badge + decision panel. */
function verdictStyle(verdict: CommentVerdict | undefined) {
  if (verdict === "dispute") {
    return { bg: T.redSoft, accent: T.red, label: <Icon.Bot size={13} /> };
  }
  if (verdict === "partial") {
    return { bg: T.amberSoft, accent: T.amber, label: <Icon.Bot size={13} /> };
  }
  return { bg: T.aiVoiceBg, accent: T.aiVoiceBorder, label: <Icon.Bot size={13} /> };
}

export function CommentThread({
  comments,
  onSend,
  onDisputeDecide,
  isLoading,
  t,
}: CommentThreadProps) {
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    onSend(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = !!input.trim() && !isLoading;

  return (
    <div style={{ marginTop: 6 }}>
      {comments.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginBottom: 8,
            maxHeight: 320,
            overflowY: "auto",
            paddingRight: 4,
          }}
        >
          {comments.map((c, i) => {
            const isTeacher = c.type === "teacher";
            const vstyle = isTeacher
              ? { bg: T.teacherVoiceBg, accent: T.teacherVoiceBorder, label: <Icon.User size={13} /> }
              : verdictStyle(c.verdict);
            const isDispute = !isTeacher && c.verdict === "dispute";
            const isPartial = !isTeacher && c.verdict === "partial";
            const skipped = isDispute && c.disputeDecision === "skip";

            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    padding: "8px 10px",
                    background: vstyle.bg,
                    borderLeft: `3px solid ${vstyle.accent}`,
                    borderRadius: "0 8px 8px 0",
                    opacity: skipped ? 0.55 : 1,
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: vstyle.accent,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      color: "#fff",
                      fontWeight: 700,
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    {vstyle.label}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {(isDispute || isPartial) && (
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          color: vstyle.accent,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          marginBottom: 4,
                        }}
                      >
                        <Icon.AlertTriangle size={11} color={vstyle.accent} />
                        {isDispute
                          ? String(t.verdictDisputeTitle ?? "AI không đồng tình")
                          : String(t.verdictPartialBadge ?? "AI đồng tình một phần")}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 13,
                        color: T.textSoft,
                        lineHeight: 1.55,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {c.text}
                    </div>
                  </div>
                </div>

                {isDispute && c.disputeDecision === undefined && (
                  <div
                    style={{
                      marginLeft: 30,
                      padding: "8px 10px",
                      background: T.bgCard,
                      border: `1px dashed ${T.red}`,
                      borderRadius: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ fontSize: 12, color: T.textSoft }}>
                      {String(
                        t.verdictDisputeHint ??
                          "AI cho rằng nhận xét này có thể không khớp bài làm thực tế. Đọc kỹ phân tích trên rồi chọn:",
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => onDisputeDecide(i, "skip")}
                        style={{
                          flex: 1,
                          padding: "6px 10px",
                          background: T.bgElevated,
                          color: T.textSoft,
                          border: `1px solid ${T.border}`,
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {String(t.verdictDisputeSkip ?? "Bỏ qua, không lưu bài học")}
                      </button>
                      <button
                        onClick={() => onDisputeDecide(i, "apply")}
                        style={{
                          flex: 1,
                          padding: "6px 10px",
                          background: T.red,
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {String(t.verdictDisputeApply ?? "Vẫn áp dụng nhận xét")}
                      </button>
                    </div>
                  </div>
                )}

                {isDispute && c.disputeDecision === "apply" && (
                  <div
                    style={{
                      marginLeft: 30,
                      fontSize: 11,
                      color: T.red,
                      fontStyle: "italic",
                    }}
                  >
                    <Icon.Check size={10} color={T.red} />{" "}
                    {String(
                      t.verdictDisputeApplied ?? "Đã chọn áp dụng — bài học sẽ lưu khi duyệt.",
                    )}
                  </div>
                )}
                {isDispute && c.disputeDecision === "skip" && (
                  <div
                    style={{
                      marginLeft: 30,
                      fontSize: 11,
                      color: T.textFaint,
                      fontStyle: "italic",
                    }}
                  >
                    {String(t.verdictDisputeSkipped ?? "Đã bỏ qua — bài học KHÔNG lưu vào bộ nhớ.")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isLoading && (
        <div
          style={{
            padding: "5px 10px",
            fontSize: 12,
            color: T.textFaint,
            fontStyle: "italic",
            marginBottom: 6,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icon.RefreshCw size={11} color={T.textFaint} />
          {String(t.aiAnalyzing ?? "AI đang phân tích...")}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={String(t.teacherNotePlaceholder ?? "Nhập nhận xét cho câu này…")}
          rows={1}
          style={{
            flex: 1,
            background: T.bgInput,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            padding: "7px 10px",
            fontSize: 13,
            color: T.text,
            lineHeight: 1.4,
            resize: "none",
            outline: "none",
            fontFamily: T.font,
            boxSizing: "border-box",
            minHeight: 34,
          }}
          onFocus={(e) => (e.target.style.borderColor = T.accent)}
          onBlur={(e) => (e.target.style.borderColor = T.border)}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          style={{
            padding: "6px 14px",
            background: canSend ? T.accent : T.bgElevated,
            color: canSend ? "#fff" : T.textFaint,
            border: "none",
            borderRadius: 8,
            cursor: canSend ? "pointer" : "not-allowed",
            fontSize: 13,
            fontWeight: 600,
            height: 34,
            display: "flex",
            alignItems: "center",
            gap: 4,
            transition: "all 0.15s",
          }}
        >
          <Icon.MessageCircle size={12} color={canSend ? "#fff" : T.textFaint} />
          {String(t.sendComment ?? "Gửi")}
        </button>
      </div>
    </div>
  );
}
