/**
 * Map (choropleth) utilities: area enrichment, render-level resolution,
 * map URL selection, and value classification.
 */

import type { SelectedItem } from './types';
import type { AreaLookupEntry } from '@/lib/api/referenceClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnrichedArea {
  id: string;
  label: string;
  nid?: number;
  level: number;
  parentId: string | null;
}

export type MapResolveResult =
  | { ok: true; url: string; renderLevel: number }
  | { ok: false; error: string };

export type ClassificationMethod = 'equal_interval' | 'quantile' | 'custom';

export interface ClassificationResult {
  breaks: number[];
  colors: string[];
  labels: string[];
}

/** Default sequential color ramp (ColorBrewer YlGnBu). */
const DEFAULT_RAMP = [
  '#ffffcc', '#c7e9b4', '#7fcdbb', '#41b6c4',
  '#1d91c0', '#225ea8', '#253494', '#081d58', '#000033',
];

// ---------------------------------------------------------------------------
// 1. Area enrichment
// ---------------------------------------------------------------------------

export function enrichAreasWithLevel(
  selectedAreas: SelectedItem[],
  areaLookup: Map<string, AreaLookupEntry>,
): EnrichedArea[] {
  return selectedAreas.map((item) => {
    const entry = areaLookup.get(item.id);
    return {
      id: item.id,
      label: item.label,
      nid: item.nid,
      level: entry?.level ?? 0,
      parentId: entry?.parentId ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// 2. Render-level resolution (majority-level rule)
// ---------------------------------------------------------------------------

export function resolveMapRenderLevel(areas: EnrichedArea[]): number {
  if (areas.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const a of areas) {
    counts.set(a.level, (counts.get(a.level) ?? 0) + 1);
  }
  let maxLevel = 0;
  let maxCount = 0;
  for (const [level, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxLevel = level;
    }
  }
  return maxLevel;
}

// ---------------------------------------------------------------------------
// 3. Map URL selection from DFA_MAPS config
// ---------------------------------------------------------------------------

/** Nested DFA_MAPS: level → scope → url list. Scope `_default` is the country-level fallback. */
export type DfaMapsConfig = Record<string, Record<string, string[]>>;

/**
 * Parses the DFA_MAPS config string into a level → scope → urls map.
 *
 * Accepts two formats (backward-compatible):
 *   - **Flat (legacy):**  `{ "L1": ["url1"], "L3": ["url2"] }`
 *     Each array is normalized to `{ "_default": [...] }`.
 *   - **Nested (new):**   `{ "L1": { "_default": ["url1"] }, "L3": { "_default": ["url2"], "AMR010": ["url3"] } }`
 */
export function parseDfaMaps(dfaMapsJson: string): DfaMapsConfig {
  try {
    let parsed = JSON.parse(dfaMapsJson);
    // Handle double-encoded JSON (value stored as a JSON string inside a JSON string).
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
    if (typeof parsed !== 'object' || parsed === null) return {};

    const result: DfaMapsConfig = {};
    for (const [levelKey, value] of Object.entries(parsed)) {
      if (Array.isArray(value)) {
        result[levelKey] = { _default: value as string[] };
      } else if (typeof value === 'string') {
        // Single URL string instead of array -- normalize to array.
        result[levelKey] = { _default: [value] };
      } else if (typeof value === 'object' && value !== null) {
        result[levelKey] = value as Record<string, string[]>;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Pick the first URL from an array, or match by parentId when multiple URLs exist.
 * Shared helper for both scoped and default URL buckets.
 */
function pickUrlFromBucket(
  urls: string[],
  parentId: string | null,
  levelKey: string,
  renderLevel: number,
): MapResolveResult {
  if (urls.length === 1) {
    return { ok: true, url: urls[0], renderLevel };
  }
  if (!parentId) {
    return { ok: true, url: urls[0], renderLevel };
  }
  const matched = urls.find((u) => u.toLowerCase().includes(parentId.toLowerCase()));
  if (matched) {
    return { ok: true, url: matched, renderLevel };
  }
  return { ok: false, error: `No map found for parent area "${parentId}" at level ${levelKey}.` };
}

/**
 * Selects the correct map URL for the given render level and selected areas.
 *
 * Resolution order:
 *  1. Determine common parent of selected areas at the render level.
 *  2. If a **scoped** entry exists for that parent (`dfaMaps[L][parentId]`), prefer it.
 *  3. Otherwise fall back to `dfaMaps[L]["_default"]`.
 *  4. Within each bucket, pick single URL or match by parentId in the path.
 */
export function resolveMapUrl(
  dmlUrl: string,
  dfaMaps: DfaMapsConfig,
  renderLevel: number,
  areas: EnrichedArea[],
): MapResolveResult {
  if (!dmlUrl) {
    return { ok: false, error: 'Map service is not configured. DFA_DML_URL is missing.' };
  }

  const levelKey = `L${renderLevel}`;
  const levelBucket = dfaMaps[levelKey];

  if (!levelBucket) {
    const available = Object.keys(dfaMaps).join(', ') || 'none';
    return { ok: false, error: `No map available for level ${levelKey}. Available levels: ${available}.` };
  }

  const areasAtLevel = areas.filter((a) => a.level === renderLevel);
  if (areasAtLevel.length === 0) {
    return { ok: false, error: 'No areas match the resolved render level.' };
  }

  // Determine common parent of selected areas at the render level.
  const parentIds = new Set(areasAtLevel.map((a) => a.parentId).filter(Boolean));
  if (parentIds.size > 1) {
    return {
      ok: false,
      error:
        'Map visualization is not supported when areas from different parent regions are selected. ' +
        'Please select areas within a single state or region.',
    };
  }
  const commonParent = parentIds.size === 1 ? [...parentIds][0]! : null;

  // Prefer scoped map for the common parent (e.g. "AMR010" → Westeros districts).
  if (commonParent && levelBucket[commonParent]) {
    const scopedUrls = levelBucket[commonParent];
    if (scopedUrls.length > 0) {
      return pickUrlFromBucket(scopedUrls, commonParent, levelKey, renderLevel);
    }
  }

  // Fall back to _default (country-level map at this level).
  const defaultUrls = levelBucket._default;
  if (!defaultUrls || defaultUrls.length === 0) {
    return { ok: false, error: `No map available for level ${levelKey}.` };
  }

  return pickUrlFromBucket(defaultUrls, commonParent, levelKey, renderLevel);
}

// ---------------------------------------------------------------------------
// 4. Value classification
// ---------------------------------------------------------------------------

/**
 * Generates `k` colors by sampling from the default ramp.
 * For k <= ramp length, samples evenly; otherwise interpolates positions.
 */
export function generateColors(k: number): string[] {
  if (k <= 0) return [];
  if (k === 1) return [DEFAULT_RAMP[3]];
  const colors: string[] = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.round((i / (k - 1)) * (DEFAULT_RAMP.length - 1));
    colors.push(DEFAULT_RAMP[idx]);
  }
  return colors;
}

export function classifyEqualInterval(values: number[], k: number): number[] {
  if (values.length === 0 || k <= 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [min, max];
  const width = (max - min) / k;
  const breaks: number[] = [min];
  for (let i = 1; i < k; i++) {
    breaks.push(parseFloat((min + i * width).toPrecision(6)));
  }
  breaks.push(max);
  return breaks;
}

export function classifyQuantile(values: number[], k: number): number[] {
  if (values.length === 0 || k <= 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted[0] === sorted[sorted.length - 1]) return [sorted[0], sorted[0]];
  const breaks: number[] = [sorted[0]];
  for (let i = 1; i < k; i++) {
    const idx = Math.round((i / k) * (sorted.length - 1));
    const val = parseFloat(sorted[idx].toPrecision(6));
    if (val !== breaks[breaks.length - 1]) {
      breaks.push(val);
    }
  }
  breaks.push(sorted[sorted.length - 1]);
  return breaks;
}

/**
 * Classify numeric values into `k` bins.
 *
 * @returns breaks (k+1 boundaries), colors (k), labels (k)
 */
export function classifyValues(
  values: number[],
  method: ClassificationMethod,
  k: number,
  customBreaks?: number[],
  customColors?: string[],
): ClassificationResult {
  let breaks: number[];

  if (method === 'custom' && customBreaks && customBreaks.length >= 2) {
    breaks = [...customBreaks].sort((a, b) => a - b);
  } else if (method === 'quantile') {
    breaks = classifyQuantile(values, k);
  } else {
    breaks = classifyEqualInterval(values, k);
  }

  const numBins = breaks.length - 1;
  const colors = customColors && customColors.length >= numBins
    ? customColors.slice(0, numBins)
    : generateColors(numBins);
  const labels = Array.from({ length: numBins }, (_, i) =>
    `${breaks[i]}–${breaks[i + 1]}`,
  );

  return { breaks, colors, labels };
}

// ---------------------------------------------------------------------------
// 5. GeoJSON fetching
// ---------------------------------------------------------------------------

export async function fetchGeoJSON(
  dmlUrl: string,
  mapPath: string,
): Promise<{ ok: true; geoJSON: unknown } | { ok: false; error: string }> {
  const url = `${dmlUrl.replace(/\/+$/, '')}${mapPath.startsWith('/') ? '' : '/'}${mapPath}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { ok: false, error: `Failed to fetch map (HTTP ${res.status}).` };
    }
    const json = await res.json();
    // DML wraps in { geoJSON: ... }
    const geo = json.geoJSON ?? json;
    return { ok: true, geoJSON: geo };
  } catch (e) {
    return { ok: false, error: `Map fetch error: ${e instanceof Error ? e.message : String(e)}` };
  }
}
