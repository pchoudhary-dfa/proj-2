export type { ChartExportImageOptions, ChartExportSvgOptions } from "./types";
export { exportChartAsImage } from "./compositeImage";
export { exportChartAsSvg } from "./compositeSvg";

/**
 * Suggested filename for chart image export (indicator code + time range).
 */
export function getChartExportFilename(
  indicatorCode: string,
  timeStart: number | null,
  timeEnd: number | null,
  extension: "svg" | "png" | "jpg"
): string {
  const code = indicatorCode || "chart";
  const range =
    timeStart != null && timeEnd != null ? `${timeStart}-${timeEnd}` : "export";
  return `${code}_chart_${range}.${extension}`;
}
