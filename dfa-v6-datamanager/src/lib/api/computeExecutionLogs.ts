import { getDWAPIURL } from "@/lib/constants";
import { apiFetch } from "@/lib/api/client";
import { getFileResponse } from "@/lib/api/http";

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

function errMessage(json: Record<string, unknown>, status: number): string {
  const detail =
    json.errors &&
    typeof json.errors === "object" &&
    json.errors !== null &&
    "detail" in json.errors
      ? String((json.errors as { detail: unknown }).detail)
      : null;
  const em = json.err_message;
  return (
    detail ||
    (typeof em === "string" ? em : null) ||
    `HTTP ${status}`
  );
}

/** One ``ce_process_time`` row (legacy process-time grid). */
export type ComputeProcessTimeperiodRow = {
  process_time_id: number;
  created_at: string | null;
  timeperiod_labels: string[];
  timeperiod_display: string;
  /** User-provided label from execute modal (latest log filter_object). */
  execution_name?: string | null;
  /** Sort/search compatibility fields from API */
  timeperiod?: string | null;
  timeperiod_name?: string | null;
};

export function formatProcessTimeExecutionName(
  row: ComputeProcessTimeperiodRow
): string {
  const name = row.execution_name?.trim();
  return name || "—";
}

export function formatProcessTimeDisplay(row: ComputeProcessTimeperiodRow): string {
  const display = row.timeperiod_display?.trim();
  if (display) return display;
  const labels = row.timeperiod_labels?.filter((l) => l?.trim()) ?? [];
  if (labels.length > 0) return labels.join(", ");
  return "—";
}

export type ListProcessTimeperiodsResult =
  | { ok: true; timeperiods: ComputeProcessTimeperiodRow[] }
  | { ok: false; message: string };

export async function listProcessTimeperiods(
  dwId: string,
  processId: number,
  locale?: string
): Promise<ListProcessTimeperiodsResult> {
  const url = getDWAPIURL(
    dwId,
    `/compute/logs/process/${processId}?sort_field=process_time_id&sort_order=asc`
  );
  try {
    const res = await apiFetch(url, {
      method: "GET",
      headers: { ...acceptLangHeader(locale) },
    });
    const json = parseJson<
      ApiEnvelope<{ timeperiods?: ComputeProcessTimeperiodRow[] }>
    >(await res.json());
    if (!json) return { ok: false, message: "Invalid response" };
    if (json.success === true) {
      const list = Array.isArray(json.data?.timeperiods)
        ? json.data.timeperiods
        : [];
      return { ok: true, timeperiods: list };
    }
    return { ok: false, message: errMessage(json as Record<string, unknown>, res.status) };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Request failed",
    };
  }
}

export type ComputeProcessTimeLogRow = {
  id: number;
  name: string;
  /** Legacy display label (``Log 1``, ``Log 2``, …) — prefer over ``name`` in UI. */
  display_name?: string | null;
  status: string | null;
  total_jobs: number | null;
  total_executed: number | null;
  total_pending: number | null;
  total_failed: number | null;
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
  remarks: string | null;
  progress_percentage: number | null;
  filter_object: Record<string, unknown>;
};

export type ListTimeLogsForProcessTimeResult =
  | { ok: true; logs: ComputeProcessTimeLogRow[] }
  | { ok: false; message: string };

export async function listTimeLogsForProcessTime(
  dwId: string,
  processTimeId: number,
  locale?: string
): Promise<ListTimeLogsForProcessTimeResult> {
  const url = getDWAPIURL(
    dwId,
    `/compute/logs/time/${processTimeId}`
  );
  try {
    const res = await apiFetch(url, {
      method: "GET",
      headers: { ...acceptLangHeader(locale) },
    });
    const json = parseJson<
      ApiEnvelope<{ logs?: ComputeProcessTimeLogRow[] }>
    >(await res.json());
    if (!json) return { ok: false, message: "Invalid response" };
    if (json.success === true) {
      const list = Array.isArray(json.data?.logs) ? json.data.logs : [];
      return { ok: true, logs: list };
    }
    return { ok: false, message: errMessage(json as Record<string, unknown>, res.status) };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Request failed",
    };
  }
}

export type ComputeLogSourceDetailRow = {
  iname: string;
  uname: string;
  sname: string;
  area: string;
  timeperiod: string;
  source: string;
  dv: string | number | null;
};

export type ComputeLogDetailRow = {
  id: number;
  ius_gid: string;
  target_iname: string;
  target_uname: string;
  target_sname: string;
  area_id: string;
  area_name: string;
  time_period: string;
  process_type: string;
  source_name: string | null;
  data_value: number | null;
  remarks: string | null;
  source_details: ComputeLogSourceDetailRow[];
  job_payload: Record<string, unknown>;
  job_status: string;
  error_message: string | null;
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
};

export type ComputeLogInfo = {
  id: number;
  name: string;
  display_name?: string | null;
  status: string | null;
  total_jobs: number | null;
  total_executed: number | null;
  total_pending: number | null;
  total_failed: number | null;
  progress_percentage: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
  remarks?: string | null;
  process_time_id?: number | null;
  process_id?: number | null;
  process_type?: string | null;
  src_publisher?: string | null;
  src_title?: string | null;
  timeperiods?: string[];
  timeperiods_name?: string[];
  timeperiods_display?: string | null;
  target_ius_count?: number;
  target_ius?: string[];
  target_ius_display?: string | null;
  areas?: string[];
  areas_display?: string | null;
  area_level_name?: string | null;
  duration_display?: string | null;
  execution_type?: string | null;
  area_level_nid?: number | string | null;
  execution_filter_object?: Record<string, unknown>;
  process_filter_object?: Record<string, unknown>;
  /** Merged execution filter JSON (areas, ius_selection, timeperiods, …). */
  filter_object?: Record<string, unknown>;
};

export type ComputeLogExportFormat = "xlsx" | "csv" | "json";

export type GetLogDetailsResult =
  | {
      ok: true;
      log_info: ComputeLogInfo;
      details: ComputeLogDetailRow[];
      total_count: number;
      has_more: boolean;
    }
  | { ok: false; message: string };

export async function getComputeLogDetails(
  dwId: string,
  processTimeLogId: number,
  options?: { locale?: string; limit?: number; offset?: number }
): Promise<GetLogDetailsResult> {
  const limit = options?.limit ?? 100;
  const offset = options?.offset ?? 0;
  const q = `?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`;
  const url = getDWAPIURL(dwId, `/compute/logs/${processTimeLogId}${q}`);
  try {
    const res = await apiFetch(url, {
      method: "GET",
      headers: { ...acceptLangHeader(options?.locale) },
    });
    const raw = await res.json();
    const json = parseJson<
      ApiEnvelope<{
        log_info?: ComputeLogInfo;
        details?: ComputeLogDetailRow[];
      }> & { meta?: { total_count?: number; has_more?: boolean } }
    >(raw);
    if (!json) return { ok: false, message: "Invalid response" };
    if (json.success === true && json.data?.log_info) {
      const total =
        typeof json.meta?.total_count === "number"
          ? json.meta.total_count
          : Array.isArray(json.data.details)
            ? json.data.details.length
            : 0;
      const hasMore = Boolean(json.meta?.has_more);
      return {
        ok: true,
        log_info: json.data.log_info,
        details: Array.isArray(json.data.details) ? json.data.details : [],
        total_count: total,
        has_more: hasMore,
      };
    }
    return { ok: false, message: errMessage(json as Record<string, unknown>, res.status) };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Request failed",
    };
  }
}

export type ReExecuteProcessTimeResult =
  | {
      ok: true;
      process_time_id: number;
      process_time_log_id: number;
      estimated_jobs: number;
      status: string;
    }
  | { ok: false; message: string };

export type DeleteComputeExecutionLogResult =
  | { ok: true }
  | { ok: false; message: string };

export type DeleteComputeProcessTimeResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Soft-delete a process-time execution log (server marks it deleted; listing hides it).
 */
export async function deleteComputeExecutionLog(
  dwId: string,
  processTimeLogId: number,
  locale?: string
): Promise<DeleteComputeExecutionLogResult> {
  const url = getDWAPIURL(dwId, `/compute/logs/${processTimeLogId}`);
  try {
    const res = await apiFetch(url, {
      method: "DELETE",
      headers: { ...acceptLangHeader(locale) },
    });
    const json = parseJson<ApiEnvelope<unknown>>(await res.json());
    if (!json) return { ok: false, message: "Invalid response" };
    if (json.success === true) return { ok: true };
    return { ok: false, message: errMessage(json as Record<string, unknown>, res.status) };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Request failed",
    };
  }
}

/** DELETE /compute/process/time/{process_time_id} — remove a process-time run and its logs. */
export async function deleteComputeProcessTime(
  dwId: string,
  processTimeId: number,
  locale?: string
): Promise<DeleteComputeProcessTimeResult> {
  const url = getDWAPIURL(
    dwId,
    `/compute/process/time/${processTimeId}`
  );
  try {
    const res = await apiFetch(url, {
      method: "DELETE",
      headers: { ...acceptLangHeader(locale) },
    });
    const json = parseJson<ApiEnvelope<unknown>>(await res.json());
    if (!json) return { ok: false, message: "Invalid response" };
    if (json.success === true) return { ok: true };
    return { ok: false, message: errMessage(json as Record<string, unknown>, res.status) };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Request failed",
    };
  }
}

/**
 * GET /compute/logs/{id}/export — full job-detail export (no pagination).
 */
export async function downloadComputeLogExport(
  dwId: string,
  processTimeLogId: number,
  format: ComputeLogExportFormat = "xlsx"
): Promise<{ ok: true } | { ok: false; message: string }> {
  const q = new URLSearchParams({ format });
  const url = getDWAPIURL(
    dwId,
    `/compute/logs/${processTimeLogId}/export?${q.toString()}`
  );
  const acceptByFormat: Record<ComputeLogExportFormat, string> = {
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*",
    csv: "text/csv,*/*",
    json: "application/json,*/*",
  };
  try {
    const res = await getFileResponse(url, acceptByFormat[format]);
    const contentType = res.headers.get("Content-Type") ?? "";

    if (!res.ok) {
      if (contentType.includes("application/json")) {
        try {
          const json = (await res.json()) as {
            err_message?: string;
            message?: string;
          };
          return {
            ok: false,
            message:
              json.err_message ??
              json.message ??
              `Export failed (${res.status})`,
          };
        } catch {
          return { ok: false, message: `Export failed (${res.status})` };
        }
      }
      return { ok: false, message: `Export failed (${res.status})` };
    }

    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition");
    const ext = format === "xlsx" ? "xlsx" : format === "csv" ? "csv" : "json";
    let filename = `compute-log-${processTimeLogId}.${ext}`;
    if (cd) {
      const quoted = cd.match(/filename="([^"]+)"/i);
      const unquoted = cd.match(/filename=([^;\s]+)/i);
      const raw = quoted?.[1] ?? unquoted?.[1];
      if (raw) filename = raw.replace(/^["']|["']$/g, "");
    }

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Export failed",
    };
  }
}

export async function reExecuteProcessTime(
  dwId: string,
  processTimeId: number,
  locale?: string
): Promise<ReExecuteProcessTimeResult> {
  const url = getDWAPIURL(
    dwId,
    `/compute/process/time/${processTimeId}/re-execute`
  );
  try {
    const res = await apiFetch(url, {
      method: "POST",
      headers: { ...acceptLangHeader(locale) },
    });
    const json = parseJson<
      ApiEnvelope<{
        process_time_id?: number;
        process_time_log_id?: number;
        estimated_jobs?: number;
        status?: string;
      }>
    >(await res.json());
    if (!json) return { ok: false, message: "Invalid response" };
    if (json.success === true && json.data) {
      return {
        ok: true,
        process_time_id: json.data.process_time_id ?? processTimeId,
        process_time_log_id: json.data.process_time_log_id ?? 0,
        estimated_jobs: json.data.estimated_jobs ?? 0,
        status: json.data.status ?? "",
      };
    }
    return { ok: false, message: errMessage(json as Record<string, unknown>, res.status) };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Request failed",
    };
  }
}
