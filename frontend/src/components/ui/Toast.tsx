import { useEffect, useRef } from "react";
import { T } from "../../theme/tokens";
import { Icon } from "./Icon";

// Toast — a single transient confirmation that floats top-center and
// auto-dismisses. Built for the batch-grading flow: when the teacher
// chốt a paper and App.tsx auto-advances to the next one, the locked
// summary of the paper they just saved scrolls away — without a toast
// the save would be silent (the exact failure mode the tab-error flag
// exists to prevent, one level up). One toast at a time is enough; a
// queue would be over-engineering for a "saved, moving on" signal.
export function Toast({
  message,
  onDismiss,
  durationMs = 2600,
}: {
  message: string;
  /** Cleared by the parent (sets its toast state to null). */
  onDismiss: () => void;
  durationMs?: number;
}) {
  // Keep the latest onDismiss in a ref so the auto-dismiss timer below can
  // call it WITHOUT listing it as an effect dep. The caller passes an
  // inline ``() => setToast(null)`` (new identity every render); if that
  // were a dep, the parent's frequent re-renders during batch grading would
  // clear+re-arm the timer on every render and the toast would linger far
  // past durationMs. Re-arm only when the message (or duration) changes.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const id = window.setTimeout(() => onDismissRef.current(), durationMs);
    return () => window.clearTimeout(id);
  }, [message, durationMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      style={{
        position: "fixed",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        maxWidth: "min(520px, calc(100vw - 32px))",
        padding: "11px 18px",
        // Dark charcoal surface with a green ✓ badge. Two-tone reads cleaner
        // than the old monochrome-green pill (which looked like one flat green
        // blob). The colour now lives only in the check accent, still tying it
        // to the app-wide "saved / done" green without painting the whole bar.
        background: T.text,
        color: "#FFFDF8",
        borderRadius: 999,
        boxShadow: "0 10px 30px -8px rgba(44, 46, 58, 0.45)",
        fontFamily: T.font,
        fontSize: 14,
        fontWeight: 600,
        lineHeight: 1.4,
        cursor: "pointer",
        animation: "toastIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 20,
          height: 20,
          borderRadius: "50%",
          // Solid green badge — the single spot of colour against the dark
          // bar, carrying the "done" green. On the dark ground it stands out
          // instead of vanishing the way it would on a green body.
          background: T.green,
          flex: "0 0 auto",
        }}
      >
        <Icon.Check size={12} color="#fff" />
      </span>
      <span style={{ minWidth: 0 }}>{message}</span>
    </div>
  );
}
