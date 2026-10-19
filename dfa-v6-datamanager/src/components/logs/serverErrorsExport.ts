import { getFileResponse } from "@/lib/api/http";
import { LOGS_SERVER_ERRORS_API_URL } from "@/lib/constants";

export type ExportServerErrorsParams = {
  sort_field?: string;
  sort_order?: "asc" | "desc";
  level?: string;
  method?: string;
  status_code?: number;
  search?: string;
  search_by?: string;
};

/**
 * GET /logs/server-errors?export=true — XLSX of all rows matching filters (no pagination).
 */
export async function downloadServerErrorsExport(
  params: ExportServerErrorsParams = {}
): Promise<{ ok: true } | { ok: false; message: string }> {
  const searchParams = new URLSearchParams();
  searchParams.set("export", "true");
  if (params.sort_field) searchParams.set("sort_field", params.sort_field);
  if (params.sort_order) searchParams.set("sort_order", params.sort_order);
  if (params.level) searchParams.set("level", params.level);
  if (params.method) searchParams.set("method", params.method);
  if (params.status_code != null) {
    searchParams.set("status_code", String(params.status_code));
  }
  if (params.search) searchParams.set("search", params.search);
  if (params.search_by) searchParams.set("search_by", params.search_by);

  const url = `${LOGS_SERVER_ERRORS_API_URL}?${searchParams.toString()}`;
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
  let filename = `server-errors-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
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
