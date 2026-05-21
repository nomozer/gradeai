import { T } from "../../../theme/tokens";
import type { SelectionAnnotation } from "../../../types";
import type { ReviewPayload } from "../types";

// AppHeader is position:sticky top:0 (~52 px tall) — the rail's top
// offset has to clear it, otherwise the rail sticks underneath the
// header and the first câu reads as "cut off". 16 px of breathing room
// below the header looks intentional rather than touching it.
const STICKY_TOP = 68;

// MucLucSidebar — collapsible left-rail navigation.
//
// Two visual states share the same component so they swap in-place
// without remounting (and the sticky position stays anchored):
//
//   ▸ Expanded — frameless rail with vạch-dọc-trái active marker + per-câu
//                score and a small "‹" pull-in button at the top-right.
//   ▸ Collapsed — a single vertical pull-tab with "›" hugging the left
//                 edge so the teacher can reclaim full page width while
//                 still seeing how to bring the nav back.
//
// No card frame, no "MỤC LỤC"/"BÀI LÀM" headers — those felt heavy for
// a 2–5 câu list. Active state = vertical accent bar + accentSoft bg.
export function MucLucSidebar({
  review,
  activeQ,
  onJumpToCau,
  teacherAnnotations,
  collapsed,
  onToggle,
}: {
  review: ReviewPayload;
  activeQ: number;
  onJumpToCau: (n: number) => void;
  teacherAnnotations?: SelectionAnnotation[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  const totalNotes = (teacherAnnotations ?? []).length;
  const countByCau = (cau: number) =>
    (teacherAnnotations ?? []).filter((a) => a.cau === cau).length;

  if (collapsed) {
    return (
      <aside
        style={{
          position: "sticky",
          top: STICKY_TOP,
          alignSelf: "start",
          display: "flex",
          justifyContent: "center",
          paddingTop: 4,
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-label="Hiện mục lục"
          title="Hiện mục lục"
          style={{
            width: 18,
            height: 40,
            border: `1px solid ${T.border}`,
            background: T.bgCard,
            borderRadius: 6,
            color: T.textFaint,
            cursor: "pointer",
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "color 0.12s, border-color 0.12s, background 0.12s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = T.text;
            e.currentTarget.style.borderColor = T.textMute;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = T.textFaint;
            e.currentTarget.style.borderColor = T.border;
          }}
        >
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside
      style={{
        display: "flex",
        flexDirection: "column",
        position: "sticky",
        top: STICKY_TOP,
        alignSelf: "start",
        maxHeight: `calc(100vh - ${STICKY_TOP + 16}px)`,
        overflow: "hidden",
        background: T.bgElevated,
        borderRadius: 10,
        padding: "8px 0 12px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "0 8px 4px",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-label="Ẩn mục lục"
          title="Ẩn mục lục"
          style={{
            width: 26,
            height: 26,
            border: "none",
            background: "transparent",
            color: T.textMute,
            cursor: "pointer",
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            transition: "color 0.12s, background 0.12s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = T.text;
            e.currentTarget.style.background = T.bgHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = T.textMute;
            e.currentTarget.style.background = "transparent";
          }}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          flex: 1,
        }}
      >
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
                display: "grid",
                gridTemplateColumns: "1fr auto",
                alignItems: "center",
                gap: 10,
                textAlign: "left",
                width: "100%",
                // Padding compensates for the 3px left border so the label
                // stays at the same x-coordinate whether active or not.
                padding: "9px 14px 9px 11px",
                fontFamily: "inherit",
                fontSize: 13.5,
                color: active ? T.accent : T.textSoft,
                fontWeight: active ? 600 : 500,
                background: active ? T.accentSoft : "transparent",
                border: "none",
                borderLeft: `3px solid ${active ? T.accent : "transparent"}`,
                cursor: "pointer",
                transition: "color 0.12s, background 0.12s, border-color 0.12s",
              }}
              onMouseEnter={(e) => {
                if (active) return;
                e.currentTarget.style.color = T.text;
                e.currentTarget.style.background = T.bgHover;
              }}
              onMouseLeave={(e) => {
                if (active) return;
                e.currentTarget.style.color = T.textSoft;
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
                <span>Câu {q.num}</span>
                {noteCount > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: T.mono,
                      color: active ? T.accent : T.textFaint,
                    }}
                  >
                    · {noteCount}
                  </span>
                )}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontFamily: T.mono,
                  color: active ? T.accent : T.textFaint,
                }}
              >
                {q.earned.toFixed(1)}
              </span>
            </button>
          );
        })}
      </div>
      <div
        style={{
          padding: "10px 14px 0",
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
