/**
 * Reusable client-side API methods (GET, POST, PATCH, DELETE, raw fetch).
 * Centralizes headers, JSON parsing, error handling, and automatic token
 * refresh on 401 so callers get a consistent result shape.
 */

import { getAuthHeaders } from "@/lib/auth/authService";
import {
  X_APP_KEY_HEADER,
  API_KEY,
  ENABLE_API_PROXY,
} from "@/lib/constants";
import { ensureRefreshed, emitSessionExpired } from "@/lib/api/tokenRefresh";

export type ApiClientOptions = {
  /** Accept-Language header (e.g. locale or navigator.language). */
  acceptLanguage?: string;
  /** Extra headers (Content-Type: application/json is set by default for POST). */
  headers?: Record<string, string>;
  /** Fetch cache mode (default: no-store for fresh data). */
  cache?: RequestCache;
};

export type ApiResult<T = unknown> =
  | { ok: true; data: T; status: number; statusText: string }
  | { ok: false; data: null; status: number; statusText: string; error?: string };

/**
 * Synchronous header builder (API key + bearer only).
 * When `ENABLE_API_PROXY` is false, use `buildSignedHeaders` or `apiGet`/`apiPost` for signed calls.
 */
export function buildHeaders(options: ApiClientOptions = {}): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeaders(),
    ...options.headers,
  };
  if (options.acceptLanguage) {
    headers["Accept-Language"] = options.acceptLanguage;
  }
  if (!ENABLE_API_PROXY && API_KEY) {
    headers[X_APP_KEY_HEADER] = API_KEY;
  }
  return headers;
}

/**
 * Async headers builder. Ed25519 signing is server-only on `/api/proxy`.
 * Kept async for backward-compatibility with callers that await it.
 */
export async function buildSignedHeaders(
  _url: string,
  _method: string,
  options: ApiClientOptions = {}
): Promise<Record<string, string>> {
  return buildHeaders(options);
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function getErrorFromData(data: unknown): string {
  return typeof data === "object" && data !== null && "err_message" in data
    ? String((data as { err_message?: string }).err_message)
    : "";
}

// ---------------------------------------------------------------------------
// Internal: execute a fetch, handle 401 with refresh + single retry
// ---------------------------------------------------------------------------

async function fetchWithRefresh(
  url: string,
  init: RequestInit,
  options: ApiClientOptions
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw err;
  }

  if (res.status !== 401 || typeof window === "undefined") return res;

  const refreshed = await ensureRefreshed();
  if (!refreshed) {
    emitSessionExpired();
    return res;
  }

  const retryHeaders = buildHeaders(options);
  return fetch(url, { ...init, headers: retryHeaders });
}

function buildFetchInit(
  method: string,
  headers: Record<string, string>,
  cache: RequestCache,
  body?: string,
): RequestInit {
  const init: RequestInit = { method, cache, headers };
  if (body !== undefined) init.body = body;
  return init;
}

// ---------------------------------------------------------------------------
// Public API methods
// ---------------------------------------------------------------------------

export async function apiGet<T = unknown>(
  url: string,
  options: ApiClientOptions = {}
): Promise<ApiResult<T>> {
  const headers = buildHeaders(options);
  const cache = options.cache ?? "no-store";

  let res: Response;
  try {
    res = await fetchWithRefresh(url, buildFetchInit("GET", headers, cache), options);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Network error";
    return { ok: false, data: null, status: 0, statusText: error, error };
  }

  const data = (await parseJson(res)) as T | null;
  if (!res.ok) {
    return {
      ok: false,
      data: null,
      status: res.status,
      statusText: res.statusText,
      error: getErrorFromData(data) || res.statusText,
    };
  }

  return { ok: true, data: data ?? (null as T), status: res.status, statusText: res.statusText };
}

export async function apiPatch<T = unknown>(
  url: string,
  body: unknown,
  options: ApiClientOptions = {}
): Promise<ApiResult<T>> {
  const headers = buildHeaders(options);
  const cache = options.cache ?? "no-store";
  const jsonBody = JSON.stringify(body);

  let res: Response;
  try {
    res = await fetchWithRefresh(
      url,
      buildFetchInit("PATCH", headers, cache, jsonBody),
      options,
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : "Network error";
    return { ok: false, data: null, status: 0, statusText: error, error };
  }

  const data = (await parseJson(res)) as T | null;
  if (!res.ok) {
    return {
      ok: false,
      data: null,
      status: res.status,
      statusText: res.statusText,
      error: getErrorFromData(data) || res.statusText,
    };
  }

  return { ok: true, data: data ?? (null as T), status: res.status, statusText: res.statusText };
}

export async function apiDelete<T = unknown>(
  url: string,
  options: ApiClientOptions = {}
): Promise<ApiResult<T>> {
  const headers = buildHeaders(options);
  const cache = options.cache ?? "no-store";

  let res: Response;
  try {
    res = await fetchWithRefresh(url, buildFetchInit("DELETE", headers, cache), options);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Network error";
    return { ok: false, data: null, status: 0, statusText: error, error };
  }

  const data = (await parseJson(res)) as T | null;
  if (!res.ok) {
    return {
      ok: false,
      data: null,
      status: res.status,
      statusText: res.statusText,
      error: getErrorFromData(data) || res.statusText,
    };
  }

  return { ok: true, data: data ?? (null as T), status: res.status, statusText: res.statusText };
}

export async function apiPost<T = unknown>(
  url: string,
  body: unknown,
  options: ApiClientOptions = {}
): Promise<ApiResult<T>> {
  const headers = buildHeaders(options);
  const cache = options.cache ?? "no-store";
  const jsonBody = JSON.stringify(body);

  let res: Response;
  try {
    res = await fetchWithRefresh(
      url,
      buildFetchInit("POST", headers, cache, jsonBody),
      options,
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : "Network error";
    return { ok: false, data: null, status: 0, statusText: error, error };
  }

  const data = (await parseJson(res)) as T | null;
  if (!res.ok) {
    return {
      ok: false,
      data: null,
      status: res.status,
      statusText: res.statusText,
      error: getErrorFromData(data) || res.statusText,
    };
  }

  return { ok: true, data: data ?? (null as T), status: res.status, statusText: res.statusText };
}

/**
 * Fetch with bearer auth headers and automatic 401 refresh + retry.
 * Toolkit SIGNATURE auth is applied by `/api/proxy` when enabled.
 */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const base = buildHeaders();
  const headers = new Headers(init.headers ?? {});
  for (const [k, v] of Object.entries(base)) {
    if (!headers.has(k)) headers.set(k, v);
  }

  const res = await fetch(url, { ...init, method, headers });

  if (res.status !== 401 || typeof window === "undefined") return res;

  const refreshed = await ensureRefreshed();
  if (!refreshed) {
    emitSessionExpired();
    return res;
  }

  const retryHeaders = new Headers(init.headers ?? {});
  const retryBase = buildHeaders();
  for (const [k, v] of Object.entries(retryBase)) {
    if (!retryHeaders.has(k)) retryHeaders.set(k, v);
  }
  return fetch(url, { ...init, method, headers: retryHeaders });
}
