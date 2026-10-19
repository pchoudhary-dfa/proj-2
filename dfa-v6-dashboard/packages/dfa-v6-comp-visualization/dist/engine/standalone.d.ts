import { ChartConfig, ChartData } from './types';
export interface DfaChartOptions {
    data: ChartData;
    config: ChartConfig;
    onPointClick?: (params: {
        seriesName?: string;
        name?: string;
        value?: unknown;
        dataIndex?: number;
    }) => void;
    onLegendClick?: (params: {
        name: string;
    }) => void;
}
export interface DfaChartInstance {
    update(data: ChartData, config: ChartConfig): void;
    destroy(): void;
    getDataURL(type: 'png' | 'svg'): string;
}
/**
 * Create a DFA chart in the given container. Returns an instance with update, destroy, getDataURL.
 */
export declare function createDfaChart(container: HTMLElement | string, options: DfaChartOptions): DfaChartInstance;
//# sourceMappingURL=standalone.d.ts.map