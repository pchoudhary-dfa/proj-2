import type { NextRequest } from "next/server";
import { handleSessionStatus } from "@/lib/sso/server";

export async function GET(request: NextRequest) {
  return handleSessionStatus(request);
}
