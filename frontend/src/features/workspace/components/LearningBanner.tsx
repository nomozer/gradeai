import { T } from "../../../theme/tokens";
import { Icon } from "../../../components/ui/Icon";

// Post-finalize confirmation — a SLIM one-line strip, not a panel. It sits
// above the review surface as the header of the locked state, so it has to
// read as a quiet "noted" cue, not a second card competing with the paper
// below. Earlier it was a full green-soft block with an uppercase title +
// bullet list, which over-weighted a single line of content; now it's a
// near-white bar with just a left accent rule.
//
// Phrasing is teacher-facing, not log-facing — no DB row ids, no internal
// score tiers, no jargon. Each fragment ends with what the teacher gets
// back next time. Specific câu numbers + delta amounts (e.g. "Câu 2 −0.5đ")
// match the rows the teacher actually edited.
export function LearningBanner({
  commentsSaved,
  commentsSkipped,
  deltaLessonId,
  deltas,
}: {
  commentsSaved: number;
  commentsSkipped: number;
  deltaLessonId: number | null;
  deltas: Record<string, number>;
}) {
  // Per-câu deltas in numeric câu order → "Câu 2 −0.5đ, Câu 5 +1đ".
  const cauDeltas = Object.entries(deltas)
    .filter(([k]) => k.startsWith("cau:"))
    .map(([k, v]) => ({ cau: parseInt(k.slice(4), 10), delta: v }))
    .filter((x) => Number.isFinite(x.cau))
    .sort((a, b) => a.cau - b.cau);

  const formatDelta = (d: number) =>
    `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d)}đ`;

  // Collapse the three possible signals into inline fragments joined by
  // a middot. Keeps the whole thing to one line in the common case.
  const fragments: string[] = [];
  if (commentsSaved > 0) {
    fragments.push(`${commentsSaved} nhận xét → dùng cho bài tương tự`);
  }
  if (deltaLessonId != null) {
    fragments.push(
      cauDeltas.length > 0
        ? `${cauDeltas
            .map((x) => `Câu ${x.cau} ${formatDelta(x.delta)}`)
            .join(", ")} → AI chấm gần bạn hơn lần sau`
        : "Điểm bạn chỉnh đã ghi nhớ",
    );
  }
  if (commentsSkipped > 0) {
    fragments.push(`${commentsSkipped} nhận xét chưa lưu (AI và bạn chưa thống nhất)`);
  }

  return (
    <div
      className="rc-no-print"
      style={{
        // Near-white card bg + a thin violet left rule. Violet is the
        // shared HITL-loop identity colour (tokens.memory): this write-side
        // banner and the read-side "Đã học từ bạn" chip use the same motif
        // so the teacher recognises both as "my fingerprint in the AI".
        marginBottom: 12,
        padding: "8px 14px",
        background: T.bgCard,
        border: `1px solid ${T.borderLight}`,
        borderLeft: `3px solid ${T.memory}`,
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontFamily: T.font,
        fontSize: 13,
        lineHeight: 1.45,
        color: T.textSoft,
        flexWrap: "wrap",
      }}
    >
      <Icon.Lightbulb size={13} color={T.memory} style={{ flexShrink: 0 }} />
      <span style={{ fontWeight: 700, color: T.memory, whiteSpace: "nowrap" }}>
        AI đã ghi nhớ
      </span>
      {fragments.length > 0 && (
        <span style={{ color: T.textMute }}>·</span>
      )}
      <span style={{ minWidth: 0 }}>{fragments.join(" · ")}</span>
    </div>
  );
}
