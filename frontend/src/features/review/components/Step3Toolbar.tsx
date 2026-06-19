import React, { useEffect, useRef, useState } from "react";
import { T } from "../../../theme/tokens";
import { Icon } from "../../../components/ui/Icon";
import { useBreakpoint } from "../../../hooks/useBreakpoint";
import type { SelectionAnnotation } from "../../../types";
import { clipText } from "../utils";

// Step3Toolbar — full-width strip above the doc/sidebar grid: a usage
// hint on the left (đối soát is a select-to-annotate surface with no
// button — the hint makes that affordance discoverable), action pills
// on the right. Student identity is NOT shown here — it lives once in
// PaperHead as the document's heading; rendering it in both places
// duplicated the identity strip. Centralises affordances that used to
// be in the paper-head MetaPills.
export function Step3Toolbar({
  onViewOriginal,
  essayAvailable,
  tocOpen,
  onToggleToc,
  onPrint,
  annotations,
  onJumpToAnnotation,
}: {
  onViewOriginal?: () => void;
  essayAvailable?: boolean;
  tocOpen?: boolean;
  onToggleToc?: () => void;
  /** Print the formal phiếu chấm. Lives here (a document-level tool next
   *  to "Xem PDF gốc") instead of a dedicated finalize screen, so the
   *  teacher can print at any time without leaving the review surface. */
  onPrint?: () => void;
  /** All đối-soát annotations on the current paper. Drives the "Ghi chú (N)"
   *  popover — a jump-list so the teacher can review every comment without
   *  scrolling the document hunting for highlights. */
  annotations?: SelectionAnnotation[];
  /** Scroll the document to a given annotation's highlight (by id). */
  onJumpToAnnotation?: (id: string) => void;
}) {
  const bp = useBreakpoint();
  const isMobile = bp === "mobile";

  // "Ghi chú (N)" popover — jump-list of every comment, grouped by câu.
  const [notesOpen, setNotesOpen] = useState(false);
  const notesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!notesOpen) return;
    const onDown = (e: MouseEvent) => {
      if (notesRef.current && !notesRef.current.contains(e.target as Node)) {
        setNotesOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [notesOpen]);

  const notes = (annotations ?? []).filter((a) => a.comment.trim().length > 0);
  const noteCount = notes.length;
  // Group by câu (then line order) so the list mirrors the document's flow.
  const byCau = new Map<number, SelectionAnnotation[]>();
  for (const a of [...notes].sort((x, y) => x.cau - y.cau || x.lineIdx - y.lineIdx)) {
    if (!byCau.has(a.cau)) byCau.set(a.cau, []);
    byCau.get(a.cau)!.push(a);
  }
  const noteGroups = [...byCau.entries()];
  // Left accent stripe per row reflects the AI's verdict on the comment.
  const verdictColor = (v?: string) =>
    v === "agree" ? T.green : v === "partial" ? T.amber : v === "dispute" ? T.red : T.borderLight;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: isMobile ? "flex-end" : "space-between",
        gap: 12,
        padding: isMobile ? "8px 10px" : "10px 16px",
        marginBottom: 14,
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderLeft: `4px solid ${T.accent}`,
        borderRadius: 12,
        boxShadow: T.shadowSoft,
        flexWrap: "wrap",
      }}
    >
      {/* Usage hint — đối soát has no "annotate" button; the teacher
          drag-selects a passage to comment. Hidden on mobile to keep the
          toolbar from wrapping into two rows; teachers on touch UAs
          typically discover the long-press-select affordance natively. */}
      {!isMobile && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
            background: "rgba(59, 79, 138, 0.04)",
            border: `1px solid rgba(59, 79, 138, 0.08)`,
            padding: "5px 12px",
            borderRadius: 8,
            color: T.accent,
            fontSize: 12,
            fontFamily: `"Inter", "Outfit", system-ui, -apple-system, sans-serif`,
            fontWeight: 500,
          }}
        >
          <Icon.PenTool size={12} color={T.accent} style={{ flexShrink: 0 }} />
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <strong style={{ fontWeight: 700, marginRight: 4 }}>Hướng dẫn:</strong>
            Bôi đen đoạn cần góp ý để thêm ghi chú đối soát
          </span>
        </div>
      )}
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
        {!isMobile && onToggleToc && (
          <ToolbarButton
            icon={
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.9 }}>
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
            }
            onClick={onToggleToc}
            variant={tocOpen ? "accent" : "default"}
            title={tocOpen ? "Ẩn mục lục (Mở rộng bài làm)" : "Hiện mục lục"}
          >
            {tocOpen ? "Ẩn mục lục" : "Mục lục"}
          </ToolbarButton>
        )}
        <div ref={notesRef} style={{ position: "relative", display: "inline-flex" }}>
          <ToolbarButton
            icon={<Icon.MessageCircle size={12} />}
            onClick={() => setNotesOpen((v) => !v)}
            variant={notesOpen ? "accent" : "default"}
            title="Xem tất cả ghi chú đối soát — bấm để nhảy tới từng đoạn"
          >
            Ghi chú ({noteCount})
          </ToolbarButton>
          {notesOpen && (
            <div
              role="menu"
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
                width: 320,
                maxWidth: "min(320px, 86vw)",
                maxHeight: 380,
                overflowY: "auto",
                background: T.bgCard,
                border: `1px solid ${T.border}`,
                borderRadius: 12,
                boxShadow: "0 12px 32px -8px rgba(44, 46, 58, 0.18)",
                zIndex: 60,
                padding: 8,
                animation: "fadeUp 0.16s ease-out",
              }}
            >
              {noteCount === 0 ? (
                <div
                  style={{
                    padding: "18px 12px",
                    fontSize: 12.5,
                    color: T.textMute,
                    fontFamily: T.font,
                    lineHeight: 1.5,
                    textAlign: "center",
                  }}
                >
                  Chưa có ghi chú nào.
                  <br />
                  Bôi đen đoạn cần góp ý để thêm.
                </div>
              ) : (
                noteGroups.map(([cau, items]) => (
                  <div key={cau} style={{ marginBottom: 6 }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: T.textMute,
                        fontFamily: T.font,
                        letterSpacing: "0.03em",
                        textTransform: "uppercase",
                        padding: "6px 8px 4px",
                      }}
                    >
                      Câu {cau}
                    </div>
                    {items.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          onJumpToAnnotation?.(a.id);
                          setNotesOpen(false);
                        }}
                        title="Nhảy tới đoạn này"
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 10px",
                          marginBottom: 2,
                          borderRadius: 8,
                          border: "none",
                          borderLeft: `3px solid ${verdictColor(a.verdict)}`,
                          background: "transparent",
                          cursor: "pointer",
                          fontFamily: T.font,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(44, 46, 58, 0.04)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        {a.quote.trim() && (
                          <div
                            style={{
                              fontSize: 11.5,
                              color: T.textMute,
                              fontStyle: "italic",
                              marginBottom: 2,
                              lineHeight: 1.4,
                            }}
                          >
                            “{clipText(a.quote, 46)}”
                          </div>
                        )}
                        <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.45 }}>
                          {clipText(a.comment, 90)}
                        </div>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
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
        {onPrint && (
          <ToolbarButton
            icon={<Icon.Printer size={12} />}
            onClick={onPrint}
            variant="blue"
            title="In phiếu chấm — xuất bản giấy với chữ ký và điểm bằng chữ."
          >
            In phiếu chấm
          </ToolbarButton>
        )}
      </div>
    </div>
  );
}

// ToolbarButton — rounded-rectangle action button used inside Step3Toolbar.
// Matches standard button shape (borderRadius: 8) to maintain visual consistency
// with the bottom ActionBar and the rest of the application's design system.
function ToolbarButton({
  children,
  icon,
  onClick,
  title,
  disabled = false,
  variant = "default",
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  variant?: "default" | "accent" | "blue";
}) {
  const isAccent = variant === "accent";
  const isBlue = variant === "blue";

  // Custom styles based on variant
  const getStyle = (): React.CSSProperties => {
    if (disabled || !onClick) {
      return {
        color: T.textFaint,
        background: T.bgCard,
        border: `1px solid ${T.borderLight}`,
        opacity: 0.55,
        cursor: "not-allowed",
      };
    }

    if (isAccent) {
      return {
        color: T.amber,
        background: "rgba(192, 139, 48, 0.05)",
        border: `1.5px solid rgba(192, 139, 48, 0.25)`,
        boxShadow: "0 1px 2px rgba(192, 139, 48, 0.05)",
      };
    }

    if (isBlue) {
      return {
        color: T.accent,
        background: T.bgCard,
        border: `1.5px solid ${T.accent}40`,
      };
    }

    // default
    return {
      color: T.textSoft,
      background: T.bgCard,
      border: `1px solid ${T.border}`,
    };
  };

  return (
    <button
      type="button"
      className="rc-toolbar-btn"
      onClick={onClick}
      disabled={disabled || !onClick}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 14px",
        fontSize: 12,
        fontFamily: `"Inter", "Outfit", system-ui, -apple-system, sans-serif`,
        fontWeight: 600,
        borderRadius: 8,
        cursor: "pointer",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        whiteSpace: "nowrap",
        ...getStyle(),
      }}
      onMouseEnter={(e) => {
        if (disabled || !onClick) return;
        if (isAccent) {
          e.currentTarget.style.background = "rgba(192, 139, 48, 0.09)";
          e.currentTarget.style.borderColor = "rgba(192, 139, 48, 0.4)";
        } else if (isBlue) {
          e.currentTarget.style.background = `${T.accent}08`;
          e.currentTarget.style.borderColor = `${T.accent}80`;
          e.currentTarget.style.color = T.accentDark;
        } else {
          e.currentTarget.style.color = T.accent;
          e.currentTarget.style.borderColor = T.accent;
          e.currentTarget.style.background = "rgba(59, 79, 138, 0.04)";
        }
      }}
      onMouseLeave={(e) => {
        if (disabled || !onClick) return;
        if (isAccent) {
          e.currentTarget.style.background = "rgba(192, 139, 48, 0.05)";
          e.currentTarget.style.borderColor = "rgba(192, 139, 48, 0.25)";
        } else if (isBlue) {
          e.currentTarget.style.background = T.bgCard;
          e.currentTarget.style.borderColor = `${T.accent}40`;
          e.currentTarget.style.color = T.accent;
        } else {
          e.currentTarget.style.color = T.textSoft;
          e.currentTarget.style.borderColor = T.border;
          e.currentTarget.style.background = T.bgCard;
        }
      }}
    >
      {icon}
      {children}
    </button>
  );
}
