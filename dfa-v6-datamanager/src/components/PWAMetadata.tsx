"use client";

import { useEffect } from "react";
import { useAppConfig } from "@/contexts/AppConfigContext";
import { resolveFlavorColorsFromConfig } from "@/lib/flavor-theme";

/**
 * Client component that dynamically updates PWA-related meta tags based on app config:
 * - theme-color meta tag (affects Android status bar, iOS Safari chrome)
 * - apple-touch-icon link (iOS home screen icon)
 */
export function PWAMetadata() {
  const { config } = useAppConfig();

  useEffect(() => {
    const { primary } = resolveFlavorColorsFromConfig(config);
    const themeColor =
      primary ||
      getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() ||
      '#1976d2';

    let themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!themeMeta) {
      themeMeta = document.createElement("meta");
      themeMeta.name = "theme-color";
      document.head.appendChild(themeMeta);
    }
    themeMeta.content = themeColor;

    let appleIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (!appleIcon) {
      appleIcon = document.createElement("link");
      appleIcon.rel = "apple-touch-icon";
      document.head.appendChild(appleIcon);
    }
    appleIcon.href = "/icons/dfa_fav_dm_192.png";
  }, [config]);

  return null;
}
