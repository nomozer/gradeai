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
  finalScores,
  setFinalScores,
}: {
  review: ReviewPayload;
  activeQ: number;
  onJumpToCau: (n: number) => void;
  teacherAnnotations?: SelectionAnnotation[];
  collapsed: boolean;
  onToggle: () => void;
  finalScores?: Record<number, number>;
  setFinalScores?: React.Dispatch<React.SetStateAction<Record<number, number>>>;
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
          justifyContent: "flex-start",
          paddingLeft: 2,
          animation: "fadeUp 0.15s ease-out",
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-label="Hiện mục lục"
          title="Hiện mục lục"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            width: 44,
            height: 32,
            border: `1px solid ${T.border}`,
            background: T.bgCard,
            borderRadius: 8,
            color: T.textSoft,
            cursor: "pointer",
            padding: 0,
            boxShadow: T.shadowSoft,
            transition: "all 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = T.bgHover;
            e.currentTarget.style.color = T.accent;
            e.currentTarget.style.borderColor = T.accent;
            e.currentTarget.style.transform = "translateX(2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = T.bgCard;
            e.currentTarget.style.color = T.textSoft;
            e.currentTarget.style.borderColor = T.border;
            e.currentTarget.style.transform = "translateX(0)";
          }}
        >
          {/* Minimal list icon */}
          <svg
            width={13}
            height={13}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.8 }}
          >
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line>
            <line x1="3" y1="18" x2="3.01" y2="18"></line>
          </svg>

          {/* Tiny arrow indicating expansion */}
          <svg
            width={8}
            height={8}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.6 }}
          >
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
          const myScore = finalScores?.[q.num] ?? q.earned;
          const isEdited = finalScores?.[q.num] !== undefined && Math.abs(finalScores[q.num] - q.earned) > 0.001;
          const cap = q.max > 0 ? q.max : undefined;

          return (
            <div
              key={q.num}
              onClick={() => onJumpToCau(q.num)}
              aria-pressed={active}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                alignItems: "center",
                gap: 10,
                textAlign: "left",
                width: "100%",
                padding: "9px 14px 9px 11px",
                fontFamily: "inherit",
                fontSize: T.fontSize.caption,
                color: active ? T.accent : T.textSoft,
                fontWeight: active ? 600 : 500,
                background: active ? T.accentSoft : "transparent",
                borderLeft: `3px solid ${active ? T.accent : "transparent"}`,
                cursor: "pointer",
                transition: "color 0.12s, background 0.12s, border-color 0.12s",
                boxSizing: "border-box",
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
              <span style={{ display: "inline-flex", alignItems: "center" }}>
                <span>Câu {q.num}</span>
                {noteCount > 0 && (
                  <span
                    title={`${noteCount} ghi chú đối soát`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      fontFamily: T.mono,
                      fontWeight: 600,
                      color: active ? T.accent : T.textMute,
                      marginLeft: 8,
                      cursor: "help",
                    }}
                  >
                    {/* Minimal outline message icon */}
                    <svg
                      width={12}
                      height={12}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ opacity: 0.75 }}
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <span>{noteCount}</span>
                  </span>
                )}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontFamily: T.mono,
                  color: active ? T.accent : T.textFaint,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 2,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {setFinalScores ? (
                  <input
                    type="number"
                    step={0.25}
                    min={0}
                    max={cap}
                    value={myScore}
                    onChange={(e) => {
                      const raw = parseFloat(e.target.value);
                      if (Number.isNaN(raw)) {
                        setFinalScores((prev) => {
                          const next = { ...prev };
                          delete next[q.num];
                          return next;
                        });
                        return;
                      }
                      const clamped = cap != null
                        ? Math.max(0, Math.min(cap, raw))
                        : Math.max(0, raw);
                      setFinalScores((prev) => ({ ...prev, [q.num]: clamped }));
                    }}
                    style={{
                      width: 42,
                      fontFamily: T.mono,
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "1px 2px",
                      border: `1px solid ${isEdited ? T.red : T.border}`,
                      borderRadius: 4,
                      background: T.bgCard,
                      color: isEdited ? T.red : T.text,
                      outline: "none",
                      textAlign: "center",
                    }}
                  />
                ) : (
                  <span>{myScore.toFixed(1)}</span>
                )}
                {cap != null && (
                  <span style={{ color: T.textMute, fontSize: 10, fontWeight: 400 }}>
                    /{cap.toFixed(1)}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          padding: "10px 14px 0",
          fontSize: T.fontSize.xxs,
          color: T.textMute,
          fontFamily: T.font,
          flexShrink: 0,
        }}
      >
        {totalNotes} ghi chú đối soát
      </div>
    </aside>
  );
}
// Horizontal chip strip — mobile / tablet variant of the câu navigation.
// The vertical rail is too wide to coexist with the paper at <900px so it
// gets hidden there; without something taking its place the teacher loses
// the ability to jump between câu and has to scroll-hunt. The chips give
// back that affordance using minimal vertical room. Sticky-top so it stays
// reachable while reading.
export function MucLucChips({
  review,
  activeQ,
  onJumpToCau,
  finalScores,
}: {
  review: ReviewPayload;
  activeQ: number;
  onJumpToCau: (n: number) => void;
  finalScores?: Record<number, number>;
}) {
  return (
    <div
      style={{
        position: "sticky",
        top: 52,
        zIndex: 20,
        display: "flex",
        gap: 6,
        overflowX: "auto",
        padding: "8px 4px",
        marginBottom: 12,
        background: T.bg,
        // Hairline below so the strip reads as separate from the paper
        // while not adding a heavy card frame.
        borderBottom: `1px solid ${T.borderLight}`,
        // Hide scrollbar visually but keep scroll behaviour — chips look
        // cleaner without the OS-level bar peeking through.
        scrollbarWidth: "none",
      }}
    >
      {review.questions.map((q) => {
        const active = q.num === activeQ;
        const myScore = finalScores?.[q.num] ?? q.earned;
        const cap = q.max > 0 ? q.max : undefined;
        return (
          <button
            key={q.num}
            type="button"
            onClick={() => onJumpToCau(q.num)}
            aria-pressed={active}
            style={{
              flex: "0 0 auto",
              padding: "6px 12px",
              borderRadius: 999,
              border: `1px solid ${active ? T.accent : T.border}`,
              background: active ? T.accent : T.bgCard,
              color: active ? "#fff" : T.textSoft,
              fontFamily: T.font,
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
              transition: "background 0.12s, color 0.12s, border-color 0.12s",
            }}
          >
            <span>Câu {q.num}</span>
            <span
              style={{
                fontFamily: T.mono,
                fontSize: 11,
                color: active ? "rgba(255,255,255,0.85)" : T.textFaint,
              }}
            >
              {myScore.toFixed(1)}
            </span>
            {cap != null && (
              <span
                style={{
                  fontFamily: T.mono,
                  fontSize: 10,
                  color: active ? "rgba(255,255,255,0.72)" : T.textFaint,
                }}
              >
                /{cap.toFixed(1)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
