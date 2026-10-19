"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  hasPermission,
  hasAnyPermission,
  type CrudPermission,
} from "@/lib/auth/user";
import { buildLocaleAppPath, FALLBACK_DEFAULT_LOCALE } from "@/lib/constants";

type GuardMode =
  | { mode: "single"; resourceCode: string; permission?: CrudPermission }
  | { mode: "any"; resourceCodes: string[] };

/**
 * Client-side route permission guard.
 * Checks if the user has the required permission on mount.
 * If denied, shows a toast and redirects to the datawarehouse page.
 *
 * @example Single resource check:
 *   const { allowed } = usePermissionGuard("sys_dw_management");
 *
 * @example Any-of check (for pages requiring any one of multiple resources):
 *   const { allowed } = usePermissionGuard({ any: ["iam_user", "iam_role", "sys_email"] });
 */
export function usePermissionGuard(
  resourceOrConfig: string | { any: string[] },
  permission: CrudPermission = "R"
): { allowed: boolean } {
  const router = useRouter();
  const pathname = usePathname();
  const [allowed, setAllowed] = useState<boolean>(true);
  const redirected = useRef(false);

  const guard: GuardMode =
    typeof resourceOrConfig === "string"
      ? { mode: "single", resourceCode: resourceOrConfig, permission }
      : { mode: "any", resourceCodes: resourceOrConfig.any };

  useEffect(() => {
    if (redirected.current) return;

    let hasAccess = false;
    if (guard.mode === "single") {
      hasAccess = hasPermission(guard.resourceCode, guard.permission ?? "R");
    } else {
      hasAccess = guard.resourceCodes.some((code) => hasAnyPermission(code));
    }

    if (!hasAccess) {
      setAllowed(false);
      redirected.current = true;
      toast.error(
        "You do not have permission to access this page"
      );
      const locale =
        pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
      router.replace(buildLocaleAppPath(locale, "datawarehouse"));
    } else {
      setAllowed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { allowed };
}
