'use client';

import { AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter } from 'lucide-react';
import { getTooltipHandlers } from '@/components/CustomTooltip';
import { useCore } from '@/contexts/CoreContext';
import type { VisualizationConfig } from '@/lib/visualizer/types';
import {
  chartTypes,
  chartVariants,
  legendIcons,
  numberFormats,
} from './VisualizationSettingsConstants';
import {
  CHART_LAYOUT_DIMENSIONS,
  buildMappingFromMatrix,
  decomposeMappingForUi,
  dimensionKindLabel,
  getMatrixConstraints,
} from '@/lib/visualizer/axisMapping';
import {
  chartTypeTranslatedLabel,
  chartVariantTranslatedLabel,
  legendPositionTranslatedLabel,
} from '@/lib/visualizer/chartUiLabels';
import type { AxisSeriesMapping } from '@/lib/visualizer/chartTransform';
import type { DimensionKind } from '@/lib/visualizer/defaultChartConfig';
import type { DimensionValues, ScatterMapping } from '@/lib/visualizer/types';
import { MapSettingsSection } from './MapSettingsSection';

const primaryVar = 'var(--color-primary)';
const primaryLightVar = 'var(--color-primary)';

const isCartesian = (ct: VisualizationConfig['chartType']) =>
  ct === 'line' || ct === 'bar' || ct === 'area';

/**
 * Axis layout controls rendered as a 4-row x 2-column checkbox matrix.
 *
 * X column: checkbox UI with exclusive selection (exactly one dimension — maps to xDimension).
 * Y column: 0–2 checkboxes for seriesDimension / seriesDimension2.
 * Unchecking the sole X checkbox is ignored so mapping always has a category axis.
 *
 * Chart-type-specific Y min/max come from `getMatrixConstraints`.
 */
function ChartLayoutSection({
  settings,
  updateSettings,
  onUserChangedAxisMapping,
  t,
}: {
  settings: VisualizationConfig;
  updateSettings: (updates: Partial<VisualizationConfig>) => void;
  onUserChangedAxisMapping?: () => void;
  t: (code: string) => string;
}) {
  const isAdvanced = settings.chartType === 'advanced';
  const showChartLayout =
    isCartesian(settings.chartType) ||
    (isAdvanced && ['heatmap', 'treemap', 'spider', 'pyramid'].includes(settings.chartVariant));
  if (!showChartLayout) return null;

  const currentMapping: AxisSeriesMapping = settings.mapping ?? {
    xDimension: 'time',
    seriesDimension: null,
  };
  const { x, series1, series2 } = decomposeMappingForUi(currentMapping);
  const yChecked: DimensionKind[] = [series1, series2].filter((d): d is DimensionKind => d != null);
  const { yMin, yMax } = getMatrixConstraints(settings.chartType, settings.chartVariant);

  const applyMapping = (nextX: DimensionKind, nextY: DimensionKind[]) => {
    const built = buildMappingFromMatrix(nextX, nextY);
    if (!built) return;
    onUserChangedAxisMapping?.();
    updateSettings({ mapping: built });
  };

  const handleXSelect = (newX: DimensionKind) => {
    if (newX === x) return;
    let nextY = yChecked.filter((d) => d !== newX);

    if (nextY.length < yMin) {
      const fill = CHART_LAYOUT_DIMENSIONS.find((d) => d !== newX && !nextY.includes(d));
      if (fill) nextY = [...nextY, fill];
    }

    // Changing the axis mapping must not override the user's chosen chart type/variant.
    // Chart type is selected independently via the chart-type buttons; the initial
    // data-driven default is applied by getDefaultChartConfig in the parent.
    applyMapping(newX, nextY);
  };

  const handleYToggle = (dim: DimensionKind) => {
    const isChecked = yChecked.includes(dim);

    if (isChecked) {
      if (yChecked.length <= yMin) return;
      applyMapping(x, yChecked.filter((d) => d !== dim));
    } else {
      let nextY: DimensionKind[];
      if (yChecked.length >= yMax) {
        const last = [...yChecked].sort(
          (a, b) => CHART_LAYOUT_DIMENSIONS.indexOf(a) - CHART_LAYOUT_DIMENSIONS.indexOf(b),
        ).pop()!;
        nextY = [...yChecked.filter((d) => d !== last), dim];
      } else {
        nextY = [...yChecked, dim];
      }
      applyMapping(x, nextY);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="border-b border-border pb-2">
          <h4 className="text-xs font-semibold text-text uppercase tracking-wide">
            {t('VISUALIZER_SETTINGS_CHART_LAYOUT')}
          </h4>
        </div>

        <div className="pl-4 rtl:pl-0 rtl:pr-4">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 mb-2">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
              {t('VISUALIZER_SETTINGS_DIMENSION')}
            </span>
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide text-center w-16">
              {t('VISUALIZER_SETTINGS_X_AXIS')}
            </span>
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide text-center w-16">
              {t('VISUALIZER_SETTINGS_Y_AXIS')}
            </span>
          </div>

          {/* Dimension rows */}
          {CHART_LAYOUT_DIMENSIONS.map((dim) => {
            const isXActive = dim === x;
            const isYActive = yChecked.includes(dim);
            const yDisabled = isXActive;
            const yUncheckDisabled = isYActive && yChecked.length <= yMin;

            return (
              <div
                key={dim}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 py-1.5"
              >
                <span className="text-xs text-text">{dimensionKindLabel(dim, t)}</span>

                {/* X checkbox — exclusive: only one row checked; uncheck of sole X is ignored */}
                <div className="flex justify-center w-16">
                  <input
                    type="checkbox"
                    checked={isXActive}
                    onChange={(e) => {
                      if (e.target.checked) handleXSelect(dim);
                    }}
                    className="w-4 h-4 rounded border-border"
                    style={{ accentColor: primaryVar }}
                    aria-label={`${dimensionKindLabel(dim, t)} — ${t('VISUALIZER_SETTINGS_X_AXIS')}`}
                  />
                </div>

                {/* Y checkbox */}
                <div className="flex justify-center w-16">
                  <input
                    type="checkbox"
                    checked={isYActive}
                    disabled={yDisabled || (!isYActive && yChecked.length >= yMax && yMax <= 1) || yUncheckDisabled}
                    onChange={() => handleYToggle(dim)}
                    className="w-4 h-4 rounded border-border disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ accentColor: primaryVar }}
                    aria-label={`${dimensionKindLabel(dim, t)} — ${t('VISUALIZER_SETTINGS_Y_AXIS')}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

const SCATTER_DIMENSIONS: { value: DimensionKind; label: string; labelKey: string }[] = [
  { value: 'indicator', label: 'Indicator', labelKey: 'VISUALIZER_SETTINGS_DIMENSION_INDICATOR' },
  { value: 'subgroup', label: 'Subgroup', labelKey: 'VISUALIZER_SETTINGS_DIMENSION_SUBGROUP' },
  { value: 'area', label: 'Area', labelKey: 'VISUALIZER_SETTINGS_DIMENSION_AREA' },
  { value: 'time', label: 'Time', labelKey: 'VISUALIZER_SETTINGS_DIMENSION_TIME_PERIOD' },
];

function dimensionValuesForKind(dv: DimensionValues | undefined, kind: DimensionKind) {
  if (!dv) return [];
  switch (kind) {
    case 'indicator': return dv.indicators;
    case 'subgroup': return dv.subgroups;
    case 'area': return dv.areas;
    case 'time': return dv.timePeriods;
  }
}

function ScatterLayoutSection({
  settings,
  updateSettings,
  dimensionValues,
  focusStyle,
  blurStyle,
  t,
}: {
  settings: VisualizationConfig;
  updateSettings: (updates: Partial<VisualizationConfig>) => void;
  dimensionValues?: DimensionValues;
  focusStyle: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => void;
  blurStyle: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => void;
  t: (code: string) => string;
}) {
  if (settings.chartType !== 'advanced' || settings.chartVariant !== 'scatter') return null;

  const mapping: ScatterMapping | undefined = settings.scatterMapping;
  const measureDim = mapping?.measureDimension ?? 'indicator';
  const measureValues = dimensionValuesForKind(dimensionValues, measureDim);
  const colorDim = mapping?.colorDimension ?? null;

  const updateScatterMapping = (patch: Partial<ScatterMapping>) => {
    const current: ScatterMapping = mapping ?? {
      measureDimension: 'indicator',
      xMeasure: { id: '', label: '' },
      yMeasure: { id: '', label: '' },
      colorDimension: null,
    };
    updateSettings({ scatterMapping: { ...current, ...patch } });
  };

  const handleMeasureDimensionChange = (newDim: DimensionKind) => {
    const vals = dimensionValuesForKind(dimensionValues, newDim);
    const otherDims = SCATTER_DIMENSIONS.filter((d) => d.value !== newDim);
    const autoColor = otherDims.find(
      (d) => dimensionValuesForKind(dimensionValues, d.value).length >= 2
    )?.value ?? null;
    updateSettings({
      scatterMapping: {
        measureDimension: newDim,
        xMeasure: vals[0] ?? { id: '', label: '' },
        yMeasure: vals[1] ?? { id: '', label: '' },
        colorDimension: autoColor,
      },
    });
  };

  const handleMeasureSelect = (axis: 'x' | 'y', id: string) => {
    const item = measureValues.find((v) => v.id === id);
    if (!item) return;
    if (axis === 'x') updateScatterMapping({ xMeasure: item });
    else updateScatterMapping({ yMeasure: item });
  };

  const remainingDimensions = SCATTER_DIMENSIONS.filter((d) => d.value !== measureDim);

  return (
    <>
      <div className="space-y-4">
        <div className="border-b border-border pb-2">
          <h4 className="text-xs font-semibold text-text uppercase tracking-wide">
            {t('VISUALIZER_SETTINGS_CHART_LAYOUT')}
          </h4>
        </div>
        <div className="space-y-3 pl-4 rtl:pl-0 rtl:pr-4">
          {/* Measure dimension: which dimension provides the two numeric axes */}
          <div>
            <label className="text-xs text-text block mb-2">
              {t('VISUALIZER_SETTINGS_COMPARE_BY') || 'Compare By'}
            </label>
            <select
              value={measureDim}
              onChange={(e) => handleMeasureDimensionChange(e.target.value as DimensionKind)}
              className="w-full px-3 py-2 text-xs border border-border rounded-lg transition-colors bg-surface text-text"
              onFocus={focusStyle}
              onBlur={blurStyle}
            >
              {SCATTER_DIMENSIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {t(d.labelKey) || d.label}
                </option>
              ))}
            </select>
          </div>

          {/* X Axis measure */}
          <div>
            <label className="text-xs text-text block mb-2">
              {t('VISUALIZER_SETTINGS_X_AXIS') || 'X Axis'}
            </label>
            <select
              value={mapping?.xMeasure?.id ?? ''}
              onChange={(e) => handleMeasureSelect('x', e.target.value)}
              className="w-full px-3 py-2 text-xs border border-border rounded-lg transition-colors bg-surface text-text"
              onFocus={focusStyle}
              onBlur={blurStyle}
            >
              {measureValues.length === 0 && <option value="">—</option>}
              {measureValues.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
          </div>

          {/* Y Axis measure */}
          <div>
            <label className="text-xs text-text block mb-2">
              {t('VISUALIZER_SETTINGS_Y_AXIS') || 'Y Axis'}
            </label>
            <select
              value={mapping?.yMeasure?.id ?? ''}
              onChange={(e) => handleMeasureSelect('y', e.target.value)}
              className="w-full px-3 py-2 text-xs border border-border rounded-lg transition-colors bg-surface text-text"
              onFocus={focusStyle}
              onBlur={blurStyle}
            >
              {measureValues.length === 0 && <option value="">—</option>}
              {measureValues.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
          </div>

          {/* Color By: remaining dimensions */}
          <div>
            <label className="text-xs text-text block mb-2">
              {t('VISUALIZER_SETTINGS_COLOR_BY')}
            </label>
            <select
              value={colorDim ?? ''}
              onChange={(e) =>
                updateScatterMapping({
                  colorDimension: (e.target.value || null) as DimensionKind | null,
                })
              }
              className="w-full px-3 py-2 text-xs border border-border rounded-lg transition-colors bg-surface text-text"
              onFocus={focusStyle}
              onBlur={blurStyle}
            >
              <option value="">{t('VISUALIZER_SETTINGS_NONE') || 'None'}</option>
              {remainingDimensions.map((d) => (
                <option key={d.value} value={d.value}>
                  {t(d.labelKey) || d.label}
                </option>
              ))}
            </select>
          </div>

        </div>
      </div>
    </>
  );
}

interface BasicSettingsTabProps {
  settings: VisualizationConfig;
  updateSettings: (updates: Partial<VisualizationConfig>) => void;
  getActiveButtonStyle: (isActive: boolean) => React.CSSProperties;
  /** When true, show only icons for chart type/variant (panel is narrow). */
  compact?: boolean;
  onUserChangedAxisMapping?: () => void;
  onUserChangedChartType?: () => void;
  dimensionValues?: DimensionValues;
}

export function BasicSettingsTab({
  settings,
  updateSettings,
  getActiveButtonStyle,
  compact = false,
  onUserChangedAxisMapping,
  onUserChangedChartType,
  dimensionValues,
}: BasicSettingsTabProps) {
  const { t } = useCore();
  const isHeatmap = settings.chartType === 'advanced' && settings.chartVariant === 'heatmap';
  const isTreemap = settings.chartType === 'advanced' && settings.chartVariant === 'treemap';
  const isSpider = settings.chartType === 'advanced' && settings.chartVariant === 'spider';
  const isPyramid = settings.chartType === 'advanced' && settings.chartVariant === 'pyramid';

  const focusStyle = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.outline = 'none';
    e.currentTarget.style.borderColor = primaryVar;
    e.currentTarget.style.boxShadow = `0 0 0 2px color-mix(in srgb, ${primaryLightVar} 25%, transparent)`;
  };
  const blurStyle = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = '';
    e.currentTarget.style.boxShadow = '';
  };

  return (
    <div className="px-4 py-4 space-y-6">
      {/* Charts Section */}
      <div className="space-y-4">
        <div className="border-b border-border pb-2">
          <h4 className="text-xs font-semibold text-text uppercase tracking-wide">{t('VISUALIZER_SETTINGS_CHARTS_SECTION')}</h4>
        </div>
        <div className="space-y-4 pl-4 rtl:pl-0 rtl:pr-4">
          <div>
            <label className="text-xs text-text block mb-2">{t('VISUALIZER_SETTINGS_CHART_TYPE')}</label>
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {chartTypes.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.value}
                    onClick={() => {
                      const firstVariant =
                        chartVariants[type.value as keyof typeof chartVariants][0].value;
                      onUserChangedChartType?.();
                      updateSettings({
                        chartType: type.value as VisualizationConfig['chartType'],
                        chartVariant: firstVariant,
                      });
                    }}
                    className={`aspect-square p-2 border rounded-lg transition-all flex flex-col items-center justify-center gap-1 ${
                      settings.chartType === type.value
                        ? 'text-on-primary shadow-sm'
                        : 'bg-surface text-text border-border hover:bg-surface-muted hover:border-border'
                    }`}
                    style={settings.chartType === type.value ? getActiveButtonStyle(true) : undefined}
                    {...getTooltipHandlers(chartTypeTranslatedLabel(type.value, t))}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {!compact && <span className="text-xs">{chartTypeTranslatedLabel(type.value, t)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-xs text-text block mb-2">{t('VISUALIZER_SETTINGS_CHART_VARIANT')}</label>
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {(chartVariants[settings.chartType] ?? chartVariants.line).map((variant) => {
                const VariantIcon = variant.icon;
                return (
                  <button
                    key={variant.value}
                    onClick={() => updateSettings({ chartVariant: variant.value })}
                    className={`aspect-square p-2 border rounded-lg transition-all flex flex-col items-center justify-center gap-1 ${
                      settings.chartVariant === variant.value
                        ? 'text-on-primary shadow-sm'
                        : 'bg-surface text-text border-border hover:bg-surface-muted hover:border-border'
                    }`}
                    style={
                      settings.chartVariant === variant.value ? getActiveButtonStyle(true) : undefined
                    }
                    {...getTooltipHandlers(chartVariantTranslatedLabel(variant.value, t))}
                  >
                    <VariantIcon className="w-4 h-4 shrink-0" />
                    {!compact && (
                      <span className="text-xs text-center">{chartVariantTranslatedLabel(variant.value, t)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Map classification settings: top rule separates from Charts; no extra rule after (global separator below handles next section). */}
      {settings.chartType === 'advanced' && settings.chartVariant === 'map' && (
        <div className="border-t border-border pt-6 min-w-0">
          <MapSettingsSection settings={settings} updateSettings={updateSettings} />
        </div>
      )}

      {/* Chart Layout — directly under Charts (line, bar, area, heatmap, treemap, spider, pyramid; scatter uses same heading) */}
      <ChartLayoutSection
        settings={settings}
        updateSettings={updateSettings}
        onUserChangedAxisMapping={onUserChangedAxisMapping}
        t={t}
      />

      <ScatterLayoutSection
        settings={settings}
        updateSettings={updateSettings}
        dimensionValues={dimensionValues}
        focusStyle={focusStyle}
        blurStyle={blurStyle}
        t={t}
      />

      <div className="border-t border-border" />

      {settings.showLegend && (
        <>
          <div className="space-y-4">
            <div className="border-b border-border pb-2">
              <h4 className="text-xs font-semibold text-text uppercase tracking-wide">
                {t('VISUALIZER_LEGEND_SECTION')}
              </h4>
            </div>
            <div className="space-y-3 pl-4 rtl:pl-0 rtl:pr-4">
              <div>
                <label className="text-xs text-text block mb-2">{t('VISUALIZER_SETTINGS_LEGEND_POSITION')}</label>
                <div className="grid grid-cols-4 gap-2">
                  {(Object.keys(legendIcons) as Array<keyof typeof legendIcons>).map((position) => {
                    const Icon = legendIcons[position];
                    return (
                      <button
                        key={position}
                        onClick={() => updateSettings({ legendPosition: position })}
                        className={`p-3 border rounded-lg transition-all flex items-center justify-center ${
                          settings.legendPosition === position
                            ? 'text-on-primary shadow-sm'
                            : 'bg-surface text-text border-border hover:bg-surface-muted hover:border-border'
                        }`}
                        style={
                          settings.legendPosition === position
                            ? getActiveButtonStyle(true)
                            : undefined
                        }
                        {...getTooltipHandlers(legendPositionTranslatedLabel(position, t))}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-border" />
        </>
      )}

      {settings.chartType !== 'pie' && (
        <div className="space-y-6">
          {!isSpider && !isPyramid && (
            <>
              <div className="space-y-4">
                <div className="border-b border-border pb-2">
                  <h4 className="text-xs font-semibold text-text uppercase tracking-wide">
                    {t('VISUALIZER_SETTINGS_HORIZONTAL_AXIS')}
                  </h4>
                </div>
                <div className="space-y-3 pl-4 rtl:pl-0 rtl:pr-4">
                  <div>
                    <label className="text-xs text-text block mb-2">{t('VISUALIZER_SETTINGS_LABEL_ORIENTATION')}</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => updateSettings({ labelOrientation: 'horizontal' })}
                        className={`p-3 border rounded-lg transition-all flex items-center justify-center gap-2 ${
                          settings.labelOrientation === 'horizontal'
                            ? 'text-on-primary shadow-sm'
                            : 'bg-surface text-text border-border hover:bg-surface-muted hover:border-border'
                        }`}
                        style={
                          settings.labelOrientation === 'horizontal'
                            ? getActiveButtonStyle(true)
                            : undefined
                        }
                        {...getTooltipHandlers(t('VISUALIZER_SETTINGS_HORIZONTAL'))}
                      >
                        <AlignHorizontalJustifyCenter className="w-4 h-4 shrink-0" />
                        {!compact && <span className="text-xs">{t('VISUALIZER_SETTINGS_HORIZONTAL')}</span>}
                      </button>
                      <button
                        onClick={() => updateSettings({ labelOrientation: 'vertical' })}
                        className={`p-3 border rounded-lg transition-all flex items-center justify-center gap-2 ${
                          settings.labelOrientation === 'vertical'
                            ? 'text-on-primary shadow-sm'
                            : 'bg-surface text-text border-border hover:bg-surface-muted hover:border-border'
                        }`}
                        style={
                          settings.labelOrientation === 'vertical'
                            ? getActiveButtonStyle(true)
                            : undefined
                        }
                        {...getTooltipHandlers(t('VISUALIZER_SETTINGS_VERTICAL'))}
                      >
                        <AlignVerticalJustifyCenter className="w-4 h-4 shrink-0" />
                        {!compact && <span className="text-xs">{t('VISUALIZER_SETTINGS_VERTICAL')}</span>}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-border" />
            </>
          )}

          {!isHeatmap && !isTreemap && (
          <div className="space-y-4">
            <div className="border-b border-border pb-2">
              <h4 className="text-xs font-semibold text-text uppercase tracking-wide">
                {isSpider
                  ? t('VISUALIZER_SETTINGS_RADAR_AXIS')
                  : isPyramid
                    ? t('VISUALIZER_SETTINGS_VALUE_AXIS')
                    : t('VISUALIZER_SETTINGS_VERTICAL_AXIS')}
              </h4>
            </div>
            <div className="space-y-3 pl-4 rtl:pl-0 rtl:pr-4">
              <div>
                <label className="text-xs text-text block mb-3">
                  {isSpider
                    ? t('VISUALIZER_SETTINGS_TICKS_OUTER_BOUND_CUSTOM_RANGE')
                    : isPyramid
                      ? t('VISUALIZER_SETTINGS_TICKS_SYMMETRIC_BOUND_CUSTOM_RANGE')
                      : t('VISUALIZER_SETTINGS_TICKS_CUSTOM_RANGE')}
                </label>
                <div className={`grid gap-3 ${isSpider || isPyramid ? 'grid-cols-1' : 'grid-cols-3'}`}>
                  {!isSpider && !isPyramid && (
                  <div>
                    <label className="text-xs text-text-muted block mb-1">{t('VISUALIZER_SETTINGS_MIN')}</label>
                    <input
                      type="number"
                      value={settings.yAxisRange?.min ?? ''}
                      onChange={(e) =>
                        updateSettings({
                          yAxisRange: {
                            ...settings.yAxisRange,
                            min: e.target.value === '' ? '' : parseFloat(e.target.value),
                            max: settings.yAxisRange?.max ?? '',
                            interval: settings.yAxisRange?.interval ?? '',
                          },
                        })
                      }
                      placeholder={t('VISUALIZER_PLACEHOLDER_AUTO')}
                      className="w-full px-3 py-2 text-xs border border-border rounded-lg transition-colors"
                      onFocus={focusStyle}
                      onBlur={blurStyle}
                    />
                  </div>
                  )}
                  <div>
                    <label className="text-xs text-text-muted block mb-1">{t('VISUALIZER_SETTINGS_MAX')}</label>
                    <input
                      type="number"
                      value={settings.yAxisRange?.max ?? ''}
                      onChange={(e) =>
                        updateSettings({
                          yAxisRange: {
                            ...settings.yAxisRange,
                            min: settings.yAxisRange?.min ?? '',
                            max: e.target.value === '' ? '' : parseFloat(e.target.value),
                            interval: settings.yAxisRange?.interval ?? '',
                          },
                        })
                      }
                      placeholder={t('VISUALIZER_PLACEHOLDER_AUTO')}
                      className="w-full px-3 py-2 text-xs border border-border rounded-lg transition-colors"
                      onFocus={focusStyle}
                      onBlur={blurStyle}
                    />
                  </div>
                  {!isSpider && !isPyramid && (
                  <div>
                    <label className="text-xs text-text-muted block mb-1">{t('VISUALIZER_SETTINGS_INTERVAL')}</label>
                    <input
                      type="number"
                      value={settings.yAxisRange?.interval ?? ''}
                      onChange={(e) =>
                        updateSettings({
                          yAxisRange: {
                            ...settings.yAxisRange,
                            min: settings.yAxisRange?.min ?? '',
                            max: settings.yAxisRange?.max ?? '',
                            interval:
                              e.target.value === '' ? '' : parseFloat(e.target.value),
                          },
                        })
                      }
                      placeholder={t('VISUALIZER_PLACEHOLDER_AUTO')}
                      className="w-full px-3 py-2 text-xs border border-border rounded-lg transition-colors"
                      onFocus={focusStyle}
                      onBlur={blurStyle}
                    />
                  </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          )}

          <div className="border-t border-border" />

          <div className="space-y-4">
            <div className="border-b border-border pb-2">
              <h4 className="text-xs font-semibold text-text uppercase tracking-wide">
                {t('VISUALIZER_SETTINGS_LABEL')}
              </h4>
            </div>
            <div className="space-y-4 pl-4 rtl:pl-0 rtl:pr-4">
              <div>
                <label className="text-xs text-text block mb-2">{t('VISUALIZER_SETTINGS_LABEL_POSITIONING')}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() =>
                      updateSettings({
                        dataValues: {
                          ...settings.dataValues,
                          position: 'outside',
                          visibility: settings.dataValues?.visibility || 'always',
                          numberFormat: settings.dataValues?.numberFormat || '1,000[.00]',
                        },
                      })
                    }
                    className={`py-2 px-3 border rounded-lg transition-all ${
                      settings.dataValues?.position === 'outside' || !settings.dataValues
                        ? 'text-on-primary shadow-sm'
                        : 'bg-surface text-text border-border hover:bg-surface-muted hover:border-border'
                    }`}
                    style={
                      settings.dataValues?.position === 'outside' || !settings.dataValues
                        ? getActiveButtonStyle(true)
                        : undefined
                    }
                  >
                    <span className="text-xs">{t('VISUALIZER_SETTINGS_OUTSIDE')}</span>
                  </button>
                  <button
                    onClick={() =>
                      updateSettings({
                        dataValues: {
                          ...settings.dataValues,
                          position: 'inside',
                          visibility: settings.dataValues?.visibility || 'always',
                          numberFormat: settings.dataValues?.numberFormat || '1,000[.00]',
                        },
                      })
                    }
                    className={`py-2 px-3 border rounded-lg transition-all ${
                      settings.dataValues?.position === 'inside'
                        ? 'text-on-primary shadow-sm'
                        : 'bg-surface text-text border-border hover:bg-surface-muted hover:border-border'
                    }`}
                    style={
                      settings.dataValues?.position === 'inside'
                        ? getActiveButtonStyle(true)
                        : undefined
                    }
                  >
                    <span className="text-xs">{t('VISUALIZER_SETTINGS_INSIDE')}</span>
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-text block mb-2">{t('VISUALIZER_SETTINGS_LABEL_VISIBILITY')}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() =>
                      updateSettings({
                        dataValues: {
                          ...settings.dataValues,
                          position: settings.dataValues?.position || 'outside',
                          visibility: 'onHover',
                          numberFormat: settings.dataValues?.numberFormat || '1,000[.00]',
                        },
                      })
                    }
                    className={`py-2 px-3 border rounded-lg transition-all ${
                      settings.dataValues?.visibility === 'onHover'
                        ? 'text-on-primary shadow-sm'
                        : 'bg-surface text-text border-border hover:bg-surface-muted hover:border-border'
                    }`}
                    style={
                      settings.dataValues?.visibility === 'onHover'
                        ? getActiveButtonStyle(true)
                        : undefined
                    }
                  >
                    <span className="text-xs">{t('VISUALIZER_SETTINGS_ON_HOVER')}</span>
                  </button>
                  <button
                    onClick={() =>
                      updateSettings({
                        dataValues: {
                          ...settings.dataValues,
                          position: settings.dataValues?.position || 'outside',
                          visibility: 'always',
                          numberFormat: settings.dataValues?.numberFormat || '1,000[.00]',
                        },
                      })
                    }
                    className={`py-2 px-3 border rounded-lg transition-all ${
                      settings.dataValues?.visibility === 'always' || !settings.dataValues
                        ? 'text-on-primary shadow-sm'
                        : 'bg-surface text-text border-border hover:bg-surface-muted hover:border-border'
                    }`}
                    style={
                      settings.dataValues?.visibility === 'always' || !settings.dataValues
                        ? getActiveButtonStyle(true)
                        : undefined
                    }
                  >
                    <span className="text-xs">{t('VISUALIZER_SETTINGS_ALWAYS')}</span>
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="useUnitDefaultFormat"
                  checked={settings.dataValues?.useUnitDefaultFormat ?? true}
                  onChange={(e) =>
                    updateSettings({
                      dataValues: {
                        ...settings.dataValues,
                        position: settings.dataValues?.position || 'outside',
                        visibility: settings.dataValues?.visibility || 'always',
                        numberFormat: settings.dataValues?.numberFormat || '1,000[.00]',
                        useUnitDefaultFormat: e.target.checked,
                      },
                    })
                  }
                  className="w-4 h-4 rounded border-border accent-primary"
                />
                <label htmlFor="useUnitDefaultFormat" className="text-xs text-text cursor-pointer">
                  {t('VISUALIZER_SETTINGS_USE_UNIT_DEFAULT_FORMAT')}
                </label>
              </div>
              <div>
                <label className="text-xs text-text block mb-2">{t('VISUALIZER_SETTINGS_NUMBER_FORMAT')}</label>
                <select
                  value={settings.dataValues?.numberFormat || '1,000[.00]'}
                  onChange={(e) =>
                    updateSettings({
                      dataValues: {
                        ...settings.dataValues,
                        position: settings.dataValues?.position || 'outside',
                        visibility: settings.dataValues?.visibility || 'always',
                        numberFormat: e.target.value,
                      },
                    })
                  }
                  disabled={settings.dataValues?.useUnitDefaultFormat ?? true}
                  className="w-full px-3 py-2 text-xs border border-border rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  onFocus={focusStyle}
                  onBlur={blurStyle}
                >
                  {numberFormats.map((format) => (
                    <option key={format.value} value={format.value}>
                      {format.label} ({t('COMMON_EG')}, {format.example})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {settings.chartType === 'pie' && (
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="border-b border-border pb-2">
              <h4 className="text-xs font-semibold text-text uppercase tracking-wide">
                {t('VISUALIZER_SETTINGS_LABELS_SECTION')}
              </h4>
            </div>
            <div className="space-y-4 pl-4 rtl:pl-0 rtl:pr-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="useUnitDefaultFormatPie"
                  checked={settings.dataValues?.useUnitDefaultFormat ?? true}
                  onChange={(e) =>
                    updateSettings({
                      dataValues: {
                        ...settings.dataValues,
                        position: settings.dataValues?.position || 'outside',
                        visibility: settings.dataValues?.visibility || 'always',
                        numberFormat: settings.dataValues?.numberFormat || '1,000[.00]',
                        useUnitDefaultFormat: e.target.checked,
                      },
                    })
                  }
                  className="w-4 h-4 rounded border-border accent-primary"
                />
                <label htmlFor="useUnitDefaultFormatPie" className="text-xs text-text cursor-pointer">
                  {t('VISUALIZER_SETTINGS_USE_UNIT_DEFAULT_FORMAT')}
                </label>
              </div>
              <div>
                <label className="text-xs text-text block mb-2">{t('VISUALIZER_SETTINGS_NUMBER_FORMAT')}</label>
                <select
                  value={settings.dataValues?.numberFormat || '1,000[.00]'}
                  onChange={(e) =>
                    updateSettings({
                      dataValues: {
                        ...settings.dataValues,
                        position: settings.dataValues?.position || 'outside',
                        visibility: settings.dataValues?.visibility || 'always',
                        numberFormat: e.target.value,
                      },
                    })
                  }
                  disabled={settings.dataValues?.useUnitDefaultFormat ?? true}
                  className="w-full px-3 py-2 text-xs border border-border rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  onFocus={focusStyle}
                  onBlur={blurStyle}
                >
                  {numberFormats.map((format) => (
                    <option key={format.value} value={format.value}>
                      {format.label} ({t('COMMON_EG')}, {format.example})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="convertToPercentages"
                  checked={settings.pieSettings?.convertToPercentages ?? false}
                  onChange={(e) =>
                    updateSettings({
                      pieSettings: {
                        ...settings.pieSettings,
                        convertToPercentages: e.target.checked,
                        insideLabels:
                          settings.pieSettings?.insideLabels ?? {
                            showLabels: false,
                            showValues: false,
                          },
                        outsideLabels:
                          settings.pieSettings?.outsideLabels ?? {
                            showValues: false,
                            endLinesAtEdge: false,
                            useSliceColor: false,
                          },
                      },
                    })
                  }
                  className="w-4 h-4 border-border rounded"
                  style={{ accentColor: primaryVar }}
                />
                <label htmlFor="convertToPercentages" className="text-xs text-text">
                  {t('VISUALIZER_PIE_CONVERT_PERCENTAGES')}
                </label>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const currentInsideEnabled =
                        settings.pieSettings?.insideLabels?.showLabels ||
                        settings.pieSettings?.insideLabels?.showValues;
                      updateSettings({
                        pieSettings: {
                          ...settings.pieSettings,
                          convertToPercentages: settings.pieSettings?.convertToPercentages ?? false,
                          insideLabels: {
                            showLabels: !currentInsideEnabled,
                            showValues: !currentInsideEnabled,
                          },
                          outsideLabels: {
                            showValues: !!currentInsideEnabled,
                            endLinesAtEdge:
                              settings.pieSettings?.outsideLabels?.endLinesAtEdge ?? false,
                            useSliceColor:
                              settings.pieSettings?.outsideLabels?.useSliceColor ?? false,
                          },
                        },
                      });
                    }}
                    className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none"
                    style={{
                      backgroundColor:
                        settings.pieSettings?.insideLabels?.showLabels ||
                        settings.pieSettings?.insideLabels?.showValues
                          ? primaryVar
                          : 'var(--color-border)',
                    }}
                    role="switch"
                    aria-checked={
                      !!(
                        settings.pieSettings?.insideLabels?.showLabels ||
                        settings.pieSettings?.insideLabels?.showValues
                      )
                    }
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform ${
                        settings.pieSettings?.insideLabels?.showLabels ||
                        settings.pieSettings?.insideLabels?.showValues
                          ? 'translate-x-6 rtl:-translate-x-6'
                          : 'translate-x-1 rtl:-translate-x-1'
                      }`}
                    />
                  </button>
                  <label className="text-xs font-medium text-text">{t('VISUALIZER_SETTINGS_INSIDE_LABELS')}</label>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const currentOutsideEnabled =
                        settings.pieSettings?.outsideLabels?.showValues;
                      updateSettings({
                        pieSettings: {
                          ...settings.pieSettings,
                          convertToPercentages: settings.pieSettings?.convertToPercentages ?? false,
                          insideLabels: {
                            showLabels: currentOutsideEnabled ?? false,
                            showValues: currentOutsideEnabled ?? false,
                          },
                          outsideLabels: {
                            showValues: !currentOutsideEnabled,
                            endLinesAtEdge:
                              settings.pieSettings?.outsideLabels?.endLinesAtEdge ?? false,
                            useSliceColor:
                              settings.pieSettings?.outsideLabels?.useSliceColor ?? false,
                          },
                        },
                      });
                    }}
                    className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none"
                    style={{
                      backgroundColor: settings.pieSettings?.outsideLabels?.showValues
                        ? primaryVar
                        : 'var(--color-border)',
                    }}
                    role="switch"
                    aria-checked={!!settings.pieSettings?.outsideLabels?.showValues}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform ${
                        settings.pieSettings?.outsideLabels?.showValues
                          ? 'translate-x-6 rtl:-translate-x-6'
                          : 'translate-x-1 rtl:-translate-x-1'
                      }`}
                    />
                  </button>
                  <label className="text-xs font-medium text-text">{t('VISUALIZER_SETTINGS_OUTSIDE_LABELS')}</label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
