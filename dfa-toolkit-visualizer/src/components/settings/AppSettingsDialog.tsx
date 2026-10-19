"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { createPortal } from "react-dom";
import { X, Info, Settings as SettingsIcon } from "lucide-react";
import { useCore } from "@/contexts/CoreContext";
import { Loader } from "@/components/Loader";
import { getTooltipHandlers, useTooltipCleanup } from "@/components/CustomTooltip";
import { patchAppConfig } from "@/lib/api/core";
import { isApiError } from "@/lib/api/types";
import {
  APP_CONFIG_API_ENDPOINT,
  API_FINAL_BASE_URL,
  DW_PATH_PREFIX,
  APP_SETTINGS_AI_PROVIDER_OPTIONS,
  APP_SETTINGS_ENABLE_INSIGHTS_OPTIONS,
  APP_SETTINGS_YES_NO_OPTIONS,
} from "@/lib/constants";
import { apiGet } from "@/lib/api/client";
import { AreaSelectionModal } from "@/components/AreaSelectionModal";
import type { AreaItem } from "dfa-v6-comp-area";
import type { Locale } from "@/lib/i18n/config";
import { getReferenceApiClientBaseUrl } from "@/lib/appConfig/utils";
import { fetchAreasTreeFromBackend } from "@/lib/api/referenceClient";

const B64_PREFIX = "b64:";
const REDACTED_PLACEHOLDER = "****";

interface ConfigEntry {
  value: string;
  description?: string;
  is_system?: boolean;
}

type RawConfigData = Record<string, ConfigEntry>;

type FieldType = "color" | "text" | "textarea" | "number" | "file" | "select" | "api_key" | "area";

interface FieldDef {
  key: string;
  /** Translation code; defaults to `key` (same as system_configuration key_code). */
  labelKey?: string;
  fallbackLabel: string;
  type: FieldType;
  accept?: string;
  help?: string;
  options?: { value: string; label: string }[];
  /** When true, options are built from active system languages at render time. */
  languageOptions?: boolean;
  /** When true, options are built from active datawarehouses at render time. */
  warehouseOptions?: boolean;
  /** When false and `ENABLE_INSIGHTS` is "no", control is disabled. */
  requiresInsights?: boolean;
  /** When false and `DWS_ENABLED` is "no", control is disabled. */
  requiresDws?: boolean;
}

const FIELDS: FieldDef[] = [
  {
    key: "APP_NAME",
    fallbackLabel: "App Name",
    type: "text",
    help: "Primary display name for this application.",
  },
  {
    key: "APP_TITLE",
    fallbackLabel: "App Title",
    type: "text",
    help: "Browser tab title and header label.",
  },
  {
    key: "APP_FOOTER_NOTE",
    fallbackLabel: "Footer Note",
    type: "textarea",
    help: "Copyright or footer text shown in About.",
  },
  {
    key: "LANGUAGE_ENABLED",
    fallbackLabel: "Language Enabled",
    type: "select",
    options: APP_SETTINGS_YES_NO_OPTIONS,
    help: "When yes, show the header language selector.",
  },
  {
    key: "LANGUAGE_DEFAULT",
    fallbackLabel: "Default Language",
    type: "select",
    languageOptions: true,
    help: "Default locale for first visit and redirects.",
  },
  {
    key: "DWS_ENABLED",
    fallbackLabel: "Warehouse Switcher",
    type: "select",
    options: APP_SETTINGS_YES_NO_OPTIONS,
    help: "When yes, enable multi-warehouse selection (default warehouse becomes editable below).",
  },
  {
    key: "DWS_DEFAULT",
    fallbackLabel: "Default Warehouse",
    type: "select",
    warehouseOptions: true,
    help: "Default warehouse used for API calls when no other warehouse is selected.",
    requiresDws: true,
  },
  {
    key: "DWS_DEFAULT_AREA",
    fallbackLabel: "Default Area",
    type: "area",
    help: "Default area when the user has not selected one. Pick a single area from the warehouse tree.",
  },
  {
    key: "FLAVOR_COLOR",
    labelKey: "COLOR",
    fallbackLabel: "Color",
    type: "color",
    help: "The swatch sets a #hex value. You can still type any valid CSS color (rgb(), named colors, etc.).",
  },
  {
    key: "FLAVOR_COLOR_HOVER",
    labelKey: "HOVER_COLOR",
    fallbackLabel: "Hover Color",
    type: "color",
    help: "The swatch sets a #hex value. You can still type any valid CSS color (rgb(), named colors, etc.).",
  },
  {
    key: "FLAVOR_FAVICON",
    labelKey: "FAVICON",
    fallbackLabel: "Favicon",
    type: "file",
    accept: ".ico,.png",
    help: "Recommended: .ico or .png, about 64 KB or less. Large files may fail to save.",
  },
  {
    key: "FLAVOR_LOGO",
    labelKey: "LOGO",
    fallbackLabel: "Logo",
    type: "file",
    accept: ".png,.jpg,.jpeg",
    help: "Recommended: .png or .jpg, about 50 KB or less. Large files may fail to save.",
  },
  {
    key: "ENABLE_INSIGHTS",
    fallbackLabel: "Enable insights",
    type: "select",
    options: APP_SETTINGS_ENABLE_INSIGHTS_OPTIONS,
    help: "Enable AI/insights features.",
  },
  {
    key: "AI_PROVIDER",
    fallbackLabel: "AI provider",
    type: "select",
    options: APP_SETTINGS_AI_PROVIDER_OPTIONS,
    help: "AI provider identifier.",
    requiresInsights: true,
  },
  {
    key: "AI_API_KEY",
    fallbackLabel: "AI API key",
    type: "api_key",
    help: "Stored securely. Only updated when you type a new value.",
    requiresInsights: true,
  },
];

const YES_NO_VALUES = new Set(APP_SETTINGS_YES_NO_OPTIONS.map((o) => o.value));

function normalizeLoadedValues(data: RawConfigData): Record<string, string> {
  const vals: Record<string, string> = {};
  for (const f of FIELDS) {
    const entry = data[f.key];
    vals[f.key] = entry?.value ?? "";
  }

  if (!vals.LANGUAGE_ENABLED || !YES_NO_VALUES.has(vals.LANGUAGE_ENABLED)) {
    vals.LANGUAGE_ENABLED = "no";
  }
  if (!vals.DWS_ENABLED || !YES_NO_VALUES.has(vals.DWS_ENABLED)) {
    vals.DWS_ENABLED = "no";
  }
  const allowedInsights = new Set(
    APP_SETTINGS_ENABLE_INSIGHTS_OPTIONS.map((o) => o.value),
  );
  if (!vals.ENABLE_INSIGHTS || !allowedInsights.has(vals.ENABLE_INSIGHTS)) {
    vals.ENABLE_INSIGHTS = "no";
  }

  const allowedProviders = new Set(APP_SETTINGS_AI_PROVIDER_OPTIONS.map((o) => o.value));
  if (!vals.AI_PROVIDER || !allowedProviders.has(vals.AI_PROVIDER)) {
    vals.AI_PROVIDER = APP_SETTINGS_AI_PROVIDER_OPTIONS[0]?.value ?? "";
  }

  if (!vals.LANGUAGE_DEFAULT?.trim()) {
    vals.LANGUAGE_DEFAULT = "en";
  }

  vals.AI_API_KEY = "";
  return vals;
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span
      className="sys-config__field-info"
      tabIndex={0}
      aria-label={text}
      {...getTooltipHandlers(text)}
    >
      <Info className="w-4 h-4" />
    </span>
  );
}

export interface AppSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  locale: Locale;
}

export function AppSettingsDialog({ open, onClose, locale }: AppSettingsDialogProps) {
  const { t, refreshConfig, systemLanguages, dataWarehouseId } = useCore();

  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [warehouseRows, setWarehouseRows] = useState<
    Array<{ id: number; dw_connection_name?: string }> | null
  >(null);

  const languageSelectOptions = useMemo(() => {
    const opts = systemLanguages.map((lang) => ({
      value: lang.locale,
      label: lang.name || lang.locale,
    }));
    const current = formValues.LANGUAGE_DEFAULT?.trim();
    if (current && !opts.some((o) => o.value === current)) {
      opts.unshift({ value: current, label: current });
    }
    if (opts.length === 0) {
      opts.push({ value: current || "en", label: current || "en" });
    }
    return opts;
  }, [systemLanguages, formValues.LANGUAGE_DEFAULT]);

  const warehouseSelectOptions = useMemo(() => {
    const rawVal = (formValues.DWS_DEFAULT ?? "").trim();
    const mapped = (warehouseRows ?? []).map((dw) => {
      const id = String(dw.id);
      const name = (dw.dw_connection_name ?? "").trim() || id;
      return { value: id, label: `${name} (${id})` };
    });
    if (rawVal && !mapped.some((o) => o.value === rawVal)) {
      return [{ value: rawVal, label: rawVal }, ...mapped];
    }
    return mapped;
  }, [warehouseRows, formValues.DWS_DEFAULT]);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ data: RawConfigData }>(`${APP_CONFIG_API_ENDPOINT}`);
      if (!res.ok) {
        setError(res.error || "Failed to load configuration");
        return;
      }
      const data: RawConfigData =
        (res.data as unknown as { data?: RawConfigData })?.data ??
        (res.data as unknown as RawConfigData);
      const vals = normalizeLoadedValues(data);
      setFormValues(vals);
      setInitialValues(vals);
    } catch {
      setError("Failed to load configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadConfig();
      setSuccessMsg(null);
    }
  }, [open, loadConfig]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setWarehouseRows(null);
    void apiGet<unknown>(
      `${API_FINAL_BASE_URL}${DW_PATH_PREFIX}?limit=1000&active_only=true`,
    )
      .then((res) => {
        if (cancelled) return;
        const rows =
          res.ok && Array.isArray((res.data as { data?: unknown })?.data)
            ? (res.data as { data: Array<{ id: number; dw_connection_name?: string }> }).data
            : [];
        setWarehouseRows(rows);
      })
      .catch(() => {
        if (!cancelled) setWarehouseRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  const dirtyKeys = useMemo(() => {
    const keys: string[] = [];
    for (const f of FIELDS) {
      if (formValues[f.key] !== initialValues[f.key]) {
        keys.push(f.key);
      }
    }
    return keys;
  }, [formValues, initialValues]);

  const insightsEnabled = (formValues.ENABLE_INSIGHTS ?? "no") === "yes";
  const dwsEnabled = (formValues.DWS_ENABLED ?? "no") === "yes";

  const handleChange = useCallback(
    (key: string, value: string) => {
      setFormValues((prev) => ({ ...prev, [key]: value }));
      setSuccessMsg(null);
    },
    []
  );

  const handleFileUpload = useCallback(
    (key: string, e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          handleChange(key, reader.result);
        }
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [handleChange]
  );

  const handleSave = useCallback(async () => {
    if (dirtyKeys.length === 0) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    const payload: Record<string, { value: string; description?: string }> = {};
    for (const key of dirtyKeys) {
      let value = formValues[key];
      if (key === "AI_API_KEY" && value) {
        value = `${B64_PREFIX}${btoa(value)}`;
      }
      payload[key] = { value };
    }

    try {
      const res = await patchAppConfig(payload);
      if (isApiError(res)) {
        setError(res.message || "Failed to save settings");
      } else {
        setSuccessMsg(t("SETTINGS_SAVED", "Settings saved successfully."));
        await refreshConfig();
        const newInitial = { ...initialValues };
        for (const key of dirtyKeys) {
          newInitial[key] = key === "AI_API_KEY" ? "" : formValues[key];
        }
        setInitialValues(newInitial);
        if (formValues.AI_API_KEY) {
          setFormValues((prev) => ({ ...prev, AI_API_KEY: "" }));
        }
      }
    } catch {
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }, [dirtyKeys, formValues, initialValues, refreshConfig, t]);

  if (!open) return null;

  const dialogUi = (
    <>
      <div
        className="fixed inset-0 top-[var(--height-header)] z-[200] bg-black/40"
        onClick={onClose}
        aria-hidden
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("SETTINGS", "Settings")}
        className="fixed top-[var(--height-header)] bottom-0 right-0 rtl:right-auto rtl:left-0 z-[210] flex w-[min(90vw,26rem)] min-h-0 flex-col border-l rtl:border-l-0 rtl:border-r border-border bg-surface shadow-xl"
      >
        <div className="px-4 py-3 bg-surface-muted border-b border-border">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
              <SettingsIcon className="w-4 h-4 text-primary" />
              {t("SETTINGS", "Settings")}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-text-muted hover:text-text hover:bg-surface rounded transition-colors"
              aria-label={t("CLOSE", "Close")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {loading ? (
            <div className="flex flex-1 items-center justify-center h-full min-h-[200px]">
              <Loader loadingLabel={t("COMMON_LOADING", "Loading...")} size={40} />
            </div>
          ) : (
            FIELDS.map((field) => (
              <SettingsField
                key={field.key}
                field={field}
                value={formValues[field.key] ?? ""}
                onChange={handleChange}
                onFileUpload={handleFileUpload}
                insightsEnabled={insightsEnabled}
                dwsEnabled={dwsEnabled}
                languageSelectOptions={languageSelectOptions}
                warehouseSelectOptions={warehouseSelectOptions}
                warehouseLoading={warehouseRows === null}
                locale={locale}
                dataWarehouseId={dataWarehouseId}
                t={t}
              />
            ))
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          {successMsg && (
            <p className="text-sm text-green-600">{successMsg}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text hover:bg-surface-muted rounded-md transition-colors"
          >
            {t("CANCEL", "Cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={dirtyKeys.length === 0 || saving}
            className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-hover rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving
              ? t("SAVING", "Saving...")
              : t("SAVE", "Save")}
          </button>
        </div>
      </div>
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(dialogUi, document.body);
}

function hasAssetValue(value: string): boolean {
  return Boolean(value?.trim());
}

function DefaultAreaSettingsField({
  value,
  onChange,
  locale,
  dwId,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  locale: string;
  dwId: string;
  disabled?: boolean;
}) {
  const { t } = useCore();
  const [modalOpen, setModalOpen] = useState(false);
  const [displayLabel, setDisplayLabel] = useState<string | null>(null);

  const trimmedDwId = dwId.trim();
  const baseUrl = trimmedDwId ? getReferenceApiClientBaseUrl(trimmedDwId) : "";
  const areaGid = value.trim().split(",")[0]?.trim() ?? "";

  useEffect(() => {
    if (!areaGid || !trimmedDwId) {
      setDisplayLabel(null);
      return;
    }
    let cancelled = false;
    void fetchAreasTreeFromBackend(locale, { dwId: trimmedDwId })
      .then((tree) => {
        if (cancelled) return;
        const flat = tree.getFlat();
        const match =
          flat.find((a) => String(a.id) === areaGid) ??
          flat.find((a) => a.nid != null && String(a.nid) === areaGid);
        setDisplayLabel(match?.label ?? areaGid);
      })
      .catch(() => {
        if (!cancelled) setDisplayLabel(areaGid);
      });
    return () => {
      cancelled = true;
    };
  }, [areaGid, locale, trimmedDwId]);

  const initialSelected: AreaItem[] = useMemo(() => {
    if (!areaGid) return [];
    return [{ id: areaGid, label: displayLabel ?? areaGid }];
  }, [areaGid, displayLabel]);

  const pickerDisabled = Boolean(disabled) || !trimmedDwId;

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <input
          type="text"
          readOnly
          value={displayLabel ?? areaGid}
          placeholder={t("AREA_SUMMARY_NONE", "No area selected")}
          className="field-comp--md min-w-0 flex-1 cursor-default"
          disabled={pickerDisabled}
        />
        <button
          type="button"
          className="btn-comp-secondary shrink-0 px-2 py-1 text-xs"
          disabled={pickerDisabled}
          onClick={() => setModalOpen(true)}
        >
          {t("MODAL_SELECT_AREA", "Select Area")}
        </button>
        {areaGid ? (
          <button
            type="button"
            className="btn-comp-secondary shrink-0 px-2 py-1 text-xs"
            disabled={disabled}
            onClick={() => onChange("")}
          >
            {t("MODAL_CLEAR", "Clear")}
          </button>
        ) : null}
      </div>
      {baseUrl ? (
        <AreaSelectionModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          selectionMode="SINGLE"
          baseUrl={baseUrl}
          locale={locale}
          initialSelectedItems={initialSelected}
          onApply={(items) => {
            onChange(items[0]?.id?.trim() ?? "");
            setModalOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function SettingsField({
  field,
  value,
  onChange,
  onFileUpload,
  insightsEnabled,
  dwsEnabled,
  languageSelectOptions,
  warehouseSelectOptions,
  warehouseLoading,
  locale,
  dataWarehouseId,
  t,
}: {
  field: FieldDef;
  value: string;
  onChange: (key: string, value: string) => void;
  onFileUpload: (key: string, e: ChangeEvent<HTMLInputElement>) => void;
  insightsEnabled: boolean;
  dwsEnabled: boolean;
  languageSelectOptions: { value: string; label: string }[];
  warehouseSelectOptions: { value: string; label: string }[];
  warehouseLoading: boolean;
  locale: string;
  dataWarehouseId: string;
  t: (code: string, fallback?: string) => string;
}) {
  useTooltipCleanup();
  const label = t(field.labelKey ?? field.key, field.fallbackLabel);
  const help = field.help;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filePreviewFailed, setFilePreviewFailed] = useState(false);

  const locked =
    Boolean(field.requiresInsights && !insightsEnabled) ||
    Boolean(field.requiresDws && !dwsEnabled);

  const selectOptions = field.warehouseOptions
    ? warehouseSelectOptions
    : field.languageOptions
      ? languageSelectOptions
      : field.options ?? [];

  useEffect(() => {
    setFilePreviewFailed(false);
  }, [value]);

  const clearFile = useCallback(() => {
    onChange(field.key, "");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [field.key, onChange]);

  return (
    <div className={`sp-field ${locked ? "opacity-70" : ""}`}>
      <label className="sys-config__label-field form-label">
        <span>{label}</span>
        {help && <InfoTooltip text={help} />}
      </label>

      <div className="sys-config__input-field">
      {field.type === "color" && (
        <div className="sys-config__color-row">
          <input
            type="color"
            value={value || "#000000"}
            onChange={(e) => onChange(field.key, e.target.value)}
            className="sys-config__color-swatch"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(field.key, e.target.value)}
            placeholder="#000000"
            className="field-comp--md w-full"
          />
        </div>
      )}

      {field.type === "text" && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          disabled={locked}
          className="field-comp--md w-full"
        />
      )}

      {field.type === "textarea" && (
        <textarea
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          disabled={locked}
          rows={3}
          className="field-comp w-full"
        />
      )}

      {field.type === "number" && (
        <input
          type="number"
          min={1}
          step={1}
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          disabled={locked}
          className="field-comp--md w-full"
        />
      )}

      {field.type === "api_key" && (
        <textarea
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          disabled={locked}
          rows={4}
          spellCheck={false}
          autoComplete="off"
          placeholder={
            locked || value ? undefined : REDACTED_PLACEHOLDER
          }
          className="field-comp w-full"
        />
      )}

      {field.type === "select" && field.warehouseOptions && warehouseLoading && (
        <p className="text-sm text-text-muted">{t("LOADING", "Loading...")}</p>
      )}

      {field.type === "select" &&
        field.warehouseOptions &&
        !warehouseLoading &&
        selectOptions.length === 0 &&
        !value.trim() && (
          <p className="text-sm text-text-muted">
            {t("EMPTY_DATAWAREHOUSES", "No datawarehouses available.")}
          </p>
        )}

      {field.type === "select" &&
        selectOptions.length > 0 &&
        !(field.warehouseOptions && warehouseLoading) && (
        <select
          value={
            selectOptions.some((o) => o.value === value)
              ? value
              : (selectOptions[0]?.value ?? "")
          }
          onChange={(e) => onChange(field.key, e.target.value)}
          disabled={locked}
          className="field-comp--md w-full"
        >
          {selectOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {field.type === "area" && (
        <DefaultAreaSettingsField
          value={value}
          onChange={(next) => onChange(field.key, next)}
          locale={locale}
          dwId={dataWarehouseId}
          disabled={locked}
        />
      )}

      {field.type === "file" && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept={field.accept}
            onChange={(e) => onFileUpload(field.key, e)}
            className="sys-config__file-input"
          />
          {hasAssetValue(value) && (
            <>
              <div className="sys-config__preview">
                {!filePreviewFailed ? (
                  <img
                    src={value}
                    alt=""
                    onError={() => setFilePreviewFailed(true)}
                  />
                ) : (
                  <span className="px-1 text-center text-[10px] font-medium leading-tight text-text-muted">
                    {t("SETTINGS_ASSET_SET", "Set")}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={clearFile}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border text-text-muted transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                aria-label={t("SETTINGS_CLEAR_ASSET", "Remove file")}
                title={t("SETTINGS_CLEAR_ASSET", "Remove file")}
              >
                <X className="h-4 w-4" />
              </button>
            </>
          )}
          {hasAssetValue(value) && (
            <p className="text-xs text-green-600">
              {t("FILE_LOADED", "File loaded")}
            </p>
          )}
          {help && (
            <p className="sys-config__hint">{help}</p>
          )}
        </>
      )}
      </div>
    </div>
  );
}
