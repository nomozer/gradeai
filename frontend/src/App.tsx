/**
 * App.tsx — MIRROR root composer.
 *
 * Wires hooks + layout shell (sidebar, header, tab bar) + per-essay
 * workspaces. Business logic lives in hooks/ and features/ — this file
 * only composes.
 */

import { useCallback, useEffect, useState } from "react";
import { vi as t } from "./i18n/vi";
import { T } from "./theme/tokens";
import { GlobalStyles } from "./theme/GlobalStyles";
import { useTabs } from "./hooks/useTabs";
import { useHeartbeat } from "./hooks/useHeartbeat";
import { useIsMobile } from "./hooks/useIsMobile";
import { Sidebar } from "./components/layout/Sidebar";
import { AppHeader } from "./components/layout/AppHeader";
import { TabBar } from "./components/layout/TabBar";
import { EssayWorkspace } from "./features/workspace/EssayWorkspace";
import { MemoryPanel } from "./features/memory/MemoryPanel";
import { HelpModal } from "./features/help/HelpModal";

type AppView = "workspace" | "memory";

export default function App() {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [view, setView] = useState<AppView>("workspace");

  const [helpOpen, setHelpOpen] = useState(false);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const openMemory = useCallback(() => {
    setView("memory");
    setDrawerOpen(false);
  }, []);
  const closeMemory = useCallback(() => setView("workspace"), []);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

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

  // Memory view — render as a separate full-page layout (no sidebar or tab bar).
  if (view === "memory") {
    return (
      <div style={{ minHeight: "100vh", background: T.bg }}>
        <GlobalStyles />
        <MemoryPanel onClose={closeMemory} />
        {helpOpen && <HelpModal onClose={closeHelp} />}
      </div>
    );
  }

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
          onOpenDrawer={isMobile ? openDrawer : undefined}
          onOpenMemory={openMemory}
          onOpenHelp={openHelp}
          memoryActive={view === "memory"}
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

      {helpOpen && <HelpModal onClose={closeHelp} />}
    </div>
  );
}
