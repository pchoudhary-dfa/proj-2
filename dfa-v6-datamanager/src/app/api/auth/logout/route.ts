import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { DFA_ACCESS_COOKIE } from "@/lib/auth/cookie";
import { clearTokenCookies } from "@/lib/server/authSessionCookies";
import { signToolkitAppRequest } from "@/lib/server/dmAppSign";
import {
  applyForwardedOrigin,
  getDmApiKey,
  getDmSigningPrivateKeyPem,
  getInternalToolkitApiUrl,
} from "@/lib/server/dmUpstream";

const PATH = "/auth/logout";

export async function POST(request: NextRequest) {
  const access = request.cookies.get(DFA_ACCESS_COOKIE)?.value?.trim();
  let logoutUrl: string | null = null;

  if (access) {
    const internal = getInternalToolkitApiUrl();
    const url = `${internal}${PATH}`;
    const headers = new Headers();
    applyForwardedOrigin(headers, request);
    headers.set("Accept", "application/json");
    headers.set("Authorization", `Bearer ${access}`);
    headers.set("X-Api-Key", getDmApiKey());
    const pem = getDmSigningPrivateKeyPem();
    if (pem) {
      const { timestamp, signature } = signToolkitAppRequest("POST", PATH, pem);
      headers.set("X-Api-Timestamp", timestamp);
      headers.set("X-Api-Signature", signature);
    }
    try {
      const upstream = await fetch(url, { method: "POST", headers });
      if (upstream.ok) {
        const body = await upstream.json();
        logoutUrl = body?.data?.logout_url ?? null;
      }
    } catch {
      /* ignore toolkit errors — cookies are cleared locally */
    }
  }

  const res = NextResponse.json({ ok: true, logout_url: logoutUrl });
  clearTokenCookies(res);
  return res;
}
