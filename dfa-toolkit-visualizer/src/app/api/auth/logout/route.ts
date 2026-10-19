import type { NextRequest } from "next/server";
import { handleLogout } from "@/lib/sso/server";

export async function POST(request: NextRequest) {
  return handleLogout(request);
}
