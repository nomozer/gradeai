import { useState } from "react";
import { T } from "../../../theme/tokens";
import { Icon } from "../../../components/ui/Icon";
import { subjectLabelRaw } from "../../../lib/subject";
import type { Lesson } from "../../../types";
import {
  SOURCE_META,
  formatDate,
  formatLessonId,
  type SourceTag,
  type TaggedLesson,
} from "../utils";

// LessonTable — the HITL corpus rendered as a 7-column table. Row tier
// colour + score label come from the shared source/tier model in utils.ts.
export function LessonTable({
  rows,
  deletingId,
  onDelete,
}: {
  rows: TaggedLesson[];
  deletingId: number | null;
  onDelete: (id: number) => void;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          // 520px of fixed columns + a readable lesson column. Without a
          // min-width the ``tableLayout: fixed`` engine crushes the flexible
          // BÀI HỌC column to ~30px on narrow screens (one word per line);
          // the min-width lets the wrapper's overfl-x:auto scroll instead.
          minWidth: 720,
          borderCollapse: "collapse",
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          <col style={{ width: 88 }} />
          <col style={{ width: 80 }} />
          <col />
          <col style={{ width: 96 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 112 }} />
          <col style={{ width: 48 }} />
        </colgroup>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.border}` }}>
            {["ID", "SCORE", "BÀI HỌC", "MÔN", "NGUỒN", "NGÀY", ""].map((h, i) => (
              <th
                key={i}
                style={{
                  textAlign: "left",
                  padding: `${T.space[3]}px ${T.space[3]}px`,
                  fontSize: T.fontSize.xs,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  color: T.textMute,
                  fontFamily: T.mono,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ lesson, source }) => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              source={source}
              isDeleting={deletingId === lesson.id}
              onDelete={() => onDelete(lesson.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LessonRow({
  lesson,
  source,
  isDeleting,
  onDelete,
}: {
  lesson: Lesson;
  source: SourceTag;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const meta = SOURCE_META[source];
  const subjLabel = subjectLabelRaw(lesson.subject);

  const cellStyle: React.CSSProperties = {
    padding: `${T.space[3]}px ${T.space[3]}px`,
    verticalAlign: "top",
    fontSize: T.fontSize.sm,
    lineHeight: 1.55,
  };

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: `1px solid ${T.borderLight}`,
        background: hovered ? T.bgHover : "transparent",
        opacity: isDeleting ? 0.45 : 1,
        transition: "background 0.15s, opacity 0.2s",
      }}
    >
      <td style={{ ...cellStyle, fontFamily: T.mono, color: T.textMute, fontSize: T.fontSize.xs }}>
        {formatLessonId(lesson.id)}
      </td>
      <td
        style={{
          ...cellStyle,
          fontFamily: T.mono,
          color: meta.color,
          fontWeight: 600,
        }}
      >
        {meta.scoreLabel}
      </td>
      <td style={{ ...cellStyle, color: T.text }}>{lesson.lesson_text}</td>
      <td style={{ ...cellStyle, color: T.textSoft }}>{subjLabel}</td>
      <td
        style={{
          ...cellStyle,
          fontFamily: T.mono,
          fontSize: T.fontSize.xs,
          letterSpacing: "0.05em",
          color: meta.color,
          fontWeight: 600,
        }}
      >
        {meta.label}
      </td>
      <td
        style={{
          ...cellStyle,
          fontFamily: T.mono,
          fontSize: T.fontSize.xs,
          color: T.textMute,
        }}
      >
        {formatDate(lesson.timestamp)}
      </td>
      <td style={{ ...cellStyle, textAlign: "right" }}>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          title="Quên bài học này"
          aria-label="Quên bài học này"
          style={{
            background: "transparent",
            border: "none",
            color: hovered ? T.red : "transparent",
            cursor: isDeleting ? "wait" : "pointer",
            padding: T.space[1],
            display: "inline-flex",
            transition: "color 0.15s",
          }}
        >
          <Icon.X size={14} />
        </button>
      </td>
    </tr>
  );
}
