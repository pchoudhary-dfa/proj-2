import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { DFA_ACCESS_COOKIE } from "@/lib/auth/cookie";
import { clearTokenCookies } from "@/lib/server/cookies";
import { signToolkitAppRequest } from "@/lib/server/sign";
import {
  applyForwardedOrigin,
  getApiKey,
  getSigningPrivateKeyPem,
  getInternalToolkitApiUrl,
} from "@/lib/server/upstream";

const PATH = "/auth/logout";

export async function POST(request: NextRequest) {
  const access = request.cookies.get(DFA_ACCESS_COOKIE)?.value?.trim();
  if (access) {
    const internal = getInternalToolkitApiUrl();
    const url = `${internal}${PATH}`;
    const headers = new Headers();
    applyForwardedOrigin(headers, request);
    headers.set("Accept", "application/json");
    headers.set("Authorization", `Bearer ${access}`);
    headers.set("X-Api-Key", getApiKey());
    const pem = getSigningPrivateKeyPem();
    if (pem) {
      const { timestamp, signature } = signToolkitAppRequest(
        "POST",
        PATH,
        pem
      );
      headers.set("X-Api-Timestamp", timestamp);
      headers.set("X-Api-Signature", signature);
    }
    try {
      await fetch(url, { method: "POST", headers });
    } catch {
      /* ignore toolkit errors — cookies are cleared locally */
    }
  }

  const res = NextResponse.json({ ok: true });
  clearTokenCookies(res);
  return res;
}
