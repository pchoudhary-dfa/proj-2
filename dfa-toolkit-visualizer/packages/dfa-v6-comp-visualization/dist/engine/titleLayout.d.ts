import { TitleComponentOption } from 'echarts';
import { ChartConfig } from './types';
/** Space between the title block and a top-positioned legend / colorbar. */
export declare const TITLE_LEGEND_GAP = 16;
/** Space between a top legend row and the plot grid. */
export declare const GRID_BELOW_TOP_LEGEND_GAP = 10;
/**
 * Minimum top inset for series legends (radar, line, …) when there is no title.
 * Not applied to map/heatmap visualMap — those stay flush like develop.
 */
export declare const DEFAULT_TOP_LEGEND_INSET = 14;
/** Compute stacked title block height (used for grid + legend top offset). */
export declare function computeTitleBlockHeight(config: ChartConfig): number;
export interface TitleOptionResult {
    title?: TitleComponentOption[];
    graphic?: Record<string, unknown>[];
}
/** Build ECharts title[] with a running y cursor so font-size changes scale correctly. */
export declare function buildTitleOption(config: ChartConfig): TitleOptionResult;
//# sourceMappingURL=titleLayout.d.ts.map