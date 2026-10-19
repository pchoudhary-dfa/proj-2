"use client";

/**
 * Legacy import hook kept for layout tree ordering. Signing is server-only
 * (proxy on → server; proxy off → browser via NEXT_PUBLIC_API_SIGNATURE + NEXT_PUBLIC_API_SIGNING_PRIVATE_KEY).
 */
import "@/lib/api/signedFetch";

export function SignedFetchProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
