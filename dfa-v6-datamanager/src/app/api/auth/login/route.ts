import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { applyTokenCookies } from "@/lib/server/authSessionCookies";
import { signToolkitAppRequest } from "@/lib/server/dmAppSign";
import {
  applyForwardedOrigin,
  getDmApiKey,
  getDmSigningPrivateKeyPem,
  getInternalToolkitApiUrl,
} from "@/lib/server/dmUpstream";

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
  headers.set("X-Api-Key", getDmApiKey());
  const pem = getDmSigningPrivateKeyPem();
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
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
    });
  }

  const data = JSON.parse(text) as {
    access_token: string;
    refresh_token: string;
    token_type?: string;
    permissions?: Record<
      string,
      {
        is_super_admin?: boolean;
        resources?: { resource_code: string; permissions: string[] }[];
      }
    >;
    [key: string]: unknown;
  };
  const { access_token, refresh_token, ...rest } = data;
  const res = NextResponse.json({
    ...rest,
    token_type: data.token_type ?? "bearer",
  });
  applyTokenCookies(res, access_token, refresh_token);

  const apiKey = getDmApiKey();
  const appPerms = data.permissions?.[apiKey];
  let summary: string[];
  if (appPerms?.is_super_admin) {
    summary = ["__super_admin__"];
  } else {
    summary = (appPerms?.resources ?? [])
      .filter((r) => r.permissions?.includes("R"))
      .map((r) => r.resource_code);
  }
  res.cookies.set("dfa_permissions_summary", JSON.stringify(summary), {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 1440,
  });

  return res;
}
