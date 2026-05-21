import React from "react";
import { T } from "../../../theme/tokens";
import { Icon } from "../../../components/ui/Icon";

// Step3Toolbar — full-width strip above the doc/sidebar grid: a usage
// hint on the left (đối soát is a select-to-annotate surface with no
// button — the hint makes that affordance discoverable), action pills
// on the right. Student identity is NOT shown here — it lives once in
// PaperHead as the document's heading; rendering it in both places
// duplicated the identity strip. Centralises affordances that used to
// be in the paper-head MetaPills + adds "Bản chấm AI" peek so the
// teacher can reveal AI's verdict without committing to step 4 yet.
export function Step3Toolbar({
  onViewOriginal,
  essayAvailable,
  onPeekAi,
}: {
  onViewOriginal?: () => void;
  essayAvailable?: boolean;
  onPeekAi: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 16px",
        marginBottom: 14,
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        boxShadow: T.shadowSoft,
        flexWrap: "wrap",
      }}
    >
      {/* Usage hint — đối soát has no "annotate" button; the teacher
          drag-selects a passage to comment. This caption surfaces that
          otherwise-invisible interaction. Muted + ellipsis so it never
          competes with the action pills. */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          minWidth: 0,
          color: T.textMute,
          fontSize: 12.5,
          fontFamily: T.font,
        }}
      >
        <Icon.PenTool size={13} color={T.textFaint} style={{ flexShrink: 0 }} />
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          Bôi đen đoạn cần góp ý để thêm ghi chú đối soát
        </span>
      </div>
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
        <ToolbarButton
          icon={<Icon.Lightbulb size={12} color={T.amber} />}
          onClick={onPeekAi}
          title="Xem điểm + nhận xét AI đã chấm"
        >
          Bản chấm AI
        </ToolbarButton>
        <ToolbarButton
          icon={<PrinterIcon size={12} />}
          onClick={() => window.print()}
          title="In bài chấm"
        >
          In
        </ToolbarButton>
      </div>
    </div>
  );
}

// ToolbarButton — pill-shaped action button used inside Step3Toolbar.
// Matches MetaPill's silhouette so adjacent surfaces (PaperHead before
// the redesign, MucLuc items now) read as part of the same visual
// system.
function ToolbarButton({
  children,
  icon,
  onClick,
  title,
  disabled = false,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}) {
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
        padding: "6px 12px",
        fontSize: 12.5,
        fontFamily: T.font,
        fontWeight: 500,
        color: disabled ? T.textFaint : T.textSoft,
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 999,
        cursor: disabled || !onClick ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transition: "color 0.12s, border-color 0.12s",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        if (disabled || !onClick) return;
        e.currentTarget.style.color = T.accent;
        e.currentTarget.style.borderColor = T.accent;
      }}
      onMouseLeave={(e) => {
        if (disabled || !onClick) return;
        e.currentTarget.style.color = T.textSoft;
        e.currentTarget.style.borderColor = T.border;
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function PrinterIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}
