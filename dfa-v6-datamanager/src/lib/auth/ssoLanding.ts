"use client";

import { getRequest } from "@/lib/api/http";
import {
  buildLocaleAppPath,
  getAuthMePermissionsUrl,
  getDatawarehousesListUrl,
} from "@/lib/constants";
import type { DatawarehousesListSuccess } from "@/lib/api/types";
import {
  DW_ROUTE_PERMISSIONS,
  setStoredDwPermissions,
  type AppPermissions,
} from "@/lib/auth/user";

type DwPermissionsResponse = {
  success?: boolean;
  data?: {
    is_super_admin?: boolean;
    roles?: AppPermissions["roles"];
    resources?: AppPermissions["resources"];
    workflow_access?: AppPermissions["workflow_access"];
  };
};

async function fetchAccessibleDwIds(): Promise<string[]> {
  const url = `${getDatawarehousesListUrl()}?limit=1000&active_only=true`;
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as DatawarehousesListSuccess;
  if (json?.success !== true || !Array.isArray(json.data)) return [];
  return json.data.map((item) => String(item.id));
}

async function fetchDwPermissions(dwId: string): Promise<AppPermissions | null> {
  const json = (await getRequest(getAuthMePermissionsUrl(dwId), undefined, {
    suppressErrorMessage: true,
  })) as DwPermissionsResponse;
  if (json?.success !== true || !json.data) return null;
  return {
    is_super_admin: json.data.is_super_admin ?? false,
    roles: Array.isArray(json.data.roles) ? json.data.roles : [],
    resources: Array.isArray(json.data.resources) ? json.data.resources : [],
    workflow_access: json.data.workflow_access ?? {
      workflows: [],
      resources: {},
      assignments: [],
    },
  };
}

/** Isolates one DW's permission fetch so a single failure can't poison the rest. */
async function fetchDwPermissionsSafe(
  dwId: string
): Promise<{ dwId: string; perms: AppPermissions } | null> {
  try {
    const perms = await fetchDwPermissions(dwId);
    if (!perms || perms.is_super_admin) return null;
    return { dwId, perms };
  } catch {
    return null;
  }
}

function hasResourceAccess(perms: AppPermissions, resourceCode: string): boolean {
  return perms.resources.some(
    (r) => r.resource_code === resourceCode && r.permissions.length > 0
  );
}

/**
 * SSO-only post-login landing override: sends data-entry/data-review users
 * straight to their dataset page instead of the app's default landing page.
 * Checks DW-scoped resource permissions (not role names, which are
 * admin-configurable per deployment) across every DW the user can access.
 * Data-entry wins over data-review when a user has both; super admins and
 * users with neither resource are left on the caller's default path.
 * Returns null when no override applies.
 */
export async function resolveSsoRoleLandingPath(
  locale: string
): Promise<string | null> {
  try {
    const dwIds = await fetchAccessibleDwIds();
    if (dwIds.length === 0) return null;

    const settled = await Promise.all(dwIds.map(fetchDwPermissionsSafe));
    const dwPermsEntries = settled.filter(
      (entry): entry is { dwId: string; perms: AppPermissions } => entry !== null
    );

    for (const { dwId, perms } of dwPermsEntries) {
      if (hasResourceAccess(perms, DW_ROUTE_PERMISSIONS.dataManagement.dataEntry)) {
        setStoredDwPermissions(dwId, perms);
        return `${buildLocaleAppPath(locale, "data-entry", dwId)}/dataset`;
      }
    }
    for (const { dwId, perms } of dwPermsEntries) {
      if (hasResourceAccess(perms, DW_ROUTE_PERMISSIONS.dataManagement.dataReview)) {
        setStoredDwPermissions(dwId, perms);
        return `${buildLocaleAppPath(locale, "data-review", dwId)}/dataset`;
      }
    }

    return null;
  } catch {
    return null;
  }
}
