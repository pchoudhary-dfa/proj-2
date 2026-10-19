import { ChartConfig } from '../types';
/**
 * Format a numeric value for data labels according to the given format string.
 * Matches the formats used in the app (VisualizationSettingsConstants.numberFormats).
 */
export declare function formatLabelValue(value: number, format: string): string;
/** ECharts label position when data labels are "outside" for line/area (top) or bar (top/right). */
type OutsidePosition = 'top' | 'right';
/**
 * Build ECharts series label and emphasis config from ChartConfig.
 * outsidePosition: 'top' for line/area vertical bar, 'right' for horizontal bar.
 */
export declare function buildDataLabelConfig(config: ChartConfig, outsidePosition?: OutsidePosition): {
    label: Record<string, unknown>;
    emphasis?: {
        label: Record<string, unknown>;
    };
};
export {};
//# sourceMappingURL=labelUtils.d.ts.map