import "server-only";

import type { NextRequest } from "next/server";

import { signToolkitAppRequest } from "@/lib/server/vizAppSign";

export function getInternalToolkitApiUrl(): string {
  return (
    process.env.DFA_TOOLKIT_INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_PROXY_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://127.0.0.1:8000"
  ).replace(/\/$/, "");
}

export function getVizApiKey(): string {
  return process.env.NEXT_PUBLIC_API_KEY ?? "";
}

export function getVizSigningPrivateKeyPem(): string {
  return (process.env.API_SIGNING_PRIVATE_KEY ?? "").trim().replace(/^["']|["']$/g, "");
}

export function applyToolkitAppClientAuthHeaders(
  headers: Headers,
  method: string,
  pathWithQuery: string
): void {
  const apiKey = getVizApiKey();
  if (apiKey) headers.set("X-Api-Key", apiKey);
  const pem = getVizSigningPrivateKeyPem();
  if (!pem) return;
  const { timestamp, signature } = signToolkitAppRequest(method, pathWithQuery, pem);
  headers.set("X-Api-Timestamp", timestamp);
  headers.set("X-Api-Signature", signature);
}

export function applyForwardedOrigin(target: Headers, request: NextRequest): void {
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
    const fb = (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").replace(
      /\/$/,
      ""
    );
    target.set("Origin", fb);
  }
}
