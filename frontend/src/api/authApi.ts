/**
 * authApi.ts — typed helpers for the /api/auth/* endpoints.
 *
 * Login/logout/me for the session, plus the admin-only user-management calls
 * backing the #admin panel. All route through `client.ts`, so the bearer
 * token + 401 handling are automatic.
 */

import { apiGet, apiPost, apiPatch, apiDelete } from "./client";
import type { SessionUser } from "./session";

export interface LoginResult {
  token: string;
  user: SessionUser;
}

export function login(username: string, password: string): Promise<LoginResult> {
  return apiPost<{ username: string; password: string }, LoginResult>(
    "/auth/login",
    { username, password },
  );
}

export function logout(): Promise<{ ok: boolean }> {
  return apiPost<Record<string, never>, { ok: boolean }>("/auth/logout", {});
}

export function getMe(): Promise<SessionUser> {
  return apiGet<SessionUser>("/auth/me");
}

// ---- admin user management ------------------------------------------------

export interface OverviewUserRow extends SessionUser {
  lessons: number;
  graded: number;
  tokens_used: number;
}

export interface Overview {
  total_accounts: number;
  total_teachers: number;
  total_admins: number;
  total_graded: number;
  total_lessons: number;
  users: OverviewUserRow[];
}

export function getOverview(): Promise<Overview> {
  return apiGet<Overview>("/auth/overview");
}

export function listUsers(): Promise<{ items: SessionUser[] }> {
  return apiGet<{ items: SessionUser[] }>("/auth/users");
}

export function createUser(body: {
  username: string;
  password: string;
  role: string;
  token_quota?: number;
  full_name?: string;
  teacher_code?: string;
}): Promise<SessionUser> {
  return apiPost<typeof body, SessionUser>("/auth/users", body);
}

export interface BulkUserItem {
  username: string;
  password: string;
  role?: string;
  token_quota?: number;
  full_name?: string;
  teacher_code?: string;
}

export interface BulkResultRow {
  username: string;
  status: "created" | "skipped" | "error";
  detail: string;
}

export interface BulkCreateResult {
  created: number;
  failed: number;
  results: BulkResultRow[];
}

export function createUsersBulk(users: BulkUserItem[]): Promise<BulkCreateResult> {
  return apiPost<{ users: BulkUserItem[] }, BulkCreateResult>("/auth/users/bulk", {
    users,
  });
}

// ---- backup / restore (admin) ---------------------------------------------

export interface BackupData {
  version: number;
  users: unknown[];
  lessons: unknown[];
  pipeline_runs: unknown[];
  approved_grades: unknown[];
}

export interface RestoreResult {
  users: number;
  lessons: number;
  pipeline_runs: number;
  approved_grades: number;
}

export function getBackup(): Promise<BackupData> {
  return apiGet<BackupData>("/auth/backup");
}

export function restoreBackup(data: unknown): Promise<RestoreResult> {
  return apiPost<unknown, RestoreResult>("/auth/restore", data);
}

export function updateUser(
  id: number,
  body: { password?: string; is_active?: boolean; role?: string; token_quota?: number },
): Promise<SessionUser> {
  return apiPatch<typeof body, SessionUser>(`/auth/users/${id}`, body);
}

export function deleteUser(id: number): Promise<{ deleted: boolean; user_id: number }> {
  return apiDelete<{ deleted: boolean; user_id: number }>(`/auth/users/${id}`);
}
