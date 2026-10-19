"use client";

import { useMemo } from "react";
import { buildHeaders, type ApiClientOptions } from "@/lib/api/client";

// Side-effect import: ensures the fetch interceptor is installed before any
// component that uses this hook fires its first fetch call.
import "@/lib/api/signedFetch";

/**
 * Returns static headers (Content-Type, Accept-Language, Authorization, X-Api-Key)
 * for vendor toolkit components that accept a `headers` prop.
 *
 * Direct mode: global fetch interceptor signs (NEXT_PUBLIC_API_SIGNATURE + NEXT_PUBLIC_API_SIGNING_PRIVATE_KEY).
 * Proxy mode: `/api/proxy` signs server-side (API_SIGNING_PRIVATE_KEY).
 */
export function useSignedFetchHeaders(
  _signUrl?: string,
  options: ApiClientOptions = {}
): Record<string, string> {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => buildHeaders(options), [options.acceptLanguage]);
}
