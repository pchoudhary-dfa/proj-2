"use client";

import { useEffect } from "react";
import { useCore } from "@/contexts/CoreContext";

/**
 * Client component that dynamically updates PWA-related meta tags based on app config:
 * - theme-color meta tag (affects Android status bar, iOS Safari chrome)
 * - apple-touch-icon link (iOS home screen icon)
 * 
 * Must be rendered inside CoreProvider. Works alongside AppConfigApplier which handles favicon.
 */
export function PWAMetadata() {
  const { getConfig } = useCore();

  useEffect(() => {
    // Dynamic theme color from app config (fallback to default blue)
    const themeColor = getConfig("FLAVOR_COLOR") ||
    // fallback to default blue
    getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
    
    // Update or create theme-color meta tag
    let themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!themeMeta) {
      themeMeta = document.createElement("meta");
      themeMeta.name = "theme-color";
      document.head.appendChild(themeMeta);
    }
    themeMeta.content = themeColor;

    // Update or create apple-touch-icon link
    let appleIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (!appleIcon) {
      appleIcon = document.createElement("link");
      appleIcon.rel = "apple-touch-icon";
      document.head.appendChild(appleIcon);
    }
    appleIcon.href = "/icons/dfa_fav_vis_192.png";
  }, [getConfig]);

  return null;
}
