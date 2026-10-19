/**
 * Maps visualization settings `value` fields to translation codes for chart types,
 * variants, and legend positions. Resolved at render via CoreContext `t(code)`.
 */

export const CHART_TYPE_TRANSLATION_CODE: Record<string, string> = {
  line: "VISUALIZER_CHART_LINE",
  bar: "VISUALIZER_CHART_BAR",
  area: "VISUALIZER_CHART_AREA",
  pie: "VISUALIZER_CHART_PIE",
  advanced: "VISUALIZER_CHART_ADVANCED",
};

export const CHART_VARIANT_TRANSLATION_CODE: Record<string, string> = {
  vertical: "VISUALIZER_VARIANT_VERTICAL",
  horizontal: "VISUALIZER_VARIANT_HORIZONTAL",
  "stacked-vertical": "VISUALIZER_VARIANT_STACKED_VERTICAL",
  "stacked-horizontal": "VISUALIZER_VARIANT_STACKED_HORIZONTAL",
  straight: "VISUALIZER_VARIANT_STRAIGHT",
  curved: "VISUALIZER_VARIANT_CURVED",
  stepped: "VISUALIZER_VARIANT_STEPPED",
  full: "VISUALIZER_VARIANT_FULL_CIRCLE",
  donut: "VISUALIZER_VARIANT_DONUT",
  semi: "VISUALIZER_VARIANT_SEMI_CIRCLE",
  waffle: "VISUALIZER_VARIANT_WAFFLE_CHART",
  scatter: "VISUALIZER_VARIANT_SCATTER_PLOT",
  heatmap: "VISUALIZER_VARIANT_HEAT_MAP",
  treemap: "VISUALIZER_VARIANT_TREE_MAP",
  spider: "VISUALIZER_VARIANT_SPIDER_CHART",
  pyramid: "VISUALIZER_VARIANT_PYRAMID",
  map: "VISUALIZER_VARIANT_MAP",
};

export const LEGEND_POSITION_TRANSLATION_CODE: Record<string, string> = {
  top: "VISUALIZER_LEGEND_TOP",
  bottom: "VISUALIZER_LEGEND_BOTTOM",
  left: "VISUALIZER_LEGEND_LEFT",
  right: "VISUALIZER_LEGEND_RIGHT",
};

export function chartTypeTranslatedLabel(
  typeValue: string,
  t: (code: string) => string
): string {
  const code = CHART_TYPE_TRANSLATION_CODE[typeValue];
  return code ? t(code) : typeValue;
}

export function chartVariantTranslatedLabel(
  variantValue: string,
  t: (code: string) => string
): string {
  const code = CHART_VARIANT_TRANSLATION_CODE[variantValue];
  return code ? t(code) : variantValue;
}

export function legendPositionTranslatedLabel(
  position: string,
  t: (code: string) => string
): string {
  const code = LEGEND_POSITION_TRANSLATION_CODE[position];
  return code ? t(code) : position;
}
