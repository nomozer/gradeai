/**
 * Base HTTP client for the HITL backend.
 *
 * One place to centralize:
 *   - API base URL
 *   - JSON headers
 *   - AbortSignal handling (caller can cancel long requests)
 *   - Error mapping: non-2xx → Error(detail || "Server error N")
 *
 * Hooks and features should NOT call `fetch` directly — they call the
 * typed helpers in `api/pipeline.ts`, `api/feedback.ts`, etc. which all
 * route through `apiPost` here.
 */

import { getToken, clearSession, AUTH_REQUIRED_EVENT } from "./session";

export const API_BASE = "/api";

/** Merge the bearer-token header onto any outgoing request's headers. */
function withAuth(headers?: HeadersInit): Record<string, string> {
  const token = getToken();
  return {
    ...(headers as Record<string, string> | undefined),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail || `Server error ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export interface RequestOptions {
  /** Forwarded to fetch — caller owns cancellation and timeout. */
  signal?: AbortSignal;
}

async function _request<TRes>(
  path: string,
  init: RequestInit,
  options: RequestOptions,
): Promise<TRes> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: withAuth(init.headers),
    signal: options.signal,
  });
  if (res.status === 401) {
    // Session gone (expired / revoked) — drop it and let the gate re-prompt.
    clearSession();
    window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
  }
  if (!res.ok) {
    const detail = await res
      .json()
      .then((b) => (b && typeof b.detail === "string" ? b.detail : ""))
      .catch(() => "");
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as TRes;
}

export function apiPost<TReq, TRes>(
  path: string,
  body: TReq,
  options: RequestOptions = {},
): Promise<TRes> {
  return _request<TRes>(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    options,
  );
}

export function apiGet<TRes>(
  path: string,
  query: Record<string, string | number | undefined> = {},
  options: RequestOptions = {},
): Promise<TRes> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === "") continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return _request<TRes>(qs ? `${path}?${qs}` : path, { method: "GET" }, options);
}

export function apiPatch<TReq, TRes>(
  path: string,
  body: TReq,
  options: RequestOptions = {},
): Promise<TRes> {
  return _request<TRes>(
    path,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    options,
  );
}

export function apiDelete<TRes>(
  path: string,
  options: RequestOptions = {},
): Promise<TRes> {
  return _request<TRes>(path, { method: "DELETE" }, options);
}

/**
 * Fire-and-forget POST — swallows all errors. Used only for the
 * heartbeat where a missed ping is not a user-facing concern.
 */
export function apiPostQuiet(path: string, body?: any): Promise<void> {
  const init: RequestInit = { method: "POST" };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  init.headers = withAuth(body !== undefined ? { "Content-Type": "application/json" } : undefined);
  return fetch(`${API_BASE}${path}`, init)
    .then(() => undefined)
    .catch(() => undefined);
}
