"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useCore } from "@/contexts/CoreContext";
import { DEFAULT_FAVICON } from "@/lib/constants";

/**
 * Render-null component that applies global side-effect configs from the
 * app-config API response:
 *
 * - **APP_TITLE** -- sets `document.title` (re-applied on pathname change so it sticks on all pages including visualizer)
 * - **FLAVOR_COLOR** -- overrides `--color-primary` CSS variable (list/tree hover use primary+opacity in component CSS)
 * - **FLAVOR_COLOR_HOVER** -- overrides `--color-primary-hover` CSS variable
 * - **FLAVOR_FAVICON** -- creates / updates `<link rel="icon">` in `<head>` when valid
 *   (expects full data URL or absolute URL from DB; invalid/empty leaves server default)
 *
 * Must be rendered inside the `CoreProvider` tree so `useCore()` is available.
 * Falls back gracefully: when a config value is empty the existing
 * CSS / HTML defaults remain untouched.
 */
export function AppConfigApplier() {
  const { getConfig } = useCore();
  const pathname = usePathname();

  useEffect(() => {
    // --- Document title (re-run on pathname change so title sticks after client nav e.g. to visualizer) ---
    const title = getConfig("APP_TITLE");
    if (title) {
      document.title = title;
    }

    // --- Flavor primary color ---
    const color = getConfig("FLAVOR_COLOR");
    if (color) {
      document.documentElement.style.setProperty("--color-primary", color);
    }

    // --- Flavor primary-hover color ---
    const colorHover = getConfig("FLAVOR_COLOR_HOVER");
    if (colorHover) {
      document.documentElement.style.setProperty(
        "--color-primary-hover",
        colorHover
      );
    }

    // --- Favicon: only overwrite when API returns a valid value (data URL or absolute URL).
    // Invalid/empty from API leaves the server-rendered default so the tab icon does not disappear.
    const apiFavicon = (getConfig("FLAVOR_FAVICON") ?? "").trim();
    const isValidFavicon =
      apiFavicon.startsWith("data:") ||
      apiFavicon.startsWith("http://") ||
      apiFavicon.startsWith("https://");
    const favicon = isValidFavicon ? apiFavicon : DEFAULT_FAVICON;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = favicon;
  }, [getConfig, pathname]);

  return null;
}
