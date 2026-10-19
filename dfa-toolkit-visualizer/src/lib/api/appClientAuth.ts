/**
 * Browser / shared helpers for SIGNATURE app-client auth (X-Api-Key + Timestamp + Signature).
 */
import { signRequest } from "@/lib/auth/signature";
import {
  API_KEY,
  API_PROXY_PREFIX,
  API_SIGNING_PRIVATE_KEY,
  API_SIGNATURE,
  DW_PATH_PREFIX,
  ENABLE_API_PROXY,
  X_APP_KEY_HEADER,
  X_APP_SIGNATURE_HEADER,
  X_APP_TIMESTAMP_HEADER,
} from "@/lib/constants";

const PROXY_RESERVED_SEGMENTS = new Set([
  "app-config",
  "translations",
  "system-language",
  "health",
  "viz-state",
  "gallery",
  "areas",
  "indicators",
  "subgroups",
  "time-periods",
  "options",
]);

/**
 * Map a request URL to the path+query the FastAPI middleware uses for verification.
 */
export function getBackendPathWithQuery(input: string | URL): string {
  const url =
    typeof input === "string"
      ? new URL(input, input.startsWith("http") ? undefined : "http://localhost")
      : input;
  let pathname = url.pathname;
  const search = url.search;

  if (pathname.startsWith(API_PROXY_PREFIX)) {
    pathname = mapProxyPathToToolkitPath(pathname);
  }

  return pathname + search;
}

function mapProxyPathToToolkitPath(pathname: string): string {
  const rest = pathname.slice(API_PROXY_PREFIX.length) || "/";
  if (!rest || rest === "/") return "/";

  const normalized = rest.startsWith("/") ? rest : `/${rest}`;
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) return "/";

  const first = segments[0].toLowerCase();
  if (PROXY_RESERVED_SEGMENTS.has(first)) {
    return normalized;
  }

  const dwId = segments[0];
  const tail = segments.slice(1).join("/");
  return `${DW_PATH_PREFIX}/${dwId}${tail ? `/${tail}` : ""}`;
}

export function pathWithQueryFromBackendUrl(backendUrl: string): string {
  const u = new URL(backendUrl);
  return u.pathname + u.search;
}

/**
 * Attach X-Api-Key and Ed25519 signature headers when calling the toolkit API directly
 * (`ENABLE_API_PROXY=false`). Skipped when the same-origin proxy signs server-side.
 */
export async function applyVizAuthHeaders(
  input: string | URL,
  method: string,
  headers: Headers
): Promise<void> {
  if (ENABLE_API_PROXY) return;

  if (API_KEY && !headers.has(X_APP_KEY_HEADER)) {
    headers.set(X_APP_KEY_HEADER, API_KEY);
  }

  if (!API_SIGNING_PRIVATE_KEY || !API_SIGNATURE) return;
  if (headers.has(X_APP_TIMESTAMP_HEADER) && headers.has(X_APP_SIGNATURE_HEADER)) {
    return;
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const pathWithQuery = getBackendPathWithQuery(input);
  const { signature } = await signRequest(
    method,
    pathWithQuery,
    API_SIGNING_PRIVATE_KEY,
    API_SIGNATURE,
    timestamp
  );
  headers.set(X_APP_TIMESTAMP_HEADER, timestamp);
  headers.set(X_APP_SIGNATURE_HEADER, signature);
}

export async function applyVizAuthHeadersToRecord(
  input: string | URL,
  method: string,
  headers: Record<string, string>
): Promise<Record<string, string>> {
  const h = new Headers(headers);
  await applyVizAuthHeaders(input, method, h);
  const out: Record<string, string> = {};
  h.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}
