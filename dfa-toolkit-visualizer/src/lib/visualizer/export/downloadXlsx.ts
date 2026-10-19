import type { ExportPayload } from "./types";
import { downloadBlob } from "./downloadUtils";

function buildMetadataRows(meta: ExportPayload["meta"]): (string | number)[][] {
  const rows: (string | number)[][] = [];
  const timeRange =
    meta.timeStart != null && meta.timeEnd != null
      ? `${meta.timeStart}-${meta.timeEnd}`
      : "";

  if (meta.mode === "legacy") {
    rows.push(["Indicator", meta.indicatorName]);
    rows.push(["Code", meta.indicatorCode]);
    rows.push(["Unit", meta.unit]);
    rows.push(["Time range", timeRange]);
    rows.push(["Areas", meta.areas.join("; ")]);
    rows.push(["Subgroups", meta.subgroups.join("; ")]);
  } else {
    rows.push(["Indicators", meta.indicators.map((i) => i.name).join("; ")]);
    rows.push(["Units", [...new Set(meta.indicators.map((i) => i.unit).filter(Boolean))].join("; ")]);
    rows.push(["Time range", timeRange]);
    rows.push(["Areas", meta.areas.join("; ")]);
    rows.push(["Subgroups", meta.subgroups.join("; ")]);
  }

  rows.push(["Exported", meta.exportedAt]);
  return rows;
}

/**
 * Downloads payload as a real .xlsx file. Uses dynamic import so the xlsx
 * library is only loaded when the user chooses XLSX export.
 */
export async function downloadXLSX(payload: ExportPayload, filename: string): Promise<void> {
  const XLSX = await import("xlsx");

  const { meta, headers, rows } = payload;
  const sheetData: (string | number)[][] = [];

  for (const row of buildMetadataRows(meta)) {
    sheetData.push(row);
  }
  sheetData.push([]);
  sheetData.push(headers);
  rows.forEach((row) => sheetData.push(row));

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");

  const wbout = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
