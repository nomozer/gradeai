import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { T } from "../../../theme/tokens";

// SelectionToolbar — floating mini-toolbar Word-style. Pinned to viewport
// coords so it survives scroll jitter; positioned just below the selection
// rect. Uses ``onMouseDown`` (not onClick) so the action fires before the
// browser collapses the selection.
export function SelectionToolbar({
  selectionRange,
  onComment,
  onHighlight,
  onDismiss,
}: {
  selectionRange: Range;
  onComment: () => void;
  onHighlight: (color: "yellow" | "green" | "blue" | "red" | "purple" | "orange" | "pink" | "mint") => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [showColors, setShowColors] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: -9999,
    top: -9999,
  });

  const reposition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rects = selectionRange.getClientRects();
    const anchorRect =
      rects.length > 0 ? rects[0] : selectionRange.getBoundingClientRect();

    const x = anchorRect.left + anchorRect.width / 2;
    const y = anchorRect.bottom;

    const w = el.offsetWidth;
    const vw = window.innerWidth;
    const half = w / 2;
    const left = Math.max(half + 6, Math.min(vw - half - 6, x));

    setPos({ left, top: y + 8 });
  }, [selectionRange]);

  useLayoutEffect(() => {
    reposition();
  }, [reposition]);

  useEffect(() => {
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [reposition]);

  return (
    <div
      id="step3-selection-toolbar"
      ref={ref}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
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
      {/* 1. Bình luận */}
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
          e.currentTarget.style.background = T.bgHover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = T.bgCard;
        }}
      >
        <svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: T.accent }}
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Bình luận
      </button>

      {/* Vertical divider */}
      <div style={{ width: 1, height: 16, background: T.border, margin: "0 2px" }} />

      {/* 2. Tô sáng Dropdown Button */}
      <div style={{ position: "relative", display: "inline-flex" }}>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            setShowColors((prev) => !prev);
          }}
          title="Chọn màu tô sáng..."
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            fontSize: 12.5,
            fontWeight: 500,
            color: T.text,
            background: showColors ? T.bgHover : T.bgCard,
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: T.font,
          }}
          onMouseEnter={(e) => {
            if (!showColors) e.currentTarget.style.background = T.bgHover;
          }}
          onMouseLeave={(e) => {
            if (!showColors) e.currentTarget.style.background = T.bgCard;
          }}
        >
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "#F59E0B" }}
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          Tô sáng
          <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 2 }}>▼</span>
        </button>

        {showColors && (
          <div
            id="step3-selection-toolbar-palette"
            style={{
              position: "absolute",
              top: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              marginTop: 6,
              background: T.paper,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 6,
              padding: 8,
              zIndex: 60,
              animation: "fadeUp 0.12s ease-out",
            }}
          >
            {/* White X block */}
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onComment(); // Default yellow comment with editing card opened
                setShowColors(false);
              }}
              title="Thêm bình luận (Mặc định không màu)"
              style={{
                width: 26,
                height: 26,
                borderRadius: 4,
                background: "#FFFDF8",
                border: "1px solid #D1D5DB",
                cursor: "pointer",
                padding: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 800,
                color: "#EF4444",
                transition: "all 0.12s ease",
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.12)"}
              onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
            >
              ×
            </button>

            {/* 8 Custom Color Blocks */}
            {[
              { value: "yellow", color: "#FFF59D", title: "Màu vàng (Lưu ý)" },
              { value: "green", color: "#C6F6D5", title: "Màu xanh lá (Đúng / Tốt)" },
              { value: "blue", color: "#C4E2FF", title: "Màu xanh dương (Khác)" },
              { value: "red", color: "#FFCDD2", title: "Màu đỏ (Lỗi sai)" },
              { value: "purple", color: "#E8D5F6", title: "Màu tím (Lập luận)" },
              { value: "orange", color: "#FFE0B2", title: "Màu cam (Diễn đạt)" },
              { value: "pink", color: "#FBCFE8", title: "Màu hồng (Sáng tạo)" },
              { value: "mint", color: "#E0F2F1", title: "Màu xanh bạc hà (Ý hay)" },
            ].map((p) => (
              <button
                key={p.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onHighlight(p.value as any);
                  setShowColors(false);
                }}
                title={p.title}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 4,
                  background: p.color,
                  border: "1px solid #D1D5DB",
                  cursor: "pointer",
                  padding: 0,
                  transition: "transform 0.12s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.12)"}
                onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
              />
            ))}
          </div>
        )}
      </div>

      {/* Vertical divider */}
      <div style={{ width: 1, height: 16, background: T.border, margin: "0 2px" }} />

      {/* 3. Dismiss */}
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
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 4,
          transition: "color 0.12s, background 0.12s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = T.text;
          e.currentTarget.style.background = T.bgHover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = T.textFaint;
          e.currentTarget.style.background = "transparent";
        }}
      >
        <svg
          width={10}
          height={10}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
