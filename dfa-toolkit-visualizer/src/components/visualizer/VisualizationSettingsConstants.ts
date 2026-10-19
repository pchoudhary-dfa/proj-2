/**
 * Constants for VisualizationSettings: chart types, variants, fonts, legend, number formats.
 */

import type { ComponentType } from 'react';
import {
  TrendingUp,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Settings as SettingsIcon,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  RectangleVertical,
  RectangleHorizontal,
  Rows2,
  Columns2,
  Minus,
  Spline,
  StepForward,
  Circle,
  CircleDot,
  CircleDashed,
  Grid3X3,
  ScatterChart,
  Flame,
  TreeDeciduous,
  Radar,
  Triangle,
} from 'lucide-react';
import PublicIcon from '@mui/icons-material/Public';

/** Chart picker icons: Lucide or any component accepting `className` (e.g. MUI SvgIcon). */
export type ChartSettingsIcon = ComponentType<{ className?: string }>;

export const fontFamilies = [
  'Inter',
  'Arial',
  'Helvetica Neue',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
];

export const numberFormats = [
  { value: '1,000[.00]', label: '1,000[.00]', example: '1,234.56' },
  { value: '1000.00', label: '1000.00', example: '1234.56' },
  { value: '1,000.00', label: '1,000.00', example: '1,234.56' },
  { value: '1000', label: '1000', example: '1235' },
  { value: '1,000', label: '1,000', example: '1,235' },
  { value: '1.00K', label: '1.00K', example: '1.23K' },
  { value: '1K', label: '1K', example: '1K' },
];

export const chartTypes = [
  { value: 'line', label: 'Line', icon: TrendingUp },
  { value: 'bar', label: 'Bar', icon: BarChart3 },
  { value: 'area', label: 'Area', icon: Activity },
  { value: 'pie', label: 'Pie', icon: PieChartIcon },
  { value: 'advanced', label: 'Advanced', icon: SettingsIcon },
] as const;

export const chartVariants: Record<
  string,
  Array<{ value: string; label: string; icon: ChartSettingsIcon }>
> = {
  bar: [
    { value: 'vertical', label: 'Vertical', icon: RectangleVertical },
    { value: 'horizontal', label: 'Horizontal', icon: RectangleHorizontal },
    { value: 'stacked-vertical', label: 'Stacked Vertical', icon: Rows2 },
    { value: 'stacked-horizontal', label: 'Stacked Horizontal', icon: Columns2 },
  ],
  line: [
    { value: 'straight', label: 'Straight', icon: Minus },
    { value: 'curved', label: 'Curved', icon: Spline },
    { value: 'stepped', label: 'Stepped', icon: StepForward },
  ],
  area: [
    { value: 'straight', label: 'Straight', icon: Minus },
    { value: 'curved', label: 'Curved', icon: Spline },
    { value: 'stepped', label: 'Stepped', icon: StepForward },
  ],
  pie: [
    { value: 'full', label: 'Full Circle', icon: Circle },
    { value: 'donut', label: 'Donut', icon: CircleDot },
    { value: 'semi', label: 'Semi Circle', icon: CircleDashed },
    { value: 'waffle', label: 'Waffle Chart', icon: Grid3X3 },
  ],
  advanced: [
    { value: 'scatter', label: 'Scatter Plot', icon: ScatterChart },
    { value: 'heatmap', label: 'Heat Map', icon: Flame },
    { value: 'treemap', label: 'Tree Map', icon: TreeDeciduous },
    { value: 'spider', label: 'Spider Chart', icon: Radar },
    { value: 'pyramid', label: 'Pyramid', icon: Triangle },
    { value: 'map', label: 'Map', icon: PublicIcon },
  ],
};

export const legendIcons: Record<'top' | 'bottom' | 'left' | 'right', ChartSettingsIcon> = {
  top: ArrowUp,
  bottom: ArrowDown,
  left: ArrowLeft,
  right: ArrowRight,
};
