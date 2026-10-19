import type { FontStyle, RequiredFontStyle } from './types';

export const DEFAULT_TITLE_SIZE = 16;
export const DEFAULT_SUBTITLE_SIZE = 12;
export const DEFAULT_CUSTOM_LABEL_SIZE = 11;
export const DEFAULT_FONT_FAMILY = 'sans-serif';

/** U+0332 COMBINING LOW LINE — renders underline on canvas where CSS textDecoration is unsupported. */
const COMBINING_LOW_LINE = '\u0332';

/**
 * ECharts uses the canvas renderer (zrender). ZRender does not implement CSS textDecoration.
 * Underline is simulated with combining low-line characters (per-grapheme).
 * @see https://github.com/apache/echarts/issues/16295
 */
export const ECHARTS_CANVAS_SUPPORTS_TEXT_DECORATION = false;

/**
 * Apply canvas-safe underline by inserting a combining low line between characters.
 * The mark is placed only BETWEEN glyphs (not after the final one): fonts render the
 * low-line biased slightly right of its base glyph, so a trailing mark overhangs past
 * the last character as a detached segment and makes the whole rule look shifted right.
 * Placing it between characters keeps every glyph covered without the stray tail.
 * Regular spaces become non-breaking spaces so the rule stays continuous across gaps.
 * Combining marks are zero-width, so layout/measurement is unchanged.
 *
 * NOTE: This approach produces per-glyph strokes that can appear uneven across fonts.
 * For custom series renderItem text elements, prefer drawing an explicit `line` graphic
 * element below the text using measureTextWidth() instead of this function.
 */
export function applyCanvasUnderline(text: string): string {
  if (!text) return text;
  return [...text]
    .map((ch) => (ch === ' ' ? '\u00A0' : ch))
    .join(COMBINING_LOW_LINE);
}

/**
 * Format a numeric axis tick value with thousand separators (matching ECharts default).
 * Preserves decimals if present.
 */
export function formatAxisTickNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value % 1 === 0) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Build axis tick label config for x/y axis ticks.
 *
 * Underline is intentionally NOT applied to axis tick labels. Ticks can only use the
 * combining low-line technique (rich-text rule rows change the label bounding box and
 * break ECharts tick spacing/number formatting), but combining marks split the rule,
 * undershoot the glyph width, and distort proportional digits, italics, and rotation.
 * Data-point labels, legend, and axis names keep their reliable rich-text underline.
 *
 * All other font styling (size, bold, italic, color) and optional number formatting
 * are still honored here.
 */
export function buildAxisTickLabelWithUnderline(
  font: FontStyle | RequiredFontStyle,
  defaultSize: number,
  extra?: Record<string, unknown>,
  formatTick?: (value: string | number) => string,
): Record<string, unknown> {
  const textStyle = buildEchartsTextStyle(font, { size: defaultSize, family: font?.family });
  if (!formatTick) {
    return { ...textStyle, ...extra };
  }
  return {
    ...textStyle,
    ...extra,
    formatter: (value: string | number) => formatTick(value),
  };
}

/** Escape `{` / `}` for ECharts rich-text formatters. */
export function escapeRichText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

export const RICH_UL_TEXT = 'dfaUlT';
/** Prefix for measured-width underline row styles (`dfaUlW42` = 42px rule). */
export const RICH_UL_LINE_PREFIX = 'dfaUlW';
/** Prefix for measured-width text row styles (`dfaUlT42` = 42px text box). */
export const RICH_UL_TEXT_PREFIX = 'dfaUlT';

function richUnderlineLineKey(widthPx: number): string {
  return `${RICH_UL_LINE_PREFIX}${Math.max(1, Math.ceil(widthPx))}`;
}

function richUnderlineTextKey(widthPx: number): string {
  return `${RICH_UL_TEXT_PREFIX}${Math.max(1, Math.ceil(widthPx))}`;
}

function registerRichUnderlineWidth(
  rich: Record<string, unknown>,
  widthPx: number,
  font: FontStyle | RequiredFontStyle | undefined,
  defaultSize: number,
  stroke: string,
  align: 'left' | 'center' = 'center'
): number {
  const width = Math.max(1, Math.ceil(widthPx));
  const textKey = richUnderlineTextKey(width);
  const lineKey = richUnderlineLineKey(width);
  if (!rich[textKey]) {
    rich[textKey] = {
      ...buildEchartsTextStyle(font, { size: defaultSize, family: font?.family }),
      width,
      align,
    };
  }
  if (!rich[lineKey]) {
    rich[lineKey] = {
      height: 0,
      width,
      align,
      borderColor: stroke,
      borderWidth: 1,
    };
  }
  return width;
}

function primeRichUnderlineWidths(
  rich: Record<string, unknown>,
  font: FontStyle | RequiredFontStyle | undefined,
  defaultSize: number,
  stroke: string,
  texts: string[],
  align: 'left' | 'center' = 'center'
): void {
  for (const text of texts) {
    if (!text) continue;
    registerRichUnderlineWidth(rich, measureTextWidth(text, font, defaultSize), font, defaultSize, stroke, align);
  }
}

function closestRegisteredUnderlineKey(rich: Record<string, unknown>, width: number): string | null {
  const widths = Object.keys(rich)
    .filter((k) => k.startsWith(RICH_UL_LINE_PREFIX))
    .map((k) => Number(k.slice(RICH_UL_LINE_PREFIX.length)))
    .filter((w) => Number.isFinite(w));
  if (widths.length === 0) return null;
  const closest = widths.reduce((best, w) =>
    Math.abs(w - width) < Math.abs(best - width) ? w : best
  );
  return richUnderlineLineKey(closest);
}

export interface RichUnderlinePack {
  rich: Record<string, unknown>;
  formatUnderlined: (text: string) => string;
}

/**
 * Rich-text underline with a measured-width rule row per distinct string width.
 * `primeTexts` must include every label string that may appear at runtime.
 */
export function buildMeasuredRichUnderlinePack(
  font: FontStyle | RequiredFontStyle | undefined,
  defaultSize: number,
  primeTexts: string[] = [],
  align: 'left' | 'center' = 'center'
): RichUnderlinePack {
  const stroke = resolveUnderlineColor(font);
  const rich: Record<string, unknown> = {};
  primeRichUnderlineWidths(rich, font, defaultSize, stroke, primeTexts, align);

  return {
    rich,
    formatUnderlined: (text: string) => {
      const width = Math.max(1, Math.ceil(measureTextWidth(text, font, defaultSize)));
      let textKey = richUnderlineTextKey(width);
      let lineKey = richUnderlineLineKey(width);
      if (!rich[textKey] || !rich[lineKey]) {
        const fallback = closestRegisteredUnderlineKey(rich, width);
        if (!fallback) return text;
        textKey = richUnderlineTextKey(Number(fallback.slice(RICH_UL_LINE_PREFIX.length)));
        lineKey = fallback;
      }
      return `{${textKey}|${escapeRichText(text)}}\n{${lineKey}| }`;
    },
  };
}

/**
 * Rich-text underline: text row + 1px rule row (single fixed or percentage width).
 * Prefer `buildMeasuredRichUnderlinePack` when label strings are known at build time.
 */
export function buildRichUnderlinePack(
  font: FontStyle | RequiredFontStyle | undefined,
  defaultSize: number,
  lineWidth: number | '100%' = '100%'
): RichUnderlinePack {
  const textStyle = {
    ...buildEchartsTextStyle(font, { size: defaultSize, family: font?.family }),
    align: 'center',
  };
  const lineKey = lineWidth === '100%' ? 'dfaUlL' : richUnderlineLineKey(lineWidth);
  const rich: Record<string, unknown> = {
    [RICH_UL_TEXT]: textStyle,
    [lineKey]: {
      height: 0,
      width: lineWidth === '100%' ? '100%' : Math.ceil(lineWidth),
      align: 'center',
      borderColor: resolveUnderlineColor(font),
      borderWidth: 1,
    },
  };
  return {
    rich,
    formatUnderlined: (text: string) =>
      `{${RICH_UL_TEXT}|${escapeRichText(text)}}\n{${lineKey}| }`,
  };
}

/** Axis title `name` + `nameTextStyle` with optional rich underline (measured line width). */
export function buildAxisNameOptions(
  label: string,
  font: FontStyle | undefined,
  defaultSize: number
): { name: string; nameTextStyle: Record<string, unknown> } {
  const plainStyle = buildEchartsTextStyle(font, { size: defaultSize });
  if (!font?.underline) {
    return { name: label, nameTextStyle: plainStyle };
  }
  const lineWidth = Math.ceil(measureTextWidth(label, font, defaultSize));
  const pack = buildRichUnderlinePack(font, defaultSize, lineWidth);
  return {
    name: pack.formatUnderlined(label),
    nameTextStyle: { rich: pack.rich },
  };
}

/** Label / legend fields: plain textStyle or rich underline with measured rule widths. */
export function buildUnderlinedTextFields(
  font: FontStyle | RequiredFontStyle | undefined,
  defaultSize: number,
  primeTexts: string[] = [],
  align: 'left' | 'center' = 'center'
): {
  textStyle?: Record<string, unknown>;
  rich?: Record<string, unknown>;
  align?: string;
  formatText: (text: string) => string;
} {
  if (!font?.underline) {
    const textStyle = buildEchartsTextStyle(font, { size: defaultSize, family: font?.family });
    return { textStyle, formatText: (text) => text };
  }
  const pack = buildMeasuredRichUnderlinePack(font, defaultSize, primeTexts, align);
  return {
    rich: pack.rich,
    align,
    formatText: pack.formatUnderlined,
  };
}

/** When `font.underline` is set, return underlined text for canvas labels. */
export function formatCanvasText(
  text: string,
  font?: Pick<FontStyle, 'underline'> | Pick<RequiredFontStyle, 'underline'> | null
): string {
  if (!text || !font?.underline) return text;
  return applyCanvasUnderline(text);
}

/** Resolve underline stroke color — matches text when set, otherwise a readable default. */
export function resolveUnderlineColor(font: FontStyle | RequiredFontStyle | undefined): string {
  const c = font?.color?.trim();
  return c && c !== 'inherit' ? c : '#333333';
}

let measureCanvas: HTMLCanvasElement | null = null;

/** Measure rendered text width for graphic underline placement (browser canvas API). */
export function measureTextWidth(
  text: string,
  font: FontStyle | RequiredFontStyle | undefined,
  defaultSize: number
): number {
  if (!text) return 0;
  const size = font?.size ?? defaultSize;
  const family = resolveFontFamily(font);
  const weight = font?.bold ? 'bold' : 'normal';
  const style = font?.italic ? 'italic' : 'normal';

  if (typeof document !== 'undefined') {
    measureCanvas ??= document.createElement('canvas');
    const ctx = measureCanvas.getContext('2d');
    if (ctx) {
      ctx.font = `${style} ${weight} ${size}px ${family}`;
      return ctx.measureText(text).width;
    }
  }
  return text.length * size * 0.55;
}

/** Resolve a concrete font family — ECharts canvas ignores `inherit`, which breaks fontSize until family is set. */
export function resolveFontFamily(
  font: FontStyle | RequiredFontStyle | undefined,
  fallback?: string
): string {
  const f = font?.family?.trim();
  if (f && f !== 'inherit') return f;
  const fb = fallback?.trim();
  if (fb && fb !== 'inherit') return fb;
  return DEFAULT_FONT_FAMILY;
}

/** Merge optional FontStyle overrides onto a required base (used for per-axis / data-label fonts). */
export function mergeRequiredFont(base: RequiredFontStyle, override?: FontStyle): RequiredFontStyle {
  if (!override) return base;
  return {
    size: override.size ?? base.size,
    family: override.family ?? base.family,
    bold: override.bold ?? base.bold,
    italic: override.italic ?? base.italic,
    underline: override.underline ?? base.underline,
    color: override.color !== undefined ? override.color : base.color,
  };
}

/** Build ECharts textStyle / nameTextStyle / axisLabel from optional FontStyle with fallbacks. */
export function buildEchartsTextStyle(
  font: FontStyle | RequiredFontStyle | undefined,
  defaults: { size: number; family?: string }
): Record<string, unknown> {
  const f = font ?? {};
  const size = f.size ?? defaults.size;
  const family = resolveFontFamily(f, defaults.family);
  const style: Record<string, unknown> = {
    fontSize: size,
    fontFamily: family,
    fontWeight: f.bold ? 700 : 400,
    fontStyle: f.italic ? 'italic' : 'normal',
  };
  if (f.color) style.color = f.color;
  return style;
}
