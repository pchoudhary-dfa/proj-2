import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  applyForwardedOrigin,
  applyToolkitAppClientAuthHeaders,
  getInternalToolkitApiUrl,
} from "@/lib/server/dmUpstream";

const PATH = "/auth/sso/providers";

export async function GET(request: NextRequest) {
  const internal = getInternalToolkitApiUrl();
  const url = `${internal}${PATH}`;

  const headers = new Headers();
  applyForwardedOrigin(headers, request);
  headers.set("Accept", "application/json");
  applyToolkitAppClientAuthHeaders(headers, "GET", PATH);

  const upstream = await fetch(url, { method: "GET", headers });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
