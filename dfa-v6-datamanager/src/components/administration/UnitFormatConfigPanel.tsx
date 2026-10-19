"use client";

import { useCallback, useMemo, useState } from "react";
import { TextField } from "@/components/TextField";
import type { AppConfigEntry } from "@/lib/api/core";
import {
  appConfigFieldLabel,
  APP_CONFIGURATION_FIELD_UI,
} from "@/lib/app-configuration-tab-keys";
import {
  parseFormattingEnabledFromCatalog,
  parseUnitDataFormatCatalog,
  resolveCurrencyFormatLabel,
  resolveUnitDataFormatName,
  serializeUnitDataFormatCatalog,
} from "@/lib/unitDataFormatCatalog";

function FieldHelpHint({
  keyCode,
  help,
  apiDescription,
}: {
  keyCode: string;
  help?: string;
  apiDescription?: string;
}) {
  const detail = (help ?? "").trim() || (apiDescription ?? "").trim();
  return (
    <span
      className="sys-config__field-info"
      title={detail || keyCode}
      aria-label={detail ? `${keyCode}. ${detail}` : keyCode}
    >
      <span className="material-icons !text-sm leading-none" aria-hidden>
        info_outline
      </span>
    </span>
  );
}

type FormatRow = {
  code: string;
  label: string;
};

function FormatCheckboxSection({
  title,
  rows,
  enabled,
  onToggle,
  searchPlaceholder,
  searchEnabled,
}: {
  title: string;
  rows: FormatRow[];
  enabled: ReadonlySet<string>;
  onToggle: (code: string, checked: boolean) => void;
  searchPlaceholder: string;
  searchEnabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const displayed = useMemo(() => {
    if (!searchEnabled || !query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        r.code.toLowerCase().includes(q) || r.label.toLowerCase().includes(q)
    );
  }, [query, rows, searchEnabled]);

  return (
    <section className="sys-config__types-panel mt-4 first:mt-0">
      <h3 className="text-sm font-medium text-text">{title}</h3>
      {searchEnabled ? (
        <TextField
          className="mt-2 max-w-md"
          fieldSize="sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
        />
      ) : null}
      <div
        className="sys-config__types-list mt-2"
        role="group"
        aria-label={title}
      >
        {displayed.length === 0 ? (
          <p className="text-sm text-text-muted">{searchPlaceholder}</p>
        ) : (
          displayed.map((row) => (
            <div key={row.code} className="sys-config__type-row">
              <label htmlFor={`cfg-unit-fmt-${row.code}`}>
                <input
                  id={`cfg-unit-fmt-${row.code}`}
                  type="checkbox"
                  className="checkbox-comp"
                  checked={enabled.has(row.code)}
                  onChange={(e) => onToggle(row.code, e.target.checked)}
                />
                <span>
                  <span className="text-xs text-text-muted">{row.code}</span>
                  <span className="text-text-muted"> · </span>
                  {row.label}
                </span>
              </label>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function UnitFormatConfigPanel({
  catalogEntry,
  updateEntry,
  t,
}: {
  catalogEntry: AppConfigEntry;
  updateEntry: (key: string, patch: Partial<AppConfigEntry>) => void;
  t: (code: string, fb?: string) => string;
}) {
  const catalog = useMemo(
    () => parseUnitDataFormatCatalog(catalogEntry.value),
    [catalogEntry.value]
  );

  const enabled = useMemo(
    () => parseFormattingEnabledFromCatalog(catalog),
    [catalog]
  );

  const numberRows = useMemo(
    () =>
      catalog.number_formats.map((entry) => ({
        code: entry.code,
        label: resolveUnitDataFormatName(entry.code, t),
      })),
    [catalog.number_formats, t]
  );

  const currencyRows = useMemo(
    () =>
      catalog.currencies.map((entry) => ({
        code: entry.code,
        label: resolveCurrencyFormatLabel(entry),
      })),
    [catalog.currencies]
  );

  const toggle = useCallback(
    (code: string, checked: boolean) => {
      const next = parseFormattingEnabledFromCatalog(catalog);
      if (checked) {
        next.add(code);
      } else {
        next.delete(code);
      }
      const serialized = serializeUnitDataFormatCatalog(catalog, next);
      updateEntry("UNIT_DATA_FORMAT_CATALOG", { value: serialized });
    },
    [catalog, updateEntry]
  );

  const ui = APP_CONFIGURATION_FIELD_UI.UNIT_DATA_FORMAT_CATALOG;
  const title = appConfigFieldLabel(
    "UNIT_DATA_FORMAT_CATALOG",
    catalogEntry.description ?? "",
    t
  );

  if (numberRows.length === 0 && currencyRows.length === 0) {
    return (
      <p className="text-sm text-text-muted">{t("APP_CONFIG_UNIT_FORMAT_EMPTY_CATALOG")}</p>
    );
  }

  return (
    <div className="sys-config__types-panel">
      <div className="flex flex-wrap items-center gap-1.5">
        <h2 className="text-sm font-medium text-text">{title}</h2>
        <FieldHelpHint
          keyCode="UNIT_DATA_FORMAT_CATALOG"
          help={ui?.helpKey ? t(ui.helpKey) : undefined}
          apiDescription={catalogEntry.description ?? undefined}
        />
      </div>
      <p className="sys-config__types-intro">{t("APP_CONFIG_UNIT_FORMAT_INTRO")}</p>
      {numberRows.length > 0 ? (
        <FormatCheckboxSection
          title={t("APP_CONFIG_UNIT_FORMAT_NUMBER_SECTION")}
          rows={numberRows}
          enabled={enabled}
          onToggle={toggle}
          searchEnabled={false}
          searchPlaceholder={t("APP_CONFIG_UNIT_FORMAT_NO_MATCH")}
        />
      ) : null}
      {currencyRows.length > 0 ? (
        <FormatCheckboxSection
          title={t("APP_CONFIG_UNIT_FORMAT_CURRENCY_SECTION")}
          rows={currencyRows}
          enabled={enabled}
          onToggle={toggle}
          searchEnabled
          searchPlaceholder={t("APP_CONFIG_UNIT_FORMAT_CURRENCY_SEARCH")}
        />
      ) : null}
    </div>
  );
}
