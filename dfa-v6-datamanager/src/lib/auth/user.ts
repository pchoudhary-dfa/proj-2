"use client";

import { API_KEY } from "@/lib/constants";

const AUTH_USER_STORAGE_KEY = "dfa-auth-user";
const DW_PERMISSIONS_STORAGE_KEY = "dfa-dw-permissions";

export type PermissionEntry = {
  resource_code: string;
  name: string;
  permissions: string[];
};

export type RoleEntry = {
  role_id: number;
  role_code: string;
  role_name: string;
  dw_id: number | null;
};

export type WorkflowAccessResourceEntry = {
  content_ids: number[];
  by_workflow?: Record<string, number[]>;
};

export type WorkflowAccessConfig = {
  workflows: string[];
  resources: Record<string, WorkflowAccessResourceEntry>;
  assignments: unknown[];
};

export type AppPermissions = {
  is_super_admin: boolean;
  roles: RoleEntry[];
  resources: PermissionEntry[];
  workflow_access: WorkflowAccessConfig;
};

export type WorkflowMeta = {
  workflow_id: number;
  workflow_code: string;
  workflow_name: string;
  allow_review?: boolean;
};

export type StoredAuthUser = {
  user_id?: number;
  username?: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  auth_provider?: string;
  api_keys?: string[];
  permissions?: Record<string, AppPermissions>;
  meta?: {
    workflow?: Record<string, WorkflowMeta>;
    resources?: Record<string, { resource_code: string; scope_type: string }>;
  };
};

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setStoredAuthUser(user: StoredAuthUser): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}

export function setStoredAuthUserFromLoginResponse(
  response: Record<string, unknown>
): void {
  const user: StoredAuthUser = {
    user_id:
      typeof response.user_id === "number"
        ? response.user_id
        : undefined,
    username:
      typeof response.username === "string"
        ? response.username
        : undefined,
    first_name:
      typeof response.first_name === "string"
        ? response.first_name
        : undefined,
    last_name:
      typeof response.last_name === "string"
        ? response.last_name
        : undefined,
    email:
      typeof response.email === "string"
        ? response.email
        : undefined,
    auth_provider:
      typeof response.auth_provider === "string"
        ? response.auth_provider
        : undefined,
    api_keys: Array.isArray(response.api_keys)
      ? (response.api_keys.filter((item): item is string => typeof item === "string"))
      : undefined,
    permissions:
      typeof response.permissions === "object" && response.permissions !== null
        ? (response.permissions as Record<string, AppPermissions>)
        : undefined,
    meta:
      typeof response.meta === "object" && response.meta !== null
        ? (response.meta as StoredAuthUser["meta"])
        : undefined,
  };
  setStoredAuthUser(user);
}

export function getStoredAuthUser(): StoredAuthUser | null {
  if (typeof window === "undefined") return null;
  return safeParseJson<StoredAuthUser>(
    window.localStorage.getItem(AUTH_USER_STORAGE_KEY)
  );
}

export function clearStoredAuthUser(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export type StoredDwPermissions = { dw_id: string } & AppPermissions;

export function setStoredDwPermissions(
  dwId: string,
  permissions: AppPermissions
): void {
  if (typeof window === "undefined") return;
  try {
    const data: StoredDwPermissions = { dw_id: dwId, ...permissions };
    window.localStorage.setItem(
      DW_PERMISSIONS_STORAGE_KEY,
      JSON.stringify(data)
    );
  } catch {
    /* ignore */
  }
}

export function getStoredDwPermissions(): StoredDwPermissions | null {
  if (typeof window === "undefined") return null;
  return safeParseJson<StoredDwPermissions>(
    window.localStorage.getItem(DW_PERMISSIONS_STORAGE_KEY)
  );
}

export function clearStoredDwPermissions(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DW_PERMISSIONS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function isSsoUser(): boolean {
  const user = getStoredAuthUser();
  if (!user?.auth_provider) return false;
  return user.auth_provider !== "LOCAL";
}

export function getDisplayName(user: StoredAuthUser | null): string {
  if (!user) return "User";
  const first = (user.first_name ?? "").trim();
  const last = (user.last_name ?? "").trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  const username = (user.username ?? "").trim();
  if (username) return username;
  const email = (user.email ?? "").trim();
  if (email) return email;
  return "User";
}

export function getDisplayInitials(displayName: string): string {
  const normalized = displayName.trim();
  if (!normalized) return "U";
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? "U").toUpperCase();
}

export function getStoredAppPermissions(): AppPermissions | null {
  const user = getStoredAuthUser();
  if (!user?.permissions) return null;
  const appKey = API_KEY || "dfa_dm_fed_app";
  const perms = user.permissions[appKey];
  if (!perms) return null;
  return perms;
}

export function getStoredWorkflowCodes(): string[] {
  const dwPerms = getStoredDwPermissions();
  const perms = getStoredAppPermissions();
  const dwCodes = Array.isArray(dwPerms?.workflow_access?.workflows)
    ? dwPerms.workflow_access.workflows
    : [];
  const appCodes = Array.isArray(perms?.workflow_access?.workflows)
    ? perms.workflow_access.workflows
    : [];
  const merged = [...dwCodes, ...appCodes]
    .map((code) => String(code).trim())
    .filter((code) => code.length > 0);
  return Array.from(new Set(merged));
}

function normalizePositiveIntIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const value of raw) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0 || seen.has(parsed)) continue;
    seen.add(parsed);
    out.push(parsed);
  }
  return out;
}

/** Union of DW-scoped and login-stored `content_ids`, deduped. */
function mergeWorkflowResourceContentIds(dw?: number[], app?: number[]): number[] {
  return normalizePositiveIntIds([...(dw ?? []), ...(app ?? [])]);
}

export function isSuperAdmin(): boolean {
  const dwPerms = getStoredDwPermissions();
  if (dwPerms) return dwPerms.is_super_admin === true;
  const perms = getStoredAppPermissions();
  return perms?.is_super_admin === true;
}

export function hasResource(resourceCode: string): boolean {
  if (isSuperAdmin()) return true;
  const dwPerms = getStoredDwPermissions();
  if (dwPerms) {
    return (
      dwPerms.resources?.some((r) => r.resource_code === resourceCode) ??
      false
    );
  }
  const perms = getStoredAppPermissions();
  if (!perms?.resources) return false;
  return perms.resources.some((r) => r.resource_code === resourceCode);
}

export function getUserWorkflowsMeta(): WorkflowMeta[] {
  const codes = getStoredWorkflowCodes();
  if (codes.length === 0) return [];
  const user = getStoredAuthUser();
  const metaMap = user?.meta?.workflow;
  if (!metaMap) return [];
  const out: WorkflowMeta[] = [];
  for (const code of codes) {
    const entry = metaMap[code];
    if (entry && typeof entry.workflow_id === "number") {
      out.push(entry);
    }
  }
  return out;
}

/** Merge DW-scoped and app-level `by_workflow` maps (DW entries override). */
function mergeWorkflowResourceByWorkflow(
  dw?: Record<string, number[]>,
  app?: Record<string, number[]>
): Record<string, number[]> | undefined {
  const dwKeys = dw ? Object.keys(dw) : [];
  const appKeys = app ? Object.keys(app) : [];
  if (dwKeys.length === 0 && appKeys.length === 0) return undefined;
  if (dwKeys.length === 0) return app;
  if (appKeys.length === 0) return dw;
  return { ...app, ...dw };
}

function resolveWorkflowCodeFromStoredMeta(
  workflowId: string | number
): string | null {
  const idNum = Number(workflowId);
  if (!Number.isInteger(idNum) || idNum <= 0) return null;
  const user = getStoredAuthUser();
  const metaMap = user?.meta?.workflow;
  if (!metaMap || typeof metaMap !== "object") return null;
  for (const [code, entry] of Object.entries(metaMap)) {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as WorkflowMeta).workflow_id === "number" &&
      (entry as WorkflowMeta).workflow_id === idNum
    ) {
      const trimmed = String(code).trim();
      return trimmed.length > 0 ? trimmed : null;
    }
  }
  return null;
}

export type StoredWorkflowAreaIdsOptions = {
  /** From workflows API — preferred when known. */
  workflowCode?: string | null;
  /** Numeric id — used with login `meta.workflow` when `workflowCode` is missing. */
  workflowId?: string | number | null;
  /** Defaults to `dm_dw_area`. */
  resourceCode?: string;
};

/**
 * Single entry point: allowed area NIDs from workflow_access for `dm_dw_area`
 * (merged DW + login permissions). With `workflowCode` / `workflowId`, uses
 * `by_workflow[code]` when non-empty; otherwise merged `content_ids`.
 * Omit both code and id → union `content_ids` only (e.g. Areas page).
 */
export function getStoredWorkflowAreaContentIds(
  options?: StoredWorkflowAreaIdsOptions
): number[] {
  const resourceCode = options?.resourceCode ?? "dm_dw_area";
  const dwPerms = getStoredDwPermissions();
  const appPerms = getStoredAppPermissions();
  const dwEntry = dwPerms?.workflow_access?.resources?.[resourceCode];
  const appEntry = appPerms?.workflow_access?.resources?.[resourceCode];
  const mergedUnion = mergeWorkflowResourceContentIds(
    dwEntry?.content_ids,
    appEntry?.content_ids
  );
  const byWorkflow = mergeWorkflowResourceByWorkflow(
    dwEntry?.by_workflow,
    appEntry?.by_workflow
  );

  const explicit =
    typeof options?.workflowCode === "string" ? options.workflowCode.trim() : "";
  let code = explicit;
  if (!code && options?.workflowId != null) {
    const idTrim = String(options.workflowId).trim();
    if (idTrim !== "") {
      code = resolveWorkflowCodeFromStoredMeta(options.workflowId) ?? "";
    }
  }

  if (code && byWorkflow) {
    const perWorkflow = normalizePositiveIntIds(byWorkflow[code]);
    if (perWorkflow.length > 0) return perWorkflow;
  }
  return mergedUnion;
}

// ---------------------------------------------------------------------------
// CRUD-level permission checks
// ---------------------------------------------------------------------------

export type CrudPermission = "C" | "R" | "U" | "D";

export function hasPermission(
  resourceCode: string,
  permission: CrudPermission
): boolean {
  if (isSuperAdmin()) return true;
  const perms = getStoredAppPermissions();
  if (!perms?.resources) return false;
  const resource = perms.resources.find(
    (r) => r.resource_code === resourceCode
  );
  return resource?.permissions?.includes(permission) ?? false;
}

export function hasAnyPermission(resourceCode: string): boolean {
  if (isSuperAdmin()) return true;
  const perms = getStoredAppPermissions();
  if (!perms?.resources) return false;
  const resource = perms.resources.find(
    (r) => r.resource_code === resourceCode
  );
  return (resource?.permissions?.length ?? 0) > 0;
}

export function getResourcePermissions(resourceCode: string): CrudPermission[] {
  if (isSuperAdmin()) return ["C", "R", "U", "D"];
  const perms = getStoredAppPermissions();
  if (!perms?.resources) return [];
  const resource = perms.resources.find(
    (r) => r.resource_code === resourceCode
  );
  return (resource?.permissions ?? []) as CrudPermission[];
}

// ---------------------------------------------------------------------------
// DW-scoped CRUD permission checks
// ---------------------------------------------------------------------------

/**
 * Checks if the current user has a specific CRUD permission for a DW resource.
 * Uses DW-scoped permissions stored in localStorage.
 * 
 * @param resourceCode - DW resource code (e.g., "dm_dw_data_source")
 * @param permission - CRUD permission to check
 * @returns true if user has the permission
 */
export function hasDwPermission(
  resourceCode: string,
  permission: CrudPermission
): boolean {
  if (isSuperAdmin()) return true;
  const dwPerms = getStoredDwPermissions();
  if (!dwPerms?.resources) return false;
  const resource = dwPerms.resources.find(
    (r) => r.resource_code === resourceCode
  );
  return resource?.permissions?.includes(permission) ?? false;
}

/**
 * Check if user has ANY permission on a DW resource (implicit read access).
 * Used for navigation items where having C/U/D implies ability to view the page.
 * 
 * @param resourceCode - DW resource code
 * @returns true if user has any permission (C, R, U, or D)
 */
export function hasAnyDwPermission(resourceCode: string): boolean {
  if (isSuperAdmin()) return true;
  const dwPerms = getStoredDwPermissions();
  if (!dwPerms?.resources) return false;
  const resource = dwPerms.resources.find(
    (r) => r.resource_code === resourceCode
  );
  return (resource?.permissions?.length ?? 0) > 0;
}

/**
 * Gets all CRUD permissions for a DW resource.
 */
export function getDwResourcePermissions(resourceCode: string): CrudPermission[] {
  if (isSuperAdmin()) return ["C", "R", "U", "D"];
  const dwPerms = getStoredDwPermissions();
  if (!dwPerms?.resources) return [];
  const resource = dwPerms.resources.find(
    (r) => r.resource_code === resourceCode
  );
  return (resource?.permissions ?? []) as CrudPermission[];
}

// ---------------------------------------------------------------------------
// Route-to-resource permission mapping (single source of truth)
// ---------------------------------------------------------------------------

/**
 * Datawarehouse-level resource codes mapped to sidebar/page routes.
 * 
 * Pattern:
 * - Parent resources (e.g., dm_dw_data_entry_admin) control section visibility via "R" permission
 * - Child resources (page-level) use C/U/D permissions; implicit read if ANY permission exists
 */
export const DW_ROUTE_PERMISSIONS = {
  template: {
    parent: "dm_dw_template_admin", // Future: section-level read access
    indicators: "dm_dw_indicator",
    units: "dm_dw_unit",
    subgroups: "dm_dw_subgroup",
    classifications: "dm_dw_indicator_classification",
    areas: "dm_dw_area",
  },
  dataManagement: {
    parent: "dm_dw_data_entry_admin", // Section-level read access
    dataEntry: "dm_dw_data_entry",
    dataReview: "dm_dw_data_review",
    timePeriod: "dm_dw_timeperiod",
    sources: "dm_dw_data_source",
    calculateIus: "dm_dw_calculate_ius",
  },
  administration: {
    parent: "dm_dw_administrator", // Future: section-level read access
    workflow: "dm_dw_workflow",
    languages: "dm_dw_languages",
    tools: "dm_dw_tools",
  },
  logs: {
    parent: "dm_dw_logs",
    transactionLogs: "dm_dw_transaction_logs",
  },
  publishData: {
    parent: "publish_data",
    mobileApp: "mobile_app",
  },
  // TODO(backend): Register resource codes "dm_dw_reports" (section) and
  // "dm_dw_data_reports" (page) in the backend IAM before going live.
  // Until then super-admins see the menu; regular users will not because
  // neither resource exists in any role's permission list yet.
  reports: {
    parent: "dm_dw_reports",
    dataReports: "dm_dw_data_reports",
    analyticalReports: "dm_dw_analytical_reports",
    qualityReports: "dm_dw_quality_reports",
  },
} as const;

export const APP_ROUTE_PERMISSIONS = {
  datawarehouse: { view: "sys_dw_management", crud: "sys_datawarehouse" },
  administration: {
    users: { view: "iam_user", crud: "iam_user", drawer: "iam_user_role" },
    roles: { view: "iam_role", crud: "iam_role", drawer: "iam_role_resource" },
    emailTemplates: { view: "sys_email", crud: "sys_email" },
    emailLogs: { view: "sys_email_logs", crud: "sys_email_logs" },
    help: { view: "sys_help_admin" },
  },
  logs: {
    emailLogs: { view: "sys_email_logs" },
    serverErrors: { view: "sys_error_logs" },
  },
  translations: { view: "sys_language_management", crud: "sys_translations" },
  settings: { view: "sys_settings", crud: "sys_settings" },
} as const;

/**
 * Returns resource codes that grant "R" access for the middleware permission
 * summary cookie. Only app-level view resources are included.
 */
export function buildPermissionSummary(): string[] {
  const perms = getStoredAppPermissions();
  if (!perms) return [];
  if (perms.is_super_admin) {
    return [
      APP_ROUTE_PERMISSIONS.datawarehouse.view,
      APP_ROUTE_PERMISSIONS.administration.users.view,
      APP_ROUTE_PERMISSIONS.administration.roles.view,
      APP_ROUTE_PERMISSIONS.administration.emailTemplates.view,
      APP_ROUTE_PERMISSIONS.administration.help.view,
      APP_ROUTE_PERMISSIONS.logs.emailLogs.view,
      APP_ROUTE_PERMISSIONS.logs.serverErrors.view,
      APP_ROUTE_PERMISSIONS.translations.view,
      APP_ROUTE_PERMISSIONS.settings.view,
    ];
  }
  const summary: string[] = [];
  const viewCodes = [
    APP_ROUTE_PERMISSIONS.datawarehouse.view,
    APP_ROUTE_PERMISSIONS.administration.users.view,
    APP_ROUTE_PERMISSIONS.administration.roles.view,
    APP_ROUTE_PERMISSIONS.administration.emailTemplates.view,
    APP_ROUTE_PERMISSIONS.administration.help.view,
    APP_ROUTE_PERMISSIONS.logs.emailLogs.view,
    APP_ROUTE_PERMISSIONS.logs.serverErrors.view,
    APP_ROUTE_PERMISSIONS.translations.view,
    APP_ROUTE_PERMISSIONS.settings.view,
  ];
  for (const code of viewCodes) {
    const resource = perms.resources?.find((r) => r.resource_code === code);
    if (resource?.permissions?.includes("R")) {
      summary.push(code);
    }
  }
  return summary;
}
