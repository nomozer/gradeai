import { useState } from "react";
import { Toast } from "../../../components/ui/Toast";

// Post-finalize learning confirmation — a TRANSIENT toast, not a persistent
// banner. Replaces the old full-width violet "AI đã ghi nhớ" strip, which
// read as clutter sitting permanently above the locked review. The toast
// folds the "saved" + "learned" signals into one line that floats briefly
// then auto-dismisses (the read-side "Đã học từ bạn: N" chip on the next
// grade still surfaces the loop, so a permanent write-side banner was double).
//
// It mounts when the locked state appears (same gate the banner used), shows
// once, then hides itself; an unlock → re-finalize remounts it so it shows
// again. In the batch auto-advance case App.tsx switches away and this tab's
// subtree is `display:none`, so this toast never competes with App's
// "chuyển tới bài kế" toast.
export function LearnToast({
  commentsSaved,
  deltaLessonId,
}: {
  commentsSaved: number;
  deltaLessonId: number | null;
}) {
  const [show, setShow] = useState(true);
  if (!show) return null;

  const learned =
    commentsSaved > 0
      ? `AI đã ghi nhớ ${commentsSaved} góp ý`
      : deltaLessonId != null
        ? "AI đã ghi nhớ điều chỉnh của bạn"
        : "";
  const message = learned ? `Đã lưu · ${learned}` : "Đã lưu điểm";

  return <Toast message={message} onDismiss={() => setShow(false)} durationMs={3500} />;
}
