import type { ExportPayload, ExportDataRow } from "./types";
import { downloadBlob } from "./downloadUtils";

/**
 * Converts payload rows to array of objects (headers as keys).
 * Missing values become null.
 */
function payloadToDataRows(payload: ExportPayload): ExportDataRow[] {
  const { headers, rows } = payload;
  return rows.map((row) => {
    const obj: ExportDataRow = {};
    headers.forEach((h, i) => {
      const v = row[i];
      obj[h] = v === "" || (typeof v === "number" && Number.isNaN(v)) ? null : v;
    });
    return obj;
  });
}

/**
 * Downloads payload as JSON: { meta, data } with pretty-print.
 */
export function downloadJSON(payload: ExportPayload, filename: string): void {
  const data = payloadToDataRows(payload);
  const json = JSON.stringify({ meta: payload.meta, data }, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  downloadBlob(blob, filename, "application/json");
}
