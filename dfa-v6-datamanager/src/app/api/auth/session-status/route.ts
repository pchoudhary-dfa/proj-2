import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { DFA_ACCESS_COOKIE } from "@/lib/auth/cookie";
import { signToolkitAppRequest } from "@/lib/server/dmAppSign";
import {
  applyForwardedOrigin,
  getDmApiKey,
  getDmSigningPrivateKeyPem,
  getInternalToolkitApiUrl,
} from "@/lib/server/dmUpstream";

const PATH = "/auth/session-status";

/**
 * GET /api/auth/session-status
 *
 * Lightweight BFF proxy for cross-app SLO polling.
 * Returns 200 { active: true } when the user's session is still valid,
 * or 401 { active: false } when refresh tokens have been revoked
 * (e.g. the user logged out from another DFA app).
 */
export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(DFA_ACCESS_COOKIE)?.value?.trim();
  if (!accessToken) {
    return NextResponse.json({ active: false }, { status: 401 });
  }

  const internal = getInternalToolkitApiUrl();
  const url = `${internal}${PATH}`;

  const headers = new Headers();
  applyForwardedOrigin(headers, request);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("X-Api-Key", getDmApiKey());
  const pem = getDmSigningPrivateKeyPem();
  if (pem) {
    const { timestamp, signature } = signToolkitAppRequest("GET", PATH, pem);
    headers.set("X-Api-Timestamp", timestamp);
    headers.set("X-Api-Signature", signature);
  }

  try {
    const upstream = await fetch(url, { method: "GET", headers });
    if (upstream.status === 401) {
      return NextResponse.json({ active: false }, { status: 401 });
    }
    // For any other response (200, 403, 500, etc.) assume session is alive.
    // 403 = route not registered in IAM yet; 500 = transient server error.
    return NextResponse.json({ active: true });
  } catch {
    return NextResponse.json({ active: true });
  }
}
