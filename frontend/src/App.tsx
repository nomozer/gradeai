/**
 * App.tsx — MIRROR root composer.
 *
 * Wires hooks + layout shell (sidebar, header, tab bar) + per-essay
 * workspaces. Business logic lives in hooks/ and features/ — this file
 * only composes.
 */

import { useCallback, useEffect, useState } from "react";
import { i18n } from "./i18n";
import { GlobalStyles } from "./theme/GlobalStyles";
import { useLang } from "./hooks/useLang";
import { useTabs } from "./hooks/useTabs";
import { useHeartbeat } from "./hooks/useHeartbeat";
import { useIsMobile } from "./hooks/useIsMobile";
import { Sidebar } from "./components/layout/Sidebar";
import { AppHeader } from "./components/layout/AppHeader";
import { TabBar } from "./components/layout/TabBar";
import { EssayWorkspace } from "./features/workspace/EssayWorkspace";

export default function App() {
  const { lang, toggle: toggleLang } = useLang();
  const t = i18n[lang];
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);

  // Auto-close the drawer on viewport upgrade so the sticky sidebar
  // doesn't double-render on top of itself when crossing the breakpoint.
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  // ESC closes the drawer for keyboard users.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, closeDrawer]);

  const { tabs, activeId, addTab, closeTab, clearAll, setActive, updateMeta } = useTabs();

  // Hydrate subject from localStorage so a returning teacher does not have
  // to re-pick. First-time users start with "" (no selection) and the
  // workspace renders a waiting state until they choose — guarantees every
  // saved lesson is stamped with the correct subject (cs/math).
  const [selectedSubject, setSelectedSubjectState] = useState<string>(() => {
    try {
      return localStorage.getItem("hitl.selectedSubject") || "";
    } catch {
      return "";
    }
  });
  const setSelectedSubject = useCallback((value: string) => {
    setSelectedSubjectState(value);
    try {
      localStorage.setItem("hitl.selectedSubject", value);
    } catch {
      // localStorage may be disabled in private mode — best-effort persist.
    }
  }, []);

  const [selectedClass, setSelectedClass] = useState<string>("Lớp 10");

  useHeartbeat();

  const completedCount = tabs.filter((tab) => tab.hasGrade).length;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "260px 1fr",
      }}
    >
      <GlobalStyles />

      {/* Desktop: in-grid sticky sidebar. Mobile: portal-style drawer
          rendered outside the grid so it can overlay the workspace. */}
      {!isMobile && (
        <Sidebar
          t={t}
          selectedSubject={selectedSubject}
          onSubjectChange={setSelectedSubject}
          selectedClass={selectedClass}
          onClassChange={setSelectedClass}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <AppHeader
          selectedSubject={selectedSubject}
          selectedClass={selectedClass}
          onToggleLang={toggleLang}
          onOpenDrawer={isMobile ? openDrawer : undefined}
          t={t}
        />

        <TabBar
          tabs={tabs}
          activeId={activeId}
          onSelect={setActive}
          onAdd={addTab}
          onClose={closeTab}
          onClear={clearAll}
          completedCount={completedCount}
          t={t}
        />

        <main style={{ paddingTop: 12 }}>
          {tabs.map((tab) => (
            <EssayWorkspace
              key={tab.id}
              active={tab.id === activeId}
              lang={lang}
              selectedSubject={selectedSubject}
              selectedClass={selectedClass}
              onMeta={(meta) => updateMeta(tab.id, meta)}
            />
          ))}
        </main>
      </div>

      {/* Mobile drawer + backdrop. Mounted outside the grid so the drawer
          overlays the workspace without affecting layout flow. */}
      {isMobile && drawerOpen && (
        <Sidebar
          t={t}
          selectedSubject={selectedSubject}
          onSubjectChange={(value) => {
            setSelectedSubject(value);
            // Close on subject pick — the teacher's done with the drawer.
            closeDrawer();
          }}
          selectedClass={selectedClass}
          onClassChange={setSelectedClass}
          drawer
          onClose={closeDrawer}
        />
      )}
    </div>
  );
}
