import { useEffect, useRef, useState } from "react";
import { T } from "../../../theme/tokens";
import type { I18nStrings, SelectionAnnotation } from "../../../types";
import { VerdictRow } from "./VerdictRow";

// AnnotationCard — renders inside the AnnotationBubble. Pure
// presentation: shows the quote + teacher's comment + (verdict row when
// applicable). Verdict's own collapse (pill click → analysis) lives
// inside VerdictRow.
export function AnnotationCard({
  ann,
  editing,
  analyzing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onRemove,
  onDecideDispute,
  t,
}: {
  ann: SelectionAnnotation;
  editing: boolean;
  analyzing: boolean;
  onStartEdit: () => void;
  onCancelEdit: (currentComment: string) => void;
  onSave: (comment: string, color?: "yellow" | "green" | "blue" | "red" | "purple" | "orange" | "pink" | "mint") => void;
  onRemove: () => void;
  onDecideDispute: (decision: "apply" | "skip") => void;
  t: I18nStrings;
}) {
  const [draft, setDraft] = useState(ann.comment);
  const [selectedColor, setSelectedColor] = useState<"yellow" | "green" | "blue" | "red" | "purple" | "orange" | "pink" | "mint" | undefined>(ann.color);

  useEffect(() => {
    setDraft(ann.comment);
    setSelectedColor(ann.color);
  }, [ann.comment, ann.color, editing]);

  // Explicit input-focus on each entry into edit mode. ``autoFocus`` only
  // fires on the input's first mount; without this effect, re-entering
  // edit mode from display mode (or hopping between annotations) would
  // leave focus on the previously-focused element.
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing && inputRef.current) {
      // Defer one frame so the bubble's layout-effect-driven repositioning
      // settles before we call focus — keeps the page from scroll-jumping
      // when the input is offscreen mid-mount.
      const t = requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
      return () => cancelAnimationFrame(t);
    }
  }, [editing]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "16px 20px",
        background: "#FAF7ED",
        border: "1px solid #E6DEC9",
        borderRadius: 12,
        boxShadow: T.shadowStrong,
      }}
    >
      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: T.textMute,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                fontFamily: T.display,
              }}
            >
              {String(t.teacherCommentLabel ?? "Nhận xét của giáo viên")}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onSave(draft, selectedColor);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    onCancelEdit(draft);
                  }
                }}
                placeholder="Ghi nhận xét của bạn..."
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  background: "#FFFDF8",
                  fontFamily: T.font,
                  fontSize: 14,
                  color: T.text,
                  outline: "none",
                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)",
                }}
              />
              <button
                type="button"
                onClick={() => onSave(draft, selectedColor)}
                disabled={!draft.trim() && !selectedColor}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: (draft.trim() || selectedColor) ? T.green : "#EBE7DF",
                  color: (draft.trim() || selectedColor) ? "#fff" : T.textMute,
                  fontFamily: T.font,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: (draft.trim() || selectedColor) ? "pointer" : "not-allowed",
                  transition: "all 0.15s ease",
                }}
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: T.textMute,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontFamily: T.display,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%"
            }}
          >
            <span>{String(t.teacherCommentLabel ?? "Nhận xét của giáo viên")}</span>
            {ann.color && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  color:
                    ann.color === "green" ? "#10B981" :
                    ann.color === "red" ? "#EF4444" :
                    ann.color === "yellow" ? "#D97706" :
                    ann.color === "blue" ? "#2563EB" :
                    ann.color === "purple" ? "#7C3AED" :
                    ann.color === "orange" ? "#EA580C" :
                    ann.color === "pink" ? "#DB2777" :
                    "#0D9488",
                  background:
                    ann.color === "green" ? "#ECFDF5" :
                    ann.color === "red" ? "#FEE2E2" :
                    ann.color === "yellow" ? "#FEF3C7" :
                    ann.color === "blue" ? "#EFF6FF" :
                    ann.color === "purple" ? "#F5F3FF" :
                    ann.color === "orange" ? "#FFF7ED" :
                    ann.color === "pink" ? "#FDF2F8" :
                    "#F0FDFA",
                  padding: "2px 6px",
                  borderRadius: 4,
                  border: `1px solid ${
                    ann.color === "green" ? "#A7F3D0" :
                    ann.color === "red" ? "#FECACA" :
                    ann.color === "yellow" ? "#FDE68A" :
                    ann.color === "blue" ? "#BFDBFE" :
                    ann.color === "purple" ? "#DDD6FE" :
                    ann.color === "orange" ? "#FFEDD5" :
                    ann.color === "pink" ? "#FBCFE8" :
                    "#CCFBF1"
                  }`,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background:
                      ann.color === "green" ? "#10B981" :
                      ann.color === "red" ? "#EF4444" :
                      ann.color === "yellow" ? "#F59E0B" :
                      ann.color === "blue" ? "#3B82F6" :
                      ann.color === "purple" ? "#8B5CF6" :
                      ann.color === "orange" ? "#F97316" :
                      ann.color === "pink" ? "#EC4899" :
                      "#14B8A6",
                  }}
                />
                {ann.color === "green" ? "Đúng / Tốt" :
                 ann.color === "red" ? "Lỗi sai" :
                 ann.color === "yellow" ? "Lưu ý" :
                 ann.color === "blue" ? "Khác" :
                 ann.color === "purple" ? "Lập luận" :
                 ann.color === "orange" ? "Diễn đạt" :
                 ann.color === "pink" ? "Sáng tạo" :
                 "Ý hay"}
              </span>
            )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              width: "100%",
            }}
          >
            <span
              style={{
                flex: 1,
                whiteSpace: "pre-wrap",
                minWidth: 0,
                color: T.text,
                fontSize: 15,
                fontWeight: 600,
                lineHeight: 1.5,
                cursor: "text",
              }}
              onClick={onStartEdit}
              role="button"
              tabIndex={0}
            >
              {ann.comment || (
                <span style={{ color: T.textFaint, fontStyle: "italic", fontWeight: 400 }}>
                  Tô sáng đơn thuần (Bấm để viết bình luận...)
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={onRemove}
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
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "color 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = T.red;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = T.textFaint;
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
      {/* Verdict block — always rendered inside the bubble. The pill
          itself owns the analysis collapse (click pill → expand
          analysis). Hidden only in edit mode to keep the input focused. */}
      {!editing && ann.comment && (
        <VerdictRow
          analyzing={analyzing}
          verdict={ann.verdict}
          analysis={ann.analysis}
          disputeDecision={ann.disputeDecision}
          onDecideDispute={onDecideDispute}
          t={t}
        />
      )}
    </div>
  );
}
