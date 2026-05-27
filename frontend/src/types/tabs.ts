import type { PipelinePhase } from "./domain";
import type { EssayFile, TaskFile } from "./grade";

export interface Tab {
  id: string;
  label: string;
  phase: PipelinePhase;
  step: number;
  hasGrade: boolean;
  canRun?: boolean;
  initialEssayFile?: EssayFile | null;
  initialTaskFile?: TaskFile | null;
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
