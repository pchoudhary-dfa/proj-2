import type { FontStyle } from "@/lib/visualizer/types";

export interface ChartExportImageOptions {
  chartDataUrl: string;
  format: "png" | "jpg";
  title: string;
  /** Unit or other summary shown below title (e.g. from API rows). */
  subtitle?: string;
  description: string;
  showDescription: boolean;
  descriptionPosition: "above" | "below";
  titleFont: FontStyle;
  subtitleFont: FontStyle;
  descriptionFont: FontStyle;
  filename: string;
  /** Background color for the full exported image (the "chart area"). Defaults to white. */
  chartAreaBackgroundColor?: string;
}

export interface ChartExportSvgOptions {
  /** When chart is canvas-rendered (ECharts default), pass PNG data URL and we embed it as <image>. */
  chartImageDataUrl?: string;
  /** When chart is SVG-rendered, pass SVG data URL for vector embedding. Ignored if chartImageDataUrl is set. */
  chartSvgDataUrl?: string;
  title: string;
  /** Unit or other summary shown below title. */
  subtitle?: string;
  description: string;
  showDescription: boolean;
  descriptionPosition: "above" | "below";
  titleFont: FontStyle;
  subtitleFont: FontStyle;
  descriptionFont: FontStyle;
  filename: string;
  /** Background color for the full exported SVG (the "chart area"). Defaults to white. */
  chartAreaBackgroundColor?: string;
}

const PADDING = 20;
const TITLE_DESC_GAP = 8;
const CHART_TOP_GAP = 16;

export const LAYOUT = {
  PADDING,
  TITLE_DESC_GAP,
  CHART_TOP_GAP,
} as const;
