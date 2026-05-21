import React, { useState } from "react";
import { T } from "../../../theme/tokens";
import { subjectLabelRaw } from "../../../lib/subject";
import type { GradeHistoryEntry } from "../../../types";
import { parseTaskContext, relativeTime } from "../utils";

// Row layout:
//   Title (clickable, body sans) ─────────────────► (opens step 5 — phiếu chấm)
//   Subject pill · 1 giờ trước
//   [Xem xét]  [Chấm lại]                     ◄── secondary affordances
//
// The whole row is the primary "open" action — defaults to step 5 (Xong /
// phiếu chấm) because "Bài đã chấm" implies the teacher wants to SEE the
// completed grade, not re-evaluate it. Two small secondary buttons let
// the teacher jump back to step 3 (Xem xét, re-review) or step 4 (Chấm
// lại, regrade) when that IS the intent. Earlier design defaulted to
// step 3 and surprised teachers who clicked a row expecting the final
// grade sheet (real user report 2026-05-19).
export function HistoryRow({
  entry,
  onLoad,
}: {
  entry: GradeHistoryEntry;
  onLoad: (step: 3 | 4 | 5) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { body, classLabel } = parseTaskContext(entry.task);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onLoad(5)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onLoad(5);
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Xem bài chấm này (mở thẳng phiếu chấm)"
      style={{
        background: hovered ? T.bgHover : "transparent",
        borderBottom: `1px solid ${T.borderLight}`,
        padding: `${T.space[3]}px ${T.space[4]}px`,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        cursor: "pointer",
        outline: "none",
        transition: "background 0.12s",
      }}
    >
      <div
        style={{
          // Use the body sans-serif (T.font) — the inherited display
          // serif made user-entered titles like "ĐỀ HÌNH" read as a
          // section header instead of a list item.
          fontFamily: T.font,
          fontSize: 15,
          color: T.text,
          fontWeight: 600,
          letterSpacing: 0,
          textTransform: "none",
          lineHeight: 1.3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {body}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: T.space[2],
          fontSize: T.fontSize.xs,
          color: T.textMute,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            padding: "1px 8px",
            background: T.accentSoft,
            color: T.accent,
            borderRadius: 999,
            fontWeight: 600,
            fontSize: 11,
          }}
        >
          {subjectLabelRaw(entry.subject)}
        </span>
        {classLabel && (
          <>
            <span>·</span>
            <span>{classLabel}</span>
          </>
        )}
        <span>·</span>
        <span>{relativeTime(entry.ts)}</span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginTop: 6,
        }}
      >
        {/* Secondary jumps. ``stopPropagation`` prevents the parent row
            click handler from firing — without it, clicking these would
            also open step 5 (the row default) in succession. */}
        <SecondaryJump
          label="Xem xét"
          hint="Mở ở bước Xem xét (đọc lại nhận xét của AI)"
          onClick={(e) => {
            e.stopPropagation();
            onLoad(3);
          }}
        />
        <span style={{ color: T.textFaint, fontSize: 11 }}>·</span>
        <SecondaryJump
          label="Chấm lại"
          hint="Mở thẳng ở bước Chấm lại (bỏ qua Xem xét)"
          onClick={(e) => {
            e.stopPropagation();
            onLoad(4);
          }}
        />
      </div>
    </div>
  );
}

function SecondaryJump({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={hint}
      aria-label={hint}
      style={{
        background: "transparent",
        border: "none",
        padding: "2px 4px",
        color: hover ? T.accent : T.textSoft,
        fontSize: 12,
        fontFamily: T.font,
        fontWeight: 500,
        cursor: "pointer",
        textDecoration: hover ? "underline" : "none",
        textUnderlineOffset: 3,
        transition: "color 0.12s",
      }}
    >
      {label}
    </button>
  );
}
