import { ChartConfig, ChartData } from './engine/types';
export interface ChartRendererWrapperRef {
    getDataURL(type: 'png' | 'svg'): string;
}
export interface ChartRendererWrapperProps {
    data: ChartData;
    config: ChartConfig;
    width?: number;
    height?: number;
    minHeight?: number;
    onPointClick?: (params: {
        seriesName?: string;
        name?: string;
        value?: unknown;
        dataIndex?: number;
    }) => void;
    onLegendClick?: (params: {
        name: string;
    }) => void;
    /** Expose getDataURL for export (e.g. PNG/SVG). Parent uses ref.current.getDataURL('png'). */
    chartRef?: React.Ref<ChartRendererWrapperRef | null>;
}
export declare function ChartRendererWrapper(props: ChartRendererWrapperProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=ChartRendererWrapper.d.ts.map