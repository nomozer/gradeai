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
}): Promise<SessionUser> {
  return apiPost<typeof body, SessionUser>("/auth/users", body);
}

export function updateUser(
  id: number,
  body: { password?: string; is_active?: boolean; role?: string },
): Promise<SessionUser> {
  return apiPatch<typeof body, SessionUser>(`/auth/users/${id}`, body);
}

export function deleteUser(id: number): Promise<{ deleted: boolean; user_id: number }> {
  return apiDelete<{ deleted: boolean; user_id: number }>(`/auth/users/${id}`);
}
