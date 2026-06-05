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

import { useCallback, useEffect, useRef, useState } from "react";
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
import { Toast } from "./components/ui/Toast";
import { MobileHint } from "./components/ui/MobileHint";
import type { GradeHistoryEntry } from "./types";

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

  // Transient "đã lưu, sang bài kế" toast. Set only when a chốt triggers an
  // auto-advance — at that moment the just-saved paper's locked summary
  // scrolls off-screen, so the toast is the sole confirmation the save
  // landed. When there's NO next paper we stay put and the in-place locked
  // summary (StepReview) is confirmation enough, so no toast there.
  const [toast, setToast] = useState<string | null>(null);

  // Maximum number of parallel grading calls. 3 is the sweet spot for
  // batch grading a class of 30+ papers without tripping Gemini free-tier
  // rate limits (60 req/min — 3 parallel × ~20s/grade = 9 req/min steady
  // state, safely under the cap). Bump higher only after confirming the
  // user is on a paid Gemini tier with higher quota.
  const MAX_CONCURRENCY = 3;

  // "Bài đã chấm" header dropdown: opens history entries in a BRAND NEW
  // tab so an accidental click never overwrites the teacher's in-progress
  // work (e.g. a 20-paper batch sitting at Step 1). The new tab carries
  // ``initialHistoryEntry`` + ``initialHistoryStep``; its EssayWorkspace
  // consumes them on mount via ``pipeline.loadHistoryEntry``. ``addTab``
  // (reducer ADD) already promotes the new tab to active.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail =
        (e as CustomEvent<{ entry: GradeHistoryEntry; step?: 3 | 4 | 5 }>).detail;
      const entry = detail?.entry;
      if (!entry || typeof entry.response?.code !== "string") return;
      const step = detail?.step ?? 3;
      // Dedup by entry.id — clicking the same row twice switches to the
      // existing tab instead of spawning a duplicate (same mental model
      // as Chrome's bookmark behavior). EssayWorkspace deliberately
      // keeps ``initialHistoryEntry`` populated after consume so this
      // lookup keeps working for the lifetime of the tab.
      const existing = tabs.find(
        (t) => t.initialHistoryEntry?.id === entry.id,
      );
      if (existing) {
        setActive(existing.id);
        return;
      }
      // Label from the entry's task descriptor (e.g. "Toán · ĐỀ HÌNH").
      // Falls back to "Đã chấm" if the entry has no task string so the
      // tab never renders untitled.
      const label = (entry.task || "Đã chấm").slice(0, 30);
      addTab({ label, initialHistoryEntry: entry, initialHistoryStep: step });
    };
    window.addEventListener("hitl.openHistoryEntry", handler);
    return () => window.removeEventListener("hitl.openHistoryEntry", handler);
  }, [addTab, tabs, setActive]);

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

  // Auto-advance — two triggers, both designed to keep the teacher
  // looking at the right tab without having to open ☰ drawer manually.
  //
  // (1) After Step 5 finalize: when the active tab's ``finalized`` flag
  //     flips to true (set by EssayWorkspace on a successful /api/finalize-
  //     grade), jump to the next ``hasGrade && !finalized`` tab. This is
  //     what makes "Lưu & sang bài kế" live up to its label.
  //
  // (2) When a tab finishes AI grading while the teacher is "idle"
  //     (active tab still at step 1 upload or step 2 generating):
  //     auto-jump to the newly-graded tab so the teacher can start
  //     review. WITHOUT this guard, if the teacher's active tab is
  //     mid-review at step 3-4-5, the effect does NOTHING — we don't
  //     yank them away from work they're doing.
  //
  // Both triggers use the same ref-diff pattern: track the previous set
  // of (finalized | graded) IDs, fire only on the rising edge. Without
  // the ref, the effect would re-trigger on every parent re-render and
  // could pull the teacher around against their will.
  const prevFinalizedRef = useRef<Set<string>>(new Set());
  const prevHasGradeRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // ── Trigger 1: finalized advance ─────────────────────────────────
    const currentFinalized = new Set(
      tabs.filter((tab) => tab.finalized).map((tab) => tab.id),
    );
    const newlyFinalized = [...currentFinalized].filter(
      (id) => !prevFinalizedRef.current.has(id),
    );
    prevFinalizedRef.current = currentFinalized;

    // ── Trigger 2: graded-while-idle advance ─────────────────────────
    const currentHasGrade = new Set(
      tabs.filter((tab) => tab.hasGrade).map((tab) => tab.id),
    );
    const newlyGraded = [...currentHasGrade].filter(
      (id) => !prevHasGradeRef.current.has(id),
    );
    prevHasGradeRef.current = currentHasGrade;

    // Pick the next pending tab in declaration order — graders typically
    // grade left-to-right, so this matches "next paper in the stack".
    const pickNextPending = () =>
      tabs.find(
        (tab) => tab.id !== activeId && tab.hasGrade && !tab.finalized,
      );

    if (newlyFinalized.includes(activeId)) {
      const next = pickNextPending();
      if (next) {
        // Name the paper just saved (its tab label is the student / bài làm
        // identifier) so the toast confirms WHICH paper landed before we
        // pull the teacher to the next one.
        const justSaved = tabs.find((tab) => tab.id === activeId);
        const name = (justSaved?.label || "").trim();
        setToast(
          name
            ? `Đã chấm xong bài của ${name} — chuyển tới bài kế tiếp`
            : "Đã lưu — chuyển tới bài kế tiếp",
        );
        setActive(next.id);
      }
      return;
    }

    // Only auto-jump on grading-complete if teacher isn't busy reviewing.
    // ``step >= 3`` means the active tab is in review / regrade / done
    // (i.e. the teacher is actively looking at AI output) — never yank
    // them away from that. Step 1 (upload waiting) or step 2 (AI loading)
    // means they're idle, safe to jump.
    if (newlyGraded.length > 0) {
      const active = tabs.find((tab) => tab.id === activeId);
      const teacherIdle = !active || (active.step ?? 1) < 3;
      if (teacherIdle) {
        // Prefer one of the *newly* graded tabs over any older pending —
        // matches the teacher's mental model "AI just finished one, take
        // me there". Falls back to any pending tab if needed.
        const justGraded = tabs.find(
          (tab) =>
            tab.id !== activeId &&
            newlyGraded.includes(tab.id) &&
            !tab.finalized,
        );
        const next = justGraded ?? pickNextPending();
        if (next) setActive(next.id);
      }
    }
  }, [tabs, activeId, setActive]);

  // ── Synchronize shared fields (Task PDF, Answer Key, Subject, Max Template) across all tabs ──
  useEffect(() => {
    const activeTab = tabs.find((t) => t.id === activeId);
    if (!activeTab) return;

    const {
      initialTaskFile,
      initialAnswerKeyFile,
      initialSubject,
      maxPointsTemplate,
    } = activeTab;

    tabs.forEach((t) => {
      if (t.id === activeId) return;
      if (t.finalized) return; // Don't modify finalized tabs

      const hasNewTask = initialTaskFile && t.initialTaskFile !== initialTaskFile;
      const hasNewAnswerKey = initialAnswerKeyFile && t.initialAnswerKeyFile !== initialAnswerKeyFile;
      const hasNewSubject = initialSubject && t.initialSubject !== initialSubject;
      // Max-points template only propagates between tabs in the SAME
      // batch — i.e. tabs that share an ``initialTaskFile`` with the
      // active tab. Otherwise a math-paper template would leak into an
      // unrelated chem-paper tab. Latest active-tab edit wins; teacher's
      // mental model is "I just decided the scheme, apply to the rest".
      const sameBatch =
        !!activeTab.initialTaskFile &&
        t.initialTaskFile === activeTab.initialTaskFile;
      const hasNewMaxTemplate =
        sameBatch &&
        maxPointsTemplate &&
        t.maxPointsTemplate !== maxPointsTemplate;

      if (hasNewTask || hasNewAnswerKey || hasNewSubject || hasNewMaxTemplate) {
        const nextTask = hasNewTask ? initialTaskFile : t.initialTaskFile;
        const nextSubject = hasNewSubject ? initialSubject : t.initialSubject;
        // Background tabs can run if they have an essay + task + subject!
        const canRunVal = !!nextTask && !!nextSubject && (!!t.initialEssayFile || !!t.canRun);

        updateMeta(t.id, {
          initialTaskFile: nextTask,
          initialAnswerKeyFile: hasNewAnswerKey ? initialAnswerKeyFile : t.initialAnswerKeyFile,
          initialSubject: nextSubject,
          maxPointsTemplate: hasNewMaxTemplate
            ? maxPointsTemplate
            : t.maxPointsTemplate,
          canRun: canRunVal,
        });
      }
    });
  }, [tabs, activeId, updateMeta]);

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
      <MobileHint />

      <AppHeader
        brand={String(t.title)}
        onOpenMemory={openMemoryTab}
        onOpenHelp={openHelp}
        memoryActive={false}
        onToggleHistory={toggleHistory}
        historyActive={historyOpen}
        onOpenSidebar={() => window.dispatchEvent(new CustomEvent("hitl.openSidebar"))}
        tabs={tabs}
        activeId={activeId}
        onSelectTab={setActive}
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

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
