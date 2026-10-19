import type { NextRequest } from "next/server";

/** Base URL reachable from the Next.js server for calls to the FastAPI toolkit API. */
export function getInternalToolkitApiUrl(): string {
  return (
    process.env.DFA_TOOLKIT_INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://127.0.0.1:8000"
  ).replace(/\/$/, "");
}

/** X-Api-Key sent to the toolkit API. */
export function getApiKey(): string {
  return process.env.NEXT_PUBLIC_API_KEY ?? "dfa_dm_fed_app";
}

export function getSigningPrivateKeyPem(): string {
  return (
    process.env.DM_API_SIGNING_PRIVATE_KEY ??
    process.env.NEXT_PUBLIC_API_PUBLIC_KEY ??
    ""
  ).trim();
}

/**
 * FED app clients validate Origin; forward the browser origin on server-side fetches.
 */
export function applyForwardedOrigin(
  target: Headers,
  request: NextRequest
): void {
  const origin = request.headers.get("origin");
  if (origin) {
    target.set("Origin", origin);
    return;
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      target.set("Origin", new URL(referer).origin);
    } catch {
      /* ignore */
    }
  }
  if (!target.has("Origin")) {
    const fb = (
      process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"
    ).replace(/\/$/, "");
    target.set("Origin", fb);
  }
}
