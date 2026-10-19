import type { NextRequest } from "next/server";
import { handleGetProviders } from "@/lib/sso/server";

export async function GET(request: NextRequest) {
  return handleGetProviders(request);
}
