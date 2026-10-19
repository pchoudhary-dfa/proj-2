import { getFileResponse } from "@/lib/api/http";
import { LOGS_TRANSACTIONS_API_URL } from "@/lib/constants";

export type ExportTransactionLogsParams = {
  dw_id?: number;
  action?: string;
  status?: string;
  sort_field?: string;
  sort_order?: "asc" | "desc";
  search?: string;
  search_by?: string;
};

/**
 * GET /logs/transactions?export=true — XLSX of all rows matching filters (no pagination).
 */
export async function downloadTransactionLogsExport(
  params: ExportTransactionLogsParams = {}
): Promise<{ ok: true } | { ok: false; message: string }> {
  const searchParams = new URLSearchParams();
  searchParams.set("export", "true");
  if (params.dw_id != null) searchParams.set("dw_id", String(params.dw_id));
  if (params.action) searchParams.set("action", params.action);
  if (params.status) searchParams.set("status", params.status);
  if (params.sort_field) searchParams.set("sort_field", params.sort_field);
  if (params.sort_order) searchParams.set("sort_order", params.sort_order);
  if (params.search) searchParams.set("search", params.search);
  if (params.search_by) searchParams.set("search_by", params.search_by);

  const url = `${LOGS_TRANSACTIONS_API_URL}?${searchParams.toString()}`;
  const res = await getFileResponse(url);
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
            json.err_message ?? json.message ?? `Export failed (${res.status})`,
        };
      } catch {
        return { ok: false, message: `Export failed (${res.status})` };
      }
    }
    return { ok: false, message: `Export failed (${res.status})` };
  }

  if (contentType.includes("application/json")) {
    try {
      const json = (await res.json()) as { err_message?: string };
      return {
        ok: false,
        message: json.err_message ?? "Unexpected JSON response",
      };
    } catch {
      return { ok: false, message: "Unexpected response" };
    }
  }

  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition");
  let filename = `transaction-logs-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
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
}
