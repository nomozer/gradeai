import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  deleteLesson,
  getMemoryStats,
  listLessons,
  type MemoryStats,
} from "../../api";
import { Icon } from "../../components/ui/Icon";
import { subscribeMemoryChanged } from "../../lib/memoryBus";
import { subjectLabelRaw } from "../../lib/subject";
import { T } from "../../theme/tokens";
import type { Lesson } from "../../types";
import { TierDistribution } from "./components/TierDistribution";
import { SearchInput } from "./components/SearchInput";
import { PillGroup } from "./components/PillGroup";
import { SkeletonList } from "./components/SkeletonList";
import { EmptyState } from "./components/EmptyState";
import { LessonTable } from "./components/LessonTable";
import {
  sourceFromLesson,
  type SourceFilter,
  type SubjectFilter,
} from "./utils";

// Source / tier model (SourceTag, SOURCE_META, sourceFromLesson, …) lives
// in features/memory/utils.ts. subjectLabelRaw lives in lib/subject.ts.

// Stale-while-revalidate snapshot. Persisted to localStorage so the panel
// renders the last-known data INSTANTLY across page reloads, then revalidates
// in the background. Without persistence the first paint after a refresh
// flashed EmptyState → skeleton → real data, which the teacher flagged as
// "đợi mấy mili giây mới ra nội dung". Stored only for the unfiltered view
// (subject="" && search="") — filtered fetches don't pollute the cache
// because hydrating a filtered subset on the next mount would hide other
// lessons until search clears. The cache is best-effort: any storage
// failure (Safari private mode, full quota, disabled by user) silently
// degrades back to in-memory + skeleton-on-first-load.
type MemorySnapshot = {
  lessons: Lesson[];
  stats: MemoryStats | null;
};

const SNAPSHOT_STORAGE_KEY = "hitl.memory.snapshot.v1";

function readSnapshotFromStorage(): MemorySnapshot | null {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.lessons)
    ) {
      return null;
    }
    return { lessons: parsed.lessons, stats: parsed.stats ?? null };
  } catch {
    return null;
  }
}

function writeSnapshotToStorage(snap: MemorySnapshot): void {
  try {
    window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snap));
  } catch {
    // Quota or privacy mode — fall through to in-memory only.
  }
}

let memorySnapshot: MemorySnapshot | null =
  typeof window !== "undefined" ? readSnapshotFromStorage() : null;

export function MemoryPanel() {
  const handleClose = useCallback(() => {
    if (window.opener && !window.opener.closed) {
      window.close();
      return;
    }
    window.location.hash = "";
    window.location.reload();
  }, []);

  // Hydrate from the module snapshot so re-mount renders instantly.
  // Lazy-init form of useState (function arg) — only the first render
  // reads memorySnapshot, subsequent renders use the state value.
  const [lessons, setLessons] = useState<Lesson[]>(
    () => memorySnapshot?.lessons ?? [],
  );
  const [stats, setStats] = useState<MemoryStats | null>(
    () => memorySnapshot?.stats ?? null,
  );
  const [subject, setSubject] = useState<SubjectFilter>("");
  const [source, setSource] = useState<SourceFilter>("");
  const [search, setSearch] = useState("");
  // Initial loading state mirrors "do we have anything to show right
  // now?". Without cache → loading=true so the brief gap between mount
  // and the useEffect-triggered fetch renders skeleton, not EmptyState.
  // With cache → loading=false so the cached lessons render instantly
  // and revalidation happens silently in the background (true SWR).
  const [loading, setLoading] = useState(() => memorySnapshot === null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Backend filters: subject + free-text search.
  // Source filter is client-side because it depends on a lesson_text probe
  // that the SQLite layer doesn't index.
  const fetchAll = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const [list, st] = await Promise.all([
          listLessons({ subject, search, limit: 300 }, { signal }),
          getMemoryStats({ signal }),
        ]);
        setLessons(list.items);
        setStats(st);
        // Snapshot only the unfiltered view — filtered fetches would
        // hydrate the next remount with a partial list, leaving older
        // lessons invisible until search clears. Cheap check on both
        // filter fields to keep the cache trustworthy. Persist to
        // localStorage too so the next page reload hydrates instantly
        // instead of flashing skeleton → empty → data.
        if (!subject && !search) {
          const snap = { lessons: list.items, stats: st };
          memorySnapshot = snap;
          writeSnapshotToStorage(snap);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const msg = err instanceof ApiError ? err.detail : (err as Error).message;
        setError(msg || "Không tải được bộ nhớ.");
      } finally {
        setLoading(false);
      }
    },
    [subject, search],
  );

  // 250ms debounce was meant to coalesce search-input keystrokes, but it
  // also delayed the initial fetch — opening "Bộ nhớ HITL" sat for ~300ms
  // with a skeleton before data even started loading, which read as lag.
  // First mount fires immediately; subsequent renders (when subject/
  // search changes) still debounce.
  const firstFetchRef = useRef(true);
  useEffect(() => {
    const ctrl = new AbortController();
    const delay = firstFetchRef.current ? 0 : 250;
    firstFetchRef.current = false;
    const handle = setTimeout(() => {
      fetchAll(ctrl.signal);
    }, delay);
    return () => {
      clearTimeout(handle);
      ctrl.abort();
    };
  }, [fetchAll]);

  // Cross-window cache invalidation. When the Workspace (in a different
  // browser window) submits feedback / finalizes / regrades, the API
  // helpers emit on `memoryBus` and this listener picks it up so the
  // teacher sees the new lesson without F5.
  //
  // `fetchAll` is captured via ref so this effect only subscribes once
  // per mount — without the ref, every subject/search change would
  // tear down and re-create the subscription. The 200 ms debounce
  // coalesces bursts like "feedback then finalize", which would
  // otherwise fire two back-to-back refetches.
  const fetchAllRef = useRef(fetchAll);
  fetchAllRef.current = fetchAll;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeMemoryChanged(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // Drop cached views so a later remount/page-reload doesn't
        // re-show the now-stale list while it revalidates.
        memorySnapshot = null;
        try {
          window.localStorage.removeItem(SNAPSHOT_STORAGE_KEY);
        } catch {
          // No-op: quota / privacy mode.
        }
        fetchAllRef.current();
      }, 200);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    setDeletingId(id);
    try {
      await deleteLesson(id);
      setLessons((prev) => {
        const next = prev.filter((l) => l.id !== id);
        // Keep both caches (in-memory + localStorage) in sync —
        // otherwise the next remount or page reload hydrates with a
        // list still containing the deleted lesson until the
        // background refresh resolves.
        if (memorySnapshot) {
          memorySnapshot = { ...memorySnapshot, lessons: next };
          writeSnapshotToStorage(memorySnapshot);
        }
        return next;
      });
      getMemoryStats()
        .then((st) => {
          setStats(st);
          if (memorySnapshot) {
            memorySnapshot = { ...memorySnapshot, stats: st };
            writeSnapshotToStorage(memorySnapshot);
          }
        })
        .catch(() => undefined);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : (err as Error).message;
      setError(msg || "Xoá bài học thất bại.");
    } finally {
      setDeletingId(null);
    }
  }, []);

  // Source filter is client-side; subject + search already happened on the
  // server. Compute the source tag once per lesson here so the table render
  // doesn't recompute on every hover.
  const tagged = useMemo(
    () => lessons.map((l) => ({ lesson: l, source: sourceFromLesson(l) })),
    [lessons],
  );
  const visible = useMemo(
    () => (source ? tagged.filter((t) => t.source === source) : tagged),
    [tagged, source],
  );

  const sourcePills: Array<{ value: SourceFilter; label: string }> = [
    { value: "",         label: "Tất cả" },
    { value: "REJECT",   label: "Reject" },
    { value: "Δ-GRADE",  label: "Δ-grade" },
    { value: "REVISE",   label: "Revise" },
    { value: "PER-CÂU",  label: "Per-câu" },
    { value: "APPROVE",  label: "Approve" },
  ];
  // Subject pills are derived from stats.by_subject so the list grows as
  // the backend adds subjects — no need to keep a hardcoded union in sync.
  // Sorted by count desc (most-used first) then alphabetical to keep order
  // stable across renders when counts tie. The currently-selected subject
  // is always included even if its count drops to 0, so a teacher who has
  // filtered to a subject doesn't see the active pill vanish mid-session.
  const subjectPills = useMemo<Array<{ value: SubjectFilter; label: string }>>(() => {
    const counts = stats?.by_subject ?? {};
    const codes = new Set<string>(Object.keys(counts).filter((k) => k && counts[k] > 0));
    if (subject) codes.add(subject);
    const sorted = Array.from(codes).sort((a, b) => {
      const diff = (counts[b] ?? 0) - (counts[a] ?? 0);
      return diff !== 0 ? diff : a.localeCompare(b);
    });
    return [
      { value: "", label: "Mọi môn" },
      ...sorted.map((c) => ({
        value: c,
        label: counts[c] ? `${subjectLabelRaw(c)} (${counts[c]})` : subjectLabelRaw(c),
      })),
    ];
  }, [stats, subject]);

  return (
    <div style={{ minHeight: "100vh" }}>
      <header
        style={{
          padding: `${T.space[3]}px clamp(16px, 4vw, 40px)`,
          borderBottom: `1px solid ${T.border}`,
          background: T.bgCard,
          position: "sticky",
          top: 0,
          zIndex: 80,
          display: "flex",
          alignItems: "center",
          gap: T.space[4],
        }}
      >
        <div
          style={{
            fontFamily: T.display,
            fontSize: T.fontSize.xl,
            fontWeight: 600,
            color: T.accentDark,
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
          }}
        >
          Bộ nhớ AI
        </div>
      </header>

      {/* Hero — title + description (left), tier distribution chart (right). */}
      <div
        style={{
          maxWidth: T.width.app,
          margin: "0 auto",
          padding: `${T.space[8]}px clamp(16px, 4vw, 40px) 0`,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: T.space[8],
          alignItems: "start",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: T.display,
              fontSize: T.fontSize["3xl"],
              fontWeight: 600,
              color: T.text,
              letterSpacing: "-0.02em",
              fontStyle: "italic",
              margin: `0 0 ${T.space[3]}px`,
            }}
          >
            Bộ nhớ HITL
          </h1>
          <p
            style={{
              fontSize: T.fontSize.base,
              color: T.textMute,
              margin: 0,
              lineHeight: 1.6,
              maxWidth: 560,
            }}
          >
            Mỗi lần bạn sửa AI, chúng tôi lưu lại bài học. Bài học có{" "}
            <span style={{ color: T.red, fontWeight: 600 }}>điểm càng cao</span>{" "}
            càng ảnh hưởng mạnh tới lần chấm tiếp theo.
          </p>
        </div>
        <TierDistribution lessons={lessons} />
      </div>

      {/* Filter row */}
      <div
        style={{
          maxWidth: T.width.app,
          margin: `${T.space[7]}px auto 0`,
          padding: `0 clamp(16px, 4vw, 40px)`,
          display: "flex",
          alignItems: "center",
          gap: T.space[4],
          flexWrap: "wrap",
        }}
      >
        <SearchInput value={search} onChange={setSearch} />
        <PillGroup
          pills={sourcePills}
          active={source}
          onChange={(v) => setSource(v as SourceFilter)}
        />
        <div style={{ flex: 1 }} />
        <PillGroup
          pills={subjectPills}
          active={subject}
          onChange={(v) => setSubject(v as SubjectFilter)}
          // Top 5 (Mọi môn + 4 môn dùng nhiều nhất) + "+N môn khác"
          // toggle. Chọn 5 vì viewport thường vẫn fit trên 1 dòng cùng
          // ô search + source pills; trên 5 sẽ wrap xuống dòng 2 và
          // cluttered. Source pills không cần overflow vì code hardcode
          // 6 items, không scale theo data.
          maxVisible={5}
        />
      </div>

      {/* Content */}
      <div
        style={{
          maxWidth: T.width.app,
          margin: `${T.space[5]}px auto 0`,
          padding: `0 clamp(16px, 4vw, 40px) 96px`,
        }}
      >
        {error && (
          <div
            style={{
              margin: `0 0 ${T.space[4]}px`,
              padding: `${T.space[3]}px ${T.space[4]}px`,
              background: T.redSoft,
              border: `1px solid ${T.red}`,
              borderRadius: 8,
              color: T.red,
              fontSize: T.fontSize.sm,
            }}
          >
            <Icon.AlertTriangle size={14} color={T.red} /> {error}
          </div>
        )}

        {loading && lessons.length === 0 ? (
          <SkeletonList />
        ) : visible.length === 0 ? (
          <EmptyState
            hasFilter={!!subject || !!search || !!source}
            onClose={handleClose}
          />
        ) : (
          <LessonTable
            rows={visible}
            deletingId={deletingId}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// TierDistribution lives in components/TierDistribution.tsx.

// SearchInput lives in components/SearchInput.tsx.
// LessonTable + LessonRow live in components/LessonTable.tsx.
// SkeletonList lives in components/SkeletonList.tsx.
// EmptyState lives in components/EmptyState.tsx.

