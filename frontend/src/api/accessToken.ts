/**
 * Shared access-token store.
 *
 * The backend gates every `/api/*` request behind an `X-Access-Token`
 * header (see backend `make_access_token_guard`). This is a coarse
 * anti-abuse gate for a fixed group — NOT per-user auth. The token is
 * entered once via `AccessGate`, kept in localStorage, and attached to
 * every request by `client.ts`. A 401 clears it and re-shows the gate.
 */

const STORAGE_KEY = "hitl_access_token";

/** Fired by `client.ts` on a 401 so `AccessGate` re-prompts. */
export const AUTH_REQUIRED_EVENT = "hitl.authRequired";

export function getAccessToken(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function setAccessToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* private-mode / quota — token just won't persist across reloads */
  }
}

export function clearAccessToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
