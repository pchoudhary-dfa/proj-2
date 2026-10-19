/**
 * Admin map configuration: form state ↔ DW_MAPS JSON (DfaMapsConfig).
 */

import { parseDfaMaps, type DfaMapsConfig } from '@/lib/visualizer/mapUtils';

export interface ScopedOverrideRow {
  id: string;
  scopeId: string;
  path: string;
}

export interface LevelFormEntry {
  levelKey: string;
  defaultPath: string;
  scopes: ScopedOverrideRow[];
}

export interface MapConfigFormState {
  dmlUrl: string;
  levels: LevelFormEntry[];
}

export type MapConfigValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

let _rowId = 0;
export function newRowId(): string {
  _rowId += 1;
  return `row-${_rowId}`;
}

function levelSortKey(levelKey: string): number {
  const m = /^L(\d+)$/i.exec(levelKey.trim());
  return m ? parseInt(m[1], 10) : 999;
}

export function sortLevelKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => levelSortKey(a) - levelSortKey(b));
}

export function parseDwMapsJson(raw: string): MapConfigFormState {
  const parsed = parseDfaMaps(raw || '{}');
  const levelKeys = sortLevelKeys(Object.keys(parsed));
  const levels: LevelFormEntry[] = levelKeys.map((levelKey) => {
    const bucket = parsed[levelKey] ?? {};
    const defaultUrls = bucket._default ?? [];
    const scopes: ScopedOverrideRow[] = Object.entries(bucket)
      .filter(([k]) => k !== '_default')
      .map(([scopeId, urls]) => ({
        id: newRowId(),
        scopeId,
        path: (urls[0] ?? '').trim(),
      }));
    return {
      levelKey,
      defaultPath: (defaultUrls[0] ?? '').trim(),
      scopes,
    };
  });
  return { dmlUrl: '', levels };
}

export function formStateFromConfig(
  dmlUrl: string,
  dwMapsRaw: string,
): MapConfigFormState {
  const maps = parseDwMapsJson(dwMapsRaw);
  return { ...maps, dmlUrl: dmlUrl.trim() };
}

export function serializeDfaMaps(levels: LevelFormEntry[]): DfaMapsConfig {
  const result: DfaMapsConfig = {};
  for (const level of levels) {
    const bucket: Record<string, string[]> = {};
    const defaultPath = level.defaultPath.trim();
    if (defaultPath) {
      bucket._default = [defaultPath];
    }
    for (const scope of level.scopes) {
      const scopeId = scope.scopeId.trim();
      const path = scope.path.trim();
      if (scopeId && path) {
        bucket[scopeId] = [path];
      }
    }
    if (Object.keys(bucket).length > 0) {
      result[level.levelKey] = bucket;
    }
  }
  return result;
}

export function serializeDwMapsJson(levels: LevelFormEntry[]): string {
  return JSON.stringify(serializeDfaMaps(levels));
}

export function formStateToDwMapsJson(state: MapConfigFormState): string {
  return serializeDwMapsJson(state.levels);
}

export function syncFormFromJsonString(
  state: MapConfigFormState,
  json: string,
): MapConfigFormState {
  const parsed = parseDwMapsJson(json);
  return { ...state, levels: parsed.levels };
}

export function nextLevelKey(levels: LevelFormEntry[]): string {
  const nums = levels.map((l) => levelSortKey(l.levelKey)).filter((n) => n < 999);
  const next = nums.length === 0 ? 1 : Math.max(...nums) + 1;
  return `L${next}`;
}

export function emptyLevel(levelKey: string): LevelFormEntry {
  return { levelKey, defaultPath: '', scopes: [] };
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateMapConfigForm(
  state: MapConfigFormState,
  options: { mapsEnabled: boolean } = { mapsEnabled: true },
): MapConfigValidationResult {
  const errors: string[] = [];
  const dml = state.dmlUrl.trim();

  if (dml && !isValidHttpUrl(dml)) {
    errors.push('Map service URL must be a valid http or https URL.');
  }

  if (options.mapsEnabled && dml) {
    if (state.levels.length === 0) {
      errors.push('Add at least one area level (L1, L2, etc.) when maps are enabled.');
    }
    for (const level of state.levels) {
      const defaultPath = level.defaultPath.trim();
      if (!defaultPath) {
        errors.push(`${level.levelKey}: default map path is required.`);
      } else if (!defaultPath.startsWith('/getmap/')) {
        errors.push(`${level.levelKey}: default path must start with /getmap/.`);
      }
      const seenScopes = new Set<string>();
      for (const scope of level.scopes) {
        const scopeId = scope.scopeId.trim();
        const path = scope.path.trim();
        if (!scopeId && !path) continue;
        if (!scopeId) {
          errors.push(`${level.levelKey}: enter a parent region ID for each region-specific map.`);
          continue;
        }
        if (scopeId === '_default') {
          errors.push(`${level.levelKey}: area ID cannot be "_default".`);
        }
        if (seenScopes.has(scopeId)) {
          errors.push(`${level.levelKey}: duplicate parent region ID "${scopeId}".`);
        }
        seenScopes.add(scopeId);
        if (!path) {
          errors.push(`${level.levelKey}: map file path required for region "${scopeId}".`);
        } else if (!path.startsWith('/getmap/')) {
          errors.push(`${level.levelKey}: map path for "${scopeId}" must start with /getmap/.`);
        }
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function validateDwMapsJson(json: string): MapConfigValidationResult {
  try {
    let parsed: unknown = JSON.parse(json);
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, errors: ['JSON must be an object.'] };
    }
    const state = parseDwMapsJson(json);
    return validateMapConfigForm(
      { dmlUrl: 'https://example.com', levels: state.levels },
      { mapsEnabled: true },
    );
  } catch {
    return { ok: false, errors: ['Invalid JSON.'] };
  }
}
