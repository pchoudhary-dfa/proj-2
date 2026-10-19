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

export type EligibleTargetIusGidsResult =
  | { ok: true; ius_gids: string[] }
  | { ok: false; message: string };

/**
 * IUS GIDs that already have a saved compute formula for the given process type
 * (legacy compute-execute `targetius` parity for the picker).
 */
export async function fetchEligibleFormulaTargetIusGids(
  dwId: string,
  processType: string,
  locale?: string
): Promise<EligibleTargetIusGidsResult> {
  const pt = processType.trim();
  if (!dwId.trim() || !pt) {
    return { ok: false, message: "Missing warehouse or process type" };
  }
  const url = `${getDWAPIURL(dwId, "/compute/process/eligible-target-ius")}?${new URLSearchParams({ process_type: pt })}`;
  try {
    const res = await apiFetch(url, {
      method: "GET",
      headers: { ...acceptLangHeader(locale) },
    });
    const json = parseJson<
      ApiEnvelope<{ ius_gids?: string[]; process_type?: string }>
    >(await res.json());
    if (!json) return { ok: false, message: "Invalid response" };
    if (json.success === true && Array.isArray(json.data?.ius_gids)) {
      return { ok: true, ius_gids: json.data.ius_gids.map(String) };
    }
    if (json.success !== true) {
      const err = json;
      const detail =
        err.errors &&
        typeof err.errors === "object" &&
        err.errors !== null &&
        "detail" in err.errors
          ? String((err.errors as { detail: unknown }).detail)
          : null;
      return {
        ok: false,
        message: detail || err.err_message || `HTTP ${res.status}`,
      };
    }
    return { ok: false, message: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Request failed" };
  }
}

export type ComputeProcessListItem = {
  id: number;
  process_type: string;
  filter_object: Record<string, unknown>;
  created_at: string | null;
  times_count: number;
};

export type ListComputeProcessesResult =
  | { ok: true; processes: ComputeProcessListItem[] }
  | { ok: false; message: string };

export async function listComputeProcesses(
  dwId: string,
  options?: { processType?: string; locale?: string }
): Promise<ListComputeProcessesResult> {
  const q = options?.processType?.trim()
    ? `?process_type=${encodeURIComponent(options.processType.trim())}`
    : "";
  const url = getDWAPIURL(dwId, `/compute/process${q}`);
  try {
    const res = await apiFetch(url, {
      method: "GET",
      headers: { ...acceptLangHeader(options?.locale) },
    });
    const json = parseJson<
      ApiEnvelope<{
        processes?: ComputeProcessListItem[];
      }>
    >(await res.json());
    if (!json) return { ok: false, message: "Invalid response" };
    if (json.success === true) {
      const list = Array.isArray(json.data?.processes)
        ? json.data.processes
        : [];
      return { ok: true, processes: list };
    }
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

export type ExecuteComputePayload = {
  timeperiods: string[];
  timeperiodsName?: string[];
  name?: string;
  priority?: number;
  src_publisher?: string;
  src_title?: string;
};

export type ExecuteComputeSuccessData = {
  process_time_id: number;
  process_time_log_id: number;
  estimated_jobs: number;
  status: string;
  dispatch_result: Record<string, unknown>;
};

export type ExecuteComputeResult =
  | { ok: true; data: ExecuteComputeSuccessData }
  | { ok: false; message: string };

export type CreateComputeProcessPayload = {
  process_type: string;
  filter_object: Record<string, unknown>;
  name?: string;
  description?: string;
};

export type CreateComputeProcessSuccessData = {
  process_id: number;
  process_type: string;
  created_at: string | null;
};

export type CreateComputeProcessResult =
  | { ok: true; data: CreateComputeProcessSuccessData }
  | { ok: false; message: string };

export async function createComputeProcess(
  dwId: string,
  payload: CreateComputeProcessPayload,
  locale?: string
): Promise<CreateComputeProcessResult> {
  const url = getDWAPIURL(dwId, `/compute/process`);
  try {
    const res = await apiFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...acceptLangHeader(locale),
      },
      body: JSON.stringify(payload),
    });
    const json = parseJson<ApiEnvelope<CreateComputeProcessSuccessData>>(
      await res.json()
    );
    if (!json) return { ok: false, message: "Invalid response" };
    if (json.success === true && json.data) {
      return { ok: true, data: json.data };
    }
    if (json.success === false) {
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
    }
    return { ok: false, message: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Request failed" };
  }
}

export type DeleteComputeProcessResult =
  | { ok: true; process_id: number }
  | { ok: false; message: string };

export type UpdateComputeProcessResult =
  | { ok: true }
  | { ok: false; message: string };

export async function updateComputeProcess(
  dwId: string,
  processId: number,
  body: { filter_object: Record<string, unknown> },
  locale?: string
): Promise<UpdateComputeProcessResult> {
  const url = getDWAPIURL(dwId, `/compute/process/${processId}`);
  try {
    const res = await apiFetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...acceptLangHeader(locale),
      },
      body: JSON.stringify(body),
    });
    const json = parseJson<
      ApiEnvelope<{ process_id?: number; filter_object?: Record<string, unknown> }>
    >(await res.json());
    if (!json) return { ok: false, message: "Invalid response" };
    if (json.success === true) {
      return { ok: true };
    }
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

export async function deleteComputeProcess(
  dwId: string,
  processId: number,
  locale?: string
): Promise<DeleteComputeProcessResult> {
  const url = getDWAPIURL(dwId, `/compute/process/${processId}`);
  try {
    const res = await apiFetch(url, {
      method: "DELETE",
      headers: { ...acceptLangHeader(locale) },
    });
    const json = parseJson<
      ApiEnvelope<{ process_id?: number; deleted_at?: string }>
    >(await res.json());
    if (!json) return { ok: false, message: "Invalid response" };
    if (json.success === true) {
      const id = json.data?.process_id ?? processId;
      return { ok: true, process_id: id };
    }
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

export async function executeComputeProcess(
  dwId: string,
  processId: number,
  payload: ExecuteComputePayload,
  locale?: string
): Promise<ExecuteComputeResult> {
  const url = getDWAPIURL(dwId, `/compute/process/${processId}/execute`);
  try {
    const res = await apiFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...acceptLangHeader(locale),
      },
      body: JSON.stringify(payload),
    });
    const json = parseJson<ApiEnvelope<ExecuteComputeSuccessData>>(
      await res.json()
    );
    if (!json) return { ok: false, message: "Invalid response" };
    if (json.success === true && json.data) {
      return { ok: true, data: json.data };
    }
    if (json.success === false) {
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
    }
    return { ok: false, message: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Request failed" };
  }
}
