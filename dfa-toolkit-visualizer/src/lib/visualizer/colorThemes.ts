/**
 * Single source of truth for chart color themes.
 * Used by VisualizationSettings (UI), VisualizationTab (palette display), and chartTransform (mapping to ChartConfig).
 */

export const COLOR_THEMES: Record<string, string[]> = {
  Default: ['#3B82F6', '#EC4899', '#10B981', '#F59E0B', '#8B5CF6'],
  Warm: ['#F59E0B', '#EF4444', '#DC2626', '#FB923C', '#F97316'],
  Cool: ['#06B6D4', '#8B5CF6', '#3B82F6', '#0891B2', '#7C3AED'],
  Pastel: ['#93C5FD', '#FBCFE8', '#A7F3D0', '#FDE68A', '#DDD6FE'],
  Monochrome: ['#374151', '#6B7280', '#1F2937', '#9CA3AF', '#4B5563'],
  Ocean: ['#06B6D4', '#0891B2', '#0E7490', '#155E75', '#164E63'],
  Sunset: ['#F97316', '#FB923C', '#FDBA74', '#FED7AA', '#EA580C'],
  Forest: ['#059669', '#10B981', '#34D399', '#6EE7B7', '#047857'],
  Indigo: ['#4f46e5', '#818cf8', '#c7d2fe', '#e0e7ff', '#6366f1'],
  Custom: ['#4f46e5', '#818cf8', '#c7d2fe', '#e0e7ff', '#f5f3ff'],
};

/** Theme used when embedding the chart via iframe (no viz state). Use "Default" or "Warm". */
export const EMBED_DEFAULT_THEME: keyof typeof COLOR_THEMES = 'Default';

/** UI-friendly list for theme picker (name + colors). */
export const COLOR_THEME_OPTIONS: { name: string; colors: string[] }[] = Object.entries(
  COLOR_THEMES
)
  .filter(([name]) => name !== 'Custom')
  .map(([name, colors]) => ({ name, colors }));

/**
 * Resolve palette for a viz config: use customColors when theme is Custom, else theme palette.
 */
export function getPaletteForViz(viz: {
  theme: string;
  customColors?: string[];
}): string[] {
  if (viz.theme === 'Custom' && viz.customColors && viz.customColors.length > 0) {
    return viz.customColors;
  }
  return COLOR_THEMES[viz.theme] ?? COLOR_THEMES['Default'];
}
