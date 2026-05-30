import { T } from "../../../theme/tokens";
import { Icon } from "../../../components/ui/Icon";

// Post-finalize confirmation banner. Closes the HITL feedback loop
// visually so the teacher sees AI absorbed their work.
//
// Phrasing is teacher-facing, not log-facing — no DB row ids
// ("delta lesson #8"), no internal score tiers ("điểm tham chiếu 4.0"),
// no jargon like "nhiễu bộ nhớ". Each line ends with what the teacher
// gets back next time, not what got written where. Specific câu numbers
// + delta amounts replace the prior "1 câu" abstraction so the message
// matches the rows the teacher actually edited.
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
  // Per-câu deltas in numeric câu order so the line reads
  // "Câu 2 −0.5đ, Câu 5 +1đ" — matches what the teacher just edited.
  const cauDeltas = Object.entries(deltas)
    .filter(([k]) => k.startsWith("cau:"))
    .map(([k, v]) => ({ cau: parseInt(k.slice(4), 10), delta: v }))
    .filter((x) => Number.isFinite(x.cau))
    .sort((a, b) => a.cau - b.cau);

  const formatDelta = (d: number) =>
    `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d)}đ`;

  return (
    <div
      className="rc-no-print"
      style={{
        marginBottom: 14,
        padding: "12px 16px",
        background: T.greenSoft,
        borderLeft: `4px solid ${T.green}`,
        borderRadius: 8,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <Icon.Lightbulb size={14} color={T.green} />
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: T.green,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          AI đã ghi nhớ từ bài này
        </span>
      </div>
      <ul
        style={{
          margin: 0,
          paddingLeft: 18,
          fontSize: 15,
          color: T.text,
          lineHeight: 1.6,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {commentsSaved > 0 && (
          <li>
            <strong>{commentsSaved}</strong> nhận xét của bạn → dùng cho
            bài tương tự lần sau
          </li>
        )}
        {commentsSkipped > 0 && (
          <li style={{ color: T.textSoft }}>
            <strong>{commentsSkipped}</strong> nhận xét chưa lưu — AI và
            bạn chưa thống nhất.
          </li>
        )}
        {deltaLessonId != null && (
          <li>
            {cauDeltas.length > 0 ? (
              <>
                {cauDeltas
                  .map((x) => `Câu ${x.cau} ${formatDelta(x.delta)}`)
                  .join(", ")}{" "}
                → AI sẽ chấm gần với bạn hơn lần sau
              </>
            ) : (
              "Điểm bạn chỉnh đã ghi nhớ — AI sẽ chấm gần với bạn hơn lần sau"
            )}
          </li>
        )}
      </ul>
    </div>
  );
}
