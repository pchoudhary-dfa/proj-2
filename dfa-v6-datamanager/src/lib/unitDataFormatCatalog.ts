/**
 * UNIT_DATA_FORMAT_CATALOG from GET /app-config (seeded from unit_data_format_catalog.json).
 * Default formatting_enabled (number formats + USD/INR/Arabic currencies) lives in that seed on the API only.
 * Number-format labels use UNIT_DATA_FORMAT_{code} translations; currency symbols are enriched by the API on GET.
 */
import type { AppConfigData } from "@/lib/api/core";
import type { SelectFieldOption } from "@/components/SelectField";
import type { SearchableListComboboxOption } from "@/components/SearchableListCombobox";

export const UNIT_DATA_FORMAT_CATALOG_KEY = "UNIT_DATA_FORMAT_CATALOG";

export const unitDataFormatTranslationKey = (code: string): string =>
  `UNIT_DATA_FORMAT_${normalizeCode(code)}`;

type CatalogEntry = {
  code: string;
  /** Present on GET /app-config responses; omitted when persisting catalog JSON. */
  symbol?: string;
};

export type UnitDataFormatCatalog = {
  number_formats: CatalogEntry[];
  currencies: CatalogEntry[];
  formatting_enabled?: string[];
};

export type UnitFormatSelectOption = SelectFieldOption & { value: string };

export type UnitDataFormatTranslate = (code: string, fallback?: string) => string;

/** Static examples for built-in number format codes (mirrors API format rules). */
const NUMBER_FORMAT_EXAMPLES: Record<string, string> = {
  INTEGER: "1234",
  DECIMAL: "1234.56",
  PERCENTAGE: "25%",
  SCIENTIFIC: "1.23E+5",
  COMPACT: "1.2K, 3.4M",
};

function normalizeCode(code: unknown): string {
  return String(code ?? "").trim().toUpperCase();
}

function normalizeCatalogEntry(raw: unknown): CatalogEntry | null {
  if (typeof raw === "string") {
    const code = normalizeCode(raw);
    return code ? { code } : null;
  }
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as { code?: unknown; symbol?: unknown };
    const code = normalizeCode(obj.code);
    if (!code) return null;
    const symbol =
      typeof obj.symbol === "string" && obj.symbol.trim()
        ? obj.symbol.trim()
        : undefined;
    return symbol ? { code, symbol } : { code };
  }
  return null;
}

function normalizeCatalogEntries(raw: unknown): CatalogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: CatalogEntry[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const entry = normalizeCatalogEntry(item);
    if (entry && !seen.has(entry.code)) {
      seen.add(entry.code);
      out.push(entry);
    }
  }
  return out;
}

export function parseUnitDataFormatCatalog(raw: string | undefined | null): UnitDataFormatCatalog {
  if (!raw?.trim()) {
    return { number_formats: [], currencies: [] };
  }
  try {
    const data = JSON.parse(raw) as {
      number_formats?: unknown;
      currencies?: unknown;
      formatting_enabled?: unknown;
    };
    const formatting_enabled = normalizeFormattingEnabled(data.formatting_enabled);
    return {
      number_formats: normalizeCatalogEntries(data.number_formats),
      currencies: normalizeCatalogEntries(data.currencies),
      ...(formatting_enabled !== undefined ? { formatting_enabled } : {}),
    };
  } catch {
    return { number_formats: [], currencies: [] };
  }
}

function normalizeFormattingEnabled(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const code = normalizeCode(item);
    if (code && !seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}

/** All catalog codes when ``formatting_enabled`` is absent (legacy: every format applies). */
export function allCatalogFormatCodes(catalog: UnitDataFormatCatalog): string[] {
  const codes: string[] = [];
  const seen = new Set<string>();
  for (const entry of [...catalog.number_formats, ...catalog.currencies]) {
    if (entry.code && !seen.has(entry.code)) {
      seen.add(entry.code);
      codes.push(entry.code);
    }
  }
  return codes;
}

/**
 * Resolve enabled formatting codes for checkbox UI.
 * When ``formatting_enabled`` is missing, all catalog codes are treated as enabled.
 */
export function parseFormattingEnabledFromCatalog(catalog: UnitDataFormatCatalog): Set<string> {
  if (catalog.formatting_enabled === undefined) {
    return new Set(allCatalogFormatCodes(catalog));
  }
  return new Set(catalog.formatting_enabled);
}

export function serializeUnitDataFormatCatalog(
  catalog: UnitDataFormatCatalog,
  enabled: ReadonlySet<string>
): string {
  const payload: Record<string, unknown> = {
    version: 4,
    number_formats: catalog.number_formats.map((e) => e.code),
    currencies: catalog.currencies.map((e) => e.code),
    formatting_enabled: [...enabled].sort((a, b) => a.localeCompare(b)),
  };
  return JSON.stringify(payload);
}

export function getUnitDataFormatCatalogFromConfig(
  config: AppConfigData
): UnitDataFormatCatalog {
  const entry = config[UNIT_DATA_FORMAT_CATALOG_KEY];
  return parseUnitDataFormatCatalog(entry?.value);
}

export function resolveCurrencyFormatLabel(entry: CatalogEntry): string {
  if (!entry.code) return "";
  return entry.symbol ?? entry.code;
}

export function resolveUnitDataFormatName(
  code: string,
  t: UnitDataFormatTranslate
): string {
  const normalized = normalizeCode(code);
  if (!normalized) return "";
  return t(unitDataFormatTranslationKey(normalized), normalized);
}

function catalogEntryLabel(entry: CatalogEntry, t: UnitDataFormatTranslate): string {
  const code = entry.code;
  const example = NUMBER_FORMAT_EXAMPLES[code];
  if (example) {
    const name = resolveUnitDataFormatName(code, t);
    return `${name} (${example})`;
  }
  const symbol = entry.symbol;
  if (symbol) return `${code} (${symbol})`;
  const name = resolveUnitDataFormatName(code, t);
  return `${name} (${code})`;
}

function catalogEntrySearchText(entry: CatalogEntry, t: UnitDataFormatTranslate): string {
  const code = entry.code;
  const example = NUMBER_FORMAT_EXAMPLES[code];
  const symbol = entry.symbol;
  const name = resolveUnitDataFormatName(code, t);
  return [code, name, symbol, example].filter(Boolean).join(" ");
}

function entryToOption(
  entry: CatalogEntry,
  t: UnitDataFormatTranslate
): UnitFormatSelectOption | null {
  const code = entry.code;
  if (!code) return null;
  return {
    value: code,
    label: catalogEntryLabel(entry, t),
    searchText: catalogEntrySearchText(entry, t),
  };
}

export type BuildUnitFormatSelectOptionsParams = {
  /** First option with empty value (filter: "All"). */
  includeAll?: boolean;
  allLabel?: string;
  /** First option with empty value (edit: no format). */
  includeEmpty?: boolean;
  emptyLabel?: string;
  /** Keep legacy / unknown codes selectable or resolvable (e.g. existing unit rows). */
  legacyValues?: string[];
  /**
   * When true, only codes in ``formatting_enabled`` are listed.
   * When ``formatting_enabled`` is absent, all catalog codes are included.
   * Default: true only when the catalog payload includes ``formatting_enabled``
   * (full admin catalog); scoped GET /app-config responses omit it and are pre-filtered.
   */
  enabledOnly?: boolean;
};

/** Scoped client catalog from GET /app-config (disabled codes already removed). */
export function isUnitFormatCatalogPreScoped(catalog: UnitDataFormatCatalog): boolean {
  return catalog.formatting_enabled === undefined;
}

function normalizeLegacyValues(values: string[] | undefined): string[] {
  if (!values?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const code = String(raw ?? "").trim();
    if (!code) continue;
    const key = normalizeCode(code);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(code);
  }
  return out;
}

function shouldIncludeFormatCode(
  code: string,
  catalog: UnitDataFormatCatalog,
  params: BuildUnitFormatSelectOptionsParams,
  legacyValues: string[]
): boolean {
  const enabledOnly =
    params.enabledOnly ??
    !isUnitFormatCatalogPreScoped(catalog);
  if (!enabledOnly) return true;
  const enabled = parseFormattingEnabledFromCatalog(catalog);
  if (enabled.has(code)) return true;
  return legacyValues.some((legacy) => normalizeCode(legacy) === normalizeCode(code));
}

export function buildUnitFormatSelectOptions(
  catalog: UnitDataFormatCatalog,
  t: UnitDataFormatTranslate,
  params: BuildUnitFormatSelectOptionsParams = {}
): UnitFormatSelectOption[] {
  const legacyValues = normalizeLegacyValues(params.legacyValues);
  const out: UnitFormatSelectOption[] = [];
  if (params.includeAll) {
    out.push({ value: "", label: params.allLabel ?? "All" });
  } else if (params.includeEmpty) {
    out.push({ value: "", label: params.emptyLabel ?? "—" });
  }

  const seen = new Set<string>();
  for (const entry of catalog.number_formats) {
    if (!shouldIncludeFormatCode(entry.code, catalog, params, legacyValues)) continue;
    const opt = entryToOption(entry, t);
    if (opt && !seen.has(normalizeCode(opt.value))) {
      seen.add(normalizeCode(opt.value));
      out.push(opt);
    }
  }
  const currencyOpts: UnitFormatSelectOption[] = [];
  for (const entry of catalog.currencies) {
    if (!shouldIncludeFormatCode(entry.code, catalog, params, legacyValues)) continue;
    const opt = entryToOption(entry, t);
    if (opt && !seen.has(normalizeCode(opt.value))) {
      seen.add(normalizeCode(opt.value));
      currencyOpts.push(opt);
    }
  }
  currencyOpts.sort((a, b) => a.value.localeCompare(b.value));
  out.push(...currencyOpts);

  for (const legacy of legacyValues) {
    const legacyCode = normalizeCode(legacy);
    if (!legacyCode || seen.has(legacyCode)) continue;
    seen.add(legacyCode);
    out.push({
      value: legacy,
      label: catalogEntryLabel({ code: legacyCode }, t),
      searchText: catalogEntrySearchText({ code: legacyCode }, t),
    });
  }

  return out;
}

export function unitFormatOptionLabel(option: UnitFormatSelectOption): string {
  if (typeof option.label === "string" && option.label.trim()) {
    return option.label;
  }
  return String(option.value ?? "");
}

export function unitFormatOptionsToComboboxOptions(
  options: UnitFormatSelectOption[]
): SearchableListComboboxOption[] {
  return options.map((o) => ({
    id: o.value,
    label: unitFormatOptionLabel(o),
  }));
}

export function filterUnitFormatSelectOptions(
  options: UnitFormatSelectOption[],
  query: string,
  pinnedValues: string[] = []
): UnitFormatSelectOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  const filtered = options.filter((o) => {
    const text = (o.searchText ?? unitFormatOptionLabel(o)).toLowerCase();
    return text.includes(q);
  });
  const pinned = normalizeLegacyValues(pinnedValues);
  if (pinned.length === 0) return filtered;
  const included = new Set(filtered.map((o) => normalizeCode(o.value)));
  for (const value of pinned) {
    const key = normalizeCode(value);
    if (included.has(key)) continue;
    const hit = options.find((o) => normalizeCode(o.value) === key);
    if (hit) {
      filtered.unshift(hit);
      included.add(key);
    }
  }
  return filtered;
}

export function resolveUnitFormatLabel(
  code: string | null | undefined,
  options: UnitFormatSelectOption[]
): string {
  const raw = (code ?? "").trim();
  if (!raw) return "";
  const hit = options.find(
    (o) => o.value && o.value.toUpperCase() === raw.toUpperCase()
  );
  if (hit?.label != null && hit.label !== "") {
    return typeof hit.label === "string" ? hit.label : raw;
  }
  return raw;
}
