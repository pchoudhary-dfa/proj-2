import { useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { useCore } from "@/contexts/CoreContext";
import { VisualizerTabIcons } from "./VisualizerTabIcons";
import type { VisualizerContentViewTab } from "./VisualizerTabIcons";
import type { Indicator, FilterValues, DataPoint, DataRow, SelectedComponents, FontStyle } from "@/lib/visualizer/types";
import type { AxisSeriesMapping, ChartTransformSortOptions } from "@/lib/visualizer/chartTransform";
import { toLineBarAreaDataFromRows } from "@/lib/visualizer/chartTransform";
import { resolveUnitDisplayValue } from "@/lib/visualizer/unitFormatDisplay";

function getFontStyle(font?: FontStyle): React.CSSProperties {
  if (!font) return {};
  return {
    fontSize: `${font.size}px`,
    fontFamily: `${font.family}, system-ui, -apple-system, sans-serif`,
    fontWeight: font.bold ? 'bold' : 'normal',
    fontStyle: font.italic ? 'italic' : 'normal',
    textDecoration: font.underline ? 'underline' : undefined,
  };
}

interface DataTableTabProps {
  indicator: Indicator | null;
  filters: FilterValues;
  hasFiltersApplied: boolean | null;
  /** Legacy data (DataPoint[]); used when dataRows/mapping not provided. */
  data?: DataPoint[];
  /** Unit from API rows; overrides indicator.unit when set. */
  unitFromData?: string;
  /** Chart title (same as Visualization tab); used for h3. */
  title?: string;
  /** Title font style from viz settings; applied to h3. */
  titleFont?: FontStyle;
  /** Subtitle font style from viz settings; applied to p. */
  subtitleFont?: FontStyle;
  /** API response rows for chart-aligned table (rows = series, columns = x dimension). */
  dataRows?: DataRow[];
  /** Axis/series mapping; when set with dataRows, table matches chart layout. */
  mapping?: AxisSeriesMapping | null;
  /** Same subgroup ordering as Visualization tab (from Data API meta). */
  chartSortOptions?: ChartTransformSortOptions;
  /** Number of data points; shown as "Showing n data points" above the table when set. */
  dataPointsCount?: number;
  /** For singular-dimension line in header (Unit | Subgroup | Area | Time | Indicator). */
  selectedComponents?: SelectedComponents;
  /** When provided with onTabChange, shows icon-only tab switchers at the top. */
  activeTab?: VisualizerContentViewTab;
  onTabChange?: (tab: VisualizerContentViewTab) => void;
  /** Called when the Insights icon button is clicked in the tab bar. */
  onInsightsClick?: () => void;
  /** Whether the Insights panel is currently active/open. */
  insightsActive?: boolean;
}

export function DataTableTab({
  indicator,
  filters,
  hasFiltersApplied,
  data: dataProp,
  unitFromData,
  title,
  titleFont,
  subtitleFont,
  dataRows,
  mapping,
  chartSortOptions,
  dataPointsCount,
  selectedComponents = {},
  activeTab = "data",
  onTabChange,
  onInsightsClick,
  insightsActive = false,
}: DataTableTabProps) {
  const { t } = useCore();

  /** Chart-aligned table: series as rows, x dimension as columns. */
  const chartAlignedTable = useMemo(() => {
    if (!dataRows?.length || !mapping) return null;
    const { categories, series } = toLineBarAreaDataFromRows(
      dataRows,
      mapping,
      'line',
      indicator?.name ?? 'Value',
      chartSortOptions
    );
    return { rowHeaders: series.map((s) => ({ id: s.id, label: s.name })), columnHeaders: categories, series };
  }, [dataRows, mapping, indicator?.name, chartSortOptions]);

  /** Series row labels (indicator/subgroup/area names); used to avoid duplicating Indicator in the p tag. */
  const seriesRowLabels = useMemo(
    () => (chartAlignedTable?.rowHeaders.map((r) => r.label) ?? []),
    [chartAlignedTable]
  );

  /** Singular dimensions for the p tag: only include when exactly one value (pipe-separated). Omit Indicator when it already appears as a series row. */
  const singularDimensionsLine = useMemo(() => {
    const parts: string[] = [];
    if (unitFromData ?? indicator?.unit) {
      parts.push(`Unit: ${unitFromData ?? indicator?.unit ?? 'N/A'}`);
    }
    const rows = dataRows ?? [];
    const indicatorLabelsWeWouldShow: string[] = [];
    if (rows.length > 0) {
      const uniqueSubgroups = [...new Set(rows.map((r) => r.subgroupName).filter(Boolean))];
      if (uniqueSubgroups.length === 1) {
        parts.push(`Subgroup: ${uniqueSubgroups[0]}`);
      } else if ((selectedComponents.subgroup?.length ?? 0) === 1) {
        parts.push(`Subgroup: ${selectedComponents.subgroup![0].label}`);
      }
      const uniqueAreas = [...new Set(rows.map((r) => r.areaName).filter(Boolean))];
      if (uniqueAreas.length === 1) {
        parts.push(`Area: ${uniqueAreas[0]}`);
      } else if ((filters.area?.length ?? 0) === 1) {
        parts.push(`Area: ${filters.area![0]}`);
      }
      const uniqueTime = [...new Set(rows.map((r) => r.timePeriodName || r.timePeriodId).filter(Boolean))];
      if (uniqueTime.length === 1) {
        parts.push(`Time: ${uniqueTime[0]}`);
      } else if ((selectedComponents.timePeriod?.length ?? 0) === 1) {
        parts.push(`Time: ${selectedComponents.timePeriod![0].label}`);
      }
      const uniqueIndicators = [...new Set(rows.map((r) => r.indicatorName).filter(Boolean))];
      if (uniqueIndicators.length === 1) {
        indicatorLabelsWeWouldShow.push(uniqueIndicators[0]);
      } else if ((selectedComponents.indicator?.length ?? 0) === 1) {
        indicatorLabelsWeWouldShow.push(selectedComponents.indicator![0].label);
      }
    } else {
      if ((selectedComponents.subgroup?.length ?? 0) === 1) {
        parts.push(`Subgroup: ${selectedComponents.subgroup![0].label}`);
      }
      if ((filters.area?.length ?? 0) === 1) {
        parts.push(`Area: ${filters.area![0]}`);
      }
      if ((selectedComponents.timePeriod?.length ?? 0) === 1) {
        parts.push(`Time: ${selectedComponents.timePeriod![0].label}`);
      }
      if ((selectedComponents.indicator?.length ?? 0) === 1) {
        indicatorLabelsWeWouldShow.push(selectedComponents.indicator![0].label);
      }
    }
    const indicatorAlreadyInTable =
      seriesRowLabels.length > 0 &&
      indicatorLabelsWeWouldShow.length > 0 &&
      indicatorLabelsWeWouldShow.every((l) => seriesRowLabels.includes(l));
    if (!indicatorAlreadyInTable && indicatorLabelsWeWouldShow.length > 0) {
      parts.push(`Indicator: ${indicatorLabelsWeWouldShow[0]}`);
    }
    return parts.length > 0 ? parts.join(' | ') : null;
  }, [unitFromData, indicator?.unit, dataRows, selectedComponents, filters.area, seriesRowLabels]);

  /** Legacy table: areas as rows, time as columns (when no dataRows/mapping). */
  const legacyTable = useMemo(() => {
    const empty = { areas: [] as string[], columns: [] as { key: string; label: string }[], values: {} as Record<string, Record<string, number>>, subgroups: [] as string[], isSingleSubgroup: true };
    if (!hasFiltersApplied || !indicator) return empty;
    const fullData = dataProp ?? [];

    const areas = [...new Set(fullData.map((d) => d.area).filter((a): a is string => a != null))].sort();
    const subgroups = [...new Set(fullData.map((d) => d.subgroup).filter((s): s is string => s != null))].sort();
    const isSingleSubgroup = subgroups.length === 1;

    const timePeriodEntries = new Map<string, { key: string; label: string; year: number }>();
    fullData.forEach((d) => {
      const key = d.timePeriodId ?? String(d.year);
      const label = d.timePeriodName ?? d.timePeriodId ?? String(d.year);
      if (!timePeriodEntries.has(key)) {
        timePeriodEntries.set(key, { key, label, year: d.year });
      }
    });
    const columns = [...timePeriodEntries.values()].sort((a, b) => a.year - b.year || a.key.localeCompare(b.key));

    const values: Record<string, Record<string, number>> = {};
    fullData.forEach((row) => {
      const a = row.area;
      if (a == null) return;
      const colKey = row.timePeriodId ?? String(row.year);
      if (!values[a]) values[a] = {};
      values[a][colKey] = row.value;
    });

    if (isSingleSubgroup) {
      return { areas, columns, values, subgroups, isSingleSubgroup };
    }

    const columnsMulti: Array<{ key: string; label: string }> = [];
    columns.forEach((col) => {
      subgroups.forEach((subgroup) => {
        columnsMulti.push({ key: `${col.key} ${subgroup}`, label: `${col.label} ${subgroup}` });
      });
    });
    const valuesMulti: Record<string, Record<string, number>> = {};
    fullData.forEach((row) => {
      const a = row.area;
      if (a == null) return;
      const colKey = `${row.timePeriodId ?? String(row.year)} ${row.subgroup ?? ''}`;
      if (!valuesMulti[a]) valuesMulti[a] = {};
      valuesMulti[a][colKey] = row.value;
    });
    return { areas, columns: columnsMulti, values: valuesMulti, subgroups, isSingleSubgroup };
  }, [indicator, hasFiltersApplied, dataProp]);

  const useChartAligned = chartAlignedTable != null;

  if (!hasFiltersApplied) {
    return (
      <div className="flex flex-col h-full">
        {onTabChange && (
          <VisualizerTabIcons activeTab={activeTab} onTabChange={onTabChange} className="mb-3" onInsightsClick={onInsightsClick} insightsActive={insightsActive} />
        )}
        <div className="flex items-center justify-center flex-1">
          <div className="text-center max-w-md">
            <AlertCircle className="w-16 h-16 text-border mx-auto mb-4" />
            <h3 className="text-text mb-2">{t("VISUALIZER_NO_DATA_LOADED")}</h3>
            <p className="text-text-muted">
              {t("VISUALIZER_SELECT_FILTERS_FOR_DATA_TABLE")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!indicator) {
    return null;
  }

  const displayTitle = title ?? indicator.name;

  return (
    <div className="flex flex-col h-full min-h-0 bg-surface rounded-lg border border-border p-3 md:p-6 overflow-hidden">
      {/* Header: fixed height, no scroll */}
      <div className="flex-shrink-0 space-y-4 md:space-y-6">
        <div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center sm:gap-0">
            <h3 className="text-sm min-w-0 break-words" style={getFontStyle(titleFont)}>{displayTitle}</h3>
            {onTabChange && (
              <VisualizerTabIcons activeTab={activeTab} onTabChange={onTabChange} className="mb-0 sm:mb-3 shrink-0 self-end sm:self-auto" onInsightsClick={onInsightsClick} insightsActive={insightsActive} />
            )}
          </div>
          <div className="flex flex-wrap justify-between gap-y-1 gap-x-2 items-baseline">
            {singularDimensionsLine && (
              <p className="text-text-muted text-xs mt-1" style={getFontStyle(subtitleFont)}>
                {singularDimensionsLine}
              </p>
            )}
            {!singularDimensionsLine && (
              <p className="text-text-muted text-xs mt-1" style={getFontStyle(subtitleFont)}>
                Unit: {unitFromData ?? indicator.unit ?? 'N/A'}
                {(legacyTable.subgroups.length > 0) && ` | Subgroup: ${legacyTable.subgroups.join(', ')}`}
              </p>
            )}
            {dataPointsCount != null && hasFiltersApplied && (
              <span className="text-text-muted text-xs">
                {t("VISUALIZER_SHOWING_DATA_POINTS").replace("{count}", String(dataPointsCount))}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Table: takes remaining height, scroll inside */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden mt-3 md:mt-6">
        <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border bg-surface">
          <div className="overflow-x-auto min-h-full">
            <table className="w-full">
              <thead className="bg-surface-muted border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left rtl:text-right text-sm font-semibold sticky left-0 rtl:left-auto rtl:right-0 bg-surface-muted z-10 min-w-[320px]">
                    {useChartAligned ? 'Series' : 'Region'}
                  </th>
                  {useChartAligned
                    ? chartAlignedTable.columnHeaders.map((label, index) => (
                      <th
                        key={index}
                        className="px-6 py-3 text-center text-sm font-semibold min-w-[100px]"
                      >
                        {label}
                      </th>
                    ))
                    : legacyTable.columns.map((col, index) => (
                      <th
                        key={index}
                        className="px-6 py-3 text-center text-sm font-semibold min-w-[100px]"
                      >
                        {col.label}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {useChartAligned
                  ? chartAlignedTable.rowHeaders.map((row, rowIndex) => (
                    <tr key={row.id} className="hover:bg-surface-muted">
                      <td className="px-6 py-4 text-text text-sm font-medium sticky left-0 rtl:left-auto rtl:right-0 bg-surface hover:bg-surface-muted z-10">
                        {row.label}
                      </td>
                      {chartAlignedTable.columnHeaders.map((_, colIndex) => {
                        const value = chartAlignedTable.series[rowIndex]?.values[colIndex];
                        const formatted = chartAlignedTable.series[rowIndex]?.formattedValues?.[colIndex];
                        const unitCode = chartAlignedTable.series[rowIndex]?.unitFormatCodes?.[colIndex];
                        const displayValue = value !== undefined 
                          ? resolveUnitDisplayValue(value, {
                              unitFormatCode: unitCode,
                              preFormatted: formatted,
                              useUnitDefault: true,
                              vizNumberFormat: '1,000[.00]'
                            })
                          : '—';
                        return (
                          <td key={colIndex} className="px-6 py-4 text-text text-center text-sm">
                            {displayValue}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                  : legacyTable.areas.map((area, areaIndex) => (
                    <tr key={areaIndex} className="hover:bg-surface-muted">
                      <td className="px-6 py-4 text-text text-sm font-medium sticky left-0 rtl:left-auto rtl:right-0 bg-surface hover:bg-surface-muted z-10">
                        {area}
                      </td>
                      {legacyTable.columns.map((col, colIndex) => {
                        const value = legacyTable.values[area]?.[col.key];
                        return (
                          <td key={colIndex} className="px-6 py-4 text-text text-center text-sm">
                            {value !== undefined ? value.toFixed(1) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
