import type { NextRequest } from "next/server";
import { proxyAuthRoute } from "@/lib/sso/server";

export async function GET(request: NextRequest) {
  return proxyAuthRoute(request, "/auth/captcha/challenge");
}
