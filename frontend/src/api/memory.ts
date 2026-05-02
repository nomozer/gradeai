import { apiDelete, apiGet, type RequestOptions } from "./client";
import type { Lesson } from "../types";

export interface ListLessonsQuery {
  subject?: string;
  search?: string;
  limit?: number;
}

export interface ListLessonsResponse {
  items: Lesson[];
  total: number;
}

export interface MemoryStats {
  total_lessons: number;
  total_approved_grades: number;
  total_pipeline_runs: number;
  by_subject: Record<string, number>;
  by_tier: Record<string, number>;
}

export interface DeleteLessonResponse {
  deleted: boolean;
  lesson_id: number;
}

export function listLessons(
  query: ListLessonsQuery = {},
  options?: RequestOptions,
): Promise<ListLessonsResponse> {
  return apiGet<ListLessonsResponse>("/memory/lessons", { ...query }, options);
}

export function getMemoryStats(options?: RequestOptions): Promise<MemoryStats> {
  return apiGet<MemoryStats>("/memory/stats", {}, options);
}

export function deleteLesson(
  lessonId: number,
  options?: RequestOptions,
): Promise<DeleteLessonResponse> {
  return apiDelete<DeleteLessonResponse>(`/memory/lessons/${lessonId}`, options);
}
