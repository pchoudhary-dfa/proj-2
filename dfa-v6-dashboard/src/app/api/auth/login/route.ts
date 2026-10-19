import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { applyTokenCookies } from "@/lib/server/cookies";
import { signToolkitAppRequest } from "@/lib/server/sign";
import {
  applyForwardedOrigin,
  getApiKey,
  getSigningPrivateKeyPem,
  getInternalToolkitApiUrl,
} from "@/lib/server/upstream";

const PATH = "/auth/login";

export async function POST(request: NextRequest) {
  const internal = getInternalToolkitApiUrl();
  const url = `${internal}${PATH}`;

  const headers = new Headers();
  applyForwardedOrigin(headers, request);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  const al = request.headers.get("accept-language");
  if (al) headers.set("Accept-Language", al);
  headers.set("X-Api-Key", getApiKey());
  const pem = getSigningPrivateKeyPem();
  if (pem) {
    const { timestamp, signature } = signToolkitAppRequest("POST", PATH, pem);
    headers.set("X-Api-Timestamp", timestamp);
    headers.set("X-Api-Signature", signature);
  }

  const body = await request.text();
  const upstream = await fetch(url, { method: "POST", headers, body });

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
    token_type?: string;
    [key: string]: unknown;
  };
  const { access_token, refresh_token, ...rest } = data;
  const res = NextResponse.json({
    ...rest,
    token_type: data.token_type ?? "bearer",
  });
  applyTokenCookies(res, access_token, refresh_token);

  return res;
}
