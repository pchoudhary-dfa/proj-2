"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { SecondaryButton } from "@/components/SecondaryButton";
import type {
  FetchIndicatorValidationRulesResult,
  IndicatorValidationRuleRow,
  UpsertIndicatorValidationRulesResult,
  ValidationRuleEnumOptionFormInput,
  ValidationRuleEnumOptionWire,
  ValidationRuleType,
  ValidationRuleUpsertPayload,
} from "@/lib/api/types";
import { getRequest, patchRequest } from "@/lib/api/http";
import { getDWAPIURL, REFERENCE_PATH_INDICATORS } from "@/lib/constants";
import { useCore } from "@/contexts/CoreContext";
import { Loader } from "@/components/Loader";
import { SelectField } from "@/components/SelectField";
import {
  ValidationEnumOptionsTable,
  withEnumRowKey,
  emptyEnumRowLabels,
  ENUM_TABLE_LOCALES,
  type EnumOptionRowModel,
} from "@/app/[locale]/[dw_id]/indicator/ValidationEnumOptionsTable";

export type IndicatorValidationTabHandle = {
  getUpsertPayload: () => ValidationRuleUpsertPayload | null;
  getBlockingReason: () => string | null;
};

type Props = {
  dwId: string;
  indicatorIdentifier: string;
  languageCode?: string;
  /** Unit from the table row; when set, scope is fixed to this unit. */
  rowUnitGid: string | null;
  /** All unit GIDs linked to this indicator (for multi-select when row has no unit). */
  indicatorUnitGids: string[];
  getUnitLabel?: (unitGid: string) => string;
  /** Disables all editing controls (e.g. user lacks update permission). */
  readOnly?: boolean;
};

function labelPatchValue(s: string): string | null {
  const x = s.trim();
  return x === "" ? null : x;
}

function rowHasAnyEnumLabel(row: ValidationRuleEnumOptionFormInput): boolean {
  return ENUM_TABLE_LOCALES.some((loc) => (row.labels[loc] ?? "").trim() !== "");
}

function parseLabelsFromWire(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function normalizeValidationRuleRow(r: Record<string, unknown>): IndicatorValidationRuleRow {
  const vt = r.validation_type;
  const validation_type: ValidationRuleType =
    vt === "TEXT" || vt === "ENUM" ? vt : "NUM";
  const optsRaw = r.options;
  const options: ValidationRuleEnumOptionWire[] = Array.isArray(optsRaw)
    ? (optsRaw as Record<string, unknown>[]).map((o) => {
        const labels = parseLabelsFromWire(o.labels);
        const legacy =
          typeof o.label === "string"
            ? o.label
            : o.label == null
              ? null
              : String(o.label);
        return {
          option_code: String(o.option_code ?? ""),
          labels,
          label: legacy,
          score:
            typeof o.score === "number"
              ? o.score
              : o.score != null
                ? Number(o.score)
                : null,
          display_order:
            typeof o.display_order === "number"
              ? o.display_order
              : o.display_order != null
                ? Number(o.display_order)
                : null,
          is_active: o.is_active !== false,
        };
      })
    : [];
  return {
    unit_gid: typeof r.unit_gid === "string" ? r.unit_gid : r.unit_gid != null ? String(r.unit_gid) : null,
    validation_type,
    min_value:
      r.min_value != null ? (typeof r.min_value === "number" ? r.min_value : Number(r.min_value)) : null,
    max_value:
      r.max_value != null ? (typeof r.max_value === "number" ? r.max_value : Number(r.max_value)) : null,
    min_length:
      r.min_length != null
        ? typeof r.min_length === "number"
          ? r.min_length
          : Number(r.min_length)
        : null,
    max_length:
      r.max_length != null
        ? typeof r.max_length === "number"
          ? r.max_length
          : Number(r.max_length)
        : null,
    options,
  };
}

async function fetchIndicatorValidationRules(
  dwId: string,
  indicatorIdentifier: string
): Promise<FetchIndicatorValidationRulesResult> {
  const url = getDWAPIURL(
    dwId,
    `${REFERENCE_PATH_INDICATORS}/validation-rules?identifier=${encodeURIComponent(indicatorIdentifier)}`
  );
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as {
    success?: boolean;
    data?: unknown;
    err_message?: string;
    errors?: Record<string, unknown>;
  };
  if (json.success !== true || typeof json.data !== "object" || json.data === null) {
    return {
      success: false,
      err_message: json.err_message ?? "Request failed",
      errors: json.errors,
    };
  }
  const rulesArray = Object.values(json.data as Record<string, unknown[]>)[0] ?? [];
  const data = (rulesArray as Record<string, unknown>[]).map(normalizeValidationRuleRow);
  return { success: true, data };
}

async function upsertIndicatorValidationRules(
  dwId: string,
  indicatorIdentifier: string,
  payload: ValidationRuleUpsertPayload
): Promise<UpsertIndicatorValidationRulesResult> {
  const url = getDWAPIURL(
    dwId,
    `${REFERENCE_PATH_INDICATORS}/${encodeURIComponent(indicatorIdentifier)}/validation-rules`
  );
  const body: Record<string, unknown> = {
    unit_gids: payload.unit_gids,
    validation_type: payload.validation_type,
    options: payload.options.map((o) => {
      const base: Record<string, unknown> = {
        option_code: o.option_code,
        score: o.score ?? null,
        display_order: o.display_order ?? 0,
        is_active: o.is_active !== false,
      };
      if (o.labels != null) {
        base.labels = o.labels;
      } else {
        base.label = o.label ?? "";
      }
      return base;
    }),
  };
  if (payload.validation_type === "NUM") {
    body.min_value = payload.min_value ?? null;
    body.max_value = payload.max_value ?? null;
  }
  if (payload.validation_type === "TEXT") {
    body.min_length = payload.min_length ?? null;
    body.max_length = payload.max_length ?? null;
  }
  const json = (await patchRequest(
    url,
    body,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as {
    success?: boolean;
    message?: string;
    err_message?: string;
    errors?: Record<string, unknown>;
  };
  if (json.success !== true) {
    return {
      success: false,
      err_message: json.err_message ?? json.message ?? "Request failed",
      errors: json.errors,
    };
  }
  return { success: true, message: json.message };
}

function rulesConflictForUnits(
  rules: IndicatorValidationRuleRow[],
  unitGids: string[]
): boolean {
  const subset = rules.filter(
    (r) => r.unit_gid && unitGids.includes(r.unit_gid)
  );
  if (subset.length <= 1) return false;
  const first = subset[0];
  const optionSetSig = (opts: ValidationRuleEnumOptionWire[]) =>
    JSON.stringify(
      [...opts]
        .map((o) => ({
          c: o.option_code,
          l:
            o.labels && Object.keys(o.labels).length > 0
              ? Object.fromEntries(
                  Object.entries(o.labels).sort(([a], [b]) => a.localeCompare(b))
                )
              : o.label != null && String(o.label) !== ""
                ? { _: String(o.label) }
                : {},
        }))
        .sort((a, b) => a.c.localeCompare(b.c))
    );

  return subset.some(
    (r) =>
      r.validation_type !== first.validation_type ||
      r.min_value !== first.min_value ||
      r.max_value !== first.max_value ||
      r.min_length !== first.min_length ||
      r.max_length !== first.max_length ||
      optionSetSig(r.options) !== optionSetSig(first.options)
  );
}

function pickRuleForForm(
  rules: IndicatorValidationRuleRow[],
  unitGids: string[]
): IndicatorValidationRuleRow | null {
  for (const gid of unitGids) {
    const hit = rules.find((r) => r.unit_gid === gid);
    if (hit) return hit;
  }
  return null;
}

function shortLocale(lc: string | undefined): string {
  const s = (lc ?? "").trim();
  const base = (s.includes("-") ? s.split("-")[0] : s) || "en";
  return base.toLowerCase();
}

function wireOptionToFormInput(
  o: ValidationRuleEnumOptionWire,
  mergeLocale: string
): ValidationRuleEnumOptionFormInput {
  const labels = emptyEnumRowLabels();
  const fromApi = o.labels ?? {};
  for (const loc of ENUM_TABLE_LOCALES) {
    const v = fromApi[loc];
    labels[loc] = v != null && String(v) !== "" ? String(v) : "";
  }
  const legacy = o.label != null && String(o.label) !== "";
  if (legacy && !(labels[mergeLocale] ?? "").trim()) {
    labels[mergeLocale] = String(o.label);
  }
  return {
    option_code: o.option_code,
    labels,
    score: o.score ?? 0,
    display_order: o.display_order ?? 0,
    is_active: o.is_active !== false,
  };
}

export const IndicatorValidationTab = forwardRef<
  IndicatorValidationTabHandle,
  Props
>(function IndicatorValidationTab(
  {
    dwId,
    indicatorIdentifier,
    languageCode,
    rowUnitGid,
    indicatorUnitGids,
    getUnitLabel,
    readOnly = false,
  },
  ref
) {
  const { t } = useCore();
  const languageCodeRef = useRef(languageCode);
  languageCodeRef.current = languageCode;

  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">(
    "idle"
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serverRules, setServerRules] = useState<IndicatorValidationRuleRow[]>(
    []
  );

  const lockedUnits = useMemo(
    () => (rowUnitGid?.trim() ? [rowUnitGid.trim()] : null),
    [rowUnitGid]
  );

  const [selectedUnitGids, setSelectedUnitGids] = useState<string[]>(() =>
    lockedUnits ? [...lockedUnits] : [...indicatorUnitGids]
  );

  const lastInitKeyRef = useRef<string>("");

  const initKey = `${dwId}:${indicatorIdentifier}:${lockedUnits?.join(",") ?? "multi"}:${indicatorUnitGids.join("|")}`;

  useEffect(() => {
    if (lastInitKeyRef.current === initKey) return;
    lastInitKeyRef.current = initKey;
    if (lockedUnits) {
      setSelectedUnitGids([...lockedUnits]);
    } else {
      setSelectedUnitGids([...indicatorUnitGids]);
    }
  }, [initKey, lockedUnits, indicatorUnitGids]);

  const [validationType, setValidationType] = useState<ValidationRuleType>("NUM");
  const [minValue, setMinValue] = useState<string>("");
  const [maxValue, setMaxValue] = useState<string>("");
  const [minLength, setMinLength] = useState<string>("");
  const [maxLength, setMaxLength] = useState<string>("");
  const [enumOptions, setEnumOptions] = useState<EnumOptionRowModel[]>([]);
  const [conflictNote, setConflictNote] = useState<string | null>(null);

  const applyRuleToForm = useCallback((rule: IndicatorValidationRuleRow | null) => {
    const mergeLocale = shortLocale(languageCodeRef.current);
    if (!rule) {
      setValidationType("NUM");
      setMinValue("");
      setMaxValue("");
      setMinLength("");
      setMaxLength("");
      setEnumOptions([]);
      return;
    }
    setValidationType(rule.validation_type);
    setMinValue(rule.min_value != null ? String(rule.min_value) : "");
    setMaxValue(rule.max_value != null ? String(rule.max_value) : "");
    setMinLength(rule.min_length != null ? String(rule.min_length) : "");
    setMaxLength(rule.max_length != null ? String(rule.max_length) : "");
    if (rule.validation_type === "ENUM" && rule.options.length > 0) {
      setEnumOptions(
        rule.options.map((o) => withEnumRowKey(wireOptionToFormInput(o, mergeLocale)))
      );
    } else {
      setEnumOptions([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!dwId || !indicatorIdentifier) {
      setServerRules([]);
      setLoadState("idle");
      return;
    }
    setLoadState("loading");
    setLoadError(null);
    setServerRules([]);
    (async () => {
      const res = await fetchIndicatorValidationRules(dwId, indicatorIdentifier);
      if (cancelled) return;
      if (res.success) {
        setServerRules(res.data);
        setLoadState("idle");
      } else {
        setServerRules([]);
        setLoadError(res.err_message ?? "Failed to load validation rules");
        setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dwId, indicatorIdentifier]);

  useEffect(() => {
    if (loadState === "loading" || loadState === "error") return;
    const units = selectedUnitGids.filter(Boolean);
    if (units.length === 0) {
      applyRuleToForm(null);
      setConflictNote(null);
      return;
    }
    const conflict = rulesConflictForUnits(serverRules, units);
    setConflictNote(
      conflict ? t("INDICATORS_VALIDATION_CONFLICT_NOTE") : null
    );
    const rule = pickRuleForForm(serverRules, units);
    applyRuleToForm(rule);
  }, [serverRules, selectedUnitGids, loadState, applyRuleToForm]);

  const toggleUnit = useCallback(
    (gid: string) => {
      if (lockedUnits) return;
      setSelectedUnitGids((prev) => {
        const set = new Set(prev);
        if (set.has(gid)) set.delete(gid);
        else set.add(gid);
        return [...set];
      });
    },
    [lockedUnits]
  );

  const selectAllUnits = useCallback(() => {
    if (lockedUnits) return;
    setSelectedUnitGids([...indicatorUnitGids]);
  }, [lockedUnits, indicatorUnitGids]);

  const clearUnitSelection = useCallback(() => {
    if (lockedUnits) return;
    setSelectedUnitGids([]);
  }, [lockedUnits]);

  const parseNum = (s: string): number | null => {
    const sTrim = s.trim();
    if (sTrim === "") return null;
    const n = Number(sTrim);
    return Number.isFinite(n) ? n : null;
  };

  const parseIntOrNull = (s: string): number | null => {
    const sTrim = s.trim();
    if (sTrim === "") return null;
    const n = parseInt(sTrim, 10);
    return Number.isFinite(n) ? n : null;
  };

  useImperativeHandle(ref, () => ({
    getBlockingReason: () => {
      if (loadState === "loading") return t("VALIDATION_BLOCK_LOADING");
      if (loadState === "error")
        return loadError ?? t("VALIDATION_BLOCK_LOAD_ERROR");
      const units = selectedUnitGids.filter((u) => u.trim());
      if (units.length === 0) return t("VALIDATION_BLOCK_SELECT_UNIT");
      if (validationType === "ENUM") {
        const validOpts = enumOptions.filter(
          (o) => o.option_code.trim() && rowHasAnyEnumLabel(o)
        );
        if (validOpts.length === 0)
          return t("VALIDATION_BLOCK_ENUM_OPTIONS");
      }
      return null;
    },
    getUpsertPayload: (): ValidationRuleUpsertPayload | null => {
      if (loadState === "loading" || loadState === "error") return null;
      const units = selectedUnitGids.filter((u) => u.trim());
      if (units.length === 0) return null;
      if (validationType === "ENUM") {
        const options = enumOptions
          .filter((o) => o.option_code.trim() && rowHasAnyEnumLabel(o))
          .map(({ _rowKey: _rk, ...o }, i) => ({
            option_code: o.option_code.trim(),
            labels: {
              en: labelPatchValue(o.labels.en ?? ""),
              fr: labelPatchValue(o.labels.fr ?? ""),
              ar: labelPatchValue(o.labels.ar ?? ""),
            },
            score: o.score,
            display_order: o.display_order ?? i,
            is_active: o.is_active !== false,
          }));
        if (options.length === 0) return null;
        return {
          unit_gids: units,
          validation_type: "ENUM",
          options,
        };
      }
      if (validationType === "NUM") {
        return {
          unit_gids: units,
          validation_type: "NUM",
          min_value: parseNum(minValue),
          max_value: parseNum(maxValue),
          options: [],
        };
      }
      return {
        unit_gids: units,
        validation_type: "TEXT",
        min_length: parseIntOrNull(minLength),
        max_length: parseIntOrNull(maxLength),
        options: [],
      };
    },
  }), [
    loadState,
    loadError,
    selectedUnitGids,
    validationType,
    enumOptions,
    minValue,
    maxValue,
    minLength,
    maxLength,
    t,
  ]);

  const unitListEmpty = indicatorUnitGids.length === 0;
  const usePanelFillLayout =
    !unitListEmpty && loadState !== "loading" && loadState !== "error";

  const rootClass =
    loadState === "loading" && unitListEmpty
      ? "relative mb-7 min-h-[min(45vh,280px)]"
      : unitListEmpty
        ? "mb-7"
        : "relative flex min-h-0 flex-1 flex-col overflow-hidden";

  return (
    <fieldset disabled={readOnly} className={`${rootClass} m-0 min-w-0 border-0 p-0`}>
      {loadState === "error" && loadError && (
        <p className="cell-empty" style={{ marginTop: 8, color: "var(--color-error, #c62828)" }}>
          {loadError}
        </p>
      )}

      {unitListEmpty ? (
        <p className="cell-empty" style={{ marginTop: 12 }}>
          {t("NO_UNITS_LINKED")}
        </p>
      ) : (
        <div
          className={
            usePanelFillLayout
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : "contents"
          }
        >
          {!lockedUnits && (
            <div className="sp-field sp-full" style={{ marginBottom: 16 }}>
              <label className="form-label">{t("APPLY_TO_UNITS")}</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <SecondaryButton type="button" onClick={selectAllUnits}>
                  Select all
                </SecondaryButton>
                <SecondaryButton type="button" onClick={clearUnitSelection}>
                  Clear
                </SecondaryButton>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  maxHeight: 140,
                  overflow: "auto",
                  border: "1px solid var(--color-border-subtle, #ddd)",
                  borderRadius: 6,
                  padding: 8,
                }}
              >
                {indicatorUnitGids.map((gid) => (
                  <label
                    key={gid}
                    className="flex cursor-pointer items-center gap-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      className="checkbox-comp shrink-0"
                      checked={selectedUnitGids.includes(gid)}
                      onChange={() => toggleUnit(gid)}
                    />
                    <span>
                      {getUnitLabel ? getUnitLabel(gid) : gid}{" "}
                      <span style={{ opacity: 0.7 }}>({gid})</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {conflictNote && (
            <p className="mb-3 text-xs text-[var(--color-warning-fg,#856404)]">
              {conflictNote}
            </p>
          )}

          <div
            className={
              usePanelFillLayout
                ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                : "contents"
            }
          >
            <div className={`sp-grid ${usePanelFillLayout ? "shrink-0" : ""}`}>
              <div className="sp-field sp-full">
                <label className="form-label">{t("VALIDATION_DATA_TYPE_LABEL")}</label>
                <SelectField
                  value={validationType}
                  onChange={(e) =>
                    setValidationType(e.target.value as ValidationRuleType)
                  }
                  options={[
                    { value: "NUM", label: t("VALIDATION_TYPE_NUM") },
                    { value: "TEXT", label: t("VALIDATION_TYPE_TEXT") },
                    { value: "ENUM", label: t("VALIDATION_TYPE_ENUM") },
                  ]}
                />
              </div>

              {validationType === "NUM" && (
                <>
                  <div className="sp-field">
                    <label className="form-label">{t("MIN_VALUE")}</label>
                    <input
                      className="field-comp--md"
                      type="text"
                      inputMode="decimal"
                      placeholder="No lower bound"
                      value={minValue}
                      onChange={(e) => setMinValue(e.target.value)}
                    />
                  </div>
                  <div className="sp-field">
                    <label className="form-label">{t("MAX_VALUE")}</label>
                    <input
                      className="field-comp--md"
                      type="text"
                      inputMode="decimal"
                      placeholder={t("PLACEHOLDER_NO_MAX")}
                      value={maxValue}
                      onChange={(e) => setMaxValue(e.target.value)}
                    />
                  </div>
                </>
              )}

              {validationType === "TEXT" && (
                <>
                  <div className="sp-field">
                    <label className="form-label">{t("MIN_LENGTH")}</label>
                    <input
                      className="field-comp--md"
                      type="number"
                      min={0}
                      placeholder={t("NO_MINIMUM")}
                      value={minLength}
                      onChange={(e) => setMinLength(e.target.value)}
                    />
                  </div>
                  <div className="sp-field">
                    <label className="form-label">{t("MAX_LENGTH")}</label>
                    <input
                      className="field-comp--md"
                      type="number"
                      min={0}
                      placeholder={t("NO_MAXIMUM")}
                      value={maxLength}
                      onChange={(e) => setMaxLength(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>

            {validationType === "ENUM" && (
              <div
                className={
                  usePanelFillLayout
                    ? "mt-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                    : "mt-1 min-w-0"
                }
              >
                <label className="form-label mb-2 shrink-0">
                  {t("VALIDATION_ENUM_VALUES")}
                </label>
                <ValidationEnumOptionsTable
                  rows={enumOptions}
                  onRowsChange={setEnumOptions}
                  t={t}
                  tableAriaLabel={t("VALIDATION_ENUM_VALUES")}
                />
              </div>
            )}
          </div>

          <p className="cell-empty mt-3.5 shrink-0 text-xs">
            {t("VALIDATION_FOOTNOTE")}
          </p>
        </div>
      )}
      {loadState === "loading" ? (
        <div
          className="sp-panel-tab-loading-overlay"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader loadingLabel={t("LOADING")} size={48} />
        </div>
      ) : null}
    </fieldset>
  );
});

IndicatorValidationTab.displayName = "IndicatorValidationTab";
