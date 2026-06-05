import React from "react";
import { T } from "../../../theme/tokens";
import { Icon } from "../../../components/ui/Icon";
import { useBreakpoint } from "../../../hooks/useBreakpoint";

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
}: {
  onViewOriginal?: () => void;
  essayAvailable?: boolean;
  tocOpen?: boolean;
  onToggleToc?: () => void;
  /** Print the formal phiếu chấm. Lives here (a document-level tool next
   *  to "Xem PDF gốc") instead of a dedicated finalize screen, so the
   *  teacher can print at any time without leaving the review surface. */
  onPrint?: () => void;
}) {
  const bp = useBreakpoint();
  const isMobile = bp === "mobile";
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
