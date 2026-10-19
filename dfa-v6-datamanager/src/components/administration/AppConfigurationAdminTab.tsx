"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { MainTabsBar } from "@/components/MainTabsBar";
import { PrimarySaveButton } from "@/components/PrimarySaveButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SelectField } from "@/components/SelectField";
import { TextAreaField } from "@/components/TextAreaField";
import { TextField } from "@/components/TextField";
import { useCoreOptional } from "@/contexts/CoreContext";
import { useAppConfig } from "@/contexts/AppConfigContext";
import {
  APP_CONFIGURATION_COLOR_KEYS,
  APP_CONFIGURATION_BOOLEAN_KEYS,
  APP_CONFIGURATION_FIELD_UI,
  APP_CONFIGURATION_GENERAL_KEYS,
  APP_CONFIGURATION_IC_TYPES_PERSIST_KEYS,
  APP_CONFIGURATION_IC_TYPES_TAB_KEYS,
  APP_CONFIGURATION_IC_TYPE_CODES_ORDERED,
  APP_CONFIGURATION_IMAGE_FILE_KEYS,
  APP_CONFIGURATION_IUS_VALIDATION_MODE_OPTIONS,
  APP_CONFIGURATION_NUMBER_KEYS,
  APP_CONFIGURATION_PASSWORD_KEYS,
  APP_CONFIGURATION_TEXTAREA_KEYS,
  APP_CONFIGURATION_THEMES_KEYS,
  APP_CONFIGURATION_UNIT_FORMAT_PERSIST_KEYS,
  APP_CONFIGURATION_UNIT_FORMAT_TAB_KEYS,
  APP_CONFIGURATION_YES_NO_KEYS,
  appConfigFieldLabel,
  parseEnabledIcTypesFromConfigValue,
  serializeEnabledIcTypesToConfigValue,
  syncIndClassificationsSettingsFromEnabled,
} from "@/lib/app-configuration-tab-keys";
import {
  type AppConfigData,
  type AppConfigEntry,
  fetchAppConfig,
  fetchSystemLanguages,
  invalidateAppConfigFetchCache,
  patchAppConfig,
  type SystemLanguageRow,
  systemLanguagesToOptions,
} from "@/lib/api/core";
import { getTranslationsFallback } from "@/lib/i18n/translations";
import { UnitFormatConfigPanel } from "@/components/administration/UnitFormatConfigPanel";
import { ProductsConfigPanel, type ProductsPanelHandle } from "@/components/administration/ProductsConfigPanel";
import {
  SsoProvidersConfigPanel,
  type SsoProvidersPanelHandle,
} from "@/components/administration/SsoProvidersConfigPanel";
import { hasPermission, APP_ROUTE_PERMISSIONS } from "@/lib/auth/user";
import { Loader } from "@/components/Loader";

const _fb = getTranslationsFallback("en");
const fallbackT = (code: string, fb?: string) => _fb[code] ?? fb ?? code;

type MainTab = "configuration" | "themes" | "icTypes" | "unitFormat" | "products" | "ssoProviders";

/** Value for `<input type="color">` (must be `#rrggbb`). Non-hex CSS colors map to black for the swatch only. */
function hexForColorInput(raw: string): string {
  const s = raw.trim();
  const m6 = s.match(/^#([0-9a-f]{6})$/i);
  if (m6) return `#${m6[1]!.toLowerCase()}`;
  const m3 = s.match(/^#([0-9a-f]{3})$/i);
  if (m3) {
    const [a, b, c] = m3[1]!.split("");
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  return "#000000";
}

function cloneConfig(data: AppConfigData): AppConfigData {
  const out: AppConfigData = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = { ...v };
  }
  return out;
}

function buildPatchPayload(
  baseline: AppConfigData,
  draft: AppConfigData,
  keys: readonly string[]
): Record<string, { value: string; description: string }> {
  const payload: Record<string, { value: string; description: string }> = {};
  for (const key of keys) {
    const b = baseline[key];
    const d = draft[key];
    if (!b || !d) continue;
    if (b.is_system === true) continue;
    const descB = b.description ?? "";
    const descD = d.description ?? "";
    if (b.value === d.value && descB === descD) continue;
    payload[key] = {
      value: d.value,
      description: descD.length > 0 ? descD : descB,
    };
  }
  return payload;
}

function looksLikeImagePreview(value: string): boolean {
  const v = value.trim();
  return v.startsWith("data:image/") || /^https?:\/\//i.test(v);
}

/** Fixed portal tooltip (native `title` is unreliable inside scroll/label rows). */
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
  const ariaLabel = detail ? `Configuration key ${keyCode}. ${detail}` : `Configuration key ${keyCode}`;
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(null);

  const updateTipPosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setTipPos({ top: r.bottom + 8, left: r.left });
  }, []);

  const showTip = useCallback(() => {
    updateTipPosition();
  }, [updateTipPosition]);

  const hideTip = useCallback(() => {
    setTipPos(null);
  }, []);

  useLayoutEffect(() => {
    if (tipPos == null) return;
    const sync = () => {
      updateTipPosition();
    };
    window.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
    };
  }, [tipPos, updateTipPosition]);

  const tip =
    tipPos != null && typeof document !== "undefined"
      ? createPortal(
          <div
            className="pointer-events-none fixed z-tooltip max-w-[min(20rem,calc(100vw-1rem)))] rounded-md border border-border bg-surface px-3 py-2 text-left text-xs leading-snug text-text shadow-md"
            style={{ top: tipPos.top, left: tipPos.left }}
            aria-hidden
          >
            <div className="text-xs font-semibold tracking-tight text-text">{keyCode}</div>
            {detail ? (
              <div className="mt-1.5 whitespace-pre-wrap text-text-muted">{detail}</div>
            ) : null}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <span
        ref={anchorRef}
        className="sys-config__field-info"
        tabIndex={0}
        aria-label={ariaLabel}
        onPointerEnter={showTip}
        onPointerLeave={hideTip}
        onFocus={showTip}
        onBlur={hideTip}
        onMouseDown={(e) => {
          e.preventDefault();
        }}
      >
        <span className="material-icons !text-sm leading-none" aria-hidden>
          info_outline
        </span>
      </span>
      {tip}
    </>
  );
}

function LanguageDefaultSelectField({
  entry,
  updateEntry,
  labelText,
  t,
  rows,
}: {
  entry: AppConfigEntry;
  updateEntry: (key: string, patch: Partial<AppConfigEntry>) => void;
  labelText: string;
  t: (code: string, fb?: string) => string;
  rows: SystemLanguageRow[];
}) {
  const core = useCoreOptional();
  const displayLocale = (core?.locale ?? "en").trim() || "en";

  const baseOptions = useMemo(() => {
    return systemLanguagesToOptions(rows, displayLocale);
  }, [rows, displayLocale]);

  const rawVal = (entry.value ?? "").trim();

  const valueForSelect = useMemo(() => {
    if (!rawVal) return "";
    const exact = baseOptions.find((o) => o.value === rawVal);
    if (exact) return exact.value;
    const ci = baseOptions.find((o) => o.value.toLowerCase() === rawVal.toLowerCase());
    if (ci) return ci.value;
    return rawVal;
  }, [rawVal, baseOptions]);

  const selectOptions = useMemo(() => {
    const head: { value: string; label: string; searchText: string }[] = [
      {
        value: "",
        label: t("APP_CONFIG_DEFAULT_LANGUAGE_EMPTY"),
        searchText: t("APP_CONFIG_DEFAULT_LANGUAGE_EMPTY").toLowerCase(),
      },
    ];
    const mapped = baseOptions.map((o) => ({
      value: o.value,
      label: o.label,
      searchText: `${o.label} ${o.value}`.toLowerCase(),
    }));
    const inList = baseOptions.some(
      (o) => o.value === rawVal || o.value.toLowerCase() === rawVal.toLowerCase()
    );
    if (rawVal && !inList) {
      return [
        ...head,
        { value: rawVal, label: rawVal, searchText: rawVal.toLowerCase() },
        ...mapped,
      ];
    }
    return [...head, ...mapped];
  }, [baseOptions, rawVal, t]);

  return (
    <SelectField
      id="cfg-LANGUAGE_DEFAULT"
      className="w-full min-w-0"
      menuPortal
      searchEnabled
      value={valueForSelect}
      onChange={(e) => updateEntry("LANGUAGE_DEFAULT", { value: e.target.value })}
      aria-label={labelText}
      options={selectOptions}
    />
  );
}

function IusDefValidationSelectField({
  entry,
  updateEntry,
  labelText,
  t,
}: {
  entry: AppConfigEntry;
  updateEntry: (key: string, patch: Partial<AppConfigEntry>) => void;
  labelText: string;
  t: (code: string, fb?: string) => string;
}) {
  const allowed = APP_CONFIGURATION_IUS_VALIDATION_MODE_OPTIONS.map((o) => o.value);
  const raw = (entry.value ?? "").trim().toUpperCase();
  const value = allowed.includes(raw) ? raw : raw || "TEXT";

  const options = useMemo(() => {
    const base = APP_CONFIGURATION_IUS_VALIDATION_MODE_OPTIONS.map((o) => ({
      value: o.value,
      label: t(o.labelKey),
      searchText: `${o.value} ${t(o.labelKey)}`.toLowerCase(),
    }));
    if (raw && !allowed.includes(raw)) {
      return [
        { value: raw, label: raw, searchText: raw.toLowerCase() },
        ...base,
      ];
    }
    return base;
  }, [allowed, raw, t]);

  return (
    <SelectField
      id="cfg-IUS_DEF_VALIDATION"
      className="w-full min-w-0"
      menuPortal
      value={value}
      onChange={(e) => updateEntry("IUS_DEF_VALIDATION", { value: e.target.value })}
      aria-label={labelText}
      options={options}
    />
  );
}

function SsoEnabledSelectField({
  entry,
  updateEntry,
  labelText,
  t,
}: {
  entry: AppConfigEntry;
  updateEntry: (key: string, patch: Partial<AppConfigEntry>) => void;
  labelText: string;
  t: (code: string, fb?: string) => string;
}) {
  const raw = (entry.value ?? "").trim().toLowerCase();
  const value = raw === "true" || raw === "yes" ? "yes" : "no";

  return (
    <SelectField
      id="cfg-SSO_ENABLED"
      className="w-full min-w-0"
      menuPortal
      value={value}
      onChange={(e) =>
        updateEntry("SSO_ENABLED", { value: e.target.value === "yes" ? "true" : "false" })
      }
      aria-label={labelText}
      options={[
        { value: "yes", label: t("YES"), searchText: "yes" },
        { value: "no", label: t("NO"), searchText: "no" },
      ]}
    />
  );
}

function AppConfigurationKeyField({
  configKey,
  entry,
  updateEntry,
  t,
  appNameError,
  systemLanguages,
}: {
  configKey: string;
  entry: AppConfigEntry;
  updateEntry: (key: string, patch: Partial<AppConfigEntry>) => void;
  t: (code: string, fb?: string) => string;
  appNameError: string | null;
  systemLanguages: SystemLanguageRow[];
}) {
  const ui = APP_CONFIGURATION_FIELD_UI[configKey];
  const labelText = appConfigFieldLabel(configKey, entry.description ?? "", t);
  const isTextarea = APP_CONFIGURATION_TEXTAREA_KEYS.has(configKey);
  const isYesNo = APP_CONFIGURATION_YES_NO_KEYS.has(configKey);
  const isBoolean = APP_CONFIGURATION_BOOLEAN_KEYS.has(configKey);
  const isNumber = APP_CONFIGURATION_NUMBER_KEYS.has(configKey);
  const isPassword = APP_CONFIGURATION_PASSWORD_KEYS.has(configKey);
  const isColor = APP_CONFIGURATION_COLOR_KEYS.has(configKey);
  const imgAsset = APP_CONFIGURATION_IMAGE_FILE_KEYS[configKey];
  const showPreview =
    (configKey === "FLAVOR_FAVICON" || configKey === "FLAVOR_LOGO") &&
    looksLikeImagePreview(entry.value);

  return (
    <div className="sys-config__label-fields">
      <label className="sys-config__label-field form-label" htmlFor={`cfg-${configKey}`}>
        <span>{labelText}</span>
        <FieldHelpHint
          keyCode={configKey}
          help={ui?.helpKey ? t(ui.helpKey) : undefined}
          apiDescription={entry.description ?? undefined}
        />
      </label>
      <div className="sys-config__input-field">
        {configKey === "LANGUAGE_DEFAULT" ? (
          <LanguageDefaultSelectField
            entry={entry}
            updateEntry={updateEntry}
            labelText={labelText}
            t={t}
            rows={systemLanguages}
          />
        ) : configKey === "IUS_DEF_VALIDATION" ? (
          <IusDefValidationSelectField
            entry={entry}
            updateEntry={updateEntry}
            labelText={labelText}
            t={t}
          />
        ) : configKey === "SSO_ENABLED" ? (
          <SsoEnabledSelectField
            entry={entry}
            updateEntry={updateEntry}
            labelText={labelText}
            t={t}
          />
        ) : isYesNo ? (
          <SelectField
            id={`cfg-${configKey}`}
            className="w-full min-w-0"
            menuPortal
            value={entry.value}
            onChange={(e) => updateEntry(configKey, { value: e.target.value })}
            aria-label={labelText}
            options={[
              { value: "yes", label: t("YES"), searchText: "yes" },
              { value: "no", label: t("NO"), searchText: "no" },
            ]}
          />
        ) : isBoolean ? (
          <SelectField
            id={`cfg-${configKey}`}
            className="w-full min-w-0"
            menuPortal
            value={(entry.value ?? "").trim().toLowerCase() || "false"}
            onChange={(e) => updateEntry(configKey, { value: e.target.value })}
            aria-label={labelText}
            options={[
              { value: "true", label: t("TRUE"), searchText: "true" },
              { value: "false", label: t("FALSE"), searchText: "false" },
            ]}
          />
        ) : isTextarea ? (
          <TextAreaField
            id={`cfg-${configKey}`}
            fieldSize="lg"
            className="font-mono"
            value={entry.value}
            onChange={(e) => updateEntry(configKey, { value: e.target.value })}
            spellCheck={false}
          />
        ) : isColor ? (
          <div className="sys-config__color-row">
            <input
              type="color"
              className="sys-config__color-swatch"
              value={hexForColorInput(entry.value)}
              onChange={(e) => updateEntry(configKey, { value: e.target.value })}
              aria-label={t("APP_CONFIG_COLOR_SWATCH")}
            />
            <TextField
              id={`cfg-${configKey}`}
              fieldSize="md"
              className=" max-w-[11rem]"
              value={entry.value}
              onChange={(e) => updateEntry(configKey, { value: e.target.value })}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        ) : imgAsset ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              id={`cfg-${configKey}`}
              type="file"
              accept={imgAsset.accept}
              aria-label={`${labelText}. ${t("APP_CONFIG_CHOOSE_IMAGE_FILE")}`}
              className="sys-config__file-input min-w-0 flex-1"
              onChange={(e) => {
                const inputEl = e.currentTarget;
                const file = inputEl.files?.[0];
                inputEl.value = "";
                if (!file) return;
                if (file.size > imgAsset.maxBytes) {
                  toast.error(
                    `${t("APP_CONFIG_IMAGE_FILE_TOO_LARGE")} (${Math.ceil(imgAsset.maxBytes / 1024)} KB)`
                  );
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  const s = String(reader.result ?? "");
                  if (s) updateEntry(configKey, { value: s });
                };
                reader.readAsDataURL(file);
              }}
            />
            {(entry.value ?? "").trim() && !showPreview ? (
              <button
                type="button"
                className="btn-comp-secondary inline-flex shrink-0 items-center justify-center rounded p-1.5"
                aria-label={t("APP_CONFIG_CLEAR_IMAGE")}
                title={t("APP_CONFIG_CLEAR_IMAGE")}
                onClick={() => updateEntry(configKey, { value: "" })}
              >
                <span className="material-icons !text-sm leading-none" aria-hidden>
                  close
                </span>
              </button>
            ) : null}
          </div>
        ) : (
          <TextField
            id={`cfg-${configKey}`}
            fieldSize="md"
            type={isPassword ? "password" : isNumber ? "number" : "text"}
            min={isNumber ? 1 : undefined}
            step={isNumber ? 1 : undefined}
            inputMode={isNumber ? "numeric" : undefined}
            value={entry.value}
            onChange={(e) => updateEntry(configKey, { value: e.target.value })}
            autoComplete="off"
            aria-invalid={configKey === "APP_NAME" && Boolean(appNameError)}
          />
        )}
        {configKey === "APP_NAME" && appNameError ? (
          <span className="sys-config__error">{appNameError}</span>
        ) : null}
        {ui?.inputHintKey ? (
          <span className="sys-config__hint">{t(ui.inputHintKey)}</span>
        ) : null}
        {showPreview ? (
          <div className="sys-config__preview">
            <button
              type="button"
              className="btn-comp-icon absolute right-0.5 top-0.5 z-10 shrink-0 backdrop-blur-sm"
              aria-label={t("APP_CONFIG_CLEAR_IMAGE")}
              title={t("APP_CONFIG_CLEAR_IMAGE")}
              onClick={() => updateEntry(configKey, { value: "" })}
            >
              <span className="material-icons !text-sm leading-none" aria-hidden>
                close
              </span>
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={entry.value.trim()} alt="" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function IcTypesConfigPanel({
  enabledEntry,
  indEntry,
  updateEntry,
  t,
}: {
  enabledEntry: AppConfigEntry;
  indEntry: AppConfigEntry | undefined;
  updateEntry: (key: string, patch: Partial<AppConfigEntry>) => void;
  t: (code: string, fb?: string) => string;
}) {
  const selected = parseEnabledIcTypesFromConfigValue(enabledEntry.value);

  const toggle = useCallback(
    (code: string, checked: boolean) => {
      const next = parseEnabledIcTypesFromConfigValue(enabledEntry.value);
      if (checked) {
        next.add(code);
      } else {
        next.delete(code);
        if (next.size === 0) {
          toast.warning(t("APP_CONFIG_IC_TYPES_AT_LEAST_ONE"));
          return;
        }
      }
      const enabledJson = serializeEnabledIcTypesToConfigValue(next);
      updateEntry("ENABLED_IC_TYPES", { value: enabledJson });
      if (indEntry) {
        const indJson = syncIndClassificationsSettingsFromEnabled(
          enabledJson,
          indEntry.value ?? ""
        );
        updateEntry("IND_CLASSIFICATIONS_SETTINGS", { value: indJson });
      }
    },
    [enabledEntry.value, indEntry, updateEntry, t]
  );

  const ui = APP_CONFIGURATION_FIELD_UI.ENABLED_IC_TYPES;
  const title = appConfigFieldLabel("ENABLED_IC_TYPES", enabledEntry.description ?? "", t);

  return (
    <div className="sys-config__types-panel">
      <div className="flex flex-wrap items-center gap-1.5">
        <h2 className="text-sm font-medium text-text">{title}</h2>
        <FieldHelpHint
          keyCode="ENABLED_IC_TYPES"
          help={ui?.helpKey ? t(ui.helpKey) : undefined}
          apiDescription={enabledEntry.description ?? undefined}
        />
      </div>
      <p className="sys-config__types-intro">{t("APP_CONFIG_IC_TYPES_INTRO")}</p>
      <div className="sys-config__types-list" role="group" aria-label={title}>
        {APP_CONFIGURATION_IC_TYPE_CODES_ORDERED.map((code) => (
          <div key={code} className="sys-config__type-row">
            <label htmlFor={`cfg-ic-${code}`}>
              <input
                id={`cfg-ic-${code}`}
                type="checkbox"
                className="checkbox-comp"
                checked={selected.has(code)}
                onChange={(e) => toggle(code, e.target.checked)}
              />
              <span>
                <span className="text-xs text-text-muted">{code}</span>
                <span className="text-text-muted"> · </span>
                {t(`IC_TYPE_${code}`)}
              </span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AppConfigurationAdminTab() {
  const core = useCoreOptional();
  const t = core?.t ?? fallbackT;
  const { refreshConfig, ssoEnabled } = useAppConfig();
  const canUpdate = hasPermission(APP_ROUTE_PERMISSIONS.settings.crud, "U");

  const [mainTab, setMainTab] = useState<MainTab>("configuration");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [systemLanguages, setSystemLanguages] = useState<SystemLanguageRow[]>([]);
  const [baseline, setBaseline] = useState<AppConfigData>({});
  const [draft, setDraft] = useState<AppConfigData>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [productsHandle, setProductsHandle] = useState<ProductsPanelHandle | null>(null);
  const [ssoProvidersHandle, setSsoProvidersHandle] =
    useState<SsoProvidersPanelHandle | null>(null);

  const ssoProvidersTabVisible = useMemo(() => {
    const entry = draft.SSO_ENABLED ?? baseline.SSO_ENABLED;
    if (!entry) return ssoEnabled;
    const raw = (entry.value ?? "").trim().toLowerCase();
    return raw === "true" || raw === "yes";
  }, [draft.SSO_ENABLED, baseline.SSO_ENABLED, ssoEnabled]);

  useEffect(() => {
    if (!ssoProvidersTabVisible && mainTab === "ssoProviders") {
      setMainTab("configuration");
    }
  }, [ssoProvidersTabVisible, mainTab]);

  const configTabs = useMemo(() => {
    const tabs: { value: MainTab; label: string; icon: string }[] = [
      { value: "configuration" as const, label: t("CONFIGURATION"), icon: "settings" },
      { value: "themes" as const, label: t("THEMES"), icon: "palette" },
      { value: "icTypes" as const, label: t("APP_CONFIG_TAB_IC_TYPES"), icon: "category" },
      {
        value: "unitFormat" as const,
        label: t("APP_CONFIG_TAB_UNIT_FORMAT"),
        icon: "attach_money",
      },
      {
        value: "products" as const,
        label: t("APP_CONFIG_TAB_PRODUCTS", "Products"),
        icon: "apps",
      },
    ];
    if (ssoProvidersTabVisible) {
      tabs.push({
        value: "ssoProviders" as const,
        label: t("APP_CONFIG_TAB_SSO_PROVIDERS"),
        icon: "key",
      });
    }
    return tabs;
  }, [ssoProvidersTabVisible, t]);

  const orderedKeys = useMemo(() => {
    if (mainTab === "themes") {
      return APP_CONFIGURATION_THEMES_KEYS.filter((k) => draft[k] != null);
    }
    if (mainTab === "icTypes") {
      return APP_CONFIGURATION_IC_TYPES_TAB_KEYS.filter((k) => draft[k] != null);
    }
    if (mainTab === "unitFormat") {
      return APP_CONFIGURATION_UNIT_FORMAT_TAB_KEYS.filter((k) => draft[k] != null);
    }
    return APP_CONFIGURATION_GENERAL_KEYS.filter((k) => draft[k] != null);
  }, [draft, mainTab]);

  const appNameError = useMemo(() => {
    const v = draft.APP_NAME?.value?.trim() ?? "";
    if (!submitAttempted) return null;
    if (!v) return t("APP_CONFIG_WEBSITE_TITLE_REQUIRED");
    return null;
  }, [draft.APP_NAME?.value, submitAttempted, t]);

  const load = useCallback(async () => {
    setLoading(true);
    const [configRes, langRes] = await Promise.allSettled([
      fetchAppConfig({ isSystem: false, unitFormatCatalogFull: true }),
      fetchSystemLanguages(),
    ]);
    if (configRes.status === "rejected") {
      toast.error(t("APP_CONFIG_LOAD_FAILED"));
      setBaseline({});
      setDraft({});
      setLoading(false);
      return;
    }
    if (configRes.value.success !== true) {
      toast.error(configRes.value.err_message ?? t("APP_CONFIG_LOAD_FAILED"));
      setBaseline({});
      setDraft({});
      setLoading(false);
      return;
    }
    setBaseline(cloneConfig(configRes.value.data));
    setDraft(cloneConfig(configRes.value.data));
    if (langRes.status === "fulfilled") {
      setSystemLanguages(langRes.value.filter((r) => !r.is_deleted));
    } else {
      toast.error(t("APP_CONFIG_LANGUAGES_LOAD_FAILED"));
    }
    setLoading(false);
    setSubmitAttempted(false);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const dmDirty = useMemo(() => {
    const keys = [
      ...APP_CONFIGURATION_GENERAL_KEYS,
      ...APP_CONFIGURATION_THEMES_KEYS,
      ...APP_CONFIGURATION_IC_TYPES_PERSIST_KEYS,
      ...APP_CONFIGURATION_UNIT_FORMAT_PERSIST_KEYS,
    ];
    for (const key of keys) {
      const b = baseline[key];
      const d = draft[key];
      if (!b || !d) continue;
      if (b.is_system === true) continue;
      if (b.value !== d.value || (b.description ?? "") !== (d.description ?? "")) {
        return true;
      }
    }
    return false;
  }, [baseline, draft]);

  const updateEntry = useCallback((key: string, patch: Partial<AppConfigEntry>) => {
    setDraft((prev) => {
      const cur = prev[key];
      if (!cur) return prev;
      return { ...prev, [key]: { ...cur, ...patch } };
    });
  }, []);

  const handleReset = useCallback(() => {
    setDraft(cloneConfig(baseline));
    setSubmitAttempted(false);
    toast.message(t("APP_CONFIG_RESET_DONE"));
  }, [baseline, t]);

  const handleSave = useCallback(async () => {
    setSubmitAttempted(true);

    const dmKeys = [
      ...APP_CONFIGURATION_GENERAL_KEYS,
      ...APP_CONFIGURATION_THEMES_KEYS,
      ...APP_CONFIGURATION_IC_TYPES_PERSIST_KEYS,
      ...APP_CONFIGURATION_UNIT_FORMAT_PERSIST_KEYS,
    ];
    const dmPayload = buildPatchPayload(baseline, draft, dmKeys);

    if (Object.keys(dmPayload).length === 0) {
      toast.message(t("APP_CONFIG_NOTHING_TO_SAVE"));
      return;
    }

    const name = draft.APP_NAME?.value?.trim() ?? "";
    if (!name) {
      toast.error(t("APP_CONFIG_WEBSITE_TITLE_REQUIRED"));
      return;
    }

    setSaving(true);
    let partialDetail: string | null = null;

    try {
      const res = await patchAppConfig(dmPayload);
      if (res.success !== true) {
        toast.error(res.err_message ?? t("APP_CONFIG_SAVE_FAILED"));
        return;
      }
      if (res.data.missing_keys.length > 0) {
        partialDetail = res.data.missing_keys.join(", ");
      }
      invalidateAppConfigFetchCache();
      await load();
      await refreshConfig();
      if (partialDetail) {
        toast.warning(`${t("APP_CONFIG_SAVE_PARTIAL")}: ${partialDetail}`);
      } else {
        toast.success(t("APP_CONFIG_SAVE_SUCCESS"));
      }
    } finally {
      setSaving(false);
    }
  }, [baseline, draft, load, refreshConfig, t]);

  return (
    <div className="sys-config">
      <MainTabsBar
        tabs={configTabs}
        activeValue={mainTab}
        className="min-w-0 shrink-0"
        tablistAccessibility={{ ariaLabel: t("APP_CONFIG_TABLIST_ARIA") }}
        onSelect={(v) => {
          setSubmitAttempted(false);
          setMainTab(v);
        }}
      />

      {(loading ||
        (mainTab === "products" && productsHandle === null) ||
        (mainTab === "ssoProviders" && ssoProvidersHandle === null)) && (
        <div className="flex flex-1 items-center justify-center">
          <Loader loadingLabel={t("LOADING")} />
        </div>
      )}

      {!loading && (
      <form
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        style={{
          display:
            (mainTab === "products" && productsHandle === null) ||
            (mainTab === "ssoProviders" && ssoProvidersHandle === null)
              ? "none"
              : undefined,
        }}
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
        noValidate
      >
        <fieldset
          disabled={!canUpdate}
          className="m-0 flex min-h-0 min-w-0 flex-1 flex-col border-0 p-0 disabled:opacity-90"
        >
        <div className="sys-config__scroll">
          {mainTab === "ssoProviders" ? (
            <SsoProvidersConfigPanel t={t} onHandleReady={setSsoProvidersHandle} />
          ) : mainTab === "products" ? (
            <ProductsConfigPanel t={t} onHandleReady={setProductsHandle} />
          ) : mainTab === "icTypes" ? (
            <div className="sys-config__panel">
              {draft.ENABLED_IC_TYPES ? (
                <IcTypesConfigPanel
                  enabledEntry={draft.ENABLED_IC_TYPES}
                  indEntry={draft.IND_CLASSIFICATIONS_SETTINGS}
                  updateEntry={updateEntry}
                  t={t}
                />
              ) : (
                <p className="text-sm text-text-muted">{t("APP_CONFIG_NO_KEYS_IN_TAB")}</p>
              )}
            </div>
          ) : mainTab === "unitFormat" ? (
            <div className="sys-config__panel">
              {draft.UNIT_DATA_FORMAT_CATALOG ? (
                <UnitFormatConfigPanel
                  catalogEntry={draft.UNIT_DATA_FORMAT_CATALOG}
                  updateEntry={updateEntry}
                  t={t}
                />
              ) : (
                <p className="text-sm text-text-muted">{t("APP_CONFIG_NO_KEYS_IN_TAB")}</p>
              )}
            </div>
          ) : orderedKeys.length === 0 ? (
            <div className="sys-config__panel">
              <p className="text-sm text-text-muted">{t("APP_CONFIG_NO_KEYS_IN_TAB")}</p>
            </div>
          ) : (
            <div className="sys-config__panel">
              {orderedKeys.map((key) => {
                const entry = draft[key]!;
                return (
                  <AppConfigurationKeyField
                    key={key}
                    configKey={key}
                    entry={entry}
                    updateEntry={updateEntry}
                    t={t}
                    appNameError={appNameError}
                    systemLanguages={systemLanguages}
                  />
                );
              })}
            </div>
          )}
        </div>
        </fieldset>

        {canUpdate ? (
          mainTab === "ssoProviders" ? (
            <div className="sys-config__actions">
              <SecondaryButton
                type="button"
                disabled={!ssoProvidersHandle?.dirty || ssoProvidersHandle?.saving}
                onClick={() => ssoProvidersHandle?.onReset()}
              >
                {t("APP_CONFIG_RESET")}
              </SecondaryButton>
              <PrimarySaveButton
                type="button"
                disabled={!ssoProvidersHandle?.dirty || ssoProvidersHandle?.saving}
                onClick={() => void ssoProvidersHandle?.onSave()}
              >
                {ssoProvidersHandle?.saving ? t("SAVING") : t("APP_CONFIG_SAVE")}
              </PrimarySaveButton>
            </div>
          ) : mainTab === "products" ? (
          <div className="sys-config__actions">
            <SecondaryButton
              type="button"
              disabled={!productsHandle?.dirty || productsHandle?.saving}
              onClick={() => productsHandle?.onReset()}
            >
              {t("APP_CONFIG_RESET")}
            </SecondaryButton>
            <PrimarySaveButton
              type="button"
              disabled={!productsHandle?.dirty || productsHandle?.saving}
              onClick={() => void productsHandle?.onSave()}
            >
              {productsHandle?.saving ? t("SAVING") : t("APP_CONFIG_SAVE")}
            </PrimarySaveButton>
          </div>
        ) : (
          <div className="sys-config__actions">
            <SecondaryButton
              type="button"
              disabled={loading || !dmDirty || saving}
              onClick={handleReset}
            >
              {t("APP_CONFIG_RESET")}
            </SecondaryButton>
            <PrimarySaveButton
              type="submit"
              disabled={loading || saving || (!dmDirty && orderedKeys.length === 0)}
            >
              {saving ? t("SAVING") : t("APP_CONFIG_SAVE")}
            </PrimarySaveButton>
          </div>
        )
        ) : null}
      </form>
      )}
    </div>
  );
}
