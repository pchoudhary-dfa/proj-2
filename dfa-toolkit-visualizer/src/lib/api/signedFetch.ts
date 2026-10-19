/**
 * Global fetch interceptor for Ed25519 request signing in direct mode.
 *
 * When ENABLE_API_PROXY is false, vendor packages (dfa-v6-comp-*) call fetch()
 * internally with dynamic URLs, query params, and HTTP methods. We cannot
 * pre-sign a static URL at mount time because the backend verifies the EXACT
 * path+query+method combination. This interceptor patches window.fetch once
 * and signs every outgoing request that targets the Toolkit API.
 *
 * When ENABLE_API_PROXY is true, no signing occurs client-side (the proxy signs
 * server-side with API_SIGNING_PRIVATE_KEY).
 */

import { signRequest } from "@/lib/auth/signature";
import {
  API_BASE_URL,
  API_KEY,
  API_SIGNING_PRIVATE_KEY,
  API_SIGNATURE,
  ENABLE_API_PROXY,
  X_APP_KEY_HEADER,
  X_APP_SIGNATURE_HEADER,
  X_APP_TIMESTAMP_HEADER,
} from "@/lib/constants";

let installed = false;

const apiOrigin: string = (() => {
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return "";
  }
})();

function shouldSignRequest(url: string): boolean {
  if (ENABLE_API_PROXY) return false;
  if (!API_SIGNING_PRIVATE_KEY || !API_SIGNATURE) return false;
  if (!apiOrigin) return false;

  try {
    const parsed = new URL(
      url,
      typeof window !== "undefined" ? window.location.origin : "http://localhost"
    );
    return parsed.origin === apiOrigin;
  } catch {
    return false;
  }
}

function getPathWithQuery(url: string): string {
  try {
    const parsed = new URL(
      url,
      typeof window !== "undefined" ? window.location.origin : "http://localhost"
    );
    return parsed.pathname + parsed.search;
  } catch {
    return "/";
  }
}

export function installSignedFetchInterceptor(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  if (ENABLE_API_PROXY) return;
  if (!API_SIGNING_PRIVATE_KEY || !API_SIGNATURE) return;

  const originalFetch = window.fetch.bind(window);
  installed = true;

  window.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    if (!shouldSignRequest(url)) {
      return originalFetch(input, init);
    }

    const method = (init?.method ?? "GET").toUpperCase();
    const pathWithQuery = getPathWithQuery(url);

    const headers = new Headers(init?.headers);

    if (API_KEY && !headers.has(X_APP_KEY_HEADER)) {
      headers.set(X_APP_KEY_HEADER, API_KEY);
    }

    if (!headers.has(X_APP_SIGNATURE_HEADER)) {
      const { timestamp, signature } = await signRequest(
        method,
        pathWithQuery,
        API_SIGNING_PRIVATE_KEY,
        API_SIGNATURE
      );
      headers.set(X_APP_TIMESTAMP_HEADER, timestamp);
      headers.set(X_APP_SIGNATURE_HEADER, signature);
    }

    return originalFetch(input, { ...init, headers });
  };
}

installSignedFetchInterceptor();
