import { getDWAPIURL } from "@/lib/constants";
import { apiFetch } from "@/lib/api/client";

type ApiEnvelope<T> =
  | { success: true; message?: string; data: T; meta?: Record<string, unknown> }
  | { success: false; err_message?: string; errors?: unknown };

function acceptLangHeader(locale?: string): HeadersInit {
  if (!locale?.trim()) return {};
  const short = locale.trim().split("-")[0];
  return { "Accept-Language": short || locale.trim() };
}

function parseJson<T>(raw: unknown): T | null {
  if (raw && typeof raw === "object") return raw as T;
  return null;
}

/** One row from GET /dw/{dw_id}/sources (external / alias field names). */
export type DwSourceListItem = {
  src_nid?: number;
  src_publisher?: string | null;
  src_title?: string | null;
  src_year?: string | null;
  publisher?: string | null;
  title?: string | null;
};

export function rowPublisher(r: DwSourceListItem): string {
  const v = r.src_publisher ?? r.publisher;
  return String(v ?? "").trim();
}

export function rowTitle(r: DwSourceListItem): string {
  const v = r.src_title ?? r.title;
  return String(v ?? "").trim();
}

export type FetchAllDwSourcesResult =
  | { ok: true; rows: DwSourceListItem[] }
  | { ok: false; message: string };

/** Dedupes concurrent callers (React Strict Mode + duplicate effects). */
const fetchAllDwSourcesInFlight = new Map<string, Promise<FetchAllDwSourcesResult>>();

function fetchAllDwSourcesCacheKey(dwId: string, locale?: string): string {
  return `${dwId.trim()}:${locale?.trim() ?? ""}`;
}

/**
 * Lists all sources for a warehouse in one request.
 * Omit `page` / `page_size`: backend returns the full list (see sources router).
 */
export async function fetchAllDwSources(
  dwId: string,
  locale?: string
): Promise<FetchAllDwSourcesResult> {
  if (!dwId.trim()) {
    return { ok: false, message: "Missing warehouse id" };
  }
  const key = fetchAllDwSourcesCacheKey(dwId, locale);
  const existing = fetchAllDwSourcesInFlight.get(key);
  if (existing) return existing;

  const request = (async (): Promise<FetchAllDwSourcesResult> => {
    try {
      const sp = new URLSearchParams({
        sort_order: "asc",
        sort_field: "ic_nid",
      });
      const url = `${getDWAPIURL(dwId, "/sources")}?${sp.toString()}`;
      const res = await apiFetch(url, {
        method: "GET",
        headers: { ...acceptLangHeader(locale) },
      });
      const json = parseJson<ApiEnvelope<DwSourceListItem[]>>(await res.json());
      if (!json) return { ok: false, message: "Invalid response" };
      if (json.success !== true || !Array.isArray(json.data)) {
        const fail = json as {
          success: false;
          err_message?: string;
          errors?: unknown;
        };
        const detail =
          fail.errors &&
          typeof fail.errors === "object" &&
          fail.errors !== null &&
          "detail" in fail.errors
            ? String((fail.errors as { detail: unknown }).detail)
            : null;
        return {
          ok: false,
          message:
            detail || String(fail.err_message || "") || `HTTP ${res.status}`,
        };
      }
      return { ok: true, rows: json.data };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Request failed",
      };
    }
  })();

  fetchAllDwSourcesInFlight.set(key, request);
  try {
    return await request;
  } finally {
    fetchAllDwSourcesInFlight.delete(key);
  }
}

export type CreateDwSourcePayload = {
  src_publisher: string;
  src_title: string;
  src_year?: string;
};

export type CreateDwSourceResult =
  | { ok: true; status: number }
  | { ok: false; message: string; status?: number; conflict?: boolean };

/**
 * POST /dw/{dw_id}/sources — creates publisher (parent) + source (child) when needed.
 * Accepts 201 success, or 409 when an equivalent source already exists (caller may treat as ok).
 */
export async function createDwSource(
  dwId: string,
  payload: CreateDwSourcePayload,
  locale?: string
): Promise<CreateDwSourceResult> {
  if (!dwId.trim()) {
    return { ok: false, message: "Missing warehouse id" };
  }
  const body: Record<string, string> = {
    src_title: payload.src_title.trim(),
    src_publisher: payload.src_publisher.trim(),
  };
  if (payload.src_year?.trim()) {
    body.src_year = payload.src_year.trim();
  }
  const url = getDWAPIURL(dwId, `/sources`);
  try {
    const res = await apiFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...acceptLangHeader(locale),
      },
      body: JSON.stringify(body),
    });
    if (res.status === 201 || res.status === 200) {
      return { ok: true, status: res.status };
    }
    if (res.status === 409) {
      const json = parseJson<ApiEnvelope<unknown>>(await res.json());
      const msg =
        json && json.success === false
          ? String(json.err_message || "Conflict")
          : "Source already exists";
      return { ok: false, message: msg, status: 409, conflict: true };
    }
    const json = parseJson<ApiEnvelope<unknown>>(await res.json());
    const detail =
      json &&
      json.success === false &&
      json.errors &&
      typeof json.errors === "object" &&
      json.errors !== null &&
      "detail" in json.errors
        ? String((json.errors as { detail: unknown }).detail)
        : null;
    return {
      ok: false,
      message:
        detail ||
        (json && json.success === false ? String(json.err_message) : "") ||
        `HTTP ${res.status}`,
      status: res.status,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Request failed",
    };
  }
}

/** Backend treats blank publisher as GLOBAL for source rows. */
export function normalizeSourcePublisher(raw: string): string {
  const t = raw.trim();
  return t.length ? t : "GLOBAL";
}

export function sourceHasPublisherTitlePair(
  rows: DwSourceListItem[],
  publisher: string,
  title: string
): boolean {
  const pub = normalizeSourcePublisher(publisher);
  const tit = title.trim();
  if (!tit) return false;
  return rows.some((r) => {
    const rp = normalizeSourcePublisher(rowPublisher(r));
    return rp === pub && rowTitle(r) === tit;
  });
}

/**
 * Ensures a warehouse Source exists for publisher+title (any year).
 * Creates with no year when missing. Treats 409 conflict as success.
 */
export async function ensureDwSourcePublisherTitle(
  dwId: string,
  publisher: string,
  title: string,
  locale?: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const pub = publisher.trim();
  const tit = title.trim();
  if (!pub || !tit) {
    return { ok: false, message: "Publisher and title are required" };
  }
  const res = await createDwSource(
    dwId,
    { src_publisher: pub, src_title: tit },
    locale
  );
  if (res.ok) return { ok: true };
  if (res.conflict) return { ok: true };
  return { ok: false, message: res.message };
}
