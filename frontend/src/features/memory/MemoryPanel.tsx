import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  deleteLesson,
  getMemoryStats,
  listLessons,
  type MemoryStats,
} from "../../api";
import { Icon } from "../../components/ui/Icon";
import { T } from "../../theme/tokens";
import type { Lesson } from "../../types";

interface MemoryPanelProps {
  onClose: () => void;
}

type SubjectFilter = "" | "cs" | "math" | "phys";

const SUBJECT_LABEL: Record<string, string> = {
  cs: "Tin",
  math: "Toán",
  phys: "Vật lý",
  stem: "STEM",
  "": "Khác",
  unknown: "Khác",
};

const SUBJECT_COLOR: Record<string, string> = {
  cs: T.accent,
  math: T.green,
  phys: T.amber,
};

interface TierInfo {
  label: string;
  color: string;
  bg: string;
}

function tierFromScore(score: number): TierInfo {
  if (score >= 5.0) return { label: "Từ chối", color: T.red, bg: T.redSoft };
  if (score >= 4.0) return { label: "Sửa / Hiệu chỉnh", color: T.amber, bg: T.amberSoft };
  if (score >= 3.5) return { label: "Theo câu", color: T.accent, bg: T.accentSoft };
  if (score >= 3.0) return { label: "Tổng hợp", color: T.green, bg: T.greenSoft };
  return { label: "Khác", color: T.textMute, bg: T.bgMuted };
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(text: string, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "…";
}

export function MemoryPanel({ onClose }: MemoryPanelProps) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [subject, setSubject] = useState<SubjectFilter>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

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

  // Debounce the search input by 250 ms so each keystroke does not fire a request.
  useEffect(() => {
    const ctrl = new AbortController();
    const handle = setTimeout(() => {
      fetchAll(ctrl.signal);
    }, 250);
    return () => {
      clearTimeout(handle);
      ctrl.abort();
    };
  }, [fetchAll]);

  const handleDelete = useCallback(
    async (id: number) => {
      setDeletingId(id);
      try {
        await deleteLesson(id);
        setLessons((prev) => prev.filter((l) => l.id !== id));
        // Refresh stats after a delete so totals stay honest.
        getMemoryStats()
          .then(setStats)
          .catch(() => undefined);
      } catch (err) {
        const msg = err instanceof ApiError ? err.detail : (err as Error).message;
        setError(msg || "Xoá bài học thất bại.");
      } finally {
        setDeletingId(null);
        setConfirmId(null);
      }
    },
    [],
  );

  const filterPills = useMemo(
    () =>
      [
        { value: "" as SubjectFilter, label: "Tất cả" },
        { value: "math" as SubjectFilter, label: "Toán" },
        { value: "cs" as SubjectFilter, label: "Tin" },
        { value: "phys" as SubjectFilter, label: "Vật lý" },
      ],
    [],
  );

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Top navigation bar — matches the brand feel of the sidebar */}
      <header
        style={{
          padding: "12px clamp(16px, 4vw, 40px)",
          borderBottom: `1px solid ${T.border}`,
          background: T.bgCard,
          position: "sticky",
          top: 0,
          zIndex: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          {/* Logo — Bold M (consistent with favicon) */}
          <img
            src="/favicon.svg"
            alt="MIRROR"
            width={36}
            height={36}
            style={{
              flexShrink: 0,
              borderRadius: 9,
              objectFit: "contain",
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: T.display,
                fontSize: 18,
                fontWeight: 600,
                color: T.text,
                letterSpacing: "-0.01em",
                lineHeight: 1.1,
              }}
            >
              MIRROR
            </div>
            <div
              style={{
                fontSize: 13,
                color: T.textMute,
                marginTop: 3,
              }}
            >
              Bộ nhớ AI
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          title="Quay lại bàn chấm"
          style={{
            background: T.accent,
            border: "none",
            color: "#FFFDF8",
            padding: "8px 20px",
            fontSize: 14,
            fontFamily: T.font,
            fontWeight: 500,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            borderRadius: 8,
            cursor: "pointer",
            transition: "all 0.15s",
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
          <Icon.ArrowLeft size={14} /> Quay lại bàn chấm
        </button>
      </header>

      {/* Hero section with stats */}
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "32px clamp(16px, 4vw, 40px) 0",
        }}
      >
        <div style={{ marginBottom: 28 }}>
          <h1
            style={{
              fontFamily: T.display,
              fontSize: 32,
              fontWeight: 600,
              color: T.text,
              letterSpacing: "-0.02em",
              margin: "0 0 8px",
            }}
          >
            Bộ nhớ HITL
          </h1>
          <p
            style={{
              fontSize: 16,
              color: T.textMute,
              margin: 0,
              lineHeight: 1.6,
              maxWidth: 600,
            }}
          >
            Mỗi lần bạn duyệt, sửa hoặc từ chối — AI lưu lại làm bài học.
            Bạn có thể tỉa các bài học không còn đúng.
          </p>
        </div>

        {/* Stats cards */}
        {stats && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 14,
              marginBottom: 28,
            }}
          >
            <StatCard label="Tổng bài học" value={stats.total_lessons} color={T.accent} />
            <StatCard label="Bài đã duyệt" value={stats.total_approved_grades} color={T.green} />
            <StatCard label="Lượt chấm" value={stats.total_pipeline_runs} color={T.amber} />
          </div>
        )}
      </div>

      {/* Filter & content */}
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "0 clamp(16px, 4vw, 40px) 96px",
        }}
      >
        <FilterBar
          pills={filterPills}
          subject={subject}
          onSubjectChange={setSubject}
          search={search}
          onSearchChange={setSearch}
          stats={stats}
        />

        {error && (
          <div
            style={{
              margin: "0 0 16px",
              padding: "10px 14px",
              background: T.redSoft,
              border: `1px solid ${T.red}`,
              borderRadius: 8,
              color: T.red,
              fontSize: 14,
            }}
          >
            <Icon.AlertTriangle size={14} color={T.red} /> {error}
          </div>
        )}

        {loading && lessons.length === 0 ? (
          <SkeletonList />
        ) : lessons.length === 0 ? (
          <EmptyState subject={subject} search={search} />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {lessons.map((lesson) => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                isConfirming={confirmId === lesson.id}
                isDeleting={deletingId === lesson.id}
                onAskDelete={() => setConfirmId(lesson.id)}
                onCancelDelete={() => setConfirmId(null)}
                onConfirmDelete={() => handleDelete(lesson.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        padding: "20px 22px",
        boxShadow: T.shadowSoft,
        borderTop: `3px solid ${color}`,
      }}
    >
      <div
        style={{
          fontFamily: T.display,
          fontSize: 32,
          fontWeight: 600,
          color: T.text,
          lineHeight: 1,
          marginBottom: 6,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 14,
          color: T.textMute,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function FilterBar({
  pills,
  subject,
  onSubjectChange,
  search,
  onSearchChange,
  stats,
}: {
  pills: Array<{ value: SubjectFilter; label: string }>;
  subject: SubjectFilter;
  onSubjectChange: (s: SubjectFilter) => void;
  search: string;
  onSearchChange: (s: string) => void;
  stats: MemoryStats | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        padding: "14px 0 18px",
        borderBottom: `1px solid ${T.border}`,
        marginBottom: 20,
      }}
    >
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {pills.map((pill) => {
          const active = pill.value === subject;
          const count =
            pill.value === ""
              ? stats?.total_lessons
              : stats?.by_subject[pill.value] ?? 0;
          return (
            <button
              key={pill.value || "all"}
              onClick={() => onSubjectChange(pill.value)}
              style={{
                background: active ? T.accent : "transparent",
                border: `1px solid ${active ? T.accent : T.border}`,
                color: active ? "#FFFDF8" : T.textSoft,
                padding: "7px 16px",
                fontSize: 14,
                fontFamily: T.font,
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                transition: "all 0.15s",
                cursor: "pointer",
              }}
            >
              {pill.label}
              {count !== undefined && (
                <span
                  style={{
                    fontFamily: T.mono,
                    fontSize: 13,
                    opacity: active ? 0.85 : 0.6,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 200,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: T.bgInput,
          border: `1px solid ${T.border}`,
          padding: "6px 12px",
          borderRadius: 6,
        }}
      >
        <Icon.MessageCircle size={14} color={T.textFaint} />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Tìm trong nội dung bài học hoặc đề bài…"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: T.text,
            fontSize: 15,
            fontFamily: T.font,
          }}
        />
        {search && (
          <button
            onClick={() => onSearchChange("")}
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
    </div>
  );
}

function LessonCard({
  lesson,
  isConfirming,
  isDeleting,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  lesson: Lesson;
  isConfirming: boolean;
  isDeleting: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const tier = tierFromScore(lesson.feedback_score);
  const subjLabel = SUBJECT_LABEL[lesson.subject] ?? lesson.subject ?? "Khác";
  const subjColor = SUBJECT_COLOR[lesson.subject] ?? T.textMute;

  return (
    <article
      style={{
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        padding: "16px 18px",
        boxShadow: T.shadowSoft,
        opacity: isDeleting ? 0.5 : 1,
        transition: "opacity 0.2s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        <span
          style={{
            background: `${subjColor}1A`,
            color: subjColor,
            padding: "3px 11px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          {subjLabel}
        </span>
        <span
          style={{
            background: tier.bg,
            color: tier.color,
            padding: "3px 11px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {tier.label}
        </span>
        <span
          style={{
            fontFamily: T.mono,
            fontSize: 12,
            color: T.textFaint,
          }}
          title="Điểm ưu tiên — càng cao càng ảnh hưởng mạnh đến lần chấm sau"
        >
          ưu tiên {lesson.feedback_score.toFixed(1)}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: T.textMute, fontFamily: T.mono }}>
          {formatTimestamp(lesson.timestamp)}
        </span>
        <span style={{ fontSize: 12, color: T.textFaint, fontFamily: T.mono }}>
          #{lesson.id}
        </span>
      </div>

      <div
        style={{
          fontSize: 14,
          color: T.textMute,
          marginBottom: 10,
          fontStyle: "italic",
          lineHeight: 1.5,
        }}
      >
        Đề: {truncate(lesson.task, 140) || "(không có)"}
      </div>

      <div
        style={{
          fontSize: 16,
          color: T.text,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
        }}
      >
        {lesson.lesson_text}
      </div>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 8,
        }}
      >
        {!isConfirming ? (
          <button
            onClick={onAskDelete}
            disabled={isDeleting}
            style={{
              background: "transparent",
              border: `1px solid ${T.border}`,
              color: T.textMute,
              padding: "6px 14px",
              fontSize: 14,
              fontFamily: T.font,
              borderRadius: 6,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              cursor: isDeleting ? "wait" : "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = T.red;
              e.currentTarget.style.color = T.red;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = T.border;
              e.currentTarget.style.color = T.textMute;
            }}
          >
            <Icon.X size={11} /> Quên bài học này
          </button>
        ) : (
          <>
            <span style={{ fontSize: 14, color: T.red, marginRight: 4 }}>
              Xoá vĩnh viễn?
            </span>
            <button
              onClick={onCancelDelete}
              disabled={isDeleting}
              style={{
                background: "transparent",
                border: `1px solid ${T.border}`,
                color: T.textSoft,
                padding: "6px 14px",
                fontSize: 14,
                fontFamily: T.font,
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Huỷ
            </button>
            <button
              onClick={onConfirmDelete}
              disabled={isDeleting}
              style={{
                background: T.red,
                border: `1px solid ${T.red}`,
                color: "#FFFDF8",
                padding: "6px 16px",
                fontSize: 14,
                fontFamily: T.font,
                borderRadius: 6,
                cursor: isDeleting ? "wait" : "pointer",
                fontWeight: 500,
              }}
            >
              {isDeleting ? "Đang xoá…" : "Xoá"}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function SkeletonList() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 110,
            background: T.bgCard,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            opacity: 0.5,
            animation: `pulse 1.4s ease-in-out ${i * 0.15}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function EmptyState({ subject, search }: { subject: SubjectFilter; search: string }) {
  const filtering = subject !== "" || search !== "";
  return (
    <div
      style={{
        maxWidth: 480,
        margin: "60px auto 0",
        padding: "32px clamp(20px, 5vw, 32px)",
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
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: T.accentSoft,
          marginBottom: 14,
        }}
      >
        <Icon.Lightbulb size={28} color={T.accent} />
      </div>
      <div
        style={{
          fontFamily: T.display,
          fontSize: 20,
          fontWeight: 600,
          color: T.text,
          marginBottom: 10,
          letterSpacing: "-0.01em",
        }}
      >
        {filtering ? "Không có bài học khớp bộ lọc" : "Chưa có bài học nào"}
      </div>
      <div style={{ fontSize: 15, color: T.textSoft, lineHeight: 1.65 }}>
        {filtering
          ? "Thử bỏ bộ lọc môn hoặc xoá ô tìm kiếm để xem toàn bộ kho bài học."
          : "Khi bạn duyệt, sửa hoặc từ chối các bài chấm, AI sẽ ghi nhớ chỗ này. Hãy chấm vài bài rồi quay lại."}
      </div>
    </div>
  );
}
