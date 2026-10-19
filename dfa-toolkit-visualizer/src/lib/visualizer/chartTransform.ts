/**
 * Transform layer: raw data + VisualizationConfig → chart-engine data + ChartConfig.
 * Also: rows + mapping → chart-type-specific data (spec Section 7).
 */

import type { ChartConfig, LineBarAreaData, PieChartData, ScatterXYData, HeatmapData, TreemapData, RadarData, PyramidData, MapChartData } from 'dfa-v6-comp-visualization';
import type { DataPoint, DataRow, DimensionKind, DimensionValues, ScatterMapping, VisualizationConfig, SelectedItem } from '@/lib/visualizer/types';
import { getPaletteForViz } from '@/lib/visualizer/colorThemes';
import { compareTimePeriodIds } from '@/lib/visualizer/timePeriodSort';

export type SeriesDimensionKind = 'time' | 'indicator' | 'subgroup' | 'area';

export type AxisSeriesMapping = {
  xDimension: 'time' | 'indicator' | 'subgroup' | 'area';
  seriesDimension: SeriesDimensionKind | null;
  /** When set, series are composite: one per (seriesDimension, seriesDimension2). Bar charts use seriesDimension2 as stack. */
  seriesDimension2?: SeriesDimensionKind | null;
};

/** Optional sort hints from Data API meta (e.g. subgroup display order). */
export type ChartTransformSortOptions = {
  subgroupOrderByGid?: Record<string, number | null>;
};

function getDimensionKey(row: DataRow, dim: AxisSeriesMapping['xDimension'] | 'indicator' | 'subgroup' | 'area'): string {
  switch (dim) {
    case 'time': return row.timePeriodId;
    case 'indicator': return row.indicatorId;
    case 'area': return row.areaId;
    case 'subgroup': return row.subgroupId;
    default: return '';
  }
}

function getDimensionLabel(row: DataRow, dim: AxisSeriesMapping['xDimension'] | 'indicator' | 'subgroup' | 'area'): string {
  switch (dim) {
    case 'time': return row.timePeriodName;
    case 'indicator': return row.indicatorName;
    case 'area': return row.areaName;
    case 'subgroup': return row.subgroupName;
    default: return '';
  }
}

function dimensionLabelForKey(
  rows: DataRow[],
  dim: AxisSeriesMapping['xDimension'] | 'indicator' | 'subgroup' | 'area',
  key: string
): string {
  const row = rows.find((r) => getDimensionKey(r, dim) === key);
  return row ? getDimensionLabel(row, dim) : key;
}

function compareSubgroupGids(
  a: string,
  b: string,
  rows: DataRow[],
  orderByGid: Record<string, number | null> | undefined
): number {
  if (!orderByGid) {
    const la = dimensionLabelForKey(rows, 'subgroup', a);
    const lb = dimensionLabelForKey(rows, 'subgroup', b);
    const t = la.localeCompare(lb, undefined, { numeric: true, sensitivity: 'base' });
    return t !== 0 ? t : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }
  const oa = orderByGid[a];
  const ob = orderByGid[b];
  const aHas = typeof oa === 'number' && Number.isFinite(oa);
  const bHas = typeof ob === 'number' && Number.isFinite(ob);
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;
  if (aHas && bHas && oa !== ob) return (oa as number) - (ob as number);
  const la = dimensionLabelForKey(rows, 'subgroup', a);
  const lb = dimensionLabelForKey(rows, 'subgroup', b);
  const t = la.localeCompare(lb, undefined, { numeric: true, sensitivity: 'base' });
  return t !== 0 ? t : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function sortDimensionKeys(
  dim: AxisSeriesMapping['xDimension'] | SeriesDimensionKind,
  keys: string[],
  rows: DataRow[],
  subgroupOrderByGid?: Record<string, number | null>
): void {
  if (dim === 'time') {
    keys.sort(compareTimePeriodIds);
    return;
  }
  if (dim === 'subgroup') {
    keys.sort((x, y) => compareSubgroupGids(x, y, rows, subgroupOrderByGid));
    return;
  }
  keys.sort((x, y) => x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' }));
}

type CompositePairKeys = { key1: string; key2: string };

function compareCompositePairKeys(
  pa: CompositePairKeys,
  pb: CompositePairKeys,
  dim1: SeriesDimensionKind,
  dim2: SeriesDimensionKind,
  rows: DataRow[],
  subgroupOrderByGid?: Record<string, number | null>
): number {
  let c: number;
  if (dim1 === 'time') c = compareTimePeriodIds(pa.key1, pb.key1);
  else if (dim1 === 'subgroup') c = compareSubgroupGids(pa.key1, pb.key1, rows, subgroupOrderByGid);
  else c = pa.key1.localeCompare(pb.key1, undefined, { numeric: true, sensitivity: 'base' });
  if (c !== 0) return c;
  if (dim2 === 'time') c = compareTimePeriodIds(pa.key2, pb.key2);
  else if (dim2 === 'subgroup') c = compareSubgroupGids(pa.key2, pb.key2, rows, subgroupOrderByGid);
  else c = pa.key2.localeCompare(pb.key2, undefined, { numeric: true, sensitivity: 'base' });
  if (c !== 0) return c;
  return `${pa.key1}|${pa.key2}`.localeCompare(`${pb.key1}|${pb.key2}`, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

/**
 * Build LineBarAreaData from raw data array and viz config.
 * Reuses the same pivot logic as VisualizationTab: categories = years,
 * series = one per area or per subgroup when multiple; single series when one area and one subgroup.
 */
export function toLineBarAreaData(
  rawData: DataPoint[],
  _vizConfig: VisualizationConfig,
  seriesNameForSingle?: string
): LineBarAreaData {
  if (rawData.length === 0) {
    return { categories: [], series: [] };
  }

  const areas = [...new Set(rawData.map((d) => d.area).filter(Boolean))] as string[];
  const subgroups = [...new Set(rawData.map((d) => d.subgroup).filter(Boolean))] as string[];
  const years = [...new Set(rawData.map((d) => d.year))].sort((a, b) => a - b);
  const categories = years.map(String);

  if (areas.length <= 1 && subgroups.length <= 1) {
    const values = years.map((y) => rawData.find((d) => d.year === y)?.value ?? 0);
    return {
      categories,
      series: [
        {
          id: 'value',
          name: seriesNameForSingle ?? 'Value',
          values,
        },
      ],
    };
  }

  const seriesKeys = subgroups.length > 1 ? subgroups : areas;
  const series = seriesKeys.map((key) => ({
    id: key,
    name: key,
    values: years.map((y) => {
      const point = rawData.find(
        (d) => d.year === y && (subgroups.length > 1 ? d.subgroup === key : d.area === key)
      );
      return point?.value ?? 0;
    }),
  }));

  return { categories, series };
}

/**
 * Build PieChartData from raw data (first 8 points). Label = year or category, value = value.
 */
export function toPieData(rawData: DataPoint[]): PieChartData {
  const slice = rawData.slice(0, 8);
  const segments = slice.map((d) => ({
    id: String(d.year),
    label: String(d.year),
    value: d.value,
  }));
  return { segments };
}

/**
 * Build LineBarAreaData from spec rows and axis/series mapping.
 * Categories = unique x dimension values (sorted for time); series = one per series dimension (or composite when seriesDimension2 is set).
 */
export function toLineBarAreaDataFromRows(
  rows: DataRow[],
  mapping: AxisSeriesMapping,
  chartType: 'line' | 'bar' | 'area',
  seriesNameForSingle?: string,
  options?: ChartTransformSortOptions
): LineBarAreaData {
  if (rows.length === 0) {
    return { categories: [], series: [] };
  }

  const xDim = mapping.xDimension;
  const seriesDim = mapping.seriesDimension;
  const seriesDim2 = mapping.seriesDimension2 ?? null;
  const og = options?.subgroupOrderByGid;

  const xKeys = [...new Set(rows.map((r) => getDimensionKey(r, xDim)))];
  sortDimensionKeys(xDim, xKeys, rows, og);

  const categories = xKeys.map((key) => {
    const row = rows.find((r) => getDimensionKey(r, xDim) === key);
    return row ? getDimensionLabel(row, xDim) : key;
  });

  if (seriesDim === null) {
    const values: number[] = [];
    const formattedValues: (string | undefined)[] = [];
    const unitFormatCodes: (string | undefined)[] = [];
    for (const xKey of xKeys) {
      const row = rows.find((r) => getDimensionKey(r, xDim) === xKey);
      values.push(row?.value ?? 0);
      formattedValues.push(row?.formattedValue);
      unitFormatCodes.push(row?.unitFormatCode);
    }
    return {
      categories,
      series: [{ id: 'value', name: seriesNameForSingle ?? 'Value', values, formattedValues, unitFormatCodes }],
    };
  }

  // Composite series: one per (seriesDim, seriesDim2) when seriesDimension2 is set
  if (seriesDim2 != null) {
    const pairs = new Map<string, { key1: string; key2: string }>();
    for (const r of rows) {
      const k1 = getDimensionKey(r, seriesDim);
      const k2 = getDimensionKey(r, seriesDim2);
      pairs.set(`${k1}|${k2}`, { key1: k1, key2: k2 });
    }
    const sortedPairs = [...pairs.entries()].sort(([, pa], [, pb]) =>
      compareCompositePairKeys(pa, pb, seriesDim, seriesDim2, rows, og)
    );
    const series = sortedPairs.map(([compositeKey, { key1, key2 }]) => {
      const nameRow = rows.find(
        (r) => getDimensionKey(r, seriesDim) === key1 && getDimensionKey(r, seriesDim2) === key2
      );
      const label1 = nameRow ? getDimensionLabel(nameRow, seriesDim) : key1;
      const label2 = nameRow ? getDimensionLabel(nameRow, seriesDim2) : key2;
      const name = `${label1} – ${label2}`;
      const values: number[] = [];
      const formattedValues: (string | undefined)[] = [];
      const unitFormatCodes: (string | undefined)[] = [];
      for (const xKey of xKeys) {
        const row = rows.find(
          (r) =>
            getDimensionKey(r, xDim) === xKey &&
            getDimensionKey(r, seriesDim) === key1 &&
            getDimensionKey(r, seriesDim2) === key2
        );
        values.push(row?.value ?? 0);
        formattedValues.push(row?.formattedValue);
        unitFormatCodes.push(row?.unitFormatCode);
      }
      const item: { id: string; name: string; values: number[]; stack?: string; formattedValues?: (string | undefined)[]; unitFormatCodes?: (string | undefined)[] } = {
        id: compositeKey,
        name,
        values,
        formattedValues,
        unitFormatCodes,
      };
      if (chartType === 'bar') {
        item.stack = key2;
      }
      return item;
    });
    return { categories, series };
  }

  const seriesKeys = [...new Set(rows.map((r) => getDimensionKey(r, seriesDim)))];
  sortDimensionKeys(seriesDim, seriesKeys, rows, og);
  const series = seriesKeys.map((seriesKey) => {
    const nameRow = rows.find((r) => getDimensionKey(r, seriesDim) === seriesKey);
    const name = nameRow ? getDimensionLabel(nameRow, seriesDim) : seriesKey;
    const values: number[] = [];
    const formattedValues: (string | undefined)[] = [];
    const unitFormatCodes: (string | undefined)[] = [];
    for (const xKey of xKeys) {
      const row = rows.find(
        (r) => getDimensionKey(r, xDim) === xKey && getDimensionKey(r, seriesDim) === seriesKey
      );
      values.push(row?.value ?? 0);
      formattedValues.push(row?.formattedValue);
      unitFormatCodes.push(row?.unitFormatCode);
    }
    return { id: seriesKey, name, values, formattedValues, unitFormatCodes };
  });

  return { categories, series };
}

/**
 * Build PieChartData from spec rows and mapping. First 8 distinct x values; label = x display, value = sum per segment.
 */
export function toPieDataFromRows(
  rows: DataRow[],
  mapping: AxisSeriesMapping,
  options?: ChartTransformSortOptions
): PieChartData {
  if (rows.length === 0) {
    return { segments: [] };
  }

  const xDim = mapping.xDimension;
  const og = options?.subgroupOrderByGid;
  const xKeys = [...new Set(rows.map((r) => getDimensionKey(r, xDim)))];
  sortDimensionKeys(xDim, xKeys, rows, og);
  const slice = xKeys.slice(0, 8);

  const segments = slice.map((xKey) => {
    const group = rows.filter((r) => getDimensionKey(r, xDim) === xKey);
    const value = group.reduce((sum, r) => sum + r.value, 0);
    const label = group[0] ? getDimensionLabel(group[0], xDim) : xKey;
    const formattedValue = group.length === 1 ? group[0]?.formattedValue : undefined;
    const unitFormatCode = group.length === 1 ? group[0]?.unitFormatCode : undefined;
    return { id: xKey, label, value, formattedValue, unitFormatCode };
  });

  return { segments };
}

/**
 * Extract unique values per dimension from rows for scatter dropdowns.
 */
export function extractDimensionValues(
  rows: DataRow[],
  options?: ChartTransformSortOptions
): DimensionValues {
  const seen = { indicators: new Map<string, string>(), subgroups: new Map<string, string>(), areas: new Map<string, string>(), timePeriods: new Map<string, string>() };
  for (const r of rows) {
    if (!seen.indicators.has(r.indicatorId)) seen.indicators.set(r.indicatorId, r.indicatorName);
    if (!seen.subgroups.has(r.subgroupId)) seen.subgroups.set(r.subgroupId, r.subgroupName);
    if (!seen.areas.has(r.areaId)) seen.areas.set(r.areaId, r.areaName);
    if (!seen.timePeriods.has(r.timePeriodId)) seen.timePeriods.set(r.timePeriodId, r.timePeriodName);
  }
  const toArr = (m: Map<string, string>) => [...m.entries()].map(([id, label]) => ({ id, label }));
  const og = options?.subgroupOrderByGid;
  const subgroups = toArr(seen.subgroups);
  subgroups.sort((a, b) =>
    compareSubgroupGids(String(a.id), String(b.id), rows, og)
  );
  return {
    indicators: toArr(seen.indicators),
    subgroups,
    areas: toArr(seen.areas),
    timePeriods: toArr(seen.timePeriods),
  };
}

function dimensionValuesForKind(dv: DimensionValues, kind: DimensionKind) {
  switch (kind) {
    case 'indicator': return dv.indicators;
    case 'subgroup': return dv.subgroups;
    case 'area': return dv.areas;
    case 'time': return dv.timePeriods;
  }
}

const ALL_DIMENSIONS: DimensionKind[] = ['indicator', 'subgroup', 'area', 'time'];

/**
 * Compute a sensible default ScatterMapping from the available dimension values.
 * Priority: indicator > subgroup > area > time (first dimension with >= 2 values is the measure dimension).
 */
export function getDefaultScatterMapping(dv: DimensionValues): ScatterMapping | null {
  for (const kind of ALL_DIMENSIONS) {
    const vals = dimensionValuesForKind(dv, kind);
    if (vals.length >= 2) {
      const colorDimension = ALL_DIMENSIONS.find((d) => d !== kind && dimensionValuesForKind(dv, d).length >= 2) ?? null;
      return {
        measureDimension: kind,
        xMeasure: vals[0],
        yMeasure: vals[1],
        colorDimension,
      };
    }
  }
  return null;
}

/**
 * Build ScatterXYData from rows + scatter mapping.
 *
 * Algorithm:
 *  1. Split rows into X-measure rows and Y-measure rows based on measureDimension.
 *  2. The "join key" for each row is the combination of ALL other dimensions (excluding measureDimension).
 *  3. For each join key present in both X and Y sets, create a point { x, y, label }.
 *  4. If colorDimension is set, group points into series by that dimension; otherwise single series.
 */
export function toScatterXYDataFromRows(rows: DataRow[], mapping: ScatterMapping): ScatterXYData {
  const { measureDimension, xMeasure, yMeasure, colorDimension } = mapping;

  const otherDimensions = ALL_DIMENSIONS.filter((d) => d !== measureDimension);

  const joinKey = (row: DataRow) =>
    otherDimensions.map((d) => getDimensionKey(row, d)).join('|');

  const joinLabel = (row: DataRow) => {
    const parts = otherDimensions
      .filter((d) => d !== colorDimension)
      .map((d) => getDimensionLabel(row, d));
    return parts.join(' – ');
  };

  const xRows = new Map<string, DataRow>();
  const yRows = new Map<string, DataRow>();

  for (const r of rows) {
    const measureId = getDimensionKey(r, measureDimension);
    const key = joinKey(r);
    if (measureId === xMeasure.id) xRows.set(key, r);
    else if (measureId === yMeasure.id) yRows.set(key, r);
  }

  type Point = { x: number; y: number; label: string; colorKey: string; colorLabel: string; formattedX?: string; formattedY?: string; unitFormatCodeX?: string; unitFormatCodeY?: string };
  const points: Point[] = [];

  for (const [key, xRow] of xRows) {
    const yRow = yRows.get(key);
    if (!yRow) continue;
    const colorKey = colorDimension ? getDimensionKey(xRow, colorDimension) : '__all__';
    const colorLabel = colorDimension ? getDimensionLabel(xRow, colorDimension) : 'All';
    points.push({ x: xRow.value, y: yRow.value, label: joinLabel(xRow), colorKey, colorLabel, formattedX: xRow.formattedValue, formattedY: yRow.formattedValue, unitFormatCodeX: xRow.unitFormatCode, unitFormatCodeY: yRow.unitFormatCode });
  }

  const groups = new Map<string, { name: string; points: ScatterXYData['series'][0]['points'] }>();
  for (const p of points) {
    let group = groups.get(p.colorKey);
    if (!group) {
      group = { name: p.colorLabel, points: [] };
      groups.set(p.colorKey, group);
    }
    group.points.push({ x: p.x, y: p.y, label: p.label, formattedX: p.formattedX, formattedY: p.formattedY });
  }

  return {
    series: [...groups.entries()].map(([id, g]) => ({ id, name: g.name, points: g.points })),
    xAxisLabel: xMeasure.label,
    yAxisLabel: yMeasure.label,
  };
}

/**
 * Build PyramidData (population pyramid / diverging horizontal bar) from spec rows and mapping.
 *
 * Requires seriesDimension to be set — it provides the two "wings" of the pyramid.
 * The xDimension provides the Y-axis categories (e.g. age groups, areas, time periods).
 *
 * Dimension combination support:
 *   xDimension=subgroup + seriesDimension=area      → age bands on Y, Area1 left, Area2 right
 *   xDimension=subgroup + seriesDimension=time      → age bands on Y, Year1 left, Year2 right
 *   xDimension=time     + seriesDimension=area      → time on Y, Area1 left, Area2 right
 *   xDimension=area     + seriesDimension=subgroup  → areas on Y, Sub1 left, Sub2 right
 *   seriesDimension2 set                            → composite pairs; first two pairs = wings
 *   seriesDimension=null                            → null (cannot form two wings)
 *   < 2 unique seriesDimension values               → null (cannot form two wings)
 *
 * Left wing values are negated so ECharts renders them extending left of the center axis.
 * The option builder's X-axis formatter shows Math.abs() so both sides display positive numbers.
 */
export function toPyramidDataFromRows(
  rows: DataRow[],
  mapping: AxisSeriesMapping,
  options?: ChartTransformSortOptions
): PyramidData | null {
  if (rows.length === 0) return null;

  const xDim = mapping.xDimension;
  const seriesDim = mapping.seriesDimension;
  const seriesDim2 = mapping.seriesDimension2 ?? null;
  const og = options?.subgroupOrderByGid;

  // A pyramid needs exactly 2 wings — impossible without a series dimension.
  if (seriesDim === null) return null;

  // Build Y-axis categories from the xDimension.
  const xKeys = [...new Set(rows.map((r) => getDimensionKey(r, xDim)))];
  sortDimensionKeys(xDim, xKeys, rows, og);
  if (xKeys.length === 0) return null;

  const categories = xKeys.map((key) => {
    const row = rows.find((r) => getDimensionKey(r, xDim) === key);
    return row ? getDimensionLabel(row, xDim) : key;
  });

  // Resolve the two wings.
  let leftName: string;
  let rightName: string;
  let leftValues: number[];
  let rightValues: number[];
  let leftFormattedValues: (string | undefined)[] = [];
  let rightFormattedValues: (string | undefined)[] = [];
  let leftUnitFormatCodes: (string | undefined)[] = [];
  let rightUnitFormatCodes: (string | undefined)[] = [];

  if (seriesDim2 != null) {
    // Composite series: one wing per (seriesDim, seriesDim2) pair.
    // Collect all unique composite pairs and sort them; take the first two.
    const pairs = new Map<string, { key1: string; key2: string }>();
    for (const r of rows) {
      const k1 = getDimensionKey(r, seriesDim);
      const k2 = getDimensionKey(r, seriesDim2);
      pairs.set(`${k1}|${k2}`, { key1: k1, key2: k2 });
    }
    const sortedPairs = [...pairs.entries()].sort(([, pa], [, pb]) =>
      compareCompositePairKeys(pa, pb, seriesDim, seriesDim2, rows, og)
    );
    if (sortedPairs.length < 2) return null;

    const [, pair1] = sortedPairs[0];
    const [, pair2] = sortedPairs[1];

    const nameRow1 = rows.find(
      (r) =>
        getDimensionKey(r, seriesDim) === pair1.key1 &&
        getDimensionKey(r, seriesDim2) === pair1.key2
    );
    const nameRow2 = rows.find(
      (r) =>
        getDimensionKey(r, seriesDim) === pair2.key1 &&
        getDimensionKey(r, seriesDim2) === pair2.key2
    );
    const label1a = nameRow1 ? getDimensionLabel(nameRow1, seriesDim) : pair1.key1;
    const label1b = nameRow1 ? getDimensionLabel(nameRow1, seriesDim2) : pair1.key2;
    const label2a = nameRow2 ? getDimensionLabel(nameRow2, seriesDim) : pair2.key1;
    const label2b = nameRow2 ? getDimensionLabel(nameRow2, seriesDim2) : pair2.key2;
    leftName = `${label1a} – ${label1b}`;
    rightName = `${label2a} – ${label2b}`;

    leftValues = xKeys.map((xKey) => {
      const row = rows.find(
        (r) =>
          getDimensionKey(r, xDim) === xKey &&
          getDimensionKey(r, seriesDim) === pair1.key1 &&
          getDimensionKey(r, seriesDim2) === pair1.key2
      );
      return -(row?.value ?? 0);
    });
    leftFormattedValues = xKeys.map((xKey) => {
      const row = rows.find(
        (r) =>
          getDimensionKey(r, xDim) === xKey &&
          getDimensionKey(r, seriesDim) === pair1.key1 &&
          getDimensionKey(r, seriesDim2) === pair1.key2
      );
      return row?.formattedValue;
    });
    leftUnitFormatCodes = xKeys.map((xKey) => {
      const row = rows.find(
        (r) =>
          getDimensionKey(r, xDim) === xKey &&
          getDimensionKey(r, seriesDim) === pair1.key1 &&
          getDimensionKey(r, seriesDim2) === pair1.key2
      );
      return row?.unitFormatCode;
    });
    rightValues = xKeys.map((xKey) => {
      const row = rows.find(
        (r) =>
          getDimensionKey(r, xDim) === xKey &&
          getDimensionKey(r, seriesDim) === pair2.key1 &&
          getDimensionKey(r, seriesDim2) === pair2.key2
      );
      return row?.value ?? 0;
    });
    rightFormattedValues = xKeys.map((xKey) => {
      const row = rows.find(
        (r) =>
          getDimensionKey(r, xDim) === xKey &&
          getDimensionKey(r, seriesDim) === pair2.key1 &&
          getDimensionKey(r, seriesDim2) === pair2.key2
      );
      return row?.formattedValue;
    });
    rightUnitFormatCodes = xKeys.map((xKey) => {
      const row = rows.find(
        (r) =>
          getDimensionKey(r, xDim) === xKey &&
          getDimensionKey(r, seriesDim) === pair2.key1 &&
          getDimensionKey(r, seriesDim2) === pair2.key2
      );
      return row?.unitFormatCode;
    });
  } else {
    // Normal: take the first two unique seriesDimension values (subgroup order / alpha).
    const seriesKeys = [...new Set(rows.map((r) => getDimensionKey(r, seriesDim)))];
    sortDimensionKeys(seriesDim, seriesKeys, rows, og);
    if (seriesKeys.length < 2) return null;

    const [key1, key2] = seriesKeys;

    const nameRow1 = rows.find((r) => getDimensionKey(r, seriesDim) === key1);
    const nameRow2 = rows.find((r) => getDimensionKey(r, seriesDim) === key2);
    leftName = nameRow1 ? getDimensionLabel(nameRow1, seriesDim) : key1;
    rightName = nameRow2 ? getDimensionLabel(nameRow2, seriesDim) : key2;

    leftValues = xKeys.map((xKey) => {
      const row = rows.find(
        (r) => getDimensionKey(r, xDim) === xKey && getDimensionKey(r, seriesDim) === key1
      );
      return -(row?.value ?? 0);
    });
    leftFormattedValues = xKeys.map((xKey) => {
      const row = rows.find(
        (r) => getDimensionKey(r, xDim) === xKey && getDimensionKey(r, seriesDim) === key1
      );
      return row?.formattedValue;
    });
    leftUnitFormatCodes = xKeys.map((xKey) => {
      const row = rows.find(
        (r) => getDimensionKey(r, xDim) === xKey && getDimensionKey(r, seriesDim) === key1
      );
      return row?.unitFormatCode;
    });
    rightValues = xKeys.map((xKey) => {
      const row = rows.find(
        (r) => getDimensionKey(r, xDim) === xKey && getDimensionKey(r, seriesDim) === key2
      );
      return row?.value ?? 0;
    });
    rightFormattedValues = xKeys.map((xKey) => {
      const row = rows.find(
        (r) => getDimensionKey(r, xDim) === xKey && getDimensionKey(r, seriesDim) === key2
      );
      return row?.formattedValue;
    });
    rightUnitFormatCodes = xKeys.map((xKey) => {
      const row = rows.find(
        (r) => getDimensionKey(r, xDim) === xKey && getDimensionKey(r, seriesDim) === key2
      );
      return row?.unitFormatCode;
    });
  }

  return {
    kind: 'pyramid',
    categories,
    leftSeries: { name: leftName, values: leftValues, formattedValues: leftFormattedValues, unitFormatCodes: leftUnitFormatCodes },
    rightSeries: { name: rightName, values: rightValues, formattedValues: rightFormattedValues, unitFormatCodes: rightUnitFormatCodes },
  };
}

/**
 * Build HeatmapData from spec rows and axis/series mapping.
 *
 * Single-dimension (seriesDimension null): one row of cells along the x-dimension
 * (e.g. time periods) with a single y-band — color intensity encodes value (e.g. SDG score over years).
 *
 * Two-dimension (seriesDimension set): classic grid — x vs y, cells summed per (x,y).
 *
 * Edge cases:
 *   - seriesDimension2 is ignored (heatmap is strictly 2-axis in the multi-dim case)
 *   - multiple rows for the same (x, y) pair are summed
 *   - min === max is expanded by ±1 so the visualMap scale is never degenerate
 */
export function toHeatmapDataFromRows(
  rows: DataRow[],
  mapping: AxisSeriesMapping,
  singleRowYLabel?: string,
  options?: ChartTransformSortOptions
): HeatmapData | null {
  if (rows.length === 0) return null;

  const xDim = mapping.xDimension;
  const og = options?.subgroupOrderByGid;

  const xKeys = [...new Set(rows.map((r) => getDimensionKey(r, xDim)))];
  sortDimensionKeys(xDim, xKeys, rows, og);

  if (xKeys.length === 0) return null;

  const xCategories = xKeys.map((key) => {
    const row = rows.find((r) => getDimensionKey(r, xDim) === key);
    return row ? getDimensionLabel(row, xDim) : key;
  });

  if (mapping.seriesDimension === null) {
    const yLabel =
      singleRowYLabel?.trim() ||
      rows[0]?.indicatorName?.trim() ||
      'Series';
    const yCategories = [yLabel];
    const cells: [number, number, number][] = [];
    const formattedCells: (string | undefined)[] = [];
    const unitFormatCells: (string | undefined)[] = [];
    let min = Infinity;
    let max = -Infinity;

    for (let xi = 0; xi < xKeys.length; xi++) {
      const matching = rows.filter((r) => getDimensionKey(r, xDim) === xKeys[xi]);
      if (matching.length > 0) {
        const value = matching.reduce((sum, r) => sum + r.value, 0);
        cells.push([xi, 0, value]);
        formattedCells.push(matching.length === 1 ? matching[0]?.formattedValue : undefined);
        unitFormatCells.push(matching.length === 1 ? matching[0]?.unitFormatCode : undefined);
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }

    if (cells.length === 0) return null;

    if (!isFinite(min)) min = 0;
    if (!isFinite(max)) max = 0;
    if (min === max) {
      min = min > 0 ? Math.max(0, min - 1) : min - 1;
      max = max + 1;
    }

    return { xCategories, yCategories, cells, min, max, formattedCells, unitFormatCells };
  }

  const yDim = mapping.seriesDimension;
  const yKeys = [...new Set(rows.map((r) => getDimensionKey(r, yDim)))];
  sortDimensionKeys(yDim, yKeys, rows, og);

  if (yKeys.length === 0) return null;

  const yCategories = yKeys.map((key) => {
    const row = rows.find((r) => getDimensionKey(r, yDim) === key);
    return row ? getDimensionLabel(row, yDim) : key;
  });

  const cells: [number, number, number][] = [];
  const formattedCells: (string | undefined)[] = [];
  const unitFormatCells: (string | undefined)[] = [];
  let min = Infinity;
  let max = -Infinity;

  for (let xi = 0; xi < xKeys.length; xi++) {
    for (let yi = 0; yi < yKeys.length; yi++) {
      const matching = rows.filter(
        (r) => getDimensionKey(r, xDim) === xKeys[xi] && getDimensionKey(r, yDim) === yKeys[yi]
      );
      if (matching.length > 0) {
        const value = matching.reduce((sum, r) => sum + r.value, 0);
        cells.push([xi, yi, value]);
        formattedCells.push(matching.length === 1 ? matching[0]?.formattedValue : undefined);
        unitFormatCells.push(matching.length === 1 ? matching[0]?.unitFormatCode : undefined);
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
  }

  if (cells.length === 0) return null;

  if (!isFinite(min)) min = 0;
  if (!isFinite(max)) max = 0;
  if (min === max) {
    min = min > 0 ? Math.max(0, min - 1) : min - 1;
    max = max + 1;
  }

  return { xCategories, yCategories, cells, min, max, formattedCells, unitFormatCells };
}

/**
 * Convert rows to hierarchical TreemapData using the axis mapping.
 *
 * Single dimension (seriesDimension === null): flat nodes, one per xDimension value,
 * sized by summed value.
 * Two dimensions: parent nodes by xDimension, each with children by seriesDimension.
 * Multiple rows for the same group are summed.
 */
export function toTreemapDataFromRows(
  rows: DataRow[],
  mapping: AxisSeriesMapping,
  options?: ChartTransformSortOptions
): TreemapData | null {
  if (rows.length === 0) return null;

  const xDim = mapping.xDimension;
  const yDim = mapping.seriesDimension;
  const og = options?.subgroupOrderByGid;

  const xKeys = [...new Set(rows.map((r) => getDimensionKey(r, xDim)))];
  sortDimensionKeys(xDim, xKeys, rows, og);

  if (xKeys.length === 0) return null;

  if (yDim === null) {
    const nodes = xKeys.map((xKey) => {
      const group = rows.filter((r) => getDimensionKey(r, xDim) === xKey);
      const value = group.reduce((sum, r) => sum + r.value, 0);
      const label = group[0] ? getDimensionLabel(group[0], xDim) : xKey;
      const formattedValue = group.length === 1 ? group[0]?.formattedValue : undefined;
      const unitFormatCode = group.length === 1 ? group[0]?.unitFormatCode : undefined;
      return { name: label, value: Math.abs(value), formattedValue, unitFormatCode };
    });
    return nodes.length > 0 ? { nodes } : null;
  }

  const yKeys = [...new Set(rows.map((r) => getDimensionKey(r, yDim)))];
  sortDimensionKeys(yDim, yKeys, rows, og);

  const nodes = xKeys.map((xKey) => {
    const xRows = rows.filter((r) => getDimensionKey(r, xDim) === xKey);
    const xLabel = xRows[0] ? getDimensionLabel(xRows[0], xDim) : xKey;

    const children = yKeys
      .map((yKey) => {
        const matching = xRows.filter((r) => getDimensionKey(r, yDim) === yKey);
        if (matching.length === 0) return null;
        const value = matching.reduce((sum, r) => sum + r.value, 0);
        const yLabel = matching[0] ? getDimensionLabel(matching[0], yDim) : yKey;
        const formattedValue = matching.length === 1 ? matching[0]?.formattedValue : undefined;
        const unitFormatCode = matching.length === 1 ? matching[0]?.unitFormatCode : undefined;
        return { name: yLabel, value: Math.abs(value), formattedValue, unitFormatCode };
      })
      .filter((c) => c !== null) as { name: string; value: number; formattedValue?: string; unitFormatCode?: string }[];

    const totalValue = children.reduce((sum, c) => sum + c.value, 0);
    return { name: xLabel, value: totalValue, children };
  });

  return nodes.length > 0 ? { nodes } : null;
}

/**
 * Compute a "nice" ceiling for a radar indicator max.
 * Rounds up to the next 1 / 2 / 5 / 10 multiple at the data's order of magnitude,
 * matching the feel of ECharts' scale:true behaviour on line/bar axes.
 * Examples: 80 → 100, 450 → 500, 1234 → 2000, 1007873 → 2000000.
 */
function niceRadarMax(value: number): number {
  if (!isFinite(value) || value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  let nice: number;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 5) nice = 5;
  else nice = 10;
  return nice * magnitude;
}

/**
 * Build RadarData (spider chart) from spec rows and axis/series mapping.
 *
 * Single-dimension: when seriesDimension is null the x-dimension values become
 * the spokes and a single polygon is drawn — useful when only one area/subgroup is selected.
 *
 * Multi-dimension: one polygon per series dimension value (same pivot as heatmap).
 * Composite series (seriesDimension2) are also supported.
 *
 * Indicator max values are rounded up to a "nice" ceiling so the outer ring is always
 * a round number (e.g. 80 → 100) rather than sitting exactly at the data max.
 */
export function toRadarDataFromRows(
  rows: DataRow[],
  mapping: AxisSeriesMapping,
  seriesNameForSingle?: string,
  options?: ChartTransformSortOptions
): RadarData | null {
  if (rows.length === 0) return null;

  const xDim = mapping.xDimension;
  const seriesDim = mapping.seriesDimension;
  const seriesDim2 = mapping.seriesDimension2 ?? null;
  const og = options?.subgroupOrderByGid;

  const xKeys = [...new Set(rows.map((r) => getDimensionKey(r, xDim)))];
  sortDimensionKeys(xDim, xKeys, rows, og);

  if (xKeys.length === 0) return null;

  const categories = xKeys.map((key) => {
    const row = rows.find((r) => getDimensionKey(r, xDim) === key);
    return row ? getDimensionLabel(row, xDim) : key;
  });

  type RadarSeriesRow = { name: string; values: number[]; formattedValues?: (string | undefined)[]; unitFormatCodes?: (string | undefined)[] };

  let seriesRows: RadarSeriesRow[];

  if (seriesDim === null) {
    const values: number[] = [];
    const fmtValues: (string | undefined)[] = [];
    const unitCodes: (string | undefined)[] = [];
    for (const xKey of xKeys) {
      const row = rows.find((r) => getDimensionKey(r, xDim) === xKey);
      values.push(row?.value ?? 0);
      fmtValues.push(row?.formattedValue);
      unitCodes.push(row?.unitFormatCode);
    }
    seriesRows = [{ name: seriesNameForSingle ?? 'Value', values, formattedValues: fmtValues, unitFormatCodes: unitCodes }];
  } else if (seriesDim2 != null) {
    const pairs = new Map<string, { key1: string; key2: string }>();
    for (const r of rows) {
      const k1 = getDimensionKey(r, seriesDim);
      const k2 = getDimensionKey(r, seriesDim2);
      pairs.set(`${k1}|${k2}`, { key1: k1, key2: k2 });
    }
    const sortedPairs = [...pairs.entries()].sort(([, pa], [, pb]) =>
      compareCompositePairKeys(pa, pb, seriesDim, seriesDim2, rows, og)
    );
    seriesRows = sortedPairs.map(([, { key1, key2 }]) => {
      const nameRow = rows.find(
        (r) => getDimensionKey(r, seriesDim) === key1 && getDimensionKey(r, seriesDim2) === key2
      );
      const label1 = nameRow ? getDimensionLabel(nameRow, seriesDim) : key1;
      const label2 = nameRow ? getDimensionLabel(nameRow, seriesDim2) : key2;
      const name = `${label1} – ${label2}`;
      const values = xKeys.map((xKey) => {
        const row = rows.find(
          (r) =>
            getDimensionKey(r, xDim) === xKey &&
            getDimensionKey(r, seriesDim) === key1 &&
            getDimensionKey(r, seriesDim2) === key2
        );
        return row?.value ?? 0;
      });
      const formattedValues = xKeys.map((xKey) => {
        const row = rows.find(
          (r) =>
            getDimensionKey(r, xDim) === xKey &&
            getDimensionKey(r, seriesDim) === key1 &&
            getDimensionKey(r, seriesDim2) === key2
        );
        return row?.formattedValue;
      });
      const unitFormatCodes = xKeys.map((xKey) => {
        const row = rows.find(
          (r) =>
            getDimensionKey(r, xDim) === xKey &&
            getDimensionKey(r, seriesDim) === key1 &&
            getDimensionKey(r, seriesDim2) === key2
        );
        return row?.unitFormatCode;
      });
      return { name, values, formattedValues, unitFormatCodes };
    });
  } else {
    const seriesKeys = [...new Set(rows.map((r) => getDimensionKey(r, seriesDim)))];
    sortDimensionKeys(seriesDim, seriesKeys, rows, og);
    seriesRows = seriesKeys.map((seriesKey) => {
      const nameRow = rows.find((r) => getDimensionKey(r, seriesDim) === seriesKey);
      const name = nameRow ? getDimensionLabel(nameRow, seriesDim) : seriesKey;
      const values = xKeys.map((xKey) => {
        const row = rows.find(
          (r) => getDimensionKey(r, xDim) === xKey && getDimensionKey(r, seriesDim) === seriesKey
        );
        return row?.value ?? 0;
      });
      const formattedValues = xKeys.map((xKey) => {
        const row = rows.find(
          (r) => getDimensionKey(r, xDim) === xKey && getDimensionKey(r, seriesDim) === seriesKey
        );
        return row?.formattedValue;
      });
      const unitFormatCodes = xKeys.map((xKey) => {
        const row = rows.find(
          (r) => getDimensionKey(r, xDim) === xKey && getDimensionKey(r, seriesDim) === seriesKey
        );
        return row?.unitFormatCode;
      });
      return { name, values, formattedValues, unitFormatCodes };
    });
  }

  if (seriesRows.length === 0) return null;

  let globalRawMax = 0;
  for (const s of seriesRows) {
    for (const v of s.values) {
      if ((v ?? 0) > globalRawMax) globalRawMax = v ?? 0;
    }
  }
  const uniformMax = niceRadarMax(globalRawMax);

  const indicators: { name: string; max: number }[] = categories.map((cat) => ({
    name: cat,
    max: uniformMax,
  }));

  return {
    indicators,
    series: seriesRows.map((s) => ({ name: s.name, values: s.values, formattedValues: s.formattedValues, unitFormatCodes: s.unitFormatCodes })),
  };
}

/**
 * Map full VisualizationConfig to the engine's ChartConfig.
 * Supports: line | bar | area | pie | scatter | heatmap | treemap | radar | pyramid (advanced variants).
 * Other 'advanced' variants fall back to 'line' engine type (placeholder rendered in app).
 */
export function mapVizConfigToChartConfig(viz: VisualizationConfig): ChartConfig {
  const palette = getPaletteForViz(viz);

  let engineType: ChartConfig['type'];
  if (viz.chartType === 'line' || viz.chartType === 'bar' || viz.chartType === 'area' || viz.chartType === 'pie') {
    engineType = viz.chartType;
  } else if (viz.chartType === 'advanced' && viz.chartVariant === 'scatter') {
    engineType = 'scatter';
  } else if (viz.chartType === 'advanced' && viz.chartVariant === 'heatmap') {
    engineType = 'heatmap';
  } else if (viz.chartType === 'advanced' && viz.chartVariant === 'treemap') {
    engineType = 'treemap';
  } else if (viz.chartType === 'advanced' && viz.chartVariant === 'spider') {
    engineType = 'radar';
  } else if (viz.chartType === 'advanced' && viz.chartVariant === 'pyramid') {
    engineType = 'pyramid';
  } else if (viz.chartType === 'advanced' && viz.chartVariant === 'map') {
    engineType = 'map';
  } else {
    engineType = 'line';
  }

  return {
    type: engineType,
    showXAxis: viz.showXAxis,
    showYAxis: viz.showYAxis,
    showGrid: viz.showGrid,
    showLabels: viz.showLabels,
    showLegend: viz.showLegend,
    legendPosition: viz.legendPosition,
    labelOrientation: viz.labelOrientation,
    primaryColor: viz.chartColor,
    palette,
    labelFont: viz.labelFont,
    legendFont: viz.legendFont,
    columnSpacing: viz.columnSpacing,
    lineThickness: viz.lineThickness,
    chartVariant: viz.chartVariant,
    pieDonut: viz.chartVariant === 'donut',
    pieSemi: viz.chartVariant === 'semi',
    pieLabelsInside: !!(viz.pieSettings?.insideLabels?.showLabels || viz.pieSettings?.insideLabels?.showValues),
    pieLabelsOutside: !!viz.pieSettings?.outsideLabels?.showValues,
    yAxisMin: viz.yAxisRange?.min ?? '',
    yAxisMax: viz.yAxisRange?.max ?? '',
    yAxisInterval: viz.yAxisRange?.interval ?? '',
    dataLabelPosition: viz.dataValues?.position ?? 'outside',
    dataLabelVisibility: viz.dataValues?.visibility ?? 'always',
    dataLabelNumberFormat: viz.dataValues?.numberFormat ?? '1,000[.00]',
    useUnitDefaultFormat: viz.dataValues?.useUnitDefaultFormat ?? true,
    scatterSymbolSize: viz.scatterSettings?.symbolSize ?? 10,
    scatterSymbol: viz.scatterSettings?.symbol ?? 'circle',
    plotAreaBackgroundColor: viz.plotAreaBackgroundColor,
    mapLabels: viz.mapLabels,
  };
}

// ---------------------------------------------------------------------------
// Map (choropleth) data transform
// ---------------------------------------------------------------------------

const MAP_NULL_COLOR = '#d9d9d9';
const MAP_DIM_COLOR = '#f0f0f0';

/**
 * Choropleth uses one value per area; rows must be a single time period.
 * - If the user selected multiple time periods: keep the chronologically earliest among
 *   those selections that appear in `rows` (same ordering as {@link compareTimePeriodIds}).
 * - If none are selected but `rows` span multiple periods: keep the earliest period present.
 * - Already a single period: return `rows` unchanged.
 */
export function filterRowsForMapSingleTimePeriod(
  rows: DataRow[],
  selectedTimePeriods: SelectedItem[] | undefined,
): DataRow[] {
  if (rows.length === 0) return rows;

  const uniqueIds = [...new Set(rows.map((r) => r.timePeriodId))];
  if (uniqueIds.length <= 1) return rows;

  const rowIds = new Set(rows.map((r) => String(r.timePeriodId)));

  let chosenRowTimeId: string;

  if (selectedTimePeriods?.length) {
    const sortedSelected = [...selectedTimePeriods].sort((a, b) =>
      compareTimePeriodIds(String(a.id), String(b.id)),
    );
    const match = sortedSelected.find((p) => rowIds.has(String(p.id)));
    if (match) {
      const row = rows.find((r) => String(r.timePeriodId) === String(match.id));
      chosenRowTimeId = row!.timePeriodId;
    } else {
      uniqueIds.sort(compareTimePeriodIds);
      chosenRowTimeId = uniqueIds[0]!;
    }
  } else {
    uniqueIds.sort(compareTimePeriodIds);
    chosenRowTimeId = uniqueIds[0]!;
  }

  return rows.filter((r) => r.timePeriodId === chosenRowTimeId);
}

/**
 * Returns the human-readable time-period label shown by the map when multiple
 * periods exist in `rows`. Returns `null` when the subtitle already covers the
 * period (single selection or single period in data).
 */
export function getMapEffectiveTimePeriodLabel(
  rows: DataRow[],
  selectedTimePeriods: SelectedItem[] | undefined,
): string | null {
  const filtered = filterRowsForMapSingleTimePeriod(rows, selectedTimePeriods);
  if (filtered.length === 0) return null;
  const label = filtered[0]!.timePeriodName || filtered[0]!.timePeriodId;

  const rawUniqueIds = new Set(rows.map((r) => r.timePeriodId));
  const multiPeriodsInData = rawUniqueIds.size > 1;
  const multiSelected = (selectedTimePeriods?.length ?? 0) > 1;

  if (!multiPeriodsInData && !multiSelected) return null;
  return label || null;
}

/**
 * Build MapChartData by joining GeoJSON features with indicator data rows.
 * IMPORTANT: row.areaId must be ar_id (DML map code, e.g. "AMR010"), NOT ar_gid.
 * The join matches row.areaId against GeoJSON feature properties.ID_.
 *
 * @param geoJSON   Raw GeoJSON FeatureCollection from DML
 * @param rows      Data rows for a single time period (see {@link filterRowsForMapSingleTimePeriod})
 * @param selectedAreaIds  Set of area IDs the user explicitly selected
 * @param classification  Pre-computed breaks, colors, labels
 * @param mapName   Unique name for echarts.registerMap
 */
export function toMapDataFromRows(
  geoJSON: unknown,
  rows: DataRow[],
  selectedAreaIds: Set<string>,
  classification: { breaks: number[]; colors: string[]; labels: string[] },
  mapName: string,
): MapChartData {
  const valueByAreaId = new Map<string, number>();
  for (const row of rows) {
    valueByAreaId.set(row.areaId.toUpperCase(), row.value);
  }

  type GeoFeature = { properties?: Record<string, unknown> };
  const fc = geoJSON as { features?: GeoFeature[] };
  const features = (fc?.features ?? []).map((f) => {
    const featureId = String(f.properties?.['ID_'] ?? f.properties?.['id_'] ?? '').toUpperCase();
    const featureName = String(f.properties?.['NAME1_'] ?? f.properties?.['name1_'] ?? featureId);
    const isSelected = selectedAreaIds.has(featureId);
    const value = valueByAreaId.get(featureId) ?? null;

    return {
      name: featureName,
      areaId: featureId,
      value: isSelected ? value : null,
      selected: isSelected,
    };
  });

  return {
    kind: 'map',
    geoJSON,
    mapName,
    features,
    classification,
    nullColor: MAP_NULL_COLOR,
    dimColor: MAP_DIM_COLOR,
  };
}
