import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { signToolkitAppRequest } from "@/lib/server/dmAppSign";
import {
  applyForwardedOrigin,
  getDmApiKey,
  getDmSigningPrivateKeyPem,
  getInternalToolkitApiUrl,
} from "@/lib/server/dmUpstream";

const PATH = "/auth/captcha/challenge";

export async function GET(request: NextRequest) {
  const internal = getInternalToolkitApiUrl();
  const url = `${internal}${PATH}`;

  const headers = new Headers();
  applyForwardedOrigin(headers, request);
  headers.set("Accept", "application/json");
  const al = request.headers.get("accept-language");
  if (al) headers.set("Accept-Language", al);
  headers.set("X-Api-Key", getDmApiKey());
  const pem = getDmSigningPrivateKeyPem();
  if (pem) {
    const { timestamp, signature } = signToolkitAppRequest("GET", PATH, pem);
    headers.set("X-Api-Timestamp", timestamp);
    headers.set("X-Api-Signature", signature);
  }

  const upstream = await fetch(url, { method: "GET", headers });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
