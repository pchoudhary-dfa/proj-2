import type { NextRequest } from "next/server";
import { proxyAuthRoute } from "@/lib/sso/server";

export async function POST(request: NextRequest) {
  return proxyAuthRoute(request, "/auth/password/reset-request");
}
