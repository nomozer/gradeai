/**
 * App.tsx — MIRROR root composer.
 *
 * Two top-level pages share the same SPA bundle, gated by the URL hash:
 *   • ``""`` (default)  → grading workspace (header + tabs)
 *   • ``"#memory"``     → HITL Memory page (standalone)
 *
 * The header's "Bộ nhớ HITL" button opens ``#memory`` in a NEW browser
 * tab via ``window.open``, so the workspace tab keeps its full state
 * (tabs, uploads, in-flight grades) untouched in the background — same
 * mental model as middle-clicking a link in Chrome.
 *
 * Subject is no longer picked here. The old left-Sidebar subject selector
 * is replaced by the per-tab `SubjectChip` inside `StepUpload`, which auto-
 * detects the subject from the uploaded exam PDF via /api/detect-subject
 * and lets the teacher override. Subject is therefore per-tab state owned
 * by each `EssayWorkspace`. Class label survives as a global header pill
 * because it's purely display metadata (not used by any grading prompt).
 */

import { useCallback, useEffect, useState } from "react";
import { vi as t } from "./i18n/vi";
import { T } from "./theme/tokens";
import { GlobalStyles } from "./theme/GlobalStyles";
import { useTabs } from "./hooks/useTabs";
import { useHeartbeat } from "./hooks/useHeartbeat";
import { AppHeader } from "./components/layout/AppHeader";
import { TabBar } from "./components/layout/TabBar";
import { EssayWorkspace } from "./features/workspace/EssayWorkspace";
import { MemoryPanel } from "./features/memory/MemoryPanel";
import { HelpModal } from "./features/help/HelpModal";
import { GradeHistoryDropdown } from "./features/history/GradeHistoryDropdown";

const MEMORY_HASH = "#memory";

function isMemoryRoute(): boolean {
  return typeof window !== "undefined" && window.location.hash === MEMORY_HASH;
}

export default function App() {
  // Decide which page to mount ONCE — the workspace tab never navigates
  // to memory in-place (memory always opens in a new browser tab), so a
  // single render-time check is enough and skips loading useTabs / file
  // state on the memory page.
  const [memoryRoute] = useState<boolean>(isMemoryRoute);

  return memoryRoute ? <MemoryPage /> : <WorkspacePage />;
}

// ---------------------------------------------------------------------------
// Memory page — standalone, no tab bar / no heartbeat fight.
// ---------------------------------------------------------------------------

function MemoryPage() {
  // Heartbeat from this tab too so the backend doesn't shut down when the
  // workspace tab is closed but the memory tab remains open.
  useHeartbeat();

  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <GlobalStyles />
      <MemoryPanel />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace page — header, tab bar, essay workspaces.
// ---------------------------------------------------------------------------

function WorkspacePage() {
  const [helpOpen, setHelpOpen] = useState(false);
  // History dropdown — open state + the trigger button's bounding rect so
  // the popover anchors under it. AppHeader hands us the rect because the
  // button ref lives over there.
  const [historyAnchor, setHistoryAnchor] = useState<DOMRect | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const toggleHistory = useCallback((rect: DOMRect | null) => {
    setHistoryAnchor(rect);
    setHistoryOpen((v) => !v);
  }, []);
  const closeHistory = useCallback(() => setHistoryOpen(false), []);

  // "Bộ nhớ HITL" header button: open the memory page in a new browser tab
  // so the workspace tab (uploaded files, in-flight grades, scroll
  // position) stays exactly as the user left it.
  const openMemoryTab = useCallback(() => {
    const url = window.location.origin + window.location.pathname + MEMORY_HASH;
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const { tabs, activeId, addTab, closeTab, clearAll, setActive, updateMeta } = useTabs();

  // Pending queue of tab IDs waiting to be graded
  const [pendingQueue, setPendingQueue] = useState<string[]>([]);

  // Maximum number of parallel grading calls
  const MAX_CONCURRENCY = 2;

  // Listen for the custom "hitl.startBatchGrading" event from TabBar
  useEffect(() => {
    const handleStartBatch = () => {
      // Find all tabs that can run and are currently idle (not running, not graded yet)
      const readyTabIds = tabs
        .filter((tab) => tab.canRun && tab.phase === "idle" && !tab.hasGrade)
        .map((tab) => tab.id);

      if (readyTabIds.length > 0) {
        setPendingQueue(readyTabIds);
      }
    };

    window.addEventListener("hitl.startBatchGrading", handleStartBatch);
    return () => {
      window.removeEventListener("hitl.startBatchGrading", handleStartBatch);
    };
  }, [tabs]);

  // Queue worker: monitors the running tasks and feeds more tasks from pendingQueue
  useEffect(() => {
    if (pendingQueue.length === 0) return;

    // Count how many tabs are currently generating
    const currentRunning = tabs.filter((t) => t.phase === "generating").length;
    const slotsAvailable = MAX_CONCURRENCY - currentRunning;

    if (slotsAvailable > 0) {
      const nextBatchIds = pendingQueue.slice(0, slotsAvailable);

      // Update pending queue
      setPendingQueue((prev) => prev.slice(nextBatchIds.length));

      // Activate next batch
      nextBatchIds.forEach((id) => {
        updateMeta(id, { phase: "generating" });
      });
    }
  }, [tabs, pendingQueue, updateMeta]);

  useHeartbeat();

  const completedCount = tabs.filter((tab) => tab.hasGrade).length;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <GlobalStyles />

      <AppHeader
        brand={String(t.title)}
        onOpenMemory={openMemoryTab}
        onOpenHelp={openHelp}
        memoryActive={false}
        onToggleHistory={toggleHistory}
        historyActive={historyOpen}
        onOpenSidebar={() => window.dispatchEvent(new CustomEvent("hitl.openSidebar"))}
      />

      <TabBar
        tabs={tabs}
        activeId={activeId}
        onSelect={setActive}
        onAdd={addTab}
        onClose={closeTab}
        onClear={clearAll}
        onRename={(id, label) => updateMeta(id, { label })}
        completedCount={completedCount}
        t={t}
      />

      <main className="workspace-main" style={{ paddingTop: 12 }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          const shouldMount = isActive || tab.hasGrade || tab.phase === "generating";
          if (!shouldMount) return null;

          return (
            <div key={tab.id} style={{ display: isActive ? "block" : "none" }}>
              <EssayWorkspace
                active={isActive}
                tab={tab}
                onAddTab={addTab}
                onMeta={(meta) => updateMeta(tab.id, meta)}
              />
            </div>
          );
        })}
      </main>

      {helpOpen && <HelpModal onClose={closeHelp} />}

      <GradeHistoryDropdown
        open={historyOpen}
        onClose={closeHistory}
        anchorRect={historyAnchor}
      />
    </div>
  );
}
