import type { EChartsOption } from 'echarts';
import type { ChartConfig, SunburstData, TreemapNode } from '../types';
import { buildEchartsTextStyle, escapeRichText } from '../fontUtils';
import { computeTitleBlockHeight } from '../titleLayout';
import {
  buildLabelTypography,
  collectSunburstLabelPrimeTexts,
  resolveFormattedValue,
  resolveDataLabelFont,
} from './labelUtils';

/**
 * Place the sunburst below the title/subtitle/customLabel block and shrink its
 * outer radius so rings never paint through the headings (same idea as pie /
 * hundredMinus). Legend is always off for sunburst, so only title chrome matters.
 */
function sunburstLayout(config: ChartConfig): {
  centerY: string;
  /** Outer radius as a percent of the container (0–100). */
  outerPct: number;
} {
  const titleBlock = computeTitleBlockHeight(config);
  if (titleBlock <= 0) {
    return { centerY: '50%', outerPct: 88 };
  }
  // Shift center down and shrink the outer radius so the top of the outer ring
  // (and radial labels inside it) clear the title/subtitle/customLabel block.
  // More aggressive than pie: sunburst fills a full disk and labels sit near the rim.
  const shiftPct = Math.min(18, 6 + titleBlock * 0.08);
  const centerY = `${Math.min(64, 50 + shiftPct)}%`;
  const outerPct = titleBlock > 40 ? 52 : 64;
  return { centerY, outerPct };
}

/**
 * Detect the maximum depth of the node tree (root nodes = depth 1).
 */
function maxDepth(nodes: TreemapNode[], current = 1): number {
  let max = current;
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      max = Math.max(max, maxDepth(node.children, current + 1));
    }
  }
  return max;
}

/**
 * Recursively build a flat name→formattedValue/unitFormatCode lookup across all depths.
 */
function buildFlatLookup<K extends 'formattedValue' | 'unitFormatCode'>(
  nodes: TreemapNode[],
  key: K,
  map = new Map<string, string | undefined>(),
): Map<string, string | undefined> {
  for (const node of nodes) {
    if (node.name) map.set(node.name, node[key]);
    if (node.children) buildFlatLookup(node.children, key, map);
  }
  return map;
}

/**
 * Recursively convert SunburstData nodes to ECharts sunburst series data.
 * Inner nodes inherit palette color; grandchildren get saturation variation.
 */
function mapNodesToECharts(
  nodes: TreemapNode[],
  palette: string[],
  depth: number,
  parentColorIdx: number,
): unknown[] {
  return nodes.map((node, i) => {
    // Depth 1: assign palette color by index. Deeper levels inherit the parent's palette slot.
    const colorIdx = depth === 1 ? i % palette.length : parentColorIdx;
    const result: Record<string, unknown> = {
      name: node.name,
      value: node.value,
      itemStyle: { color: palette[colorIdx] },
    };
    if (node.children && node.children.length > 0) {
      result.children = mapNodesToECharts(node.children, palette, depth + 1, colorIdx);
    }
    return result;
  });
}

/**
 * Builds ECharts sunburst option from SunburstData and ChartConfig.
 *
 * Supports 1, 2, or 3 ring levels automatically based on node tree depth:
 *   Ring 1 (innermost) = xDimension values (e.g. Indicators, Areas)
 *   Ring 2 (middle)    = seriesDimension children (e.g. Subgroups per Indicator)
 *   Ring 3 (outermost) = seriesDimension2 grandchildren (e.g. Time periods per Subgroup)
 *
 * Typography:
 *   labelFont     → inner ring (category names)
 *   labelFont     → middle ring (category names)
 *   dataLabelFont → outermost ring (value labels)
 *
 * All 6 font controls (title/subtitle/description via app shell; labels, data labels, legend via engine) apply.
 */
export function buildSunburstOption(data: SunburstData, config: ChartConfig): EChartsOption {
  const format = config.dataLabelNumberFormat ?? '1,000[.00]';
  const useUnit = config.useUnitDefaultFormat ?? false;
  const palette = config.palette.length > 0 ? config.palette : [config.primaryColor];

  const primeTexts = collectSunburstLabelPrimeTexts(data, config);
  const dataFont = resolveDataLabelFont(config);

  const catLabelStyle = buildLabelTypography(config, primeTexts, config.labelFont);
  const valLabelStyle = buildLabelTypography(config, primeTexts, dataFont);

  // A value-bearing ring renders "name\nvalue" in a single label. To let the name follow
  // labelFont and the value follow dataLabelFont (bold/italic/family/size/color/underline),
  // both are emitted as rich segments and both fonts' rich underline styles are merged so
  // each part styles independently. `nm` = name base font, `vl` = value base font.
  const nameUnderline = !!config.labelFont.underline;
  const valUnderline = !!dataFont.underline;
  const nameBaseStyle = buildEchartsTextStyle(config.labelFont, {
    size: config.labelFont.size,
    family: config.labelFont.family,
  });
  const valBaseStyle = buildEchartsTextStyle(dataFont, { size: dataFont.size, family: dataFont.family });
  const valueRich: Record<string, unknown> = {
    nm: { ...nameBaseStyle, align: 'center' },
    vl: { ...valBaseStyle, align: 'center' },
    ...((catLabelStyle.typography.rich as Record<string, unknown> | undefined) ?? {}),
    ...((valLabelStyle.typography.rich as Record<string, unknown> | undefined) ?? {}),
  };
  const valueTypography = { rich: valueRich, align: 'center' as const };
  const nameSeg = (name: string) =>
    nameUnderline ? catLabelStyle.formatText(name) : `{nm|${escapeRichText(name)}}`;
  const valSeg = (val: string) =>
    valUnderline ? valLabelStyle.formatText(val) : `{vl|${escapeRichText(val)}}`;

  const fmtLookup = buildFlatLookup(data.nodes, 'formattedValue');
  const unitLookup = buildFlatLookup(data.nodes, 'unitFormatCode');

  const showAlways = config.showLabels && config.dataLabelVisibility !== 'onHover';
  const showOnHover = config.showLabels && config.dataLabelVisibility === 'onHover';

  const depth = maxDepth(data.nodes);
  const has2 = depth >= 2;
  const has3 = depth >= 3;

  // Radius / center — clear title block (pie/hundredMinus pattern)
  const layout = sunburstLayout(config);
  const scale = layout.outerPct / 88;
  const pct = (base: number) => `${Math.round(base * scale)}%`;

  // Radius layout — evenly distributed rings, scaled to fit under headings
  const innerR = '0%';
  const r1end = has3 ? pct(38) : has2 ? pct(52) : pct(88);
  const r2end = has3 ? pct(64) : pct(88);
  const r3end = pct(88);

  // Formatters
  const nameFormatter = (params: { name?: string }) =>
    catLabelStyle.formatText(params?.name ?? '');

  const nameValueFormatter = (params: { name?: string; value?: number }) => {
    const pre = fmtLookup.get(params?.name ?? '');
    const unitCode = unitLookup.get(params?.name ?? '');
    const val = resolveFormattedValue(Number(params?.value ?? 0), format, useUnit, pre, unitCode);
    return `${nameSeg(params?.name ?? '')}\n${valSeg(val)}`;
  };

  const tooltipFormatter = (params: unknown) => {
    const p = params as { name?: string; value?: number; treePathInfo?: { name: string }[] };
    const path = p?.treePathInfo?.map((n) => n.name).filter(Boolean).join(' › ') ?? p?.name ?? '';
    const pre = fmtLookup.get(p?.name ?? '');
    const unitCode = unitLookup.get(p?.name ?? '');
    const val = resolveFormattedValue(Number(p?.value ?? 0), format, useUnit, pre, unitCode);
    return `<strong>${path}</strong><br/>Value: <strong>${val}</strong>`;
  };

  const seriesData = mapNodesToECharts(data.nodes, palette, 1, 0);

  // Build per-level ECharts config
  const levelBase = { itemStyle: { borderColor: 'rgba(255,255,255,0.8)', borderWidth: 2 } };

  const level1 = {
    ...levelBase,
    r0: innerR,
    r: r1end,
    label: showAlways
      ? { show: true, rotate: 'radial', minAngle: 5, formatter: nameFormatter, ...catLabelStyle.typography }
      : { show: false },
  };

  const level2 = has2 ? {
    r0: r1end,
    r: r2end,
    itemStyle: { borderColor: 'rgba(255,255,255,0.6)', borderWidth: 1 },
    label: showAlways
      ? {
          show: true,
          rotate: 'radial',
          minAngle: 5,
          formatter: has3 ? nameFormatter : nameValueFormatter,
          ...(has3 ? catLabelStyle.typography : valueTypography),
        }
      : { show: false },
  } : null;

  const level3 = has3 ? {
    r0: r2end,
    r: r3end,
    itemStyle: { borderColor: 'rgba(255,255,255,0.5)', borderWidth: 1 },
    label: showAlways
      ? { show: true, rotate: 'radial', minAngle: 4, formatter: nameValueFormatter, ...valueTypography }
      : { show: false },
  } : null;

  const levels = [
    {}, // Level 0: invisible center root
    level1,
    ...(level2 ? [level2] : []),
    ...(level3 ? [level3] : []),
  ];

  const emphasisLabel = showOnHover
    ? { show: true, formatter: nameValueFormatter, ...valueTypography }
    : { show: false };

  return {
    // Sunburst legend not applicable — hierarchical rings cannot bind to ECharts legend items.
    legend: { show: false },
    series: [
      {
        type: 'sunburst',
        data: seriesData,
        center: ['50%', layout.centerY],
        radius: [innerR, r3end],
        nodeClick: false,
        sort: 'desc',
        emphasis: {
          focus: 'ancestor',
          label: emphasisLabel,
        },
        levels,
        label: showAlways
          ? { show: true, rotate: 'radial', minAngle: 5, formatter: nameFormatter, ...catLabelStyle.typography }
          : { show: false },
      },
    ],
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: tooltipFormatter,
    },
  } as EChartsOption;
}
