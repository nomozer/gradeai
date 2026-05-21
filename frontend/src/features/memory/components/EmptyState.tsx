import { T } from "../../../theme/tokens";
import { Icon } from "../../../components/ui/Icon";

// Shown when the lesson list is empty — either genuinely (no lessons yet)
// or because the active filter / search matched nothing.
export function EmptyState({
  hasFilter,
  onClose,
}: {
  hasFilter: boolean;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        maxWidth: 560,
        margin: `${T.space[8]}px auto 0`,
        padding: `${T.space[8]}px clamp(${T.space[6]}px, 5vw, ${T.space[10]}px)`,
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        textAlign: "center",
        boxShadow: T.shadowSoft,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: T.accentSoft,
          marginBottom: T.space[5],
        }}
      >
        <Icon.Lightbulb size={36} color={T.accent} />
      </div>
      <div
        style={{
          fontFamily: T.display,
          fontSize: T.fontSize["2xl"],
          fontWeight: 600,
          color: T.text,
          marginBottom: T.space[3],
          letterSpacing: "-0.01em",
        }}
      >
        {hasFilter ? "Không có bài học khớp bộ lọc" : "Chưa có bài học nào"}
      </div>
      <div
        style={{
          fontSize: T.fontSize.base,
          color: T.textSoft,
          lineHeight: 1.65,
          marginBottom: T.space[6],
        }}
      >
        {hasFilter
          ? "Thử bỏ bộ lọc hoặc xoá ô tìm kiếm để xem toàn bộ kho bài học."
          : "Khi bạn duyệt, sửa hoặc từ chối các bài chấm, AI sẽ ghi nhớ chỗ này. Hãy chấm vài bài rồi quay lại."}
      </div>
      {!hasFilter && (
        <button
          onClick={onClose}
          style={{
            background: T.accent,
            border: "none",
            color: "#FFFDF8",
            padding: `${T.space[3]}px ${T.space[6]}px`,
            fontSize: T.fontSize.base,
            fontFamily: T.font,
            fontWeight: 500,
            borderRadius: 8,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: T.space[2],
            transition: "background 0.15s, transform 0.15s",
            boxShadow: T.shadowSoft,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = T.accentDark;
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = T.accent;
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <Icon.ArrowLeft size={14} /> Quay lại chấm bài
        </button>
      )}
    </div>
  );
}
