import type { ChartExportImageOptions } from "./types";
import { LAYOUT } from "./types";
import { getCanvasFontString, wrapText } from "./fontUtils";
import { downloadBlob } from "@/lib/visualizer/export/downloadUtils";

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load chart image"));
    img.src = dataUrl;
  });
}

/**
 * Build composite PNG or JPG with title and description, then trigger download.
 */
export async function exportChartAsImage(options: ChartExportImageOptions): Promise<void> {
  const {
    chartDataUrl,
    format,
    title,
    subtitle,
    description,
    showDescription,
    descriptionPosition,
    titleFont,
    subtitleFont,
    descriptionFont,
    filename,
    chartAreaBackgroundColor,
  } = options;

  const img = await loadImage(chartDataUrl);
  const chartWidth = img.naturalWidth;
  const chartHeight = img.naturalHeight;

  const padding = LAYOUT.PADDING;
  const titleDescGap = LAYOUT.TITLE_DESC_GAP;
  const chartTopGap = LAYOUT.CHART_TOP_GAP;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.font = getCanvasFontString(titleFont);
  const titleHeight = titleFont.size * 1.2;
  const titleLines = title ? wrapText(ctx, title, chartWidth - padding * 2) : [];
  const titleBlockHeight =
    titleLines.length > 0 ? titleLines.length * titleHeight + (titleLines.length - 1) * 2 : 0;

  const subtitleHeight = subtitleFont.size * 1.2;
  ctx.font = getCanvasFontString(subtitleFont);
  const subtitleLines = subtitle?.trim() ? wrapText(ctx, subtitle, chartWidth - padding * 2) : [];
  const subtitleBlockHeight =
    subtitleLines.length > 0
      ? subtitleLines.length * subtitleHeight + (subtitleLines.length - 1) * 2 + (titleBlockHeight > 0 ? 4 : 0)
      : 0;

  let descAboveHeight = 0;
  let descBelowHeight = 0;
  let descAboveLines: string[] = [];
  let descBelowLines: string[] = [];

  if (showDescription && description.trim()) {
    ctx.font = getCanvasFontString(descriptionFont);
    const lineHeight = descriptionFont.size * 1.3;
    const maxDescWidth = chartWidth - padding * 2;
    const lines = wrapText(ctx, description, maxDescWidth);
    const descBlockHeight = lines.length * lineHeight + (lines.length - 1) * 2;
    if (descriptionPosition === "above") {
      descAboveLines = lines;
      descAboveHeight = descBlockHeight + titleDescGap;
    } else {
      descBelowLines = lines;
      descBelowHeight = descBlockHeight + chartTopGap;
    }
  }

  const topBlockHeight =
    padding +
    titleBlockHeight +
    (titleBlockHeight > 0 ? chartTopGap : 0) +
    subtitleBlockHeight +
    (subtitleBlockHeight > 0 ? 4 : 0) +
    descAboveHeight;
  const totalHeight =
    topBlockHeight + chartHeight + descBelowHeight + (descBelowLines.length > 0 ? titleDescGap : 0) + padding;
  const totalWidth = chartWidth + padding * 2;

  canvas.width = totalWidth;
  canvas.height = totalHeight;

  ctx.fillStyle = chartAreaBackgroundColor?.trim() || "#ffffff";
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  ctx.fillStyle = "#111827";
  ctx.textBaseline = "top";
  let y = padding;

  if (titleLines.length > 0) {
    ctx.font = getCanvasFontString(titleFont);
    ctx.fillStyle = "#111827";
    for (const line of titleLines) {
      ctx.fillText(line, padding, y);
      y += titleHeight + 2;
    }
    y += chartTopGap;
  }

  if (subtitleLines.length > 0) {
    ctx.font = getCanvasFontString(subtitleFont);
    ctx.fillStyle = "#4b5563";
    for (const line of subtitleLines) {
      ctx.fillText(line, padding, y);
      y += subtitleHeight + 2;
    }
    y += 4;
  }

  if (descAboveLines.length > 0) {
    ctx.font = getCanvasFontString(descriptionFont);
    ctx.fillStyle = "#4b5563";
    const lineHeight = descriptionFont.size * 1.3;
    for (const line of descAboveLines) {
      ctx.fillText(line, padding, y);
      y += lineHeight + 2;
    }
    y += titleDescGap;
  }

  ctx.drawImage(img, padding, y, chartWidth, chartHeight);
  y += chartHeight;

  if (descBelowLines.length > 0) {
    y += chartTopGap;
    ctx.font = getCanvasFontString(descriptionFont);
    ctx.fillStyle = "#4b5563";
    const lineHeight = descriptionFont.size * 1.3;
    for (const line of descBelowLines) {
      ctx.fillText(line, padding, y);
      y += lineHeight + 2;
    }
  }

  const mimeType = format === "jpg" ? "image/jpeg" : "image/png";
  const quality = format === "jpg" ? 0.92 : undefined;

  canvas.toBlob(
    (blob) => {
      if (blob) downloadBlob(blob, filename, mimeType);
    },
    mimeType,
    quality
  );
}
