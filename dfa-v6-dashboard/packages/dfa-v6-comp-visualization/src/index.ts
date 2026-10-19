/**
 * dfa-v6-comp-visualization
 * Chart engine (ECharts wrapper) + React component + types.
 */
import './styles.css';

export {
  init,
  update,
  destroy,
  getDataURL,
  isLineBarAreaData,
  isPieChartData,
  isScatterXYData,
  isHeatmapData,
  isTreemapData,
  isRadarData,
  isPyramidData,
  type ChartInstance,
  type ChartCallbacks,
  type ChartConfig,
  type ChartData,
  type LineBarAreaData,
  type PieChartData,
  type ScatterXYData,
  type HeatmapData,
  type TreemapData,
  type RadarData,
  type PyramidData,
} from './engine';
export { createDfaChart, type DfaChartOptions, type DfaChartInstance } from './engine/standalone';
export { ChartRendererWrapper, type ChartRendererWrapperRef, type ChartRendererWrapperProps } from './ChartRendererWrapper';
