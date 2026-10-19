"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Loader } from "@/components/Loader";
import { resolveReturnUrl } from "@/lib/auth/returnUrl";

/**
 * SSO callback page.
 * After IdP redirects back with a one-time code, this page exchanges it for a session.
 * Tokens are set as httpOnly cookies by the BFF /api/auth/login route.
 */
export default function SsoCallbackPage() {
  const { exchangeSsoCode } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get locale from URL path (e.g., /en/auth/sso/callback)
  const locale = typeof window !== "undefined" ? window.location.pathname.split("/")[1] || "en" : "en";

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      router.replace(`/${locale}/auth?error=missing_code`);
      return;
    }

    (async () => {
      try {
        await exchangeSsoCode(code);
        
        const fallback = `/${locale}`;
        const returnUrl = resolveReturnUrl(searchParams.get("returnUrl"), fallback);
        router.replace(returnUrl);
      } catch (err) {
        console.error("SSO callback error:", err);
        router.replace(`/${locale}/auth?error=sso_failed`);
      }
    })();
  }, [searchParams, exchangeSsoCode, router, locale]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader loadingLabel="Completing sign-in…" />
    </div>
  );
}
