import type { GradeHistoryEntry } from "./api";
import type { PipelinePhase } from "./domain";
import type { EssayFile, TaskFile } from "./grade";

export interface Tab {
  id: string;
  label: string;
  phase: PipelinePhase;
  step: number;
  hasGrade: boolean;
  canRun?: boolean;
  // True once Step 5's finalize-grade call has succeeded. Distinct from
  // ``hasGrade`` (which is "AI produced a grade") — the teacher still
  // needs to review/finalize before a tab counts as fully done. Drives
  // the post-finalize auto-advance in App.tsx (jump to the next tab
  // with hasGrade && !finalized) and the TabBar status icon split
  // (outline check for awaiting-review, solid green for done).
  finalized?: boolean;
  // Last pipeline error message — non-null when the AI run failed and
  // the tab needs human attention (retry the upload, check the file,
  // wait out Gemini quota, etc.). Without this field, a failed tab is
  // visually identical to a fresh "never started" tab (both at
  // ``phase: "idle"``) and silently disappears from the batch — a real
  // hazard at 30+ paper scale where teachers can't manually verify
  // every tab. Cleared automatically when a fresh ``handleRun`` starts
  // (via useAgentPipeline reset → phase transitions). Surfaced in
  // TabBar as a red AlertTriangle and counted in the floating-capsule /
  // drawer-header progress pills (``N✗`` segment).
  error?: string | null;
  initialEssayFile?: EssayFile | null;
  initialTaskFile?: TaskFile | null;
  initialAnswerKeyFile?: TaskFile | null;
  initialSubject?: any;
  // Per-câu max-points scheme propagated across a batch (same task PDF).
  // Set by EssayWorkspace when the teacher edits ``maxOverrides`` on any
  // tab; App.tsx cross-tab sync copies it to other non-finalized tabs
  // sharing the same ``initialTaskFile``. Threaded into pipeline.generate
  // / regrade so the backend prompt locks max_points to the teacher's
  // numbers — keeps the AI from re-guessing inconsistently across the
  // batch when the exam itself doesn't pin per-câu points.
  maxPointsTemplate?: Record<number, number> | null;
  // Set by App.tsx when the teacher clicks an entry in the "Bài đã chấm"
  // header dropdown — opens the history entry in a NEW tab rather than
  // overwriting the current tab's in-progress work. The new tab's
  // EssayWorkspace consumes this on mount via pipeline.loadHistoryEntry.
  // ``initialHistoryStep`` carries which surface to land on (3: Review,
  // 4/5: Done). Both clear themselves after consumption.
  initialHistoryEntry?: GradeHistoryEntry | null;
  initialHistoryStep?: 3 | 4 | 5 | null;
  questions?: { num: number; score: number; label: string }[];
}

export type TabMeta = Partial<Tab>;

export type TabsAction =
  | { type: "ADD"; meta?: TabMeta }
  | { type: "CLOSE"; id: string }
  | { type: "CLEAR" }
  | { type: "SET_ACTIVE"; id: string }
  | { type: "UPDATE_META"; id: string; meta: TabMeta };

export interface TabsState {
  tabs: Tab[];
  activeId: string;
}
