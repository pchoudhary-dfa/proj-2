/**
 * Single API proxy route: all /api/proxy/* traffic is handled here.
 * Branches on path[0] for health, viz-state, dw, gallery, areas, indicators, options, subgroups, time-periods.
 * If path[0] is not a reserved segment, treats it as dwId and proxies to backend /dw/{dwId}/...
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import {
  X_APP_KEY_HEADER,
  X_APP_SIGNATURE_HEADER,
  X_APP_TIMESTAMP_HEADER,
  API_PROXY_URL,
  DW_PATH_PREFIX,
  GALLERY_PATH_SEGMENT,
} from "@/lib/constants";
import { DFA_ACCESS_COOKIE } from "@/lib/sso/constants";
import { pathWithQueryFromBackendUrl } from "@/lib/api/appClientAuth";
import {
  applyForwardedOrigin,
  applyToolkitAppClientAuthHeaders,
} from "@/lib/server/vizUpstream";
import { createVizState, getVizState } from "@/app/api/viz-state/store";
import {
  isMinimalSharePayload,
  type MinimalSharePayload,
} from "@/lib/visualizer/embed/shareUrl";
import type { VisualizationConfig } from "@/lib/visualizer/types";

const GALLERY_BACKEND_BASE = `${API_PROXY_URL.replace(/\/$/, "")}${GALLERY_PATH_SEGMENT}`;

const DATA_WAREHOUSE_NOT_AVAILABLE = "Data warehouse not available";

function dataWarehouseNotAvailableResponse(): NextResponse {
  return NextResponse.json(
    { error: DATA_WAREHOUSE_NOT_AVAILABLE },
    { status: 400 }
  );
}

function proxyError(message: string, status = 502): NextResponse {
  return NextResponse.json(
    { success: false, err_message: message, data: null },
    { status }
  );
}

function buildBackendHeaders(
  request: NextRequest,
  backendUrl: string,
  method: string
): Record<string, string> {
  const headers = new Headers({ "Content-Type": "application/json" });
  const acceptLanguage = request.headers.get("Accept-Language");
  if (acceptLanguage) headers.set("Accept-Language", acceptLanguage);
  
  // Check for Authorization header from request (backward compatibility)
  const authorization = request.headers.get("Authorization");
  if (authorization) {
    headers.set("Authorization", authorization);
  } else {
    // Read access token from httpOnly cookie (SSO and new auth flow)
    const accessToken = request.cookies.get(DFA_ACCESS_COOKIE)?.value;
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
  }

  applyForwardedOrigin(headers, request);

  const pathWithQuery = pathWithQueryFromBackendUrl(backendUrl);
  applyToolkitAppClientAuthHeaders(headers, method, pathWithQuery);

  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/** Forward request to backend and return response as-is. */
async function proxyToBackend(
  request: NextRequest,
  backendUrl: string,
  method: string
): Promise<NextResponse> {
  const incomingContentType = request.headers.get("Content-Type") ?? "";
  const isMultipart = incomingContentType.includes("multipart/form-data");

  const headers = buildBackendHeaders(request, backendUrl, method);

  // For multipart/form-data, remove the JSON Content-Type the builder sets —
  // the fetch API will set the correct multipart boundary automatically.
  if (isMultipart) {
    delete headers["content-type"];
  }

  let body: BodyInit | undefined;
  if (["POST", "PUT", "PATCH"].includes(method)) {
    if (isMultipart) {
      try {
        body = await request.formData();
      } catch {
        return proxyError("Invalid multipart body");
      }
    } else {
      try {
        body = await request.text();
      } catch {
        return proxyError("Invalid request body");
      }
    }
  }

  let res: Response;
  try {
    res = await fetch(backendUrl, {
      method,
      cache: "no-store",
      redirect: "manual",
      headers,
      body: body ?? undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    return proxyError(msg);
  }

  if (res.status === 204 || res.status === 304) {
    return new NextResponse(null, {
      status: res.status,
      statusText: res.statusText,
    });
  }

  const contentType = res.headers.get("Content-Type") ?? "application/json";

  // Binary / streaming responses: pipe body directly without buffering as text
  const isBinaryOrStream =
    contentType.includes("text/event-stream") ||
    contentType.includes("application/x-ndjson") ||
    contentType.includes("application/octet-stream") ||
    contentType.includes("application/vnd.openxmlformats") ||
    contentType.includes("application/vnd.ms-excel");

  if (isBinaryOrStream) {
    const responseHeaders: Record<string, string> = { "Content-Type": contentType };
    const cd = res.headers.get("Content-Disposition");
    if (cd) responseHeaders["Content-Disposition"] = cd;
    const cl = res.headers.get("Content-Length");
    if (cl) responseHeaders["Content-Length"] = cl;
    if (
      contentType.includes("event-stream") ||
      contentType.includes("ndjson")
    ) {
      responseHeaders["Cache-Control"] = "no-cache, no-transform";
      responseHeaders["X-Accel-Buffering"] = "no";
      responseHeaders["Connection"] = "keep-alive";
    }
    return new NextResponse(res.body, { status: res.status, headers: responseHeaders });
  }

  let resBody: string;
  try {
    resBody = await res.text();
  } catch {
    return proxyError("Invalid response");
  }

  return new NextResponse(resBody, {
    status: res.status,
    statusText: res.statusText,
    headers: { "Content-Type": contentType },
  });
}

// --- Health ---
function handleHealth(): NextResponse {
  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "dfa-toolkit-visualizer",
    },
    { status: 200 }
  );
}

// --- Viz-state ---
function isChartConfig(v: unknown): v is VisualizationConfig {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.title === "string" &&
    typeof o.chartType === "string" &&
    typeof o.chartColor === "string"
  );
}

async function handleVizStateGet(request: NextRequest): Promise<NextResponse> {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  const entry = getVizState(id);
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    fetchParams: entry.fetchParams,
    chartConfig: entry.chartConfig,
  });
}

async function handleVizStatePost(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Body must be an object" },
        { status: 400 }
      );
    }
    const { fetchParams, chartConfig } = body as {
      fetchParams?: unknown;
      chartConfig?: unknown;
    };
    if (!isMinimalSharePayload(fetchParams)) {
      return NextResponse.json(
        { error: "Invalid fetchParams" },
        { status: 400 }
      );
    }
    if (!isChartConfig(chartConfig)) {
      return NextResponse.json(
        { error: "Invalid chartConfig" },
        { status: 400 }
      );
    }
    const id = createVizState(fetchParams, chartConfig);
    return NextResponse.json({ id });
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 }
    );
  }
}

// --- Areas ---
async function handleAreas(_request: NextRequest): Promise<NextResponse> {
  return dataWarehouseNotAvailableResponse();
}

// --- Indicators (by id) ---
async function handleIndicators(
  _request: NextRequest,
  _identifier: string
): Promise<NextResponse> {
  return dataWarehouseNotAvailableResponse();
}

// --- Options ---
async function handleOptions(
  _request: NextRequest,
  _keyword: string
): Promise<NextResponse> {
  return dataWarehouseNotAvailableResponse();
}

// --- Subgroups ---
async function handleSubgroups(_request: NextRequest): Promise<NextResponse> {
  return dataWarehouseNotAvailableResponse();
}

// --- Time-periods ---
async function handleTimePeriods(_request: NextRequest): Promise<NextResponse> {
  return dataWarehouseNotAvailableResponse();
}

// DW resource segment names. Resource-only path (e.g. /api/proxy/dw/indicators with no dwId) returns 400.
const DW_RESOURCE_NAMES = new Set([
  "indicators",
  "areas",
  "subgroups",
  "time-periods",
  "data",
  "search",
  "indicator-classifications",
  "ic",
]);

// --- DW proxy (path = ['dw', dwId, ...rest] or ['dw', resourceName]; resource-only with no dwId returns 400) ---
async function handleDwProxy(
  request: NextRequest,
  path: string[],
  method: string
): Promise<NextResponse> {
  const first = path[0];
  const isResourceOnly =
    path.length >= 1 && DW_RESOURCE_NAMES.has(first?.toLowerCase() ?? "");
  const effectiveDwId = isResourceOnly ? "" : first;
  if (!effectiveDwId) {
    return dataWarehouseNotAvailableResponse();
  }
  const rest = isResourceOnly ? path : path.slice(1);
  const pathSegment = rest.length ? rest.join("/") : "";
  const search = request.nextUrl.searchParams.toString();
  const dwSegment = `/${encodeURIComponent(effectiveDwId)}`;
  const backendPath = `${DW_PATH_PREFIX}${dwSegment}${pathSegment ? `/${pathSegment}` : ""}${search ? `?${search}` : ""}`;
  const backendUrl = `${API_PROXY_URL.replace(/\/$/, "")}${backendPath}`;
  return proxyToBackend(request, backendUrl, method);
}

// --- Gallery proxy (path = ['gallery'] or ['gallery', id]) ---
async function handleGalleryProxy(
  request: NextRequest,
  path: string[],
  method: string
): Promise<NextResponse> {
  const id = path[1];
  const search = request.nextUrl.searchParams.toString();
  const backendUrl = id
    ? `${GALLERY_BACKEND_BASE}/${encodeURIComponent(id)}${search ? `?${search}` : ""}`
    : method === "GET"
      ? `${GALLERY_BACKEND_BASE}${search ? `?${search}` : ""}`
      : GALLERY_BACKEND_BASE;
  return proxyToBackend(request, backendUrl, method);
}

// --- Share-links proxy (path = ['share-links'] or ['share-links', code]) ---
const SHARE_LINKS_BACKEND_BASE = `${API_PROXY_URL.replace(/\/$/, "")}/share-links`;

async function handleShareLinksProxy(
  request: NextRequest,
  path: string[],
  method: string
): Promise<NextResponse> {
  const code = path[1];
  const backendUrl = code
    ? `${SHARE_LINKS_BACKEND_BASE}/${encodeURIComponent(code)}`
    : SHARE_LINKS_BACKEND_BASE;
  return proxyToBackend(request, backendUrl, method);
}

// --- Generic backend proxy (path = [dwId, ...rest] -> /dw/dwId/rest) ---
async function handleDwIdProxy(
  request: NextRequest,
  path: string[],
  method: string
): Promise<NextResponse> {
  const dwId = path[0];
  const rest = path.slice(1);
  const pathSegment = rest.length ? rest.join("/") : "";
  const search = request.nextUrl.searchParams.toString();
  const dwSegment = dwId ? `/${encodeURIComponent(dwId)}` : "";
  const backendPath = `${DW_PATH_PREFIX}${dwSegment}${pathSegment ? `/${pathSegment}` : ""}${search ? `?${search}` : ""}`;
  const backendUrl = `${API_PROXY_URL.replace(/\/$/, "")}${backendPath}`;
  return proxyToBackend(request, backendUrl, method);
}

async function dispatch(
  request: NextRequest,
  path: string[],
  method: string
): Promise<NextResponse> {
  const segment = path[0]?.toLowerCase();

  if (!segment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  switch (segment) {
    case "health":
      return handleHealth();

    case "auth": {
      const rest = path.slice(1);
      const backendPath = rest.length
        ? `/auth/${rest.map((s) => encodeURIComponent(s)).join("/")}`
        : "/auth";
      const search = request.nextUrl.searchParams.toString();
      const backendUrl = `${API_PROXY_URL.replace(/\/$/, "")}${backendPath}${
        search ? `?${search}` : ""
      }`;
      return proxyToBackend(request, backendUrl, method);
    }

    case "viz-state":
      if (method === "GET") return handleVizStateGet(request);
      if (method === "POST") return handleVizStatePost(request);
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });

    case "dw":
      if (path.length === 1) {
        if (method !== "GET") {
          return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
        }
        const search = request.nextUrl.searchParams.toString();
        const backendUrl = `${API_PROXY_URL.replace(/\/$/, "")}${DW_PATH_PREFIX}${search ? `?${search}` : ""}`;
        return proxyToBackend(request, backendUrl, method);
      }
      if (path.length < 2) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return handleDwProxy(request, path.slice(1), method);

    case "gallery":
      return handleGalleryProxy(request, path, method);

    case "share-links":
      if (method === "POST" || method === "GET")
        return handleShareLinksProxy(request, path, method);
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });

    case "areas":
      if (method === "GET") return handleAreas(request);
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });

    case "indicators":
      if (method !== "GET") {
        return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
      }
      if (path.length >= 2) {
        return handleIndicators(request, path[1]);
      }
      // path = ['indicators']: list endpoint with no dwId -> 400
      return dataWarehouseNotAvailableResponse();

    case "options":
      if (path.length < 2) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (method === "GET") return handleOptions(request, path[1]);
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });

    case "subgroups":
      if (method === "GET") return handleSubgroups(request);
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });

    case "time-periods":
      if (method === "GET") return handleTimePeriods(request);
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });

    case "app-config":
      if (method !== "GET" && method !== "PATCH") {
        return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
      }
      {
        const search = request.nextUrl.searchParams.toString();
        const backendUrl = `${API_PROXY_URL.replace(/\/$/, "")}/app-config${search ? `?${search}` : ""}`;
        return proxyToBackend(request, backendUrl, method);
      }

    case "translations":
      if (!["GET", "PATCH", "POST"].includes(method)) {
        return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
      }
      {
        const rest = path.slice(1);
        const backendPath = rest.length
          ? `/translations/${rest.map((s) => encodeURIComponent(s)).join("/")}`
          : "/translations";
        const search = request.nextUrl.searchParams.toString();
        const backendUrl = `${API_PROXY_URL.replace(/\/$/, "")}${backendPath}${search ? `?${search}` : ""}`;
        return proxyToBackend(request, backendUrl, method);
      }

    case "system-language":
      if (method !== "GET") {
        return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
      }
      {
        const search = request.nextUrl.searchParams.toString();
        const backendUrl = `${API_PROXY_URL.replace(/\/$/, "")}/system-language${search ? `?${search}` : ""}`;
        return proxyToBackend(request, backendUrl, method);
      }

    default:
      // path[0] is dwId -> proxy to /dw/dwId/...
      return handleDwIdProxy(request, path, method);
  }
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const segments = Array.isArray(path) ? path : path ? [path] : [];
  return dispatch(request, segments, "GET");
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const segments = Array.isArray(path) ? path : path ? [path] : [];
  return dispatch(request, segments, "POST");
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const segments = Array.isArray(path) ? path : path ? [path] : [];
  return dispatch(request, segments, "PATCH");
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const segments = Array.isArray(path) ? path : path ? [path] : [];
  return dispatch(request, segments, "DELETE");
}

export async function OPTIONS(_request: NextRequest, context: RouteContext) {
  void context;
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, " + X_APP_KEY_HEADER + ", " + X_APP_SIGNATURE_HEADER + ", " + X_APP_TIMESTAMP_HEADER,
      "Access-Control-Max-Age": "86400",
    },
  });
}
