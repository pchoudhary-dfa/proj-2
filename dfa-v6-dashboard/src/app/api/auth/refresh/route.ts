import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { DFA_REFRESH_COOKIE } from "@/lib/auth/cookie";
import { applyTokenCookies } from "@/lib/server/cookies";
import { signToolkitAppRequest } from "@/lib/server/sign";
import {
  applyForwardedOrigin,
  getApiKey,
  getSigningPrivateKeyPem,
  getInternalToolkitApiUrl,
} from "@/lib/server/upstream";

const PATH = "/auth/refresh";

export async function POST(request: NextRequest) {
  const refresh = request.cookies.get(DFA_REFRESH_COOKIE)?.value?.trim();
  if (!refresh) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const internal = getInternalToolkitApiUrl();
  const url = `${internal}${PATH}`;

  const headers = new Headers();
  applyForwardedOrigin(headers, request);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  headers.set("X-Api-Key", getApiKey());
  const pem = getSigningPrivateKeyPem();
  if (pem) {
    const { timestamp, signature } = signToolkitAppRequest("POST", PATH, pem);
    headers.set("X-Api-Timestamp", timestamp);
    headers.set("X-Api-Signature", signature);
  }

  const upstream = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ refresh_token: refresh }),
  });

  const text = await upstream.text();
  if (!upstream.ok) {
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  }

  const data = JSON.parse(text) as {
    access_token: string;
    refresh_token: string;
  };
  const res = NextResponse.json({ ok: true });
  applyTokenCookies(res, data.access_token, data.refresh_token);
  return res;
}
