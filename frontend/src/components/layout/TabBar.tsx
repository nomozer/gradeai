import { useState, useEffect, useRef } from "react";
import { T } from "../../theme/tokens";
import type { I18nStrings, Tab } from "../../types";
import { Icon } from "../ui/Icon";
import { MirrorLogo } from "../ui/MirrorLogo";
import { useBreakpoint } from "../../hooks/useBreakpoint";

interface TabBarProps {
  tabs: Tab[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onClose: (id: string) => void;
  onClear: () => void;
  onRename: (id: string, label: string) => void;
  completedCount: number;
  t: I18nStrings;
}

// Custom inline SVG icons that are missing in the default Icon pack
const MoreVerticalIcon = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: "block" }}
  >
    <circle cx="12" cy="12" r="1.5" fill={color} />
    <circle cx="12" cy="5" r="1.5" fill={color} />
    <circle cx="12" cy="19" r="1.5" fill={color} />
  </svg>
);

const PlusIcon = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: "block" }}
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export function TabBar({
  tabs,
  activeId,
  onSelect,
  onAdd,
  onClose,
  onClear,
  onRename,
  t,
}: TabBarProps) {
  const bp = useBreakpoint();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [hoveredTrigger, setHoveredTrigger] = useState(false);
  const [hoveredCloseId, setHoveredCloseId] = useState<string | null>(null);
  const [hoveredAdd, setHoveredAdd] = useState(false);
  const [hoveredClear, setHoveredClear] = useState(false);
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const [hoveredBatch, setHoveredBatch] = useState(false);

  const sidebarRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Listen for custom event to open sidebar (from header hamburger)
  useEffect(() => {
    const handleOpen = () => setSidebarOpen(true);
    window.addEventListener("hitl.openSidebar", handleOpen);
    return () => window.removeEventListener("hitl.openSidebar", handleOpen);
  }, []);

  // Close menus on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuOpenId && !(event.target as HTMLElement).closest(".tab-menu-container")) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpenId]);

  const handleRename = (tab: Tab, index: number) => {
    const defaultVal = tab.label || `${String(t.essayN ?? "Bài")} ${index + 1}`;
    const newName = window.prompt("Nhập tên mới cho bài làm này:", defaultVal);
    if (newName !== null) {
      const trimmed = newName.trim();
      if (trimmed) {
        onRename(tab.id, trimmed);
      }
    }
  };

  const activeTabIdx = tabs.findIndex((x) => x.id === activeId);
  const activeLabel = tabs[activeTabIdx]?.label || `${String(t.essayN ?? "Bài")} ${activeTabIdx + 1}`;

  return (
    <>
      {/* 1. Floating Capsule Trigger Button (Image 1 style) — desktop only */}
      {bp === "desktop" && (
        <button
          ref={triggerRef}
          type="button"
          className="floating-capsule-trigger"
          onClick={() => setSidebarOpen(true)}
          onMouseEnter={() => setHoveredTrigger(true)}
          onMouseLeave={() => setHoveredTrigger(false)}
          style={{
            position: "fixed",
            left: 20,
            top: 76,
            zIndex: 90,
            height: 38,
            background: "#FFFDF8",
            border: `1px solid ${T.border}`,
            borderRadius: 999,
            padding: "4px 14px 4px 4px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            boxShadow: hoveredTrigger
              ? "0 6px 20px -6px rgba(44, 46, 58, 0.15)"
              : "0 4px 12px -4px rgba(44, 46, 58, 0.08)",
            transition: "all 0.2s ease",
            outline: "none",
          }}
          title={
            tabs.length > 1
              ? (() => {
                  const finalizedCount = tabs.filter((tt) => tt.finalized).length;
                  const awaitingReview = tabs.filter(
                    (tt) => tt.hasGrade && !tt.finalized,
                  ).length;
                  const failedCount = tabs.filter((tt) => tt.error).length;
                  const parts = [
                    `Đang mở: ${activeLabel}`,
                    `${finalizedCount}/${tabs.length} đã duyệt`,
                    `${awaitingReview} chờ review`,
                  ];
                  if (failedCount > 0) parts.push(`${failedCount} lỗi`);
                  return parts.join(" · ");
                })()
              : `Đang mở: ${activeLabel}`
          }
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "rgba(59, 79, 138, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: T.accent,
              transition: "background-color 0.2s ease",
            }}
          >
            <Icon.Menu size={16} />
          </div>
          {/* Single-tab mode: just the tab count digit (current behavior).
              Batch mode (≥2 tabs): inline mini progress glyphs so the
              teacher sees how many bài are duyệt-xong without opening
              the drawer. Same visual language as the drawer header pill
              for consistency. ⊙ = AI graded, waiting teacher review. */}
          {(() => {
            if (tabs.length <= 1) {
              return (
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: T.textSoft,
                    fontFamily: `"Inter", "Outfit", system-ui, -apple-system, sans-serif`,
                  }}
                >
                  {tabs.length}
                </span>
              );
            }
            const total = tabs.length;
            const finalizedCount = tabs.filter((tt) => tt.finalized).length;
            const awaitingReview = tabs.filter(
              (tt) => tt.hasGrade && !tt.finalized,
            ).length;
            const generatingCount = tabs.filter(
              (tt) => tt.phase === "generating",
            ).length;
            const failedCount = tabs.filter((tt) => tt.error).length;

            const isAllDone = finalizedCount === total;

            // Glance-only status dots: a coloured dot + count, NO words.
            // Different from the old "N chờ duyệt" text badge that made the
            // capsule long and duplicated the drawer — here it's just a dot
            // so the teacher can spot "something needs me" (amber pending /
            // indigo grading / red error) without hover, click, or reading.
            const Dot = ({ count, color }: { count: number; color: string }) =>
              count > 0 ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    fontSize: 11,
                    fontFamily: T.font,
                    fontWeight: 600,
                    color,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: color,
                    }}
                  />
                  {count}
                </span>
              ) : null;

            return (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  userSelect: "none",
                  marginLeft: 4,
                }}
              >
                {/* 1. Progress badge (Approved / Total) */}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 8px",
                    background: isAllDone ? "rgba(46, 125, 91, 0.06)" : "rgba(44, 46, 58, 0.04)",
                    border: `1px solid ${isAllDone ? "rgba(46, 125, 91, 0.15)" : T.borderLight}`,
                    borderRadius: 999,
                    color: isAllDone ? T.green : T.textSoft,
                    fontSize: 11,
                    fontFamily: T.font,
                    fontWeight: 600,
                  }}
                >
                  <Icon.Check size={10} color={isAllDone ? T.green : T.textMute} style={{ strokeWidth: 3 }} />
                  {/* Glance-only progress — just "✓ N/total", no "Xong"
                      word. The capsule is the TRIGGER; full per-state detail
                      (chờ duyệt / đang chấm) lives in the drawer it opens,
                      so repeating them here only made the pill long and
                      duplicated the drawer header. */}
                  <span>
                    {finalizedCount}/{total}
                  </span>
                </span>

                {/* Status indicators — show only when count > 0, so an
                    all-done batch stays just "✓ N/total".
                      • pending  (amber)  — static dot: nothing is moving
                      • grading  (indigo) — SPINNING refresh icon, matching
                        the drawer, because it's an in-progress state
                      • error    (red)    — warning icon, the one state that
                        needs the teacher to act */}
                <Dot count={awaitingReview} color={T.amber} />
                {generatingCount > 0 && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      fontSize: 11,
                      fontFamily: T.font,
                      fontWeight: 600,
                      color: T.accent,
                    }}
                  >
                    <Icon.RefreshCw
                      size={11}
                      color={T.accent}
                      style={{ animation: "spin 1.5s linear infinite" }}
                    />
                    {generatingCount}
                  </span>
                )}
                {failedCount > 0 && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      fontSize: 11,
                      fontFamily: T.font,
                      fontWeight: 600,
                      color: T.red,
                    }}
                  >
                    <Icon.AlertTriangle size={11} color={T.red} />
                    {failedCount}
                  </span>
                )}
              </div>
            );
          })()}
        </button>
      )}

      {/* 2. Slide-out Sidebar Drawer Manager (Image 2 style) */}
      {sidebarOpen && (
        <>
          {/* Backdrop overlay */}
          <div
            onClick={() => setSidebarOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(44, 46, 58, 0.15)",
              backdropFilter: "blur(2px)",
              zIndex: 1000,
              animation: "backdropFadeIn 0.2s ease-out",
            }}
          />

          {/* Sidebar Panel */}
          <div
            ref={sidebarRef}
            style={{
              position: "fixed",
              left: 0,
              top: 0,
              bottom: 0,
              width: 300,
              background: "#FFFDF8",
              borderRight: `1px solid ${T.border}`,
              boxShadow: "0 0 32px rgba(44, 46, 58, 0.15)",
              zIndex: 1001,
              display: "flex",
              flexDirection: "column",
              animation: "drawerSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Drawer header — brand on the left, × close on the right.
                At non-desktop breakpoints the AppHeader hides its brand
                so this is the sole wordmark; at desktop the drawer is
                triggered from the floating capsule and we keep just the
                title row (brand stays in the global header). */}
            {bp !== "desktop" ? (
              <div
                style={{
                  padding: "14px 12px 12px 16px",
                  borderBottom: `1px solid ${T.borderLight}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <MirrorLogo size={24} />
                    <span
                      style={{
                        fontFamily: T.display,
                        fontSize: 16,
                        fontWeight: 800,
                        color: T.accentDark,
                        letterSpacing: 0.5,
                      }}
                    >
                      MIRROR
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: T.textMute,
                      marginTop: 3,
                      fontFamily: T.font,
                    }}
                  >
                    Bàn chấm bài
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  onMouseEnter={() => setHoveredCloseId("close-sidebar")}
                  onMouseLeave={() => setHoveredCloseId(null)}
                  aria-label="Đóng menu"
                  title="Đóng menu"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    border: "none",
                    background:
                      hoveredCloseId === "close-sidebar"
                        ? "rgba(44, 46, 58, 0.06)"
                        : "transparent",
                    color: T.textSoft,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.15s ease",
                    flexShrink: 0,
                  }}
                >
                  <Icon.X size={16} />
                </button>
              </div>
            ) : null}
            {/* Tabs section header — eyebrow + add. */}
            <div
              style={{
                padding: "12px 12px 6px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: T.textMute,
                  fontFamily: `"Outfit", "Inter", system-ui, -apple-system, sans-serif`,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                {String(t.documentTabs ?? "Các bài làm đang mở")}
              </span>

              {/* Add tab button */}
              <button
                type="button"
                onClick={() => {
                  onAdd();
                }}
                onMouseEnter={() => setHoveredAdd(true)}
                onMouseLeave={() => setHoveredAdd(false)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: "none",
                  background: hoveredAdd ? "rgba(44, 46, 58, 0.05)" : "transparent",
                  color: T.text,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.15s ease",
                  flexShrink: 0,
                }}
                title={String(t.newEssay ?? "Thêm bài mới")}
              >
                <PlusIcon size={14} />
              </button>
            </div>

            {/* Batch progress section */}
            {tabs.length > 1 && (() => {
              const finalizedCount = tabs.filter((tt) => tt.finalized).length;
              const awaitingReview = tabs.filter(
                (tt) => tt.hasGrade && !tt.finalized,
              ).length;
              const generatingCount = tabs.filter((tt) => tt.phase === "generating").length;
              const failedCount = tabs.filter((tt) => tt.error).length;
              const total = tabs.length;
              const isAllDone = finalizedCount === total;

              return (
                <div
                  style={{
                    padding: "2px 16px 8px 16px",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 6,
                    borderBottom: `1px solid ${T.borderLight}`,
                    marginBottom: 8,
                  }}
                >
                  {/* 1. Progress badge (Approved / Total) */}
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "3px 8px",
                      background: isAllDone ? "rgba(46, 125, 91, 0.06)" : "rgba(44, 46, 58, 0.04)",
                      border: `1px solid ${isAllDone ? "rgba(46, 125, 91, 0.15)" : T.borderLight}`,
                      borderRadius: 999,
                      color: isAllDone ? T.green : T.textSoft,
                      fontSize: 11,
                      fontFamily: T.font,
                      fontWeight: 600,
                    }}
                  >
                    <Icon.Check size={10} color={isAllDone ? T.green : T.textMute} style={{ strokeWidth: 3 }} />
                    <span>
                      {finalizedCount}/{total} {String(t.done ?? "Xong")}
                    </span>
                  </span>

                  {/* 2. Awaiting review badge */}
                  {awaitingReview > 0 && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "3px 8px",
                        background: "rgba(192, 139, 48, 0.06)",
                        border: `1px solid rgba(192, 139, 48, 0.15)`,
                        borderRadius: 999,
                        color: T.amber,
                        fontSize: 11,
                        fontFamily: T.font,
                        fontWeight: 600,
                      }}
                    >
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: T.amber,
                        }}
                      />
                      <span>
                        {awaitingReview} chờ duyệt
                      </span>
                    </span>
                  )}

                  {/* 3. Generating badge */}
                  {generatingCount > 0 && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "3px 8px",
                        background: "rgba(59, 79, 138, 0.06)",
                        border: `1px solid rgba(59, 79, 138, 0.15)`,
                        borderRadius: 999,
                        color: T.accent,
                        fontSize: 11,
                        fontFamily: T.font,
                        fontWeight: 600,
                      }}
                    >
                      <Icon.RefreshCw
                        size={10}
                        color={T.accent}
                        style={{
                          animation: "spin 1.5s linear infinite",
                        }}
                      />
                      <span>
                        {generatingCount} đang chấm
                      </span>
                    </span>
                  )}

                  {/* 4. Failed badge */}
                  {failedCount > 0 && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "3px 8px",
                        background: "rgba(184, 66, 58, 0.06)",
                        border: `1px solid rgba(184, 66, 58, 0.15)`,
                        borderRadius: 999,
                        color: T.red,
                        fontSize: 11,
                        fontFamily: T.font,
                        fontWeight: 600,
                      }}
                    >
                      <Icon.AlertTriangle size={10} color={T.red} />
                      <span>
                        {failedCount} lỗi
                      </span>
                    </span>
                  )}
                </div>
              );
            })()}

            {/* List section */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {(() => {
                const batchCount = tabs.filter((t) => t.canRun && t.phase === "idle").length;
                if (tabs.length <= 1) return null;
                const isDisabled = batchCount === 0;

                return (
                  <div style={{ marginBottom: 10 }}>
                    <button
                      type="button"
                      disabled={isDisabled}
                      onClick={() => {
                        if (!isDisabled) {
                          window.dispatchEvent(new CustomEvent("hitl.startBatchGrading"));
                        }
                      }}
                      onMouseEnter={() => !isDisabled && setHoveredBatch(true)}
                      onMouseLeave={() => setHoveredBatch(false)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        width: "100%",
                        padding: "10px 16px",
                        background: isDisabled
                          ? "rgba(44, 46, 58, 0.04)"
                          : hoveredBatch
                            ? `linear-gradient(135deg, ${T.accentLight} 0%, ${T.accent} 100%)`
                            : `linear-gradient(135deg, ${T.accent} 0%, ${T.accentLight} 100%)`,
                        border: `1px solid ${isDisabled ? T.border : "transparent"}`,
                        borderRadius: 8,
                        color: isDisabled ? T.textMute : "#FFFDF8",
                        fontSize: 13,
                        fontWeight: 600,
                        fontFamily: `"Inter", "Outfit", sans-serif`,
                        cursor: isDisabled ? "not-allowed" : "pointer",
                        boxShadow: isDisabled ? "none" : "0 4px 14px rgba(59, 79, 138, 0.25)",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <Icon.Bot size={16} color={isDisabled ? T.textMute : "#FFFDF8"} />
                      <span>Chấm Hàng Loạt ({batchCount} bài)</span>
                    </button>
                    {isDisabled && (
                      <div
                        style={{
                          fontSize: 11,
                          color: T.textMute,
                          textAlign: "center",
                          marginTop: 6,
                          fontStyle: "italic",
                          lineHeight: 1.35,
                          padding: "0 4px",
                        }}
                      >
                        Vui lòng tải lên Đề bài + Bài làm cho các tab để kích hoạt.
                      </div>
                    )}
                  </div>
                );
              })()}
              {tabs.map((tab, i) => {
                const isActive = tab.id === activeId;
                const isHovered = hoveredTabId === tab.id;

                // Status icon — meaningful states for batch grading:
                //   • generating    — AI is running (amber spinner)
                //   • error         — pipeline failed (red AlertTriangle)
                //   • finalized     — teacher finished review (solid green check)
                //   • hasGrade only — AI done, awaiting teacher review (amber check)
                //   • idle          — nothing yet (neutral file)
                // Failure check sits BEFORE finalized/hasGrade because at
                // a Gemini failure, ``hasGrade`` stays false but ``error``
                // becomes truthy — we want the red icon to dominate over
                // any stale "in progress" state.
                let statusIcon;
                if (tab.phase === "generating") {
                  statusIcon = (
                    <Icon.RefreshCw
                      size={13}
                      color={T.amber}
                      style={{
                        animation: "spin 1.5s linear infinite",
                        flexShrink: 0,
                      }}
                    />
                  );
                } else if (tab.error) {
                  statusIcon = (
                    <Icon.AlertTriangle
                      size={13}
                      color={T.red}
                      style={{
                        flexShrink: 0,
                      }}
                    />
                  );
                } else if (tab.finalized) {
                  statusIcon = (
                    <Icon.Check
                      size={12}
                      color={T.green}
                      style={{
                        flexShrink: 0,
                        strokeWidth: 3.5,
                      }}
                    />
                  );
                } else if (tab.hasGrade) {
                  statusIcon = (
                    <Icon.Check
                      size={12}
                      color={T.amber}
                      style={{
                        flexShrink: 0,
                        strokeWidth: 2.5,
                      }}
                    />
                  );
                } else {
                  statusIcon = (
                    <Icon.FileText
                      size={13}
                      color={isActive ? T.accent : T.textMute}
                      style={{
                        flexShrink: 0,
                      }}
                    />
                  );
                }

                const displayName = tab.label || `${String(t.essayN ?? "Bài")} ${i + 1}`;

                return (
                  <div key={tab.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <div
                      onMouseEnter={() => setHoveredTabId(tab.id)}
                      onMouseLeave={() => setHoveredTabId(null)}
                      style={{
                        position: "relative",
                        display: "flex",
                        alignItems: "center",
                        borderRadius: 8,
                        background: isActive ? "rgba(59, 79, 138, 0.08)" : isHovered ? "rgba(44, 46, 58, 0.04)" : "transparent",
                        border: isActive ? `1px solid rgba(59, 79, 138, 0.15)` : "1px solid transparent",
                        transition: "all 0.15s ease",
                      }}
                    >
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(tab.id);
                        setSidebarOpen(false); // Close sidebar on selection to focus on work
                      }}
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 42px 10px 12px", // Extra right padding for option button
                        background: "transparent",
                        border: "none",
                        color: isActive ? T.accent : T.textSoft,
                        fontSize: 13,
                        fontWeight: isActive ? 600 : 500,
                        fontFamily: `"Inter", "Outfit", system-ui, -apple-system, sans-serif`,
                        textAlign: "left",
                        cursor: "pointer",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {statusIcon}
                      <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                        {displayName}
                      </span>
                    </button>

                    {/* Options button (three dots) */}
                    <div
                      className="tab-menu-container"
                      style={{
                        position: "absolute",
                        right: 8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        zIndex: 2,
                      }}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === tab.id ? null : tab.id);
                        }}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          border: "none",
                          background: menuOpenId === tab.id ? "rgba(44, 46, 58, 0.08)" : "transparent",
                          color: isActive ? T.accent : T.textMute,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: isActive || isHovered || menuOpenId === tab.id ? 1 : 0,
                          transition: "all 0.15s ease",
                        }}
                        title="Tùy chọn"
                      >
                        <MoreVerticalIcon size={14} />
                      </button>

                      {/* Dropdown Options menu */}
                      {menuOpenId === tab.id && (
                        <div
                          style={{
                            position: "absolute",
                            right: 0,
                            top: 26,
                            background: "#FFFDF8",
                            border: `1px solid ${T.border}`,
                            borderRadius: 8,
                            boxShadow: "0 8px 24px -4px rgba(44, 46, 58, 0.12)",
                            padding: 4,
                            minWidth: 110,
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                            zIndex: 100,
                          }}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenId(null);
                              handleRename(tab, i);
                            }}
                            style={{
                              padding: "6px 8px",
                              fontSize: 12,
                              color: T.text,
                              background: "transparent",
                              border: "none",
                              textAlign: "left",
                              borderRadius: 4,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              fontFamily: `"Inter", "Outfit", sans-serif`,
                              fontWeight: 500,
                              width: "100%",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(44, 46, 58, 0.04)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            <Icon.Edit size={12} color={T.textSoft} />
                            {String(t.rename ?? "Đổi tên")}
                          </button>
                          {tabs.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpenId(null);
                                onClose(tab.id);
                              }}
                              style={{
                                padding: "6px 8px",
                                fontSize: 12,
                                color: T.red,
                                background: "transparent",
                                border: "none",
                                textAlign: "left",
                                borderRadius: 4,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                fontFamily: `"Inter", "Outfit", sans-serif`,
                                fontWeight: 500,
                                width: "100%",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(184, 66, 58, 0.05)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            >
                              <Icon.X size={12} color={T.red} />
                              {String(t.closeTab ?? "Đóng thẻ")}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    </div>

                    {/* Hierarchical Questions Outline (Option A) */}
                    {isActive && tab.questions && tab.questions.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          paddingLeft: 34,
                          paddingTop: 4,
                          paddingBottom: 4,
                          gap: 2,
                          animation: "fadeUp 0.2s ease-out",
                        }}
                      >
                        {tab.questions.map((q) => (
                          <button
                            key={q.num}
                            type="button"
                            onClick={() => {
                              const el = document.querySelector(`[data-cau-anchor="${q.num}"]`);
                              if (el instanceof HTMLElement) {
                                el.scrollIntoView({ behavior: "smooth", block: "start" });
                              }
                              window.dispatchEvent(
                                new CustomEvent("hitl.jumpToQuestion", { detail: { qNum: q.num } })
                              );
                              setSidebarOpen(false); // Close drawer to focus on selected question
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "6px 12px 6px 8px",
                              background: "transparent",
                              border: "none",
                              borderLeft: "1.5px solid rgba(59, 79, 138, 0.15)",
                              color: T.textSoft,
                              fontSize: 12,
                              fontWeight: 500,
                              fontFamily: `"Inter", "Outfit", sans-serif`,
                              textAlign: "left",
                              cursor: "pointer",
                              transition: "all 0.12s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = T.accent;
                              e.currentTarget.style.borderLeftColor = T.accent;
                              e.currentTarget.style.background = "rgba(59, 79, 138, 0.03)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = T.textSoft;
                              e.currentTarget.style.borderLeftColor = "rgba(59, 79, 138, 0.15)";
                              e.currentTarget.style.background = "transparent";
                            }}
                          >
                            <span>{q.label}</span>
                            <span style={{ fontSize: 11, color: T.textMute, fontFamily: T.mono }}>
                              {q.score.toFixed(1)}đ
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer section (Reset / Clear All) */}
            <div
              style={{
                padding: 16,
                borderTop: `1px solid ${T.borderLight}`,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ các bài làm và bắt đầu lại?")) {
                    onClear();
                    setSidebarOpen(false);
                  }
                }}
                onMouseEnter={() => setHoveredClear(true)}
                onMouseLeave={() => setHoveredClear(false)}
                style={{
                  width: "100%",
                  padding: "8px 16px",
                  background: hoveredClear ? "rgba(184, 66, 58, 0.06)" : "transparent",
                  border: `1px solid ${hoveredClear ? T.red : T.border}`,
                  borderRadius: 8,
                  color: hoveredClear ? T.red : T.textSoft,
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: `"Inter", "Outfit", system-ui, -apple-system, sans-serif`,
                  transition: "all 0.15s ease",
                  cursor: "pointer",
                }}
              >
                {String(t.reset ?? "Xóa Tất Cả")}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

