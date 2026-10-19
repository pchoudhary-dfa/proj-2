import type { CSSProperties } from "react";
import {
  FLAVOR_COLOR_CONFIG_KEY,
  FLAVOR_COLOR_HOVER_CONFIG_KEY,
  getAppConfigValue,
  type AppConfigData,
} from "@/lib/api/core";

export const FLAVOR_CACHE_KEY = "dfa-dm-flavor-theme";

export type FlavorColors = {
  primary: string | null;
  hover: string | null;
};

/** Basic CSS color validation (server-safe; no CSS.supports). */
export function isLikelyCssColor(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^#[0-9A-Fa-f]{3,8}$/.test(v)) return true;
  if (/^(rgb|rgba|hsl|hsla)\(/i.test(v)) return true;
  return /^[a-zA-Z]+$/.test(v);
}

export function resolveFlavorColorsFromConfig(
  config: AppConfigData | undefined
): FlavorColors {
  const primaryRaw = getAppConfigValue(config, FLAVOR_COLOR_CONFIG_KEY);
  const hoverRaw = getAppConfigValue(config, FLAVOR_COLOR_HOVER_CONFIG_KEY);
  return {
    primary:
      primaryRaw && isLikelyCssColor(primaryRaw) ? primaryRaw.trim() : null,
    hover: hoverRaw && isLikelyCssColor(hoverRaw) ? hoverRaw.trim() : null,
  };
}

export function flavorColorsToHtmlStyle(
  colors: FlavorColors | null | undefined
): CSSProperties | undefined {
  if (!colors?.primary && !colors?.hover) return undefined;
  const style: Record<string, string> = {};
  if (colors.primary) style["--color-primary"] = colors.primary;
  if (colors.hover) style["--color-primary-hover"] = colors.hover;
  return style as CSSProperties;
}

/** Runs synchronously in `<head>` before paint; restores cached theme over token defaults. */
export const FLAVOR_THEME_CACHE_SCRIPT = `(function(){try{var r=localStorage.getItem(${JSON.stringify(FLAVOR_CACHE_KEY)});if(!r)return;var t=JSON.parse(r),s=document.documentElement.style;if(t.primary)s.setProperty("--color-primary",t.primary);if(t.hover)s.setProperty("--color-primary-hover",t.hover);}catch(e){}})();`;

export function readCachedFlavorTheme(): FlavorColors {
  if (typeof window === "undefined") return { primary: null, hover: null };
  try {
    const raw = window.localStorage.getItem(FLAVOR_CACHE_KEY);
    if (!raw) return { primary: null, hover: null };
    const parsed = JSON.parse(raw) as { primary?: string; hover?: string };
    return {
      primary:
        parsed.primary && isLikelyCssColor(parsed.primary)
          ? parsed.primary.trim()
          : null,
      hover:
        parsed.hover && isLikelyCssColor(parsed.hover)
          ? parsed.hover.trim()
          : null,
    };
  } catch {
    return { primary: null, hover: null };
  }
}

export function writeCachedFlavorTheme(
  primary: string | null,
  hover: string | null
): void {
  if (typeof window === "undefined") return;
  if (!primary && !hover) {
    window.localStorage.removeItem(FLAVOR_CACHE_KEY);
    return;
  }
  try {
    window.localStorage.setItem(
      FLAVOR_CACHE_KEY,
      JSON.stringify({ primary, hover })
    );
  } catch {
    /* ignore quota / private mode */
  }
}
