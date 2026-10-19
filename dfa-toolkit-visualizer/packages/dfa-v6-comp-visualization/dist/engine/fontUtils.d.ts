import { FontStyle, RequiredFontStyle } from './types';
export declare const DEFAULT_TITLE_SIZE = 16;
export declare const DEFAULT_SUBTITLE_SIZE = 12;
export declare const DEFAULT_CUSTOM_LABEL_SIZE = 11;
export declare const DEFAULT_FONT_FAMILY = "sans-serif";
/**
 * ECharts uses the canvas renderer (zrender). ZRender does not implement CSS textDecoration.
 * Underline is simulated with combining low-line characters (per-grapheme).
 * @see https://github.com/apache/echarts/issues/16295
 */
export declare const ECHARTS_CANVAS_SUPPORTS_TEXT_DECORATION = false;
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
export declare function applyCanvasUnderline(text: string): string;
/**
 * Format a numeric axis tick value with thousand separators (matching ECharts default).
 * Preserves decimals if present.
 */
export declare function formatAxisTickNumber(value: number): string;
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
export declare function buildAxisTickLabelWithUnderline(font: FontStyle | RequiredFontStyle, defaultSize: number, extra?: Record<string, unknown>, formatTick?: (value: string | number) => string): Record<string, unknown>;
/** Escape `{` / `}` for ECharts rich-text formatters. */
export declare function escapeRichText(text: string): string;
export declare const RICH_UL_TEXT = "dfaUlT";
/** Prefix for measured-width underline row styles (`dfaUlW42` = 42px rule). */
export declare const RICH_UL_LINE_PREFIX = "dfaUlW";
/** Prefix for measured-width text row styles (`dfaUlT42` = 42px text box). */
export declare const RICH_UL_TEXT_PREFIX = "dfaUlT";
export interface RichUnderlinePack {
    rich: Record<string, unknown>;
    formatUnderlined: (text: string) => string;
}
/**
 * Rich-text underline with a measured-width rule row per distinct string width.
 * `primeTexts` must include every label string that may appear at runtime.
 */
export declare function buildMeasuredRichUnderlinePack(font: FontStyle | RequiredFontStyle | undefined, defaultSize: number, primeTexts?: string[], align?: 'left' | 'center'): RichUnderlinePack;
/**
 * Rich-text underline: text row + 1px rule row (single fixed or percentage width).
 * Prefer `buildMeasuredRichUnderlinePack` when label strings are known at build time.
 */
export declare function buildRichUnderlinePack(font: FontStyle | RequiredFontStyle | undefined, defaultSize: number, lineWidth?: number | '100%'): RichUnderlinePack;
/** Axis title `name` + `nameTextStyle` with optional rich underline (measured line width). */
export declare function buildAxisNameOptions(label: string, font: FontStyle | undefined, defaultSize: number): {
    name: string;
    nameTextStyle: Record<string, unknown>;
};
/** Label / legend fields: plain textStyle or rich underline with measured rule widths. */
export declare function buildUnderlinedTextFields(font: FontStyle | RequiredFontStyle | undefined, defaultSize: number, primeTexts?: string[], align?: 'left' | 'center'): {
    textStyle?: Record<string, unknown>;
    rich?: Record<string, unknown>;
    align?: string;
    formatText: (text: string) => string;
};
/** When `font.underline` is set, return underlined text for canvas labels. */
export declare function formatCanvasText(text: string, font?: Pick<FontStyle, 'underline'> | Pick<RequiredFontStyle, 'underline'> | null): string;
/** Resolve underline stroke color — matches text when set, otherwise a readable default. */
export declare function resolveUnderlineColor(font: FontStyle | RequiredFontStyle | undefined): string;
/** Measure rendered text width for graphic underline placement (browser canvas API). */
export declare function measureTextWidth(text: string, font: FontStyle | RequiredFontStyle | undefined, defaultSize: number): number;
/** Resolve a concrete font family — ECharts canvas ignores `inherit`, which breaks fontSize until family is set. */
export declare function resolveFontFamily(font: FontStyle | RequiredFontStyle | undefined, fallback?: string): string;
/** Merge optional FontStyle overrides onto a required base (used for per-axis / data-label fonts). */
export declare function mergeRequiredFont(base: RequiredFontStyle, override?: FontStyle): RequiredFontStyle;
/** Build ECharts textStyle / nameTextStyle / axisLabel from optional FontStyle with fallbacks. */
export declare function buildEchartsTextStyle(font: FontStyle | RequiredFontStyle | undefined, defaults: {
    size: number;
    family?: string;
}): Record<string, unknown>;
//# sourceMappingURL=fontUtils.d.ts.map