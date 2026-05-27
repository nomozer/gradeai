import { useState } from "react";
import { T } from "../../../theme/tokens";
import { Icon } from "../../../components/ui/Icon";
import { formatTranscript } from "../../../lib/mathFormat";
import type {
  I18nStrings,
  PerQuestionFeedback,
  Subject,
  ThreadMessage,
} from "../../../types";
import type { QuestionPart } from "../types";
import { CommentThread } from "./CommentThread";

// ---------------------------------------------------------------------------
// QuestionBox
// ---------------------------------------------------------------------------
interface QuestionBoxProps {
  studentAnswer: QuestionPart;
  aiComment: QuestionPart;
  questionIdx: number;
  comments: ThreadMessage[];
  onSendComment: (text: string) => void;
  onDisputeDecide: (msgIdx: number, decision: "apply" | "skip") => void;
  isAnalyzing: boolean;
  t: I18nStrings;
  subject: Subject | string;
  /**
   * Whether the parent grade envelope was flagged as salvaged. Gates the
   * empty-AI-comment placeholder: when salvaged, the absence of a comment
   * means Gemini stopped early — show an amber warning instead of the green
   * "no issues" badge that would falsely imply approval.
   */
  isSalvaged: boolean;
  stacked: boolean;
  /**
   * Structured per-question feedback from ``grade.per_question_feedback``.
   * The AI emits ``good_points`` (✓ điểm tốt) and ``errors`` (× cần sửa)
   * as separate prose fields — we split each on newlines / bullets so the
   * review renders them as Word-style annotation lines below the student
   * work, like a printed teacher's mark-up. Falls back to the overall
   * ``aiComment.body`` when both are empty (legacy responses without
   * structured feedback).
   */
  feedback?: PerQuestionFeedback;
}

// Split a chunk of prose into individual annotation lines. Handles the
// most common shapes the prompt emits: explicit newlines, dashes/bullets,
// numbered lists, semicolons. Strips list-marker prefixes so the rendered
// row can prepend its own ✓ / × glyph without duplicate symbols.
function splitAnnotationLines(text: string | null | undefined): string[] {
  const raw = String(text || "").trim();
  if (!raw) return [];
  // First split on newlines, then on " · " or "; " when single-line. This
  // covers both the "one bullet per line" and "comma-separated note"
  // styles that show up in Gemini outputs.
  let parts = raw.split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 1 && /[;·]/.test(parts[0])) {
    parts = parts[0].split(/\s*[;·]\s*/).filter(Boolean);
  }
  return parts.map((line) =>
    line
      // Strip common bullet markers so the glyph in the row template is
      // the only visual prefix.
      .replace(/^[-•·*+]+\s*/, "")
      .replace(/^\d+[.)]\s*/, "")
      .replace(/^[✓✔×✗]\s*/, "")
      .trim(),
  ).filter(Boolean);
}

export function QuestionBox({
  studentAnswer,
  aiComment,
  questionIdx,
  comments,
  onSendComment,
  onDisputeDecide,
  isAnalyzing,
  t,
  subject,
  isSalvaged,
  stacked,
  feedback,
}: QuestionBoxProps) {
  const [bodyExpanded, setBodyExpanded] = useState(true);
  const [teacherOpen, setTeacherOpen] = useState(false);
  const [commentsCollapsed, setCommentsCollapsed] = useState(false);

  // ``stacked`` no longer changes layout (the box is single-column now), so
  // the prop is intentionally unread. Kept on the interface in case a
  // future mobile-only behavior wants it; silenced for the linter.
  void stacked;

  // Parse the structured per-question feedback into ✓ / × annotation lines.
  // When the structured fields are empty (older responses or salvaged
  // outputs), fall back to splitting the freeform aiComment body on the
  // first paragraph that looks like a strength list vs. an error list —
  // crude but better than dropping the AI's signal entirely.
  const goodLines = splitAnnotationLines(feedback?.good_points);
  const errorLines = splitAnnotationLines(feedback?.errors);
  const fallbackComment = aiComment.body?.trim() || "";
  const hasAnnotations = goodLines.length > 0 || errorLines.length > 0;
  const showFallback = !hasAnnotations && !!fallbackComment;

  return (
    // Word-style document page. Each câu renders as a paper card:
    //   1. header with circle number + label
    //   2. student work in mono (the proof / answer)
    //   3. AI annotations rendered inline as ✓ điểm tốt / × cần sửa lines,
    //      always visible (no toggle) — mirrors a teacher's red-pen markup
    //      on a printed exam
    //   4. teacher reply box, collapsed by default behind a "Thêm nhận
    //      xét" link to keep the page clean until needed
    <div
      className={`question-card${
        feedback && typeof feedback.score === "number" && typeof feedback.max_points === "number" && feedback.max_points > 0
          ? (feedback.score >= feedback.max_points
              ? " question-card--correct"
              : feedback.score >= feedback.max_points * 0.5
                ? " question-card--partial"
                : " question-card--error")
          : ""
      }`}
      style={{
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "18px 20px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div
            style={{
              width: 26,
              height: 26,
              flexShrink: 0,
              borderRadius: "50%",
              background: T.accentSoft,
              border: `1.5px solid ${T.accent}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              color: T.accent,
              fontFamily: T.mono,
            }}
          >
            {questionIdx + 1}
          </div>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: T.accent,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {studentAnswer.label || `Câu ${questionIdx + 1}`}
          </span>
        </div>

        <button
          onClick={() => setBodyExpanded((v) => !v)}
          aria-label={bodyExpanded ? "Thu gọn bài làm" : "Mở bài làm"}
          title={bodyExpanded ? "Thu gọn" : "Mở"}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: T.textFaint,
            padding: 4,
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          {bodyExpanded ? (
            <Icon.ArrowDown size={14} color={T.textFaint} />
          ) : (
            <Icon.ChevronRight size={14} color={T.textFaint} />
          )}
        </button>
      </div>

      {bodyExpanded && (
        <div
          className="student-work"
          style={{
            padding: "12px 20px 0",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            tabSize: 4,
          }}
        >
          {formatTranscript(studentAnswer.body, subject)}
        </div>
      )}

      {/* Inline AI annotations — ✓ good points and × errors, always
          visible. Each line gets its own row with the glyph + tinted text
          so the teacher can skim the AI's marks like a margin note. */}
      {bodyExpanded && (hasAnnotations || showFallback || isSalvaged) && (
        <div
          className="voice-ai"
          style={{
            margin: "14px 20px 0",
          }}
        >
          <div
            className="voice-label"
            style={{
              color: T.aiVoiceText,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              userSelect: "none",
              marginBottom: commentsCollapsed ? 0 : 12,
            }}
            onClick={() => setCommentsCollapsed(!commentsCollapsed)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon.Bot size={13} />
              {String(t.aiVoiceLabel ?? "AI đã đọc")}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                fontWeight: 600,
                color: T.aiVoiceBorder,
                fontFamily: '"Inter", "Outfit", system-ui, -apple-system, sans-serif',
              }}
            >
              <Icon.MessageCircle size={11} />
              <span>{commentsCollapsed ? "Hiện nhận xét" : "Ẩn nhận xét"}</span>
              <span
                style={{
                  transform: `rotate(${commentsCollapsed ? 0 : 180}deg)`,
                  transition: "transform 0.2s",
                  display: "inline-flex",
                }}
              >
                <Icon.ChevronRight size={11} style={{ transform: "rotate(90deg)" }} />
              </span>
            </div>
          </div>
          {!commentsCollapsed && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <AnnotationGroup kind="good" lines={goodLines} subject={subject} t={t} />
              <AnnotationGroup kind="error" lines={errorLines} subject={subject} t={t} />
              {showFallback && (
                // Legacy / unstructured response — emit the freeform comment
                // as a single neutral row so we don't drop the AI signal.
                <AnnotationGroup kind="note" lines={[fallbackComment]} subject={subject} t={t} />
              )}
              {!hasAnnotations && !showFallback && isSalvaged && (
                <AnnotationGroup
                  kind="warn"
                  lines={[
                    String(
                      t.noCommentSalvaged ??
                        "Phản hồi cho câu này bị cắt — hãy đối chiếu bài làm hoặc chấm lại.",
                    ),
                  ]}
                  subject={subject}
                  t={t}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Teacher reply — folded behind a thin link by default so the page
          stays focused on the AI's mark-up. Click "Thêm nhận xét" to
          reveal the textarea + thread. Once any teacher message exists,
          we auto-open so prior threads aren't hidden mid-conversation. */}
      {bodyExpanded && (
        <div style={{ padding: "14px 20px 18px" }}>
          {(teacherOpen || comments.length > 0) ? (
            <>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: T.textMute,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Icon.Edit size={11} color={T.textFaint} />
                {String(t.teacherNote ?? "Nhận xét giáo viên")}
              </div>
              <CommentThread
                comments={comments}
                onSend={onSendComment}
                onDisputeDecide={onDisputeDecide}
                isLoading={isAnalyzing}
                t={t}
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setTeacherOpen(true)}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: T.textMute,
                fontFamily: T.font,
                fontSize: 13,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = T.accent)}
              onMouseLeave={(e) => (e.currentTarget.style.color = T.textMute)}
            >
              <Icon.Edit size={11} />
              Thêm nhận xét cho câu này
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// One grouped container of inline AI markup — ✓ good points (green) and × errors (red).
// Styled as a clean, compact Notion-style callout box with left vertical accent line.
// Inside it lists all bullet points with correct LaTeX math formatting.
function AnnotationGroup({
  kind,
  lines,
  subject,
  t,
}: {
  kind: "good" | "error" | "note" | "warn";
  lines: string[];
  subject: any;
  t: I18nStrings;
}) {
  if (lines.length === 0) return null;

  const palette = {
    good: {
      bg: "rgba(46, 125, 91, 0.03)",
      borderLeft: `3px solid ${T.green || "#2E7D5B"}`,
      color: T.green || "#2E7D5B",
      icon: <Icon.Check size={11} />,
      label: String(t.commentLabelGood ?? "Ưu điểm"),
    },
    error: {
      bg: "rgba(184, 66, 58, 0.03)",
      borderLeft: "3px solid #E07A5F",
      color: T.red || "#E07A5F",
      icon: <Icon.X size={11} />,
      label: String(t.commentLabelError ?? "Cần khắc phục"),
    },
    note: {
      bg: "rgba(74, 76, 92, 0.02)",
      borderLeft: "3px solid #7B6D8D",
      color: T.textSoft,
      icon: <Icon.MessageCircle size={11} />,
      label: String(t.commentLabelNote ?? "Ghi chú"),
    },
    warn: {
      bg: "rgba(192, 139, 48, 0.03)",
      borderLeft: "3px solid #C08B30",
      color: T.amber || "#C08B30",
      icon: <Icon.AlertTriangle size={11} />,
      label: String(t.commentLabelWarn ?? "Cảnh báo"),
    },
  };
  const p = palette[kind] ?? palette.note;

  return (
    <div
      style={{
        background: p.bg,
        borderLeft: p.borderLeft,
        borderRadius: "0 8px 8px 0",
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        animation: "fadeUp 0.2s ease-out",
      }}
    >
      {/* Group Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: p.color,
          fontFamily: '"Inter", "Outfit", system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "white",
            border: `1.5px solid ${p.color}`,
            color: p.color,
          }}
        >
          {p.icon}
        </div>
        <span>{p.label}</span>
      </div>

      {/* Group Body - Compact Bullet List */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 5,
          paddingLeft: 4,
        }}
      >
        {lines.map((line, idx) => (
          <div
            key={idx}
            style={{
              fontSize: 13,
              color: T.textSoft,
              lineHeight: "1.45",
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
              fontFamily: T.font,
            }}
          >
            <span style={{ color: p.color, fontSize: 14, flexShrink: 0, userSelect: "none" }}>•</span>
            <div style={{ flex: 1 }}>{formatTranscript(line, subject)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
