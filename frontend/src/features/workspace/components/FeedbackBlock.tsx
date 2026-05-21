import { T } from "../../../theme/tokens";
import { Icon } from "../../../components/ui/Icon";

// Per-câu expanded-body block. One component, two tones — the colour pair
// + leading icon is the entire "phần làm tốt vs cần cải thiện" semantic.
// The visually hidden `srLabel` (sr-only via clip-path) keeps screen
// reader users hearing "Phần làm tốt:" before the body text, even though
// nothing is rendered for sighted users.
export function FeedbackBlock({
  tone,
  srLabel,
  text,
  marginBottom = 0,
}: {
  tone: "good" | "improve";
  srLabel: string;
  text: string;
  marginBottom?: number;
}) {
  const palette =
    tone === "good"
      ? { bg: T.greenSoft, bar: T.green, icon: <Icon.Check size={12} color={T.green} /> }
      : { bg: T.amberSoft, bar: T.amber, icon: <Icon.Edit size={12} color={T.amber} /> };
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "8px 14px 8px 14px",
        background: palette.bg,
        borderLeft: `3px solid ${palette.bar}`,
        borderRadius: "0 6px 6px 0",
        marginBottom,
        fontSize: 15,
        color: T.textSoft,
        lineHeight: 1.55,
        alignItems: "flex-start",
      }}
    >
      {/* Icon kept on its own line-box so multi-line body text wraps cleanly
          beside it instead of pulling the icon down to the second line. */}
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          flexShrink: 0,
          height: "1.55em",
        }}
      >
        {palette.icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        {/* sr-only label — invisible to sighted users, announced by screen
            readers. Keeps the semantic without the visual pill. */}
        <span
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0,0,0,0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          {srLabel}:
        </span>
        {text}
      </span>
    </div>
  );
}
