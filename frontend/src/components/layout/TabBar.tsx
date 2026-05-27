import { useState, useEffect, useRef } from "react";
import { T } from "../../theme/tokens";
import type { I18nStrings, Tab } from "../../types";
import { Icon } from "../ui/Icon";
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
          title={`Đang mở: ${activeLabel}`}
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
                  <span
                    style={{
                      fontFamily: T.display,
                      fontSize: 18,
                      fontWeight: 700,
                      color: T.accentDark,
                      letterSpacing: 0,
                      lineHeight: 1,
                    }}
                  >
                    MIRROR
                  </span>
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
            {/* Tabs section header — eyebrow + add. The ← back button
                that used to live here was a duplicate of the drawer's
                top-right × so we dropped it. */}
            <div
              style={{
                padding: "12px 12px 4px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: T.text,
                    fontFamily: `"Outfit", "Inter", system-ui, -apple-system, sans-serif`,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {String(t.documentTabs ?? "Các bài làm đang mở")}
                </span>
              </div>

              {/* Add tab button */}
              <button
                type="button"
                onClick={() => {
                  onAdd();
                  // Optional: do not auto-close sidebar so they can add multiple tabs
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
                }}
                title={String(t.newEssay ?? "Thêm bài mới")}
              >
                <PlusIcon size={16} />
              </button>
            </div>

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
                if (batchCount === 0) return null;
                return (
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent("hitl.startBatchGrading"));
                    }}
                    onMouseEnter={() => setHoveredBatch(true)}
                    onMouseLeave={() => setHoveredBatch(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      width: "100%",
                      padding: "10px 16px",
                      background: hoveredBatch
                        ? `linear-gradient(135deg, ${T.accentLight} 0%, ${T.accent} 100%)`
                        : `linear-gradient(135deg, ${T.accent} 0%, ${T.accentLight} 100%)`,
                      border: "none",
                      borderRadius: 8,
                      color: "#FFFDF8",
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: `"Inter", "Outfit", sans-serif`,
                      cursor: "pointer",
                      boxShadow: "0 4px 14px rgba(59, 79, 138, 0.25)",
                      transition: "all 0.2s ease",
                      marginBottom: 10,
                    }}
                  >
                    <Icon.Bot size={16} color="#FFFDF8" />
                    <span>Chấm Hàng Loạt ({batchCount} bài)</span>
                  </button>
                );
              })()}
              {tabs.map((tab, i) => {
                const isActive = tab.id === activeId;
                const isHovered = hoveredTabId === tab.id;

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
                } else if (tab.hasGrade) {
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

