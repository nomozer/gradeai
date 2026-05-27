import { T } from "../../../theme/tokens";
import { Icon } from "../../../components/ui/Icon";

// LearningBanner — post-finalize confirmation that the HITL feedback
// loop landed. Shows the teacher the two signals AI just absorbed:
//   • Comment annotations from step 3 → lessons at score 3.5.
//   • Score-delta lesson from this finalize → score 4.0 (only when the
//     teacher's adjustments crossed the per-câu/rubric threshold).
//
// Counts of per-câu / rubric / overall deltas come from the backend's
// ``deltas`` map — keys "cau:N" (per-câu), "content"/"argument"/...
// (rubric), and "overall". We split them so the message reflects the
// dimension the teacher actually edited.
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
  const cauKeys = Object.keys(deltas).filter((k) => k.startsWith("cau:"));
  const rubricKeys = Object.keys(deltas).filter(
    (k) => !k.startsWith("cau:") && k !== "overall",
  );
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
          AI đã học từ bài này
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
            <strong>{commentsSaved}</strong> nhận xét → bộ nhớ HITL{" "}
            <span style={{ color: T.textMute, fontFamily: T.mono }}>
              (điểm tham chiếu 3.5)
            </span>
          </li>
        )}
        {commentsSkipped > 0 && (
          <li style={{ color: T.textSoft }}>
            <strong>{commentsSkipped}</strong> nhận xét bị AI phản biện —
            đã bỏ qua để tránh nhiễu bộ nhớ.
          </li>
        )}
        {deltaLessonId != null && (
          <li>
            Điều chỉnh điểm
            {cauKeys.length > 0 && (
              <>
                {" "}
                <strong>{cauKeys.length} câu</strong>
              </>
            )}
            {rubricKeys.length > 0 && (
              <>
                {cauKeys.length > 0 ? " + " : " "}
                <strong>{rubricKeys.length} tiêu chí</strong>
              </>
            )}{" "}
            → delta lesson #{deltaLessonId}{" "}
            <span style={{ color: T.textMute, fontFamily: T.mono }}>
              (điểm tham chiếu 4.0)
            </span>
          </li>
        )}
        {deltaLessonId == null && commentsSaved > 0 && (
          <li style={{ color: T.textSoft, fontSize: T.fontSize.caption }}>
            Điểm bạn chốt khớp với AI — không tạo delta lesson.
          </li>
        )}
      </ul>
    </div>
  );
}
