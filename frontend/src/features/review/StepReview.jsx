import { useState, useCallback, useMemo, useEffect } from "react";
import { T } from "../../theme/tokens";
import { Icon } from "../../components/primitives/Icon";
import { formatTranscript } from "../../lib/mathFormat.jsx";

const API_BASE = "/api";

// ---------------------------------------------------------------------------
// Minimal Markdown → HTML parser (no external lib needed)
// ---------------------------------------------------------------------------
function parseMarkdown(md) {
  if (!md) return "";
  let html = md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^[-•]\s+(.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/gs, (m) => `<ul>${m}</ul>`)
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br/>");
  return `<p>${html}</p>`;
}

// ---------------------------------------------------------------------------
// Parse a flat string into per-question blocks.
// Convention: "Câu 1: …\nCâu 2: …" or "Question 1: …"
// ---------------------------------------------------------------------------
function parseIntoQuestions(source) {
  if (!source || !source.trim()) return [];
  const regex = /(?=(?:Câu|Question|Câu hỏi)\s*\d+\s*[:：])/i;
  const parts = source.split(regex).filter((p) => p.trim());
  if (parts.length <= 1) {
    return [{ idx: 0, label: "", body: source.trim() }];
  }
  return parts.map((part, i) => {
    const match = part.match(/^((?:Câu|Question|Câu hỏi)\s*\d+\s*[:：])\s*/i);
    const label = match ? match[1] : `#${i + 1}`;
    const body = match ? part.slice(match[0].length).trim() : part.trim();
    return { idx: i, label, body };
  });
}

// ---------------------------------------------------------------------------
// Word-style Comment Thread
// ---------------------------------------------------------------------------
function CommentThread({ comments, onSend, isLoading, t }) {
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    onSend(input.trim());
    setInput("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = input.trim() && !isLoading;

  return (
    <div style={{ marginTop: 6 }}>
      {/* Existing comment bubbles */}
      {comments.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginBottom: 8,
            maxHeight: 240,
            overflowY: "auto",
            paddingRight: 4,
          }}
        >
          {comments.map((c, i) => {
            const isTeacher = c.type === "teacher";
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 8,
                  padding: "8px 10px",
                  background: isTeacher ? T.amberSoft : T.accentSoft,
                  borderLeft: `3px solid ${isTeacher ? T.amber : T.accent}`,
                  borderRadius: "0 8px 8px 0",
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: isTeacher ? T.amber : T.accent,
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
                  {isTeacher ? "GV" : "AI"}
                </div>
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
            );
          })}
        </div>
      )}

      {/* Loading indicator */}
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
          {t.aiAnalyzing || "AI đang phân tích..."}
        </div>
      )}

      {/* Input row */}
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t.teacherNotePlaceholder || "Nhập nhận xét cho câu này…"}
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
          <Icon.MessageCircle
            size={12}
            color={canSend ? "#fff" : T.textFaint}
          />
          {t.sendComment || "Gửi"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuestionBox — one row: [student answer] | [AI comment + teacher comments]
// No score editing here — scores are finalized in the last step.
// ---------------------------------------------------------------------------
function QuestionBox({
  studentAnswer,
  aiComment,
  questionIdx,
  comments,
  onSendComment,
  isAnalyzing,
  t,
  subject,
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 0,
        marginBottom: 16,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: T.shadowSoft,
        background: T.bgCard,
      }}
    >
      {/* ─── Left: Student Answer ─────────────────────────────────── */}
      <div
        style={{
          borderRight: `1px solid ${T.border}`,
          padding: "18px 20px",
          background: T.paper,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 26,
                height: 26,
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
              }}
            >
              {studentAnswer.label || `Câu ${questionIdx + 1}`}
            </span>
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: T.textFaint,
              padding: 2,
              display: "flex",
              alignItems: "center",
            }}
          >
            {expanded ? (
              <Icon.ArrowDown size={14} color={T.textFaint} />
            ) : (
              <Icon.ChevronRight size={14} color={T.textFaint} />
            )}
          </button>
        </div>

        {expanded && (
          <div
            style={{
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
      </div>

      {/* ─── Right: AI Comment + Teacher Comments ─────────── */}
      <div
        style={{
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* AI Comment header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 8,
          }}
        >
          <Icon.MessageCircle size={13} color={T.accentLight} />
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: T.accentLight,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            {t.aiComment || "Nhận xét AI"}
          </span>
        </div>

        {/* AI Comment body */}
        {aiComment.body ? (
          <div
            className="md-prose"
            dangerouslySetInnerHTML={{
              __html: parseMarkdown(aiComment.body),
            }}
            style={{
              fontSize: 14,
              color: T.textSoft,
              lineHeight: 1.6,
              padding: "8px 12px",
              background: T.accentSoft,
              borderLeft: `3px solid ${T.accentLight}`,
              borderRadius: "0 8px 8px 0",
              marginBottom: 10,
            }}
          />
        ) : (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              background: T.greenSoft,
              borderLeft: `3px solid ${T.green}`,
              fontSize: 14,
              color: T.textSoft,
              lineHeight: 1.5,
              marginBottom: 10,
            }}
          >
            <Icon.Check
              size={12}
              color={T.green}
              style={{ marginRight: 6, verticalAlign: "middle" }}
            />
            {t.noIssues || "Không có vấn đề cần báo cáo."}
          </div>
        )}

        {/* Teacher comment thread (Word-style) */}
        <div style={{ marginTop: "auto" }}>
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
            {t.teacherNote || "Nhận xét giáo viên"}
          </div>
          <CommentThread
            comments={comments}
            onSend={onSendComment}
            isLoading={isAnalyzing}
            t={t}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OriginalImageModal — overlay so teacher can verify transcription fidelity
// against the raw student scan. This is a HITL transparency affordance:
// without it the teacher has no way to catch AI mis-reads before approving.
//
// Supports both image (JPG/PNG) and PDF uploads: PDFs are rendered via the
// browser's built-in viewer in an <iframe> since <img> cannot display PDF.
// ---------------------------------------------------------------------------
function OriginalImageModal({ src, isPdf, onClose, t }) {
  if (!src) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.78)",
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
          position: "relative",
          width: isPdf ? "92vw" : "auto",
          height: isPdf ? "92vh" : "auto",
          maxWidth: "92vw",
          maxHeight: "92vh",
          background: T.paper,
          borderRadius: 10,
          overflow: "hidden",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.55)",
            border: "none",
            color: "#fff",
            cursor: "pointer",
            fontSize: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1,
          }}
          title={t.close || "Đóng"}
        >
          ×
        </button>
        {isPdf ? (
          // <object> handles blob: PDF more reliably than <iframe> in Chromium.
          // The hash fragment (#toolbar=…) was dropped — it triggers "It may
          // have been moved, edited, or deleted" on some Chrome builds when
          // used with blob URLs. Fallback <iframe> covers non-Chromium browsers.
          <object
            data={src}
            type="application/pdf"
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              background: "#fff",
            }}
          >
            <iframe
              src={src}
              title={t.originalImage || "Bài làm gốc của học sinh"}
              loading="eager"
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                border: "none",
                background: "#fff",
              }}
            />
          </object>
        ) : (
          <img
            src={src}
            alt={t.originalImage || "Bài làm gốc của học sinh"}
            decoding="async"
            loading="eager"
            style={{
              display: "block",
              maxWidth: "92vw",
              maxHeight: "92vh",
              objectFit: "contain",
            }}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main StepReview — Review only (no score editing, no reject/revise)
// ---------------------------------------------------------------------------
export function StepReview({
  grade,
  pipeline,
  feedbackHook,
  onApprove,
  task,
  t,
  essayImage,
}) {
  // Per-question comment threads: { [questionIdx]: Array<{type, text}> }
  const [commentThreads, setCommentThreads] = useState({});
  const [analyzingQ, setAnalyzingQ] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);

  // Convert the base64 data URL into a blob URL ONCE per upload so the iframe
  // doesn't re-parse megabytes of base64 on every modal open.
  //
  // We use useEffect + useState (NOT useMemo) on purpose: in React Strict Mode
  // the mount → cleanup → mount dance would revoke the URL created by useMemo,
  // but useMemo would keep returning the same (now-dead) string, producing
  // Chrome's "It may have been moved, edited, or deleted" PDF error. With the
  // effect pattern each mount creates a FRESH blob URL and the matching
  // cleanup revokes that mount's own URL — no stale references.
  const [essayBlobUrl, setEssayBlobUrl] = useState(null);

  useEffect(() => {
    const src = essayImage?.dataUrl;
    if (!src) {
      setEssayBlobUrl(null);
      return undefined;
    }
    const match = /^data:([^;]+);base64,(.+)$/.exec(src);
    if (!match) {
      setEssayBlobUrl(src);
      return undefined;
    }
    let url = null;
    try {
      const binary = atob(match[2]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      url = URL.createObjectURL(new Blob([bytes], { type: match[1] }));
      setEssayBlobUrl(url);
    } catch {
      setEssayBlobUrl(src);
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [essayImage?.dataUrl]);

  if (!grade) return null;

  // Parse student answers (transcript) and AI comments separately
  const studentAnswers = parseIntoQuestions(grade.transcript);
  const aiComments = parseIntoQuestions(grade.comment);
  const questionCount = Math.max(studentAnswers.length, aiComments.length, 1);

  // Detect salvage-mode output (grader produced unparseable JSON).
  const weaknesses = Array.isArray(grade.weaknesses) ? grade.weaknesses : [];
  const isSalvaged = weaknesses.some(
    (w) => typeof w === "string" && w.toLowerCase().includes("unparseable"),
  );

  // Subject metadata — applied rubric profile (literature/stem/language/history)
  const subject = grade.subject || "literature";
  const subjectName =
    t.subjectNames?.[subject] || t.subjectNames?.literature || subject;

  const handleSendComment = useCallback(
    async (qIdx, text) => {
      // Add teacher comment to thread
      setCommentThreads((prev) => ({
        ...prev,
        [qIdx]: [...(prev[qIdx] || []), { type: "teacher", text }],
      }));

      // Call AI analysis endpoint. Returns both:
      //   - analysis: shown inline in the chat thread
      //   - lesson:   distilled HITL rule, staged on the AI bubble for later
      //               flush via /api/feedback.staged_lessons on approve.
      setAnalyzingQ(qIdx);
      try {
        const res = await fetch(`${API_BASE}/analyze-comment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: task || "",
            student_answer: (studentAnswers[qIdx]?.body || "").slice(0, 2000),
            teacher_comment: text,
            lang: "vi",
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setCommentThreads((prev) => ({
            ...prev,
            [qIdx]: [
              ...(prev[qIdx] || []),
              {
                type: "ai",
                text: data.analysis,
                lesson: (data.lesson || "").trim(),
              },
            ],
          }));
        }
      } catch (err) {
        console.error("Comment analysis failed:", err);
      }
      setAnalyzingQ(null);
    },
    [task, studentAnswers],
  );

  // Collect staged lessons (one per AI bubble that produced a distilled rule).
  // These go to the backend as the structured HITL payload — richer than the
  // aggregated free-form comment.
  const stagedLessons = Object.entries(commentThreads).flatMap(([idx, msgs]) =>
    msgs
      .filter((m) => m.type === "ai" && m.lesson)
      .map((m) => ({
        lesson_text: m.lesson,
        question_ref: `Câu ${Number(idx) + 1}`,
      })),
  );

  // Fallback aggregate note (sent only if no lessons were distilled — e.g.
  // teacher commented but AI analysis was offline).
  const aggregatedNote = Object.entries(commentThreads)
    .flatMap(([idx, msgs]) =>
      msgs
        .filter((m) => m.type === "teacher")
        .map((m) => `[Câu ${Number(idx) + 1}] ${m.text}`),
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
    });
    if (res && onApprove) onApprove();
  };

  const canApprove =
    !feedbackHook.isSubmitting && pipeline.phase !== "generating";

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        animation: "fadeUp 0.4s ease-out",
      }}
    >
      {/* ── Top toolbar: staged lessons (left) + actions (right) ─── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          minHeight: 28,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {stagedLessons.length > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontFamily: T.mono,
                color: T.accent,
                padding: "4px 12px",
                background: T.accentSoft,
                borderRadius: 20,
                border: `1px solid ${T.accent}`,
                letterSpacing: "0.04em",
              }}
              title="Các quy tắc đã chưng cất từ nhận xét của bạn — sẽ lưu khi duyệt."
            >
              <Icon.Award size={11} color={T.accent} />
              {stagedLessons.length}{" "}
              {t.lessonsStaged || "bài học đang chờ lưu"}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {essayImage?.dataUrl && (
          <button
            onClick={() => setShowOriginal(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              fontFamily: T.mono,
              color: T.textSoft,
              padding: "4px 12px",
              background: T.bgCard,
              borderRadius: 20,
              border: `1px solid ${T.border}`,
              cursor: "pointer",
              transition: "all 0.15s",
              letterSpacing: "0.04em",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = T.accent;
              e.currentTarget.style.color = T.accent;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = T.border;
              e.currentTarget.style.color = T.textSoft;
            }}
            title={
              t.originalImageHint ||
              "Mở bài làm gốc để đối chiếu với phần AI đã chép"
            }
          >
            <Icon.FileText size={11} />
            {essayImage?.isPdf
              ? t.viewOriginalPdf || "Xem PDF gốc"
              : t.viewOriginal || "Xem ảnh gốc"}
          </button>
        )}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontFamily: T.mono,
            color: T.accent,
            padding: "4px 12px",
            background: T.accentSoft,
            borderRadius: 20,
            border: `1px solid ${T.accent}`,
            letterSpacing: "0.04em",
          }}
          title={t.subjectLabel || "Subject"}
        >
          <Icon.Award size={11} color={T.accent} />
          {t.subjectLabel || "Môn"}: {subjectName}
        </span>
        </div>
      </div>

      {showOriginal && (
        <OriginalImageModal
          src={essayBlobUrl}
          isPdf={!!essayImage?.isPdf}
          onClose={() => setShowOriginal(false)}
          t={t}
        />
      )}

      {/* ── Salvage-mode banner ────────────────────────────────── */}
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
          <Icon.AlertTriangle
            size={14}
            color={T.amber}
            style={{ marginTop: 2, flexShrink: 0 }}
          />
          <div>
            <div style={{ fontWeight: 700, color: T.amber, marginBottom: 2 }}>
              {t.salvagedTitle || "Kết quả chấm chưa đầy đủ"}
            </div>
            {t.salvagedBody ||
              "Mô hình đã trả về JSON không hợp lệ — nội dung bên dưới được trích xuất từng phần. Hãy kiểm tra kỹ trước khi duyệt, hoặc chấm lại bài."}
          </div>
        </div>
      )}

      {/* ── Column Headers ─────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          marginBottom: 8,
          padding: "0 4px",
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: T.textFaint,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {t.studentAnswer || "Câu trả lời học sinh"}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: T.textFaint,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {t.aiComment || "Nhận xét & Ghi chú"}
        </span>
      </div>

      {/* ── Per-Question Boxes ─────────────────────────────────── */}
      {questionCount === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: 40,
            color: T.textFaint,
            fontSize: 15,
            fontStyle: "italic",
            background: T.bgCard,
            borderRadius: 12,
            border: `1px solid ${T.border}`,
          }}
        >
          {t.noContent || "Không có nội dung để hiển thị."}
        </div>
      ) : (
        Array.from({ length: questionCount }).map((_, i) => (
          <QuestionBox
            key={i}
            studentAnswer={
              studentAnswers[i] || {
                idx: i,
                label: `Câu ${i + 1}`,
                body: "",
              }
            }
            aiComment={aiComments[i] || { idx: i, label: "", body: "" }}
            questionIdx={i}
            comments={commentThreads[i] || []}
            onSendComment={(text) => handleSendComment(i, text)}
            isAnalyzing={analyzingQ === i}
            t={t}
            subject={subject}
          />
        ))
      )}

      {/* ── Approve Button ─────────────────────────────────────── */}
      <div
        style={{
          marginTop: 20,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        {feedbackHook.error && (
          <div
            style={{
              padding: "8px 12px",
              background: T.redSoft,
              borderRadius: 6,
              fontSize: 14,
              color: T.red,
              width: "100%",
              maxWidth: 480,
              textAlign: "center",
            }}
          >
            <Icon.AlertTriangle
              size={12}
              color={T.red}
              style={{ marginRight: 4 }}
            />
            {feedbackHook.error}
          </div>
        )}
        <button
          onClick={handleApproveClick}
          disabled={!canApprove}
          style={{
            padding: "14px 56px",
            fontSize: 16,
            color: canApprove ? "#fff" : T.textFaint,
            background: canApprove ? T.green : T.bgElevated,
            border: "none",
            borderRadius: 10,
            cursor: canApprove ? "pointer" : "not-allowed",
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            gap: 8,
            opacity: canApprove ? 1 : 0.5,
            fontWeight: 600,
            boxShadow: canApprove ? T.shadowSoft : "none",
          }}
        >
          <Icon.Check size={16} color={canApprove ? "#fff" : T.textFaint} />
          {feedbackHook.isSubmitting
            ? t.feedbackSaving || "Đang lưu..."
            : t.approveAndFinish || "Duyệt & Hoàn Thành"}
        </button>
      </div>
    </div>
  );
}
