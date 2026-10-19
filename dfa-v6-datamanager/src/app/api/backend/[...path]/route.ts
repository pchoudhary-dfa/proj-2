import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { DFA_ACCESS_COOKIE } from "@/lib/auth/cookie";
import { signToolkitAppRequest } from "@/lib/server/dmAppSign";
import { BFF_API_PREFIX, DFA_MAILER_PATH } from "@/lib/constants";
import {
  applyForwardedOrigin,
  getDmApiKey,
  getDmSigningPrivateKeyPem,
  getInternalToolkitApiUrl,
} from "@/lib/server/dmUpstream";

type RouteCtx = { params: Promise<{ path?: string[] }> };

/**
 * Path on the toolkit host (e.g. `/dfa-mailer/templates/`).
 * Must preserve trailing slashes from the incoming URL — IAM regexes match the
 * exact path (e.g. `^/dfa-mailer/templates/$`); joining `[...path]` segments alone
 * drops a trailing slash and causes "route not registered in IAM".
 */
function toolkitPathFromRequest(
  request: NextRequest,
  pathSegments: string[]
): string {
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith(BFF_API_PREFIX)) {
    let rest = pathname.slice(BFF_API_PREFIX.length);
    if (!rest) rest = "/";
    else if (!rest.startsWith("/")) rest = `/${rest}`;
    return rest;
  }
  return `/${pathSegments.join("/")}`;
}

/**
 * IAM seeds list/create routes with a trailing slash (`/dfa-mailer/templates/`).
 * Browsers, curl, or clients may call `/dfa-mailer/templates` before `?`; normalize
 * so middleware matches and FastAPI mailer routes (trailing_slash=true) align.
 */
function normalizeMailerCollectionPathForIam(toolkitPath: string): string {
  const templatesRoot = `${DFA_MAILER_PATH}/templates`;
  const logsRoot = `${DFA_MAILER_PATH}/logs`;
  if (toolkitPath === templatesRoot || toolkitPath === logsRoot) {
    return `${toolkitPath}/`;
  }
  return toolkitPath;
}

function normalizeToolkitPathForIam(toolkitPath: string, _method: string): string {
  return normalizeMailerCollectionPathForIam(toolkitPath);
}

async function proxy(
  request: NextRequest,
  method: string,
  pathSegments: string[]
): Promise<Response> {
  if (pathSegments.length === 0) {
    return NextResponse.json(
      { success: false, err_message: "Not found" },
      { status: 404 }
    );
  }

  const upstreamBase = getInternalToolkitApiUrl();
  const path = normalizeToolkitPathForIam(
    toolkitPathFromRequest(request, pathSegments),
    method
  );
  const search = request.nextUrl.search ?? "";
  const pathWithQuery = `${path}${search}`;
  const targetUrl = `${upstreamBase}${pathWithQuery}`;

  const headers = new Headers();
  applyForwardedOrigin(headers, request);
  const al = request.headers.get("accept-language");
  if (al) headers.set("Accept-Language", al);
  const accept = request.headers.get("accept");
  if (accept) headers.set("Accept", accept);
  const ct = request.headers.get("content-type");
  if (ct) headers.set("Content-Type", ct);

  headers.set("X-Api-Key", getDmApiKey());
  const pem = getDmSigningPrivateKeyPem();
  if (pem) {
    const { timestamp, signature } = signToolkitAppRequest(method, pathWithQuery, pem);
    headers.set("X-Api-Timestamp", timestamp);
    headers.set("X-Api-Signature", signature);
  }

  const access = request.cookies.get(DFA_ACCESS_COOKIE)?.value;
  if (access) {
    headers.set("Authorization", `Bearer ${access}`);
  }

  let body: ArrayBuffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await request.arrayBuffer();
  }

  const upstream = await fetch(targetUrl, {
    method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
    redirect: "manual",
  });

  const out = new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
  });
  upstream.headers.forEach((v, k) => {
    if (k.toLowerCase() === "transfer-encoding") return;
    out.headers.set(k, v);
  });
  return out;
}

async function readPath(ctx: RouteCtx): Promise<string[]> {
  const { path } = await ctx.params;
  return path ?? [];
}

export async function GET(request: NextRequest, ctx: RouteCtx) {
  return proxy(request, "GET", await readPath(ctx));
}

export async function POST(request: NextRequest, ctx: RouteCtx) {
  return proxy(request, "POST", await readPath(ctx));
}

export async function PUT(request: NextRequest, ctx: RouteCtx) {
  return proxy(request, "PUT", await readPath(ctx));
}

export async function PATCH(request: NextRequest, ctx: RouteCtx) {
  return proxy(request, "PATCH", await readPath(ctx));
}

export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  return proxy(request, "DELETE", await readPath(ctx));
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
