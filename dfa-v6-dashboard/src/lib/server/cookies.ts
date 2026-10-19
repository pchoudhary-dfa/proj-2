import type { NextResponse } from "next/server";

import { DFA_ACCESS_COOKIE, DFA_REFRESH_COOKIE } from "@/lib/auth/cookie";

const secure = process.env.NODE_ENV === "production";

/** Align with toolkit-api defaults: ACCESS_TOKEN_EXPIRE_MINUTES=1440, REFRESH_TOKEN_EXPIRE_DAYS=7 */
const ACCESS_COOKIE_MAX_AGE_SEC = 60 * 1440;
const REFRESH_COOKIE_MAX_AGE_SEC = 86400 * 7;

export function applyTokenCookies(
  res: NextResponse,
  accessToken: string,
  refreshToken: string
): void {
  res.cookies.set(DFA_ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: ACCESS_COOKIE_MAX_AGE_SEC,
  });
  res.cookies.set(DFA_REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: REFRESH_COOKIE_MAX_AGE_SEC,
  });
}

export function clearTokenCookies(res: NextResponse): void {
  res.cookies.set(DFA_ACCESS_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: 0,
  });
  res.cookies.set(DFA_REFRESH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: 0,
  });
}
