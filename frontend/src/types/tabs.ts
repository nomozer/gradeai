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
