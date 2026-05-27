import React from "react";
import { T } from "../../../theme/tokens";
import { vi as t } from "../../../i18n/vi";
import { formatLine, formatTranscript } from "../../../lib/mathFormat";
import type { SelectionAnnotation } from "../../../types";
import type { RegradeQuestion } from "../types";
import { Chevron, HeaderScoreChip } from "./RegradeControls";
import { Icon } from "../../../components/ui/Icon";

// Normalize a string for quote matching across NFC/NFD + nbsp variants.
// Mirrors the helper in StepReview so step 3 highlights and step 4
// highlights match the same teacher quotes.
function normalizeForMatch(s: string): string {
  return s.normalize("NFC").replace(/\u00A0/g, " ");
}

// Render a single transcript line with the teacher's step 3 quotes
// highlighted inline. Read-only — no click handlers, no verdict colors;
// just a peach background + the teacher's comment as a hover title so
// the marker carries meaning without a separate notes block.
function renderLineWithTeacherHighlights(
  line: string,
  lineIdx: number,
  anns: SelectionAnnotation[],
): React.ReactNode[] {
  type Seg = { text: string; ann: SelectionAnnotation | null };
  let segs: Seg[] = [{ text: line, ann: null }];
  for (const ann of anns) {
    const endIdx = ann.endLineIdx ?? ann.lineIdx;
    if (lineIdx < ann.lineIdx || lineIdx > endIdx) continue;
    const isMultiline = endIdx > ann.lineIdx;
    let needleSource: string;
    if (!isMultiline) {
      needleSource = ann.quote;
    } else if (lineIdx === ann.lineIdx) {
      needleSource = ann.quote.split("\n")[0] ?? ann.quote;
    } else if (lineIdx === endIdx) {
      const parts = ann.quote.split("\n");
      needleSource = parts[parts.length - 1] ?? ann.quote;
    } else {
      needleSource = line;
    }
    const needle = normalizeForMatch(needleSource);
    const next: Seg[] = [];
    let placed = false;
    for (const seg of segs) {
      if (seg.ann || placed) {
        next.push(seg);
        continue;
      }
      const haystack = normalizeForMatch(seg.text);
      const idx = haystack.indexOf(needle);
      if (idx === -1) {
        next.push(seg);
        continue;
      }
      if (idx > 0) next.push({ text: seg.text.slice(0, idx), ann: null });
      next.push({ text: seg.text.slice(idx, idx + needleSource.length), ann });
      const tail = seg.text.slice(idx + needleSource.length);
      if (tail.length > 0) next.push({ text: tail, ann: null });
      placed = true;
    }
    segs = next;
  }
  return segs.map((seg, i) => {
    if (!seg.ann) return <span key={i}>{formatLine(seg.text, `rh-${lineIdx}-${i}`)}</span>;
    const ann = seg.ann;
    const tooltip = ann.comment
      ? `Nhận xét: ${ann.comment}`
      : `"${ann.quote}" (chưa có nhận xét)`;
    return (
      <mark
        key={i}
        title={tooltip}
        style={{
          background: "#FFF9DB",
          color: T.text,
          padding: "1px 4px",
          margin: "0 1px",
          borderRadius: 3,
        }}
      >
        {formatLine(seg.text, `rh-${lineIdx}-m${i}`)}
      </mark>
    );
  });
}

export function RegradeQuestionBlock({
  q,
  expanded,
  onToggleExpand,
  isLast,
  myScore,
  isEdited,
  cap,
  capEditable,
  maxOverride,
  onMaxOverrideChange,
  onScoreChange,
  teacherNotes,
  subject,
}: {
  q: RegradeQuestion;
  expanded: boolean;
  onToggleExpand: () => void;
  isLast: boolean;
  myScore: number;
  isEdited: boolean;
  cap: number | undefined;
  capEditable: boolean;
  maxOverride: number | undefined;
  onMaxOverrideChange: (v: number | undefined) => void;
  onScoreChange: (s: number) => void;
  /** Teacher's step 3 "đối soát" annotations for this câu — read-only
   *  here. Rendered above the score editor so the teacher sees their
   *  own prior reasoning before locking the score. Each entry has a
   *  quoted snippet + comment. */
  teacherNotes: SelectionAnnotation[];
  subject?: any;
}) {
  const delta = myScore - q.aiScore;
  const hasError = q.annotations.some((a) => a.kind === "error");
  const [commentsCollapsed, setCommentsCollapsed] = React.useState(false);
  return (
    <div
      data-cau-anchor={q.num}
      style={{
        borderBottom: isLast ? "none" : `1px solid ${T.borderLight}`,
      }}
    >
      {/* Câu header — always visible. Clicking anywhere in the chrome
          (chevron / label / prompt / score chip / cap label) toggles
          expand; the cap editor input stops propagation so typing
          doesn't fire a toggle. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={`câu-${q.num}-body`}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          // Only handle keyboard activation when focus is on the header
          // itself, not on a nested input/button. Otherwise typing a
          // space in the cap editor would collapse the câu.
          if (
            (e.key === "Enter" || e.key === " ") &&
            e.target === e.currentTarget
          ) {
            e.preventDefault();
            onToggleExpand();
          }
        }}
        style={{
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <Chevron expanded={expanded} />
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <span style={{ fontWeight: 600, marginRight: 10, color: T.text }}>
            {q.label}
          </span>
          <span style={{ fontSize: 13, color: T.textMute }}>{q.prompt}</span>
          {hasError && !expanded && (
            // Collapsed-only marker — tells the teacher this câu has AI-
            // flagged issues without forcing them to expand. Mirrors the
            // auto-expand heuristic in StepRegrade's initializer so the
            // signal is consistent: if it earns this marker, it would
            // have been expanded by default until the teacher collapsed.
            <span
              style={{
                marginLeft: 8,
                fontSize: 11,
                fontFamily: T.font,
                color: T.red,
                fontStyle: "italic",
              }}
              title="AI đã đánh dấu lỗi ở câu này"
            >
              · cần xem
            </span>
          )}
        </div>
        <HeaderScoreChip
          aiScore={q.aiScore}
          cap={cap}
          isEdited={isEdited}
        />
        {capEditable ? (
          // Đề không quy định — render an inline editable input so the
          // teacher decides this câu's cap themselves. Empty = "chưa đặt"
          // (no cap → input below runs free, header total catches it).
          <label
            style={{
              fontSize: 11,
              fontFamily: T.mono,
              color: T.textMute,
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
            title="Đề bài không quy định điểm — bạn tự đặt mức tối đa cho câu này."
            onClick={(e) => e.stopPropagation()}
          >
            Tối đa:
            <input
              type="number"
              step={0.25}
              min={0}
              max={10}
              placeholder="—"
              value={maxOverride ?? ""}
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (raw === "") {
                  onMaxOverrideChange(undefined);
                  return;
                }
                const v = parseFloat(raw);
                if (Number.isNaN(v)) return;
                onMaxOverrideChange(Math.max(0, Math.min(10, v)));
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 54,
                padding: "3px 6px",
                fontFamily: T.mono,
                fontSize: 12,
                fontWeight: 600,
                color: T.text,
                background: T.bgCard,
                border: `1px solid ${maxOverride != null ? T.accent : T.border}`,
                borderRadius: 4,
                outline: "none",
                textAlign: "center",
              }}
            />
            đ
          </label>
        ) : (
          <span
            style={{
              fontSize: 11,
              fontFamily: T.mono,
              color: T.textMute,
              flexShrink: 0,
            }}
          >
            tối đa {(cap ?? 0).toFixed(1)}đ
          </span>
        )}
      </div>

      {expanded && (
        <div
          id={`câu-${q.num}-body`}
          style={{ padding: "0 24px 18px 24px" }}
        >
          {/* Per-câu đề figure / student-answer image slots were removed:
              they required per-câu bounding boxes the backend doesn't
              emit (Gemini reads the PDF natively but doesn't return
              coordinates), so rendering a permanent "placeholder" card
              just confused teachers without delivering value. Header's
              "Xem PDF gốc" button already shows the whole bài làm for
              spot-check. Re-add cropped slots here when the backend
              starts returning per-câu regions. */}

          {/* AI transcript (mono) with annotations stacked below the
              lines. Kept as-is from prior design — still useful for
              searchability and as a fallback when the image is hard to
              read. The "AI đã đọc" eyebrow makes the relationship to
              the image above explicit. */}
          <div
            className="student-work"
            style={{
              padding: "12px 16px",
              background: T.bgCard,
              border: `1px solid ${T.borderLight}`,
              borderRadius: 8,
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: T.textFaint,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 8,
                fontFamily: '"Inter", "Outfit", system-ui, -apple-system, sans-serif',
              }}
            >
              AI đã đọc
            </div>
            {q.lines.map((line, i) => (
              <div key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {renderLineWithTeacherHighlights(line, i, teacherNotes)}
              </div>
            ))}
            {q.annotations.length > 0 && (
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: `1px solid ${T.borderLight}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    userSelect: "none",
                    marginBottom: commentsCollapsed ? 0 : 12,
                  }}
                  onClick={() => setCommentsCollapsed(!commentsCollapsed)}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontFamily: '"Inter", "Outfit", system-ui, -apple-system, sans-serif',
                      fontWeight: 700,
                      color: T.accent,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Icon.Bot size={13} />
                    Nhận xét của AI
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 10,
                      fontWeight: 600,
                      color: T.textMute,
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

                {!commentsCollapsed && (() => {
                  const goodLines = q.annotations.filter(a => a.kind === "good").map(a => a.text);
                  const errorLines = q.annotations.filter(a => a.kind === "error").map(a => a.text);
                  const otherAnnotations = q.annotations.filter(a => a.kind !== "good" && a.kind !== "error");

                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <AnnotationGroup kind="good" lines={goodLines} subject={subject} />
                      <AnnotationGroup kind="error" lines={errorLines} subject={subject} />
                      {otherAnnotations.map((a, idx) => (
                        <AnnotationGroup key={idx} kind={a.kind} lines={[a.text]} subject={subject} />
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Score editor row — compact horizontal: AI score → teacher
              input → delta, all on one line so the teacher can compare
              at a glance. Grid layout used to waste the full width on
              two narrow values. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "10px 16px",
              background: T.bgMuted,
              border: `1px solid ${T.borderLight}`,
              borderRadius: 8,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: '"Inter", "Outfit", system-ui, -apple-system, sans-serif',
                  fontWeight: 700,
                  color: T.textFaint,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                AI
              </span>
              <span
                style={{
                  fontFamily: T.mono,
                  fontSize: 16,
                  fontWeight: 600,
                  color: T.textSoft,
                }}
              >
                {q.aiScore.toFixed(1)}
                {cap != null && (
                  <span
                    style={{ color: T.textMute, fontSize: 12, fontWeight: 400 }}
                  >
                    /{cap.toFixed(1)}
                  </span>
                )}
              </span>
            </div>

            <span
              style={{
                color: T.textFaint,
                fontFamily: '"Inter", "Outfit", system-ui, -apple-system, sans-serif',
                fontSize: 14,
                fontWeight: 600,
                userSelect: "none",
              }}
            >
              →
            </span>

            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: '"Inter", "Outfit", system-ui, -apple-system, sans-serif',
                  fontWeight: 700,
                  color: T.textFaint,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                Bạn
              </span>
              <input
                type="number"
                step={0.25}
                min={0}
                // Per-câu cap is the effective max (đề-supplied OR teacher
                // override). When the teacher hasn't filled in the
                // override for a non-quy-định câu, no upper constraint
                // applies and the exam-level cap (10đ) catches it at
                // the header.
                max={cap}
                value={myScore}
                onChange={(e) => {
                  const raw = parseFloat(e.target.value || "0");
                  if (Number.isNaN(raw)) {
                    onScoreChange(q.aiScore);
                    return;
                  }
                  const clamped =
                    cap != null
                      ? Math.max(0, Math.min(cap, raw))
                      : Math.max(0, raw);
                  onScoreChange(clamped);
                }}
                style={{
                  width: 68,
                  fontFamily: T.mono,
                  fontSize: 16,
                  fontWeight: 600,
                  padding: "4px 10px",
                  border: `1px solid ${isEdited ? T.red : T.border}`,
                  borderRadius: 6,
                  background: T.bgCard,
                  color: T.text,
                  outline: "none",
                }}
              />
              {Math.abs(delta) > 0.001 && (
                <span
                  style={{
                    fontFamily: T.mono,
                    fontSize: 12,
                    color: T.red,
                    fontWeight: 600,
                  }}
                >
                  {delta > 0 ? "+" : ""}
                  {delta.toFixed(2)}
                </span>
              )}
            </div>
          </div>
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
}: {
  kind: "good" | "error" | "note" | "warn";
  lines: string[];
  subject: any;
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
