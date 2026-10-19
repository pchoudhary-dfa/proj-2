import type { ExportPayload } from "./types";
import { downloadBlob } from "./downloadUtils";

function escapeCsvField(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowToCsvLine(row: (string | number)[]): string {
  return row.map(escapeCsvField).join(",");
}

function buildMetadataLines(meta: ExportPayload["meta"]): string[] {
  const lines: string[] = [];
  const timeRange =
    meta.timeStart != null && meta.timeEnd != null
      ? `${meta.timeStart}-${meta.timeEnd}`
      : "";

  if (meta.mode === "legacy") {
    lines.push(rowToCsvLine(["Indicator", meta.indicatorName]));
    lines.push(rowToCsvLine(["Code", meta.indicatorCode]));
    lines.push(rowToCsvLine(["Unit", meta.unit]));
    lines.push(rowToCsvLine(["Time range", timeRange]));
    lines.push(rowToCsvLine(["Areas", meta.areas.join("; ")]));
    lines.push(rowToCsvLine(["Subgroups", meta.subgroups.join("; ")]));
  } else {
    lines.push(rowToCsvLine(["Indicators", meta.indicators.map((i) => i.name).join("; ")]));
    lines.push(rowToCsvLine(["Units", [...new Set(meta.indicators.map((i) => i.unit).filter(Boolean))].join("; ")]));
    lines.push(rowToCsvLine(["Time range", timeRange]));
    lines.push(rowToCsvLine(["Areas", meta.areas.join("; ")]));
    lines.push(rowToCsvLine(["Subgroups", meta.subgroups.join("; ")]));
  }

  lines.push(rowToCsvLine(["Exported", meta.exportedAt]));
  return lines;
}

/**
 * Downloads payload as CSV with UTF-8 BOM, metadata rows, then header + data.
 */
export function downloadCSV(payload: ExportPayload, filename: string): void {
  const { meta, headers, rows } = payload;
  const lines: string[] = [];

  for (const line of buildMetadataLines(meta)) {
    lines.push(line);
  }
  lines.push(rowToCsvLine([])); // blank row
  lines.push(rowToCsvLine(headers));
  rows.forEach((row) => lines.push(rowToCsvLine(row)));

  const csv = lines.join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, filename, "text/csv;charset=utf-8");
}
