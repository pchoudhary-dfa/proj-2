import { getDWAPIURL } from "@/lib/constants";
import { apiFetch } from "@/lib/api/client";

type ApiEnvelope<T> =
  | { success: true; message?: string; data: T }
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

export type ExistingFormulaData = {
  exists: boolean;
  formula_id?: number;
  operation_type?: string;
  ius_name?: string;
  target_decimal?: number | null;
  /** Present when operation_type is MINUS */
  minuend_ius?: string;
  subtrahend_ius?: string;
  /** Present when operation_type is PERCENT */
  numerator_ius?: string;
  denominator_ius?: string;
  den_area_specific?: boolean;
  den_area_id?: string | null;
  den_area_name?: string | null;
  den_multiplier?: number | null;
  is_most_recent?: boolean;
  /** Present when operation_type is TIME (API single-letter codes: A, H, Q, M, …) */
  target_tp_freq?: string;
  source_tp_freq?: string;
  aggregation_type?: string;
  /** Present when operation_type is AREA (spatial aggregation; area_level integers) */
  target_area_level?: number;
  source_area_level?: number;
  populate_mid_levels?: boolean;
};

/** UI select values ↔ API frequency codes (TimeFormulaRequest). */
const FREQ_UI_TO_API: Record<string, string> = {
  annual: "A",
  half_yearly: "H",
  quarterly: "Q",
  monthly: "M",
};

const FREQ_API_TO_UI: Record<string, string> = {
  A: "annual",
  H: "half_yearly",
  Q: "quarterly",
  M: "monthly",
  D: "annual",
  F: "monthly",
};

export function timeFrequencyUiToApi(uiValue: string): string {
  return FREQ_UI_TO_API[uiValue] ?? uiValue;
}

export function timeFrequencyApiToUi(apiCode: string): string {
  const c = (apiCode || "").trim().toUpperCase();
  return FREQ_API_TO_UI[c] ?? "half_yearly";
}

export type PercentFormulaPayload = {
  target_ius: string;
  numerator_ius: string;
  denominator_ius: string;
  target_decimal?: number | null;
  den_area_specific?: boolean;
  den_area_id?: string | null;
  den_area_name?: string | null;
  den_multiplier?: number | null;
  is_most_recent?: boolean;
};

export type TimeFormulaPayload = {
  target_ius: string;
  target_tp_freq: string;
  source_tp_freq: string;
  aggregation_type: "sum" | "avg";
  target_decimal?: number | null;
  bulk_operations?: {
    time_all_sub?: boolean;
    time_oth_sub?: boolean;
    time_all_overwrite?: boolean;
  };
};

export type AreaFormulaPayload = {
  target_ius: string;
  target_area_level: number;
  source_area_level: number;
  aggregation_type: "sum" | "avg";
  populate_mid_levels?: boolean;
  target_decimal?: number | null;
  bulk_operations?: {
    area_all_sub?: boolean;
    area_oth_sub?: boolean;
    area_all_overwrite?: boolean;
  };
};

/** Matches backend `SourceReference` for POST /compute/formula/total. */
export type TotalFormulaSourceRef =
  | { type: "ius"; ius_gid: string }
  | { type: "iu"; i_gid: string; u_gid: string; i_name?: string; u_name?: string }
  | { type: "ic"; ic_nid: number; ic_name?: string };

export type TotalFormulaPayload = {
  target_ius: string;
  sources: TotalFormulaSourceRef[];
  target_decimal?: number | null;
  order?: number;
  bulk_operations?: {
    total_all_sub?: boolean;
    total_overwrite?: boolean;
  };
};

export async function getExistingFormulaForIus(
  dwId: string,
  iusGid: string,
  locale?: string
): Promise<{ ok: true; data: ExistingFormulaData } | { ok: false; message: string }> {
  const enc = encodeURIComponent(iusGid);
  const url = getDWAPIURL(dwId, `/compute/formula/ius/${enc}`);
  try {
    const res = await apiFetch(url, { headers: { ...acceptLangHeader(locale) } });
    const json = parseJson<ApiEnvelope<ExistingFormulaData>>(await res.json());
    if (!json) return { ok: false, message: "Invalid response" };
    if (json.success === true) return { ok: true, data: json.data };
    return {
      ok: false,
      message: json.err_message ?? `HTTP ${res.status}`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Request failed" };
  }
}

export async function saveMinusFormula(
  dwId: string,
  targetIus: string,
  minuendIus: string,
  subtrahendIus: string,
  locale?: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = getDWAPIURL(dwId, "/compute/formula/minus");
  try {
    const res = await apiFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...acceptLangHeader(locale),
      },
      body: JSON.stringify({
        target_ius: targetIus,
        minuend_ius: minuendIus,
        subtrahend_ius: subtrahendIus,
      }),
    });
    const json = parseJson<ApiEnvelope<unknown>>(await res.json());
    if (!json) return { ok: false, message: "Invalid response" };
    if (json.success === true) return { ok: true };
    const detail =
      json.errors &&
      typeof json.errors === "object" &&
      json.errors !== null &&
      "detail" in json.errors
        ? String((json.errors as { detail: unknown }).detail)
        : null;
    return {
      ok: false,
      message: detail || json.err_message || `HTTP ${res.status}`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Request failed" };
  }
}

export async function savePercentFormula(
  dwId: string,
  payload: PercentFormulaPayload,
  locale?: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = getDWAPIURL(dwId, "/compute/formula/percent");
  try {
    const res = await apiFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...acceptLangHeader(locale),
      },
      body: JSON.stringify(payload),
    });
    const json = parseJson<ApiEnvelope<unknown>>(await res.json());
    if (!json) return { ok: false, message: "Invalid response" };
    if (json.success === true) return { ok: true };
    const detail =
      json.errors &&
      typeof json.errors === "object" &&
      json.errors !== null &&
      "detail" in json.errors
        ? String((json.errors as { detail: unknown }).detail)
        : null;
    return {
      ok: false,
      message: detail || json.err_message || `HTTP ${res.status}`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Request failed" };
  }
}

export async function saveTimeFormula(
  dwId: string,
  payload: TimeFormulaPayload,
  locale?: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = getDWAPIURL(dwId, "/compute/formula/time");
  try {
    const res = await apiFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...acceptLangHeader(locale),
      },
      body: JSON.stringify(payload),
    });
    const json = parseJson<ApiEnvelope<unknown>>(await res.json());
    if (!json) return { ok: false, message: "Invalid response" };
    if (json.success === true) return { ok: true };
    const detail =
      json.errors &&
      typeof json.errors === "object" &&
      json.errors !== null &&
      "detail" in json.errors
        ? String((json.errors as { detail: unknown }).detail)
        : null;
    return {
      ok: false,
      message: detail || json.err_message || `HTTP ${res.status}`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Request failed" };
  }
}

export async function saveAreaFormula(
  dwId: string,
  payload: AreaFormulaPayload,
  locale?: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = getDWAPIURL(dwId, "/compute/formula/area");
  try {
    const res = await apiFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...acceptLangHeader(locale),
      },
      body: JSON.stringify(payload),
    });
    const json = parseJson<ApiEnvelope<unknown>>(await res.json());
    if (!json) return { ok: false, message: "Invalid response" };
    if (json.success === true) return { ok: true };
    const detail =
      json.errors &&
      typeof json.errors === "object" &&
      json.errors !== null &&
      "detail" in json.errors
        ? String((json.errors as { detail: unknown }).detail)
        : null;
    return {
      ok: false,
      message: detail || json.err_message || `HTTP ${res.status}`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Request failed" };
  }
}

export async function saveTotalFormula(
  dwId: string,
  targetIus: string,
  sourceIusList: string[],
  locale?: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = getDWAPIURL(dwId, "/compute/formula/total");
  const body: TotalFormulaPayload = {
    target_ius: targetIus,
    sources: sourceIusList.map((ius_gid) => ({ type: "ius", ius_gid })),
  };
  try {
    const res = await apiFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...acceptLangHeader(locale),
      },
      body: JSON.stringify(body),
    });
    const json = parseJson<ApiEnvelope<unknown>>(await res.json());
    if (!json) return { ok: false, message: "Invalid response" };
    if (json.success === true) return { ok: true };
    const detail =
      json.errors &&
      typeof json.errors === "object" &&
      json.errors !== null &&
      "detail" in json.errors
        ? String((json.errors as { detail: unknown }).detail)
        : null;
    return {
      ok: false,
      message: detail || json.err_message || `HTTP ${res.status}`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Request failed" };
  }
}

export type FormulaOperationType = "TOTAL" | "PERCENT" | "MINUS" | "TIME" | "AREA";

export async function deleteFormulaForIus(
  dwId: string,
  operationType: FormulaOperationType,
  targetIusGid: string,
  locale?: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const enc = encodeURIComponent(targetIusGid);
  const url = getDWAPIURL(
    dwId,
    `/compute/formula/${operationType}/ius/${enc}`
  );
  try {
    const res = await apiFetch(url, {
      method: "DELETE",
      headers: { ...acceptLangHeader(locale) },
    });
    const json = parseJson<ApiEnvelope<unknown>>(await res.json());
    if (!json) return { ok: false, message: "Invalid response" };
    if (json.success === true) return { ok: true };
    return {
      ok: false,
      message: json.err_message || `HTTP ${res.status}`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Request failed" };
  }
}

/**
 * Resolve IUS GIDs to display names.
 * Toolkit route expects a JSON **body** (query-only POST returns 422 "body Field required").
 * Tries a raw JSON array first, then `{ "ius_gids": [...] }` for alternate FastAPI shapes.
 */
export async function resolveIusNames(
  dwId: string,
  iusGids: string[],
  locale?: string
): Promise<Record<string, string>> {
  if (iusGids.length === 0) return {};
  const base = getDWAPIURL(dwId, "/compute/formula/resolve-ius");
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...acceptLangHeader(locale),
  };

  const parseOk = (raw: unknown): Record<string, string> | null => {
    const json = parseJson<ApiEnvelope<Record<string, string>>>(raw);
    if (json && json.success === true && json.data && typeof json.data === "object") {
      return json.data;
    }
    return null;
  };

  const bodies = [
    JSON.stringify(iusGids),
    JSON.stringify({ ius_gids: iusGids }),
  ];

  for (const body of bodies) {
    try {
      const res = await apiFetch(base, { method: "POST", headers, body });
      const data = parseOk(await res.json());
      if (data) return data;
    } catch {
      /* try next shape */
    }
  }

  return {};
}
