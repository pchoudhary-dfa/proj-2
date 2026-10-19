import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { signToolkitAppRequest } from "@/lib/server/dmAppSign";
import {
  applyForwardedOrigin,
  getDmApiKey,
  getDmSigningPrivateKeyPem,
  getInternalToolkitApiUrl,
} from "@/lib/server/dmUpstream";

const PATH = "/auth/password/reset-confirm";

export async function POST(request: NextRequest) {
  const internal = getInternalToolkitApiUrl();
  const url = `${internal}${PATH}`;

  const headers = new Headers();
  applyForwardedOrigin(headers, request);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");

  const al = request.headers.get("accept-language");
  if (al) headers.set("Accept-Language", al);

  // Forward the Bearer token from the client — this is the JWT from the reset link
  const auth = request.headers.get("authorization");
  if (auth) headers.set("Authorization", auth);

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
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
