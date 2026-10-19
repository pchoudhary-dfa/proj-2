export type SsoProviderListItem = {
  provider_code: string;
  display_name: string | null;
};

let inflight: Promise<SsoProviderListItem[] | null> | null = null;

/**
 * Fetch active SSO providers once per page load (dedupes React Strict Mode double effects).
 */
export function fetchSsoProvidersOnce(): Promise<SsoProviderListItem[] | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/auth/sso/providers");
      if (!res.ok) return null;
      const json = await res.json();
      const items = json?.data;
      return Array.isArray(items) ? (items as SsoProviderListItem[]) : null;
    } catch {
      return null;
    }
  })();
  return inflight;
}
