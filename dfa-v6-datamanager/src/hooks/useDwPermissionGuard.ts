"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  hasAnyDwPermission,
  hasDwPermission,
  type CrudPermission,
} from "@/lib/auth/user";
import { useSidebarOptional } from "@/contexts/SidebarContext";
import { buildLocaleAppPath, FALLBACK_DEFAULT_LOCALE } from "@/lib/constants";
import { useCore } from "@/contexts/CoreContext";

type DwGuardOptions = {
  /** When provided, access also requires this parent resource to have the given permission. */
  parentResourceCode?: string;
  parentPermission?: CrudPermission;
};

/**
 * Client-side route permission guard for datawarehouse pages.
 *
 * Waits for the Sidebar to finish loading DW permissions (dwPermissionsVersion > 0)
 * before running the check, so it never fires on a stale empty localStorage.
 * Once permissions are loaded, if the user lacks access it shows a toast and
 * redirects to the warehouse overview page.
 *
 * For pages under a section that requires a parent resource check (e.g. Data Management),
 * pass `options.parentResourceCode` to also verify the parent permission.
 *
 * @example Basic usage:
 *   const { allowed } = useDwPermissionGuard(DW_ROUTE_PERMISSIONS.template.indicators);
 *
 * @example With parent check (Data Management pages):
 *   const { allowed } = useDwPermissionGuard(DW_ROUTE_PERMISSIONS.dataManagement.dataEntry, {
 *     parentResourceCode: DW_ROUTE_PERMISSIONS.dataManagement.parent,
 *   });
 */
export function useDwPermissionGuard(
  resourceCode: string,
  options?: DwGuardOptions
): { allowed: boolean } {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const sidebar = useSidebarOptional();
  const dwPermissionsVersion = sidebar?.dwPermissionsVersion ?? 0;
  const [allowed, setAllowed] = useState<boolean>(true);
  const redirected = useRef(false);
  const { t } = useCore();

  useEffect(() => {
    // Wait until the Sidebar has completed at least one DW permissions fetch.
    // dwPermissionsVersion starts at 0 and increments after each successful fetch.
    if (dwPermissionsVersion === 0) return;
    if (redirected.current) return;

    const parentOk = options?.parentResourceCode
      ? hasDwPermission(
          options.parentResourceCode,
          options.parentPermission ?? "R"
        )
      : true;

    const hasAccess = parentOk && hasAnyDwPermission(resourceCode);

    if (!hasAccess) {
      setAllowed(false);
      redirected.current = true;
      toast.error(t("PERMISSION_DENIED_TOAST_MESSAGE"));
      const locale =
        pathname?.split("/").filter(Boolean)[0] ?? FALLBACK_DEFAULT_LOCALE;
      const dwId = params?.dw_id as string | undefined;
      router.replace(buildLocaleAppPath(locale, "overview", dwId));
    } else {
      setAllowed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dwPermissionsVersion]);

  return { allowed };
}
