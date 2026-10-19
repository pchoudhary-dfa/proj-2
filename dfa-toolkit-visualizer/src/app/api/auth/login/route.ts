import type { NextRequest } from "next/server";
import { handleLogin } from "@/lib/sso/server";

export async function POST(request: NextRequest) {
  return handleLogin(request);
}
