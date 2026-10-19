"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useCore } from "@/contexts/CoreContext";
import { useSidebar } from "@/contexts/SidebarContext";
import Drawer from "@/components/Drawer";
import { Loader } from "@/components/Loader";
import { Modal } from "@/components/Modal";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PrimarySaveButton } from "@/components/PrimarySaveButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { MainTabsBar } from "@/components/MainTabsBar";
import { SearchInputBar } from "@/components/SearchInputBar";
import { SelectField } from "@/components/SelectField";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import {
  buildListRequestUrl,
  EditableGridColumnDef,
  InlineEditableTable,
  ServerDrivenListTbody,
} from "@/components/TableView";
import type {
  DataEntryConfig,
  DatawarehouseUserListItem,
  DatawarehouseUsersResult,
  FetchDatawarehouseUsersParams,
  IamRoleItem,
  IamRolesFetchResult,
  IamRolesResult,
  ReviewLevelDetailRow,
  UpsertDataEntryPayload,
  UpdateWorkflowPayload,
  WorkflowAreaLevelRaw,
  WorkflowAreaLevelsResult,
  WorkflowConfigTab,
  WorkflowGetByIdResult,
  WorkflowLevelMutationResult,
  WorkflowLevelRaw,
  WorkflowLevelUpsertPayload,
  WorkflowLevelsListResult,
  WorkflowListItem,
  WorkflowMutationResult,
  WorkflowReviewerStageAssignment,
  WorkflowSelectOption,
  WorkflowUserAreaRow,
  WorkflowUserAssignmentItem,
  WorkflowUserAssignmentUpsertItem,
  WorkflowUserAssignmentsUpsertResult,
  WorkflowUserAssignmentsListResult,
  WorkflowUsersSubTab,
  WorkflowUsersViewFilter,
  TimePeriodsListResponse,
} from "@/lib/api/types";
import {
  getRequest,
  postRequest,
  putRequest,
  patchRequest,
  deleteRequest,
} from "@/lib/api/http";
import {
  getApiBaseUrl,
  getDWAPIURL,
  getIamUserApiUrl,
  IAM_ROLES_PATH,
  REFERENCE_PATH_AREA_LEVELS,
  REFERENCE_PATH_AREAS,
  REFERENCE_PATH_TIME_PERIODS,
  REFERENCE_PATH_WORKFLOW,
} from "@/lib/constants";
import type { AreaNode, AreaRaw, AreasListMeta } from "../areas/areasTableShared";
import { mapAreaRaw } from "../areas/areasTableShared";

// =============================================================================
// Constants
// =============================================================================

const MAX_REVIEW_LEVEL_ROWS = 50;
const REVIEW_LEVEL_NAV_COLS = 3;
const WORKFLOW_USERS_AREAS_PAGE_SIZE = 1000;
/** Page size for IAM user list (Users tab). */
const WORKFLOW_USERS_FILTER_STATIC_TEXT_CLASSNAME =
  "flex min-h-8 w-full items-center px-2 text-xs text-text";
const WORKFLOW_USERS_HEADER_ROLE_SPACER_CLASSNAME =
  "block min-h-4 min-w-0";

/** IAM `resource_code` for GET /iam/roles — workflow review / reviewer dropdowns. */
const IAM_ROLES_RESOURCE_DM_DW_DATA_REVIEW = "dm_dw_data_review" as const;
/** IAM `resource_code` for GET /iam/roles — data entry configuration. */
const IAM_ROLES_RESOURCE_DM_DW_DATA_ENTRY = "dm_dw_data_entry" as const;

type IamRolesWorkflowResourceCode =
  | typeof IAM_ROLES_RESOURCE_DM_DW_DATA_REVIEW
  | typeof IAM_ROLES_RESOURCE_DM_DW_DATA_ENTRY;

type WorkflowConfigTabErrorCounts = Record<WorkflowConfigTab, number>;
type ReviewerStageColumnMeta = {
  stageKey: string;
  stageName: string;
  roleId: number;
  roleCode: string;
  roleLabel: string;
};
type NormalizedReviewLevelsInput = {
  value: string;
  count: number;
  isEmpty: boolean;
};

const EMPTY_WORKFLOW_CONFIG_TAB_ERROR_COUNTS: WorkflowConfigTabErrorCounts = {
  workflow: 0,
  data_entry: 0,
  users: 0,
};

function formatIamUserLabel(u: DatawarehouseUserListItem): string {
  const first = (u.first_name ?? "").trim();
  const last = (u.last_name ?? "").trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  const username = (u.username ?? "").trim();
  if (username) return username;
  const email = (u.email ?? "").trim();
  if (email) return email;
  return String(u.id);
}

type IamUserSelectFieldOption = WorkflowSelectOption & {
  optionContent: ReactNode;
  searchText: string;
};

function iamUserSelectOptionsFromList(
  users: DatawarehouseUserListItem[]
): IamUserSelectFieldOption[] {
  return users.map((u) => {
    const first = (u.first_name ?? "").trim();
    const last = (u.last_name ?? "").trim();
    const fullName =
      `${first} ${last}`.trim() || (u.username ?? "").trim() || String(u.id);
    const email = (u.email ?? "").trim();
    const org = (u.organisation ?? "").trim();
    const phone = (u.phone ?? "").trim();
    const loc = (u.location ?? "").trim();
    const row2Parts = [
      { icon: "call", value: phone },
      { icon: "business", value: org },
      { icon: "location_on", value: loc },
    ].filter((part) => part.value);
    const searchText = [fullName, email, org, phone, loc]
      .filter(Boolean)
      .join(" ");
    const optionContent = (
      <span className="flex w-full min-w-0 flex-col gap-0.5 leading-snug">
        <span className="text-xs font-medium text-text">{fullName}</span>
        {row2Parts.length > 0 ? (
          <span className="flex min-w-0 items-center gap-1 text-xs text-text-muted">
            {row2Parts.map((part, index) => (
              <span
                key={`${part.icon}-${part.value}`}
                className="inline-flex min-w-0 items-center gap-0.5"
              >
                {index > 0 ? <span className="text-text-muted">|</span> : null}
                <span
                  className="material-icons text-primary"
                  aria-hidden
                >
                  {part.icon}
                </span>
                <span className="truncate">{part.value}</span>
              </span>
            ))}
          </span>
        ) : null}
        {email ? (
          <span className="inline-flex min-w-0 items-center gap-0.5 text-xs text-text-muted">
            <span
              className="material-icons text-primary"
              aria-hidden
            >
              mail
            </span>
            <span className="truncate">{email}</span>
          </span>
        ) : null}
      </span>
    );
    return {
      value: String(u.id),
      label: fullName,
      searchText,
      optionContent,
    };
  });
}

function normalizeUserRoleCodesForFilter(user: DatawarehouseUserListItem): string[] {
  const rawRoleList: string[] = Array.isArray(user.roles) ? [...user.roles] : [];
  const rawRoleCode = (user as { role_code?: unknown }).role_code;
  if (typeof rawRoleCode === "string") rawRoleList.push(rawRoleCode);
  return [...new Set(rawRoleList.map((code) => code.trim().toLowerCase()).filter(Boolean))];
}

async function fetchWorkflowIamUserList(
  dwId: string,
  params: FetchDatawarehouseUsersParams = {},
): Promise<DatawarehouseUsersResult> {
  const searchParams = new URLSearchParams();
  searchParams.set("dw_id", dwId);
  if (params.page != null) searchParams.set("page", String(params.page));
  if (params.page_size != null) {
    searchParams.set("page_size", String(params.page_size));
  }
  if (params.sort_field) searchParams.set("sort_field", params.sort_field);
  if (params.sort_order) searchParams.set("sort_order", params.sort_order);
  if (params.search != null && params.search !== "") {
    searchParams.set("search", params.search);
  }
  if (params.view) searchParams.set("view", params.view);
  if (params.role_code != null && params.role_code.trim() !== "") {
    searchParams.set("role_code", params.role_code.trim());
  }
  const url = `${getIamUserApiUrl()}?${searchParams.toString()}`;
  const json = await getRequest(url, undefined, { suppressErrorMessage: true });
  return json as DatawarehouseUsersResult;
}

function buildWorkflowLevelNidToIdMap(
  levels: WorkflowAreaLevelRaw[]
): Map<number, string> {
  const m = new Map<number, string>();
  for (const lvl of levels) {
    m.set(lvl.al_level, String(lvl.al_nid));
  }
  return m;
}

function parseWorkflowAreasPage(
  json: unknown,
  levelNidToId: Map<number, string>
):
  | { ok: true; rows: AreaNode[]; meta: AreasListMeta }
  | { ok: false; message: string } {
  const r = json as {
    success?: boolean;
    err_message?: string;
    data?: AreaRaw[];
    meta?: AreasListMeta;
  };
  if (!r || typeof r !== "object" || !r.success) {
    const msg =
      typeof r?.err_message === "string"
        ? r.err_message
        : "Failed to load areas";
    return { ok: false, message: msg };
  }
  const rows = (r.data ?? []).map((raw) => mapAreaRaw(raw, levelNidToId));
  return {
    ok: true,
    rows,
    meta: r.meta ?? {
      total_count: rows.length,
      count: rows.length,
      page: 1,
      page_size: rows.length,
      total_pages: 1,
    },
  };
}

async function fetchAllWorkflowAreasForLevel(
  areasListUrl: string,
  level: number,
  levelNidToId: Map<number, string>
): Promise<{ ok: true; rows: AreaNode[] } | { ok: false; message: string }> {
  const firstUrl = buildListRequestUrl(areasListUrl, {
    hierarchical: false,
    level,
    sort_order: "asc",
    sort_field: "level",
    page: 1,
    page_size: WORKFLOW_USERS_AREAS_PAGE_SIZE,
  });
  let json: unknown;
  try {
    json = await getRequest(firstUrl, undefined, {
      suppressErrorMessage: true,
    });
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to load areas",
    };
  }
  const first = parseWorkflowAreasPage(json, levelNidToId);
  if (!first.ok) return first;
  const allRows = [...first.rows];
  const totalPages = first.meta.total_pages ?? 1;
  for (let p = 2; p <= totalPages; p++) {
    const url = buildListRequestUrl(areasListUrl, {
      hierarchical: false,
      level,
      sort_order: "asc",
      sort_field: "level",
      page: p,
      page_size: WORKFLOW_USERS_AREAS_PAGE_SIZE,
    });
    try {
      const pageJson = await getRequest(url, undefined, {
        suppressErrorMessage: true,
      });
      const parsed = parseWorkflowAreasPage(pageJson, levelNidToId);
      if (!parsed.ok) return parsed;
      allRows.push(...parsed.rows);
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Failed to load areas",
      };
    }
  }
  return { ok: true, rows: allRows };
}

function workflowAreaNodesToUserRows(nodes: AreaNode[]): WorkflowUserAreaRow[] {
  return nodes.map((node) => ({
    id: node.id,
    areaLabel: node.name,
    areaCode: node.keyword,
    userId: "",
    email: "",
    assigned: false,
    parentAreaNid:
      node.parentId != null ? Number(node.parentId) : null,
    assignmentId: undefined,
    baselineUserId: "",
  }));
}

function emptyReviewerStageAssignment(): WorkflowReviewerStageAssignment {
  return {
    userId: "",
    email: "",
    assigned: false,
    assignmentId: undefined,
    baselineUserId: "",
  };
}

function getReviewerStageCell(
  row: WorkflowUserAreaRow,
  stageKey: string
): WorkflowReviewerStageAssignment {
  return row.reviewerAssignments?.[stageKey] ?? emptyReviewerStageAssignment();
}

function mergeAreaRowsWithAssignments(
  rows: WorkflowUserAreaRow[],
  assignments: WorkflowUserAssignmentItem[],
  iamUserById: Map<string, DatawarehouseUserListItem>,
  respectDraftEdits?: boolean
): WorkflowUserAreaRow[] {
  const byContent = new Map<number, WorkflowUserAssignmentItem>();
  for (const a of assignments) {
    if (String(a.scope_type).toUpperCase() === "AREA") {
      byContent.set(a.content_id, a);
    }
  }
  return rows.map((row) => {
    if (respectDraftEdits) {
      const draft = row.userId.trim();
      const baseline = (row.baselineUserId ?? "").trim();
      if (draft !== baseline) return row;
    }
    const nid = Number.parseInt(row.id, 10);
    const a = Number.isFinite(nid) ? byContent.get(nid) : undefined;
    if (!a) {
      return {
        ...row,
        userId: "",
        email: "",
        assigned: false,
        assignmentId: undefined,
        baselineUserId: "",
      };
    }
    const u = iamUserById.get(String(a.user_id));
    const uid = String(a.user_id);
    return {
      ...row,
      userId: uid,
      email: (u?.email ?? "").trim(),
      assigned: true,
      assignmentId: a.id,
      baselineUserId: uid,
    };
  });
}

// =============================================================================
// Module-level API functions & caches (exported where shared with page.tsx)
// =============================================================================

const workflowAreaLevelsCache = new Map<string, WorkflowAreaLevelsResult>();
const workflowAreaLevelsInFlight = new Map<
  string,
  Promise<WorkflowAreaLevelsResult>
>();

export async function fetchWorkflowAreaLevels(
  dwId: string
): Promise<WorkflowAreaLevelsResult> {
  const cached = workflowAreaLevelsCache.get(dwId);
  if (cached) return cached;
  const inFlight = workflowAreaLevelsInFlight.get(dwId);
  if (inFlight) return inFlight;

  const request = (async (): Promise<WorkflowAreaLevelsResult> => {
    const url = getDWAPIURL(dwId, REFERENCE_PATH_AREA_LEVELS);
    const json = (await getRequest(url, undefined, {
      suppressErrorMessage: true,
    })) as Record<string, unknown>;
    if (json.success !== true) {
      return {
        success: false,
        err_message:
          (json.err_message as string | undefined) ?? "Request failed",
      };
    }
    return {
      success: true,
      data: (json.data as WorkflowAreaLevelRaw[] | undefined) ?? [],
    };
  })();

  workflowAreaLevelsInFlight.set(dwId, request);
  try {
    const result = await request;
    if (result.success) workflowAreaLevelsCache.set(dwId, result);
    return result;
  } finally {
    workflowAreaLevelsInFlight.delete(dwId);
  }
}

const iamRolesCache = new Map<string, IamRolesFetchResult>();
const iamRolesInFlight = new Map<string, Promise<IamRolesFetchResult>>();

async function fetchIamRoles(
  resource_code?: IamRolesWorkflowResourceCode
): Promise<IamRolesFetchResult> {
  const cacheKey = resource_code ?? "__all__";
  const cached = iamRolesCache.get(cacheKey);
  if (cached) return cached;
  const inFlight = iamRolesInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const request = (async (): Promise<IamRolesFetchResult> => {
    const params = new URLSearchParams({
      sort_field: "display_order",
      sort_order: "asc",
    });
    if (resource_code) params.set("resource_code", resource_code);
    const query = params.toString();
    const url = `${getApiBaseUrl()}${IAM_ROLES_PATH}?${query}`;
    const json = (await getRequest(url, undefined, {
      suppressErrorMessage: true,
    })) as IamRolesResult;
    if (json.success !== true) {
      return {
        success: false,
        err_message: json.err_message ?? "Failed to load roles",
      };
    }
    return { success: true, data: json.data ?? [] };
  })();

  iamRolesInFlight.set(cacheKey, request);
  try {
    const result = await request;
    if (result.success) iamRolesCache.set(cacheKey, result);
    return result;
  } finally {
    iamRolesInFlight.delete(cacheKey);
  }
}

async function fetchWorkflowById(
  dwId: string,
  workflowId: number
): Promise<WorkflowGetByIdResult> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_WORKFLOW)}/${encodeURIComponent(String(workflowId))}`;
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success !== true) {
    return {
      success: false,
      err_message:
        (json.err_message as string | undefined) ?? "Failed to load workflow",
    };
  }
  return {
    success: true,
    message: json.message as string | undefined,
    data: json.data as WorkflowListItem,
  };
}

function asWorkflowLevels(input: unknown): WorkflowLevelRaw[] {
  if (Array.isArray(input)) return input as WorkflowLevelRaw[];
  if (typeof input !== "object" || input === null) return [];
  const record = input as Record<string, unknown>;
  if (Array.isArray(record.data)) return record.data as WorkflowLevelRaw[];
  return [];
}

function getWorkflowLevelBaseUrl(dwId: string, workflowId: number): string {
  return `${getDWAPIURL(dwId, REFERENCE_PATH_WORKFLOW)}/${encodeURIComponent(String(workflowId))}/level`;
}

function getWorkflowUserAssignmentsUrl(dwId: string, workflowId: number): string {
  return `${getDWAPIURL(dwId, REFERENCE_PATH_WORKFLOW)}/${encodeURIComponent(String(workflowId))}/user-assignments`;
}

function asWorkflowUserAssignments(input: unknown): WorkflowUserAssignmentItem[] {
  if (Array.isArray(input)) return input as WorkflowUserAssignmentItem[];
  return [];
}

async function fetchWorkflowUserAssignments(
  dwId: string,
  workflowId: number,
  params: { role_id: number; scope_type: string }
): Promise<WorkflowUserAssignmentsListResult> {
  const base = getWorkflowUserAssignmentsUrl(dwId, workflowId);
  const sp = new URLSearchParams();
  sp.set("role_id", String(params.role_id));
  sp.set("scope_type", params.scope_type);
  const url = `${base}?${sp.toString()}`;
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success !== true) {
    return {
      success: false,
      err_message:
        (json.err_message as string | undefined) ??
        "Failed to load user assignments",
    };
  }
  return {
    success: true,
    message: json.message as string | undefined,
    data: asWorkflowUserAssignments(json.data),
    meta: (json.meta as Record<string, unknown>) ?? {},
  };
}

async function upsertWorkflowUserAssignments(
  dwId: string,
  workflowId: number,
  payload: WorkflowUserAssignmentUpsertItem[]
): Promise<WorkflowUserAssignmentsUpsertResult> {
  const url = getWorkflowUserAssignmentsUrl(dwId, workflowId);
  const json = (await postRequest(
    url,
    payload as unknown as unknown[],
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as Record<string, unknown>;
  if (json.success !== true) {
    return {
      success: false,
      err_message:
        (json.err_message as string | undefined) ??
        "Failed to save user assignment",
    };
  }
  return {
    success: true,
    message: json.message as string | undefined,
    data: asWorkflowUserAssignments(json.data),
    meta: (json.meta as Record<string, unknown>) ?? {},
  };
}

async function deleteWorkflowUserAssignment(
  dwId: string,
  workflowId: number,
  assignmentId: number
): Promise<WorkflowMutationResult> {
  const url = `${getWorkflowUserAssignmentsUrl(dwId, workflowId)}/${encodeURIComponent(String(assignmentId))}`;
  const json = (await deleteRequest(url, undefined, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success === false) return json as WorkflowMutationResult;
  return {
    success: true,
    message: json.message as string | undefined,
  } as WorkflowMutationResult;
}

function finalizeDeRowsAfterPersist(
  rows: WorkflowUserAreaRow[],
  roleId: number,
  post: WorkflowUserAssignmentsUpsertResult | null,
  iamUserById: Map<string, DatawarehouseUserListItem>
): WorkflowUserAreaRow[] {
  return rows.map((r) => {
    const draft = r.userId.trim();
    const baseline = (r.baselineUserId ?? "").trim();
    if (draft === baseline) return r;
    if (draft === "") {
      return {
        ...r,
        userId: "",
        email: "",
        assigned: false,
        assignmentId: undefined,
        baselineUserId: "",
      };
    }
    const newUid = Number.parseInt(draft, 10);
    if (!Number.isFinite(newUid)) return r;
    const contentNid = Number.parseInt(r.id, 10);
    const created =
      post?.success === true
        ? post.data?.find(
          (a: WorkflowUserAssignmentItem) =>
            a.content_id === contentNid &&
            a.user_id === newUid &&
            a.role_id === roleId
        )
        : undefined;
    const u = iamUserById.get(String(newUid));
    return {
      ...r,
      userId: String(newUid),
      email: (u?.email ?? "").trim(),
      assigned: true,
      assignmentId: created?.id ?? r.assignmentId,
      baselineUserId: String(newUid),
    };
  });
}

/** Single transaction: DELETE then one POST for all Data Entry roles + reviewer stages (avoids last POST overwriting same role_id). */
async function persistAllWorkflowUserAssignmentRows(
  dwId: string,
  workflowId: number,
  options: {
    deRowsByRoleId: Record<number, WorkflowUserAreaRow[]>;
    currentDisplayDeRoleId: number | null;
    setDeRowsByRoleId: (
      value: SetStateAction<Record<number, WorkflowUserAreaRow[]>>
    ) => void;
    setDeRows: (value: SetStateAction<WorkflowUserAreaRow[]>) => void;
    stageColumns: ReviewerStageColumnMeta[];
    roleByStage: Record<string, number>;
    reviewerRows: WorkflowUserAreaRow[];
    setReviewerRows: (value: SetStateAction<WorkflowUserAreaRow[]>) => void;
    iamUserById: Map<string, DatawarehouseUserListItem>;
    iamUsersByRoleCode: Record<string, DatawarehouseUserListItem[]>;
  }
): Promise<{ success: true } | { success: false; err_message: string }> {
  const {
    deRowsByRoleId,
    currentDisplayDeRoleId,
    setDeRowsByRoleId,
    setDeRows,
    stageColumns,
    roleByStage,
    reviewerRows,
    setReviewerRows,
    iamUserById,
    iamUsersByRoleCode,
  } = options;

  const deleteIds: number[] = [];

  for (const [roleIdStr, rows] of Object.entries(deRowsByRoleId)) {
    const roleId = Number(roleIdStr);
    if (!Number.isFinite(roleId) || roleId <= 0) continue;
    for (const row of rows) {
      const draft = row.userId.trim();
      const baseline = (row.baselineUserId ?? "").trim();
      if (draft === baseline) continue;
      const contentNid = Number.parseInt(row.id, 10);
      if (!Number.isFinite(contentNid)) continue;
      if (draft === "") {
        if (row.assignmentId != null) deleteIds.push(row.assignmentId);
        continue;
      }
      const newUid = Number.parseInt(draft, 10);
      if (!Number.isFinite(newUid)) continue;
      if (row.assignmentId != null && baseline !== draft) {
        deleteIds.push(row.assignmentId);
      }
    }
  }

  for (const row of reviewerRows) {
    const contentNid = Number.parseInt(row.id, 10);
    if (!Number.isFinite(contentNid)) continue;
    for (const stage of stageColumns) {
      const roleId = roleByStage[stage.stageKey];
      if (!Number.isFinite(roleId) || roleId <= 0) continue;
      const draftCell = getReviewerStageCell(row, stage.stageKey);
      const draft = draftCell.userId.trim();
      const baseline = (draftCell.baselineUserId ?? "").trim();
      if (draft === baseline) continue;
      if (draft === "") {
        if (draftCell.assignmentId != null) deleteIds.push(draftCell.assignmentId);
        continue;
      }
      const newUid = Number.parseInt(draft, 10);
      if (!Number.isFinite(newUid)) continue;
      if (draftCell.assignmentId != null && baseline !== draft) {
        deleteIds.push(draftCell.assignmentId);
      }
    }
  }

  const uniqueDeleteIds = [...new Set(deleteIds)];
  for (const assignmentId of uniqueDeleteIds) {
    const del = await deleteWorkflowUserAssignment(
      dwId,
      workflowId,
      assignmentId
    );
    if (!del.success) {
      return {
        success: false,
        err_message: del.err_message ?? "Failed to remove assignment",
      };
    }
  }

  const upsertPayload: WorkflowUserAssignmentUpsertItem[] = [];

  for (const [roleIdStr, rows] of Object.entries(deRowsByRoleId)) {
    const roleId = Number(roleIdStr);
    if (!Number.isFinite(roleId) || roleId <= 0) continue;
    for (const row of rows) {
      const draft = row.userId.trim();
      const baseline = (row.baselineUserId ?? "").trim();
      if (draft === baseline) continue;
      const contentNid = Number.parseInt(row.id, 10);
      if (!Number.isFinite(contentNid)) continue;
      if (draft === "") continue;
      const newUid = Number.parseInt(draft, 10);
      if (!Number.isFinite(newUid)) continue;
      upsertPayload.push({
        user_id: newUid,
        role_id: roleId,
        content_nid: contentNid,
        scope_type: "AREA",
        allow_child_areas: false,
      });
    }
  }

  for (const row of reviewerRows) {
    const contentNid = Number.parseInt(row.id, 10);
    if (!Number.isFinite(contentNid)) continue;
    for (const stage of stageColumns) {
      const roleId = roleByStage[stage.stageKey];
      if (!Number.isFinite(roleId) || roleId <= 0) continue;
      const draftCell = getReviewerStageCell(row, stage.stageKey);
      const draft = draftCell.userId.trim();
      const baseline = (draftCell.baselineUserId ?? "").trim();
      if (draft === baseline) continue;
      if (draft === "") continue;
      const newUid = Number.parseInt(draft, 10);
      if (!Number.isFinite(newUid)) continue;
      upsertPayload.push({
        user_id: newUid,
        role_id: roleId,
        content_nid: contentNid,
        scope_type: "AREA",
        allow_child_areas: false,
      });
    }
  }

  let post: WorkflowUserAssignmentsUpsertResult | null = null;
  if (upsertPayload.length > 0) {
    post = await upsertWorkflowUserAssignments(dwId, workflowId, upsertPayload);
    if (!post.success) {
      return {
        success: false,
        err_message: post.err_message ?? "Failed to save assignment",
      };
    }
  }

  if (Object.keys(deRowsByRoleId).length > 0) {
    const nextMap: Record<number, WorkflowUserAreaRow[]> = {};
    for (const [roleIdStr, rows] of Object.entries(deRowsByRoleId)) {
      const roleId = Number(roleIdStr);
      if (!Number.isFinite(roleId) || roleId <= 0) continue;
      nextMap[roleId] = finalizeDeRowsAfterPersist(rows, roleId, post, iamUserById);
    }
    setDeRowsByRoleId(nextMap);
    if (
      currentDisplayDeRoleId != null &&
      nextMap[currentDisplayDeRoleId] != null
    ) {
      setDeRows(nextMap[currentDisplayDeRoleId]!.map((r) => ({ ...r })));
    }
  }

  if (stageColumns.length > 0) {
    setReviewerRows((prev) =>
      prev.map((r) => {
        let next = r;
        for (const stage of stageColumns) {
          const roleId = roleByStage[stage.stageKey];
          if (!Number.isFinite(roleId) || roleId <= 0) continue;
          const draftCell = getReviewerStageCell(next, stage.stageKey);
          const draft = draftCell.userId.trim();
          const baseline = (draftCell.baselineUserId ?? "").trim();
          if (draft === baseline) continue;

          if (draft === "") {
            next = {
              ...next,
              reviewerAssignments: {
                ...(next.reviewerAssignments ?? {}),
                [stage.stageKey]: emptyReviewerStageAssignment(),
              },
            };
            continue;
          }

          const newUid = Number.parseInt(draft, 10);
          if (!Number.isFinite(newUid)) continue;

          const contentNid = Number.parseInt(next.id, 10);
          const created =
            post?.success === true
              ? post.data?.find(
                (a: WorkflowUserAssignmentItem) =>
                  a.content_id === contentNid &&
                  a.user_id === newUid &&
                  a.role_id === roleId
              )
              : undefined;
          const userList = iamUsersByRoleCode[stage.roleCode] ?? [];
          const user = userList.find((item) => String(item.id) === String(newUid));
          next = {
            ...next,
            reviewerAssignments: {
              ...(next.reviewerAssignments ?? {}),
              [stage.stageKey]: {
                userId: String(newUid),
                email: (user?.email ?? "").trim(),
                assigned: true,
                assignmentId:
                  created?.id ??
                  getReviewerStageCell(next, stage.stageKey).assignmentId,
                baselineUserId: String(newUid),
              },
            },
          };
        }
        return next;
      })
    );
  }

  return { success: true };
}

async function fetchWorkflowLevels(
  dwId: string,
  workflowId: number
): Promise<WorkflowLevelsListResult> {
  const url = getWorkflowLevelBaseUrl(dwId, workflowId);
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success !== true) {
    return {
      success: false,
      err_message:
        (json.err_message as string | undefined) ??
        "Failed to load workflow levels",
    };
  }
  return {
    success: true,
    message: json.message as string | undefined,
    data: asWorkflowLevels(json.data),
  };
}

async function upsertWorkflowLevels(
  dwId: string,
  workflowId: number,
  payload: WorkflowLevelUpsertPayload[]
): Promise<WorkflowLevelMutationResult> {
  const url = getWorkflowLevelBaseUrl(dwId, workflowId);
  const json = (await postRequest(
    url,
    payload as unknown as unknown[],
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as Record<string, unknown>;
  if (json.success !== true) {
    return {
      success: false,
      err_message:
        (json.err_message as string | undefined) ??
        "Failed to save workflow levels",
    };
  }
  return {
    success: true,
    message: json.message as string | undefined,
    data: asWorkflowLevels(json.data),
  };
}

async function removeWorkflowLevel(
  dwId: string,
  workflowId: number,
  levelId: number
): Promise<WorkflowMutationResult> {
  const url = `${getWorkflowLevelBaseUrl(dwId, workflowId)}/${encodeURIComponent(String(levelId))}`;
  const json = (await deleteRequest(url, undefined, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success === false) return json as WorkflowMutationResult;
  return {
    success: true,
    message: json.message as string | undefined,
  } as WorkflowMutationResult;
}

async function updateWorkflow(
  dwId: string,
  workflowId: number,
  payload: UpdateWorkflowPayload
): Promise<WorkflowMutationResult> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_WORKFLOW)}/${encodeURIComponent(String(workflowId))}`;
  const json = await patchRequest(
    url,
    payload as unknown as Record<string, unknown>,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  );
  return json as WorkflowMutationResult;
}

function normalizeDataEntryTimeperiodFrequency(
  value: string | null | undefined
): string {
  const raw = (value ?? "").trim();
  if (!raw) return "ALL";
  const upper = raw.toUpperCase();
  if (upper === "ALL") return "ALL";
  if (upper === "MONTHLY") return "M";
  if (upper === "QUARTERLY") return "Q";
  if (["A", "M", "Q", "H", "D", "F"].includes(upper)) return upper;
  return "ALL";
}

type WorkflowDeTimePeriodOption = {
  nid: number;
  label: string;
  periodicity: string | null;
};

function workflowDeTimePeriodLabel(raw: Record<string, unknown>, nid: number): string {
  const tp = raw.tp_timeperiod ?? raw.timeperiod;
  if (typeof tp === "string" && tp.trim()) return tp.trim();
  return String(nid);
}

function normalizeWorkflowDeTimePeriodItem(
  raw: Record<string, unknown>
): WorkflowDeTimePeriodOption | null {
  const idRaw = raw.id ?? raw.timeperiod_nid ?? raw.tp_nid;
  let nid: number | undefined;
  if (typeof idRaw === "number" && Number.isFinite(idRaw) && idRaw > 0) {
    nid = Math.trunc(idRaw);
  } else if (typeof idRaw === "string" && idRaw.trim() !== "") {
    const parsed = Number.parseInt(idRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) nid = parsed;
  }
  if (nid == null) return null;
  const periodicityRaw = raw.tp_periodicity ?? raw.periodicity;
  const periodicity =
    typeof periodicityRaw === "string" && periodicityRaw.trim()
      ? periodicityRaw.trim().toUpperCase()
      : null;
  return {
    nid,
    label: workflowDeTimePeriodLabel(raw, nid),
    periodicity,
  };
}

function filterWorkflowDeTimePeriodsByFrequency(
  items: WorkflowDeTimePeriodOption[],
  frequency: string
): WorkflowDeTimePeriodOption[] {
  const freq = normalizeDataEntryTimeperiodFrequency(frequency);
  if (freq === "ALL") return items;
  return items.filter((item) => (item.periodicity ?? "").toUpperCase() === freq);
}

function pickLatestWorkflowDeTimePeriodNid(
  items: WorkflowDeTimePeriodOption[]
): string {
  if (items.length === 0) return "";
  return String(items[items.length - 1]!.nid);
}

function parseWorkflowDeTimePeriodNid(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

async function getWorkflowDataEntry(
  dwId: string,
  workflowId: number
): Promise<{ success: boolean; message?: string; data?: DataEntryConfig; err_message?: string }> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_WORKFLOW)}/${encodeURIComponent(String(workflowId))}/dataentry?include_workflow=true`;
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success !== true) {
    return {
      success: false,
      err_message:
        (json.err_message as string | undefined) ??
        "Failed to load data entry config",
    };
  }
  return {
    success: true,
    message: json.message as string | undefined,
    data: json.data as DataEntryConfig | undefined,
  };
}

async function upsertWorkflowDataEntry(
  dwId: string,
  workflowId: number,
  payload: UpsertDataEntryPayload
): Promise<{ success: boolean; message?: string; err_message?: string }> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_WORKFLOW)}/${encodeURIComponent(String(workflowId))}/dataentry`;
  const json = (await putRequest(
    url,
    payload as unknown as Record<string, unknown>,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as Record<string, unknown>;
  if (json.success !== true) {
    return {
      success: false,
      err_message:
        (json.err_message as string | undefined) ??
        "Failed to save data entry config",
    };
  }
  return {
    success: true,
    message: json.message as string | undefined,
  };
}

// =============================================================================
// Pure helpers (exported where shared with page.tsx)
// =============================================================================

export function parseReviewLevelCountInput(raw: string): {
  count: number;
  normalized: string;
  isEmpty: boolean;
  isInvalid: boolean;
} {
  const t = raw.trim();
  if (t === "") {
    return { count: 0, normalized: "", isEmpty: true, isInvalid: false };
  }
  if (!/^\d+$/.test(t)) {
    return { count: 0, normalized: t, isEmpty: false, isInvalid: true };
  }
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || n < 0) {
    return { count: 0, normalized: t, isEmpty: false, isInvalid: true };
  }
  return { count: n, normalized: String(n), isEmpty: false, isInvalid: false };
}

function emptyReviewLevelRow(): ReviewLevelDetailRow {
  return { name: "", scope: "AREA", areaLevel: "", reviewerRole: "" };
}

function pickMappedSelectValue(
  value: string | null | undefined,
  options: Array<{ value: string }>
): string {
  const selected = (value ?? "").trim();
  if (!selected) return "";
  return options.some((option) => option.value === selected) ? selected : "";
}

function normalizeNonPositiveSelectValue(
  value: string | null | undefined,
  allowReview: boolean,
): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  if (trimmed === DATA_ENTRY_AREA_LEVEL_ANY) return DATA_ENTRY_AREA_LEVEL_ANY;
  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isFinite(parsed) && parsed <= 0) {
    return allowReview ? "" : DATA_ENTRY_AREA_LEVEL_ANY;
  }
  return trimmed;
}

// =============================================================================
// Types
// =============================================================================

type WorkflowReviewLevelTrimPending = {
  previousValue: string;
  nextValue: string;
  nextCount: number;
  removedCount: number;
};

type WorkflowUsersFiltersState = {
  role: string;
  areaLevel: string;
  area: string;
  filterUserId: string;
  viewFilter: WorkflowUsersViewFilter;
  searchArea: string;
};

const DATA_ENTRY_AREA_LEVEL_ANY = "ANY";

function createDefaultUsersFiltersState(): WorkflowUsersFiltersState {
  return {
    role: "",
    areaLevel: "",
    area: "all",
    filterUserId: "",
    viewFilter: "all",
    searchArea: "",
  };
}

export type WorkFlowSettingsComponentProps = {
  open: boolean;
  workflowId: number | null;
  workflowIsPending?: boolean;
  onClose: () => void;
  onSaved: () => void;
};

// =============================================================================
// Presentational helpers
// =============================================================================

const Mi = ({ name, className = "" }: { name: string; className?: string }) => (
  <span className={`material-icons ${className}`.trim()} aria-hidden>
    {name}
  </span>
);

// =============================================================================
// Component
// =============================================================================

export function WorkFlowSettingsComponent({
  open,
  workflowId,
  workflowIsPending,
  onClose,
  onSaved,
}: WorkFlowSettingsComponentProps) {
  const { dwId } = useSidebar();
  const { t } = useCore();

  const areasListUrl = useMemo(
    () => (dwId ? getDWAPIURL(dwId, REFERENCE_PATH_AREAS) : ""),
    [dwId]
  );

  const configPanelRef = useRef<HTMLDivElement>(null);
  const reviewAddNameInputRef = useRef<HTMLInputElement>(null);
  const usersAreasFetchSeqRef = useRef(0);
  const usersAssignmentsFetchSeqRef = useRef(0);

  // ---------------------------------------------------------------------------
  // Workflow data (fetched via GET by ID)
  // ---------------------------------------------------------------------------
  const [workflowData, setWorkflowData] = useState<WorkflowListItem | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Area levels & roles
  // ---------------------------------------------------------------------------
  const [workflowAreaLevels, setWorkflowAreaLevels] = useState<WorkflowAreaLevelRaw[]>([]);
  const [workflowAreaLevelsLoaded, setWorkflowAreaLevelsLoaded] = useState(false);
  const [reviewerRoles, setReviewerRoles] = useState<IamRoleItem[]>([]);
  const [reviewerRolesLoading, setReviewerRolesLoading] = useState(false);
  const [dataEntryRoles, setDataEntryRoles] = useState<IamRoleItem[]>([]);
  const [dataEntryRolesLoading, setDataEntryRolesLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Drawer form (Workflow tab)
  // ---------------------------------------------------------------------------
  const [configTab, setConfigTab] = useState<WorkflowConfigTab>("workflow");
  const [configTabErrorCounts, setConfigTabErrorCounts] =
    useState<WorkflowConfigTabErrorCounts>(
      EMPTY_WORKFLOW_CONFIG_TAB_ERROR_COUNTS
    );
  const [configSaving, setConfigSaving] = useState(false);
  const [panelWfName, setPanelWfName] = useState("");
  const [panelWfActive, setPanelWfActive] = useState(false);
  const [panelWfAllowReview, setPanelWfAllowReview] = useState(false);
  const [panelWfReviewLevels, setPanelWfReviewLevels] = useState("");
  const [panelWfReviewLevelsInput, setPanelWfReviewLevelsInput] = useState("");

  // ---------------------------------------------------------------------------
  // Review levels
  // ---------------------------------------------------------------------------
  const [reviewLevelRows, setReviewLevelRows] = useState<ReviewLevelDetailRow[]>([]);
  const [initialReviewLevelRows, setInitialReviewLevelRows] = useState<ReviewLevelDetailRow[]>([]);
  const [editingReviewNameCell, setEditingReviewNameCell] = useState<number | null>(null);
  const [editingReviewLevelRowIndex, setEditingReviewLevelRowIndex] = useState<number | null>(null);
  const [editingReviewLevelOriginalRow, setEditingReviewLevelOriginalRow] = useState<ReviewLevelDetailRow | null>(null);
  const [reviewAddRowExpanded, setReviewAddRowExpanded] = useState(false);
  const [reviewLevelDraftRow, setReviewLevelDraftRow] = useState<ReviewLevelDetailRow>(emptyReviewLevelRow);
  const [reviewLevelsLoading, setReviewLevelsLoading] = useState(false);
  const [reviewLevelsSaving, setReviewLevelsSaving] = useState(false);
  const [reviewLevelTrimConfirmOpen, setReviewLevelTrimConfirmOpen] = useState(false);
  const [pendingReviewLevelTrim, setPendingReviewLevelTrim] = useState<WorkflowReviewLevelTrimPending | null>(null);
  const [pendingReviewLevelDeletes, setPendingReviewLevelDeletes] = useState<number[]>([]);
  const [userDeleteConfirmOpen, setUserDeleteConfirmOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Data entry tab
  // ---------------------------------------------------------------------------
  const [deApplyConstraints, setDeApplyConstraints] = useState(false);
  const [deTimePeriodFrequency, setDeTimePeriodFrequency] = useState("ALL");
  const [deCurrTimePeriodNid, setDeCurrTimePeriodNid] = useState("");
  const [deAllTimePeriods, setDeAllTimePeriods] = useState<WorkflowDeTimePeriodOption[]>(
    []
  );
  const [deTimePeriodsLoading, setDeTimePeriodsLoading] = useState(false);
  const [deLowerAreaLevel, setDeLowerAreaLevel] = useState("");
  const [deAllowChildrenArea, setDeAllowChildrenArea] = useState(false);
  const [deAreaLevelError, setDeAreaLevelError] = useState("");
  const [deCurrTimePeriodError, setDeCurrTimePeriodError] = useState("");
  const [deFormTimePeriod, setDeFormTimePeriod] = useState("");
  const [deFormArea, setDeFormArea] = useState("");
  const [deFormIndicator, setDeFormIndicator] = useState("");
  const [deShowPreviousTime, setDeShowPreviousTime] = useState(false);
  const initialDeConfigRef = useRef<{
    timeperiod_frequency: string;
    curr_timeperiod_nid: string;
    area_level: string;
    allow_child_areas: boolean;
    scope_timeperiod: string;
    scope_area: string;
    scope_indicator: string;
    show_previous_time: boolean;
  } | null>(null);

  // ---------------------------------------------------------------------------
  // Users tab
  // ---------------------------------------------------------------------------
  const [usersSubTab, setUsersSubTab] = useState<WorkflowUsersSubTab>("data_entry");
  const [usersRole, setUsersRole] = useState("");
  const [usersAreaLevel, setUsersAreaLevel] = useState("");
  const [usersArea, setUsersArea] = useState("all");
  const [usersFilterUserId, setUsersFilterUserId] = useState("");
  const [reviewerStageFilterUserIds, setReviewerStageFilterUserIds] = useState<
    Record<string, string>
  >({});
  const [usersViewFilter, setUsersViewFilter] = useState<WorkflowUsersViewFilter>("all");
  const [allDataEntryIamUsers, setAllDataEntryIamUsers] = useState<DatawarehouseUserListItem[]>(
    []
  );
  const [iamUsers, setIamUsers] = useState<DatawarehouseUserListItem[]>([]);
  const [reviewerIamUsersByRoleCode, setReviewerIamUsersByRoleCode] = useState<
    Record<string, DatawarehouseUserListItem[]>
  >({});
  const iamUsersRef = useRef(iamUsers);
  iamUsersRef.current = iamUsers;
  const reviewerIamUsersByRoleCodeRef = useRef(reviewerIamUsersByRoleCode);
  reviewerIamUsersByRoleCodeRef.current = reviewerIamUsersByRoleCode;
  const [iamUsersLoading, setIamUsersLoading] = useState(false);
  const [deUserRows, setDeUserRows] = useState<WorkflowUserAreaRow[]>([]);
  /** Cached Data Entry grid per IAM role id so switching roles / Save keeps all roles' edits. */
  const [deUserRowsByRoleId, setDeUserRowsByRoleId] = useState<
    Record<number, WorkflowUserAreaRow[]>
  >({});
  const deUserRowsRef = useRef(deUserRows);
  deUserRowsRef.current = deUserRows;
  const deUserRowsByRoleIdRef = useRef(deUserRowsByRoleId);
  deUserRowsByRoleIdRef.current = deUserRowsByRoleId;
  const prevUsersRoleForDeSnapshotRef = useRef(usersRole);
  const [reviewerUserRows, setReviewerUserRows] = useState<WorkflowUserAreaRow[]>([]);
  const [usersParentAreaOptions, setUsersParentAreaOptions] = useState<
    WorkflowSelectOption[]
  >([]);
  const [usersAreasLoading, setUsersAreasLoading] = useState(false);
  const [usersTableSelected, setUsersTableSelected] = useState<Set<string>>(() => new Set());
  const [usersSearchArea, setUsersSearchArea] = useState("");
  const usersFiltersBySubTabRef = useRef<
    Record<WorkflowUsersSubTab, WorkflowUsersFiltersState>
  >({
    data_entry: createDefaultUsersFiltersState(),
    reviewers: createDefaultUsersFiltersState(),
  });
  /** Role id used when assignments were last merged from GET (per sub-tab); drives Save payload. */
  const [deUserAssignmentsRoleId, setDeUserAssignmentsRoleId] = useState<
    number | null
  >(null);
  const [reviewerUserAssignmentsRoleByStage, setReviewerUserAssignmentsRoleByStage] =
    useState<Record<string, number>>({});

  /** Refs for User-column `SelectField` elements (arrow-key navigation between rows). */
  const workflowUsersSelectRefMap = useRef(
    new Map<string, HTMLButtonElement>()
  );

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const maxReviewLevelsByAreaCount = useMemo(
    () => Math.min(MAX_REVIEW_LEVEL_ROWS, workflowAreaLevels.length),
    [workflowAreaLevels.length]
  );
  const isWorkflowPendingReadonly = Boolean(
    workflowIsPending
  );

  const reviewLevelsCountOptions = useMemo(
    () =>
      Array.from({ length: maxReviewLevelsByAreaCount }, (_, index) => ({
        value: String(index + 1),
        label: String(index + 1),
      })),
    [maxReviewLevelsByAreaCount]
  );

  const normalizeReviewLevelsInput = useCallback(
    (
      raw: string,
      options?: { notify?: boolean }
    ): { value: string; count: number; isEmpty: boolean } => {
      const notify = options?.notify === true;
      const requireMinOne = panelWfAllowReview;
      if (notify && !workflowAreaLevelsLoaded) {
        toast.error(t("AREAS_LOAD_LEVELS_FAILED"));
        return { value: "", count: 0, isEmpty: true };
      }
      const parsed = parseReviewLevelCountInput(raw);
      if (parsed.isInvalid) {
        if (notify) toast.error(t("REVIEW_STAGE_INVALID"));
        return { value: "", count: 0, isEmpty: true };
      }
      if (parsed.isEmpty) {
        if (requireMinOne) {
          const cap = workflowAreaLevelsLoaded
            ? maxReviewLevelsByAreaCount
            : MAX_REVIEW_LEVEL_ROWS;
          if (cap < 1) {
            if (notify) toast.error(t("AREAS_LOAD_LEVELS_FAILED"));
            return { value: "", count: 0, isEmpty: true };
          }
          return { value: "1", count: 1, isEmpty: false };
        }
        return { value: "", count: 0, isEmpty: true };
      }

      const cap = workflowAreaLevelsLoaded
        ? maxReviewLevelsByAreaCount
        : MAX_REVIEW_LEVEL_ROWS;
      let bounded = Math.min(parsed.count, cap);
      if (requireMinOne && cap >= 1) {
        bounded = Math.max(1, bounded);
      }
      if (bounded !== parsed.count && notify) {
        toast.error(
          `${t("REVIEW_STAGE_MAX_EXCEEDED")} (${maxReviewLevelsByAreaCount})`
        );
      }
      return { value: String(bounded), count: bounded, isEmpty: false };
    },
    [
      maxReviewLevelsByAreaCount,
      panelWfAllowReview,
      t,
      workflowAreaLevelsLoaded,
    ]
  );

  const reviewerRoleOptions = useMemo<WorkflowSelectOption[]>(
    () =>
      reviewerRoles.map((role) => ({
        value: String(role.id),
        label: role.name?.trim() || role.role_code,
      })),
    [reviewerRoles]
  );

  const reviewerStageColumns = useMemo<ReviewerStageColumnMeta[]>(() => {
    const byRoleId = new Map<string, IamRoleItem>();
    for (const role of reviewerRoles) {
      byRoleId.set(String(role.id), role);
    }
    return reviewLevelRows
      .map((row, index) => {
        const roleIdRaw = row.reviewerRole.trim();
        const roleId = Number.parseInt(roleIdRaw, 10);
        if (!Number.isFinite(roleId) || roleId <= 0) return null;
        const role = byRoleId.get(String(roleId));
        const roleCode = (role?.role_code ?? "").trim();
        if (!roleCode) return null;
        const stageName = row.name.trim() || `${t("REVIEW_STAGE")} ${index + 1}`;
        return {
          stageKey: String(row.levelId ?? index + 1),
          stageName,
          roleId,
          roleCode,
          roleLabel: role?.name?.trim() || roleCode,
        } satisfies ReviewerStageColumnMeta;
      })
      .filter((row): row is ReviewerStageColumnMeta => row != null);
  }, [reviewLevelRows, reviewerRoles, t]);

  const reviewerStageColumnsRef = useRef(reviewerStageColumns);
  reviewerStageColumnsRef.current = reviewerStageColumns;

  const reviewerStageRoleCodesKey = useMemo(
    () =>
      [...new Set(reviewerStageColumns.map((s) => s.roleCode))]
        .filter(Boolean)
        .sort()
        .join(","),
    [reviewerStageColumns]
  );

  const reviewerStageRoleIdsKey = useMemo(
    () =>
      [...new Set(reviewerStageColumns.map((s) => s.roleId))]
        .filter((id) => Number.isFinite(id) && id > 0)
        .sort((a, b) => a - b)
        .join(","),
    [reviewerStageColumns]
  );

  const usersRoleOptions = useMemo(
    () =>
      dataEntryRoles
        .filter((role) => (role.role_code ?? "").trim() !== "")
        .map((role) => ({
          id: role.id,
          value: (role.role_code ?? "").trim(),
          label: role.name?.trim() || role.role_code,
        })),
    [dataEntryRoles]
  );

  const dataEntryAreaLevelOptions = useMemo<WorkflowSelectOption[]>(() => {
    const options = workflowAreaLevels.map((level) => ({
      value: String(level.al_nid),
      label: level.al_name,
    }));
    return panelWfAllowReview
      ? options
      : [{ value: DATA_ENTRY_AREA_LEVEL_ANY, label: t("ANY") }, ...options];
  }, [panelWfAllowReview, t, workflowAreaLevels]);

  const normalizeAreaLevelSelection = useCallback(
    (value: string): string => {
      const trimmed = normalizeNonPositiveSelectValue(value, panelWfAllowReview);
      if (!trimmed) return "";
      if (trimmed === DATA_ENTRY_AREA_LEVEL_ANY) return DATA_ENTRY_AREA_LEVEL_ANY;
      if (workflowAreaLevels.some((level) => String(level.al_nid) === trimmed)) {
        return trimmed;
      }
      const parsed = Number.parseInt(trimmed, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) return "";
      const matchedByLevel = workflowAreaLevels.find(
        (level) => level.al_level === parsed
      );
      return matchedByLevel ? String(matchedByLevel.al_nid) : "";
    },
    [workflowAreaLevels, panelWfAllowReview]
  );

  const getAreaLevelPayloadValue = useCallback(
    (value: string): number => {
      const trimmed = value.trim();
      if (!trimmed) return 0;
      if (trimmed === DATA_ENTRY_AREA_LEVEL_ANY) return 0;
      const matched = workflowAreaLevels.find(
        (level) => String(level.al_nid) === trimmed
      );
      if (matched) return matched.al_level;
      const parsed = Number.parseInt(trimmed, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    },
    [workflowAreaLevels]
  );

  const lockedDataEntryUsersAreaLevel = useMemo(() => {
    const levelNid = deLowerAreaLevel.trim();
    if (!levelNid) return "";
    return workflowAreaLevels.some((level) => String(level.al_nid) === levelNid)
      ? levelNid
      : "";
  }, [deLowerAreaLevel, workflowAreaLevels]);

  useEffect(() => {
    if (!workflowAreaLevelsLoaded) return;
    setDeLowerAreaLevel((prev) => normalizeAreaLevelSelection(prev));
    if (initialDeConfigRef.current) {
      initialDeConfigRef.current = {
        ...initialDeConfigRef.current,
        area_level: normalizeAreaLevelSelection(initialDeConfigRef.current.area_level),
      };
    }
  }, [workflowAreaLevelsLoaded, normalizeAreaLevelSelection]);

  useEffect(() => {
    if (!panelWfAllowReview) return;
    if (deLowerAreaLevel !== DATA_ENTRY_AREA_LEVEL_ANY) return;
    setDeLowerAreaLevel("");
  }, [panelWfAllowReview, deLowerAreaLevel]);

  useEffect(() => {
    if (deApplyConstraints || panelWfAllowReview) return;
    if (deAreaLevelError) setDeAreaLevelError("");
  }, [deApplyConstraints, panelWfAllowReview, deAreaLevelError]);

  const isUsersAreaLevelLocked = lockedDataEntryUsersAreaLevel !== "";

  /** Selected Role dropdown stores IAM `role_code`; IAM user list is filtered by this code. */
  const usersSelectedRoleCode = useMemo(() => {
    if (usersSubTab !== "data_entry") return "";
    const code = usersRole.trim();
    if (!code) return "";
    return usersRoleOptions.some((role) => role.value === code)
      ? code
      : "";
  }, [usersSubTab, usersRole, usersRoleOptions]);

  const filteredDataEntryIamUsers = useMemo(() => {
    if (usersSelectedRoleCode === "") return allDataEntryIamUsers;
    const selectedCode = usersSelectedRoleCode.trim().toLowerCase();
    return allDataEntryIamUsers.filter((user) =>
      normalizeUserRoleCodesForFilter(user).includes(selectedCode)
    );
  }, [allDataEntryIamUsers, usersSelectedRoleCode]);

  const usersAreaLevelOptions = useMemo<WorkflowSelectOption[]>(() => {
    if (lockedDataEntryUsersAreaLevel) {
      const selectedLevel = workflowAreaLevels.find(
        (level) => String(level.al_nid) === lockedDataEntryUsersAreaLevel
      );
      if (selectedLevel) {
        return [
          {
            value: String(selectedLevel.al_nid),
            label: selectedLevel.al_name,
          },
        ];
      }
    }
    return workflowAreaLevels.map((level) => ({
      value: String(level.al_nid),
      label: level.al_name,
    }));
  }, [lockedDataEntryUsersAreaLevel, workflowAreaLevels]);

  const usersSelectedAreaLevel = useMemo(
    () => workflowAreaLevels.find((level) => String(level.al_nid) === usersAreaLevel),
    [workflowAreaLevels, usersAreaLevel]
  );

  const usersParentAreaLevelLabel = useMemo(() => {
    if (!usersSelectedAreaLevel) return t("AREA");
    const parentLevel = workflowAreaLevels.find(
      (level) => level.al_level === usersSelectedAreaLevel.al_level - 1
    );
    if (parentLevel) return parentLevel.al_name;
    return usersSelectedAreaLevel.al_name || t("AREA");
  }, [usersSelectedAreaLevel, workflowAreaLevels, t]);

  const usersAreaFilterLabel = useMemo(() => {
    if (!usersAreaLevel) return t("AREA");
    return usersParentAreaLevelLabel;
  }, [usersAreaLevel, usersParentAreaLevelLabel, t]);

  const usersFilterByAreaOptionLabel = useMemo(
    () =>
      t("FILTER_BY_LABEL").replace(
        "{label}",
        usersAreaFilterLabel || t("AREA")
      ),
    [usersAreaFilterLabel, t]
  );

  const usersFilterByUserOptionLabel = useMemo(
    () => t("FILTER_BY_LABEL").replace("{label}", t("USER")),
    [t]
  );
  const usersSelectedAreaLevelLabel = useMemo(() => {
    if (!usersAreaLevel) return t("PLACEHOLDER_SELECT");
    return usersAreaLevelOptions.find((level) => level.value === usersAreaLevel)?.label ?? "";
  }, [usersAreaLevel, usersAreaLevelOptions, t]);
  const usersSelectedRoleLabel = useMemo(() => {
    if (!usersRole) return t("SELECT_ROLE");
    return usersRoleOptions.find((role) => role.value === usersRole)?.label ?? usersRole;
  }, [usersRole, usersRoleOptions, t]);
  const usersHasParentAreaLevel = useMemo(() => {
    if (!usersSelectedAreaLevel) return false;
    return workflowAreaLevels.some(
      (level) => level.al_level === usersSelectedAreaLevel.al_level - 1
    );
  }, [usersSelectedAreaLevel, workflowAreaLevels]);

  const getDataEntryValidationState = useCallback(() => {
    const effectiveDeApplyConstraints = panelWfAllowReview || deApplyConstraints;
    const isAreaLevelMissing =
      effectiveDeApplyConstraints &&
      (deLowerAreaLevel.trim() === "" ||
        (panelWfAllowReview && deLowerAreaLevel === DATA_ENTRY_AREA_LEVEL_ANY));
    const isCurrTimePeriodMissing =
      panelWfAllowReview &&
      parseWorkflowDeTimePeriodNid(deCurrTimePeriodNid) == null;
    // Data Entry Role field is disabled in UI/API.
    const isDataEntryRoleMissing = false;
    return {
      isAreaLevelMissing,
      isCurrTimePeriodMissing,
      isDataEntryRoleMissing,
    };
  }, [panelWfAllowReview, deApplyConstraints, deLowerAreaLevel, deCurrTimePeriodNid]);

  const validateDataEntryTabMandatoryFields = useCallback(
    (options?: {
      notify?: boolean;
      setFieldErrors?: boolean;
      tabErrorCounts?: WorkflowConfigTabErrorCounts;
    }) => {
      const state = getDataEntryValidationState();
      const shouldSetFieldErrors = options?.setFieldErrors === true;
      if (shouldSetFieldErrors) {
        setDeAreaLevelError(
          state.isAreaLevelMissing ? t("DATA_ENTRY_AREA_LEVEL_REQUIRED") : ""
        );
        setDeCurrTimePeriodError(
          state.isCurrTimePeriodMissing ? t("CURRENT_TIME_PERIOD_REQUIRED") : ""
        );
      }
      if (state.isAreaLevelMissing || state.isCurrTimePeriodMissing) {
        if (options?.tabErrorCounts) {
          if (state.isAreaLevelMissing) options.tabErrorCounts.data_entry += 1;
          if (state.isCurrTimePeriodMissing) options.tabErrorCounts.data_entry += 1;
        }
        if (options?.notify === true) {
          if (state.isAreaLevelMissing) {
            toast.error(t("DATA_ENTRY_AREA_LEVEL_REQUIRED"));
          } else {
            toast.error(t("CURRENT_TIME_PERIOD_REQUIRED"));
          }
        }
        return false;
      }
      return true;
    },
    [getDataEntryValidationState, t]
  );

  const validateWorkflowTabMandatoryFields = useCallback(
    (options?: {
      notify?: boolean;
      tabErrorCounts?: WorkflowConfigTabErrorCounts;
      syncState?: boolean;
    }): { ok: boolean; normalizedReviewLevels: NormalizedReviewLevelsInput } => {
      if (panelWfAllowReview && !workflowAreaLevelsLoaded) {
        if (options?.tabErrorCounts) options.tabErrorCounts.workflow += 1;
        if (options?.notify === true) {
          toast.error(t("AREAS_LOAD_LEVELS_FAILED"));
        }
        return { ok: false, normalizedReviewLevels: { value: "", count: 0, isEmpty: true } };
      }
      const normalizedReviewLevels: NormalizedReviewLevelsInput = panelWfAllowReview
        ? normalizeReviewLevelsInput(panelWfReviewLevels, {
          notify: options?.notify === true,
        })
        : { value: "", count: 0, isEmpty: true };
      if (
        panelWfAllowReview &&
        options?.syncState !== false &&
        normalizedReviewLevels.value !== panelWfReviewLevels
      ) {
        setPanelWfReviewLevels(normalizedReviewLevels.value);
        setReviewLevelRows((prev) =>
          prev.length > normalizedReviewLevels.count
            ? prev.slice(0, normalizedReviewLevels.count)
            : prev
        );
      }
      const slicedLevelRows = panelWfAllowReview
        ? reviewLevelRows.slice(0, normalizedReviewLevels.count)
        : [];
      const hasMissingReviewLevelDetails =
        panelWfAllowReview &&
        (slicedLevelRows.length !== normalizedReviewLevels.count ||
          slicedLevelRows.some(
            (row) =>
              !row.name.trim() ||
              !(row.scope || "").trim() ||
              !Number.isFinite(Number.parseInt(row.reviewerRole, 10)) ||
              Number.parseInt(row.reviewerRole, 10) <= 0
          ));
      if (hasMissingReviewLevelDetails) {
        if (options?.tabErrorCounts) options.tabErrorCounts.workflow += 1;
        if (options?.notify === true) {
          toast.error(t("REVIEW_STAGE_DETAILS_REQUIRED"));
        }
        return { ok: false, normalizedReviewLevels };
      }
      return { ok: true, normalizedReviewLevels };
    },
    [
      panelWfAllowReview,
      normalizeReviewLevelsInput,
      panelWfReviewLevels,
      reviewLevelRows,
      workflowAreaLevelsLoaded,
      t,
    ]
  );

  const validateUsersTabMandatoryFields = useCallback(
    (_options?: { notify?: boolean; tabErrorCounts?: WorkflowConfigTabErrorCounts }) => true,
    []
  );

  const handleConfigTabSelect = useCallback(
    (nextTab: WorkflowConfigTab) => {
      if (nextTab === configTab) return;
      const nextTabErrorCounts: WorkflowConfigTabErrorCounts = {
        ...EMPTY_WORKFLOW_CONFIG_TAB_ERROR_COUNTS,
      };
      let canSwitch = true;
      if (isWorkflowPendingReadonly && configTab !== "users") {
        canSwitch = true;
      } else if (configTab === "workflow") {
        canSwitch = validateWorkflowTabMandatoryFields({
          notify: true,
          tabErrorCounts: nextTabErrorCounts,
          syncState: true,
        }).ok;
      } else if (configTab === "data_entry") {
        canSwitch = validateDataEntryTabMandatoryFields({
          notify: true,
          setFieldErrors: true,
          tabErrorCounts: nextTabErrorCounts,
        });
      } else if (configTab === "users") {
        canSwitch = validateUsersTabMandatoryFields({
          notify: true,
          tabErrorCounts: nextTabErrorCounts,
        });
      }
      if (!canSwitch) {
        setConfigTabErrorCounts(nextTabErrorCounts);
        return;
      }
      setConfigTabErrorCounts(EMPTY_WORKFLOW_CONFIG_TAB_ERROR_COUNTS);
      setConfigTab(nextTab);
    },
    [
      configTab,
      isWorkflowPendingReadonly,
      validateWorkflowTabMandatoryFields,
      validateDataEntryTabMandatoryFields,
      validateUsersTabMandatoryFields,
    ]
  );

  const activeUserRows =
    usersSubTab === "data_entry" ? deUserRows : reviewerUserRows;
  const setActiveUserRows =
    usersSubTab === "data_entry" ? setDeUserRows : setReviewerUserRows;

  const activeUserRowsLength =
    usersSubTab === "data_entry" ? deUserRows.length : reviewerUserRows.length;

  const activeReviewerUsers = useMemo(() => {
    const merged = new Map<string, DatawarehouseUserListItem>();
    for (const users of Object.values(reviewerIamUsersByRoleCode)) {
      for (const user of users) {
        merged.set(String(user.id), user);
      }
    }
    return [...merged.values()];
  }, [reviewerIamUsersByRoleCode]);

  const activeIamUsers =
    usersSubTab === "data_entry" ? filteredDataEntryIamUsers : activeReviewerUsers;

  const iamUserById = useMemo(() => {
    const m = new Map<string, DatawarehouseUserListItem>();
    for (const u of activeIamUsers) {
      m.set(String(u.id), u);
    }
    return m;
  }, [activeIamUsers]);

  const iamUserSelectOptions = useMemo(
    () => iamUserSelectOptionsFromList(activeIamUsers),
    [activeIamUsers]
  );

  const rowUserSelectOptions = useMemo(() => {
    if (!usersFilterUserId) return iamUserSelectOptions;
    return iamUserSelectOptions.filter((o) => o.value === usersFilterUserId);
  }, [usersFilterUserId, iamUserSelectOptions]);

  const reviewerIamUserOptionsByStage = useMemo(() => {
    const m = new Map<string, IamUserSelectFieldOption[]>();
    for (const stage of reviewerStageColumns) {
      const users = reviewerIamUsersByRoleCode[stage.roleCode] ?? [];
      m.set(stage.stageKey, iamUserSelectOptionsFromList(users));
    }
    return m;
  }, [reviewerStageColumns, reviewerIamUsersByRoleCode]);

  const reviewerRowUserOptionsByStage = useMemo(() => {
    const m = new Map<string, IamUserSelectFieldOption[]>();
    for (const stage of reviewerStageColumns) {
      const stageOptions = reviewerIamUserOptionsByStage.get(stage.stageKey) ?? [];
      const filteredUserId = (reviewerStageFilterUserIds[stage.stageKey] ?? "").trim();
      m.set(
        stage.stageKey,
        filteredUserId
          ? stageOptions.filter((option) => option.value === filteredUserId)
          : stageOptions
      );
    }
    return m;
  }, [reviewerStageColumns, reviewerIamUserOptionsByStage, reviewerStageFilterUserIds]);

  const usersRowsBaseFiltered = useMemo(() => {
    let rows = activeUserRows;
    if (usersArea !== "all") {
      const parentNid = Number.parseInt(usersArea, 10);
      if (Number.isFinite(parentNid)) {
        rows = rows.filter((r) => r.parentAreaNid === parentNid);
      }
    }
    if (usersSubTab === "data_entry" && usersFilterUserId) {
      rows = rows.filter((r) => r.userId === usersFilterUserId || !r.userId.trim());
    }
    if (usersSubTab === "reviewers") {
      const activeStageFilters = reviewerStageColumns.filter(
        (stage) => (reviewerStageFilterUserIds[stage.stageKey] ?? "").trim() !== ""
      );
      if (activeStageFilters.length > 0) {
        rows = rows.filter((r) =>
          activeStageFilters.every(
            (stage) => {
              const filteredUserId = (reviewerStageFilterUserIds[stage.stageKey] ?? "").trim();
              const stageUserId = getReviewerStageCell(r, stage.stageKey).userId.trim();
              return stageUserId === filteredUserId || stageUserId === "";
            }
          )
        );
      }
    }
    return rows;
  }, [
    activeUserRows,
    usersArea,
    usersFilterUserId,
    usersSubTab,
    reviewerStageColumns,
    reviewerStageFilterUserIds,
  ]);

  const usersAssignmentCounts = useMemo(() => {
    if (usersSubTab === "data_entry") {
      const allCount = usersRowsBaseFiltered.length;
      const assignedCount = usersRowsBaseFiltered.filter((r) => r.assigned).length;
      return {
        all: allCount,
        assigned: assignedCount,
        unassigned: allCount - assignedCount,
      };
    }
    const totalAreas = usersRowsBaseFiltered.length;
    const assignedAreas = usersRowsBaseFiltered.filter((r) =>
      reviewerStageColumns.some(
        (stage) => getReviewerStageCell(r, stage.stageKey).assigned
      )
    ).length;
    return {
      all: totalAreas,
      assigned: assignedAreas,
      unassigned: totalAreas - assignedAreas,
    };
  }, [usersRowsBaseFiltered, usersSubTab, reviewerStageColumns]);

  const filteredUserTableRows = useMemo(() => {
    let rows = usersRowsBaseFiltered;
    if (usersSubTab === "reviewers") {
      if (usersViewFilter === "assigned") {
        rows = rows.filter((r) =>
          reviewerStageColumns.some(
            (stage) => getReviewerStageCell(r, stage.stageKey).assigned
          )
        );
      } else if (usersViewFilter === "unassigned") {
        rows = rows.filter((r) =>
          reviewerStageColumns.every(
            (stage) => !getReviewerStageCell(r, stage.stageKey).assigned
          )
        );
      }
      const areaSearch = usersSearchArea.trim().toLowerCase();
      if (areaSearch) {
        rows = rows.filter((r) => {
          return (
            r.areaLabel.toLowerCase().includes(areaSearch) ||
            (r.areaCode ?? "").toLowerCase().includes(areaSearch)
          );
        });
      }
      return rows;
    }
    if (usersViewFilter === "assigned") {
      rows = rows.filter((r) => r.assigned);
    } else if (usersViewFilter === "unassigned") {
      rows = rows.filter((r) => !r.assigned);
    }
    const qa = usersSearchArea.trim().toLowerCase();
    if (qa) {
      rows = rows.filter((r) =>
        r.areaLabel.toLowerCase().includes(qa) ||
        (r.areaCode ?? "").toLowerCase().includes(qa)
      );
    }
    return rows;
  }, [
    usersRowsBaseFiltered,
    usersViewFilter,
    usersSearchArea,
    usersSubTab,
    reviewerStageColumns,
  ]);

  const isReviewerUsersSubTab = usersSubTab === "reviewers";
  /** Data Entry users: keep role picker enabled; area-level may still be fixed by workflow. */
  const hideDeUsersToolbarRoleAreaFilters = false;
  /** Role pickers in table are read-only → show above the User (All) filter; editable role stays in the toolbar. */
  const isDeUsersRoleFilterDisabled = false;
  const showDeUsersRoleInToolbar =
    !hideDeUsersToolbarRoleAreaFilters && !isDeUsersRoleFilterDisabled;
  const reviewerStageCount = reviewerStageColumns.length;
  const usersTableColumnCount = isReviewerUsersSubTab
    ? reviewerStageCount + 2
    : 3;
  /**
   * Checkbox col is 6%. Data Entry: slightly wider Area + one User col. Reviewers: tighter Area,
   * remainder split across stage columns.
   */
  const usersTableAreaWidthPct = isReviewerUsersSubTab ? 26 : 36;
  const usersAssignmentColCount = Math.max(
    1,
    isReviewerUsersSubTab ? reviewerStageCount : 1
  );
  const usersAreaColWidth = `${usersTableAreaWidthPct}%`;
  const usersAssignmentColWidth = `${(94 - usersTableAreaWidthPct) / usersAssignmentColCount}%`;
  const usersDisabledRowCheckboxTooltip = t(
    "WORKFLOW_USERS_ASSIGN_USER_TO_ENABLE_CHECKBOX"
  );
  const isUserRowSelectable = useCallback(
    (row: WorkflowUserAreaRow) => {
      if (isWorkflowPendingReadonly) return false;
      if (usersSubTab === "data_entry") {
        return row.userId.trim() !== "" || row.assignmentId != null;
      }
      return reviewerStageColumns.some((stage) => {
        const cell = getReviewerStageCell(row, stage.stageKey);
        return cell.userId.trim() !== "" || cell.assignmentId != null;
      });
    },
    [isWorkflowPendingReadonly, usersSubTab, reviewerStageColumns]
  );
  const selectableFilteredUserRowIds = useMemo(
    () =>
      filteredUserTableRows
        .filter((row) => isUserRowSelectable(row))
        .map((row) => row.id),
    [filteredUserTableRows, isUserRowSelectable]
  );

  const canAssignUsersFromFilters = useMemo(() => {
    if (configSaving || usersAreasLoading || iamUsersLoading) return false;
    if (filteredUserTableRows.length === 0) return false;
    if (usersSubTab === "data_entry") {
      return Boolean(usersFilterUserId.trim() && usersSelectedRoleCode);
    }
    return reviewerStageColumns.some(
      (stage) => (reviewerStageFilterUserIds[stage.stageKey] ?? "").trim() !== ""
    );
  }, [
    configSaving,
    usersAreasLoading,
    iamUsersLoading,
    filteredUserTableRows.length,
    usersSubTab,
    usersFilterUserId,
    usersSelectedRoleCode,
    reviewerStageColumns,
    reviewerStageFilterUserIds,
  ]);

  const setWorkflowUsersSelectRef = useCallback(
    (rowId: string, stageKey: string, el: HTMLButtonElement | null) => {
      const key = `${rowId}::${stageKey}`;
      const m = workflowUsersSelectRefMap.current;
      if (el) m.set(key, el);
      else m.delete(key);
    },
    []
  );

  /** ArrowUp/ArrowDown: move focus between row selects only (no native option cycling). */
  const handleWorkflowUserSelectKeyDown = useCallback(
    (
      event: ReactKeyboardEvent<HTMLButtonElement>,
      rowId: string,
      stageKey: string
    ) => {
      if (event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const key = event.key;
      if (key !== "ArrowUp" && key !== "ArrowDown") return;

      const rows = filteredUserTableRows;
      const rowIndex = rows.findIndex((r) => r.id === rowId);
      if (rowIndex < 0) return;

      event.preventDefault();
      event.stopPropagation();

      if (key === "ArrowUp") {
        if (rowIndex > 0) {
          const prevId = rows[rowIndex - 1]!.id;
          const el = workflowUsersSelectRefMap.current.get(
            `${prevId}::${stageKey}`
          );
          el?.focus();
          el?.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
        return;
      }

      if (rowIndex < rows.length - 1) {
        const nextId = rows[rowIndex + 1]!.id;
        const el = workflowUsersSelectRefMap.current.get(
          `${nextId}::${stageKey}`
        );
        el?.focus();
        el?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    },
    [filteredUserTableRows]
  );

  const reviewLevelRowsLimit = panelWfAllowReview
    ? normalizeReviewLevelsInput(panelWfReviewLevels).count
    : 0;
  const shouldShowReviewLevelDetails =
    panelWfAllowReview &&
    normalizeReviewLevelsInput(panelWfReviewLevelsInput).count > 0;
  const canUseReviewUsersTab =
    panelWfAllowReview &&
    normalizeReviewLevelsInput(panelWfReviewLevelsInput).count > 0;

  const isReviewLevelDraftComplete =
    reviewLevelDraftRow.name.trim() !== "" &&
    reviewLevelDraftRow.scope !== "" &&
    reviewLevelDraftRow.areaLevel !== "" &&
    reviewLevelDraftRow.reviewerRole !== "";

  const canAddReviewLevelRow =
    isReviewLevelDraftComplete &&
    !reviewLevelsSaving &&
    !reviewLevelsLoading &&
    reviewLevelRows.length < reviewLevelRowsLimit;

  const canRenderReviewLevelAddRow = false;

  const reviewAddRowNavIndex = reviewLevelRows.length;

  // ---------------------------------------------------------------------------
  // Data loaders
  // ---------------------------------------------------------------------------

  const loadWorkflowAreaLevels = useCallback(async () => {
    if (!dwId) {
      setWorkflowAreaLevels([]);
      setWorkflowAreaLevelsLoaded(false);
      return;
    }
    const result = await fetchWorkflowAreaLevels(dwId);
    if (!result.success) {
      toast.error(result.err_message ?? t("AREAS_LOAD_LEVELS_FAILED"));
      setWorkflowAreaLevels([]);
      setWorkflowAreaLevelsLoaded(true);
      return;
    }
    const levels = [...(result.data ?? [])];
    levels.sort((a, b) => a.al_level - b.al_level);
    setWorkflowAreaLevels(levels);
    setWorkflowAreaLevelsLoaded(true);
  }, [dwId, t]);

  const loadRoles = useCallback(async () => {
    setReviewerRolesLoading(true);
    setDataEntryRolesLoading(true);
    const [reviewRes, deRes] = await Promise.all([
      fetchIamRoles(IAM_ROLES_RESOURCE_DM_DW_DATA_REVIEW),
      fetchIamRoles(IAM_ROLES_RESOURCE_DM_DW_DATA_ENTRY),
    ]);
    if (!reviewRes.success) {
      toast.error(reviewRes.err_message ?? "Failed to load roles");
      setReviewerRoles([]);
    } else {
      setReviewerRoles(reviewRes.data ?? []);
    }
    if (!deRes.success) {
      toast.error(deRes.err_message ?? "Failed to load roles");
      setDataEntryRoles([]);
    } else {
      setDataEntryRoles(deRes.data ?? []);
    }
    setReviewerRolesLoading(false);
    setDataEntryRolesLoading(false);
  }, []);

  const mapWorkflowLevelToRow = useCallback(
    (level: WorkflowLevelRaw): ReviewLevelDetailRow => {
      const normalizedScope = (level.review_scope_type ?? "").trim().toUpperCase();
      return {
        levelId: level.workflow_review_level_id,
        levelNo: level.level_no,
        name: level.level_name ?? "",
        scope: normalizedScope || "AREA",
        areaLevel: level.area_level != null ? String(level.area_level) : "",
        reviewerRole: level.role_id != null ? String(level.role_id) : "",
      };
    },
    []
  );

  const loadWorkflowLevels = useCallback(
    async (wfId: number, fallbackLevelCount = 0) => {
      if (!dwId) return;
      setReviewLevelsLoading(true);
      try {
        const res = await fetchWorkflowLevels(dwId, wfId);
        if (!res.success) {
          toast.error(res.err_message ?? "Failed to load workflow levels");
          setReviewLevelRows([]);
          setInitialReviewLevelRows([]);
          return;
        }
        const rows = [...(res.data ?? [])]
          .sort((a, b) => a.level_no - b.level_no)
          .map(mapWorkflowLevelToRow);
        const rowsWithFallback =
          fallbackLevelCount > rows.length
            ? [
                ...rows,
                ...Array.from(
                  { length: fallbackLevelCount - rows.length },
                  (_, index) => ({
                    ...emptyReviewLevelRow(),
                    levelNo: rows.length + index + 1,
                  })
                ),
              ]
            : rows;
        setReviewLevelRows(rowsWithFallback);
        setInitialReviewLevelRows(rowsWithFallback);
        setEditingReviewNameCell(null);
        setEditingReviewLevelRowIndex(null);
        setEditingReviewLevelOriginalRow(null);
      } finally {
        setReviewLevelsLoading(false);
      }
    },
    [dwId, mapWorkflowLevelToRow]
  );

  const loadWorkflowLevelsWithConfigFallback = useCallback(
    async (wfId: number, reviewLevelCountRaw: unknown, allowReview: boolean) => {
      const raw =
        typeof reviewLevelCountRaw === "number"
          ? Math.max(0, Math.trunc(reviewLevelCountRaw))
          : 0;
      const fallbackLevelCount = allowReview ? Math.max(1, raw) : 0;
      await loadWorkflowLevels(wfId, fallbackLevelCount);
    },
    [loadWorkflowLevels]
  );

  const loadDataEntryConfig = useCallback(
    async (wfId: number, allowReview: boolean) => {
      if (!dwId) return;
      try {
        const res = await getWorkflowDataEntry(dwId, wfId);
        if (!res.success || !res.data) {
          initialDeConfigRef.current = null;
          return;
        }
        const d = res.data;
        const freq = normalizeDataEntryTimeperiodFrequency(
          d.timeperiod_frequency
        );
        const areaLvlRaw = d.area_level != null ? String(d.area_level) : "";
        const areaLvl = normalizeNonPositiveSelectValue(areaLvlRaw, allowReview);
        const scopeTp = d.scope_timeperiod ?? "";
        const scopeArea = d.scope_area ?? "";
        const scopeInd = d.scope_indicator ?? "";
        const showPrev = Boolean(d.show_previous_time);
        const savedCurrTpNid =
          d.curr_timeperiod_nid != null
            ? String(parseWorkflowDeTimePeriodNid(d.curr_timeperiod_nid) ?? "")
            : "";

        setDeTimePeriodFrequency(freq);
        setDeCurrTimePeriodNid(savedCurrTpNid);
        setDeLowerAreaLevel(areaLvl);
        setDeAllowChildrenArea(false);
        setDeFormTimePeriod(scopeTp);
        setDeFormArea(scopeArea);
        setDeFormIndicator(scopeInd);
        setDeShowPreviousTime(showPrev);

        initialDeConfigRef.current = {
          timeperiod_frequency: freq,
          curr_timeperiod_nid: savedCurrTpNid,
          area_level: areaLvl,
          allow_child_areas: false,
          scope_timeperiod: scopeTp,
          scope_area: scopeArea,
          scope_indicator: scopeInd,
          show_previous_time: showPrev,
        };
      } catch {
        initialDeConfigRef.current = null;
      }
    },
    [dwId]
  );

  const loadDeTimePeriods = useCallback(async () => {
    if (!dwId) {
      setDeAllTimePeriods([]);
      return;
    }
    setDeTimePeriodsLoading(true);
    try {
      const sp = new URLSearchParams({
        sort_field: "enddate",
        sort_order: "asc",
      });
      const url = `${getDWAPIURL(dwId, REFERENCE_PATH_TIME_PERIODS)}?${sp.toString()}`;
      const json = (await getRequest(url, undefined, {
        suppressErrorMessage: true,
      })) as TimePeriodsListResponse;
      if (json.success !== true || !Array.isArray(json.data)) {
        setDeAllTimePeriods([]);
        return;
      }
      const normalized = json.data
        .map((item) =>
          normalizeWorkflowDeTimePeriodItem(item as Record<string, unknown>)
        )
        .filter((item): item is WorkflowDeTimePeriodOption => item != null);
      setDeAllTimePeriods(normalized);
    } catch {
      setDeAllTimePeriods([]);
    } finally {
      setDeTimePeriodsLoading(false);
    }
  }, [dwId]);

  const filteredDeTimePeriodOptions = useMemo(
    () => filterWorkflowDeTimePeriodsByFrequency(deAllTimePeriods, deTimePeriodFrequency),
    [deAllTimePeriods, deTimePeriodFrequency]
  );

  useEffect(() => {
    if (!open || !dwId) return;
    void loadDeTimePeriods();
  }, [open, dwId, loadDeTimePeriods]);

  useEffect(() => {
    if (!deApplyConstraints || deAllTimePeriods.length === 0) return;
    if (filteredDeTimePeriodOptions.length === 0) {
      setDeCurrTimePeriodNid("");
      return;
    }
    setDeCurrTimePeriodNid((prev) => {
      const savedIni = initialDeConfigRef.current?.curr_timeperiod_nid ?? "";
      if (
        savedIni &&
        filteredDeTimePeriodOptions.some((item) => String(item.nid) === savedIni)
      ) {
        return savedIni;
      }
      if (prev && filteredDeTimePeriodOptions.some((item) => String(item.nid) === prev)) {
        return prev;
      }
      if (panelWfAllowReview) {
        return pickLatestWorkflowDeTimePeriodNid(filteredDeTimePeriodOptions);
      }
      return "";
    });
  }, [deApplyConstraints, panelWfAllowReview, deAllTimePeriods, filteredDeTimePeriodOptions]);

  /** Clears Data Entry constraint + form scope fields (when turning constraints off). */
  const resetDataEntryConstraintFields = useCallback(() => {
    setDeTimePeriodFrequency("ALL");
    setDeCurrTimePeriodNid("");
    setDeLowerAreaLevel("");
    setDeAllowChildrenArea(false);
    setDeAreaLevelError("");
    setDeCurrTimePeriodError("");
    setDeFormTimePeriod("");
    setDeFormArea("");
    setDeFormIndicator("");
    setDeShowPreviousTime(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Open → load workflow by ID + supporting data
  // ---------------------------------------------------------------------------

  const resetWorkflowDrawerState = useCallback(() => {
    usersAreasFetchSeqRef.current += 1;
    usersAssignmentsFetchSeqRef.current += 1;

    setWorkflowData(null);
    setWorkflowLoading(false);
    setWorkflowAreaLevels([]);
    setWorkflowAreaLevelsLoaded(false);
    setReviewerRoles([]);
    setReviewerRolesLoading(false);
    setDataEntryRoles([]);
    setDataEntryRolesLoading(false);
    setConfigTab("workflow");
    setConfigTabErrorCounts(EMPTY_WORKFLOW_CONFIG_TAB_ERROR_COUNTS);
    setConfigSaving(false);
    setPanelWfName("");
    setPanelWfActive(false);
    setPanelWfAllowReview(false);
    setPanelWfReviewLevels("");
    setPanelWfReviewLevelsInput("");
    setReviewLevelRows([]);
    setInitialReviewLevelRows([]);
    setEditingReviewNameCell(null);
    setEditingReviewLevelRowIndex(null);
    setEditingReviewLevelOriginalRow(null);
    setReviewAddRowExpanded(false);
    setReviewLevelDraftRow(emptyReviewLevelRow());
    setReviewLevelsLoading(false);
    setReviewLevelsSaving(false);
    setReviewLevelTrimConfirmOpen(false);
    setPendingReviewLevelTrim(null);
    setPendingReviewLevelDeletes([]);
    setUserDeleteConfirmOpen(false);
    setDeApplyConstraints(false);
    resetDataEntryConstraintFields();
    setDeAllTimePeriods([]);
    setDeTimePeriodsLoading(false);
    initialDeConfigRef.current = null;
    setUsersSubTab("data_entry");
    setUsersRole("");
    setUsersAreaLevel("");
    setUsersArea("all");
    setUsersFilterUserId("");
    setReviewerStageFilterUserIds({});
    setUsersViewFilter("all");
    setAllDataEntryIamUsers([]);
    setIamUsers([]);
    setReviewerIamUsersByRoleCode({});
    setIamUsersLoading(false);
    setDeUserRows([]);
    setDeUserRowsByRoleId({});
    setReviewerUserRows([]);
    setUsersParentAreaOptions([]);
    setUsersAreasLoading(false);
    setUsersTableSelected(new Set());
    setUsersSearchArea("");
    usersFiltersBySubTabRef.current = {
      data_entry: createDefaultUsersFiltersState(),
      reviewers: createDefaultUsersFiltersState(),
    };
    setDeUserAssignmentsRoleId(null);
    setReviewerUserAssignmentsRoleByStage({});
    prevUsersRoleForDeSnapshotRef.current = "";
  }, [resetDataEntryConstraintFields]);

  useEffect(() => {
    if (open) return;
    resetWorkflowDrawerState();
  }, [open, resetWorkflowDrawerState]);

  useEffect(() => {
    if (!open || !workflowId || !dwId) return;

    resetWorkflowDrawerState();
    setWorkflowLoading(true);
    let cancelled = false;
    void (async () => {
      try {
        const [wfResult] = await Promise.all([
          fetchWorkflowById(dwId, workflowId),
          loadWorkflowAreaLevels(),
          loadRoles(),
        ]);
        if (cancelled) return;
        if (!wfResult.success) {
          toast.error(wfResult.err_message ?? "Failed to load workflow");
          setWorkflowData(null);
          return;
        }
        const wf = wfResult.data;
        setWorkflowData(wf);

        setPanelWfName(wf.workflow_name ?? "");
        setPanelWfActive(Boolean(wf.is_active));
        const allow = Boolean(wf.allow_review);
        setPanelWfAllowReview(allow);
        const countRaw = wf.review_level_count;
        const countFromApi =
          typeof countRaw === "number" ? Math.max(0, Math.trunc(countRaw)) : 0;
        const reviewLevelsCount = allow && countFromApi === 0 ? 1 : countFromApi;
        const rl = String(reviewLevelsCount);
        setPanelWfReviewLevels(rl);
        setPanelWfReviewLevelsInput(rl);
        setDeApplyConstraints(Boolean(wf.constraint_data_entry) || allow);

        if (cancelled) return;
        void loadWorkflowLevelsWithConfigFallback(
          wf.workflow_id,
          reviewLevelsCount,
          allow
        );
        void loadDataEntryConfig(wf.workflow_id, allow);
      } finally {
        if (!cancelled) {
          setWorkflowLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    workflowId,
    dwId,
    loadWorkflowAreaLevels,
    loadRoles,
    loadWorkflowLevelsWithConfigFallback,
    loadDataEntryConfig,
    resetWorkflowDrawerState,
  ]);

  useEffect(() => {
    if (!open || !dwId) {
      setAllDataEntryIamUsers([]);
      setIamUsers([]);
      setReviewerIamUsersByRoleCode({});
      setIamUsersLoading(false);
      return;
    }
    // Skip refetches while a Save is in progress: setReviewLevelRows during save
    // mutates reviewerStageColumns and would otherwise re-trigger this effect even
    // though the drawer is about to close.
    if (configSaving) return;
    // Only fetch IAM users when the Users tab is active; editing reviewer roles
    // on the Workflow tab should not trigger user list API calls.
    if (configTab !== "users") return;
    let cancelled = false;

    const deRoleCodesCsv = [...new Set(usersRoleOptions.map((role) => role.value.trim()))]
      .filter(Boolean)
      .join(",");
    const reviewerRoleCodes = reviewerStageRoleCodesKey
      ? reviewerStageRoleCodesKey.split(",")
      : [];

    const needsDeUsers = Boolean(deRoleCodesCsv);
    const needsReviewerUsers = reviewerRoleCodes.length > 0;

    if (!needsDeUsers && !needsReviewerUsers) {
      setAllDataEntryIamUsers([]);
      setIamUsers([]);
      setReviewerIamUsersByRoleCode({});
      setIamUsersLoading(false);
      return;
    }

    setIamUsersLoading(true);
    void (async () => {
      if (needsDeUsers) {
        const res = await fetchWorkflowIamUserList(dwId, {
          sort_field: "id",
          sort_order: "asc",
          view: "flat",
          role_code: deRoleCodesCsv,
        });
        if (cancelled) return;
        if (res.success) {
          setAllDataEntryIamUsers(res.data ?? []);
        } else {
          setAllDataEntryIamUsers([]);
          setIamUsers([]);
          toast.error(
            (res as { err_message?: string }).err_message ??
            "Failed to load users"
          );
        }
      }

      if (cancelled) return;

      if (needsReviewerUsers) {
        const entries = await Promise.all(
          reviewerRoleCodes.map(async (roleCode) => {
            const res = await fetchWorkflowIamUserList(dwId, {
              sort_field: "id",
              sort_order: "asc",
              view: "flat",
              role_code: roleCode,
            });
            return [roleCode, res] as const;
          })
        );
        if (cancelled) return;
        const next: Record<string, DatawarehouseUserListItem[]> = {};
        for (const [roleCode, res] of entries) {
          if (res.success) {
            next[roleCode] = res.data ?? [];
          } else {
            next[roleCode] = [];
            toast.error(
              (res as { err_message?: string }).err_message ??
              "Failed to load users"
            );
          }
        }
        setReviewerIamUsersByRoleCode(next);
      } else {
        setReviewerIamUsersByRoleCode({});
      }

      if (cancelled) return;
      setIamUsersLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, dwId, usersRoleOptions, reviewerStageRoleCodesKey, configSaving, configTab]);

  useEffect(() => {
    if (usersSubTab !== "data_entry") return;
    setIamUsers(filteredDataEntryIamUsers);
  }, [usersSubTab, filteredDataEntryIamUsers]);

  useEffect(() => {
    usersFiltersBySubTabRef.current[usersSubTab] = {
      role: usersRole,
      areaLevel: usersAreaLevel,
      area: usersArea,
      filterUserId: usersFilterUserId,
      viewFilter: usersViewFilter,
      searchArea: usersSearchArea,
    };
  }, [
    usersSubTab,
    usersRole,
    usersAreaLevel,
    usersArea,
    usersFilterUserId,
    usersViewFilter,
    usersSearchArea,
  ]);

  const switchUsersSubTab = useCallback(
    (nextSubTab: WorkflowUsersSubTab) => {
      if (nextSubTab === usersSubTab) return;
      usersFiltersBySubTabRef.current[usersSubTab] = {
        role: usersRole,
        areaLevel: usersAreaLevel,
        area: usersArea,
        filterUserId: usersFilterUserId,
        viewFilter: usersViewFilter,
        searchArea: usersSearchArea,
      };
      const restored = usersFiltersBySubTabRef.current[nextSubTab];
      setUsersSubTab(nextSubTab);
      setUsersRole(restored.role);
      // Keep one shared area grid for both sub-tabs. Restoring per-tab area level
      // triggered a refetch that cleared rows and dropped unsaved assignments.
      setUsersFilterUserId(restored.filterUserId);
      setUsersViewFilter(restored.viewFilter);
      setUsersSearchArea(restored.searchArea);
    },
    [
      usersSubTab,
      usersRole,
      usersAreaLevel,
      usersArea,
      usersFilterUserId,
      usersViewFilter,
      usersSearchArea,
    ]
  );

  // ---------------------------------------------------------------------------
  // Review level sync effects
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!panelWfAllowReview || !workflowAreaLevelsLoaded || reviewLevelsLoading) return;
    const normalized = normalizeReviewLevelsInput(panelWfReviewLevels);
    if (normalized.value !== panelWfReviewLevels) {
      setPanelWfReviewLevels(normalized.value);
    }
    setReviewLevelRows((prev) =>
      (() => {
        const normalizedRows = prev
          .slice(0, normalized.count)
          .map((row, index) => ({ ...row, levelNo: index + 1 }));
        if (normalizedRows.length >= normalized.count) return normalizedRows;
        const appendedRows = Array.from(
          { length: normalized.count - normalizedRows.length },
          (_, index) => ({
            ...emptyReviewLevelRow(),
            scope: "AREA",
            levelNo: normalizedRows.length + index + 1,
          })
        );
        return [...normalizedRows, ...appendedRows];
      })()
    );
  }, [
    panelWfAllowReview,
    panelWfReviewLevels,
    maxReviewLevelsByAreaCount,
    normalizeReviewLevelsInput,
    workflowAreaLevelsLoaded,
    reviewLevelsLoading,
  ]);

  useEffect(() => {
    if (!panelWfAllowReview || deApplyConstraints) return;
    setDeApplyConstraints(true);
  }, [panelWfAllowReview, deApplyConstraints]);

  useEffect(() => {
    const totalRows = reviewLevelRows.length + (reviewAddRowExpanded ? 1 : 0);
    setEditingReviewNameCell((prev) => {
      if (prev === null) return prev;
      if (prev < 0 || prev >= totalRows) return null;
      return prev;
    });
  }, [reviewLevelRows.length, reviewAddRowExpanded]);

  useEffect(() => {
    if (!canRenderReviewLevelAddRow && reviewAddRowExpanded) {
      setReviewAddRowExpanded(false);
      setReviewLevelDraftRow(emptyReviewLevelRow());
    }
  }, [canRenderReviewLevelAddRow, reviewAddRowExpanded]);

  useEffect(() => {
    setUsersTableSelected(new Set());
  }, [usersSubTab, usersViewFilter, usersArea]);

  useEffect(() => {
    setReviewerStageFilterUserIds((prev) => {
      const next: Record<string, string> = {};
      for (const stage of reviewerStageColumns) {
        next[stage.stageKey] = prev[stage.stageKey] ?? "";
      }
      return next;
    });
  }, [reviewerStageColumns]);

  useEffect(() => {
    if (canUseReviewUsersTab || usersSubTab !== "reviewers") return;
    switchUsersSubTab("data_entry");
  }, [canUseReviewUsersTab, usersSubTab, switchUsersSubTab]);

  useEffect(() => {
    if (
      lockedDataEntryUsersAreaLevel &&
      usersAreaLevel !== lockedDataEntryUsersAreaLevel
    ) {
      setUsersAreaLevel(lockedDataEntryUsersAreaLevel);
    }
  }, [
    usersSubTab,
    usersAreaLevel,
    lockedDataEntryUsersAreaLevel,
  ]);

  useEffect(() => {
    if (usersSubTab !== "reviewers") return;
    if (usersAreaLevel.trim() !== "") return;
    const fallbackAreaLevel =
      lockedDataEntryUsersAreaLevel || usersAreaLevelOptions[0]?.value || "";
    if (!fallbackAreaLevel) return;
    setUsersAreaLevel(fallbackAreaLevel);
  }, [
    usersSubTab,
    usersAreaLevel,
    lockedDataEntryUsersAreaLevel,
    usersAreaLevelOptions,
  ]);

  useEffect(() => {
    if (usersSubTab !== "data_entry") return;
    if (usersRoleOptions.length === 0) {
      if (usersRole !== "") setUsersRole("");
      return;
    }
    if (usersRoleOptions.some((role) => role.value === usersRole)) return;
  }, [usersSubTab, usersRole, usersRoleOptions]);

  useEffect(() => {
    if (usersSubTab !== "data_entry") return;
    if (!usersFilterUserId) return;
    if (iamUsers.some((user) => String(user.id) === usersFilterUserId)) return;
    setUsersFilterUserId("");
  }, [usersSubTab, usersFilterUserId, iamUsers]);

  useEffect(() => {
    if (!open) return;
    if (!usersAreaLevel) {
      usersAreasFetchSeqRef.current += 1;
      setDeUserRows([]);
      setDeUserRowsByRoleId({});
      setReviewerUserRows([]);
      setUsersParentAreaOptions([]);
      setUsersAreasLoading(false);
      setDeUserAssignmentsRoleId(null);
      setReviewerUserAssignmentsRoleByStage({});
    }
  }, [open, usersAreaLevel]);

  useEffect(() => {
    if (
      !open ||
      !dwId ||
      !areasListUrl ||
      !workflowAreaLevelsLoaded ||
      !usersAreaLevel
    ) {
      return;
    }

    const selected = workflowAreaLevels.find(
      (l) => String(l.al_nid) === usersAreaLevel
    );
    if (!selected) return;

    const reqSeq = ++usersAreasFetchSeqRef.current;
    setUsersAreasLoading(true);
    setDeUserAssignmentsRoleId(null);
    setReviewerUserAssignmentsRoleByStage({});
    setDeUserRows([]);
    setDeUserRowsByRoleId({});
    setReviewerUserRows([]);
    setUsersParentAreaOptions([]);
    setUsersArea("all");

    const levelNidToId = buildWorkflowLevelNidToIdMap(workflowAreaLevels);
    const parentLevel = workflowAreaLevels.find(
      (l) => l.al_level === selected.al_level - 1
    );

    void (async () => {
      const tablePromise = fetchAllWorkflowAreasForLevel(
        areasListUrl,
        selected.al_level,
        levelNidToId
      );
      const parentPromise =
        parentLevel != null
          ? fetchAllWorkflowAreasForLevel(
            areasListUrl,
            parentLevel.al_level,
            levelNidToId
          )
          : Promise.resolve<
            | { ok: true; rows: AreaNode[] }
            | { ok: false; message: string }
          >({ ok: true, rows: [] });

      const [tableResult, parentResult] = await Promise.all([
        tablePromise,
        parentPromise,
      ]);

      if (reqSeq !== usersAreasFetchSeqRef.current) return;

      if (!tableResult.ok) {
        toast.error(tableResult.message);
        setDeUserAssignmentsRoleId(null);
        setReviewerUserAssignmentsRoleByStage({});
        setDeUserRows([]);
        setDeUserRowsByRoleId({});
        setReviewerUserRows([]);
        setUsersParentAreaOptions([]);
        setUsersAreasLoading(false);
        return;
      }

      const mappedRows = workflowAreaNodesToUserRows(tableResult.rows);
      setDeUserRows(mappedRows);
      setDeUserRowsByRoleId({});
      setReviewerUserRows(mappedRows.map((r) => ({ ...r })));

      if (parentLevel != null) {
        if (!parentResult.ok) {
          toast.error(parentResult.message);
          setUsersParentAreaOptions([]);
        } else {
          setUsersParentAreaOptions(
            parentResult.rows.map((n) => ({
              value: String(n.nid),
              label: n.keyword ? `${n.name} (${n.keyword})` : n.name,
            }))
          );
        }
      } else {
        setUsersParentAreaOptions([]);
      }

      setUsersAreasLoading(false);
    })();
  }, [
    open,
    dwId,
    areasListUrl,
    usersAreaLevel,
    workflowAreaLevelsLoaded,
    workflowAreaLevels,
  ]);

  useLayoutEffect(() => {
    if (!open) return;
    const prevCode = prevUsersRoleForDeSnapshotRef.current;
    if (prevCode === usersRole) return;

    const prevRole = dataEntryRoles.find(
      (r) => (r.role_code ?? "").trim() === prevCode.trim()
    );
    const pid = prevRole?.id;
    const nextMap: Record<number, WorkflowUserAreaRow[]> = {
      ...deUserRowsByRoleIdRef.current,
    };
    if (
      pid != null &&
      Number.isFinite(pid) &&
      pid > 0 &&
      prevCode.trim() !== "" &&
      deUserRowsRef.current.length > 0
    ) {
      nextMap[pid] = deUserRowsRef.current.map((r) => ({ ...r }));
    }

    const nextRole = dataEntryRoles.find(
      (r) => (r.role_code ?? "").trim() === usersRole.trim()
    );
    const nid = nextRole?.id;
    const template = deUserRowsRef.current;
    if (
      nid == null ||
      !Number.isFinite(nid) ||
      nid <= 0 ||
      template.length === 0
    ) {
      setDeUserRowsByRoleId(nextMap);
      prevUsersRoleForDeSnapshotRef.current = usersRole;
      return;
    }

    const cached = nextMap[nid];
    const nextRows =
      cached && cached.length === template.length
        ? cached.map((r) => ({ ...r }))
        : template.map((r) => ({
          ...r,
          userId: "",
          email: "",
          assigned: false,
          assignmentId: undefined,
          baselineUserId: "",
        }));

    setDeUserRowsByRoleId(nextMap);
    setDeUserRows(nextRows);
    prevUsersRoleForDeSnapshotRef.current = usersRole;
  }, [open, usersRole, dataEntryRoles]);

  useEffect(() => {
    if (!open || !dwId || !workflowData || usersAreasLoading) return;
    // Skip refetches while a Save is in progress: setRows callbacks invoked by
    // persist helpers and the post-levels-save setReviewLevelRows would otherwise
    // trigger this effect even though the drawer is about to close on success.
    if (configSaving) return;
    // Only fetch user assignments when the Users tab is active.
    if (configTab !== "users") return;
    const wfId = workflowData.workflow_id;
    if (activeUserRowsLength === 0) return;

    const reqSeq = ++usersAssignmentsFetchSeqRef.current;
    let cancelled = false;

    void (async () => {
      const selectedDeRole = dataEntryRoles.find(
        (r) => (r.role_code ?? "").trim() === usersRole.trim()
      );
      const deRoleId = selectedDeRole?.id;
      const deFetchWanted =
        Boolean(usersSelectedRoleCode?.trim()) &&
        deRoleId != null &&
        Number.isFinite(deRoleId) &&
        deRoleId > 0;

      let deAssignments: WorkflowUserAssignmentItem[] | null = null;
      let deOk = true;

      if (deFetchWanted) {
        const res = await fetchWorkflowUserAssignments(dwId, wfId, {
          role_id: deRoleId!,
          scope_type: "AREA",
        });
        if (cancelled || reqSeq !== usersAssignmentsFetchSeqRef.current) return;
        if (!res.success) {
          toast.error(res.err_message ?? "Failed to load assignments");
          deOk = false;
          deAssignments = [];
          setDeUserAssignmentsRoleId(null);
          setDeUserRowsByRoleId({});
          setDeUserRows((prev) =>
            prev.map((r) => ({
              ...r,
              userId: "",
              email: "",
              assigned: false,
              assignmentId: undefined,
              baselineUserId: "",
            }))
          );
        } else {
          deAssignments = res.data ?? [];
          setDeUserAssignmentsRoleId(deRoleId!);
        }
      } else {
        if (cancelled || reqSeq !== usersAssignmentsFetchSeqRef.current) return;
        setDeUserAssignmentsRoleId(null);
      }

      const uniqueReviewerRoleIds = reviewerStageRoleIdsKey
        ? reviewerStageRoleIdsKey.split(",").map(Number)
        : [];

      const roleIdToAssignments = new Map<number, WorkflowUserAssignmentItem[]>();

      if (uniqueReviewerRoleIds.length === 0) {
        if (cancelled || reqSeq !== usersAssignmentsFetchSeqRef.current) return;
        setReviewerUserAssignmentsRoleByStage({});
        setReviewerUserRows((prev) =>
          prev.map((row) => ({ ...row, reviewerAssignments: {} }))
        );
      } else {
        const reviewerResults = await Promise.all(
          uniqueReviewerRoleIds.map(async (roleId) => {
            const res = await fetchWorkflowUserAssignments(dwId, wfId, {
              role_id: roleId,
              scope_type: "AREA",
            });
            return { roleId, res } as const;
          })
        );
        if (cancelled || reqSeq !== usersAssignmentsFetchSeqRef.current) return;

        for (const { roleId, res } of reviewerResults) {
          if (!res.success) {
            toast.error(res.err_message ?? "Failed to load assignments");
            roleIdToAssignments.set(roleId, []);
          } else {
            roleIdToAssignments.set(roleId, res.data ?? []);
          }
        }
        const currentStageColumns = reviewerStageColumnsRef.current;
        const roleByStage: Record<string, number> = {};
        for (const stage of currentStageColumns) {
          roleByStage[stage.stageKey] = stage.roleId;
        }
        setReviewerUserAssignmentsRoleByStage(roleByStage);

        const reviewerIam = reviewerIamUsersByRoleCodeRef.current;
        setReviewerUserRows((prev) =>
          prev.map((row) => {
            const reviewerAssignments: Record<string, WorkflowReviewerStageAssignment> =
              {};
            for (const stage of currentStageColumns) {
              const prevCell = getReviewerStageCell(row, stage.stageKey);
              const pDraft = prevCell.userId.trim();
              const pBase = (prevCell.baselineUserId ?? "").trim();
              if (pDraft !== pBase) {
                reviewerAssignments[stage.stageKey] = prevCell;
                continue;
              }
              const allAssignments =
                roleIdToAssignments.get(stage.roleId) ?? [];
              const byContent = new Map<number, WorkflowUserAssignmentItem>();
              for (const item of allAssignments) {
                if (String(item.scope_type).toUpperCase() !== "AREA") continue;
                byContent.set(item.content_id, item);
              }
              const contentNid = Number.parseInt(row.id, 10);
              const assignment = Number.isFinite(contentNid)
                ? byContent.get(contentNid)
                : undefined;
              if (!assignment) {
                reviewerAssignments[stage.stageKey] =
                  emptyReviewerStageAssignment();
                continue;
              }
              const userList = reviewerIam[stage.roleCode] ?? [];
              const userById = new Map(
                userList.map((user) => [String(user.id), user] as const)
              );
              const uid = String(assignment.user_id);
              const user = userById.get(uid);
              reviewerAssignments[stage.stageKey] = {
                userId: uid,
                email: (user?.email ?? "").trim(),
                assigned: true,
                assignmentId: assignment.id,
                baselineUserId: uid,
              };
            }
            return { ...row, reviewerAssignments };
          })
        );
      }

      if (cancelled || reqSeq !== usersAssignmentsFetchSeqRef.current) return;

      if (deFetchWanted && deOk && deAssignments !== null) {
        const iamMap = new Map<string, DatawarehouseUserListItem>();
        for (const u of iamUsersRef.current) iamMap.set(String(u.id), u);
        setDeUserRows((prev) => {
          if (prev.length === 0) return prev;
          return mergeAreaRowsWithAssignments(
            prev,
            deAssignments!,
            iamMap,
            true
          );
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    dwId,
    workflowData,
    usersRole,
    usersAreasLoading,
    usersSelectedRoleCode,
    dataEntryRoles,
    activeUserRowsLength,
    reviewerStageRoleIdsKey,
    configSaving,
    configTab,
  ]);

  useEffect(() => {
    if (!open || configSaving) return;
    if (deUserAssignmentsRoleId == null) return;
    const m = new Map(iamUsers.map((u) => [String(u.id), u] as const));
    setDeUserRows((prev) =>
      prev.map((row) => {
        if (!row.userId.trim()) return row;
        const u = m.get(row.userId.trim());
        if (!u) return row;
        const email = (u.email ?? "").trim();
        if (email === row.email) return row;
        return { ...row, email };
      })
    );
  }, [open, configSaving, iamUsers, deUserAssignmentsRoleId]);

  useEffect(() => {
    if (!open || configSaving) return;
    const selectedRole = dataEntryRoles.find(
      (r) => (r.role_code ?? "").trim() === usersRole.trim()
    );
    const rid = selectedRole?.id;
    if (rid == null || !Number.isFinite(rid) || rid <= 0) return;
    if (deUserAssignmentsRoleId == null || rid !== deUserAssignmentsRoleId) {
      return;
    }
    if (deUserRows.length === 0) return;
    setDeUserRowsByRoleId((m) => ({
      ...m,
      [rid]: deUserRows.map((row) => ({ ...row })),
    }));
  }, [
    open,
    configSaving,
    deUserRows,
    usersRole,
    dataEntryRoles,
    deUserAssignmentsRoleId,
  ]);

  useEffect(() => {
    if (!open || configSaving) return;
    if (reviewerStageColumns.length === 0) return;
    setReviewerUserRows((prev) =>
      prev.map((row) => {
        let next = row;
        for (const stage of reviewerStageColumns) {
          const cell = getReviewerStageCell(next, stage.stageKey);
          if (!cell.userId.trim()) continue;
          const userList = reviewerIamUsersByRoleCode[stage.roleCode] ?? [];
          const user = userList.find((u) => String(u.id) === cell.userId.trim());
          const email = (user?.email ?? "").trim();
          if (email === cell.email) continue;
          next = {
            ...next,
            reviewerAssignments: {
              ...(next.reviewerAssignments ?? {}),
              [stage.stageKey]: { ...cell, email },
            },
          };
        }
        return next;
      })
    );
  }, [open, configSaving, reviewerIamUsersByRoleCode, reviewerStageColumns]);

  // ---------------------------------------------------------------------------
  // Handlers: users tab
  // ---------------------------------------------------------------------------

  const updateUserAreaRow = useCallback(
    (id: string, patch: Partial<WorkflowUserAreaRow>) => {
      setActiveUserRows((prev) =>
        prev.map((row) => {
          if (row.id !== id) return row;
          const next = { ...row, ...patch };
          if ("userId" in patch) {
            next.assigned = next.userId.trim().length > 0;
          }
          return next;
        })
      );
    },
    [setActiveUserRows]
  );

  const applyUserAreaSelectionLocal = useCallback(
    (row: WorkflowUserAreaRow, newUserId: string) => {
      if (!usersSelectedRoleCode) return;
      if (newUserId.trim() === row.userId.trim()) return;
      if (!newUserId.trim()) {
        updateUserAreaRow(row.id, {
          userId: "",
          email: "",
          assigned: false,
        });
        return;
      }
      const u = iamUserById.get(newUserId);
      updateUserAreaRow(row.id, {
        userId: newUserId,
        email: (u?.email ?? "").trim(),
        assigned: true,
      });
    },
    [updateUserAreaRow, iamUserById, usersSelectedRoleCode]
  );

  const applyReviewerStageSelectionLocal = useCallback(
    (row: WorkflowUserAreaRow, stage: ReviewerStageColumnMeta, newUserId: string) => {
      setReviewerUserRows((prev) =>
        prev.map((item) => {
          if (item.id !== row.id) return item;
          const existing = getReviewerStageCell(item, stage.stageKey);
          const nextUserId = newUserId.trim();
          if (nextUserId === existing.userId.trim()) return item;
          if (!nextUserId) {
            return {
              ...item,
              reviewerAssignments: {
                ...(item.reviewerAssignments ?? {}),
                [stage.stageKey]: {
                  ...existing,
                  userId: "",
                  email: "",
                  assigned: false,
                },
              },
            };
          }
          const userList = reviewerIamUsersByRoleCode[stage.roleCode] ?? [];
          const user = userList.find((u) => String(u.id) === nextUserId);
          return {
            ...item,
            reviewerAssignments: {
              ...(item.reviewerAssignments ?? {}),
              [stage.stageKey]: {
                ...existing,
                userId: nextUserId,
                email: (user?.email ?? "").trim(),
                assigned: true,
              },
            },
          };
        })
      );
    },
    [reviewerIamUsersByRoleCode]
  );

  const assignUsersFromFilters = useCallback(() => {
    if (!canAssignUsersFromFilters) return;

    const filteredIds = new Set(filteredUserTableRows.map((row) => row.id));
    if (filteredIds.size === 0) return;

    if (usersSubTab === "data_entry") {
      const userId = usersFilterUserId.trim();
      if (!userId || !usersSelectedRoleCode) return;
      const u = iamUserById.get(userId);
      const email = (u?.email ?? "").trim();

      setDeUserRows((prev) =>
        prev.map((row) => {
          if (!filteredIds.has(row.id)) return row;
          if (isWorkflowPendingReadonly && row.userId.trim()) return row;
          if (row.userId.trim() === userId) return row;
          return { ...row, userId, email, assigned: true };
        })
      );
      return;
    }

    const stagesWithFilter = reviewerStageColumns
      .map((stage) => ({
        stage,
        userId: (reviewerStageFilterUserIds[stage.stageKey] ?? "").trim(),
      }))
      .filter((entry) => entry.userId !== "");
    if (stagesWithFilter.length === 0) return;

    setReviewerUserRows((prev) =>
      prev.map((row) => {
        if (!filteredIds.has(row.id)) return row;
        let reviewerAssignments = row.reviewerAssignments ?? {};
        let changed = false;
        for (const { stage, userId } of stagesWithFilter) {
          const existing = getReviewerStageCell(row, stage.stageKey);
          if (isWorkflowPendingReadonly && existing.assigned) continue;
          if (existing.userId.trim() === userId) continue;
          const userList = reviewerIamUsersByRoleCode[stage.roleCode] ?? [];
          const user = userList.find((u) => String(u.id) === userId);
          reviewerAssignments = {
            ...reviewerAssignments,
            [stage.stageKey]: {
              ...existing,
              userId,
              email: (user?.email ?? "").trim(),
              assigned: true,
            },
          };
          changed = true;
        }
        if (!changed) return row;
        return { ...row, reviewerAssignments };
      })
    );
  }, [
    canAssignUsersFromFilters,
    filteredUserTableRows,
    usersSubTab,
    usersFilterUserId,
    usersSelectedRoleCode,
    iamUserById,
    isWorkflowPendingReadonly,
    reviewerStageColumns,
    reviewerStageFilterUserIds,
    reviewerIamUsersByRoleCode,
  ]);

  const toggleUserRowSelect = useCallback(
    (id: string) => {
      setUsersTableSelected((prev) => {
        const row = activeUserRows.find((item) => item.id === id);
        if (!row || !isUserRowSelectable(row)) return prev;
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [activeUserRows, isUserRowSelectable]
  );

  const selectAllFilteredUsers = useCallback(() => {
    const ids = selectableFilteredUserRowIds;
    setUsersTableSelected((prev) => {
      if (ids.length > 0 && ids.every((id) => prev.has(id))) {
        return new Set();
      }
      return new Set(ids);
    });
  }, [selectableFilteredUserRowIds]);

  useEffect(() => {
    setUsersTableSelected((prev) => {
      if (prev.size === 0) return prev;
      const selectableIds = new Set(
        activeUserRows.filter((row) => isUserRowSelectable(row)).map((row) => row.id)
      );
      const next = new Set<string>();
      for (const id of prev) {
        if (selectableIds.has(id)) {
          next.add(id);
        }
      }
      return next.size === prev.size ? prev : next;
    });
  }, [activeUserRows, isUserRowSelectable]);

  const requestDeleteSelectedUserRows = useCallback(() => {
    if (usersTableSelected.size === 0) {
      toast.message(t("BULK_DELETE_NO_IDS"));
      return;
    }
    const drop = new Set(usersTableSelected);
    const toClear = activeUserRows.filter((r) => {
      if (!drop.has(r.id)) return false;
      if (usersSubTab === "data_entry") {
        return r.userId.trim() !== "" || r.assignmentId != null;
      }
      return reviewerStageColumns.some((stage) => {
        const cell = getReviewerStageCell(r, stage.stageKey);
        return cell.userId.trim() !== "" || cell.assignmentId != null;
      });
    });
    if (toClear.length === 0) {
      toast.message(t("BULK_DELETE_NO_IDS"));
      setUsersTableSelected(new Set());
      return;
    }
    setUserDeleteConfirmOpen(true);
  }, [usersTableSelected, activeUserRows, usersSubTab, reviewerStageColumns, t]);

  const confirmDeleteSelectedUserRows = useCallback(() => {
    const drop = new Set(usersTableSelected);
    setActiveUserRows((prev) =>
      prev.map((row) =>
        !drop.has(row.id)
          ? row
          : usersSubTab === "data_entry"
            ? {
              ...row,
              userId: "",
              email: "",
              assigned: false,
            }
            : {
              ...row,
              reviewerAssignments: reviewerStageColumns.reduce<
                Record<string, WorkflowReviewerStageAssignment>
              >((acc, stage) => {
                const existing = getReviewerStageCell(row, stage.stageKey);
                acc[stage.stageKey] = {
                  ...existing,
                  userId: "",
                  email: "",
                  assigned: false,
                };
                return acc;
              }, { ...(row.reviewerAssignments ?? {}) }),
            }
      )
    );
    setUsersTableSelected(new Set());
    setUserDeleteConfirmOpen(false);
  }, [usersTableSelected, setActiveUserRows, usersSubTab, reviewerStageColumns]);

  const cancelDeleteSelectedUserRows = useCallback(() => {
    setUserDeleteConfirmOpen(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers: review levels
  // ---------------------------------------------------------------------------

  const updateReviewLevelRow = useCallback(
    (index: number, patch: Partial<ReviewLevelDetailRow>) => {
      setReviewLevelRows((prev) =>
        prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
      );
    },
    []
  );

  const beginReviewLevelRowEdit = useCallback(
    (index: number) => {
      if (editingReviewLevelRowIndex === index) return;
      const row = reviewLevelRows[index];
      if (!row) return;
      setEditingReviewLevelRowIndex(index);
      setEditingReviewLevelOriginalRow({ ...row });
    },
    [editingReviewLevelRowIndex, reviewLevelRows]
  );

  const persistReviewLevelRow = useCallback(
    (_index: number, row: ReviewLevelDetailRow): boolean => {
      const level_name = row.name.trim();
      const review_scope_type = (row.scope || "AREA").toUpperCase();
      const role_id = Number.parseInt(row.reviewerRole, 10);
      if (
        !level_name ||
        !review_scope_type ||
        !Number.isFinite(role_id) ||
        role_id <= 0
      ) {
        toast.error(t("REVIEW_STAGE_DETAILS_REQUIRED"));
        return false;
      }
      return true;
    },
    [t]
  );

  const updateReviewLevelRowDraft = useCallback(
    (index: number, patch: Partial<ReviewLevelDetailRow>) => {
      beginReviewLevelRowEdit(index);
      updateReviewLevelRow(index, patch);
    },
    [beginReviewLevelRowEdit, updateReviewLevelRow]
  );

  const saveReviewLevelRowEdit = useCallback(
    (index: number) => {
      const row = reviewLevelRows[index];
      if (!row) return;
      if (!persistReviewLevelRow(index, row)) return;
      setEditingReviewNameCell(null);
      setEditingReviewLevelRowIndex(null);
      setEditingReviewLevelOriginalRow(null);
    },
    [persistReviewLevelRow, reviewLevelRows]
  );

  const cancelReviewLevelRowEdit = useCallback(
    (index: number) => {
      if (editingReviewLevelRowIndex !== index) return;
      if (editingReviewLevelOriginalRow) {
        setReviewLevelRows((prev) =>
          prev.map((row, i) =>
            i === index ? { ...editingReviewLevelOriginalRow } : row
          )
        );
      }
      setEditingReviewNameCell(null);
      setEditingReviewLevelRowIndex(null);
      setEditingReviewLevelOriginalRow(null);
    },
    [editingReviewLevelOriginalRow, editingReviewLevelRowIndex]
  );

  const updateReviewLevelDraftRow = useCallback(
    (patch: Partial<ReviewLevelDetailRow>) => {
      setReviewLevelDraftRow((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  const discardReviewLevelDraft = useCallback(() => {
    setReviewLevelDraftRow(emptyReviewLevelRow());
    setReviewAddRowExpanded(false);
  }, []);

  const applyReviewLevelCount = useCallback(
    (nextValue: string, nextCount: number) => {
      setPanelWfReviewLevels(nextValue);
      setPanelWfReviewLevelsInput(nextValue);
      setReviewLevelRows((prev) =>
        (() => {
          const normalizedRows = prev
            .slice(0, nextCount)
            .map((row, index) => ({ ...row, levelNo: index + 1 }));
          if (normalizedRows.length >= nextCount) return normalizedRows;
          const appendedRows = Array.from(
            { length: nextCount - normalizedRows.length },
            (_, index) => ({
              ...emptyReviewLevelRow(),
              scope: "AREA",
              levelNo: normalizedRows.length + index + 1,
            })
          );
          return [...normalizedRows, ...appendedRows];
        })()
      );
      if (nextCount === 0) {
        setReviewAddRowExpanded(false);
        setReviewLevelDraftRow(emptyReviewLevelRow());
      }
      setEditingReviewNameCell((prev) =>
        prev != null && prev >= nextCount ? null : prev
      );
    },
    []
  );

  const handleReviewLevelsCountInputChange = useCallback(
    (rawValue: string) => {
      const normalized = normalizeReviewLevelsInput(rawValue, {
        notify: true,
      });
      setPanelWfReviewLevelsInput(normalized.value);
      const nextCount = normalized.count;
      const currentConfiguredCount =
        normalizeReviewLevelsInput(panelWfReviewLevels).count;
      if (normalized.value === panelWfReviewLevels) {
        setPanelWfReviewLevelsInput(panelWfReviewLevels);
        return;
      }
      const trimmedRows = reviewLevelRows.slice(nextCount);
      const hasTrimmedDetails = trimmedRows.some(
        (row) =>
          (typeof row.levelId === "number" && row.levelId > 0) ||
          row.name.trim() !== "" ||
          row.scope.trim() !== "" ||
          row.reviewerRole.trim() !== ""
      );
      if (nextCount < currentConfiguredCount && hasTrimmedDetails) {
        setPendingReviewLevelTrim({
          previousValue: panelWfReviewLevels,
          nextValue: normalized.value,
          nextCount,
          removedCount: trimmedRows.length,
        });
        setReviewLevelTrimConfirmOpen(true);
        return;
      }
      applyReviewLevelCount(normalized.value, nextCount);
    },
    [
      applyReviewLevelCount,
      normalizeReviewLevelsInput,
      panelWfReviewLevels,
      reviewLevelRows,
    ]
  );

  const confirmReviewLevelTrim = useCallback(() => {
    if (!pendingReviewLevelTrim) return;
    const { nextValue, nextCount } = pendingReviewLevelTrim;

    if (dwId && workflowData) {
      const idsToDelete = reviewLevelRows
        .slice(nextCount)
        .filter((r) => typeof r.levelId === "number" && r.levelId > 0)
        .map((r) => r.levelId!);
      if (idsToDelete.length > 0) {
        setPendingReviewLevelDeletes((prev) => [...prev, ...idsToDelete]);
      }
    }

    applyReviewLevelCount(nextValue, nextCount);
    setReviewLevelTrimConfirmOpen(false);
    setPendingReviewLevelTrim(null);
  }, [
    applyReviewLevelCount,
    workflowData,
    dwId,
    pendingReviewLevelTrim,
    reviewLevelRows,
  ]);

  const cancelReviewLevelTrim = useCallback(() => {
    if (pendingReviewLevelTrim) {
      setPanelWfReviewLevelsInput(pendingReviewLevelTrim.previousValue);
    }
    setReviewLevelTrimConfirmOpen(false);
    setPendingReviewLevelTrim(null);
  }, [pendingReviewLevelTrim]);

  const handleReviewLevelAddSave = useCallback(() => {
    const normalized = normalizeReviewLevelsInput(panelWfReviewLevels, {
      notify: true,
    });
    if (normalized.value !== panelWfReviewLevels) {
      setPanelWfReviewLevels(normalized.value);
    }
    if (normalized.count <= 0) return;
    if (reviewLevelRows.length >= normalized.count) return;

    const draft = { ...reviewLevelDraftRow };
    const nextLevelNo = reviewLevelRows.length + 1;
    const level_name = draft.name.trim();
    const area_level = Number.parseInt(draft.areaLevel, 10);
    const role_id = Number.parseInt(draft.reviewerRole, 10);
    if (
      !level_name ||
      !Number.isFinite(area_level) ||
      area_level <= 0 ||
      !Number.isFinite(role_id) ||
      role_id <= 0
    ) {
      toast.error(t("REVIEW_STAGE_DETAILS_REQUIRED"));
      return;
    }

    setReviewLevelRows((prev) => [
      ...prev,
      { ...draft, levelNo: nextLevelNo },
    ]);
    discardReviewLevelDraft();
  }, [
    normalizeReviewLevelsInput,
    panelWfReviewLevels,
    reviewLevelRows.length,
    reviewLevelDraftRow,
    discardReviewLevelDraft,
    t,
  ]);

  const focusReviewLevelCell = useCallback(
    (rowIndex: number, colIndex: number) => {
      const selector = `[data-dm-wf-review-nav-row="${rowIndex}"][data-dm-wf-review-nav-col="${colIndex}"]`;
      const target = document.querySelector<HTMLElement>(selector);
      if (!target) return false;
      target.focus();
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
      return true;
    },
    []
  );

  const handleReviewLevelCellKeyDown = useCallback(
    (
      event: ReactKeyboardEvent<HTMLElement>,
      rowIndex: number,
      colIndex: number
    ) => {
      if (event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const key = event.key;
      const current = event.currentTarget;
      const isReviewNameViewButton =
        colIndex === 0 &&
        current instanceof HTMLButtonElement &&
        current.dataset.dmWfReviewNameView === "true";
      const isPrintableKey = key.length === 1;
      if (isReviewNameViewButton && isPrintableKey) {
        event.preventDefault();
        beginReviewLevelRowEdit(rowIndex);
        setEditingReviewNameCell(rowIndex);
        updateReviewLevelRow(rowIndex, { name: key });
        setTimeout(() => {
          const selector = `[data-dm-wf-review-nav-row="${rowIndex}"][data-dm-wf-review-nav-col="0"]`;
          const target = document.querySelector<HTMLInputElement>(selector);
          if (!target) return;
          target.setSelectionRange(1, 1);
        }, 0);
        return;
      }
      if (
        key !== "Enter" &&
        key !== "ArrowUp" &&
        key !== "ArrowDown" &&
        key !== "ArrowLeft" &&
        key !== "ArrowRight"
      ) {
        return;
      }

      const totalRows =
        reviewLevelRows.length + (reviewAddRowExpanded ? 1 : 0);

      if (key === "Enter") {
        event.preventDefault();
        const current = event.currentTarget;
        if (
          colIndex === 0 &&
          current instanceof HTMLButtonElement &&
          current.dataset.dmWfReviewNameView === "true"
        ) {
          beginReviewLevelRowEdit(rowIndex);
          setEditingReviewNameCell(rowIndex);
          setTimeout(() => {
            focusReviewLevelCell(rowIndex, 0);
          }, 0);
          return;
        }
        if (colIndex < REVIEW_LEVEL_NAV_COLS - 1) {
          void focusReviewLevelCell(rowIndex, colIndex + 1);
          return;
        }

        const isAddRow =
          reviewAddRowExpanded && rowIndex === reviewLevelRows.length;
        if (isAddRow) {
          const reviewLimit =
            normalizeReviewLevelsInput(panelWfReviewLevels).count;
          const isDraftComplete =
            reviewLevelDraftRow.name.trim() !== "" &&
            reviewLevelDraftRow.scope !== "" &&
            reviewLevelDraftRow.areaLevel !== "" &&
            reviewLevelDraftRow.reviewerRole !== "";
          if (!isDraftComplete || reviewLevelRows.length >= reviewLimit) {
            return;
          }
          const nextFocusRow = reviewLevelRows.length;
          handleReviewLevelAddSave();
          setTimeout(() => {
            focusReviewLevelCell(nextFocusRow, 0);
          }, 0);
          return;
        }

        const isExistingRowInEdit = editingReviewLevelRowIndex === rowIndex;
        if (isExistingRowInEdit) {
          const nextFocusRow = rowIndex + 1;
          void saveReviewLevelRowEdit(rowIndex);
          if (nextFocusRow < totalRows) {
            setTimeout(() => {
              void focusReviewLevelCell(nextFocusRow, 0);
            }, 0);
          }
          return;
        }

        const nextRow = rowIndex + 1;
        if (nextRow < totalRows) {
          void focusReviewLevelCell(nextRow, 0);
        }
        return;
      }

      if (current instanceof HTMLInputElement && current.type === "text") {
        const start = current.selectionStart ?? 0;
        const end = current.selectionEnd ?? 0;
        const len = current.value.length;
        if (key === "ArrowLeft" && (start !== end || start > 0)) return;
        if (key === "ArrowRight" && (start !== end || end < len)) return;
      }

      let nextRow = rowIndex;
      let nextCol = colIndex;

      if (key === "ArrowUp") nextRow -= 1;
      if (key === "ArrowDown") nextRow += 1;
      if (key === "ArrowLeft") nextCol -= 1;
      if (key === "ArrowRight") nextCol += 1;

      if (
        nextRow < 0 ||
        nextCol < 0 ||
        nextRow >= totalRows ||
        nextCol >= REVIEW_LEVEL_NAV_COLS
      ) {
        return;
      }

      if (focusReviewLevelCell(nextRow, nextCol)) {
        event.preventDefault();
      }
    },
    [
      focusReviewLevelCell,
      beginReviewLevelRowEdit,
      editingReviewLevelRowIndex,
      handleReviewLevelAddSave,
      normalizeReviewLevelsInput,
      panelWfReviewLevels,
      reviewAddRowExpanded,
      setEditingReviewNameCell,
      updateReviewLevelRow,
      saveReviewLevelRowEdit,
      reviewLevelDraftRow,
      reviewLevelRows.length,
    ]
  );

  // ---------------------------------------------------------------------------
  // Save handler
  // ---------------------------------------------------------------------------

  const handleConfigSave = useCallback(async () => {
    if (!dwId || !workflowData || configSaving) return;
    const nextTabErrorCounts: WorkflowConfigTabErrorCounts = {
      workflow: 0,
      data_entry: 0,
      users: 0,
    };
    setConfigTabErrorCounts({ ...nextTabErrorCounts });
    const shouldValidateConfigTabs =
      !isWorkflowPendingReadonly && configTab !== "users";
    const workflowValidation = shouldValidateConfigTabs
      ? validateWorkflowTabMandatoryFields({
        notify: true,
        tabErrorCounts: nextTabErrorCounts,
        syncState: true,
      })
      : {
        ok: true,
        normalizedReviewLevels: panelWfAllowReview
          ? normalizeReviewLevelsInput(panelWfReviewLevels)
          : { value: "", count: 0, isEmpty: true },
      };
    if (!workflowValidation.ok) {
      setConfigTabErrorCounts({ ...nextTabErrorCounts });
      return;
    }
    const normalizedReviewLevels = workflowValidation.normalizedReviewLevels;
    if (
      shouldValidateConfigTabs &&
      !validateDataEntryTabMandatoryFields({
        notify: true,
        setFieldErrors: true,
        tabErrorCounts: nextTabErrorCounts,
      })
    ) {
      setConfigTabErrorCounts({ ...nextTabErrorCounts });
      return;
    }
    const effectiveDeApplyConstraints = isWorkflowPendingReadonly
      ? Boolean(workflowData.constraint_data_entry) ||
        Boolean(workflowData.allow_review)
      : panelWfAllowReview || deApplyConstraints;
    setConfigSaving(true);
    try {
      const slicedLevelRows = !isWorkflowPendingReadonly && panelWfAllowReview
        ? reviewLevelRows.slice(0, normalizedReviewLevels.count)
        : [];
      const reviewLevelPayloads: WorkflowLevelUpsertPayload[] =
        slicedLevelRows.map((row, index) => {
          return {
            level_no: index + 1,
            level_name: row.name.trim(),
            review_scope_type: (row.scope || "AREA").toUpperCase(),
            role_id: Number.parseInt(row.reviewerRole, 10),
            classification_parent_nid: 0,
            include_children: false,
            is_final_level: index + 1 === normalizedReviewLevels.count,
            is_active: true,
          };
        });
      const uniquePendingDeletes = [...new Set(pendingReviewLevelDeletes)];
      if (!isWorkflowPendingReadonly && uniquePendingDeletes.length > 0) {
        for (const levelId of uniquePendingDeletes) {
          const delRes = await removeWorkflowLevel(
            dwId,
            workflowData.workflow_id,
            levelId
          );
          if (!delRes.success) {
            toast.error(
              (delRes as { err_message?: string }).err_message ??
              "Failed to delete workflow level"
            );
            return;
          }
        }
        setPendingReviewLevelDeletes([]);
      }

      const payload: UpdateWorkflowPayload = isWorkflowPendingReadonly
        ? { workflow_name: panelWfName.trim() || undefined }
        : {
          workflow_name: panelWfName.trim() || undefined,
          is_active: panelWfActive,
          allow_review: panelWfAllowReview,
          constraint_data_entry: effectiveDeApplyConstraints,
          ...(panelWfAllowReview && !normalizedReviewLevels.isEmpty
            ? { review_level_count: normalizedReviewLevels.count }
            : {}),
        };
      const res = await updateWorkflow(
        dwId,
        workflowData.workflow_id,
        payload
      );
      if (!res.success) {
        toast.error(
          (res as { err_message?: string }).err_message ??
          t("WORKFLOW_UPDATE_FAILED")
        );
        return;
      }
      if (!isWorkflowPendingReadonly && panelWfAllowReview && reviewLevelPayloads.length > 0) {
        const levelRes = await upsertWorkflowLevels(
          dwId,
          workflowData.workflow_id,
          reviewLevelPayloads
        );
        if (!levelRes.success) {
          toast.error(
            levelRes.err_message ?? "Failed to save workflow levels"
          );
          return;
        }
        const savedRows = [...(levelRes.data ?? [])]
          .sort((a, b) => a.level_no - b.level_no)
          .map((level, i) => ({
            ...mapWorkflowLevelToRow(level),
            reviewerRole: reviewLevelRows[i]?.reviewerRole ?? "",
          }));
        if (savedRows.length > 0) {
          setReviewLevelRows(savedRows);
        }
      }
      if (!isWorkflowPendingReadonly && effectiveDeApplyConstraints) {
        const dePayload: UpsertDataEntryPayload = {
          scope_timeperiod: deFormTimePeriod || "SINGLE",
          scope_indicator: deFormIndicator || "SINGLE",
          scope_area: deFormArea || "SINGLE",
          timeperiod_frequency: normalizeDataEntryTimeperiodFrequency(
            deTimePeriodFrequency
          ),
          area_level:
            deLowerAreaLevel === DATA_ENTRY_AREA_LEVEL_ANY
              ? 0
              : getAreaLevelPayloadValue(deLowerAreaLevel),
          allow_child_areas: false,
          show_previous_time: deShowPreviousTime,
          // Data Entry Role is intentionally omitted from Data Entry API payload.
          role_id: null,
          curr_timeperiod_nid: parseWorkflowDeTimePeriodNid(deCurrTimePeriodNid),
        };
        const deRes = await upsertWorkflowDataEntry(
          dwId,
          workflowData.workflow_id,
          dePayload
        );
        if (!deRes.success) {
          toast.error(deRes.err_message ?? t("WORKFLOW_UPDATE_FAILED"));
          return;
        }
      }

      const iamMap = new Map<string, DatawarehouseUserListItem>();
      for (const u of iamUsers) iamMap.set(String(u.id), u);

      const selectedDeRolePersist = dataEntryRoles.find(
        (r) => (r.role_code ?? "").trim() === usersRole.trim()
      );
      const currentDeRidPersist =
        selectedDeRolePersist?.id != null &&
          Number.isFinite(selectedDeRolePersist.id) &&
          selectedDeRolePersist.id > 0
          ? selectedDeRolePersist.id
          : null;

      const combinedDeRowsByRoleId: Record<number, WorkflowUserAreaRow[]> = {
        ...deUserRowsByRoleId,
      };
      if (currentDeRidPersist != null && deUserRows.length > 0) {
        combinedDeRowsByRoleId[currentDeRidPersist] = deUserRows.map((r) => ({
          ...r,
        }));
      }

      const deHasAnyDirty = Object.values(combinedDeRowsByRoleId).some((rows) =>
        rows.some(
          (row) =>
            row.userId.trim() !== (row.baselineUserId ?? "").trim()
        )
      );

      const shouldPersistDe =
        Object.keys(combinedDeRowsByRoleId).length > 0 && deHasAnyDirty;

      const shouldPersistReviewers =
        reviewerStageColumns.length > 0 && reviewerUserRows.length > 0;

      if (shouldPersistDe || shouldPersistReviewers) {
        const ua = await persistAllWorkflowUserAssignmentRows(
          dwId,
          workflowData.workflow_id,
          {
            deRowsByRoleId: shouldPersistDe ? combinedDeRowsByRoleId : {},
            currentDisplayDeRoleId: shouldPersistDe
              ? currentDeRidPersist
              : null,
            setDeRowsByRoleId: setDeUserRowsByRoleId,
            setDeRows: setDeUserRows,
            stageColumns: shouldPersistReviewers ? reviewerStageColumns : [],
            roleByStage: shouldPersistReviewers
              ? reviewerUserAssignmentsRoleByStage
              : {},
            reviewerRows: reviewerUserRows,
            setReviewerRows: setReviewerUserRows,
            iamUserById: iamMap,
            iamUsersByRoleCode: reviewerIamUsersByRoleCode,
          }
        );
        if (!ua.success) {
          toast.error(ua.err_message);
          return;
        }
      }

      setConfigTabErrorCounts(EMPTY_WORKFLOW_CONFIG_TAB_ERROR_COUNTS);
      toast.success(t("WORKFLOW_UPDATE_SUCCESS"));
      onSaved();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("WORKFLOW_UPDATE_FAILED")
      );
    } finally {
      setConfigSaving(false);
    }
  }, [
    dwId,
    workflowData,
    configSaving,
    configTab,
    isWorkflowPendingReadonly,
    panelWfName,
    panelWfActive,
    panelWfAllowReview,
    panelWfReviewLevels,
    normalizeReviewLevelsInput,
    validateWorkflowTabMandatoryFields,
    validateDataEntryTabMandatoryFields,
    reviewLevelRows,
    workflowAreaLevelsLoaded,
    mapWorkflowLevelToRow,
    pendingReviewLevelDeletes,
    deApplyConstraints,
    deTimePeriodFrequency,
    deCurrTimePeriodNid,
    deLowerAreaLevel,
    getAreaLevelPayloadValue,
    deAllowChildrenArea,
    deFormTimePeriod,
    deFormArea,
    deFormIndicator,
    deShowPreviousTime,
    onSaved,
    onClose,
    t,
    iamUsers,
    deUserRows,
    deUserRowsByRoleId,
    usersRole,
    dataEntryRoles,
    reviewerUserRows,
    reviewerStageColumns,
    reviewerUserAssignmentsRoleByStage,
    reviewerIamUsersByRoleCode,
  ]);

  // ---------------------------------------------------------------------------
  // Dirty check & reset
  // ---------------------------------------------------------------------------

  const getReviewLevelsInitialValue = useCallback(
    (row: WorkflowListItem | null): string => {
      if (!row) return "";
      const countRaw = row.review_level_count;
      if (typeof countRaw === "number") {
        const n = Math.max(0, Math.trunc(countRaw));
        if (Boolean(row.allow_review) && n === 0) return "1";
        return String(n);
      }
      return Boolean(row.allow_review) ? "1" : "0";
    },
    []
  );

  const normalizeReviewRowForCompare = useCallback(
    (row: ReviewLevelDetailRow) => {
      return {
        name: row.name.trim(),
        scope: (row.scope ?? "").trim().toUpperCase(),
        reviewerRole: String(row.reviewerRole ?? "").trim(),
      };
    },
    []
  );

  const areReviewRowsEqual = useCallback(
    (a: ReviewLevelDetailRow[], b: ReviewLevelDetailRow[]) => {
      if (a.length !== b.length) return false;
      return a.every((row, index) => {
        const left = normalizeReviewRowForCompare(row);
        const right = normalizeReviewRowForCompare(b[index]);
        return (
          left.name === right.name &&
          left.scope === right.scope &&
          left.reviewerRole === right.reviewerRole
        );
      });
    },
    [normalizeReviewRowForCompare]
  );

  const hasWorkflowConfigDraftChanges = useMemo(() => {
    if (!workflowData) return false;
    if (pendingReviewLevelDeletes.length > 0) return true;

    const initialReviewLevels = getReviewLevelsInitialValue(workflowData);
    const reviewLevelsDirty =
      panelWfAllowReview &&
      normalizeReviewLevelsInput(panelWfReviewLevels).value !==
      initialReviewLevels;
    const reviewLevelsInputDirty =
      panelWfAllowReview &&
      normalizeReviewLevelsInput(panelWfReviewLevelsInput).value !==
      panelWfReviewLevels;
    const reviewRowsDirty = !areReviewRowsEqual(
      reviewLevelRows,
      initialReviewLevelRows
    );
    const reviewDraftDirty =
      reviewAddRowExpanded ||
      reviewLevelDraftRow.name.trim() !== "" ||
      reviewLevelDraftRow.scope !== "" ||
      reviewLevelDraftRow.reviewerRole !== "" ||
      editingReviewNameCell !== null ||
      editingReviewLevelRowIndex !== null;

    const ini = initialDeConfigRef.current;
    const deFieldsDirty =
      deApplyConstraints &&
      ini != null &&
      (deTimePeriodFrequency !== ini.timeperiod_frequency ||
        deCurrTimePeriodNid !== ini.curr_timeperiod_nid ||
        deLowerAreaLevel !== ini.area_level ||
        deAllowChildrenArea !== ini.allow_child_areas ||
        deFormTimePeriod !== ini.scope_timeperiod ||
        deFormArea !== ini.scope_area ||
        deFormIndicator !== ini.scope_indicator ||
        deShowPreviousTime !== ini.show_previous_time);

    return (
      panelWfName.trim() !== (workflowData.workflow_name ?? "").trim() ||
      panelWfActive !== Boolean(workflowData.is_active) ||
      panelWfAllowReview !== Boolean(workflowData.allow_review) ||
      reviewLevelsDirty ||
      reviewLevelsInputDirty ||
      reviewRowsDirty ||
      reviewDraftDirty ||
      deApplyConstraints !==
      (Boolean(workflowData.constraint_data_entry) ||
        Boolean(workflowData.allow_review)) ||
      deFieldsDirty
    );
  }, [
    workflowData,
    panelWfName,
    panelWfActive,
    panelWfAllowReview,
    panelWfReviewLevels,
    panelWfReviewLevelsInput,
    normalizeReviewLevelsInput,
    reviewLevelRows,
    initialReviewLevelRows,
    reviewAddRowExpanded,
    reviewLevelDraftRow.name,
    reviewLevelDraftRow.scope,
    reviewLevelDraftRow.reviewerRole,
    editingReviewNameCell,
    editingReviewLevelRowIndex,
    deApplyConstraints,
    deTimePeriodFrequency,
    deCurrTimePeriodNid,
    deLowerAreaLevel,
    deAllowChildrenArea,
    deFormTimePeriod,
    deFormArea,
    deFormIndicator,
    deShowPreviousTime,
    getReviewLevelsInitialValue,
    areReviewRowsEqual,
    pendingReviewLevelDeletes,
  ]);

  const workflowDrawerTitle = useMemo(() => {
    const workflowName =
      panelWfName.trim() || (workflowData?.workflow_name ?? "").trim();
    if (workflowName) {
      const prefix = t("WORKFLOW");
      return `${prefix === "WORKFLOW" ? "Workflow" : prefix}: ${workflowName}`;
    }

    const translatedTitle = t("WORKFLOW_SETTINGS");
    return translatedTitle === "WORKFLOW_SETTINGS"
      ? "Workflow Settings"
      : translatedTitle;
  }, [panelWfName, t, workflowData]);

  const resetWorkflowConfigDraft = useCallback(() => {
    if (!workflowData) return;
    setReviewLevelTrimConfirmOpen(false);
    setPendingReviewLevelTrim(null);
    setPendingReviewLevelDeletes([]);
    setUserDeleteConfirmOpen(false);
    setPanelWfName(workflowData.workflow_name ?? "");
    setPanelWfActive(Boolean(workflowData.is_active));
    setPanelWfAllowReview(Boolean(workflowData.allow_review));
    const initialReviewLevels = getReviewLevelsInitialValue(workflowData);
    setPanelWfReviewLevels(initialReviewLevels);
    setPanelWfReviewLevelsInput(initialReviewLevels);
    setReviewLevelRows(initialReviewLevelRows.map((row) => ({ ...row })));
    setEditingReviewNameCell(null);
    setEditingReviewLevelRowIndex(null);
    setEditingReviewLevelOriginalRow(null);
    setReviewAddRowExpanded(false);
    setReviewLevelDraftRow(emptyReviewLevelRow());
    setDeApplyConstraints(
      Boolean(workflowData.constraint_data_entry) ||
      Boolean(workflowData.allow_review)
    );
    const ini = initialDeConfigRef.current;
    setDeTimePeriodFrequency(ini?.timeperiod_frequency ?? "ALL");
    setDeCurrTimePeriodNid(ini?.curr_timeperiod_nid ?? "");
    setDeLowerAreaLevel(ini?.area_level ?? "");
    setDeAllowChildrenArea(false);
    setDeAreaLevelError("");
    setDeCurrTimePeriodError("");
    setConfigTabErrorCounts(EMPTY_WORKFLOW_CONFIG_TAB_ERROR_COUNTS);
    setDeFormTimePeriod(ini?.scope_timeperiod ?? "");
    setDeFormArea(ini?.scope_area ?? "");
    setDeFormIndicator(ini?.scope_indicator ?? "");
    setDeShowPreviousTime(ini?.show_previous_time ?? false);
  }, [workflowData, getReviewLevelsInitialValue, initialReviewLevelRows]);

  const handleDrawerEscapeFirst = useCallback((): boolean => {
    if (hasWorkflowConfigDraftChanges) {
      resetWorkflowConfigDraft();
      return true;
    }
    return false;
  }, [hasWorkflowConfigDraftChanges, resetWorkflowConfigDraft]);

  // ---------------------------------------------------------------------------
  // Focus when drawer opens (shared Drawer handles Escape → onClose / draft reset)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active.closest("[data-tv-nav-row='true']")
    ) {
      active.blur();
    }
    requestAnimationFrame(() => {
      configPanelRef.current?.focus();
    });
  }, [open]);

  // ---------------------------------------------------------------------------
  // Column defs for ServerDrivenListTbody
  // ---------------------------------------------------------------------------

  const reviewLevelTableColumns = useMemo(
    (): EditableGridColumnDef<ReviewLevelDetailRow>[] => [
      {
        id: "stage",
        header: t("STAGE"),
        tdExtraProps: { className: "w-10 whitespace-nowrap text-center text-text-muted" },
        cell: ({ rowIndex }) => <>{rowIndex + 1}</>,
      },
      {
        id: "name",
        header: t("NAME"),
        cell: ({ row, rowIndex }) => {
          const isEditing = editingReviewNameCell === rowIndex;
          return isEditing ? (
            <input
              type="text"
              className="field-comp--md w-full min-w-0"
              data-dm-wf-review-nav-row={rowIndex}
              data-dm-wf-review-nav-col={0}
              value={row.name}
              onChange={(e) =>
                updateReviewLevelRowDraft(rowIndex, { name: e.target.value })
              }
              onKeyDown={(event) =>
                handleReviewLevelCellKeyDown(event, rowIndex, 0)
              }
              onBlur={() => setEditingReviewNameCell(null)}
              placeholder={t("PLACEHOLDER_ADD_REVIEW_STAGE")}
              aria-label={`${t("NAME")} ${rowIndex + 1}`}
              autoFocus
            />
          ) : (
            <button
              type="button"
              className="field-comp--md w-full text-left"
              data-dm-wf-review-nav-row={rowIndex}
              data-dm-wf-review-nav-col={0}
              data-dm-wf-review-name-view="true"
              onDoubleClick={() => {
                beginReviewLevelRowEdit(rowIndex);
                setEditingReviewNameCell(rowIndex);
              }}
              onKeyDown={(event) =>
                handleReviewLevelCellKeyDown(event, rowIndex, 0)
              }
              aria-label={`${t("NAME")} ${rowIndex + 1}`}
              title={row.name || t("PLACEHOLDER_ADD_REVIEW_STAGE")}
            >
              {row.name || (
                <span className="text-text-muted">
                  {t("PLACEHOLDER_ADD_REVIEW_STAGE")}
                </span>
              )}
            </button>
          );
        },
      },
      {
        id: "scope",
        header: t("SCOPE"),
        cell: ({ row, rowIndex }) => (
          <SelectField
            className="w-full min-w-0"
            data-dm-wf-review-nav-row={rowIndex}
            data-dm-wf-review-nav-col={1}
            value={row.scope}
            onChange={(e) =>
              updateReviewLevelRowDraft(rowIndex, { scope: e.target.value })
            }
            onKeyDown={(event) =>
              handleReviewLevelCellKeyDown(event, rowIndex, 1)
            }
            aria-label={`${t("SCOPE")} ${rowIndex + 1}`}
          >
            <option value="" disabled>
              {t("PLACEHOLDER_SELECT")}
            </option>
            <option value="AREA">{t("AREA")}</option>
          </SelectField>
        ),
      },
      {
        id: "reviewerRole",
        header: t("REVIEWER_ROLE"),
        cell: ({ row, rowIndex }) => (
          <SelectField
            className="w-full min-w-0"
            data-dm-wf-review-nav-row={rowIndex}
            data-dm-wf-review-nav-col={2}
            value={pickMappedSelectValue(row.reviewerRole, reviewerRoleOptions)}
            onChange={(e) =>
              updateReviewLevelRowDraft(rowIndex, { reviewerRole: e.target.value })
            }
            onKeyDown={(event) =>
              handleReviewLevelCellKeyDown(event, rowIndex, 2)
            }
            aria-label={`${t("REVIEWER_ROLE")} ${rowIndex + 1}`}
          >
            <option value="" disabled>
              {t("PLACEHOLDER_SELECT")}
            </option>
            {reviewerRoleOptions.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </SelectField>
        ),
      },
    ],
    [
      t,
      editingReviewNameCell,
      reviewerRoleOptions,
      handleReviewLevelCellKeyDown,
      updateReviewLevelRowDraft,
      beginReviewLevelRowEdit,
      setEditingReviewNameCell,
    ]
  );

  const usersTableColumns = useMemo(
    (): EditableGridColumnDef<WorkflowUserAreaRow>[] => {
      const checkboxCol: EditableGridColumnDef<WorkflowUserAreaRow> = {
        id: "select",
        header: "",
        tdExtraProps: {
          className: "w-11 text-center align-middle",
          style: {
            overflow: "visible",
            textOverflow: "clip",
            whiteSpace: "normal",
          },
        },
        cell: ({ row }) => {
          const isRowSelectable = isUserRowSelectable(row);
          return (
            <span
              className="inline-flex"
              title={
                isRowSelectable ? undefined : usersDisabledRowCheckboxTooltip
              }
            >
              <input
                type="checkbox"
                className={`checkbox-comp mx-auto block ${
                  isRowSelectable
                    ? "cursor-pointer"
                    : "cursor-not-allowed opacity-50"
                }`}
                checked={usersTableSelected.has(row.id)}
                disabled={!isRowSelectable}
                onChange={() => toggleUserRowSelect(row.id)}
                aria-label={`${t("AREA")} ${row.areaLabel}`}
              />
            </span>
          );
        },
      };

      const areaCol: EditableGridColumnDef<WorkflowUserAreaRow> = {
        id: "area",
        header: "",
        tdExtraProps: {
          className: "min-w-0",
          style: {
            overflow: "hidden",
            textOverflow: "clip",
            whiteSpace: "normal",
          },
        },
        cell: ({ row }) => {
          const label =
            (row.areaCode ?? "").trim()
              ? `${row.areaLabel} (${row.areaCode})`
              : row.areaLabel;
          return (
            <span className="block min-w-0 text-xs text-text" title={label}>
              {label}
            </span>
          );
        },
      };


      if (isReviewerUsersSubTab) {
        return [
          checkboxCol,
          areaCol,
          ...reviewerStageColumns.map(
            (stage): EditableGridColumnDef<WorkflowUserAreaRow> => ({
              id: `stage-${stage.stageKey}`,
              header: stage.stageName,
              cell: ({ row }) => {
                const stageCell = getReviewerStageCell(row, stage.stageKey);
                const stageOptions =
                  reviewerRowUserOptionsByStage.get(stage.stageKey) ?? [];
                return (
                  <SelectField
                    ref={(el) =>
                      setWorkflowUsersSelectRef(row.id, stage.stageKey, el)
                    }
                    className="w-full min-w-0"
                    menuPortal
                    closeOnScroll
                    menuGrowToFitContent
                    value={pickMappedSelectValue(stageCell.userId, stageOptions)}
                    disabled={configSaving || iamUsersLoading || (isWorkflowPendingReadonly && stageCell.assigned)}
                    onKeyDown={(e) =>
                      handleWorkflowUserSelectKeyDown(e, row.id, stage.stageKey)
                    }
                    onChange={(e) =>
                      applyReviewerStageSelectionLocal(row, stage, e.target.value)
                    }
                    options={[
                      {
                        value: "",
                        label: t("SELECT_USER"),
                        disabled: true,
                      },
                      ...stageOptions,
                    ]}
                  />
                );
              },
            })
          ),
        ];
      }

      return [
        checkboxCol,
        areaCol,
        {
          id: "user",
          header: "",
          cell: ({ row }) => (
            <SelectField
              ref={(el) =>
                setWorkflowUsersSelectRef(row.id, "default", el)
              }
              className="w-full min-w-0"
              menuPortal
              closeOnScroll
              menuGrowToFitContent
              value={pickMappedSelectValue(row.userId, rowUserSelectOptions)}
              disabled={
                configSaving || iamUsersLoading || !usersSelectedRoleCode ||
                (isWorkflowPendingReadonly && !!row.userId.trim())
              }
              onKeyDown={(e) =>
                handleWorkflowUserSelectKeyDown(e, row.id, "default")
              }
              onChange={(e) => {
                applyUserAreaSelectionLocal(row, e.target.value);
              }}
              options={[
                {
                  value: "",
                  label: t("SELECT_USER"),
                  disabled: true,
                },
                ...rowUserSelectOptions,
              ]}
            />
          ),
        },
      ];
    },
    [
      t,
      isReviewerUsersSubTab,
      reviewerStageColumns,
      reviewerRowUserOptionsByStage,
      rowUserSelectOptions,
      usersTableSelected,
      isUserRowSelectable,
      usersDisabledRowCheckboxTooltip,
      toggleUserRowSelect,
      configSaving,
      iamUsersLoading,
      usersSelectedRoleCode,
      isWorkflowPendingReadonly,
      setWorkflowUsersSelectRef,
      handleWorkflowUserSelectKeyDown,
      applyReviewerStageSelectionLocal,
      applyUserAreaSelectionLocal,
    ]
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        closeOnOverlayClick={false}
        allowBackgroundInteraction={open}
        title={<span id="dm-workflow-config-title">{workflowDrawerTitle}</span>}
        headerActions={
          <PrimarySaveButton
            onClick={() => void handleConfigSave()}
            disabled={configSaving || workflowLoading}
          >
            {configSaving ? t("SAVING") : t("SAVE")}
          </PrimarySaveButton>
        }
        width="52%"
        zIndexClassName="z-[500]"
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        onEscapeFirst={handleDrawerEscapeFirst}
      >
        <div
          ref={configPanelRef}
          id="dm-workflow-config-panel"
          tabIndex={-1}
          className="flex min-h-0 flex-1 flex-col overflow-hidden outline-none"
        >
          <MainTabsBar
            tabRole
            tabs={[
              {
                value: "workflow" as WorkflowConfigTab,
                icon: "shield",
                label:
                  configTabErrorCounts.workflow > 0
                    ? `${t("WORKFLOW")} * (${configTabErrorCounts.workflow})`
                    : t("WORKFLOW"),
              },
              {
                value: "data_entry" as WorkflowConfigTab,
                icon: "edit_note",
                label:
                  configTabErrorCounts.data_entry > 0
                    ? `${t("DATA_ENTRY")} * (${configTabErrorCounts.data_entry})`
                    : t("DATA_ENTRY"),
              },
              {
                value: "users" as WorkflowConfigTab,
                icon: "group",
                label:
                  configTabErrorCounts.users > 0
                    ? `${t("USERS")} * (${configTabErrorCounts.users})`
                    : t("USERS"),
              },
            ]}
            activeValue={configTab}
            onSelect={handleConfigTabSelect}
          />
          <div className="sp-body-wrap flex min-h-0 flex-1 flex-col">
            <div
              className={
                configTab === "users"
                  ? "sp-body drawer-body-muted flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden py-5 px-6"
                  : "sp-body drawer-body-muted min-h-0 min-w-0 flex-1 overflow-y-auto py-5 px-6"
              }
              id="dm-workflow-config-body"
            >
              {configTab === "workflow" && workflowData && (
                <div className="config-stack">
                  <section
                    className="config-card"
                    aria-labelledby="dm-wf-card-workflow-heading"
                  >
                    <h3
                      className="config-card-title"
                      id="dm-wf-card-workflow-heading"
                    >
                      {t("WORKFLOW_SETTINGS")}
                    </h3>
                    <div className="config-card-inner">
                      <div className="sp-field">
                        <label className="form-label" htmlFor="dm-wf-name">
                          {t("NAME")}
                        </label>
                        <input
                          id="dm-wf-name"
                          className="field-comp--md"
                          value={panelWfName}
                          onChange={(e) => setPanelWfName(e.target.value)}
                          placeholder={t("PLACEHOLDER_WORKFLOW_NAME")}
                        />
                      </div>
                      <div className="config-toggle-row">
                        <label
                          className="form-label m-0"
                          htmlFor="dm-wf-active-tog"
                        >
                          {t("ACTIVE")}
                        </label>
                        <ToggleSwitch
                          id="dm-wf-active-tog"
                          size="sm"
                          checked={panelWfActive}
                          onCheckedChange={(v) => setPanelWfActive(v)}
                          disabled={isWorkflowPendingReadonly}
                          aria-label={t("ACTIVE")}
                        />
                      </div>
                    </div>
                  </section>

                  <section
                    className="config-card"
                    aria-labelledby="dm-wf-card-review-heading"
                  >
                    <h3
                      className="config-card-title"
                      id="dm-wf-card-review-heading"
                    >
                      {t("REVIEW_CONFIGURATION")}
                    </h3>
                    <div className="config-card-inner">
                      <fieldset
                        disabled={isWorkflowPendingReadonly}
                        className="contents"
                      >
                      <div className="config-toggle-row">
                        <label
                          className="form-label m-0"
                          htmlFor="dm-wf-allow-review-tog"
                        >
                          {t("ALLOW_REVIEW")}
                        </label>
                        <ToggleSwitch
                          id="dm-wf-allow-review-tog"
                          size="sm"
                          checked={panelWfAllowReview}
                          onCheckedChange={(next) => {
                            setPanelWfAllowReview(next);
                            if (next) {
                              setDeApplyConstraints(true);
                              const parsed = parseReviewLevelCountInput(
                                panelWfReviewLevels
                              );
                              const n =
                                parsed.isInvalid || parsed.isEmpty
                                  ? 0
                                  : parsed.count;
                              if (n < 1) applyReviewLevelCount("1", 1);
                            } else {
                              applyReviewLevelCount("0", 0);
                              setDeCurrTimePeriodError("");
                            }
                          }}
                          aria-label={t("ALLOW_REVIEW")}
                        />
                      </div>
                      {panelWfAllowReview ? (
                        <>
                          <div className="sp-field">
                            <label
                              className="form-label w-fit"
                              htmlFor="dm-wf-review-levels"
                            >
                              {t("REVIEW_STAGES")}
                            </label>
                            <SelectField
                              id="dm-wf-review-levels"
                              className="w-[25%] min-w-0"
                              value={panelWfReviewLevelsInput}
                              onChange={(e) =>
                                handleReviewLevelsCountInputChange(
                                  e.target.value
                                )
                              }
                              disabled={!workflowAreaLevelsLoaded}
                            >
                              {reviewLevelsCountOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </SelectField>
                          </div>
                          {shouldShowReviewLevelDetails ? (
                            <div className="review-details">
                              <InlineEditableTable
                                wrapClassName="tbl-wrap mt-0 min-h-0 min-w-0 max-w-full rounded-lg border border-border bg-surface"
                                scrollClassName="tbl-scroll overflow-x-auto overflow-y-auto"
                                tableClassName="review-levels-table w-full min-w-0 max-w-full table-fixed border-collapse text-left text-xs"
                                tableAriaLabel={t("REVIEW_STAGE_DETAILS")}
                                disableGlobalArrowNavigation
                                thead={
                                  <>
                                    <colgroup>
                                      <col style={{ width: "8%" }} />
                                      <col style={{ width: "30%" }} />
                                      <col style={{ width: "30%" }} />
                                      <col style={{ width: "32%" }} />
                                    </colgroup>
                                    <thead>
                                      <tr>
                                        <th
                                          scope="col"
                                          className="w-10 whitespace-nowrap"
                                        >
                                          {t("STAGE")}
                                        </th>
                                        <th scope="col">{t("NAME")}</th>
                                        <th scope="col">{t("SCOPE")}</th>
                                        <th scope="col">{t("REVIEWER_ROLE")}</th>
                                      </tr>
                                    </thead>
                                  </>
                                }
                                tbody={
                                  <ServerDrivenListTbody<ReviewLevelDetailRow>
                                    colSpan={4}
                                    rows={reviewLevelRows}
                                    columns={reviewLevelTableColumns}
                                    getRowId={(row) =>
                                      String(row.levelId ?? row.levelNo ?? row.name)
                                    }
                                    editingRowId={null}
                                    showLoadingRow={false}
                                    showEmptyRow={false}
                                    showDataRows
                                  />
                                }
                              />
                            </div>
                          ) : null}
                        </>
                      ) : null}
                      </fieldset>
                    </div>
                  </section>
                </div>
              )}
              {configTab === "data_entry" && workflowData && (
                <div className="config-stack">
                  <fieldset
                    disabled={isWorkflowPendingReadonly}
                    className="contents"
                  >
                  <label className="entry-check-row">
                    <input
                      type="checkbox"
                      className="checkbox-comp"
                      checked={deApplyConstraints}
                      disabled={panelWfAllowReview}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setDeApplyConstraints(next);
                        if (!next) {
                          resetDataEntryConstraintFields();
                        }
                      }}
                    />
                    <span className="text-xs font-medium text-text">
                      {t("DE_APPLY_CONSTRAINTS")}
                    </span>
                  </label>

                  {deApplyConstraints ? (
                    <div className="entry-fields">
                      <div className="entry-freq-area-row">
                        <div className="sp-field">
                          <label
                            className="form-label label-required"
                            htmlFor="dm-wf-de-lower-area"
                          >
                            {t("DATA_ENTRY_AREA_LEVEL")}
                            <span className="label-required-star" aria-hidden>
                              *
                            </span>
                            <span className="sr-only"> {t("REQUIRED")}</span>
                          </label>
                          <SelectField
                            id="dm-wf-de-lower-area"
                            value={pickMappedSelectValue(
                              deLowerAreaLevel,
                              dataEntryAreaLevelOptions
                            )}
                            aria-invalid={deAreaLevelError ? true : undefined}
                            aria-describedby={
                              deAreaLevelError
                                ? "dm-wf-de-lower-area-error"
                                : undefined
                            }
                            onChange={(e) => {
                              setDeLowerAreaLevel(e.target.value);
                              if (deAreaLevelError) setDeAreaLevelError("");
                            }}
                            options={[
                              {
                                value: "",
                                label: t("PLACEHOLDER_SELECT"),
                                disabled: true,
                              },
                              ...dataEntryAreaLevelOptions,
                            ]}
                          />
                          {deAreaLevelError ? (
                            <p
                              id="dm-wf-de-lower-area-error"
                              className="mt-1 text-xs text-error"
                            >
                              {deAreaLevelError}
                            </p>
                          ) : null}
                        </div>
                        <div className="entry-form-grid">
                          <div className="sp-field">
                            <label
                              className="form-label"
                              htmlFor="dm-wf-de-tp-freq"
                            >
                              {t("TIME_PERIOD_FREQUENCY")}
                            </label>
                            <SelectField
                              id="dm-wf-de-tp-freq"
                              value={deTimePeriodFrequency}
                              onChange={(e) => {
                                const nextFreq = e.target.value;
                                setDeTimePeriodFrequency(nextFreq);
                                const filtered = filterWorkflowDeTimePeriodsByFrequency(
                                  deAllTimePeriods,
                                  nextFreq
                                );
                                if (panelWfAllowReview) {
                                  setDeCurrTimePeriodNid(
                                    pickLatestWorkflowDeTimePeriodNid(filtered)
                                  );
                                } else {
                                  setDeCurrTimePeriodNid((prev) => {
                                    if (
                                      prev &&
                                      filtered.some((item) => String(item.nid) === prev)
                                    ) {
                                      return prev;
                                    }
                                    return "";
                                  });
                                }
                              }}
                            >
                              <option value="ALL">{t("ALL")}</option>
                              <option value="Q">{t("QUARTERLY")}</option>
                              <option value="M">{t("MONTHLY")}</option>
                              <option value="A">{t("ANNUALLY")}</option>
                            </SelectField>
                          </div>
                          <div className="sp-field">
                            <label
                              className={`form-label${panelWfAllowReview ? " label-required" : ""}`}
                              htmlFor="dm-wf-de-curr-tp"
                            >
                              {t("CURRENT_TIME_PERIOD")}
                              {panelWfAllowReview ? (
                                <>
                                  <span className="label-required-star" aria-hidden>
                                    *
                                  </span>
                                  <span className="sr-only"> {t("REQUIRED")}</span>
                                </>
                              ) : null}
                            </label>
                            <SelectField
                              id="dm-wf-de-curr-tp"
                              value={pickMappedSelectValue(
                                deCurrTimePeriodNid,
                                filteredDeTimePeriodOptions.map((item) => ({
                                  value: String(item.nid),
                                  label: item.label,
                                }))
                              )}
                              aria-invalid={
                                deCurrTimePeriodError ? true : undefined
                              }
                              aria-describedby={
                                deCurrTimePeriodError
                                  ? "dm-wf-de-curr-tp-error"
                                  : undefined
                              }
                              disabled={
                                deTimePeriodsLoading ||
                                filteredDeTimePeriodOptions.length === 0
                              }
                              onChange={(e) => {
                                setDeCurrTimePeriodNid(e.target.value);
                                if (deCurrTimePeriodError) {
                                  setDeCurrTimePeriodError("");
                                }
                              }}
                              options={[
                                {
                                  value: "",
                                  label: t("PLACEHOLDER_SELECT"),
                                  disabled: panelWfAllowReview,
                                },
                                ...filteredDeTimePeriodOptions.map((item) => ({
                                  value: String(item.nid),
                                  label: item.label,
                                })),
                              ]}
                            />
                            {deCurrTimePeriodError ? (
                              <p
                                id="dm-wf-de-curr-tp-error"
                                className="mt-1 text-xs text-error"
                              >
                                {deCurrTimePeriodError}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="entry-form-box">
                        <h4 className="entry-form-title">
                          {t("DATA_ENTRY_FORM")}
                        </h4>
                        <div className="entry-form-grid">
                          <div className="sp-field">
                            <label
                              className="form-label"
                              htmlFor="dm-wf-de-form-tp"
                            >
                              {t("TIME_PERIOD")}
                            </label>
                            <SelectField
                              id="dm-wf-de-form-tp"
                              value={deFormTimePeriod}
                              onChange={(e) => {
                                const nextScope = e.target.value;
                                setDeFormTimePeriod(nextScope);
                              }}
                            >
                              <option value="" disabled>
                                {t("PLACEHOLDER_SELECT")}
                              </option>
                              <option value="SINGLE">{t("SINGLE")}</option>
                              <option value="MULTIPLE">
                                {t("MULTIPLE")}
                              </option>
                            </SelectField>
                          </div>
                          <div className="sp-field">
                            <label
                              className="form-label"
                              htmlFor="dm-wf-de-form-area"
                            >
                              {t("AREA")}
                            </label>
                            <SelectField
                              id="dm-wf-de-form-area"
                              value={deFormArea}
                              onChange={(e) =>
                                setDeFormArea(e.target.value)
                              }
                            >
                              <option value="" disabled>
                                {t("PLACEHOLDER_SELECT")}
                              </option>
                              <option value="SINGLE">{t("SINGLE")}</option>
                              <option value="MULTIPLE">
                                {t("MULTIPLE")}
                              </option>
                            </SelectField>
                          </div>
                          <div className="sp-field">
                            <label
                              className="form-label"
                              htmlFor="dm-wf-de-form-ind"
                            >
                              {t("LABEL_INDICATOR")}
                            </label>
                            <SelectField
                              id="dm-wf-de-form-ind"
                              value={deFormIndicator}
                              onChange={(e) =>
                                setDeFormIndicator(e.target.value)
                              }
                            >
                              <option value="" disabled>
                                {t("PLACEHOLDER_SELECT")}
                              </option>
                              <option value="SINGLE">{t("SINGLE")}</option>
                              <option value="MULTIPLE">
                                {t("MULTIPLE")}
                              </option>
                            </SelectField>
                          </div>
                          <div className="entry-preview-toggle">
                            <label
                              className="form-label !normal-case"
                              htmlFor="dm-wf-de-prev-time"
                            >
                              {t("SHOW_PREVIOUS_TIME_SINGLE_TIME_PERIOD")}
                            </label>
                            <ToggleSwitch
                              id="dm-wf-de-prev-time"
                              size="sm"
                              className="shrink-0"
                              checked={deShowPreviousTime}
                              onCheckedChange={(v) => {
                                setDeShowPreviousTime(v);
                              }}
                              aria-label={t(
                                "SHOW_PREVIOUS_TIME_SINGLE_TIME_PERIOD"
                              )}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  </fieldset>
                </div>
              )}
              {configTab === "users" && workflowData && (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-hidden">
                  {canUseReviewUsersTab ? (
                    <div
                      className="segment-tabs shrink-0"
                      role="tablist"
                      aria-label={t("USERS")}
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={usersSubTab === "data_entry"}
                        className={
                          usersSubTab === "data_entry" ? "active" : ""
                        }
                        onClick={() => switchUsersSubTab("data_entry")}
                      >
                        {t("DATA_ENTRY")}
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={usersSubTab === "reviewers"}
                        className={
                          usersSubTab === "reviewers" ? "active" : ""
                        }
                        onClick={() => switchUsersSubTab("reviewers")}
                      >
                        {t("REVIEWERS")}
                      </button>
                    </div>
                  ) : null}

                  <div className="users-toolbar shrink-0 min-w-0 !flex-row !flex-wrap !items-center !justify-between !gap-3">
                    <MainTabsBar
                      className="users-view-tabs max-w-full !h-9 !flex-nowrap !gap-4 !px-0"
                      tabs={[
                        {
                          value: "all" as WorkflowUsersViewFilter,
                          label: `${t("ALL")} (${usersAssignmentCounts.all})`,
                          icon: "group",
                          tabClassName: "shrink-0 whitespace-nowrap",
                        },
                        {
                          value: "assigned" as WorkflowUsersViewFilter,
                          label: `${t("ASSIGNED")} (${usersAssignmentCounts.assigned})`,
                          icon: "person_add",
                          tabClassName: "shrink-0 whitespace-nowrap",
                        },
                        {
                          value: "unassigned" as WorkflowUsersViewFilter,
                          label: `${t("UNASSIGNED")} (${usersAssignmentCounts.unassigned})`,
                          icon: "person_off",
                          tabClassName: "shrink-0 whitespace-nowrap",
                        },
                      ]}
                      activeValue={usersViewFilter}
                      onSelect={(v) => setUsersViewFilter(v)}
                      tablistAccessibility={{ ariaLabel: t("FILTER_BY_ASSIGNMENT") }}
                    />
                    <div className="ms-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
                      {canAssignUsersFromFilters ? (
                        <PrimaryButton
                          type="button"
                          icon="person_add"
                          disabled={configSaving}
                          onClick={assignUsersFromFilters}
                          title={t("ASSIGN_USERS")}
                        >
                          {t("ASSIGN_USERS")}
                        </PrimaryButton>
                      ) : (
                        <SecondaryButton
                          type="button"
                          icon="person_add"
                          disabled
                          title={t("ASSIGN_USERS")}
                        >
                          {t("ASSIGN_USERS")}
                        </SecondaryButton>
                      )}
                      {usersTableSelected.size > 0 ? (
                        <PrimaryButton
                          type="button"
                          variant="destructive"
                          icon="delete"
                          disabled={configSaving}
                          onClick={requestDeleteSelectedUserRows}
                          title={t("TOOLBAR_DELETE_SELECTED")}
                        >
                          {t("UNASSIGN_USERS")}
                        </PrimaryButton>
                      ) : (
                        <SecondaryButton
                          type="button"
                          icon="delete"
                          disabled
                          title={t("TOOLBAR_SELECT_HINT")}
                        >
                          {t("UNASSIGN_USERS")}
                        </SecondaryButton>
                      )}
                    </div>
                  </div>

                  <InlineEditableTable
                    wrapClassName="tbl-wrap mt-0 min-h-0 min-w-0 max-w-full flex-1 rounded-lg border border-border bg-surface"
                    scrollClassName="tbl-scroll overflow-x-auto overflow-y-auto"
                    tableClassName="users-assign-table w-full min-w-0 table-fixed border-collapse text-left text-xs"
                    tableAriaLabel={t("USERS")}
                    disableGlobalArrowNavigation
                    thead={
                      <>
                        <colgroup>
                          <col style={{ width: "6%" }} />
                          <col style={{ width: usersAreaColWidth }} />
                          {isReviewerUsersSubTab ? (
                            reviewerStageColumns.map((stage) => (
                              <col
                                key={`wf-users-col-${stage.stageKey}`}
                                style={{ width: usersAssignmentColWidth }}
                              />
                            ))
                          ) : (
                            <col style={{ width: usersAssignmentColWidth }} />
                          )}
                        </colgroup>
                        <thead>
                          <tr>
                            <th
                              scope="col"
                              className="users-th-check text-center"
                            >
                              <div className="th-merged-label">
                                <div className="flex w-full min-w-0 flex-col items-center gap-1">
                                  <input
                                    type="checkbox"
                                    className={`checkbox-comp mx-auto block ${
                                      selectableFilteredUserRowIds.length > 0
                                        ? "cursor-pointer"
                                        : "cursor-not-allowed opacity-50"
                                    }`}
                                    aria-label={t("SELECT_ALL")}
                                    checked={
                                      selectableFilteredUserRowIds.length > 0 &&
                                      selectableFilteredUserRowIds.every((id) =>
                                        usersTableSelected.has(id)
                                      )
                                    }
                                    disabled={selectableFilteredUserRowIds.length === 0}
                                    onChange={selectAllFilteredUsers}
                                  />
                                  {isReviewerUsersSubTab ? (
                                    <span
                                      className={
                                        WORKFLOW_USERS_HEADER_ROLE_SPACER_CLASSNAME
                                      }
                                      aria-hidden
                                    />
                                  ) : null}
                                </div>
                              </div>
                            </th>
                            <th scope="col" className="align-top">
                              <div className="th-merged-label">
                                <div className="flex w-full min-w-0 flex-col items-start gap-1">
                                  <span>{t("AREA")}</span>
                                  {isReviewerUsersSubTab ? (
                                    <span
                                      className={
                                        WORKFLOW_USERS_HEADER_ROLE_SPACER_CLASSNAME
                                      }
                                      aria-hidden
                                    />
                                  ) : null}
                                </div>
                              </div>
                              <div className="th-merged-filter">
                                {isReviewerUsersSubTab ? (
                                  <>
                                    {usersHasParentAreaLevel ? (
                                      !usersAreaLevel || usersAreasLoading ? (
                                        <span
                                          className={
                                            WORKFLOW_USERS_FILTER_STATIC_TEXT_CLASSNAME
                                          }
                                        >
                                          {usersFilterByAreaOptionLabel}
                                        </span>
                                      ) : (
                                        <SelectField
                                          className="w-full min-w-0"
                                          menuInline
                                          value={usersArea}
                                          onChange={(e) => setUsersArea(e.target.value)}
                                        >
                                          <option value="all">
                                            {usersFilterByAreaOptionLabel}
                                          </option>
                                          {usersParentAreaOptions.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                              {opt.label}
                                            </option>
                                          ))}
                                        </SelectField>
                                      )
                                    ) : null}
                                    <SearchInputBar
                                      embedded
                                      size="sm"
                                      showIcon
                                      iconPosition="right"
                                      wrapperClassName="w-full min-w-0"
                                      fieldClassName="w-full min-w-0"
                                      value={usersSearchArea}
                                      onChange={(e) =>
                                        setUsersSearchArea(e.target.value)
                                      }
                                      placeholder={t("SEARCH_PLACEHOLDER")}
                                      aria-label={`${t("SEARCH")} ${t("ALL")}`}
                                    />
                                  </>
                                ) : (
                                  <div className="flex w-full min-w-0 flex-col items-stretch gap-1 py-0.5">
                                    {isUsersAreaLevelLocked ||
                                    (!workflowAreaLevelsLoaded &&
                                      usersAreaLevelOptions.length === 0) ? (
                                      <SelectField
                                        id="dm-wf-users-area-level-table"
                                        className="w-full min-w-0"
                                        menuInline
                                        aria-label={t("AREA_LEVEL")}
                                        value={usersAreaLevel || ""}
                                        disabled
                                        onChange={() => {}}
                                      >
                                        <option value={usersAreaLevel || ""}>
                                          {usersSelectedAreaLevelLabel}
                                        </option>
                                      </SelectField>
                                    ) : (
                                      <SelectField
                                        id="dm-wf-users-area-level-table"
                                        className="w-full min-w-0"
                                        menuInline
                                        aria-label={t("AREA_LEVEL")}
                                        value={usersAreaLevel}
                                        onChange={(e) =>
                                          setUsersAreaLevel(e.target.value)
                                        }
                                      >
                                        <option value="" disabled>
                                          {t("PLACEHOLDER_SELECT")}
                                        </option>
                                        {usersAreaLevelOptions.map((level) => (
                                          <option
                                            key={level.value}
                                            value={level.value}
                                          >
                                            {level.label}
                                          </option>
                                        ))}
                                      </SelectField>
                                    )}
                                    {usersHasParentAreaLevel ? (
                                      !usersAreaLevel || usersAreasLoading ? (
                                        <span
                                          className={
                                            WORKFLOW_USERS_FILTER_STATIC_TEXT_CLASSNAME
                                          }
                                        >
                                          {usersFilterByAreaOptionLabel}
                                        </span>
                                      ) : (
                                        <SelectField
                                          id="dm-wf-users-area-table"
                                          className="w-full min-w-0"
                                          menuInline
                                          aria-label={usersAreaFilterLabel}
                                          value={usersArea}
                                          onChange={(e) =>
                                            setUsersArea(e.target.value)
                                          }
                                        >
                                          <option value="all">
                                            {usersFilterByAreaOptionLabel}
                                          </option>
                                          {usersParentAreaOptions.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                              {opt.label}
                                            </option>
                                          ))}
                                        </SelectField>
                                      )
                                    ) : (
                                      <span
                                        className="block min-h-8 w-full"
                                        aria-hidden
                                      />
                                    )}
                                    <SearchInputBar
                                      embedded
                                      size="sm"
                                      showIcon
                                      iconPosition="right"
                                      wrapperClassName="w-full min-w-0"
                                      fieldClassName="w-full min-w-0"
                                      value={usersSearchArea}
                                      onChange={(e) =>
                                        setUsersSearchArea(e.target.value)
                                      }
                                      placeholder={t("SEARCH_PLACEHOLDER")}
                                      aria-label={`${t("SEARCH")} ${t("AREA")}`}
                                    />
                                  </div>
                                )}
                              </div>
                            </th>
                            {isReviewerUsersSubTab ? (
                              reviewerStageColumns.map((stage) => (
                                <th
                                  scope="col"
                                  key={`wf-users-head-${stage.stageKey}`}
                                  className="users-stage-col align-top"
                                >
                                  <div className="th-merged-label">
                                    <div className="users-stage-head flex w-full min-w-0 flex-col items-stretch gap-1 text-left">
                                      <span className="block min-w-0 truncate font-semibold text-text-muted">
                                        {stage.stageName}
                                      </span>
                                      <span className="block min-h-4 min-w-0 truncate text-text-muted">
                                        <span className="text-text">{t("ROLE")}:</span>{" "}
                                        <span>{stage.roleLabel}</span>
                                      </span>
                                    </div>
                                  </div>
                                  <div className="th-merged-filter">
                                    <SelectField
                                      className="w-full min-w-0"
                                      menuPortal
                                      closeOnScroll
                                      menuGrowToFitContent
                                      searchEnabled
                                      searchPlaceholder={t("SEARCH_PLACEHOLDER")}
                                      disabled={iamUsersLoading}
                                        value={pickMappedSelectValue(
                                          reviewerStageFilterUserIds[
                                            stage.stageKey
                                          ] ?? "",
                                          reviewerIamUserOptionsByStage.get(
                                            stage.stageKey
                                          ) ?? []
                                        )}
                                        onChange={(e) =>
                                          setReviewerStageFilterUserIds((prev) => ({
                                            ...prev,
                                            [stage.stageKey]: e.target.value,
                                          }))
                                        }
                                        options={[
                                          {
                                            value: "",
                                            label: usersFilterByUserOptionLabel,
                                          },
                                          ...(reviewerIamUserOptionsByStage.get(
                                            stage.stageKey
                                          ) ?? []),
                                        ]}
                                    />
                                  </div>
                                </th>
                              ))
                            ) : (
                              <th scope="col" className="align-top">
                                <div className="th-merged-label">{t("USER")}</div>
                                <div className="th-merged-filter">
                                  <div className="flex w-full min-w-0 flex-col items-stretch gap-1 py-0.5">
                                    {showDeUsersRoleInToolbar ? (
                                      <SelectField
                                        id="dm-wf-users-role-table"
                                        className="w-full min-w-0"
                                        menuInline
                                        aria-label={t("ROLE")}
                                        value={usersRole}
                                        onChange={(e) =>
                                          setUsersRole(e.target.value)
                                        }
                                      >
                                        <option value="" disabled>
                                          {t("SELECT_ROLE")}
                                        </option>
                                        {usersRoleOptions.map((role) => (
                                          <option key={role.id} value={role.value}>
                                            {role.label}
                                          </option>
                                        ))}
                                      </SelectField>
                                    ) : isDeUsersRoleFilterDisabled ? (
                                      <SelectField
                                        id="dm-wf-users-role-table"
                                        className="w-full min-w-0"
                                        menuInline
                                        aria-label={t("ROLE")}
                                        value={usersRole || ""}
                                        disabled
                                        onChange={() => {}}
                                      >
                                        <option value={usersRole || ""}>
                                          {usersSelectedRoleLabel}
                                        </option>
                                      </SelectField>
                                    ) : null}
                                    <SelectField
                                      id="dm-wf-users-filter-user"
                                      className="w-full min-w-0"
                                      menuPortal
                                      closeOnScroll
                                      menuGrowToFitContent
                                      searchEnabled
                                      searchPlaceholder={t("SEARCH_PLACEHOLDER")}
                                      aria-label={t("USER")}
                                      disabled={iamUsersLoading}
                                      value={pickMappedSelectValue(
                                        usersFilterUserId,
                                        iamUserSelectOptions
                                      )}
                                      onChange={(e) =>
                                        setUsersFilterUserId(e.target.value)
                                      }
                                      options={[
                                        {
                                          value: "",
                                          label: usersFilterByUserOptionLabel,
                                        },
                                        ...iamUserSelectOptions,
                                      ]}
                                    />
                                  </div>
                                </div>
                              </th>
                            )}
                          </tr>
                        </thead>
                      </>
                    }
                    tbody={
                      <ServerDrivenListTbody<WorkflowUserAreaRow>
                        colSpan={usersTableColumnCount}
                        rows={filteredUserTableRows}
                        columns={usersTableColumns}
                        getRowId={(row) => row.id}
                        editingRowId={null}
                        showLoadingRow={usersAreasLoading}
                        showEmptyRow={
                          !usersAreasLoading &&
                          filteredUserTableRows.length === 0
                        }
                        showDataRows={!usersAreasLoading}
                        emptyMessage={t("AREAS_EMPTY")}
                      />
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </Drawer>

      <Modal
        open={reviewLevelTrimConfirmOpen}
        onClose={cancelReviewLevelTrim}
        title={t("REVIEW_STAGE_REDUCE_CONFIRM_TITLE")}
        titleId="dm-workflow-review-level-trim-confirm-title"
        dismissDisabled={reviewLevelsSaving}
        closeAriaLabel={t("CLOSE")}
        footer={
          <>
            <SecondaryButton
              type="button"
              variant="modal"
              onClick={cancelReviewLevelTrim}
              disabled={reviewLevelsSaving}
            >
              {t("CANCEL")}
            </SecondaryButton>
            <button
              type="button"
              className="btn-comp-primary"
              onClick={() => void confirmReviewLevelTrim()}
              disabled={reviewLevelsSaving}
            >
              {reviewLevelsSaving ? t("DELETING") : t("CONFIRM")}
            </button>
          </>
        }
      >
        <p className="modal-lead text-xs leading-relaxed text-text">
          {t("WORKFLOW_REVIEW_STAGE_REDUCE_CONFIRM_BODY")
            .replace(
              "{remove}",
              String(pendingReviewLevelTrim?.removedCount ?? 0)
            )
            .replace(
              "{next}",
              String(pendingReviewLevelTrim?.nextCount ?? 0)
            )}
        </p>
      </Modal>

      <Modal
        open={userDeleteConfirmOpen}
        onClose={cancelDeleteSelectedUserRows}
        title={t("USER_ASSIGNMENTS_DELETE_CONFIRM_TITLE")}
        titleId="dm-workflow-user-delete-confirm-title"
        closeAriaLabel={t("CLOSE")}
        footer={
          <>
            <SecondaryButton type="button" variant="modal" onClick={cancelDeleteSelectedUserRows}>
              {t("CANCEL")}
            </SecondaryButton>
            <button
              type="button"
              className="btn-comp-primary"
              onClick={confirmDeleteSelectedUserRows}
            >
              {t("CONFIRM")}
            </button>
          </>
        }
      >
        <p className="modal-lead text-xs leading-relaxed text-text">
          {t("USER_ASSIGNMENTS_DELETE_CONFIRM_BODY").replace(
            "{count}",
            String(usersTableSelected.size)
          )}
        </p>
      </Modal>
    </>
  );
}
