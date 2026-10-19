/**
 * Hard-coded grouping of toolkit `system_configuration` keys for the Data Manager
 * GET/PATCH `/app-config` UI (matches legacy v5 Administration → Configuration / Themes tabs).
 *
 * Keys must stay aligned with `apps/app_db/data/config.json` → `DFA_DM` in dfa-v6-api.
 * Field copy uses `APP_CFG_FIELD_*` translation codes (see `translations.json`; API can override per locale).
 */

/**
 * General settings tab (administration “Settings” / legacy “Configurations”).
 * Insight keys (`ENABLE_INSIGHTS`, `AI_PROVIDER`, `AI_API_KEY`) are toolkit-managed here — not shown in DM.
 */
export const APP_CONFIGURATION_GENERAL_KEYS: readonly string[] = [
  "APP_NAME",
  "APP_TITLE",
  "APP_ID",
  "SSO_ENABLED",
  "LANGUAGE_ENABLED",
  "LANGUAGE_DEFAULT",
  "APP_FOOTER_NOTE",
  "IUS_DEF_VALIDATION",
  "IUS_GID_SEPARATOR",
  "ALLOWED_IMPORT_FILE_SIZE_MB",
] as const;

/**
 * Branding keys shared by toolkit apps (see `config.json` → `DFA_DM`, `DFA_VIZ`, etc.).
 * Edited on the Data Manager **Theme** tab.
 */
export const APP_CONFIGURATION_FLAVOR_KEYS: readonly string[] = [
  "FLAVOR_COLOR",
  "FLAVOR_COLOR_HOVER",
  "FLAVOR_FAVICON",
  "FLAVOR_LOGO",
] as const;

/** Branding / theme tab (administration “Theme” / legacy “Themes”). */
export const APP_CONFIGURATION_THEMES_KEYS: readonly string[] = [...APP_CONFIGURATION_FLAVOR_KEYS];

/** Keys that use a native color swatch plus a compact text field (hex or any CSS color). */
export const APP_CONFIGURATION_COLOR_KEYS = new Set<string>(["FLAVOR_COLOR", "FLAVOR_COLOR_HOVER"]);

export const APP_CONFIGURATION_YES_NO_KEYS = new Set<string>(["LANGUAGE_ENABLED"]);

/** true/false string values for generic boolean toggles. */
export const APP_CONFIGURATION_BOOLEAN_KEYS = new Set<string>([]);

/** Non-negative integer settings edited as number inputs. */
export const APP_CONFIGURATION_NUMBER_KEYS = new Set<string>(["ALLOWED_IMPORT_FILE_SIZE_MB"]);

export const APP_CONFIGURATION_TEXTAREA_KEYS = new Set<string>();

/** Keys listed on the IC types tab (checkbox UI only). */
export const APP_CONFIGURATION_IC_TYPES_TAB_KEYS: readonly string[] = ["ENABLED_IC_TYPES"];

/**
 * Keys persisted from the IC types tab. `IND_CLASSIFICATIONS_SETTINGS` is derived from
 * `ENABLED_IC_TYPES` when checkboxes change (no separate editor).
 */
export const APP_CONFIGURATION_IC_TYPES_PERSIST_KEYS: readonly string[] = [
  "ENABLED_IC_TYPES",
  "IND_CLASSIFICATIONS_SETTINGS",
];

/** Keys listed on the unit format tab (checkbox UI only). */
export const APP_CONFIGURATION_UNIT_FORMAT_TAB_KEYS: readonly string[] = [
  "UNIT_DATA_FORMAT_CATALOG",
];

/** Keys persisted from the unit format tab. */
export const APP_CONFIGURATION_UNIT_FORMAT_PERSIST_KEYS: readonly string[] = [
  "UNIT_DATA_FORMAT_CATALOG",
];

/** Canonical IC type codes (toolkit `ENABLED_IC_TYPES` / DW API). */
export const APP_CONFIGURATION_IC_TYPE_CODES_ORDERED = [
  "SC",
  "GL",
  "CF",
  "TH",
  "IT",
  "CN",
] as const;

/**
 * Default IUS validation modes (matches datawarehouse `ValidationRuleType` / `IUS_DEF_VALIDATION` seed).
 * Used in administration app-config (no warehouse-scoped validation-rules list required).
 */
export const APP_CONFIGURATION_IUS_VALIDATION_MODE_OPTIONS: readonly {
  value: string;
  labelKey: string;
}[] = [
  { value: "NUM", labelKey: "VALIDATION_TYPE_NUM" },
  { value: "TEXT", labelKey: "VALIDATION_TYPE_TEXT" },
  { value: "ENUM", labelKey: "VALIDATION_TYPE_ENUM" },
];

export type AppConfigurationIcTypeCode =
  (typeof APP_CONFIGURATION_IC_TYPE_CODES_ORDERED)[number];

/**
 * Parse `ENABLED_IC_TYPES` value: empty array / blank means all types enabled (toolkit rule).
 * Returns a Set of selected type codes for checkbox UI.
 */
export function parseEnabledIcTypesFromConfigValue(raw: string): Set<string> {
  const all = () => new Set<string>(APP_CONFIGURATION_IC_TYPE_CODES_ORDERED);
  const t = (raw ?? "").trim();
  if (!t || t === "[]") return all();
  try {
    const arr = JSON.parse(t) as unknown;
    if (!Array.isArray(arr) || arr.length === 0) return all();
    const out = new Set<string>();
    for (const x of arr) {
      if (typeof x !== "string" || !x.trim()) continue;
      const c = x.trim().toUpperCase();
      if ((APP_CONFIGURATION_IC_TYPE_CODES_ORDERED as readonly string[]).includes(c)) {
        out.add(c);
      }
    }
    return out.size > 0 ? out : all();
  } catch {
    return all();
  }
}

/**
 * Serialize checkbox selection to `ENABLED_IC_TYPES` JSON.
 * All six selected → `[]` (means “no restriction” in toolkit).
 */
export function serializeEnabledIcTypesToConfigValue(selected: ReadonlySet<string>): string {
  const codes = APP_CONFIGURATION_IC_TYPE_CODES_ORDERED;
  const allSelected = codes.every((c) => selected.has(c));
  if (allSelected) return "[]";
  const chosen = codes.filter((c) => selected.has(c));
  return JSON.stringify(chosen);
}

/** Default `name` values aligned with toolkit `config.json` seed for `IND_CLASSIFICATIONS_SETTINGS`. */
export const APP_CONFIGURATION_IC_TYPE_DEFAULT_NAMES: Record<string, string> = {
  SC: "Sector",
  GL: "Goal",
  CF: "Framework",
  TH: "Theme",
  IT: "Institution",
  CN: "Convention",
};

/**
 * Build `IND_CLASSIFICATIONS_SETTINGS` JSON from `ENABLED_IC_TYPES` and the previous settings array.
 * Preserves custom `name` strings per type when present; sets `visible` from the enabled set.
 */
export function syncIndClassificationsSettingsFromEnabled(
  enabledIcTypesJson: string,
  previousIndClassificationsSettingsJson: string
): string {
  const enabled = parseEnabledIcTypesFromConfigValue(enabledIcTypesJson);
  const prevByType = new Map<string, { name?: string }>();
  try {
    const raw = (previousIndClassificationsSettingsJson ?? "").trim();
    if (raw && raw !== "[]") {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (!item || typeof item !== "object") continue;
          const o = item as Record<string, unknown>;
          if (typeof o.type !== "string" || !o.type.trim()) continue;
          const ty = o.type.trim().toUpperCase();
          prevByType.set(ty, {
            name: typeof o.name === "string" ? o.name : undefined,
          });
        }
      }
    }
  } catch {
    /* ignore */
  }
  const out = APP_CONFIGURATION_IC_TYPE_CODES_ORDERED.map((code) => {
    const prev = prevByType.get(code);
    const defaultName = APP_CONFIGURATION_IC_TYPE_DEFAULT_NAMES[code] ?? code;
    const name =
      typeof prev?.name === "string" && prev.name.trim().length > 0
        ? prev.name.trim()
        : defaultName;
    return { type: code, name, visible: enabled.has(code) };
  });
  return JSON.stringify(out);
}

/** Reserved for sensitive single-line fields (none on DM Settings tab currently). */
export const APP_CONFIGURATION_PASSWORD_KEYS = new Set<string>();

/** Branding image fields: file picker limits (aligned with legacy v5 guidance). */
export const APP_CONFIGURATION_IMAGE_FILE_KEYS: Record<
  string,
  { accept: string; maxBytes: number }
> = {
  FLAVOR_FAVICON: {
    accept: ".ico,.png,image/x-icon,image/vnd.microsoft.icon,image/png",
    maxBytes: 500 * 1024,
  },
  FLAVOR_LOGO: {
    accept: ".png,.jpg,.jpeg,image/png,image/jpeg",
    maxBytes: 1024 * 1024,
  },
};

/** i18n codes for app-config field labels, help tooltips, and input hints (see `translations.json` → `APP_CFG_FIELD_*`). */
export type AppConfigFieldUiMeta = {
  labelKey: string;
  /** Tooltip on the help icon; resolved with `t(helpKey)`. */
  helpKey?: string;
  /** Muted line under the control; resolved with `t(inputHintKey)`. */
  inputHintKey?: string;
};

export const APP_CONFIGURATION_FIELD_UI: Record<string, AppConfigFieldUiMeta> = {
  APP_NAME: {
    labelKey: "APP_CFG_FIELD_APP_NAME_LABEL",
    helpKey: "APP_CFG_FIELD_APP_NAME_HELP",
  },
  APP_TITLE: {
    labelKey: "APP_CFG_FIELD_APP_TITLE_LABEL",
    helpKey: "APP_CFG_FIELD_APP_TITLE_HELP",
  },
  APP_ID: {
    labelKey: "APP_CFG_FIELD_APP_ID_LABEL",
    helpKey: "APP_CFG_FIELD_APP_ID_HELP",
  },
  LANGUAGE_ENABLED: {
    labelKey: "APP_CFG_FIELD_LANGUAGE_ENABLED_LABEL",
    helpKey: "APP_CFG_FIELD_LANGUAGE_ENABLED_HELP",
  },
  LANGUAGE_DEFAULT: {
    labelKey: "APP_CFG_FIELD_LANGUAGE_DEFAULT_LABEL",
    helpKey: "APP_CFG_FIELD_LANGUAGE_DEFAULT_HELP",
  },
  ENABLED_IC_TYPES: {
    labelKey: "APP_CFG_FIELD_ENABLED_IC_TYPES_LABEL",
    helpKey: "APP_CFG_FIELD_ENABLED_IC_TYPES_HELP",
  },
  UNIT_DATA_FORMAT_CATALOG: {
    labelKey: "APP_CFG_FIELD_UNIT_DATA_FORMAT_CATALOG_LABEL",
    helpKey: "APP_CFG_FIELD_UNIT_DATA_FORMAT_CATALOG_HELP",
  },
  APP_FOOTER_NOTE: {
    labelKey: "APP_CFG_FIELD_APP_FOOTER_NOTE_LABEL",
    helpKey: "APP_CFG_FIELD_APP_FOOTER_NOTE_HELP",
  },
  IUS_DEF_VALIDATION: {
    labelKey: "APP_CFG_FIELD_IUS_DEF_VALIDATION_LABEL",
    helpKey: "APP_CFG_FIELD_IUS_DEF_VALIDATION_HELP",
  },
  IUS_GID_SEPARATOR: {
    labelKey: "APP_CFG_FIELD_IUS_GID_SEPARATOR_LABEL",
    helpKey: "APP_CFG_FIELD_IUS_GID_SEPARATOR_HELP",
  },
  ALLOWED_IMPORT_FILE_SIZE_MB: {
    labelKey: "APP_CFG_FIELD_ALLOWED_IMPORT_FILE_SIZE_MB_LABEL",
    helpKey: "APP_CFG_FIELD_ALLOWED_IMPORT_FILE_SIZE_MB_HELP",
    inputHintKey: "APP_CFG_FIELD_ALLOWED_IMPORT_FILE_SIZE_MB_INPUT_HINT",
  },
  SSO_ENABLED: {
    labelKey: "APP_CFG_FIELD_SSO_ENABLED_LABEL",
    helpKey: "APP_CFG_FIELD_SSO_ENABLED_HELP",
  },
  FLAVOR_COLOR: {
    labelKey: "APP_CFG_FIELD_FLAVOR_COLOR_LABEL",
    helpKey: "APP_CFG_FIELD_FLAVOR_COLOR_HELP",
    inputHintKey: "APP_CFG_FIELD_FLAVOR_COLOR_INPUT_HINT",
  },
  FLAVOR_COLOR_HOVER: {
    labelKey: "APP_CFG_FIELD_FLAVOR_COLOR_HOVER_LABEL",
    helpKey: "APP_CFG_FIELD_FLAVOR_COLOR_HOVER_HELP",
    inputHintKey: "APP_CFG_FIELD_FLAVOR_COLOR_HOVER_INPUT_HINT",
  },
  FLAVOR_FAVICON: {
    labelKey: "APP_CFG_FIELD_FLAVOR_FAVICON_LABEL",
    helpKey: "APP_CFG_FIELD_FLAVOR_FAVICON_HELP",
    inputHintKey: "APP_CFG_FIELD_FLAVOR_FAVICON_INPUT_HINT",
  },
  FLAVOR_LOGO: {
    labelKey: "APP_CFG_FIELD_FLAVOR_LOGO_LABEL",
    helpKey: "APP_CFG_FIELD_FLAVOR_LOGO_HELP",
    inputHintKey: "APP_CFG_FIELD_FLAVOR_LOGO_INPUT_HINT",
  },
};

export function appConfigFieldLabel(
  key: string,
  apiDescription: string,
  t: (code: string, fb?: string) => string
): string {
  const meta = APP_CONFIGURATION_FIELD_UI[key];
  if (meta?.labelKey) return t(meta.labelKey);
  const d = apiDescription?.trim();
  return d || key;
}
