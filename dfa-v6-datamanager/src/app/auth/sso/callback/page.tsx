"use client";

import { clearLegacyAuthCookies } from "@/lib/auth/cookie";
import { resolveReturnUrl } from "@/lib/auth/returnUrl";
import { resolveSsoRoleLandingPath } from "@/lib/auth/ssoLanding";
import { setStoredAuthUserFromLoginResponse } from "@/lib/auth/user";
import { FALLBACK_DEFAULT_LOCALE, buildLocaleAppPath } from "@/lib/constants";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function SsoCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const exchanged = useRef(false);

  useEffect(() => {
    if (exchanged.current) return;
    const code = searchParams.get("code");
    if (!code) {
      setError("Missing SSO authorization code.");
      return;
    }
    exchanged.current = true;

    (async () => {
      try {
        let locale = FALLBACK_DEFAULT_LOCALE;
        try {
          const cookie = document.cookie
            .split("; ")
            .find((c) => c.startsWith("NEXT_LOCALE="));
          if (cookie) locale = cookie.split("=")[1] ?? locale;
        } catch {
          /* ignore */
        }

        const fallback = buildLocaleAppPath(locale, "datawarehouse");
        const returnUrl = resolveReturnUrl(searchParams.get("returnUrl"), fallback);

        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            ...(returnUrl !== fallback ? { return_url: returnUrl } : {}),
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const msg =
            body?.err_message ?? body?.detail ?? `SSO login failed (${res.status})`;
          setError(msg);
          return;
        }

        const data = await res.json();
        clearLegacyAuthCookies();
        setStoredAuthUserFromLoginResponse(data as Record<string, unknown>);

        let target = returnUrl;
        if (returnUrl === fallback) {
          const roleLandingPath = await resolveSsoRoleLandingPath(locale);
          if (roleLandingPath) target = roleLandingPath;
        }

        router.replace(target);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "SSO login failed.");
      }
    })();
  }, [searchParams, router]);

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: "1rem", fontFamily: "system-ui, sans-serif" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>SSO Login Failed</h2>
        <p style={{ color: "#666", maxWidth: "28rem", textAlign: "center" }}>{error}</p>
        <a href="/" style={{ color: "#2563eb", textDecoration: "underline" }}>
          Back to login
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: "0.75rem", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ width: "2rem", height: "2rem", border: "3px solid #e5e7eb", borderTopColor: "#2563eb", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <p style={{ color: "#666" }}>Completing SSO login...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
