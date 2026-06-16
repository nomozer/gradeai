/**
 * Session store — the logged-in user + bearer token.
 *
 * Replaces the old shared-access-token gate. After `/api/auth/login`, the
 * token + user are kept in localStorage; `client.ts` attaches the token as
 * `Authorization: Bearer` on every request. A 401 from the backend means the
 * session is gone (expired / revoked / password changed) — the client clears
 * the session and fires `AUTH_REQUIRED_EVENT` so the app drops back to login.
 */

export interface SessionUser {
  id: number;
  username: string;
  role: string;
  is_active?: boolean;
  created_at?: string | null;
}

const TOKEN_KEY = "hitl_session_token";
const USER_KEY = "hitl_session_user";

/** Fired by `client.ts` on a 401 so the app re-shows the login screen. */
export const AUTH_REQUIRED_EVENT = "hitl.authRequired";

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function getUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function isAdmin(): boolean {
  return getUser()?.role === "admin";
}

export function setSession(token: string, user: SessionUser): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* private-mode / quota — session just won't persist across reloads */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}
