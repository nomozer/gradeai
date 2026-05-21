import { useCallback, useEffect, useMemo, useState } from "react";
import { T } from "../../theme/tokens";
import { ApiError, listGradeHistory } from "../../api";
import { subjectLabelRaw } from "../../lib/subject";
import type { GradeHistoryEntry } from "../../types";
import { parseTaskContext } from "./utils";
import { HistoryRow } from "./components/HistoryRow";

interface GradeHistoryDropdownProps {
  open: boolean;
  onClose: () => void;
  /** Anchor element rect for positioning the popover under the trigger. */
  anchorRect: DOMRect | null;
}

// subjectLabelRaw lives in lib/subject.ts — single source of truth shared
// with the Memory panel.

// relativeTime + parseTaskContext live in features/history/utils.ts.

// Recency buckets so a 30-50 row list still gives the teacher a temporal
// anchor without a real timeline. Comparing day-boundaries (not wall
// clock) so "chấm lúc 23:55 hôm qua" sits in "Hôm qua" even when read
// at 00:05 today. Backend history already returns newest-first, so each
// bucket inherits that ordering.
type Bucket = "today" | "yesterday" | "week" | "older";

const BUCKET_LABEL: Record<Bucket, string> = {
  today: "Hôm nay",
  yesterday: "Hôm qua",
  week: "7 ngày trước",
  older: "Cũ hơn",
};

const BUCKET_ORDER: Bucket[] = ["today", "yesterday", "week", "older"];

function startOfDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function bucketOf(ts: number): Bucket {
  const dayDiff = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / 86_400_000);
  if (dayDiff <= 0) return "today";
  if (dayDiff === 1) return "yesterday";
  if (dayDiff <= 7) return "week";
  return "older";
}

export function GradeHistoryDropdown({ open, onClose, anchorRect }: GradeHistoryDropdownProps) {
  // Re-read from backend on each open so a freshly-saved grade appears
  // without relying on browser-local history.
  const [entries, setEntries] = useState<GradeHistoryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    // Reset query when re-opening so the previous filter doesn't ghost
    // through (teacher's mental model: opening fresh = see everything).
    setQuery("");
    listGradeHistory({ limit: 50 }, { signal: ctrl.signal })
      .then((res) => setEntries(res.items))
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        const msg = err instanceof ApiError ? err.detail : (err as Error).message;
        setError(msg || "Không tải được lịch sử bài chấm.");
        setEntries([]);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [open]);

  // ESC closes — same UX as Memory / Help modals.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Filtered + grouped view. Filter against body + subject label so a
  // teacher searching "sinh" finds bio essays even when the row title is
  // just the đề name. Recomputed only when entries/query change.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? entries.filter((e) => {
          const { body } = parseTaskContext(e.task);
          const subj = subjectLabelRaw(e.subject).toLowerCase();
          return body.toLowerCase().includes(q) || subj.includes(q);
        })
      : entries;
    const out: Record<Bucket, GradeHistoryEntry[]> = {
      today: [],
      yesterday: [],
      week: [],
      older: [],
    };
    for (const entry of filtered) {
      out[bucketOf(entry.ts)].push(entry);
    }
    return out;
  }, [entries, query]);

  const totalVisible = groups.today.length + groups.yesterday.length + groups.week.length + groups.older.length;

  const handleLoad = useCallback(
    (entry: GradeHistoryEntry, step: 3 | 4 | 5 = 3) => {
      // Hand off to the active tab's EssayWorkspace via a window event. The
      // dropdown lives in the header and has no direct ref into the tab,
      // and the active tab listens for this exact event. Carrying ``step``
      // lets one history grade enter at any of the three teacher-facing
      // surfaces (Review / Regrade / Done) — Review is the default since
      // that's where you usually want to start a re-pass.
      window.dispatchEvent(
        new CustomEvent("hitl.loadGrade", { detail: { entry, step } }),
      );
      onClose();
    },
    [onClose],
  );

  // Anchor under the trigger button's right edge so the popover hangs
  // beneath the link rather than centering on the page.
  const popoverStyle = useMemo<React.CSSProperties>(() => {
    if (!anchorRect) {
      return { top: 60, right: 24 };
    }
    return {
      top: anchorRect.bottom + 6,
      right: Math.max(8, window.innerWidth - anchorRect.right),
    };
  }, [anchorRect]);

  if (!open) return null;

  return (
    <>
      {/* Transparent click-outside catcher. Sits below the popover (z 240)
          and above the page (z 80), so clicks anywhere except inside the
          popover close it. */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background: "transparent",
          zIndex: 240,
        }}
      />
      <div
        role="dialog"
        aria-label="Bài đã chấm"
        style={{
          position: "fixed",
          ...popoverStyle,
          width: "min(420px, calc(100vw - 16px))",
          maxHeight: "min(560px, calc(100vh - 80px))",
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          boxShadow: T.shadowStrong,
          zIndex: 250,
          display: "flex",
          flexDirection: "column",
          animation: "fadeUp 0.18s ease-out",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: `${T.space[3]}px ${T.space[4]}px`,
            borderBottom: `1px solid ${T.borderLight}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: T.space[3],
          }}
        >
          <div
            style={{
              fontFamily: T.display,
              fontSize: T.fontSize.lg,
              fontWeight: 600,
              color: T.text,
            }}
          >
            Bài đã chấm
          </div>
        </div>

        {/* Search box — only shown once there's at least one entry. Hidden
            on a fresh empty history to keep the "Chưa có bài" empty state
            as the primary content. */}
        {entries.length > 0 && (
          <div
            style={{
              padding: `${T.space[2]}px ${T.space[4]}px`,
              borderBottom: `1px solid ${T.borderLight}`,
            }}
          >
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tên đề hoặc môn…"
              aria-label="Tìm trong lịch sử bài chấm"
              autoFocus
              style={{
                width: "100%",
                background: T.bg,
                border: `1px solid ${T.borderLight}`,
                borderRadius: 6,
                padding: "6px 10px",
                fontFamily: T.font,
                fontSize: T.fontSize.sm,
                color: T.text,
                outline: "none",
              }}
            />
          </div>
        )}

        {/* Body — scrollable list grouped by recency bucket */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div
              style={{
                padding: `${T.space[8]}px ${T.space[5]}px`,
                textAlign: "center",
                color: T.textMute,
                fontSize: T.fontSize.sm,
              }}
            >
              Đang tải lịch sử…
            </div>
          ) : error ? (
            <div
              style={{
                padding: `${T.space[8]}px ${T.space[5]}px`,
                textAlign: "center",
                color: T.red,
                fontSize: T.fontSize.sm,
                lineHeight: 1.6,
              }}
            >
              {error}
            </div>
          ) : entries.length === 0 ? (
            <div
              style={{
                padding: `${T.space[8]}px ${T.space[5]}px`,
                textAlign: "center",
                color: T.textMute,
                fontSize: T.fontSize.sm,
                lineHeight: 1.6,
              }}
            >
              Chưa có bài chấm nào trong lịch sử.
              <div style={{ marginTop: T.space[2], fontSize: T.fontSize.xs, color: T.textFaint }}>
                Mỗi lần chấm thành công sẽ tự lưu vào backend (tối đa 50 bài gần nhất).
              </div>
            </div>
          ) : totalVisible === 0 ? (
            <div
              style={{
                padding: `${T.space[8]}px ${T.space[5]}px`,
                textAlign: "center",
                color: T.textMute,
                fontSize: T.fontSize.sm,
              }}
            >
              Không có bài nào khớp với “{query.trim()}”.
            </div>
          ) : (
            BUCKET_ORDER.map((bucket) => {
              const rows = groups[bucket];
              if (rows.length === 0) return null;
              return (
                <section key={bucket}>
                  <div
                    style={{
                      padding: `${T.space[2]}px ${T.space[4]}px`,
                      background: T.bg,
                      color: T.textMute,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      borderBottom: `1px solid ${T.borderLight}`,
                      position: "sticky",
                      top: 0,
                      zIndex: 1,
                    }}
                  >
                    {BUCKET_LABEL[bucket]} ({rows.length})
                  </div>
                  {rows.map((entry) => (
                    <HistoryRow
                      key={entry.id}
                      entry={entry}
                      onLoad={(step) => handleLoad(entry, step)}
                    />
                  ))}
                </section>
              );
            })
          )}
        </div>

        {/* Footer caption — hint about persistence scope */}
        {entries.length > 0 && (
          <div
            style={{
              padding: `${T.space[2]}px ${T.space[4]}px`,
              borderTop: `1px solid ${T.borderLight}`,
              fontSize: 11,
              color: T.textFaint,
              textAlign: "center",
            }}
          >
            Lấy từ backend/database · Không phụ thuộc cache trình duyệt
          </div>
        )}
      </div>
    </>
  );
}

// HistoryRow + SecondaryJump live in components/HistoryRow.tsx.
