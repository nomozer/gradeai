import { useState } from "react";
import { T } from "../../../theme/tokens";

// Single-select pill group with optional overflow folding. Generic over
// the value type so the same component drives source filters
// (SourceFilter) and subject filters (SubjectFilter).
export function PillGroup<V extends string>({
  pills,
  active,
  onChange,
  maxVisible,
}: {
  pills: Array<{ value: V; label: string }>;
  active: V;
  onChange: (v: V) => void;
  /** When set and ``pills.length > maxVisible``, collapse the overflow
   *  into a "+N môn khác" toggle pill. The currently-active pill is
   *  force-promoted into the visible head if it sits in the overflow
   *  tail, so the teacher's selection never disappears mid-session.
   *  Omit (default) for fixed pill sets like source filters where the
   *  count is bounded by code, not by data. */
  maxVisible?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const cap = maxVisible ?? Infinity;
  const needsOverflow = pills.length > cap;

  let visible: typeof pills = pills;
  let hiddenCount = 0;
  if (needsOverflow && !expanded) {
    const activeIdx = pills.findIndex((p) => p.value === active);
    if (activeIdx >= cap) {
      // Active pill lives in the tail — swap it into the head's last
      // slot so the selection stays on screen after collapse.
      visible = [...pills.slice(0, cap - 1), pills[activeIdx]];
    } else {
      visible = pills.slice(0, cap);
    }
    hiddenCount = pills.length - cap;
  }

  return (
    <div style={{ display: "flex", gap: T.space[1], flexWrap: "wrap" }}>
      {visible.map((pill) => {
        const isActive = pill.value === active;
        return (
          <button
            key={pill.value || "_all"}
            onClick={() => onChange(pill.value)}
            style={{
              background: isActive ? T.text : "transparent",
              border: `1px solid ${isActive ? T.text : T.border}`,
              color: isActive ? T.bgCard : T.textSoft,
              padding: `${T.space[1]}px ${T.space[3]}px`,
              fontSize: T.fontSize.sm,
              fontFamily: T.font,
              borderRadius: 999,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = T.text;
                e.currentTarget.style.color = T.text;
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = T.border;
                e.currentTarget.style.color = T.textSoft;
              }
            }}
          >
            {pill.label}
          </button>
        );
      })}
      {needsOverflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          title={
            expanded
              ? "Thu gọn lại"
              : `Xem thêm ${hiddenCount} môn ${hiddenCount === 1 ? "khác" : "nữa"}`
          }
          style={{
            background: "transparent",
            border: `1px dashed ${T.border}`,
            color: T.textFaint,
            padding: `${T.space[1]}px ${T.space[3]}px`,
            fontSize: T.fontSize.sm,
            fontFamily: T.font,
            fontStyle: "italic",
            borderRadius: 999,
            cursor: "pointer",
            transition: "color 0.15s, border-color 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = T.text;
            e.currentTarget.style.borderColor = T.text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = T.textFaint;
            e.currentTarget.style.borderColor = T.border;
          }}
        >
          {expanded ? "Thu gọn" : `+${hiddenCount} môn khác`}
        </button>
      )}
    </div>
  );
}
