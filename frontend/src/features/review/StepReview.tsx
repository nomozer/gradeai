import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import { T } from "../../theme/tokens";
import { Icon } from "../../components/ui/Icon";
import { OriginalImageModal } from "../../components/ui/OriginalImageModal";
import { formatTranscript } from "../../lib/mathFormat";
import {
  buildSyntheticAnnotations,
  parseCauHeader,
  splitTranscriptByCau,
} from "../../lib/grade";
import { getStageableLesson } from "../../lib/hitl";
import { analyzeComment } from "../../api";
import { useIsMobile } from "../../hooks/useIsMobile";
import type {
  BackendSubject,
  CommentThreads,
  CommentVerdict,
  EssayFile,
  Grade,
  I18nStrings,
  Lesson,
  PerQuestionFeedback,
  SelectionAnnotation,
  StagedLesson,
  Subject,
  ThreadMessage,
} from "../../types";
import type { UseAgentPipelineResult } from "../../hooks/useAgentPipeline";
import type { UseFeedbackResult } from "../../hooks/useFeedback";

interface QuestionPart {
  idx: number;
  label: string;
  num: number | null;
  body: string;
}

// ---------------------------------------------------------------------------
// Parse a flat string into per-question blocks.
// Convention: "Câu 1: …\nCâu 2: …" or "Question 1: …"
// ---------------------------------------------------------------------------
function parseIntoQuestions(source: string | null | undefined): QuestionPart[] {
  if (typeof source !== "string" || !source.trim()) return [];
  const regex = /(?=(?:Câu|Question|Câu hỏi)\s*\d+\s*[:：])/i;
  const parts = source.split(regex).filter((p) => p.trim());
  if (parts.length <= 1) {
    return [{ idx: 0, label: "", num: null, body: source.trim() }];
  }
  return parts.map((part, i) => {
    const match = part.match(/^((?:Câu|Question|Câu hỏi)\s*(\d+)\s*[:：])\s*/i);
    const label = match ? match[1] : `#${i + 1}`;
    const num = match ? parseInt(match[2], 10) : null;
    const body = match ? part.slice(match[0].length).trim() : part.trim();
    return { idx: i, label, num, body };
  });
}

function normalizeAiAnalysisText(value: string | null | undefined, t: I18nStrings): string {
  const trimmed = String(value || "").trim();
  const fallback = String(
    t.aiAnalyzeFallback ?? "AI chưa phân tích được nhận xét này. Vui lòng thử lại.",
  );
  if (!trimmed) return fallback;
  // Reject obvious broken JSON fragments such as `{`, `"`, `{ "`.
  if (/^[\s{}[\]",:]+$/.test(trimmed)) return fallback;
  return trimmed;
}

function clipText(value: string | null | undefined, maxLen: number): string {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

interface QuestionPair {
  num: number;
  student: QuestionPart;
  ai: QuestionPart;
}

function buildAnalyzeQuestionContext(
  task: string | null | undefined,
  pair: QuestionPair | undefined,
): string {
  const parts: string[] = [];
  const taskLine = clipText(task, 180);
  const questionLabel = clipText(pair?.student?.label || pair?.ai?.label || "", 60);
  const aiSummary = clipText(pair?.ai?.body, 500);

  if (taskLine) parts.push(`Bối cảnh bài: ${taskLine}`);
  if (questionLabel) parts.push(`Câu đang xét: ${questionLabel}`);
  if (aiSummary) parts.push(`Nhận xét AI hiện tại: ${aiSummary}`);

  return parts.join("\n");
}

// getStageableLesson lifted to lib/hitl.ts so step 4 (RegradeMockup) can
// reuse the anti-poison gating when staging chat lessons on "Hoàn tất bài
// này".

// ---------------------------------------------------------------------------
// Align transcript parts with AI comment parts BY QUESTION NUMBER.
// ---------------------------------------------------------------------------
function alignByQuestionNumber(
  studentParts: QuestionPart[],
  commentParts: QuestionPart[],
): QuestionPair[] {
  const studentNumbered = studentParts.length > 0 && studentParts.every((p) => p.num !== null);
  const commentNumbered = commentParts.length > 0 && commentParts.every((p) => p.num !== null);

  if (!studentNumbered || !commentNumbered) {
    const count = Math.max(studentParts.length, commentParts.length, 1);
    return Array.from({ length: count }, (_, i) => ({
      num: i + 1,
      student: studentParts[i] || { idx: i, label: "", num: null, body: "" },
      ai: commentParts[i] || { idx: i, label: "", num: null, body: "" },
    }));
  }

  const byNum = (parts: QuestionPart[]) => {
    const map = new Map<number, QuestionPart>();
    for (const p of parts) if (p.num !== null && !map.has(p.num)) map.set(p.num, p);
    return map;
  };
  const studentMap = byNum(studentParts);
  const commentMap = byNum(commentParts);
  const nums = Array.from(new Set([...studentMap.keys(), ...commentMap.keys()])).sort(
    (a, b) => a - b,
  );

  return nums.map((num) => ({
    num,
    student: studentMap.get(num) || {
      idx: num - 1,
      label: `Câu ${num}`,
      num,
      body: "",
    },
    ai: commentMap.get(num) || {
      idx: num - 1,
      label: `Câu ${num}`,
      num,
      body: "",
    },
  }));
}

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
    return { bg: T.redSoft, accent: T.red, label: "AI" };
  }
  if (verdict === "partial") {
    return { bg: T.amberSoft, accent: T.amber, label: "AI" };
  }
  return { bg: T.accentSoft, accent: T.accent, label: "AI" };
}

function CommentThread({ comments, onSend, onDisputeDecide, isLoading, t }: CommentThreadProps) {
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
              ? { bg: T.amberSoft, accent: T.amber, label: "GV" }
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

function QuestionBox({
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
      style={{
        marginBottom: 16,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        boxShadow: T.shadowSoft,
        background: T.paper,
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
          style={{
            padding: "12px 20px 0",
            fontSize: 14.5,
            color: T.textSoft,
            lineHeight: 1.7,
            fontFamily: T.mono,
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
          style={{
            margin: "14px 20px 0",
            padding: "10px 14px",
            background: T.bgCard,
            border: `1px solid ${T.borderLight}`,
            borderRadius: 8,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {goodLines.map((line, i) => (
            <AnnotationRow key={`g-${i}`} kind="good" text={line} />
          ))}
          {errorLines.map((line, i) => (
            <AnnotationRow key={`e-${i}`} kind="error" text={line} />
          ))}
          {showFallback && (
            // Legacy / unstructured response — emit the freeform comment
            // as a single neutral row so we don't drop the AI signal.
            <AnnotationRow kind="note" text={fallbackComment} />
          )}
          {!hasAnnotations && !showFallback && isSalvaged && (
            <AnnotationRow
              kind="warn"
              text={String(
                t.noCommentSalvaged ??
                  "Phản hồi cho câu này bị cắt — hãy đối chiếu bài làm hoặc chấm lại.",
              )}
            />
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

// One row of inline AI markup — ✓ điểm tốt (green), × cần sửa (red),
// or a neutral fallback for unstructured prose / salvage warnings.
// Mirrors a teacher's red-pen mark on a printed exam: glyph + italic
// short phrase, sitting just under the body it refers to.
function AnnotationRow({
  kind,
  text,
}: {
  kind: "good" | "error" | "note" | "warn";
  text: string;
}) {
  const palette: Record<typeof kind, { color: string; glyph: string; weight: number }> = {
    good:  { color: T.green, glyph: "✓", weight: 600 },
    error: { color: T.red,   glyph: "×", weight: 600 },
    note:  { color: T.textSoft, glyph: "•", weight: 500 },
    warn:  { color: T.amber, glyph: "⚠", weight: 600 },
  };
  const p = palette[kind];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        fontSize: 13.5,
        lineHeight: 1.55,
        color: T.textSoft,
        fontStyle: "italic",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          color: p.color,
          fontWeight: p.weight,
          fontFamily: T.mono,
          fontStyle: "normal",
          flexShrink: 0,
          minWidth: 12,
          textAlign: "center",
          lineHeight: 1.55,
        }}
      >
        {p.glyph}
      </span>
      <span style={{ color: p.color, fontWeight: 500 }}>{text}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReviewMockup — UI-first visual design (hardcoded sample data).
//
// Matches the reference Trần Minh Khôi mockup the teacher locked: header
// strip with student identity + AI run metadata, a left "document" column
// with a peach-tinted card per câu showing inline ✓ / × annotations next
// to the lines they refer to and a red italic score footer, and a right
// sticky summary panel with the overall estimated grade plus per-câu
// score cards (one highlighted as the active câu). Pure presentational —
// no props from real grade state yet. Wiring comes after sign-off.
// ---------------------------------------------------------------------------

// Schema mirrors the reference prototype's MOCK_AI_GRADE.byQuestion shape:
// student work is a flat string[], annotations live in a separate array and
// reference their target line by index. Keeps the data minimal and lets the
// renderer place ✓ / × glyphs inline with whatever line they describe.
interface MockAnnotation {
  /** Zero-based index into the parent question's ``lines`` array. */
  line: number;
  kind: "good" | "error";
  text: string;
}

interface MockQuestion {
  num: number;
  earned: number;
  max: number;
  /** Short rubric note shown in the right-side "TỪNG CÂU" summary card. */
  summary: string;
  /** Raw student work, one entry per visual line. Whitespace is preserved
   *  so indented continuation lines line up under their parent expression. */
  lines: string[];
  annotations: MockAnnotation[];
}

interface MockReferencedLesson {
  id: string;
  subject: string;
  score: number;
  text: string;
  similarity: number;
  date: string;
}

const MOCK_REVIEW = {
  studentName: "Trần Minh Khôi",
  studentClass: "Lớp 10A1",
  runNumber: 1,
  lessonsUsed: 3,
  modelName: "gemini-3-flash-preview",
  durationSec: 4.8,
  overallScore: 8.5,
  overallMax: 10.0,
  correctCount: 1,
  needsReviewCount: 2,
  /** Default focus on mount — Câu 1 mirrors the reference screenshot. */
  initialActiveQuestionNum: 1,
  referencedLessons: [
    {
      id: "L-0247",
      subject: "Toán",
      score: 4.0,
      text: "Khi học sinh giải pt bậc hai bằng Δ, không trừ điểm vì thiếu khẳng định a ≠ 0 nếu hệ số đã hiển nhiên bằng 1.",
      similarity: 0.91,
      date: "2026-04-22",
    },
    {
      id: "L-0193",
      subject: "Toán",
      score: 3.5,
      text: "Với câu hỏi 'tìm m để có 2 nghiệm phân biệt', cần kết luận miền m, KHÔNG chỉ ghi bất phương trình kết quả.",
      similarity: 0.88,
      date: "2026-04-15",
    },
    {
      id: "L-0166",
      subject: "Toán",
      score: 3.0,
      text: "Vi-ét chỉ áp dụng được khi pt có nghiệm (Δ ≥ 0). Bài đề cho biết đã có 2 nghiệm thì không cần nhắc lại điều kiện.",
      similarity: 0.74,
      date: "2026-03-30",
    },
  ] as MockReferencedLesson[],
  questions: [
    {
      num: 1,
      earned: 3.0,
      max: 3.0,
      summary: "Trình bày đầy đủ, tính Δ và nghiệm chính xác.",
      lines: [
        "Câu 1.",
        "x² - 5x + 6 = 0",
        "Δ = 25 - 24 = 1",
        "x = (5 ± 1) / 2",
        "→ x = 3  hoặc  x = 2",
        "Vậy phương trình có hai nghiệm  x = 2, x = 3.",
      ],
      annotations: [
        { line: 1, kind: "good", text: "Tính Δ đúng" },
        { line: 4, kind: "good", text: "Kết luận đầy đủ" },
      ],
    },
    {
      num: 2,
      earned: 3.0,
      max: 4.0,
      summary: "Tính toán đúng nhưng chưa loại trừ điều kiện a ≠ 0 và chưa nói rõ pt bậc hai.",
      lines: [
        "Câu 2.",
        "Để pt có 2 nghiệm phân biệt → Δ' > 0",
        "Δ' = (m+1)² - (m² - 3)",
        "    = m² + 2m + 1 - m² + 3",
        "    = 2m + 4",
        "2m + 4 > 0  →  m > -2",
        "Vậy m > -2 thì pt có 2 nghiệm phân biệt.",
      ],
      annotations: [
        { line: 1, kind: "error", text: "Thiếu khẳng định a = 1 ≠ 0 (pt bậc hai)" },
        { line: 5, kind: "good", text: "Biến đổi đúng" },
        { line: 6, kind: "error", text: "Cần KẾT LUẬN miền m ⇒ trừ 0.5đ" },
      ],
    },
    {
      num: 3,
      earned: 2.5,
      max: 3.0,
      summary: "Dùng Vi-ét hợp lý, nhưng cần ghi rõ điều kiện áp dụng và thử lại.",
      lines: [
        "Câu 3.",
        "Theo Vi-ét:",
        "x₁ + x₂ = -b   →   2 + (-5) = -b   →   b = 3",
        "x₁ · x₂ = c     →   2 · (-5) = c     →   c = -10",
        "Vậy b = 3, c = -10.",
      ],
      annotations: [
        { line: 2, kind: "error", text: "Thiếu điều kiện Δ ≥ 0 để áp dụng Vi-ét" },
        { line: 3, kind: "good", text: "Tính b đúng" },
        { line: 4, kind: "good", text: "Tính c đúng" },
      ],
    },
  ] as MockQuestion[],
};

/** Build the review payload (MOCK_REVIEW shape) from a live grade +
 *  pipeline state. Falls through to MOCK_REVIEW when the grade has no
 *  scored per-câu data, so dev runs and salvaged grades still render.
 *
 *  Fields still mocked (no source yet):
 *    - studentName / studentClass — no upload-form field for them.
 *    - durationSec — pipeline doesn't measure VLM call time yet.
 *    - similarity — backend doesn't expose semantic-distance per lesson.
 *  When those sources land, replace the placeholders here without
 *  changing the layout. */
function deriveStepReviewData(
  grade: Grade | null,
  lessonsUsed: Lesson[],
  runNumber: number,
): typeof MOCK_REVIEW {
  const pqf = grade?.per_question_feedback ?? [];
  const hasReal =
    pqf.length > 0 && pqf.some((q) => typeof q.score === "number");
  if (!hasReal) return MOCK_REVIEW;

  const linesByCau = splitTranscriptByCau(grade?.transcript ?? "");
  const questions: MockQuestion[] = pqf.map((q, i) => {
    const parsed = parseCauHeader(q.question ?? "", i + 1);
    const lines = linesByCau.get(parsed.num) ?? [];
    const max =
      typeof q.max_points === "number" && isFinite(q.max_points)
        ? q.max_points
        : 0;
    const earned =
      typeof q.score === "number" && isFinite(q.score) ? q.score : 0;
    return {
      num: parsed.num,
      earned,
      max,
      summary: q.good_points || q.errors || parsed.prompt || "",
      lines: lines.length > 0 ? lines : [`Câu ${parsed.num}.`],
      annotations: buildSyntheticAnnotations(q, lines.length),
    };
  });

  const overallMax = questions.reduce((s, q) => s + q.max, 0) || 10;
  const correctCount = questions.filter(
    (q) => q.max > 0 && Math.abs(q.earned - q.max) < 0.001,
  ).length;
  const needsReviewCount = questions.length - correctCount;

  const referencedLessons: MockReferencedLesson[] = lessonsUsed.map((l) => ({
    id: `L-${String(l.id).padStart(4, "0")}`,
    subject: l.subject || "—",
    score: l.feedback_score,
    text: l.lesson_text,
    similarity: 0, // Backend doesn't expose semantic distance yet.
    date: l.timestamp ? l.timestamp.slice(0, 10) : "—",
  }));

  return {
    studentName: MOCK_REVIEW.studentName, // No upload-form field yet.
    studentClass: MOCK_REVIEW.studentClass,
    runNumber,
    lessonsUsed: lessonsUsed.length,
    modelName: "gemini-3-flash-preview",
    durationSec: 0, // Not measured by pipeline yet.
    overallScore: typeof grade?.overall === "number" ? grade.overall : 0,
    overallMax,
    correctCount,
    needsReviewCount,
    initialActiveQuestionNum: questions[0]?.num ?? 1,
    referencedLessons,
    questions,
  };
}

function ReviewMockup({
  isMobile,
  review = MOCK_REVIEW,
  onViewOriginal,
  essayAvailable = false,
  teacherAnnotations,
  onAddAnnotation,
  onUpdateAnnotation,
  onRemoveAnnotation,
  onGoToRegrade,
}: {
  isMobile: boolean;
  review?: typeof MOCK_REVIEW;
  onViewOriginal?: () => void;
  essayAvailable?: boolean;
  teacherAnnotations?: SelectionAnnotation[];
  onAddAnnotation?: (a: SelectionAnnotation) => void;
  onUpdateAnnotation?: (id: string, patch: Partial<SelectionAnnotation>) => void;
  onRemoveAnnotation?: (id: string) => void;
  /** Forward to step 4 — used by the "Bản chấm AI" peek modal's CTA so
   *  teacher can jump straight to scoring after revealing AI's verdict. */
  onGoToRegrade?: () => void;
}) {
  const [activeQ, setActiveQ] = useState<number>(review.initialActiveQuestionNum);
  // Mục lục starts open on desktop, collapsed on narrow viewports so the
  // paper takes precedence on mobile.
  const [tocOpen, setTocOpen] = useState(!isMobile);
  const [aiPeekOpen, setAiPeekOpen] = useState(false);
  // ``flashCau`` drives a brief peach pulse on the câu in the document
  // body — set when the teacher clicks a mục lục entry, auto-cleared
  // after ~1.2s. The sidebar's own active state (activeQ) is sticky;
  // the body highlight is just a "you're here" pulse so the teacher
  // doesn't have to hunt for where the scroll landed.
  const [flashCau, setFlashCau] = useState<number | null>(null);
  useEffect(() => {
    if (flashCau === null) return;
    const t = window.setTimeout(() => setFlashCau(null), 1200);
    return () => window.clearTimeout(t);
  }, [flashCau]);

  const jumpToCau = useCallback((n: number) => {
    setActiveQ(n);
    setFlashCau(n);
    // Re-trigger the flash even if the teacher clicks the same câu
    // twice in a row — without this nudge the state stays at the same
    // number and React skips the re-pulse.
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-cau-anchor="${n}"]`);
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }, []);
  return (
    <div>
      <Step3Toolbar
        review={review}
        onViewOriginal={onViewOriginal}
        essayAvailable={essayAvailable}
        onPeekAi={() => setAiPeekOpen(true)}
        tocOpen={tocOpen}
        onToggleToc={() => setTocOpen((v) => !v)}
      />
      <div
        style={{
          display: isMobile || !tocOpen ? "block" : "grid",
          gridTemplateColumns:
            isMobile || !tocOpen ? undefined : "260px minmax(0, 1fr)",
          gap: 18,
          alignItems: "start",
        }}
      >
        {tocOpen && !isMobile && (
          <MucLucSidebar
            review={review}
            activeQ={activeQ}
            onJumpToCau={jumpToCau}
            teacherAnnotations={teacherAnnotations}
            onCollapse={() => setTocOpen(false)}
          />
        )}
        <PaperContainer
          review={review}
          flashCau={flashCau}
          teacherAnnotations={teacherAnnotations}
          onAddAnnotation={onAddAnnotation}
          onUpdateAnnotation={onUpdateAnnotation}
          onRemoveAnnotation={onRemoveAnnotation}
        />
      </div>
      <BanChamAiModal
        open={aiPeekOpen}
        onClose={() => setAiPeekOpen(false)}
        review={review}
        onGoToRegrade={onGoToRegrade}
      />
    </div>
  );
}

// PaperHead — slim title strip inside the paper card. The action pills
// (Xem PDF gốc, Bản chấm AI…) live in Step3Toolbar above the grid now,
// so this just carries the student identity as the document's heading.
function PaperHead({ review }: { review: typeof MOCK_REVIEW }) {
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


// PaperContainer — single "sheet of paper" wrapping every câu. Matches the
// reference's ``.paper`` card: one bordered surface with a head section
// (student identity + AI run meta) and a body section (annotated answer).
// q-blocks separated by spacing alone — no per-câu cards. Clicking inside
// a q-block sets that câu as active (peach tint follows the click); the
// rail mirrors the same state in its qcards.
function PaperContainer({
  review,
  flashCau,
  teacherAnnotations,
  onAddAnnotation,
  onUpdateAnnotation,
  onRemoveAnnotation,
}: {
  review: typeof MOCK_REVIEW;
  /** Câu number to briefly pulse — set when the teacher jumps from the
   *  mục lục. Null = no pulse. The container only renders the pulse
   *  bg while this matches; parent auto-clears after the flash window. */
  flashCau: number | null;
  teacherAnnotations?: SelectionAnnotation[];
  onAddAnnotation?: (a: SelectionAnnotation) => void;
  onUpdateAnnotation?: (id: string, patch: Partial<SelectionAnnotation>) => void;
  onRemoveAnnotation?: (id: string) => void;
}) {
  return (
    <div
      style={{
        background: T.paper,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        boxShadow: T.shadowSoft,
        minWidth: 0,
        // overflow:hidden keeps the elevated paper-head bg clipped to the
        // outer rounded corners — without it the head bleeds past the radius.
        overflow: "hidden",
      }}
    >
      <PaperHead review={review} />
      <div style={{ padding: "16px 20px 4px" }}>
        <AnnotatedAnswer
          questions={review.questions}
          flashCau={flashCau}
          teacherAnnotations={teacherAnnotations}
          onAddAnnotation={onAddAnnotation}
          onUpdateAnnotation={onUpdateAnnotation}
          onRemoveAnnotation={onRemoveAnnotation}
        />
      </div>
    </div>
  );
}


// AnnotatedAnswer — step 3 "đối soát" surface. Word-style annotation:
// teacher selects a passage in the AI transcript → a floating mini-
// toolbar appears with "Bình luận" → selection becomes a highlighted
// quote anchored to a comment thread under the câu. Highlights re-
// render on every state change by matching the saved quote against the
// line text (first occurrence wins — adequate for the prototype).
//
// AI scores / annotations are intentionally hidden here; the teacher
// reads blind and only reveals AI's verdict at step 4 or via the
// "Bản chấm AI" peek modal in the toolbar.
function AnnotatedAnswer({
  questions,
  flashCau,
  teacherAnnotations,
  onAddAnnotation,
  onUpdateAnnotation,
  onRemoveAnnotation,
}: {
  questions: MockQuestion[];
  /** Câu number to briefly pulse with a peach background. Set by the
   *  mục lục jump action; auto-clears after ~1.2s. */
  flashCau: number | null;
  teacherAnnotations?: SelectionAnnotation[];
  onAddAnnotation?: (a: SelectionAnnotation) => void;
  onUpdateAnnotation?: (id: string, patch: Partial<SelectionAnnotation>) => void;
  onRemoveAnnotation?: (id: string) => void;
}) {
  // Floating mini-toolbar state. ``pending`` captures the selection
  // snapshot at the moment of mouseup so it survives the click on the
  // "Bình luận" button (browsers collapse the native selection as soon
  // as focus leaves the text). ``x``/``y`` are viewport coords.
  const [pending, setPending] = useState<
    | {
        cau: number;
        lineIdx: number;
        quote: string;
        x: number;
        y: number;
      }
    | null
  >(null);
  // When a fresh annotation is created we auto-open its comment input.
  // null = nothing being edited; string = annotation id whose card is in
  // edit mode.
  const [editingId, setEditingId] = useState<string | null>(null);
  // Which annotation's card is "focused" — drives the peach highlight
  // ring on the mark and the matching card style. Set when the teacher
  // clicks a highlight OR completes a new annotation.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Set of annotation IDs currently waiting on /api/analyze-comment.
  // Drives the "AI đang phân tích…" pill on the card. Cleared when the
  // response (or error) lands. Component unmount aborts via the
  // ``mountedRef`` guard inside ``analyzeAnnotation``.
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);

  // Build the analyze-comment payload from the câu context, then update
  // the annotation with the verdict + analysis. Anti-poisoning: comments
  // AI disputes are NOT auto-staged at step 4 — the teacher has to
  // explicitly press "Vẫn lưu" to override. Network failures degrade
  // gracefully (no verdict ⇒ treated like a pending state but doesn't
  // block step 4 finalize; the comment still stages as before).
  const analyzeAnnotation = useCallback(
    async (id: string, cau: number, comment: string) => {
      const q = questions.find((qq) => qq.num === cau);
      if (!q || !onUpdateAnnotation) return;
      // Pull the câu's first line as the question label and the rest as
      // the student work, slicing to keep the API payload compact.
      const studentWork = q.lines.join("\n").slice(0, 2000);
      const questionLabel = q.lines[0] || `Câu ${cau}`;
      setAnalyzingIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      try {
        const data = await analyzeComment({
          question: questionLabel,
          student_answer: studentWork,
          teacher_comment: comment,
        });
        if (!mountedRef.current) return;
        onUpdateAnnotation(id, {
          verdict: (data.verdict as CommentVerdict) || "agree",
          analysis: (data.analysis || "").trim(),
        });
      } catch (err) {
        console.warn("[step3] analyze-comment failed:", err);
        // Don't block staging on network errors — clear the analyzing
        // state and leave verdict undefined so the comment is treated as
        // an un-vetted annotation (will still stage at step 4).
      } finally {
        if (mountedRef.current) {
          setAnalyzingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      }
    },
    [questions, onUpdateAnnotation],
  );

  const handleMouseUp = useCallback(() => {
    if (!onAddAnnotation) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setPending(null);
      return;
    }
    const trimmed = sel.toString().replace(/\s+$/, "");
    if (!trimmed) {
      setPending(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const startLine = (range.startContainer.parentElement?.closest(
      "[data-cau][data-line]",
    ) as HTMLElement) || null;
    const endLine = (range.endContainer.parentElement?.closest(
      "[data-cau][data-line]",
    ) as HTMLElement) || null;
    if (!startLine || startLine !== endLine) {
      setPending(null);
      return;
    }
    const cau = Number(startLine.dataset.cau);
    const lineIdx = Number(startLine.dataset.line);
    if (Number.isNaN(cau) || Number.isNaN(lineIdx)) {
      setPending(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    setPending({
      cau,
      lineIdx,
      quote: trimmed,
      x: rect.left + rect.width / 2,
      y: rect.bottom,
    });
  }, [onAddAnnotation]);

  // Clear the pending toolbar on outside click. Without this the chip
  // lingers after the user moves on.
  useEffect(() => {
    if (!pending) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      const toolbar = document.getElementById("step3-selection-toolbar");
      if (toolbar?.contains(target)) return;
      setPending(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pending]);

  const commitPending = () => {
    if (!pending || !onAddAnnotation) return;
    const id = `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    onAddAnnotation({
      id,
      cau: pending.cau,
      lineIdx: pending.lineIdx,
      quote: pending.quote,
      comment: "",
    });
    setPending(null);
    window.getSelection()?.removeAllRanges();
    setEditingId(id);
    setFocusedId(id);
  };

  return (
    <div
      ref={containerRef}
      onMouseUp={handleMouseUp}
      style={{
        fontFamily: T.mono,
        fontSize: 14.5,
        color: T.textSoft,
        lineHeight: 1.85,
      }}
    >
      {questions.map((q) => {
        const flashing = q.num === flashCau;
        const cauAnns = (teacherAnnotations ?? []).filter(
          (a) => a.cau === q.num,
        );
        return (
          <div
            key={q.num}
            data-cau-anchor={q.num}
            style={{
              padding: "14px 16px",
              margin: "0 -16px 18px",
              borderRadius: 8,
              background: flashing ? "#FBEEEA" : "transparent",
              // 0.6s fade-out so the highlight gracefully decays once
              // the parent's auto-clear timer fires — no abrupt
              // disappearance.
              transition: flashing
                ? "background 0.1s ease-out"
                : "background 0.6s ease-out",
              scrollMarginTop: 12,
            }}
          >
            {q.lines.map((line, i) => {
              const lineAnns = cauAnns.filter((a) => a.lineIdx === i);
              return (
                <div
                  key={i}
                  data-cau={q.num}
                  data-line={i}
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    minWidth: 0,
                  }}
                >
                  {renderLineWithHighlights(
                    line,
                    lineAnns,
                    focusedId,
                    (id) => {
                      setFocusedId(id);
                      setEditingId(null);
                    },
                  )}
                </div>
              );
            })}
            <AnnotationList
              cauAnns={cauAnns}
              editingId={editingId}
              focusedId={focusedId}
              onStartEdit={(id) => {
                setEditingId(id);
                setFocusedId(id);
              }}
              onCancelEdit={(id, currentComment) => {
                if (!currentComment.trim()) {
                  onRemoveAnnotation?.(id);
                  setFocusedId(null);
                }
                setEditingId(null);
              }}
              onSave={(id, comment) => {
                const trimmed = comment.trim();
                if (!trimmed) {
                  onRemoveAnnotation?.(id);
                  setFocusedId(null);
                  setEditingId(null);
                  return;
                }
                // Persist the comment, reset prior verdict (so a re-edit
                // re-triggers AI analysis), then fire /api/analyze-comment.
                onUpdateAnnotation?.(id, {
                  comment: trimmed,
                  verdict: undefined,
                  analysis: undefined,
                  disputeDecision: undefined,
                });
                setEditingId(null);
                const ann = (teacherAnnotations ?? []).find((a) => a.id === id);
                if (ann) {
                  void analyzeAnnotation(id, ann.cau, trimmed);
                }
              }}
              analyzingIds={analyzingIds}
              onDecideDispute={(id, decision) => {
                onUpdateAnnotation?.(id, { disputeDecision: decision });
              }}
              onRemove={(id) => {
                onRemoveAnnotation?.(id);
                if (focusedId === id) setFocusedId(null);
                if (editingId === id) setEditingId(null);
              }}
            />
          </div>
        );
      })}
      {pending && (
        <SelectionToolbar
          x={pending.x}
          y={pending.y}
          onComment={commitPending}
          onDismiss={() => setPending(null)}
        />
      )}
    </div>
  );
}

// renderLineWithHighlights — split a line into segments where each
// annotation's quote becomes a `<mark>` and the rest stays plain text.
// Matches are case-sensitive; if a quote appears multiple times, only
// the FIRST unhighlighted match for each annotation wins. Good enough
// for the prototype.
function renderLineWithHighlights(
  line: string,
  anns: SelectionAnnotation[],
  focusedId: string | null,
  onClickMark: (id: string) => void,
): React.ReactNode[] {
  type Seg = { text: string; ann: SelectionAnnotation | null };
  let segs: Seg[] = [{ text: line, ann: null }];
  for (const ann of anns) {
    const next: Seg[] = [];
    let placed = false;
    for (const seg of segs) {
      if (seg.ann || placed) {
        next.push(seg);
        continue;
      }
      const idx = seg.text.indexOf(ann.quote);
      if (idx === -1) {
        next.push(seg);
        continue;
      }
      if (idx > 0) next.push({ text: seg.text.slice(0, idx), ann: null });
      next.push({ text: ann.quote, ann });
      const tail = seg.text.slice(idx + ann.quote.length);
      if (tail.length > 0) next.push({ text: tail, ann: null });
      placed = true;
    }
    segs = next;
  }
  return segs.map((seg, i) => {
    if (!seg.ann) return <span key={i}>{seg.text}</span>;
    const focused = focusedId === seg.ann.id;
    const annId = seg.ann.id;
    return (
      <mark
        key={i}
        onClick={(e) => {
          e.stopPropagation();
          onClickMark(annId);
        }}
        style={{
          background: focused ? "#F8C9B9" : "#FBEEEA",
          color: T.text,
          padding: "0 2px",
          borderRadius: 2,
          cursor: "pointer",
          transition: "background 0.12s",
        }}
      >
        {seg.text}
      </mark>
    );
  });
}

// SelectionToolbar — floating mini-toolbar Word-style. Pinned to viewport
// coords so it survives scroll jitter; positioned just below the selection
// rect. Uses ``onMouseDown`` (not onClick) so the action fires before the
// browser collapses the selection.
function SelectionToolbar({
  x,
  y,
  onComment,
  onDismiss,
}: {
  x: number;
  y: number;
  onComment: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState({ left: x, top: y + 8 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const vw = window.innerWidth;
    const half = w / 2;
    const left = Math.max(half + 6, Math.min(vw - half - 6, x));
    setClamped({ left, top: y + 8 });
  }, [x, y]);
  return (
    <div
      id="step3-selection-toolbar"
      ref={ref}
      style={{
        position: "fixed",
        left: clamped.left,
        top: clamped.top,
        transform: "translateX(-50%)",
        background: T.paper,
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: 4,
        zIndex: 50,
        fontFamily: T.font,
      }}
    >
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onComment();
        }}
        title="Tô vàng + thêm bình luận"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          fontSize: 12.5,
          fontWeight: 500,
          color: T.text,
          background: T.bgCard,
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          fontFamily: T.font,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#FBEEEA";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = T.bgCard;
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 12,
            height: 12,
            background: "#FBEEEA",
            border: `1px solid ${T.accent}`,
            borderRadius: 2,
          }}
        />
        Bình luận
      </button>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onDismiss();
        }}
        aria-label="Bỏ qua"
        title="Bỏ qua"
        style={{
          width: 24,
          height: 24,
          border: "none",
          background: "transparent",
          color: T.textFaint,
          cursor: "pointer",
          padding: 0,
          fontSize: 14,
          borderRadius: 4,
        }}
      >
        ×
      </button>
    </div>
  );
}

// AnnotationList — per-câu list of saved annotations. Stops propagation
// so editing doesn't fire the câu container's click-to-activate.
function AnnotationList({
  cauAnns,
  editingId,
  focusedId,
  analyzingIds,
  onStartEdit,
  onCancelEdit,
  onSave,
  onRemove,
  onDecideDispute,
}: {
  cauAnns: SelectionAnnotation[];
  editingId: string | null;
  focusedId: string | null;
  /** Set of annotation IDs whose /api/analyze-comment request is in
   *  flight. Cards in this set render a "đang phân tích" pill instead
   *  of the verdict. */
  analyzingIds: Set<string>;
  onStartEdit: (id: string) => void;
  onCancelEdit: (id: string, currentComment: string) => void;
  onSave: (id: string, comment: string) => void;
  onRemove: (id: string) => void;
  /** Teacher's override on a disputed verdict — "apply" stages the
   *  lesson anyway, "skip" drops it. */
  onDecideDispute: (id: string, decision: "apply" | "skip") => void;
}) {
  if (cauAnns.length === 0) return null;
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: `1px dashed ${T.borderLight}`,
        fontFamily: T.font,
        fontSize: 13.5,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {cauAnns.map((ann) => (
        <AnnotationCard
          key={ann.id}
          ann={ann}
          editing={editingId === ann.id}
          focused={focusedId === ann.id}
          analyzing={analyzingIds.has(ann.id)}
          onStartEdit={() => onStartEdit(ann.id)}
          onCancelEdit={(currentComment) => onCancelEdit(ann.id, currentComment)}
          onSave={(comment) => onSave(ann.id, comment)}
          onRemove={() => onRemove(ann.id)}
          onDecideDispute={(decision) => onDecideDispute(ann.id, decision)}
        />
      ))}
    </div>
  );
}

function AnnotationCard({
  ann,
  editing,
  focused,
  analyzing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onRemove,
  onDecideDispute,
}: {
  ann: SelectionAnnotation;
  editing: boolean;
  focused: boolean;
  analyzing: boolean;
  onStartEdit: () => void;
  onCancelEdit: (currentComment: string) => void;
  onSave: (comment: string) => void;
  onRemove: () => void;
  onDecideDispute: (decision: "apply" | "skip") => void;
}) {
  const [draft, setDraft] = useState(ann.comment);
  useEffect(() => {
    setDraft(ann.comment);
  }, [ann.comment, editing]);

  // Card-level collapse. Default = card only shows quote + teacher
  // comment + delete. Teacher clicks the card to reveal the AI verdict
  // section. Two cases force it open without a click:
  //   • analyzing — the loading pill belongs in plain view so the
  //     teacher knows /api/analyze-comment is in flight.
  //   • dispute with pending decision — the teacher MUST choose
  //     "Vẫn lưu / Bỏ qua", so we can't hide the buttons behind a click.
  const [cardExpanded, setCardExpanded] = useState(false);
  const needsDecision =
    ann.verdict === "dispute" && ann.disputeDecision === undefined;
  const forceShowVerdict = analyzing || needsDecision;
  const showVerdict = (cardExpanded || forceShowVerdict) && !editing;
  // Re-collapse when the verdict changes — a fresh analysis shouldn't
  // auto-expand prior state into view.
  useEffect(() => {
    setCardExpanded(false);
  }, [ann.verdict]);

  return (
    <div
      onClick={(e) => {
        // Toggle expansion when the teacher clicks the card chrome (quote
        // area, padding, card surface). Comment text + × + edit input all
        // stopPropagation already, so they keep their own click semantics.
        // Skip the toggle while in edit mode — the input needs every click.
        if (editing) return;
        // Don't allow collapse while a dispute decision is still pending —
        // the buttons must stay visible until the teacher picks.
        if (forceShowVerdict && cardExpanded === false) {
          // Already force-open: a click here is harmless, no-op.
          return;
        }
        e.stopPropagation();
        setCardExpanded((v) => !v);
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "8px 10px",
        background: focused ? "#FBEEEA" : T.bgCard,
        border: focused ? `1px solid ${T.accent}` : `1px solid ${T.borderLight}`,
        borderLeft: `3px solid ${T.accent}`,
        borderRadius: 4,
        transition: "background 0.12s, border-color 0.12s",
        cursor: editing ? "default" : "pointer",
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: T.textSoft,
          fontStyle: "italic",
          fontFamily: T.font,
          lineHeight: 1.45,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        “{ann.quote}”
      </div>
      {editing ? (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSave(draft);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCancelEdit(draft);
              }
            }}
            placeholder="Ghi nhận xét của bạn…"
            style={{
              flex: 1,
              padding: "6px 10px",
              borderRadius: 6,
              border: `1px solid ${T.border}`,
              background: T.paper,
              fontFamily: T.font,
              fontSize: 13.5,
              color: T.text,
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={!draft.trim()}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "none",
              background: draft.trim() ? T.accent : T.borderLight,
              color: draft.trim() ? "#fff" : T.textFaint,
              fontFamily: T.font,
              fontSize: 13,
              fontWeight: 600,
              cursor: draft.trim() ? "pointer" : "not-allowed",
            }}
          >
            Lưu
          </button>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <span
            style={{
              flex: 1,
              whiteSpace: "pre-wrap",
              minWidth: 0,
              color: T.text,
              lineHeight: 1.5,
              cursor: "text",
            }}
            onClick={(e) => {
              // Comment text owns the edit affordance; the card-level
              // expand toggle skips it via this stopPropagation.
              e.stopPropagation();
              onStartEdit();
            }}
            role="button"
            tabIndex={0}
          >
            {ann.comment || (
              <span style={{ color: T.textFaint, fontStyle: "italic" }}>
                Bấm để thêm nhận xét
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title="Xoá"
            style={{
              flexShrink: 0,
              width: 22,
              height: 22,
              borderRadius: "50%",
              border: "none",
              background: "transparent",
              color: T.textFaint,
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
      )}
      {/* Verdict block — hidden until the teacher clicks the card.
          Force-shown when analyzing OR when a dispute decision is
          pending (anti-poisoning gate can't hide behind a click). */}
      {showVerdict && ann.comment && (
        <VerdictRow
          analyzing={analyzing}
          verdict={ann.verdict}
          analysis={ann.analysis}
          disputeDecision={ann.disputeDecision}
          onDecideDispute={onDecideDispute}
        />
      )}
    </div>
  );
}

// VerdictRow — surfaces /api/analyze-comment's judgment under each
// annotation card. At rest only the pill is visible (verdict label +
// status). Clicking the pill expands the analysis + dispute buttons.
// Force-expanded when a dispute decision is pending — teacher MUST
// choose "Vẫn lưu" / "Bỏ qua", can't dismiss the prompt.
function VerdictRow({
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
            borderRadius: 6,
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
              borderRadius: 6,
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
              borderRadius: 6,
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

// Step3Toolbar — full-width action bar above the doc/sidebar grid.
// Inspired by document-editor toolbars (Word, Google Docs): identity
// strip on the left, action pills on the right. Centralises affordances
// that used to be in the paper-head MetaPills + adds "Bản chấm AI"
// peek so the teacher can reveal AI's verdict without committing to
// step 4 yet.
function Step3Toolbar({
  review,
  onViewOriginal,
  essayAvailable,
  onPeekAi,
  tocOpen,
  onToggleToc,
}: {
  review: typeof MOCK_REVIEW;
  onViewOriginal?: () => void;
  essayAvailable?: boolean;
  onPeekAi: () => void;
  tocOpen: boolean;
  onToggleToc: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 16px",
        marginBottom: 14,
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        boxShadow: T.shadowSoft,
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
        }}
      >
        <ToolbarIconButton
          onClick={onToggleToc}
          title={tocOpen ? "Ẩn mục lục" : "Hiện mục lục"}
          aria-label="Mục lục"
        >
          <Icon.Menu size={14} />
        </ToolbarIconButton>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: T.textFaint,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Bản chấm AI · Lần {review.runNumber}
          </div>
          <div
            style={{
              fontFamily: T.font,
              fontSize: 14,
              fontWeight: 600,
              color: T.text,
              lineHeight: 1.3,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {review.studentName} · {review.studentClass}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        <ToolbarButton
          icon={<Icon.FileText size={12} />}
          onClick={essayAvailable ? onViewOriginal : undefined}
          disabled={!essayAvailable}
          title={
            essayAvailable
              ? "Mở bài làm gốc để đối chiếu"
              : "Chưa có bài làm gốc trong phiên này."
          }
        >
          Xem PDF gốc
        </ToolbarButton>
        <ToolbarButton
          icon={<Icon.Lightbulb size={12} color={T.amber} />}
          onClick={onPeekAi}
          title="Xem điểm + nhận xét AI đã chấm"
        >
          Bản chấm AI
        </ToolbarButton>
        <ToolbarButton
          icon={<PrinterIcon size={12} />}
          onClick={() => window.print()}
          title="In bài chấm"
        >
          In
        </ToolbarButton>
      </div>
    </div>
  );
}

// ToolbarButton — pill-shaped action button used inside Step3Toolbar.
// Matches MetaPill's silhouette so adjacent surfaces (PaperHead before
// the redesign, MucLuc items now) read as part of the same visual
// system.
function ToolbarButton({
  children,
  icon,
  onClick,
  title,
  disabled = false,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        fontSize: 12.5,
        fontFamily: T.font,
        fontWeight: 500,
        color: disabled ? T.textFaint : T.textSoft,
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 999,
        cursor: disabled || !onClick ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transition: "color 0.12s, border-color 0.12s",
        whiteSpace: "nowrap",
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
      {icon}
      {children}
    </button>
  );
}

function PrinterIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function ToolbarIconButton({
  children,
  onClick,
  title,
  ...aria
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      {...aria}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 30,
        height: 30,
        padding: 0,
        background: "transparent",
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        color: T.textSoft,
        cursor: "pointer",
        transition: "color 0.12s, border-color 0.12s, background 0.12s",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = T.text;
        e.currentTarget.style.borderColor = T.textMute;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = T.textSoft;
        e.currentTarget.style.borderColor = T.border;
      }}
    >
      {children}
    </button>
  );
}

// MucLucSidebar — left-side table of contents inspired by document
// editors (a "mục lục" for the bài làm). Hierarchical: "BÀI LÀM" header
// → câu items with ghi-chú count badge. Collapsible via the toolbar's
// menu icon. Sticky so navigation stays in reach while the teacher
// scrolls long transcripts.
function MucLucSidebar({
  review,
  activeQ,
  onJumpToCau,
  teacherAnnotations,
  onCollapse,
}: {
  review: typeof MOCK_REVIEW;
  /** The câu most recently clicked in the sidebar. Drives the persistent
   *  border-left peach marker so the teacher knows where they are. */
  activeQ: number;
  /** Click handler that owns both the scroll-into-view and the body-side
   *  flash pulse. Sidebar just fires this; the parent decides what
   *  happens. */
  onJumpToCau: (n: number) => void;
  teacherAnnotations?: SelectionAnnotation[];
  onCollapse: () => void;
}) {
  const totalNotes = (teacherAnnotations ?? []).length;
  const countByCau = (cau: number) =>
    (teacherAnnotations ?? []).filter((a) => a.cau === cau).length;
  return (
    <aside
      style={{
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        boxShadow: T.shadowSoft,
        display: "flex",
        flexDirection: "column",
        position: "sticky",
        top: 16,
        alignSelf: "start",
        maxHeight: "calc(100vh - 32px)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${T.borderLight}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            fontWeight: 700,
            color: T.textFaint,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Mục lục
        </div>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Thu gọn mục lục"
          title="Thu gọn"
          style={{
            width: 22,
            height: 22,
            border: "none",
            background: "transparent",
            color: T.textFaint,
            cursor: "pointer",
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 4,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = T.textFaint)}
        >
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
      </div>
      <div
        style={{
          padding: "12px 0",
          overflowY: "auto",
          flex: 1,
        }}
      >
        <div
          style={{
            padding: "0 16px 6px",
            fontSize: 12,
            fontWeight: 700,
            color: T.text,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Bài làm
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {review.questions.map((q) => {
            const noteCount = countByCau(q.num);
            const active = q.num === activeQ;
            return (
              <button
                key={q.num}
                type="button"
                onClick={() => onJumpToCau(q.num)}
                aria-pressed={active}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  textAlign: "left",
                  width: "100%",
                  padding: "8px 16px 8px 22px",
                  fontFamily: "inherit",
                  fontSize: 13.5,
                  color: active ? T.accent : T.textSoft,
                  fontWeight: active ? 600 : 500,
                  background: active ? "#FBEEEA" : "transparent",
                  border: "none",
                  borderLeft: active
                    ? `3px solid ${T.accent}`
                    : "3px solid transparent",
                  cursor: "pointer",
                  transition: "color 0.12s, background 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (active) return;
                  e.currentTarget.style.color = T.text;
                }}
                onMouseLeave={(e) => {
                  if (active) return;
                  e.currentTarget.style.color = T.textSoft;
                }}
              >
                <span>Câu {q.num}</span>
                {noteCount > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: T.mono,
                      color: active ? T.accent : T.textFaint,
                      flexShrink: 0,
                    }}
                  >
                    {noteCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div
        style={{
          padding: "10px 16px",
          borderTop: `1px solid ${T.borderLight}`,
          fontSize: 11.5,
          color: T.textMute,
          fontFamily: T.mono,
          flexShrink: 0,
        }}
      >
        {totalNotes} ghi chú đối soát
      </div>
    </aside>
  );
}

// BanChamAiModal — escape hatch for the teacher to peek at AI's verdict
// without committing to step 4. Useful after they've finished blind
// annotation and want a sanity-check against their own scoring intuition.
function BanChamAiModal({
  open,
  onClose,
  review,
  onGoToRegrade,
}: {
  open: boolean;
  onClose: () => void;
  review: typeof MOCK_REVIEW;
  onGoToRegrade?: () => void;
}) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        animation: "fadeUp 0.2s ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(620px, 100%)",
          maxHeight: "85vh",
          background: T.paper,
          borderRadius: 12,
          boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 22px",
            borderBottom: `1px solid ${T.borderLight}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div>
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
                fontSize: 17,
                fontWeight: 600,
                color: T.text,
              }}
            >
              AI chấm: {review.overallScore.toFixed(1)}
              <span style={{ color: T.textMute, fontWeight: 400 }}>
                {" "}
                / {review.overallMax.toFixed(1)}đ
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            title="Đóng"
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: `1px solid ${T.border}`,
              background: T.bgCard,
              color: T.textMute,
              cursor: "pointer",
              fontSize: 14,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>
        <div
          style={{
            padding: "14px 22px",
            overflowY: "auto",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 12.5,
              color: T.textSoft,
              lineHeight: 1.55,
            }}
          >
            AI đề xuất các mức điểm dưới đây. Bạn vẫn là người quyết định
            cuối — vào bước "Chấm lại" để chốt điểm chính thức.
          </div>
          {review.questions.map((q) => {
            const lost = q.earned < q.max - 0.001;
            return (
              <div
                key={q.num}
                style={{
                  border: `1px solid ${T.borderLight}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                  background: T.bgCard,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: T.text,
                    }}
                  >
                    Câu {q.num}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 13.5 }}>
                    <span
                      style={{
                        fontWeight: 700,
                        color: lost ? T.red : T.green,
                      }}
                    >
                      {q.earned.toFixed(1)}
                    </span>
                    <span style={{ color: T.textMute }}>
                      /{q.max.toFixed(1)}
                    </span>
                  </div>
                </div>
                {q.summary && (
                  <div
                    style={{
                      fontSize: 13,
                      color: T.textSoft,
                      lineHeight: 1.55,
                    }}
                  >
                    {q.summary}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div
          style={{
            padding: "12px 22px",
            borderTop: `1px solid ${T.borderLight}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              color: T.textSoft,
              background: T.bgCard,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: T.font,
            }}
          >
            Tiếp tục đối soát
          </button>
          {onGoToRegrade && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onGoToRegrade();
              }}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                color: "#FFFDF8",
                background: T.accent,
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontFamily: T.font,
              }}
            >
              Đi tới chấm điểm →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}



// ---------------------------------------------------------------------------
// Main StepReview
// ---------------------------------------------------------------------------
interface StepReviewProps {
  grade: Grade | null;
  pipeline: UseAgentPipelineResult;
  feedbackHook: UseFeedbackResult;
  /** Legacy rubber-stamp callback. Kept on the props so the workspace
   *  still wires it (for the eventual backend rewire of an "approve"
   *  verdict). Currently no UI surfaces it — every grade now flows
   *  through step 4 → step 5 finalize, and the approve semantics are
   *  expected to be derived from "no scores changed" at step 5. */
  onApprove: () => void;
  /** Primary forward action — go to step 4 (Chấm lại) for per-câu
   *  review. */
  onGoToRegrade?: () => void;
  /** Back action — go to step 1 so the teacher can re-upload / swap
   *  files. "Đọc lại" reads as "đọc lại đề + bài làm" in this flow. */
  onPrev?: () => void;
  backendSubject: BackendSubject | null;
  task: string;
  t: I18nStrings;
  essayImage: EssayFile | null;
  /** Teacher's Word-style annotations — each anchored to a quote in the
   *  AI transcript with a comment. Owned by the workspace so they survive
   *  step navigation and feed into step 4. */
  teacherAnnotations: SelectionAnnotation[];
  setTeacherAnnotations: React.Dispatch<
    React.SetStateAction<SelectionAnnotation[]>
  >;
}

export function StepReview({
  grade,
  pipeline,
  feedbackHook,
  onApprove,
  onGoToRegrade,
  onPrev,
  backendSubject,
  task,
  t,
  essayImage,
  teacherAnnotations,
  setTeacherAnnotations,
}: StepReviewProps) {
  const [commentThreads, setCommentThreads] = useState<CommentThreads>({});
  const [analyzingQ, setAnalyzingQ] = useState<number | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const isMobile = useIsMobile();
  // dataUrl→blob conversion + revoke lifecycle now lives inside
  // OriginalImageModal (shared with step 4) — caller just owns the
  // open/close toggle.

  // IMPORTANT: hooks must be called before any conditional return. These
  // `useMemo`s used to live AFTER the `if (!grade) return null` check, which
  // was a legacy JS pattern TS/React would flag as a rule-of-hooks violation
  // once the component becomes typed.
  const studentParts = useMemo(() => parseIntoQuestions(grade?.transcript), [grade?.transcript]);
  const commentParts = useMemo(() => parseIntoQuestions(grade?.comment), [grade?.comment]);
  const questionPairs = useMemo(
    () => alignByQuestionNumber(studentParts, commentParts),
    [studentParts, commentParts],
  );

  const handleSendComment = useCallback(
    async (qIdx: number, text: string) => {
      setCommentThreads((prev) => ({
        ...prev,
        [qIdx]: [...(prev[qIdx] || []), { type: "teacher", text }],
      }));

      setAnalyzingQ(qIdx);
      try {
        const pair = questionPairs[qIdx];
        const data = await analyzeComment({
          question: buildAnalyzeQuestionContext(task, pair),
          student_answer: (pair?.student?.body || "").slice(0, 2000),
          teacher_comment: text,
        });
        setCommentThreads((prev) => ({
          ...prev,
          [qIdx]: [
            ...(prev[qIdx] || []),
            {
              type: "ai",
              text: normalizeAiAnalysisText(data.analysis, t),
              lesson: (data.lesson || "").trim(),
              verdict: data.verdict,
            },
          ],
        }));
      } catch (err) {
        console.error("Comment analysis failed:", err);
      }
      setAnalyzingQ(null);
    },
    [task, questionPairs, t],
  );

  /**
   * Teacher decides whether to apply or skip a disputed AI lesson.
   * Mutates the message in-place by index — the dispute UI only renders
   * decision buttons when ``disputeDecision`` is undefined, so subsequent
   * clicks are inert.
   */
  const handleDisputeDecide = useCallback(
    (qIdx: number, msgIdx: number, decision: "apply" | "skip") => {
      setCommentThreads((prev) => {
        const msgs = prev[qIdx];
        if (!msgs || !msgs[msgIdx]) return prev;
        const next = msgs.slice();
        next[msgIdx] = { ...next[msgIdx], disputeDecision: decision };
        return { ...prev, [qIdx]: next };
      });
    },
    [],
  );

  // Derive the "Word-print" review payload from grade + pipeline state.
  // useMemo so we don't re-build the questions array on every render
  // when the active câu changes inside ReviewMockup. ``runCount`` from
  // pipeline starts at 0 on first PIPELINE_SUCCESS, so +1 reads as
  // "Lần 1" to the teacher. MUST live before the `if (!grade) return`
  // early return — react-hooks/rules-of-hooks.
  const reviewData = useMemo(
    () =>
      deriveStepReviewData(
        grade,
        pipeline.lessonsUsed,
        pipeline.runCount + 1,
      ),
    [grade, pipeline.lessonsUsed, pipeline.runCount],
  );

  if (!grade) return null;

  const questionCount = questionPairs.length;

  const weaknesses = Array.isArray(grade.weaknesses) ? grade.weaknesses : [];
  const isSalvaged =
    Boolean(grade.salvaged) ||
    weaknesses.some((w) => typeof w === "string" && w.toLowerCase().includes("unparseable"));

  // ``subject`` is still threaded into QuestionBox for math-aware transcript
  // formatting (formatTranscript). The user-facing badge that used to show
  // subjectName has been removed — Sidebar already displays the subject
  // selection, and grade.subject is hard-stamped to "stem" so the badge was
  // surfacing the wrong label anyway.
  const subject: Subject | string = grade.subject || "literature";

  const refForIdx = (idx: number | string) => questionPairs[Number(idx)]?.num ?? Number(idx) + 1;

  const stagedLessons: StagedLesson[] = Object.entries(commentThreads).flatMap(([idx, msgs]) => {
    // getStageableLesson returns "" for disputed lessons that the
    // teacher hasn't explicitly applied — that's the anti-poison guard.
    const lessonText = getStageableLesson(msgs);
    if (!lessonText) return [];
    return [
      {
        lesson_text: lessonText,
        question_ref: `Câu ${refForIdx(idx)}`,
      },
    ];
  });

  const aggregatedNote = Object.entries(commentThreads)
    .flatMap(([idx, msgs]) =>
      msgs.filter((m) => m.type === "teacher").map((m) => `[Câu ${refForIdx(idx)}] ${m.text}`),
    )
    .join("\n");

  const handleApproveClick = async () => {
    if (feedbackHook.isSubmitting || pipeline.phase === "generating") return;
    const res = await feedbackHook.submit({
      action: "approve",
      comment: aggregatedNote || "",
      stagedLessons,
      task: task || "",
      wrongCode: pipeline.code || "",
      runId: pipeline.runId,
      subject: backendSubject,
    });
    if (res && onApprove) onApprove();
  };

  const canApprove = !feedbackHook.isSubmitting && pipeline.phase !== "generating";

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      {/* Top toolbar — horizontal padding matches the QuestionBox card's
          internal padding (20 px). Now hosts only the staged-lessons
          counter (lightbulb badge); the "Xem PDF gốc" affordance moved
          into PaperHead as a MetaPill so the document and its actions
          stay co-located. */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          minHeight: 28,
          padding: "0 20px",
        }}
      >
        {/* Left side intentionally empty — both meta-controls (lightbulb +
            view-original) cluster on the right per design 2026-04-26. The
            empty div keeps justifyContent: "space-between" pushing the
            right cluster to the edge without restructuring the flex parent. */}
        <div />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {stagedLessons.length > 0 && (
            // Lightbulb-with-counter: ``key`` set to the count so React
            // remounts the wrapper on every increment, replaying the
            // ``lessonPop`` keyframe — gives the teacher a quick visual
            // cue that a new lesson was just staged from their last comment.
            <span
              key={stagedLessons.length}
              title={`${stagedLessons.length} ${t.lessonsStaged ?? "bài học chờ lưu khi duyệt"}`}
              aria-label={`${stagedLessons.length} ${
                t.lessonsStaged ?? "bài học chờ lưu khi duyệt"
              }`}
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                animation: "lessonPop 0.32s ease-out",
              }}
            >
              <Icon.Lightbulb size={20} color={T.amber} />
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -6,
                  minWidth: 16,
                  height: 16,
                  padding: "0 4px",
                  borderRadius: 8,
                  background: T.amber,
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: T.mono,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                  boxShadow: T.shadowSoft,
                }}
              >
                {stagedLessons.length}
              </span>
            </span>
          )}
          {/* "Xem PDF gốc" affordance lives inside the paper-head as a
              MetaPill alongside the lessons-used pill — keeps the action
              cluster co-located with the document it acts on. */}
        </div>
      </div>

      <OriginalImageModal
        open={showOriginal}
        essayImage={essayImage}
        onClose={() => setShowOriginal(false)}
        t={t}
      />

      {isSalvaged && (
        <div
          style={{
            padding: "10px 14px",
            marginBottom: 12,
            background: T.amberSoft,
            borderLeft: `4px solid ${T.amber}`,
            borderRadius: 8,
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            fontSize: 13,
            color: T.textSoft,
            lineHeight: 1.55,
          }}
        >
          <Icon.AlertTriangle size={14} color={T.amber} style={{ marginTop: 2, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, color: T.amber, marginBottom: 2 }}>
              {String(t.salvagedTitle ?? "Kết quả chấm chưa đầy đủ")}
            </div>
            {String(
              t.salvagedBody ??
                "Mô hình đã trả về JSON không hợp lệ — nội dung bên dưới được trích xuất từng phần. Hãy kiểm tra kỹ trước khi duyệt, hoặc chấm lại bài.",
            )}
          </div>
        </div>
      )}

      {/* "Word-print" review layout. The data is now derived from the
          live grade + pipeline state — student-identity fields stay
          mocked until the upload form gains them. Falls back to the
          full mock when grade has no scored per-câu data (salvaged /
          legacy) so the layout never breaks. The legacy QuestionBox +
          questionPairs plumbing below is suspended via void-references
          while we phase it out. */}
      <ReviewMockup
        isMobile={isMobile}
        review={reviewData}
        essayAvailable={!!essayImage?.dataUrl}
        onViewOriginal={() => setShowOriginal(true)}
        onGoToRegrade={onGoToRegrade}
        teacherAnnotations={teacherAnnotations}
        onAddAnnotation={(a) => {
          setTeacherAnnotations((prev) => [...prev, a]);
        }}
        onUpdateAnnotation={(id, patch) => {
          setTeacherAnnotations((prev) =>
            prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
          );
        }}
        onRemoveAnnotation={(id) => {
          setTeacherAnnotations((prev) => prev.filter((a) => a.id !== id));
        }}
      />
      {/* Acknowledge the legacy plumbing as "intentionally suspended" so
          the compiler doesn't complain about unused locals while we wait
          for the design to be approved. These all come back once we wire
          the mockup to real data. */}
      {(() => {
        void questionPairs;
        void questionCount;
        void commentThreads;
        void analyzingQ;
        void isSalvaged;
        void subject;
        void handleSendComment;
        void handleDisputeDecide;
        void QuestionBox;
        return null;
      })()}

      {/* Bottom action bar — back / disclaimer / forward.
          Approve shortcut intentionally removed: every grade now flows
          through step 4 (Chấm lại) so the teacher engages per-câu before
          committing. "Approve" semantics will be derived at step 5
          finalize ("no scores changed" → approve verdict) when backend
          is re-wired. The disclaimer text reminds the teacher of their
          role in the HITL loop. */}
      {feedbackHook.error && (
        <div
          style={{
            marginTop: 16,
            padding: "8px 12px",
            background: T.redSoft,
            borderRadius: 6,
            fontSize: 14,
            color: T.red,
            textAlign: "center",
          }}
        >
          <Icon.AlertTriangle size={12} color={T.red} style={{ marginRight: 4 }} />
          {feedbackHook.error}
        </div>
      )}
      <div
        style={{
          marginTop: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={onPrev}
          disabled={!onPrev}
          style={{
            padding: "10px 18px",
            fontSize: 14,
            color: T.textSoft,
            background: T.bgCard,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            cursor: onPrev ? "pointer" : "not-allowed",
            transition: "color 0.15s, border-color 0.15s",
            fontWeight: 500,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            opacity: onPrev ? 1 : 0.5,
          }}
          onMouseEnter={(e) => {
            if (!onPrev) return;
            e.currentTarget.style.color = T.text;
            e.currentTarget.style.borderColor = T.textMute;
          }}
          onMouseLeave={(e) => {
            if (!onPrev) return;
            e.currentTarget.style.color = T.textSoft;
            e.currentTarget.style.borderColor = T.border;
          }}
        >
          ← Đọc lại
        </button>
        <div
          style={{
            fontSize: 13,
            color: T.textMute,
            textAlign: "center",
            flex: "1 1 200px",
            minWidth: 0,
          }}
        >
          Bạn là người chấm cuối. AI chỉ đề xuất.
        </div>
        <button
          onClick={onGoToRegrade}
          disabled={pipeline.phase === "generating" || !onGoToRegrade}
          style={{
            padding: "12px 22px",
            fontSize: 14,
            color: "#fff",
            background: T.red,
            border: "none",
            borderRadius: 10,
            cursor:
              pipeline.phase === "generating" || !onGoToRegrade
                ? "not-allowed"
                : "pointer",
            transition: "all 0.2s",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            opacity:
              pipeline.phase === "generating" || !onGoToRegrade ? 0.5 : 1,
            fontWeight: 600,
            boxShadow:
              pipeline.phase === "generating" ? "none" : T.shadowSoft,
            whiteSpace: "nowrap",
          }}
          title="Mở bảng chấm lại — sửa điểm từng câu, chat với AI về phần chưa chắc."
        >
          Chấm lại / Phản hồi
          <Icon.ChevronRight size={14} color="#fff" />
        </button>
      </div>
      {/* Suspend the approve plumbing we no longer render but want to
          keep alive for the eventual backend rewire (mirrors the legacy
          QuestionBox suspension a few hundred lines up). */}
      {(() => {
        void handleApproveClick;
        void canApprove;
        void onApprove;
        return null;
      })()}
    </div>
  );
}
