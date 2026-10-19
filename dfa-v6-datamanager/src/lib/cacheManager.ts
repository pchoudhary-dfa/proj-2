import { getAppVersion } from "@/lib/version";

/**
 * PWA cache manager — clears sensitive caches on logout.
 * Cache names must stay in sync with `runtimeCaching.js`.
 */

const PROJECT_PREFIX = "dfa-dm";

async function getCacheVersion(): Promise<string> {
  try {
    return `v${await getAppVersion()}`;
  } catch {
    console.warn("Could not read app version, using fallback cache version");
    return "v0.1.0";
  }
}

/** Clear API-related caches that may hold user-specific responses. */
export async function clearApiCaches(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) {
    return;
  }

  try {
    const cacheVersion = await getCacheVersion();
    const apiCachePatterns = [
      `${PROJECT_PREFIX}-api-${cacheVersion}`,
      `${PROJECT_PREFIX}-next-data-${cacheVersion}`,
      `${PROJECT_PREFIX}-html-${cacheVersion}`,
      `${PROJECT_PREFIX}-documents-${cacheVersion}`,
    ];

    await Promise.all(apiCachePatterns.map((cacheName) => caches.delete(cacheName)));
  } catch (error) {
    console.error("Error clearing API caches:", error);
  }
}
