import type { TeacherCommentType } from "./domain";

/** AI's judgment of the teacher comment vs the student work. */
export type CommentVerdict = "agree" | "partial" | "dispute";

export interface ThreadMessage {
  type: TeacherCommentType;
  text: string;
  lesson?: string;
  /** Only set on AI messages — undefined on teacher messages. */
  verdict?: CommentVerdict;
  /**
   * Teacher's decision on a disputed AI lesson:
   *   - undefined: pending decision (UI shows confirm buttons)
   *   - "apply":   teacher overrides AI, lesson WILL be staged
   *   - "skip":    teacher accepts AI dispute, lesson NOT staged
   * Ignored when verdict !== "dispute" (lesson always stages).
   */
  disputeDecision?: "apply" | "skip";
}

/** Map of question-index → messages for that question. */
export type CommentThreads = Record<number, ThreadMessage[]>;
