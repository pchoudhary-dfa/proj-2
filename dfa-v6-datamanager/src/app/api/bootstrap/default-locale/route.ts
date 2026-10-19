import { resolveDefaultAppLocale } from "@/lib/api/core";
import { NextResponse } from "next/server";

/**
 * Default UI locale for middleware (reads app-config LANGUAGE_DEFAULT with signing on the server).
 * Middleware calls this same-origin to avoid duplicating signing in the Edge bundle.
 */
export async function GET() {
  const locale = await resolveDefaultAppLocale();
  return NextResponse.json(
    { locale },
    {
      headers: {
        "Cache-Control": "private, max-age=0, s-maxage=120",
      },
    }
  );
}
