import { T } from "../../../theme/tokens";
import { Icon } from "../../../components/ui/Icon";

export function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      className="memory-search"
      style={{
        minWidth: 240,
        maxWidth: 320,
        display: "flex",
        alignItems: "center",
        gap: T.space[2],
        background: T.bgInput,
        border: `1px solid ${T.border}`,
        padding: `${T.space[2]}px ${T.space[3]}px`,
        borderRadius: 8,
      }}
    >
      <Icon.MessageCircle size={14} color={T.textFaint} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Tìm trong bài học…"
        style={{
          flex: 1,
          background: "transparent",
          border: "none",
          outline: "none",
          color: T.text,
          fontSize: T.fontSize.sm,
          fontFamily: T.font,
          minWidth: 0,
        }}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          style={{
            background: "transparent",
            border: "none",
            color: T.textFaint,
            cursor: "pointer",
            padding: 2,
            display: "inline-flex",
          }}
          title="Xoá tìm kiếm"
        >
          <Icon.X size={12} />
        </button>
      )}
    </div>
  );
}
