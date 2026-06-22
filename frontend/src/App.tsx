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

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { vi as t } from "./i18n/vi";
import { T } from "./theme/tokens";
import { GlobalStyles } from "./theme/GlobalStyles";
import { useTabs } from "./hooks/useTabs";
import { useHeartbeat } from "./hooks/useHeartbeat";
import { AppHeader } from "./components/layout/AppHeader";
import { TabBar } from "./components/layout/TabBar";
import { EssayWorkspace } from "./features/workspace/EssayWorkspace";
import { MemoryPanel } from "./features/memory/MemoryPanel";
import { ClassPage } from "./features/classes/ClassPage";
import { HelpModal } from "./features/help/HelpModal";
import { GradeHistoryDropdown } from "./features/history/GradeHistoryDropdown";
import { Toast } from "./components/ui/Toast";
import { MobileHint } from "./components/ui/MobileHint";
import { LoginPage } from "./features/auth/LoginPage";
import { AdminDashboard } from "./features/admin/AdminDashboard";
import { getToken, getUser, clearSession, isAdmin, AUTH_REQUIRED_EVENT } from "./api/session";
import { logout as logoutApi } from "./api/authApi";
import { openInNewTab } from "./lib/openInNewTab";
import type { GradeHistoryEntry } from "./types";

const MEMORY_HASH = "#memory";
const GRADE_HASH = "#grade";
const CLASS_HASH = "#class";

type Route = "workspace" | "memory" | "grade" | "class";

function detectRoute(): Route {
  if (typeof window === "undefined") return "workspace";
  // The grade route can carry a query (#grade?cls=&sid=&name=) when opened
  // from a class roster, so match the base hash, not the whole string.
  const hash = window.location.hash.split("?")[0];
  if (hash === MEMORY_HASH) return "memory";
  if (hash === GRADE_HASH) return "grade";
  if (hash === CLASS_HASH) return "class";
  return "workspace";
}

export default function App() {
  // Decide which page to mount ONCE — the memory sub-page always opens in a
  // new browser tab, so a single render-time check is enough.
  const [route] = useState<Route>(detectRoute);

  return (
    <AuthGate>
      <RoleRouter route={route} />
    </AuthGate>
  );
}

// ---------------------------------------------------------------------------
// Role-based landing. Admins land on the management dashboard by default but
// CAN open the grading workspace via the explicit ``#grade`` route (opened in
// a new tab from the dashboard); teachers go straight to grading. ``#memory``
// is the shared lesson-corpus sub-window.
// ---------------------------------------------------------------------------

function RoleRouter({ route }: { route: Route }) {
  if (route === "memory") return <MemoryPage />;
  if (route === "class") return <ClassPage />;
  if (route === "grade") return <WorkspacePage />; // admin opened the grading desk
  if (isAdmin()) return <AdminDashboard />;
  return <WorkspacePage />;
}

// ---------------------------------------------------------------------------
// Auth gate — login wall in front of every page. Flips back to login on any
// 401 (session expired / revoked), broadcast via AUTH_REQUIRED_EVENT.
// ---------------------------------------------------------------------------

function AuthGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean>(() => !!getToken());
  useEffect(() => {
    const onAuthRequired = () => setAuthed(false);
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
  }, []);

  if (!authed) return <LoginPage onAuthed={() => setAuthed(true)} />;
  return <>{children}</>;
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
    openInNewTab(window.location.origin + window.location.pathname + MEMORY_HASH);
  }, []);

  // "Lớp học" header item: open the class-management page in a new browser
  // tab (same idiom as memory) so the grading desk here stays untouched.
  const openClassesTab = useCallback(() => {
    openInNewTab(window.location.origin + window.location.pathname + CLASS_HASH);
  }, []);

  // Admin-only: jump back to the management dashboard (base URL with no hash ⇒
  // admins land on AdminDashboard). New tab, same idiom as memory, so the
  // in-progress grading tab here is preserved.
  const openAdminTab = useCallback(() => {
    openInNewTab(window.location.origin + window.location.pathname);
  }, []);

  // Logout — revoke server-side, drop the session, hard-reload so no other
  // teacher's in-memory tab state can bleed into the next login on this
  // browser.
  const handleLogout = useCallback(async () => {
    try {
      await logoutApi();
    } catch {
      /* revoke is best-effort; clearing the local session is what matters */
    }
    clearSession();
    window.location.reload();
  }, []);

  const { tabs, activeId, addTab, closeTab, clearAll, setActive, updateMeta } = useTabs();

  // When opened from a class roster ("Chấm bài"), the URL carries
  // #grade?cls=&sid=&name= — stamp the initial tab with that student so the
  // finalize step can push the per-câu scores back into the class gradebook.
  // Runs once (ref-guarded); then strips the query so a refresh won't re-stamp.
  const classLinkApplied = useRef(false);
  useEffect(() => {
    if (classLinkApplied.current) return;
    const q = window.location.hash.split("?")[1];
    if (!q) return;
    const params = new URLSearchParams(q);
    const sid = params.get("sid");
    if (!sid) return;
    classLinkApplied.current = true;
    const cls = params.get("cls");
    const name = params.get("name");
    updateMeta(activeId, {
      studentId: Number(sid),
      classId: cls ? Number(cls) : null,
      ...(name ? { label: name } : {}),
    });
    window.history.replaceState(null, "", window.location.pathname + GRADE_HASH);
  }, [activeId, updateMeta]);

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

  // Auto-advance keeps the teacher on the right tab without opening the ☰
  // drawer. Two paths:
  //
  // (1) Chốt advance — jump to the next ``hasGrade && !finalized`` paper after
  //     a finalize. EVENT-driven (the hitl.finalizeAdvance listener below),
  //     fired by EssayWorkspace on a successful /api/finalize-grade — NOT a
  //     ``finalized`` flag flip. Re-opening a graded paper now KEEPS it
  //     finalized (so it stays in "Xong"), so a rising-edge trigger would miss
  //     a re-chốt entirely; the action event always fires.
  //
  // (2) Graded-while-idle advance (this effect) — when a tab finishes AI
  //     grading while the teacher is idle (active tab still at step 1 upload or
  //     step 2 generating), jump to it so they can start review. The
  //     ``step < 3`` guard means we never yank them out of a review in
  //     progress. Rising-edge via prevHasGradeRef so it fires once per tab.
  const prevHasGradeRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentHasGrade = new Set(
      tabs.filter((tab) => tab.hasGrade).map((tab) => tab.id),
    );
    const newlyGraded = [...currentHasGrade].filter(
      (id) => !prevHasGradeRef.current.has(id),
    );
    prevHasGradeRef.current = currentHasGrade;

    if (newlyGraded.length > 0) {
      const active = tabs.find((tab) => tab.id === activeId);
      const teacherIdle = !active || (active.step ?? 1) < 3;
      if (teacherIdle) {
        // Prefer a *newly* graded tab ("AI just finished one, take me there");
        // fall back to any pending tab in declaration order.
        const justGraded = tabs.find(
          (tab) =>
            tab.id !== activeId &&
            newlyGraded.includes(tab.id) &&
            !tab.finalized,
        );
        const next =
          justGraded ??
          tabs.find(
            (tab) => tab.id !== activeId && tab.hasGrade && !tab.finalized,
          );
        if (next) setActive(next.id);
      }
    }
  }, [tabs, activeId, setActive]);

  // Chốt advance (path 1 above): fire on the finalize ACTION, so it works even
  // when the paper was already finalized (re-chốt after re-opening). Mirrors
  // the "Lưu nháp" advance below.
  useEffect(() => {
    const onFinalizeAdvance = (e: Event) => {
      const fromId = (e as CustomEvent<{ tabId: string }>).detail?.tabId;
      const from = tabs.find((t) => t.id === fromId);
      const next = tabs.find(
        (t) => t.id !== fromId && t.hasGrade && !t.finalized,
      );
      if (next) {
        // Name the paper just saved (the tab label is the student / bài làm
        // identifier) so the toast confirms WHICH paper landed.
        const name = (from?.label || "").trim();
        setToast(
          name
            ? `Đã chấm xong bài của ${name} — chuyển tới bài kế tiếp`
            : "Đã lưu — chuyển tới bài kế tiếp",
        );
        setActive(next.id);
      }
    };
    window.addEventListener("hitl.finalizeAdvance", onFinalizeAdvance);
    return () =>
      window.removeEventListener("hitl.finalizeAdvance", onFinalizeAdvance);
  }, [tabs, setActive]);

  // "Lưu nháp" advance: after a tab saves its draft, jump to the NEXT paper
  // (in tab order) that's graded and not yet finalized — a fast left-to-right
  // review pass. Unlike Chốt's auto-advance this fires on the save action
  // (via event from EssayWorkspace), not on a tab-state flip, and only moves
  // forward; if there's no next paper we stay put and just confirm the save.
  useEffect(() => {
    const onDraftAdvance = (e: Event) => {
      const fromId = (e as CustomEvent<{ tabId: string }>).detail?.tabId;
      const idx = tabs.findIndex((t) => t.id === fromId);
      const next =
        idx >= 0
          ? tabs.slice(idx + 1).find((t) => t.hasGrade && !t.finalized)
          : undefined;
      if (next) {
        setActive(next.id);
        setToast("Đã lưu nháp — sang bài kế tiếp");
      } else {
        setToast("Đã lưu nháp");
      }
    };
    window.addEventListener("hitl.draftAdvance", onDraftAdvance);
    return () => window.removeEventListener("hitl.draftAdvance", onDraftAdvance);
  }, [tabs, setActive]);

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

      <AppHeader
        brand={String(t.title)}
        onOpenMemory={openMemoryTab}
        onOpenClasses={openClassesTab}
        onOpenHelp={openHelp}
        memoryActive={false}
        onToggleHistory={toggleHistory}
        historyActive={historyOpen}
        onOpenSidebar={() => window.dispatchEvent(new CustomEvent("hitl.openSidebar"))}
        tabs={tabs}
        activeId={activeId}
        onSelectTab={setActive}
        username={getUser()?.username}
        onLogout={handleLogout}
        onOpenAdmin={isAdmin() ? openAdminTab : undefined}
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
        <MobileHint />
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
