import type { NextRequest } from "next/server";
import { handleRefresh } from "@/lib/sso/server";

export async function POST(request: NextRequest) {
  return handleRefresh(request);
}
