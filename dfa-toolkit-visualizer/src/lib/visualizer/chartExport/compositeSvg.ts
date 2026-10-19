import type { ChartExportSvgOptions } from "./types";
import { LAYOUT } from "./types";
import { getSvgFontAttributes } from "./fontUtils";
import { downloadBlob } from "@/lib/visualizer/export/downloadUtils";

function decodeSvgDataUrl(dataUrl: string): string {
  if (!dataUrl.startsWith("data:image/svg+xml")) return dataUrl;
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) return dataUrl;
  const payload = dataUrl.slice(commaIdx + 1);
  if (dataUrl.includes(";base64,")) {
    return decodeURIComponent(
      atob(payload)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  }
  return decodeURIComponent(payload);
}

function getSvgDimensions(svgString: string): { width: number; height: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return { width: 800, height: 400 };
  const viewBox = svg.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox.trim().split(/\s+/);
    if (parts.length >= 4) {
      return { width: Number(parts[2]) || 800, height: Number(parts[3]) || 400 };
    }
  }
  const w = svg.getAttribute("width");
  const h = svg.getAttribute("height");
  if (w && h) {
    const width = parseInt(w, 10) || 800;
    const height = parseInt(h, 10) || 400;
    return { width, height };
  }
  return { width: 800, height: 400 };
}

/**
 * Get the chart SVG element to embed. We use the full root <svg> (outerHTML) so the
 * chart keeps its viewBox, dimensions, defs, and all children—embedding just innerHTML
 * can lose structure or produce an empty/nested viewport that doesn't render.
 */
function getChartSvgToEmbed(svgString: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const rootSvg = doc.querySelector("svg");
  if (!rootSvg) return svgString;
  let w = rootSvg.getAttribute("width");
  let h = rootSvg.getAttribute("height");
  if (!w || !h) {
    const vb = rootSvg.getAttribute("viewBox");
    if (vb) {
      const parts = vb.trim().split(/\s+/);
      if (parts.length >= 4) {
        w = w || parts[2];
        h = h || parts[3];
      }
    }
    if (!w) w = "800";
    if (!h) h = "400";
    rootSvg.setAttribute("width", w);
    rootSvg.setAttribute("height", h);
  }
  return rootSvg.outerHTML;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to load chart image"));
    img.src = dataUrl;
  });
}

/**
 * Build composite SVG with title and description, then trigger download.
 * When chart is canvas-rendered, pass chartImageDataUrl (PNG); we embed it as <image>.
 */
export async function exportChartAsSvg(options: ChartExportSvgOptions): Promise<void> {
  const {
    chartImageDataUrl,
    chartSvgDataUrl,
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

  let chartWidth: number;
  let chartHeight: number;
  let chartContentSvg: string;

  if (chartImageDataUrl) {
    const dims = await loadImageDimensions(chartImageDataUrl);
    chartWidth = dims.width;
    chartHeight = dims.height;
    chartContentSvg = `<image href="${chartImageDataUrl.replace(/"/g, "&quot;")}" x="0" y="0" width="${chartWidth}" height="${chartHeight}" preserveAspectRatio="xMidYMid meet"/>`;
  } else if (chartSvgDataUrl) {
    const svgString = decodeSvgDataUrl(chartSvgDataUrl);
    const dims = getSvgDimensions(svgString);
    chartWidth = dims.width;
    chartHeight = dims.height;
    chartContentSvg = getChartSvgToEmbed(svgString);
  } else {
    return;
  }

  const padding = LAYOUT.PADDING;
  const titleDescGap = LAYOUT.TITLE_DESC_GAP;
  const chartTopGap = LAYOUT.CHART_TOP_GAP;

  const titleAttrs = getSvgFontAttributes(titleFont);
  const subtitleAttrs = getSvgFontAttributes(subtitleFont);
  const descAttrs = getSvgFontAttributes(descriptionFont);

  const titleLineHeight = titleFont.size * 1.2;
  const titleLines = title ? title.split("\n").filter((s) => s.length > 0) : [];
  const titleBlockHeight =
    titleLines.length > 0 ? titleLines.length * titleLineHeight + (titleLines.length - 1) * 2 : 0;

  const subtitleLineHeight = subtitleFont.size * 1.2;
  const subtitleLines = subtitle?.trim() ? subtitle.split("\n").filter((s) => s.length > 0) : [];
  const subtitleBlockHeight =
    subtitleLines.length > 0
      ? subtitleLines.length * subtitleLineHeight +
        (subtitleLines.length - 1) * 2 +
        (titleBlockHeight > 0 ? 4 : 0)
      : 0;

  const descLineHeight = descriptionFont.size * 1.3;
  const descLines =
    showDescription && description.trim()
      ? description.split("\n").filter((s) => s.length > 0)
      : [];
  const descBlockHeight = descLines.length > 0 ? descLines.length * descLineHeight + (descLines.length - 1) * 2 : 0;

  let descAboveHeight = 0;
  let descBelowHeight = 0;
  if (descLines.length > 0) {
    if (descriptionPosition === "above") {
      descAboveHeight = descBlockHeight + titleDescGap;
    } else {
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
  const chartOffsetY = topBlockHeight;
  const totalHeight =
    topBlockHeight +
    chartHeight +
    descBelowHeight +
    (descLines.length > 0 && descriptionPosition === "below" ? titleDescGap : 0) +
    padding;
  const totalWidth = chartWidth + padding * 2;

  const titleAttrsStr = Object.entries(titleAttrs)
    .map(([k, v]) => `${k}="${escapeXml(v)}"`)
    .join(" ");
  const subtitleAttrsStr = Object.entries(subtitleAttrs)
    .map(([k, v]) => `${k}="${escapeXml(v)}"`)
    .join(" ");
  const descAttrsStr = Object.entries(descAttrs)
    .map(([k, v]) => `${k}="${escapeXml(v)}"`)
    .join(" ");

  let titleSvg = "";
  if (titleLines.length > 0) {
    titleSvg = `<g><text x="${padding}" y="${padding}" ${titleAttrsStr} fill="#111827">${titleLines
      .map(
        (line, i) =>
          `<tspan x="${padding}" dy="${i === 0 ? 0 : titleLineHeight + 2}">${escapeXml(line)}</tspan>`
      )
      .join("")}</text></g>`;
  }

  let subtitleSvg = "";
  if (subtitleLines.length > 0) {
    const subtitleY =
      padding + titleBlockHeight + (titleBlockHeight > 0 ? chartTopGap : 0);
    subtitleSvg = `<g><text x="${padding}" y="${subtitleY}" ${subtitleAttrsStr} fill="#4b5563">${subtitleLines
      .map(
        (line, i) =>
          `<tspan x="${padding}" dy="${i === 0 ? 0 : subtitleLineHeight + 2}">${escapeXml(line)}</tspan>`
      )
      .join("")}</text></g>`;
  }

  let descAboveSvg = "";
  if (descLines.length > 0 && descriptionPosition === "above") {
    const descY =
      padding +
      titleBlockHeight +
      (titleBlockHeight > 0 ? chartTopGap : 0) +
      subtitleBlockHeight +
      (subtitleBlockHeight > 0 ? 4 : 0);
    descAboveSvg = `<g><text x="${padding}" y="${descY}" ${descAttrsStr} fill="#4b5563">${descLines
      .map(
        (line, i) =>
          `<tspan x="${padding}" dy="${i === 0 ? 0 : descLineHeight + 2}">${escapeXml(line)}</tspan>`
      )
      .join("")}</text></g>`;
  }

  let descBelowSvg = "";
  if (descLines.length > 0 && descriptionPosition === "below") {
    const descY = chartOffsetY + chartHeight + chartTopGap;
    descBelowSvg = `<g><text x="${padding}" y="${descY}" ${descAttrsStr} fill="#4b5563">${descLines
      .map(
        (line, i) =>
          `<tspan x="${padding}" dy="${i === 0 ? 0 : descLineHeight + 2}">${escapeXml(line)}</tspan>`
      )
      .join("")}</text></g>`;
  }

  const outerSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}">
  <rect width="100%" height="100%" fill="${chartAreaBackgroundColor?.trim() || "white"}"/>
  ${titleSvg}
  ${subtitleSvg}
  ${descAboveSvg}
  <g transform="translate(${padding}, ${chartOffsetY})">${chartContentSvg}</g>
  ${descBelowSvg}
</svg>`;

  const blob = new Blob([outerSvg], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename, "image/svg+xml");
}
