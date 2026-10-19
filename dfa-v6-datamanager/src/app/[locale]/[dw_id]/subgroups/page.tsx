"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type SetStateAction,
} from "react";
import { useCore } from "@/contexts/CoreContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { useDwCrudPermissions } from "@/hooks/useDwCrudPermissions";
import { useDwPermissionGuard } from "@/hooks/useDwPermissionGuard";
import { DW_ROUTE_PERMISSIONS } from "@/lib/auth/user";
import type {
  BulkCreateSgCategoryValueItem,
  BulkCreateSgCategoryValuesResult,
  CreateSgCategoryPayload,
  CreateSubgroupCombinationItem,
  CreateSubgroupCombinationsResult,
  DeleteSubgroupResult,
  ExportSubgroupsParams,
  FetchSgCategoriesValuesParams,
  FetchSubgroupsParams,
  SgCategoriesListResult,
  SgCategoriesMutationError,
  SgCategoriesMutationResult,
  SgCategoriesValuesListResult,
  SgCategory,
  SgCategoryValueMutationError,
  SgCategoryValueMutationResult,
  SubgroupRaw,
  SubgroupsListMeta,
  SubgroupsListResult,
  SubgroupsMetaCategoryValue,
  UpdateSgCategoryPayload,
  UpdateSgCategoryValuePayload,
  UpdateSubgroupValPayload,
} from "@/lib/api/types";
import { parseListMetaTotals } from "@/lib/gridListMeta";
import {
  deleteRequest,
  getFileResponse,
  getRequest,
  patchRequest,
  postRequest,
} from "@/lib/api/http";
import {
  getDWAPIURL,
  REFERENCE_PATH_SG_CATEGORIES,
  REFERENCE_PATH_SG_CATEGORIES_VALUES,
  REFERENCE_PATH_SG_CATEGORIES_VALUES_LIST,
  REFERENCE_PATH_SUBGROUPS,
} from "@/lib/constants";
import Drawer from "@/components/Drawer";
import { DeletePermanentConfirmModal } from "@/components/DeletePermanentConfirmModal";
import { gridTextFieldClassName, textFieldClassName } from "@/components/TextField";
import { MainTabsBar } from "@/components/MainTabsBar";
import { SecondaryButton } from "@/components/SecondaryButton";
import { GidManagerDrawer, type GidManagerDrawerRow } from "@/components/GidManagerDrawer";
import {
  BTN_GRID_ICON_CLOSE,
  BTN_GRID_ICON_TICK,
  GRID_ACTION_ICON,
} from "@/components/GridInlineSaveCancelActions";
import {
  EditableDataGridThead,
  ServerDrivenListTbody,
  ServerDrivenTable,
  TV_ROW_NEWLY_ADDED_CLASS,
  findActiveRowEnterTarget,
  focusEditableElement,
  getRowEnterNavigationTargets,
  isTextLikeInput,
  moveFocusBetweenGridRows,
  moveFocusWithinRow,
  shouldPreserveLocalArrowHandling,
  useServerListQuery,
  type ServerDrivenListAddRowField,
  type ServerListParseResult,
} from "@/components/TableView";
import { useSubgroupTableColumns } from "./subgroupsGridColumns";
import {
  buildSubgroupRows,
  getSubgroupTableRowId,
  mapSubgroupListRawToGidDrawerRows,
  normalizeDimensionCategories,
  parseSubgroupListCombinationDrawerRowId,
  subgroupListRowRecentKey,
  type SgCategoryOrderMeta,
  type DimensionCategory,
  type SubgroupTableRow,
} from "./subgroupsTableShared";
import { sanitizeManualGidInput } from "@/services/validations";
import { toast } from "sonner";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";

function getSubgroupGid(s: SubgroupRaw): string | null {
  const gid = s.sg_gid ?? s.subgroup_val_gid ?? s.sv_gid ?? null;
  return gid != null && gid !== "" ? gid : null;
}

function isPlainPrintableKey(event: {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  return event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey;
}

function parseUsedInCount(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const subgroupCount = (value as { subgroup_count?: unknown }).subgroup_count;
  if (typeof subgroupCount !== "number" || !Number.isFinite(subgroupCount)) return undefined;
  return Math.max(0, subgroupCount);
}

/** Next editable cell in the dimension panel values grid (row-major). */
function getNextPanelGridInput(from: HTMLInputElement): HTMLInputElement | undefined {
  const body = from.closest("[data-dm-sg-panel-body]");
  if (!(body instanceof HTMLElement)) return undefined;
  const inputs = Array.from(
    body.querySelectorAll<HTMLInputElement>(
      "table.panel-values-table input[data-dm-sg-panel-value]:not([disabled])",
    ),
  );
  const i = inputs.indexOf(from);
  if (i < 0 || i + 1 >= inputs.length) return undefined;
  return inputs[i + 1];
}

const PANEL_VALUES_INPUT_EXCEL = "[&[data-dm-sg-panel-navigate]]:caret-transparent";

async function fetchSubgroups(
  dwId: string,
  params: FetchSubgroupsParams = {}
): Promise<SubgroupsListResult> {
  const searchParams = new URLSearchParams();
  if (params.page != null) searchParams.set("page", String(params.page));
  if (params.page_size != null)
    searchParams.set("page_size", String(params.page_size));
  if (params.sort_order) searchParams.set("sort_order", params.sort_order);
  if (params.sort_field) searchParams.set("sort_field", params.sort_field);
  if (params.search != null && params.search !== "")
    searchParams.set("search", params.search);
  if (params.search_by) searchParams.set("search_by", params.search_by);
  if (params.search_field) searchParams.set("search_field", params.search_field);
  if (params.category_val != null && params.category_val !== "")
    searchParams.set("category_val", params.category_val);
  if (params.subgroup_info === true) searchParams.set("subgroup_info", "true");
  if (params.subgroup_info === false) searchParams.set("subgroup_info", "false");
  if (params.scope != null && params.scope !== "")
    searchParams.set("scope", params.scope);

  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_SUBGROUPS)}?${searchParams.toString()}`;
  const json = await getRequest(url, undefined, { suppressErrorMessage: true });
  return json as SubgroupsListResult;
}

/**
 * All subgroup combination rows for the subgroup bulk edit drawer.
 * GET /subgroups with no page_size returns the full list when the API omits pagination.
 */
async function fetchSubgroupsForGidManager(
  dwId: string
): Promise<
  | { success: true; data: SubgroupRaw[] }
  | { success: false; err_message?: string; errors?: Record<string, unknown> }
> {
  const res = await fetchSubgroups(dwId, {
    page: 1,
    sort_order: "asc",
    sort_field: "sv_order",
    subgroup_info: false,
  });
  if (!res.success) {
    return {
      success: false,
      err_message: res.err_message,
      errors: "errors" in res ? res.errors : undefined,
    };
  }
  return { success: true, data: res.data };
}

/**
 * GID of the first created ut_subgroup row from bulk POST sg-categories/values `data`.
 * Keys depend on API ADAPTATION + RETURN_FULL_RES_AFTER_CREATE: reduced external payloads
 * use `sg_catg_val_gid`; internal-style uses `subgroup_gid`. Do not use `sg_gid` here (ut_subgroup_vals).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- inlined from reference.ts (not used by this page)
function parseBulkCreatedSgCategoryValueGid(data: unknown): string | null {
  if (data == null) return null;
  const rows = Array.isArray(data) ? data : [data];
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row || typeof row !== "object") return null;
  const gid = row.sg_catg_val_gid ?? row.subgroup_gid ?? row.g_id;
  return typeof gid === "string" && gid.trim() ? gid.trim() : null;
}

/**
 * POST /dw/{dw_id}/sg-categories/values — raw JSON array body.
 * Optional query ensure_sg_cat_gids: comma-separated subgroup_type GIDs to get-or-create first.
 */
async function bulkCreateSgCategoryValues(
  dwId: string,
  items: BulkCreateSgCategoryValueItem[],
  options?: { ensureSgCatGids?: string[] }
): Promise<BulkCreateSgCategoryValuesResult> {
  const q = new URLSearchParams();
  if (options?.ensureSgCatGids?.length) {
    q.set("ensure_sg_cat_gids", options.ensureSgCatGids.join(","));
  }
  const qs = q.toString();
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_SG_CATEGORIES_VALUES)}${qs ? `?${qs}` : ""}`;
  const bodyItems = items.map((item) => {
    const o: Record<string, unknown> = {
      sg_cat_gid: item.sg_cat_gid,
      sg_catg_val_name: item.sg_catg_val_name ?? item.subgroup_name ?? "",
    };
    const gid = item.sg_catg_val_gid ?? item.subgroup_gid;
    if (gid != null && gid !== "") o.sg_catg_val_gid = gid;
    const order = item.sg_catg_val_order ?? item.subgroup_order;
    if (order != null) o.sg_catg_val_order = order;
    const globalFlag = item.sg_catg_val_global ?? item.subgroup_global;
    if (globalFlag != null) o.sg_catg_val_global = globalFlag;
    return o;
  });
  const json = await postRequest(
    url,
    bodyItems,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  );
  return json as BulkCreateSgCategoryValuesResult;
}

/**
 * GET /dw/{dw_id}/subgroups?export=true — returns XLSX.
 * Triggers a browser download. Call only in client components.
 */
async function downloadSubgroupsExport(
  dwId: string,
  params: ExportSubgroupsParams = {}
): Promise<{ ok: true } | { ok: false; message: string }> {
  const searchParams = new URLSearchParams();
  searchParams.set("export", "true");
  if (params.sort_order) searchParams.set("sort_order", params.sort_order);
  if (params.sort_field) searchParams.set("sort_field", params.sort_field);
  if (params.search != null && params.search !== "")
    searchParams.set("search", params.search);
  if (params.search_by) searchParams.set("search_by", params.search_by);
  if (params.search_field) searchParams.set("search_field", params.search_field);
  if (params.category_val != null && params.category_val !== "")
    searchParams.set("category_val", params.category_val);
  if (params.scope) searchParams.set("scope", params.scope);
  if (params.subgroup_info === true)
    searchParams.set("subgroup_info", "true");

  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_SUBGROUPS)}?${searchParams.toString()}`;

  const res = await getFileResponse(url);

  const contentType = res.headers.get("Content-Type") ?? "";

  if (!res.ok) {
    if (contentType.includes("application/json")) {
      try {
        const json = (await res.json()) as {
          err_message?: string;
          message?: string;
        };
        return {
          ok: false,
          message:
            json.err_message ??
            json.message ??
            `Request failed (${res.status})`,
        };
      } catch {
        return { ok: false, message: `Request failed (${res.status})` };
      }
    }
    return { ok: false, message: `Export failed (${res.status})` };
  }

  if (contentType.includes("application/json")) {
    try {
      const json = (await res.json()) as { err_message?: string };
      return {
        ok: false,
        message: json.err_message ?? "Unexpected JSON response",
      };
    } catch {
      return { ok: false, message: "Unexpected response" };
    }
  }

  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition");
  let filename = "subgroups_export.xlsx";
  if (cd) {
    const quoted = cd.match(/filename="([^"]+)"/i);
    const unquoted = cd.match(/filename=([^;\s]+)/i);
    const raw = quoted?.[1] ?? unquoted?.[1];
    if (raw) filename = raw.replace(/^["']|["']$/g, "");
  }

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);

  return { ok: true };
}

/**
 * POST /dw/{dw_id}/subgroups — combination rows (ut_subgroup_vals + map).
 * Body: bare JSON array of CreateSubgroupCombinationItem[].
 */
async function createSubgroupCombinations(
  dwId: string,
  items: CreateSubgroupCombinationItem[]
): Promise<CreateSubgroupCombinationsResult> {
  const url = getDWAPIURL(dwId, REFERENCE_PATH_SUBGROUPS);
  const json = await postRequest(
    url,
    items,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  );
  return json as CreateSubgroupCombinationsResult;
}

function serializeCreateSgCategoryPayload(
  payload: CreateSgCategoryPayload
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    sg_cat_name: payload.sg_cat_name,
  };
  if (payload.sg_cat_gid != null && payload.sg_cat_gid !== "") {
    body.sg_cat_gid = payload.sg_cat_gid;
  }
  if (payload.sg_cat_order != null) body.sg_cat_order = payload.sg_cat_order;
  if (payload.sg_cat_global != null) body.sg_cat_global = payload.sg_cat_global;
  return body;
}

function serializeUpdateSgCategoryPayload(
  payload: UpdateSgCategoryPayload
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (payload.sg_cat_name != null) body.sg_cat_name = payload.sg_cat_name;
  if (payload.sg_cat_order != null) body.sg_cat_order = payload.sg_cat_order;
  if (payload.sg_cat_global != null) body.sg_cat_global = payload.sg_cat_global;
  return body;
}

function parseCreatedSgCategoryGid(data: unknown): string | null {
  if (data == null) return null;
  const rows = Array.isArray(data) ? data : [data];
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row || typeof row !== "object") return null;
  const gid =
    row.sg_cat_gid ??
    row.subgroup_type_gid ??
    row.sg_gid ??
    row.g_id;
  return typeof gid === "string" && gid.trim() ? gid.trim() : null;
}

async function createSgCategories(
  dwId: string,
  payload: CreateSgCategoryPayload[]
): Promise<SgCategoriesMutationResult> {
  const url = getDWAPIURL(dwId, REFERENCE_PATH_SG_CATEGORIES);
  const json = await postRequest(
    url,
    payload.map(serializeCreateSgCategoryPayload),
    undefined,
    undefined,
    { suppressErrorMessage: true }
  );
  return json as SgCategoriesMutationResult;
}

async function updateSgCategory(
  dwId: string,
  identifier: string,
  payload: UpdateSgCategoryPayload
): Promise<SgCategoriesMutationResult> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_SG_CATEGORIES)}/${encodeURIComponent(identifier)}`;
  const json = await patchRequest(
    url,
    serializeUpdateSgCategoryPayload(payload),
    undefined,
    undefined,
    { suppressErrorMessage: true }
  );
  return json as SgCategoriesMutationResult;
}

async function deleteSgCategory(
  dwId: string,
  identifier: string
): Promise<SgCategoriesMutationResult> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_SG_CATEGORIES)}/${encodeURIComponent(identifier)}`;
  const json = (await deleteRequest(url, undefined, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success === false) {
    return json as unknown as SgCategoriesMutationError;
  }
  return { success: true, ...json } as SgCategoriesMutationResult;
}

async function fetchSgCategories(
  dwId: string,
  params: { used_in?: boolean } = {}
): Promise<SgCategoriesListResult> {
  const sp = new URLSearchParams();
  if (params.used_in != null) sp.set("used_in", String(params.used_in));
  const qs = sp.toString();
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_SG_CATEGORIES)}${qs ? `?${qs}` : ""}`;
  const json = await getRequest(url, undefined, { suppressErrorMessage: true });
  return json as SgCategoriesListResult;
}

async function fetchSgCategoriesValues(
  dwId: string,
  params: FetchSgCategoriesValuesParams = {}
): Promise<SgCategoriesValuesListResult> {
  const sp = new URLSearchParams();
  if (params.page != null) sp.set("page", String(params.page));
  if (params.page_size != null) sp.set("page_size", String(params.page_size));
  if (params.sg_cat_identifier) sp.set("sg_cat_identifier", params.sg_cat_identifier);
  sp.set("view", params.view ?? "flat");
  sp.set("sg_cat_info", String(params.sg_cat_info ?? true));
  if (params.used_in != null) sp.set("used_in", String(params.used_in));

  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_SG_CATEGORIES_VALUES_LIST)}?${sp.toString()}`;
  const json = await getRequest(url, undefined, { suppressErrorMessage: true });
  return json as SgCategoriesValuesListResult;
}

/**
 * Fetch ALL sg-categories-values across all pages.
 * Repeatedly fetches pages until all records are collected.
 */
async function fetchAllSgCategoriesValues(
  dwId: string
): Promise<SgCategoriesValuesListResult> {
  const firstPage = await fetchSgCategoriesValues(dwId, {
    page: 1,
    page_size: 1000,
    view: "flat",
    sg_cat_info: true,
    used_in: true,
  });
  if (!firstPage.success) return firstPage;

  const allData = [...firstPage.data];
  const { total_pages } = firstPage.meta;

  for (let p = 2; p <= total_pages; p++) {
    const next = await fetchSgCategoriesValues(dwId, {
      page: p,
      page_size: 1000,
      view: "flat",
      sg_cat_info: true,
      used_in: true,
    });
    if (!next.success) return next;
    allData.push(...next.data);
  }

  return {
    ...firstPage,
    data: allData,
    meta: {
      ...firstPage.meta,
      count: allData.length,
    },
  };
}

function serializeUpdateSgCategoryValuePayload(
  payload: UpdateSgCategoryValuePayload
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const name = payload.sg_catg_val_name ?? payload.subgroup_name;
  if (name != null) body.sg_catg_val_name = name;
  const gid = payload.sg_catg_val_gid ?? payload.subgroup_gid;
  if (gid != null && gid !== "") body.sg_catg_val_gid = gid;
  const order = payload.sg_catg_val_order ?? payload.subgroup_order;
  if (order != null) body.sg_catg_val_order = order;
  const globalFlag = payload.sg_catg_val_global ?? payload.subgroup_global;
  if (globalFlag != null) body.sg_catg_val_global = globalFlag;
  return body;
}

/**
 * PATCH /dw/{dw_id}/sg-categories-values/{value_identifier}
 * value_identifier supports either numeric n_id or alphanumeric g_id.
 */
async function updateSgCategoryValue(
  dwId: string,
  valueIdentifier: string,
  payload: UpdateSgCategoryValuePayload
): Promise<SgCategoryValueMutationResult> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_SG_CATEGORIES_VALUES_LIST)}/${encodeURIComponent(valueIdentifier)}`;
  const json = await patchRequest(
    url,
    serializeUpdateSgCategoryValuePayload(payload),
    undefined,
    undefined,
    { suppressErrorMessage: true }
  );
  return json as SgCategoryValueMutationResult;
}

/**
 * PATCH /dw/{dw_id}/subgroups/{identifier}
 * identifier: numeric subgroup_val_nid or subgroup_val_gid (combination GID from list subgroups).
 */
async function updateSubgroupVal(
  dwId: string,
  identifier: string,
  payload: UpdateSubgroupValPayload
): Promise<SgCategoryValueMutationResult> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_SUBGROUPS)}/${encodeURIComponent(identifier)}`;
  const body: Record<string, unknown> = {};
  if (payload.sv_name != null) body.sv_name = payload.sv_name;
  if (payload.sv_gid != null && payload.sv_gid !== "") body.sv_gid = payload.sv_gid;
  if (payload.sv_order != null) body.sv_order = payload.sv_order;
  if (payload.sv_global != null) body.sv_global = payload.sv_global;
  if (payload.sg_cat_val_gids != null) body.sg_cat_val_gids = payload.sg_cat_val_gids;
  const json = await patchRequest(
    url,
    body,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  );
  return json as SgCategoryValueMutationResult;
}

/**
 * DELETE /dw/{dw_id}/sg-categories-values/{value_identifier}
 * value_identifier supports either numeric n_id or alphanumeric g_id.
 */
async function deleteSgCategoryValue(
  dwId: string,
  valueIdentifier: string
): Promise<SgCategoryValueMutationResult> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_SG_CATEGORIES_VALUES_LIST)}/${encodeURIComponent(valueIdentifier)}`;
  const json = (await deleteRequest(url, undefined, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success === false) {
    return json as unknown as SgCategoryValueMutationError;
  }
  return { success: true, ...json } as SgCategoryValueMutationResult;
}

async function deleteMultipleSubgroups(
  dwId: string,
  subgroupValGids: string[]
): Promise<DeleteSubgroupResult> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_SUBGROUPS)}/multiple-delete`;
  const json = (await postRequest(
    url,
    { subgroup_val_gid: subgroupValGids },
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as Record<string, unknown>;
  if (json.success === false) {
    return json as unknown as DeleteSubgroupResult;
  }
  return {
    success: true,
    message: json.message as string | undefined,
  } as DeleteSubgroupResult;
}

const Mi = ({ name, className = "" }: { name: string; className?: string }) => (
  <span className={`material-icons ${className}`.trim()} aria-hidden>
    {name}
  </span>
);

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function SubgroupAddRowDimensionCell({
  dim,
  addRowSelections,
  addRowSearchTerms,
  setAddRowSearchTerms,
  addRowDropdownOpen,
  setAddRowDropdownOpen,
  toggleAddRowValue,
}: {
  dim: DimensionCategory;
  addRowSelections: Record<string, string[]>;
  addRowSearchTerms: Record<string, string>;
  setAddRowSearchTerms: Dispatch<SetStateAction<Record<string, string>>>;
  addRowDropdownOpen: string | null;
  setAddRowDropdownOpen: Dispatch<SetStateAction<string | null>>;
  toggleAddRowValue: (dimGid: string, valGid: string) => void;
}) {
  const isOpen = addRowDropdownOpen === dim.gid;
  const filteredValues = useMemo(
    () =>
      dim.values.filter((val) =>
        val.name
          .toLowerCase()
          .includes((addRowSearchTerms[dim.gid] ?? "").toLowerCase())
      ),
    [dim.values, dim.gid, addRowSearchTerms]
  );
  const options = useMemo(
    () => filteredValues.map((v) => ({ value: v.gid, label: v.name })),
    [filteredValues]
  );

  return (
    <MultiSelectDropdown
      triggerClassName={gridTextFieldClassName(
        "flex h-8 items-center justify-between gap-1 px-2 text-xs shadow-none"
      )}
      open={isOpen}
      onOpenChange={(next) => {
        if (next) setAddRowDropdownOpen(dim.gid);
        else setAddRowDropdownOpen((prev) => (prev === dim.gid ? null : prev));
      }}
      options={options}
      selectedValues={addRowSelections[dim.gid] ?? []}
      onToggleValue={(valGid) => toggleAddRowValue(dim.gid, valGid)}
      searchQuery={addRowSearchTerms[dim.gid] ?? ""}
      onSearchChange={(q) =>
        setAddRowSearchTerms((prev) => ({ ...prev, [dim.gid]: q }))
      }
      triggerDataAttrs={{
        "data-tv-enter-field": "true",
        "data-tv-row-enter-open-dropdown": "true",
      }}
      menuPortal
    />
  );
}

const LOCAL_DIM_GID_PREFIX = "__local_new_dim__";
const RECENT_CREATED_ROW_HIGHLIGHT_MS = 4500;

type TabId = "all" | "missing_data" | "missing_ius";
type PanelDraftValue = {
  key: string;
  gid?: string;
  name: string;
  originalName: string;
  usedInCount: number;
  isNew: boolean;
  draftGid: string;
  isSystem?: boolean;
};

function normalizeDuplicateKey(value: string): string {
  return value.trim().toLowerCase();
}

function hasDuplicatePanelValueName(values: PanelDraftValue[]): boolean {
  const seen = new Set<string>();
  for (const value of values) {
    const normalizedName = normalizeDuplicateKey(value.name);
    if (!normalizedName) continue;
    if (seen.has(normalizedName)) return true;
    seen.add(normalizedName);
  }
  return false;
}

function hasDuplicatePanelValueGid(values: PanelDraftValue[]): boolean {
  const seen = new Set<string>();
  for (const value of values) {
    const normalizedGid = normalizeDuplicateKey(value.draftGid);
    if (!normalizedGid) continue;
    if (seen.has(normalizedGid)) return true;
    seen.add(normalizedGid);
  }
  return false;
}

function hasDuplicateDimensionNameOrGid(
  dimensions: DimensionCategory[],
  currentDimensionGid: string,
  nextDimensionName: string,
  requestedDimensionGid: string
): boolean {
  const normalizedName = normalizeDuplicateKey(nextDimensionName);
  const normalizedGid = normalizeDuplicateKey(requestedDimensionGid);
  return dimensions.some((d) => {
    if (d.gid === currentDimensionGid) return false;
    const nameMatches =
      normalizedName.length > 0 && normalizeDuplicateKey(d.name) === normalizedName;
    const gidMatches =
      normalizedGid.length > 0 && normalizeDuplicateKey(d.gid) === normalizedGid;
    return nameMatches || gidMatches;
  });
}

function hasDuplicateDimensionValueNameOrGid(values: PanelDraftValue[]): boolean {
  return hasDuplicatePanelValueName(values) || hasDuplicatePanelValueGid(values);
}

const SUBGROUP_SCOPE_BY_TAB: Record<Exclude<TabId, "all">, "NO_DATA" | "NO_IUS"> = {
  missing_data: "NO_DATA",
  missing_ius: "NO_IUS",
};

type CreatedSubgroupApiItem = {
  sg_nid?: number;
  sg_gid?: string;
  subgroup_val_nid?: number;
};

function parseCreatedSubgroups(data: unknown): CreatedSubgroupApiItem[] {
  if (!Array.isArray(data)) return [];
  const parsed: CreatedSubgroupApiItem[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const sg_gid = typeof record.sg_gid === "string" ? record.sg_gid : undefined;
    const sg_nid = typeof record.sg_nid === "number" ? record.sg_nid : undefined;
    const subgroup_val_nid =
      typeof record.subgroup_val_nid === "number"
        ? record.subgroup_val_nid
        : undefined;
    if (!sg_gid && sg_nid == null && subgroup_val_nid == null) continue;
    parsed.push({
      ...(sg_gid ? { sg_gid } : {}),
      ...(sg_nid != null ? { sg_nid } : {}),
      ...(subgroup_val_nid != null ? { subgroup_val_nid } : {}),
    });
  }
  return parsed;
}

export default function SubgroupsPage() {
  const {
    dwId,
    setBulkDelete,
    setToolbarExport,
  } = useSidebar();
  const { t } = useCore();
  const { allowed } = useDwPermissionGuard(DW_ROUTE_PERMISSIONS.template.subgroups);
  const { canCreate, canUpdate, canDelete } = useDwCrudPermissions(
    DW_ROUTE_PERMISSIONS.template.subgroups
  );

  const tblScrollRef = useRef<HTMLDivElement>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [tabSwitchPending, setTabSwitchPending] = useState(false);

  // Pagination & sort
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [sortField, setSortField] = useState("subgroup_val");

  // Filters
  const [colFilterName, setColFilterName] = useState("");
  const [dimensionFilters, setDimensionFilters] = useState<Record<string, string>>({});
  const debouncedColName = useDebounce(colFilterName, 300);
  const debouncedDimensionFiltersJson = useDebounce(
    JSON.stringify(dimensionFilters),
    300
  );

  // Selection
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  // Dimensions (from sg-categories-values API)
  const [dimensions, setDimensions] = useState<DimensionCategory[]>([]);
  const pendingDeletedDimGids = useRef<Set<string>>(new Set());
  const [optimisticSubgroups, setOptimisticSubgroups] = useState<SubgroupRaw[]>([]);
  const [deletedSubgroupGids, setDeletedSubgroupGids] = useState<Set<string>>(new Set());

  // Side panel
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelDimGid, setPanelDimGid] = useState<string | null>(null);
  const [panelTitleEditMode, setPanelTitleEditMode] = useState(false);
  const [panelTitleInput, setPanelTitleInput] = useState("");
  const [panelCategoryGidInput, setPanelCategoryGidInput] = useState("");
  const [panelDraftValues, setPanelDraftValues] = useState<PanelDraftValue[]>([]);
  const [panelNewValueName, setPanelNewValueName] = useState("");
  const [panelNewValueGid, setPanelNewValueGid] = useState("");
  const [panelSaveLoading, setPanelSaveLoading] = useState(false);
  const [panelDeleteLoading, setPanelDeleteLoading] = useState(false);
  const [panelValueDeleteKey, setPanelValueDeleteKey] = useState<string | null>(null);
  const [panelDeleteCategoryModalOpen, setPanelDeleteCategoryModalOpen] =
    useState(false);
  const [panelDeleteValueModalOpen, setPanelDeleteValueModalOpen] = useState(false);
  const [panelDeleteValuePending, setPanelDeleteValuePending] =
    useState<PanelDraftValue | null>(null);
  const panelTitleInputRef = useRef<HTMLInputElement>(null);
  const panelNewValueNameInputRef = useRef<HTMLInputElement>(null);
  const panelAddValueRowExpandFocusRef = useRef(false);
  const [panelValuesAddRowExpanded, setPanelValuesAddRowExpanded] =
    useState(false);
  const panelValuesCellModeRef = useRef<"navigate" | "edit">("navigate");
  const panelValuesOpenedByPointerRef = useRef(false);

  // Add new dimension column
  const [highlightedDimensionGid, setHighlightedDimensionGid] = useState<string | null>(null);
  const [draggingDimensionGid, setDraggingDimensionGid] = useState<string | null>(null);
  const [dragOverDimensionGid, setDragOverDimensionGid] = useState<string | null>(null);

  // Add row state
  const [addRowSelections, setAddRowSelections] = useState<Record<string, string[]>>({});
  const [addRowSearchTerms, setAddRowSearchTerms] = useState<Record<string, string>>({});
  const [addRowDropdownOpen, setAddRowDropdownOpen] = useState<string | null>(null);
  const [addRowExpanded, setAddRowExpanded] = useState(false);
  const [addRowLoading, setAddRowLoading] = useState(false);
  const [recentCreatedKeys, setRecentCreatedKeys] = useState<string[]>([]);
  /** Keeps created subgroup rows directly under the add row until the warehouse changes. */
  const [pinnedSubgroupKeys, setPinnedSubgroupKeys] = useState<string[]>([]);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const addRowRef = useRef<HTMLTableRowElement>(null);

  // Inline edit state
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [inlineDimValueGids, setInlineDimValueGids] = useState<Record<string, string | null>>({});
  const [inlineDimComboSearch, setInlineDimComboSearch] = useState<Record<string, string>>({});
  const [inlineDimComboOpen, setInlineDimComboOpen] = useState<Record<string, boolean>>({});
  const [inlineDimComboHi, setInlineDimComboHi] = useState<Record<string, number>>({});
  const [inlineSaveLoading, setInlineSaveLoading] = useState(false);
  const [inlineUpdateConfirmOpen, setInlineUpdateConfirmOpen] = useState(false);

  useEffect(() => {
    const onArrowNavigation = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof HTMLElement) {
        const isInputTarget =
          event.target.closest(
            "input, textarea, select, button, [contenteditable='true'], [role='textbox'], [role='combobox']"
          ) != null;
        if (isInputTarget) return;
      }
      setActiveRowId(null);
    };
    document.addEventListener("keydown", onArrowNavigation);
    return () => {
      document.removeEventListener("keydown", onArrowNavigation);
    };
  }, []);

  // Delete modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteRunning, setDeleteRunning] = useState(false);
  const [gidDrawerOpen, setGidDrawerOpen] = useState(false);
  const [gidDrawerRows, setGidDrawerRows] = useState<GidManagerDrawerRow[]>([]);
  const [gidDrawerLoading, setGidDrawerLoading] = useState(false);

  // ── Fetch dimension categories via sg-categories-values ──────────────────
  const loadDimensions = useCallback(async () => {
    if (!dwId) return;
    const [valuesRes, categoriesRes] = await Promise.all([
      fetchAllSgCategoriesValues(dwId),
      fetchSgCategories(dwId, { used_in: true }),
    ]);
    if (valuesRes.success) {
      const categoryMetaByGid: Record<string, SgCategoryOrderMeta> = {};
      if (categoriesRes.success) {
        for (const cat of categoriesRes.data as SgCategory[]) {
          const gid = cat.sg_cat_gid ?? cat.sg_gid;
          if (!gid) continue;
          categoryMetaByGid[gid] = {
            gid,
            name:
              cat.sg_cat_name ??
              cat.sg_name ??
              valuesRes.meta.sg_cat_info[gid] ??
              gid,
            nid: cat.sg_cat_nid ?? cat.sg_nid,
            order: cat.sg_cat_order ?? cat.sg_order,
            usedInCount: parseUsedInCount(cat.used_in),
            isSystem: cat.is_system ?? false,
          };
        }
      }
      const loaded = normalizeDimensionCategories(
        valuesRes.data,
        valuesRes.meta.sg_cat_info,
        categoryMetaByGid
      );
      setDimensions((prev) => {
        const localOnly = prev.filter((d) => d.gid.startsWith(LOCAL_DIM_GID_PREFIX));
        const serverDims = loaded.filter((d) => !pendingDeletedDimGids.current.has(d.gid));
        return [...serverDims, ...localOnly];
      });
    }
  }, [dwId]);

  useEffect(() => {
    void loadDimensions();
  }, [loadDimensions]);

  const loadGidDrawerSubgroups = useCallback(async () => {
    if (!dwId) return;
    setGidDrawerLoading(true);
    try {
      const res = await fetchSubgroupsForGidManager(dwId);
      if (!res.success) {
        toast.error(res.err_message ?? "Failed to load subgroups");
        setGidDrawerRows([]);
        return;
      }
      setGidDrawerRows(mapSubgroupListRawToGidDrawerRows(res.data));
    } finally {
      setGidDrawerLoading(false);
    }
  }, [dwId]);

  useEffect(() => {
    if (gidDrawerOpen && dwId) void loadGidDrawerSubgroups();
  }, [gidDrawerOpen, dwId, loadGidDrawerSubgroups]);

  useEffect(() => {
    setOptimisticSubgroups([]);
    setDeletedSubgroupGids(new Set());
    setRecentCreatedKeys([]);
    setPinnedSubgroupKeys([]);
    setAddRowExpanded(false);
  }, [dwId]);

  useEffect(() => {
    if (recentCreatedKeys.length === 0) return;
    const snapshot = [...recentCreatedKeys];
    const id = window.setTimeout(() => {
      setRecentCreatedKeys((prev) =>
        prev.filter((k) => !snapshot.includes(k))
      );
    }, RECENT_CREATED_ROW_HIGHLIGHT_MS);
    return () => window.clearTimeout(id);
  }, [recentCreatedKeys]);

  const recentCreatedKeySet = useMemo(
    () => new Set(recentCreatedKeys),
    [recentCreatedKeys]
  );

  // ── List / export search: subgroup_val (name column) vs subgroup_name per dimension ──
  const subgroupListSearchParams = useMemo(() => {
    let debouncedDimensionFilters: Record<string, string> = {};
    try {
      const parsed = JSON.parse(debouncedDimensionFiltersJson) as
        | Record<string, string>
        | null;
      if (parsed && typeof parsed === "object") {
        debouncedDimensionFilters = parsed;
      }
    } catch {
      debouncedDimensionFilters = {};
    }

    for (const d of dimensions) {
      const term = (debouncedDimensionFilters[d.gid] ?? "").trim();
      if (term) {
        const categoryName = d.name.trim();
        return {
          search: term,
          search_by: "subgroup_category_val" as const,
          search_field: "subgroup_name" as const,
          ...(categoryName ? { category_val: categoryName } : {}),
        };
      }
    }

    const col = debouncedColName.trim();
    if (col) {
      return {
        search: col,
        search_by: "subgroup" as const,
        search_field: "subgroup_val" as const,
      };
    }

    return {};
  }, [debouncedColName, debouncedDimensionFiltersJson, dimensions]);

  // ── Server list query ────────────────────────────────────────────────────
  const subgroupsListUrl = useMemo(
    () => (dwId ? getDWAPIURL(dwId, REFERENCE_PATH_SUBGROUPS) : ""),
    [dwId]
  );

  const parseSubgroupsListResponse = useCallback(
    (json: unknown): ServerListParseResult<SubgroupRaw, SubgroupsListMeta> => {
      const r = json as SubgroupsListResult;
      if (!r || typeof r !== "object" || !("success" in r) || !r.success) {
        const msg =
          typeof (r as { err_message?: string })?.err_message === "string"
            ? (r as { err_message: string }).err_message
            : "Failed to load subgroups";
        return { ok: false, message: msg };
      }
      const resp = r as { data: SubgroupRaw[]; meta: SubgroupsListMeta };
      const totals = parseListMetaTotals(resp.meta);
      return {
        ok: true,
        rows: resp.data,
        ...totals,
        meta: resp.meta,
      };
    },
    []
  );

  const subgroupsListQuery = useMemo(() => {
    const scope = activeTab === "all" ? undefined : SUBGROUP_SCOPE_BY_TAB[activeTab];
    return {
      page,
      page_size: pageSize,
      sort_order: sortOrder,
      sort_field: sortField,
      subgroup_info: true,
      ...(scope ? { scope } : {}),
      ...subgroupListSearchParams,
    };
  }, [
    page,
    pageSize,
    sortOrder,
    sortField,
    subgroupListSearchParams,
    activeTab,
  ]);

  const listState = useServerListQuery({
    listUrl: subgroupsListUrl,
    query: subgroupsListQuery,
    parseListResponse: parseSubgroupsListResponse,
    enabled: Boolean(dwId && subgroupsListUrl),
  });

  const { rows: rawSubgroups, meta, loading, refetch: loadSubgroups } = listState;

  // ── Derived data ─────────────────────────────────────────────────────────
  const sgCategoryValues = useMemo<Record<string, SubgroupsMetaCategoryValue>>(
    () => meta?.sg_category_values ?? {},
    [meta]
  );

  const filteredRawSubgroups = useMemo(
    () =>
      rawSubgroups.filter((s) => {
        const gid = getSubgroupGid(s);
        return !(gid && deletedSubgroupGids.has(gid));
      }),
    [rawSubgroups, deletedSubgroupGids]
  );

  const filteredOptimisticSubgroups = useMemo(
    () =>
      optimisticSubgroups.filter((s) => {
        const gid = getSubgroupGid(s);
        return !(gid && deletedSubgroupGids.has(gid));
      }),
    [optimisticSubgroups, deletedSubgroupGids]
  );

  const subgroupsWithOptimisticTop = useMemo(() => {
    if (filteredOptimisticSubgroups.length === 0) return filteredRawSubgroups;
    const seen = new Set<string>();
    const merged = [...filteredOptimisticSubgroups, ...filteredRawSubgroups];
    return merged.filter((s, idx) => {
      const gid = getSubgroupGid(s);
      const key =
        gid ??
        String(
          s.subgroup_val_nid ??
            s.sg_nid ??
            s.sv_nid ??
            `${s.subgroup_val ?? s.sg_name ?? s.sv_name ?? ""}-${idx}`
        );
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filteredOptimisticSubgroups, filteredRawSubgroups]);

  const rows = useMemo(() => {
    const builtRows = buildSubgroupRows(subgroupsWithOptimisticTop, dimensions, sgCategoryValues);
    if (pinnedSubgroupKeys.length === 0) return builtRows;

    const priorityByKey = new Map(
      pinnedSubgroupKeys.map((key, idx) => [key, idx] as const)
    );
    const createdTopRows: SubgroupTableRow[] = [];
    const restRows: SubgroupTableRow[] = [];

    for (const row of builtRows) {
      const rk = subgroupListRowRecentKey(row.subgroupRaw);
      if (priorityByKey.has(rk)) {
        createdTopRows.push(row);
      } else {
        restRows.push(row);
      }
    }

    createdTopRows.sort(
      (a, b) =>
        (priorityByKey.get(subgroupListRowRecentKey(a.subgroupRaw)) ??
          Number.MAX_SAFE_INTEGER) -
        (priorityByKey.get(subgroupListRowRecentKey(b.subgroupRaw)) ??
          Number.MAX_SAFE_INTEGER)
    );
    return [...createdTopRows, ...restRows];
  }, [subgroupsWithOptimisticTop, dimensions, sgCategoryValues, pinnedSubgroupKeys]);
  const panelDim = useMemo(
    () => (panelDimGid ? dimensions.find((d) => d.gid === panelDimGid) ?? null : null),
    [dimensions, panelDimGid]
  );
  const panelDimIsSystem = panelDim?.isSystem === true;
  const panelDimIsLocal = panelDim ? panelDim.gid.startsWith(LOCAL_DIM_GID_PREFIX) : false;
  /** New (unsaved) dimension → editing/creating it is a create action; existing dimension → update. */
  const panelDimEditAllowed = panelDimIsLocal ? canCreate : canUpdate;
  const panelDimensionUsedInCount = useMemo(() => {
    if (!panelDim) return 0;
    return panelDim.usedInCount ?? 0;
  }, [panelDim]);
  const panelDeleteValueUsedInCount = useMemo(() => {
    const raw = panelDeleteValuePending?.usedInCount;
    return typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, raw) : 0;
  }, [panelDeleteValuePending]);

  const optimisticExtraCount = useMemo(() => {
    if (filteredOptimisticSubgroups.length === 0) return 0;
    const existingServerGids = new Set(
      filteredRawSubgroups
        .map((s) => getSubgroupGid(s))
        .filter((gid): gid is string => Boolean(gid))
    );
    return filteredOptimisticSubgroups.filter((s) => {
      const gid = getSubgroupGid(s);
      return !gid || !existingServerGids.has(gid);
    }).length;
  }, [filteredOptimisticSubgroups, filteredRawSubgroups]);

  const deletedServerCount = useMemo(() => {
    if (deletedSubgroupGids.size === 0) return 0;
    const serverGids = new Set(
      rawSubgroups.map((s) => getSubgroupGid(s)).filter((gid): gid is string => Boolean(gid))
    );
    let count = 0;
    deletedSubgroupGids.forEach((gid) => {
      if (serverGids.has(gid)) count += 1;
    });
    return count;
  }, [deletedSubgroupGids, rawSubgroups]);

  const totalCount =
    Math.max((meta?.total_count ?? rawSubgroups.length) - deletedServerCount, 0) +
    optimisticExtraCount;
  const totalPages = meta?.total_pages ?? 0;

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedColName, debouncedDimensionFiltersJson, activeTab]);

  useEffect(() => {
    setTabSwitchPending(true);
  }, [activeTab]);

  useEffect(() => {
    if (!loading) setTabSwitchPending(false);
  }, [loading]);

  // ── Selection ────────────────────────────────────────────────────────────
  const selectableRowIds = useMemo(() => {
    return new Set(
      rows
        .filter((row) => row.subgroupRaw.is_system !== true)
        .map((row) => row.rowId)
    );
  }, [rows]);

  const hasSelectableRows = selectableRowIds.size > 0;

  const allSelectableRowsSelected = useMemo(() => {
    if (!hasSelectableRows) return false;
    for (const rowId of selectableRowIds) {
      if (!selectedRowIds.has(rowId)) return false;
    }
    return true;
  }, [hasSelectableRows, selectableRowIds, selectedRowIds]);

  const selectAll = useCallback(() => {
    setSelectedRowIds((prev) => {
      if (selectableRowIds.size === 0) return new Set();
      const next = new Set(prev);
      let allSelected = true;
      selectableRowIds.forEach((rowId) => {
        if (!prev.has(rowId)) allSelected = false;
      });
      selectableRowIds.forEach((rowId) => {
        if (allSelected) next.delete(rowId);
        else next.add(rowId);
      });
      return next;
    });
  }, [selectableRowIds]);

  const toggleSelect = useCallback((rowId: string) => {
    if (!selectableRowIds.has(rowId)) return;
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, [selectableRowIds]);

  const clearSelection = useCallback(() => setSelectedRowIds(new Set()), []);

  useEffect(() => {
    setSelectedRowIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((rowId) => {
        if (selectableRowIds.has(rowId)) {
          next.add(rowId);
          return;
        }
        changed = true;
      });
      return changed ? next : prev;
    });
  }, [selectableRowIds]);

  // ── Toolbar bulk delete wiring ───────────────────────────────────────────
  useEffect(() => {
    setBulkDelete({
      disabled: selectedRowIds.size === 0 || !canDelete,
      onClick: () => setDeleteModalOpen(true),
    });
    return () => setBulkDelete(null);
  }, [selectedRowIds, setBulkDelete, canDelete]);

  const exportBusyRef = useRef(false);
  useEffect(() => {
    const scope = activeTab === "all" ? undefined : SUBGROUP_SCOPE_BY_TAB[activeTab];
    setToolbarExport({
      onClick: async () => {
        if (!dwId || exportBusyRef.current) return;
        exportBusyRef.current = true;
        try {
          const result = await downloadSubgroupsExport(dwId, {
            sort_order: sortOrder,
            sort_field: sortField,
            ...subgroupListSearchParams,
            scope,
            subgroup_info: true,
          });
          if (!result.ok) {
            toast.error(t("ERROR_MESSAGE", result.message));
          } else {
            toast.success(t("SUBGROUPS_EXPORT_SUCCESS"));
          }
        } catch (e) {
          toast.error(
            t(
              "SUBGROUPS_EXPORT_FAILED",
              e instanceof Error ? e.message : "Export failed"
            )
          );
        } finally {
          exportBusyRef.current = false;
        }
      },
      disabled: !dwId,
    });
    return () => setToolbarExport(null);
  }, [
    dwId,
    sortOrder,
    sortField,
    subgroupListSearchParams,
    activeTab,
    setToolbarExport,
    t,
  ]);

  // ── Dimension filter callback ────────────────────────────────────────────
  const setDimensionFilter = useCallback(
    (dimGid: string, value: string) => {
      setDimensionFilters((prev) => ({ ...prev, [dimGid]: value }));
    },
    []
  );

  // ── Side panel ───────────────────────────────────────────────────────────
  const openDimensionPanel = useCallback(
    (dim: DimensionCategory) => {
      panelValuesCellModeRef.current = "navigate";
      setPanelDimGid(dim.gid);
      setPanelOpen(true);
      setPanelTitleEditMode(true);
      setPanelTitleInput(dim.name);
      setPanelCategoryGidInput(
        dim.gid.startsWith(LOCAL_DIM_GID_PREFIX) ? "" : dim.gid
      );
      setPanelDraftValues(
        dim.values.map((val) => ({
          key: val.gid,
          gid: val.gid,
          name: val.name,
          originalName: val.name,
          usedInCount: val.usedInCount ?? 0,
          isNew: false,
          draftGid: val.gid,
          isSystem: val.isSystem ?? false,
        }))
      );
      setPanelNewValueName("");
      setPanelNewValueGid("");
      setPanelValuesAddRowExpanded(false);
    },
    []
  );

  useLayoutEffect(() => {
    if (!panelValuesAddRowExpanded || !panelAddValueRowExpandFocusRef.current) {
      return;
    }
    panelAddValueRowExpandFocusRef.current = false;
    panelNewValueNameInputRef.current?.focus();
  }, [panelValuesAddRowExpanded]);

  useLayoutEffect(() => {
    if (!panelOpen || !panelDimGid || !panelTitleEditMode) return;
    const id = requestAnimationFrame(() => {
      panelTitleInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [panelOpen, panelDimGid, panelTitleEditMode]);

  const onPanelTableInputPointerDown = useCallback(() => {
    panelValuesOpenedByPointerRef.current = true;
  }, []);

  const onPanelTableInputFocus = useCallback((e: FocusEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    if (panelValuesOpenedByPointerRef.current) {
      panelValuesCellModeRef.current = "edit";
      panelValuesOpenedByPointerRef.current = false;
      el.removeAttribute("data-dm-sg-panel-navigate");
      return;
    }
    panelValuesCellModeRef.current = "navigate";
    requestAnimationFrame(() => {
      if (panelValuesCellModeRef.current === "navigate" && document.activeElement === el) {
        el.setAttribute("data-dm-sg-panel-navigate", "");
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
  }, []);

  const onPanelTableInputKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      const el = e.currentTarget;
      if (panelValuesCellModeRef.current === "edit") {
        if (e.key === "Enter" && !e.altKey && !e.ctrlKey && !e.metaKey) {
          const next = getNextPanelGridInput(el);
          e.preventDefault();
          el.removeAttribute("data-dm-sg-panel-navigate");
          if (next) {
            next.focus();
          }
        }
        return;
      }
      const hasMods = e.altKey || e.ctrlKey || e.metaKey;
      if (e.key === "Enter" && !hasMods) {
        e.preventDefault();
        el.removeAttribute("data-dm-sg-panel-navigate");
        panelValuesCellModeRef.current = "edit";
        const len = el.value.length;
        el.setSelectionRange(len, len);
        return;
      }
      if (hasMods) return;
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        el.removeAttribute("data-dm-sg-panel-navigate");
        panelValuesCellModeRef.current = "edit";
        const field = el.dataset.dmSgPanelField;
        const vk = el.dataset.dmSgPanelValueKey as string | undefined;
        if (field === "new-name") {
          setPanelNewValueName("");
        } else if (field === "new-gid") {
          setPanelNewValueGid("");
        } else if (field === "draft-name" && vk) {
          setPanelDraftValues((prev) =>
            prev.map((x) => (x.key === vk ? { ...x, name: "" } : x)),
          );
        } else if (field === "draft-gid" && vk) {
          setPanelDraftValues((prev) =>
            prev.map((x) => (x.key === vk ? { ...x, draftGid: "" } : x)),
          );
        }
        el.setSelectionRange(0, 0);
        return;
      }
      if (!isPlainPrintableKey(e)) return;
      e.preventDefault();
      el.removeAttribute("data-dm-sg-panel-navigate");
      panelValuesCellModeRef.current = "edit";
      const ch = e.key;
      const field = el.dataset.dmSgPanelField;
      const vk = el.dataset.dmSgPanelValueKey as string | undefined;
      const rafCaret = (pos: number) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (document.activeElement === el) el.setSelectionRange(pos, pos);
          });
        });
      };
      if (field === "new-name") {
        setPanelNewValueName(ch);
        rafCaret(1);
      } else if (field === "new-gid") {
        const sg = sanitizeManualGidInput(ch);
        setPanelNewValueGid(sg);
        rafCaret(sg.length);
      } else if (field === "draft-name" && vk) {
        setPanelDraftValues((prev) =>
          prev.map((x) => (x.key === vk ? { ...x, name: ch } : x)),
        );
        rafCaret(1);
      } else if (field === "draft-gid" && vk) {
        const sg = sanitizeManualGidInput(ch);
        setPanelDraftValues((prev) =>
          prev.map((x) => (x.key === vk ? { ...x, draftGid: sg } : x)),
        );
        rafCaret(sg.length);
      }
    },
    [],
  );

  const handlePanelValuesTrKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTableRowElement>) => {
      if (event.defaultPrevented) return;
      const hasModifiers =
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
      if (
        !hasModifiers &&
        (event.key === "ArrowUp" ||
          event.key === "ArrowDown" ||
          event.key === "ArrowLeft" ||
          event.key === "ArrowRight")
      ) {
        if (shouldPreserveLocalArrowHandling(event.target, event.key)) return;

        const current = event.currentTarget;

        if (
          (event.key === "ArrowDown" || event.key === "ArrowUp") &&
          current.getAttribute("data-dm-sg-panel-add-expanded") === "true"
        ) {
          const rowTargets = getRowEnterNavigationTargets(current);
          const active = findActiveRowEnterTarget(current, event.target);
          const direction: 1 | -1 = event.key === "ArrowDown" ? 1 : -1;
          const targetIndex = active
            ? Math.max(0, rowTargets.indexOf(active))
            : direction === 1
              ? 0
              : Math.max(0, rowTargets.length - 1);
          if (moveFocusBetweenGridRows(current, direction, targetIndex)) {
            event.preventDefault();
            setPanelValuesAddRowExpanded(false);
            setPanelNewValueName("");
            setPanelNewValueGid("");
            return;
          }
        }

        if (event.key === "ArrowUp") {
          const prev = current.previousElementSibling;
          if (
            prev instanceof HTMLTableRowElement &&
            prev.getAttribute("data-dm-sg-panel-add-value-row") === "true"
          ) {
            if (prev.getAttribute("data-dm-sg-panel-add-collapsed") === "true") {
              event.preventDefault();
              panelAddValueRowExpandFocusRef.current = true;
              setPanelValuesAddRowExpanded(true);
              prev.scrollIntoView({ block: "nearest" });
              return;
            }
            const rowTargets = getRowEnterNavigationTargets(current);
            const active = findActiveRowEnterTarget(current, event.target);
            const idx = active ? rowTargets.indexOf(active) : 0;
            const colIdx = idx < 0 ? 0 : idx <= 1 ? idx : 0;
            const addTargets = getRowEnterNavigationTargets(prev);
            const dest =
              addTargets[colIdx] ??
              addTargets.find((el) => isTextLikeInput(el)) ??
              addTargets[0];
            if (dest) {
              event.preventDefault();
              focusEditableElement(dest, {
                selectText: false,
                cursorAtEnd: true,
              });
              prev.scrollIntoView({ block: "nearest" });
              return;
            }
          }
        }

        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          const active = findActiveRowEnterTarget(current, event.target);
          if (active && isTextLikeInput(active) && panelValuesCellModeRef.current === "edit") {
            return;
          }
          if (
            moveFocusWithinRow(
              current,
              event.target,
              event.key === "ArrowRight" ? 1 : -1
            )
          ) {
            event.preventDefault();
          }
          return;
        }

        const rowTargets = getRowEnterNavigationTargets(current);
        const active = findActiveRowEnterTarget(current, event.target);
        const direction: 1 | -1 = event.key === "ArrowDown" ? 1 : -1;
        event.preventDefault();
        const targetIndex = active
          ? Math.max(0, rowTargets.indexOf(active))
          : direction === 1
            ? 0
            : Math.max(0, rowTargets.length - 1);
        moveFocusBetweenGridRows(current, direction, targetIndex);
      }
    },
    []
  );

  const closeDimensionPanel = useCallback(() => {
    panelValuesCellModeRef.current = "navigate";
    setPanelOpen(false);
    setPanelDimGid(null);
    setPanelTitleEditMode(false);
    setPanelTitleInput("");
    setPanelCategoryGidInput("");
    setPanelDraftValues([]);
    setPanelNewValueName("");
    setPanelNewValueGid("");
    setPanelValuesAddRowExpanded(false);
    setPanelDeleteCategoryModalOpen(false);
    setPanelDeleteValueModalOpen(false);
    setPanelDeleteValuePending(null);
  }, []);

  /** First Escape: revert dirty edits on the focused control/row; then Escape closes (Drawer). */
  const handleDimensionDrawerEscapeFirst = useCallback((): boolean => {
    if (panelDeleteCategoryModalOpen || panelDeleteValueModalOpen) {
      return true;
    }
    if (!panelDim) return false;

    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return false;

    const inDrawerAside = el.closest('aside[role="dialog"]');
    if (!inDrawerAside) return false;

    if (panelTitleInputRef.current === el) {
      if (panelTitleInput.trim() !== (panelDim.name ?? "").trim()) {
        setPanelTitleInput(panelDim.name);
        return true;
      }
      return false;
    }

    if (el.matches("[data-dm-sg-panel-category-gid-input]")) {
      const reverted = panelDim.gid.startsWith(LOCAL_DIM_GID_PREFIX)
        ? ""
        : panelDim.gid;
      if (panelCategoryGidInput !== reverted) {
        setPanelCategoryGidInput(reverted);
        return true;
      }
      return false;
    }

    const addRowTr = el.closest("tr[data-dm-sg-panel-add-value-row]");
    if (addRowTr) {
      if (panelNewValueName.trim() || panelNewValueGid.trim()) {
        setPanelNewValueName("");
        setPanelNewValueGid("");
        if (addRowTr.getAttribute("data-dm-sg-panel-add-expanded") === "true") {
          setPanelValuesAddRowExpanded(false);
        }
        return true;
      }
      return false;
    }

    const valTr = el.closest("tr[data-dm-sg-panel-value-key]");
    const vk = valTr?.getAttribute("data-dm-sg-panel-value-key");
    if (vk) {
      const val = panelDraftValues.find((v) => v.key === vk);
      if (!val) return false;
      const persistedGid = (val.gid ?? "").trim();
      const nameDirty = val.name.trim() !== val.originalName.trim();
      const gidDirty = val.draftGid.trim() !== persistedGid;
      if (nameDirty || gidDirty) {
        setPanelDraftValues((prev) =>
          prev.map((x) =>
            x.key === vk ? { ...x, name: x.originalName, draftGid: x.gid ?? "" } : x
          )
        );
        return true;
      }
      return false;
    }

    return false;
  }, [
    panelDeleteCategoryModalOpen,
    panelDeleteValueModalOpen,
    panelDim,
    panelTitleInput,
    panelCategoryGidInput,
    panelNewValueName,
    panelNewValueGid,
    panelDraftValues,
  ]);

  const handlePanelAddValue = useCallback(() => {
    if (!canCreate) return;
    const name = panelNewValueName.trim();
    if (!name) return;
    const draftGid = panelNewValueGid.trim();
    const hasDuplicate = hasDuplicateDimensionValueNameOrGid([
      ...panelDraftValues,
      {
        key: "__candidate__",
        gid: undefined,
        name,
        originalName: name,
        usedInCount: 0,
        isNew: true,
        draftGid,
      },
    ]);
    if (hasDuplicate) {
      toast.error(
        t(
          "SUBGROUPS_DIMENSION_VALUES_IDS_UNIQUE",
          "Dimension values and IDs should be unique inside a dimension."
        )
      );
      return;
    }
    setPanelDraftValues((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        gid: undefined,
        originalName: name,
        usedInCount: 0,
        isNew: true,
        draftGid,
      },
    ]);
    setPanelNewValueName("");
    setPanelNewValueGid("");
    setPanelValuesAddRowExpanded(false);
  }, [panelDraftValues, panelNewValueName, panelNewValueGid, t, canCreate]);

  const executePanelDeleteValue = useCallback(
    async (value: PanelDraftValue): Promise<boolean> => {
      if (value.isNew) {
        setPanelDraftValues((prev) => prev.filter((x) => x.key !== value.key));
        return true;
      }
      if (!canDelete) return false;
      if (!dwId || !value.gid) return false;
      setPanelValueDeleteKey(value.key);
      try {
        const res = await deleteSgCategoryValue(dwId, value.gid);
        if (!res.success) {
          toast.error(
            res.err_message ?? t("SUBGROUPS_VALUE_DELETE_FAILED")
          );
          return false;
        }
        setPanelDraftValues((prev) => prev.filter((x) => x.key !== value.key));
        toast.success(t("SUBGROUPS_VALUE_DELETE_SUCCESS"));
        await loadDimensions();
        void loadSubgroups();
        return true;
      } finally {
        setPanelValueDeleteKey(null);
      }
    },
    [dwId, loadDimensions, loadSubgroups, t, canDelete]
  );

  const requestPanelDeleteValue = useCallback((value: PanelDraftValue) => {
    setPanelDeleteValuePending(value);
    setPanelDeleteValueModalOpen(true);
  }, []);

  const closePanelDeleteValueModal = useCallback(() => {
    if (panelValueDeleteKey !== null) return;
    setPanelDeleteValueModalOpen(false);
    setPanelDeleteValuePending(null);
  }, [panelValueDeleteKey]);

  const confirmPanelDeleteValue = useCallback(async () => {
    const value = panelDeleteValuePending;
    if (!value) return;
    const ok = await executePanelDeleteValue(value);
    if (ok) {
      setPanelDeleteValueModalOpen(false);
      setPanelDeleteValuePending(null);
    }
  }, [panelDeleteValuePending, executePanelDeleteValue]);

  const handlePanelSave = useCallback(async () => {
    if (!panelDim || !dwId) return;
    const nextTitle = panelTitleInput.trim() || panelDim.name;
    const requestedCategoryGid = panelCategoryGidInput.trim();
    const hasDuplicateDimension = hasDuplicateDimensionNameOrGid(
      dimensions,
      panelDim.gid,
      nextTitle,
      requestedCategoryGid
    );
    if (hasDuplicateDimension) {
      toast.error(
        t(
          "DIMENSION_NAME_ID_UNIQUE",
          "Dimension name and ID should be unique"
        )
      );
      return;
    }
    if (hasDuplicateDimensionValueNameOrGid(panelDraftValues)) {
      toast.error(
        t(
          "DIMENSION_VALUES_IDS_UNIQUE",
          "Dimension values and IDs should be unique inside a dimension."
        )
      );
      return;
    }
    setPanelSaveLoading(true);
    try {
      const isLocalDim = panelDim.gid.startsWith(LOCAL_DIM_GID_PREFIX);
      let persistedDimGid = panelDim.gid;

      if (isLocalDim) {
        const createRes = await createSgCategories(dwId, [
          {
            sg_cat_name: nextTitle,
            sg_cat_order: panelDim.order,
            ...(requestedCategoryGid ? { sg_cat_gid: requestedCategoryGid } : {}),
          },
        ]);
        if (!createRes.success) {
          toast.error(
            createRes.err_message ?? t("SUBGROUPS_CREATE_CATEGORY_FAILED")
          );
          return;
        }
        const createdGid = parseCreatedSgCategoryGid(createRes.data);
        if (!createdGid) {
          if (!requestedCategoryGid) {
            toast.error(
              t(
                "SUBGROUPS_CREATE_NO_IDENTIFIER",
                "Subgroup created but identifier was not returned"
              )
            );
            return;
          }
          persistedDimGid = requestedCategoryGid;
        } else {
          persistedDimGid = createdGid;
        }
        setDimensions((prev) =>
          prev.map((d) =>
            d.gid === panelDim.gid
              ? {
                  ...d,
                  gid: persistedDimGid,
                  name: nextTitle,
                }
              : d
          )
        );
        setPanelDimGid(persistedDimGid);
        setPanelCategoryGidInput(persistedDimGid);
        setHighlightedDimensionGid((prev) =>
          prev === panelDim.gid ? null : prev
        );
      } else {
        const patchRes = await updateSgCategory(dwId, panelDim.gid, {
          sg_cat_name: nextTitle,
        });
        if (!patchRes.success) {
          toast.error(
            patchRes.err_message ?? t("SUBGROUPS_UPDATE_CATEGORY_FAILED")
          );
          return;
        }
      }

      const missingPersistedValueId = panelDraftValues.some(
        (v) => !v.isNew && !v.draftGid.trim()
      );
      if (missingPersistedValueId) {
        toast.error(
          t(
            "SUBGROUPS_PANEL_VALUE_ID_REQUIRED",
            "Each saved subgroup value must have a non-empty Id before saving."
          )
        );
        return;
      }

      const editedExistingValues = panelDraftValues.filter((v) => {
        if (v.isNew || !v.gid) return false;
        const nameChanged = v.name.trim() !== v.originalName.trim();
        const gidChanged = v.draftGid.trim() !== (v.gid ?? "").trim();
        return nameChanged || gidChanged;
      });
      if (editedExistingValues.length > 0) {
        const updateResults = await Promise.all(
          editedExistingValues.map((v) =>
            updateSgCategoryValue(dwId, v.gid as string, {
              ...(v.name.trim() !== v.originalName.trim()
                ? { sg_catg_val_name: v.name.trim() }
                : {}),
              ...(v.draftGid.trim() !== (v.gid ?? "").trim()
                ? { sg_catg_val_gid: v.draftGid.trim() }
                : {}),
            })
          )
        );
        const failedUpdates = updateResults.filter((r) => !r.success);
        if (failedUpdates.length > 0) {
          const firstError = failedUpdates[0];
          toast.error(
            firstError.err_message ??
              t("SUBGROUPS_UPDATE_VALUES_FAILED")
          );
          return;
        }
      }

      const newValues = panelDraftValues.filter((v) => v.isNew && v.name.trim());
      if (isLocalDim && newValues.length === 0) {
        await loadDimensions();
        setHighlightedDimensionGid(null);
        toast.success(
          t(
            "DIMENSION_CREATED_ADD_VALUES",
            "Subgroup category created. Add value(s), then save."
          )
        );
        return;
      }
      if (newValues.length > 0) {
        const createValuesRes = await bulkCreateSgCategoryValues(
          dwId,
          newValues.map((v) => ({
            sg_cat_gid: persistedDimGid,
            subgroup_name: v.name.trim(),
            ...(v.draftGid.trim() ? { subgroup_gid: v.draftGid.trim() } : {}),
          })),
          { ensureSgCatGids: [persistedDimGid] }
        );
        if (!createValuesRes.success) {
          toast.error(
            createValuesRes.err_message ??
              t("SUBGROUPS_CREATE_VALUES_FAILED")
          );
          return;
        }
      }

      toast.success(t("SUBGROUPS_SAVE_SUCCESS"));
      await loadDimensions();
      void loadSubgroups();
      setHighlightedDimensionGid(null);
      closeDimensionPanel();
    } finally {
      setPanelSaveLoading(false);
    }
  }, [
    panelDim,
    dwId,
    panelTitleInput,
    panelCategoryGidInput,
    panelDraftValues,
    dimensions,
    loadDimensions,
    loadSubgroups,
    closeDimensionPanel,
    t,
  ]);

  const closePanelDeleteCategoryModal = useCallback(() => {
    if (panelDeleteLoading) return;
    setPanelDeleteCategoryModalOpen(false);
  }, [panelDeleteLoading]);

  const confirmPanelDeleteCategory = useCallback(async () => {
    if (!panelDim) return;
    if (panelDim.gid.startsWith(LOCAL_DIM_GID_PREFIX)) {
      setDimensions((prev) => prev.filter((d) => d.gid !== panelDim.gid));
      setPanelDeleteCategoryModalOpen(false);
      closeDimensionPanel();
      toast.success(t("SUBGROUPS_LOCAL_REMOVED"));
      return;
    }
    if (!canDelete) return;
    if (!dwId) return;
    setPanelDeleteLoading(true);
    try {
      const res = await deleteSgCategory(dwId, panelDim.gid);
      if (!res.success) {
        toast.error(
          res.err_message ?? t("SUBGROUPS_DELETE_CATEGORY_FAILED")
        );
        return;
      }
      toast.success(t("SUBGROUPS_DELETE_CATEGORY_SUCCESS"));
      setPanelDeleteCategoryModalOpen(false);
      closeDimensionPanel();
      pendingDeletedDimGids.current.add(panelDim.gid);
      setDimensions((prev) => prev.filter((d) => d.gid !== panelDim.gid));
      await loadDimensions();
      void loadSubgroups();
    } finally {
      setPanelDeleteLoading(false);
    }
  }, [
    panelDim,
    dwId,
    closeDimensionPanel,
    loadDimensions,
    loadSubgroups,
    t,
    canDelete,
  ]);

  useEffect(() => {
    if (!panelOpen || !panelDimGid) return;
    const stillExists = dimensions.some((d) => d.gid === panelDimGid);
    if (!stillExists) {
      closeDimensionPanel();
    }
  }, [panelOpen, panelDimGid, dimensions, closeDimensionPanel]);

  // ── Add row ──────────────────────────────────────────────────────────────
  const toggleAddRowValue = useCallback(
    (dimGid: string, valueGid: string) => {
      setAddRowSelections((prev) => {
        const current = prev[dimGid] ?? [];
        const next = current.includes(valueGid)
          ? current.filter((v) => v !== valueGid)
          : [...current, valueGid];
        return { ...prev, [dimGid]: next };
      });
    },
    []
  );

  const orderedSelectedDimensions = useMemo(
    () =>
      dimensions.filter((dim) => {
        const selected = addRowSelections[dim.gid] ?? [];
        return selected.length > 0;
      }),
    [dimensions, addRowSelections]
  );

  const previewSubgroupNames = useMemo(() => {
    if (orderedSelectedDimensions.length === 0) return [];

    let combos: { gid: string; name: string }[][] = [[]];
    for (const dim of orderedSelectedDimensions) {
      const selectedValues = (addRowSelections[dim.gid] ?? [])
        .map((gid) => dim.values.find((v) => v.gid === gid))
        .filter((v): v is NonNullable<typeof v> => Boolean(v))
        .map((v) => ({ gid: v.gid, name: v.name }));

      if (selectedValues.length === 0) continue;
      const expanded: { gid: string; name: string }[][] = [];
      for (const combo of combos) {
        for (const value of selectedValues) {
          expanded.push([...combo, value]);
        }
      }
      combos = expanded;
    }

    return combos.map((combo) => combo.map((c) => c.name).join(" "));
  }, [orderedSelectedDimensions, addRowSelections]);

  const handleAddRowSubmit = useCallback(async () => {
    if (orderedSelectedDimensions.length === 0) {
      toast.error("Select at least one subgroup value before saving.");
      return;
    }

    setAddRowLoading(true);
    try {
      const combos: string[][] = [[]];
      for (const dim of orderedSelectedDimensions) {
        const vals = addRowSelections[dim.gid] ?? [];
        if (vals.length === 0) continue;
        const expanded: string[][] = [];
        for (const combo of combos) {
          for (const v of vals) {
            expanded.push([...combo, v]);
          }
        }
        combos.length = 0;
        combos.push(...expanded);
      }

      const comboDescriptors = combos.map((gids) => {
        const name = gids
          .map((gid) =>
            orderedSelectedDimensions
              .flatMap((dim) => dim.values)
              .find((v) => v.gid === gid)?.name ?? gid
          )
          .join(" ");
        return { gids, name };
      });

      const items = comboDescriptors.map((combo) => ({ sg_cat_val_gids: combo.gids }));
      const res = await createSubgroupCombinations(dwId, items);
      if (res.success) {
        const createdItems = parseCreatedSubgroups(res.data);
        if (createdItems.length > 0) {
          const optimisticNew = createdItems.map((created, idx) => {
            const combo = comboDescriptors[idx];
            const subgroupName = combo?.name ?? created.sg_gid ?? "";
            return {
              subgroup_val_nid: created.subgroup_val_nid,
              sg_nid: created.sg_nid,
              sg_gid: created.sg_gid ?? null,
              sg_name: subgroupName,
              subgroup_val: subgroupName,
              sg_cat_val_gids: combo?.gids ?? [],
            } satisfies SubgroupRaw;
          });
          setOptimisticSubgroups((prev) => [...optimisticNew, ...prev]);
          setDeletedSubgroupGids((prev) => {
            if (prev.size === 0) return prev;
            const next = new Set(prev);
            createdItems.forEach((item) => {
              if (item.sg_gid) next.delete(item.sg_gid);
            });
            return next;
          });
          const createdKeys = optimisticNew.map((raw) => subgroupListRowRecentKey(raw));
          if (createdKeys.length > 0) {
            setPage(1);
            setRecentCreatedKeys(createdKeys);
            setPinnedSubgroupKeys((prev) => {
              const incoming = new Set(createdKeys);
              return [...createdKeys, ...prev.filter((k) => !incoming.has(k))];
            });
            setActiveRowId(getSubgroupTableRowId(optimisticNew[0]));
          }
        }
        toast.success(t("SUBGROUPS_CREATE_COMBOS_SUCCESS"));
        setAddRowExpanded(false);
        setAddRowSelections({});
        setAddRowSearchTerms({});
        setAddRowDropdownOpen(null);
        requestAnimationFrame(() => {
          if (!(document.activeElement instanceof HTMLElement)) return;
          if (document.activeElement.closest("tr[data-tv-add-row='true']")) {
            document.activeElement.blur();
          }
        });
      } else {
        toast.error(
          res.err_message ?? t("SUBGROUPS_CREATE_COMBOS_FAILED")
        );
      }
    } finally {
      setAddRowLoading(false);
    }
  }, [orderedSelectedDimensions, addRowSelections, dwId, t]);

  const resetAddRow = useCallback(() => {
    setAddRowExpanded(false);
    setAddRowSelections({});
    setAddRowSearchTerms({});
    setAddRowDropdownOpen(null);
  }, []);

  const handleAddRowEscape = useCallback(() => {
    if (addRowDropdownOpen) {
      setAddRowDropdownOpen(null);
      return;
    }
    resetAddRow();
    const active = document.activeElement;
    if (active instanceof HTMLElement && addRowRef.current?.contains(active)) {
      active.blur();
    }
  }, [addRowDropdownOpen, resetAddRow]);

  const resetInlineDimComboUi = useCallback(() => {
    setInlineDimComboSearch({});
    setInlineDimComboOpen({});
    setInlineDimComboHi({});
  }, []);

  // ── Inline edit ────────────────────────────────────────────────────────
  const onStartInlineEdit = useCallback(
    (row: SubgroupTableRow) => {
      if (!canUpdate) return;
      if (row.subgroupRaw.is_system) return;
      if (addRowExpanded) resetAddRow();
      setActiveRowId(row.rowId);
      setEditingRowId(row.rowId);
      setInlineDimValueGids({ ...row.dimensionValueGids });
      resetInlineDimComboUi();
    },
    [canUpdate, addRowExpanded, resetAddRow, resetInlineDimComboUi]
  );

  const onInlineCancel = useCallback(() => {
    if (editingRowId) setActiveRowId(editingRowId);
    setEditingRowId(null);
    setInlineDimValueGids({});
    resetInlineDimComboUi();
    setInlineSaveLoading(false);
    setInlineUpdateConfirmOpen(false);
  }, [editingRowId, resetInlineDimComboUi]);

  const onInlineSave = useCallback(() => {
    if (!editingRowId || !dwId) return;
    setInlineUpdateConfirmOpen(true);
  }, [editingRowId, dwId]);

  const confirmInlineSave = useCallback(async () => {
    if (!editingRowId || !dwId) return;
    const editingRow = rows.find((r) => r.rowId === editingRowId);
    if (!editingRow) return;

    const identifier =
      getSubgroupGid(editingRow.subgroupRaw) ??
      String(
        editingRow.subgroupRaw.subgroup_val_nid ??
          editingRow.subgroupRaw.sv_nid ??
          editingRow.subgroupRaw.sg_nid ??
          ""
      );
    if (!identifier) return;

    const sgCatValGids = Object.values(inlineDimValueGids).filter(
      (v): v is string => v != null && v !== ""
    );

    setInlineSaveLoading(true);
    try {
      const payload: UpdateSubgroupValPayload = {
        sg_cat_val_gids: sgCatValGids,
      };
      const result = await updateSubgroupVal(dwId, identifier, payload);
      if (result && "success" in result && !result.success) {
        const errMsg =
          (result as SgCategoryValueMutationError).err_message ??
          t("SUBGROUP_UPDATE_FAILED", "Failed to update subgroup");
        toast.error(errMsg);
        return;
      }
      setInlineUpdateConfirmOpen(false);
      onInlineCancel();
      void loadSubgroups();
      void loadDimensions();
    } catch {
      toast.error(t("SUBGROUP_UPDATE_FAILED", "Failed to update subgroup"));
    } finally {
      setInlineSaveLoading(false);
    }
  }, [editingRowId, dwId, rows, inlineDimValueGids, onInlineCancel, t, loadSubgroups, loadDimensions]);

  const setInlineDimValueGid = useCallback(
    (dimGid: string, valueGid: string | null) => {
      setInlineDimValueGids((prev) => ({ ...prev, [dimGid]: valueGid }));
    },
    []
  );

  const setInlineDimComboSearchFor = useCallback((dimGid: string, search: string) => {
    setInlineDimComboSearch((prev) => ({ ...prev, [dimGid]: search }));
  }, []);

  const setInlineDimComboOpenFor = useCallback((dimGid: string, open: boolean) => {
    setInlineDimComboOpen((prev) => ({ ...prev, [dimGid]: open }));
  }, []);

  const setInlineDimComboHiFor = useCallback((dimGid: string, hi: number) => {
    setInlineDimComboHi((prev) => ({ ...prev, [dimGid]: hi }));
  }, []);

  // ── Bulk delete ──────────────────────────────────────────────────────────
  const handleBulkDelete = useCallback(async () => {
    if (selectedRowIds.size === 0) return;
    setDeleteRunning(true);
    try {
      const toDelete = rows.filter((r) => selectedRowIds.has(r.rowId));
      const deleteGids = toDelete
        .map((r) => getSubgroupGid(r.subgroupRaw))
        .filter((gid): gid is string => Boolean(gid));

      if (deleteGids.length === 0) {
        toast.error(
          t("SUBGROUPS_BULK_DELETE_NO_IDS")
        );
        return;
      }

      const result = await deleteMultipleSubgroups(dwId, deleteGids);
      if (!result.success) {
        toast.error(
          result.err_message ?? t("SUBGROUPS_BULK_DELETE_FAILED")
        );
        return;
      }

      if (deleteGids.length > 0) {
        const removedGids = new Set(deleteGids);
        setDeletedSubgroupGids((prev) => new Set([...prev, ...deleteGids]));
        setOptimisticSubgroups((prev) =>
          prev.filter((s) => {
            const gid = getSubgroupGid(s);
            return !gid || !removedGids.has(gid);
          })
        );
      }

      toast.success(
        t(
          "SUBGROUPS_BULK_DELETE_SUCCESS",
          `Deleted ${deleteGids.length} subgroup(s)`
        ).replace("{count}", String(deleteGids.length))
      );
      clearSelection();
      setDeleteModalOpen(false);
    } finally {
      setDeleteRunning(false);
    }
  }, [selectedRowIds, rows, dwId, clearSelection, t]);

  // ── Add new dimension ────────────────────────────────────────────────────
  const handleAddDimension = useCallback(() => {
    if (!canCreate) return;
    const existingNames = new Set(
      dimensions.map((d) => d.name.trim().toLowerCase()).filter(Boolean)
    );
    let dimensionName = "New Dimension";
    let suffix = 2;
    while (existingNames.has(dimensionName.toLowerCase())) {
      dimensionName = `New Dimension ${suffix}`;
      suffix += 1;
    }

    const maxOrder = dimensions.reduce(
      (acc, d) => Math.max(acc, d.order ?? 0),
      0
    );
    const newGid = `${LOCAL_DIM_GID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const localDim: DimensionCategory = {
      gid: newGid,
      name: dimensionName,
      order: maxOrder + 1,
      usedInCount: 0,
      values: [],
    };
    setDimensions((prev) => [...prev, localDim]);
    setHighlightedDimensionGid(newGid);
    openDimensionPanel(localDim);
  }, [dimensions, openDimensionPanel, canCreate]);

  const handleClearHighlightedDimension = useCallback(() => {
    if (!highlightedDimensionGid) return;
    if (!highlightedDimensionGid.startsWith(LOCAL_DIM_GID_PREFIX)) {
      setHighlightedDimensionGid(null);
      return;
    }
    setDimensions((prev) => prev.filter((d) => d.gid !== highlightedDimensionGid));
    setDimensionFilters((prev) => {
      const next = { ...prev };
      delete next[highlightedDimensionGid];
      return next;
    });
    setAddRowSelections((prev) => {
      const next = { ...prev };
      delete next[highlightedDimensionGid];
      return next;
    });
    setAddRowSearchTerms((prev) => {
      const next = { ...prev };
      delete next[highlightedDimensionGid];
      return next;
    });
    setAddRowDropdownOpen((prev) => (prev === highlightedDimensionGid ? null : prev));
    if (panelDimGid === highlightedDimensionGid) {
      closeDimensionPanel();
    }
    setHighlightedDimensionGid(null);
  }, [highlightedDimensionGid, panelDimGid, closeDimensionPanel]);

  const hasUnsavedSubgroupType = useMemo(
    () => dimensions.some((d) => d.gid.startsWith(LOCAL_DIM_GID_PREFIX)),
    [dimensions]
  );

  const handleDimensionDragStart = useCallback((dimGid: string) => {
    setDraggingDimensionGid(dimGid);
    setDragOverDimensionGid(null);
  }, []);

  const handleDimensionDragOver = useCallback((dimGid: string) => {
    setDragOverDimensionGid((prev) => (prev === dimGid ? prev : dimGid));
  }, []);

  const handleDimensionDragLeave = useCallback((dimGid: string) => {
    setDragOverDimensionGid((prev) => (prev === dimGid ? null : prev));
  }, []);

  const handleDimensionDragEnd = useCallback(() => {
    setDraggingDimensionGid(null);
    setDragOverDimensionGid(null);
  }, []);

  const handleDimensionDrop = useCallback(
    async (targetDimGid: string) => {
      const draggedDimGid = draggingDimensionGid;
      setDraggingDimensionGid(null);
      setDragOverDimensionGid(null);
      if (!draggedDimGid || draggedDimGid === targetDimGid) return;

      const fromIndex = dimensions.findIndex((d) => d.gid === draggedDimGid);
      const toIndex = dimensions.findIndex((d) => d.gid === targetDimGid);
      if (fromIndex < 0 || toIndex < 0) return;

      const previousDimensions = dimensions;
      const nextDimensions = [...dimensions];
      const [moved] = nextDimensions.splice(fromIndex, 1);
      if (!moved) return;
      const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
      nextDimensions.splice(insertIndex, 0, moved);
      const existingOrders = dimensions
        .map((dim) =>
          typeof dim.order === "number" && Number.isFinite(dim.order)
            ? dim.order
            : null
        )
        .filter((order): order is number => order !== null)
        .sort((a, b) => a - b);
      const nextWithOrders = nextDimensions.map((dim, idx) => ({
        ...dim,
        order: existingOrders[idx] ?? idx + 1,
      }));
      setDimensions(nextWithOrders);

      if (!dwId) {
        return;
      }

      if (moved.gid.startsWith(LOCAL_DIM_GID_PREFIX)) return;

      const previousOrder = previousDimensions.find((dim) => dim.gid === moved.gid)?.order;
      const nextOrder = nextWithOrders.find((dim) => dim.gid === moved.gid)?.order;
      if (nextOrder == null) return;

      let hasDuplicateOrders = false;
      const seenOrders = new Set<number>();
      for (const dim of previousDimensions) {
        if (dim.gid.startsWith(LOCAL_DIM_GID_PREFIX)) continue;
        const order =
          typeof dim.order === "number" && Number.isFinite(dim.order)
            ? dim.order
            : null;
        if (order == null) continue;
        if (seenOrders.has(order)) {
          hasDuplicateOrders = true;
          break;
        }
        seenOrders.add(order);
      }
      if (previousOrder === nextOrder && !hasDuplicateOrders) return;

      const response = await updateSgCategory(dwId, moved.gid, {
        sg_cat_order: nextOrder,
      });
      if (!response.success) {
        setDimensions(previousDimensions);
        toast.error(
          response.err_message ??
            t("DIMENSION_REORDER_FAILED", "Failed to reorder dimension.")
        );
        return;
      }
      toast.success(t("DIMENSION_REORDER_SUCCESS", "Dimension order updated."));
    },
    [draggingDimensionGid, dimensions, dwId, t]
  );

  // ── Table columns ────────────────────────────────────────────────────────
  const subgroupTableColumns = useSubgroupTableColumns({
    t,
    hasSelectableRows,
    allSelectableRowsSelected,
    selectedRowIds,
    selectAll,
    toggleSelect,
    isRowSelectable: (row) => row.subgroupRaw.is_system !== true,
    dimensions,
    colFilterName,
    setColFilterName,
    dimensionFilters,
    setDimensionFilter,
    onDimensionHeaderClick: openDimensionPanel,
    onAddDimensionClick: () => void handleAddDimension(),
    addDimensionLoading: false,
    addDimensionDisabled: hasUnsavedSubgroupType || !canCreate,
    highlightedDimensionGid,
    onClearHighlightedDimension: handleClearHighlightedDimension,
    draggingDimensionGid,
    dragOverDimensionGid,
    onDimensionDragStart: handleDimensionDragStart,
    onDimensionDragOver: handleDimensionDragOver,
    onDimensionDragLeave: handleDimensionDragLeave,
    onDimensionDrop: handleDimensionDrop,
    onDimensionDragEnd: handleDimensionDragEnd,
    // Inline edit
    editingRowId,
    canUpdate,
    inlineDimValueGids,
    setInlineDimValueGid,
    inlineDimComboSearch,
    inlineDimComboOpen,
    inlineDimComboHi,
    setInlineDimComboSearchFor,
    setInlineDimComboOpenFor,
    setInlineDimComboHiFor,
    inlineSaveLoading,
    onStartInlineEdit,
    onInlineSave,
    onInlineCancel,
  });

  const colCount = subgroupTableColumns.length;
  const showTabSwitchLoader = tabSwitchPending && loading;

  const subgroupListAddRowExpandedFields = useMemo((): ServerDrivenListAddRowField[] => {
    return [
      {
        kind: "custom",
        content: (
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded border border-border bg-transparent text-text-muted transition-colors hover:bg-surface-muted hover:text-primary"
            onClick={resetAddRow}
            title={t("SUBGROUPS_ADD_CLEAR_SELECTIONS")}
          >
            <Mi name="add" className="!text-sm" />
          </button>
        ),
      },
      {
        kind: "custom",
        content:
          previewSubgroupNames.length > 0 ? (
            <div className="preview-scroll max-h-[54px] space-y-1 overflow-y-auto pr-1">
              {previewSubgroupNames.map((name) => (
                <div key={name} className="w-full">
                  <span
                    className="inline-flex max-w-full items-center rounded bg-[color:color-mix(in_srgb,var(--color-primary)_12%,var(--color-surface))] px-2 py-0.5 text-xs font-medium text-primary"
                    title={name}
                  >
                    <span className="truncate">{name}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs text-text-muted">
              {t("SUBGROUPS_ADD_PREVIEW_HINT")}
            </span>
          ),
      },
      ...dimensions.map(
        (dim): ServerDrivenListAddRowField => ({
          kind: "custom",
          content: (
            <SubgroupAddRowDimensionCell
              dim={dim}
              addRowSelections={addRowSelections}
              addRowSearchTerms={addRowSearchTerms}
              setAddRowSearchTerms={setAddRowSearchTerms}
              addRowDropdownOpen={addRowDropdownOpen}
              setAddRowDropdownOpen={setAddRowDropdownOpen}
              toggleAddRowValue={toggleAddRowValue}
            />
          ),
        })
      ),
    ];
  }, [
    dimensions,
    previewSubgroupNames,
    resetAddRow,
    addRowSelections,
    addRowSearchTerms,
    setAddRowSearchTerms,
    addRowDropdownOpen,
    setAddRowDropdownOpen,
    toggleAddRowValue,
    t,
  ]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (!allowed) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Tabs + GID (GID immediately after tabs, not end-aligned) */}
      <div className="page-subtabs-row">
        <MainTabsBar
          tabs={(
            [
              ["all", t("ALL"), "list"] as const,
              ["missing_data", t("MISSING_DATA"), "warning"] as const,
              ["missing_ius", t("MISSING_IUS"), "error_outline"] as const,
            ] as const
          ).map(([value, label, icon]) => ({ value, label, icon }))}
          activeValue={activeTab}
          onSelect={setActiveTab}
        />
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canUpdate}
          title={!canUpdate ? t("NO_PERMISSION_UPDATE") : undefined}
          onClick={() => {
            if (!canUpdate) return;
            setGidDrawerOpen(true);
          }}
        >
          <Mi name="edit_note" className="!text-sm" />{" "}
          {t("BULK_EDIT", "Bulk Edit")}
        </button>
      </div>

      {/* Table */}
      <ServerDrivenTable<SubgroupRaw, SubgroupsListMeta>
        listState={listState}
        columns={
          subgroupTableColumns as import("@/components/TableView").EditableGridColumnDef<SubgroupRaw>[]
        }
        selection={{
          count: selectedRowIds.size,
          onClear: clearSelection,
        }}
        scrollRef={tblScrollRef}
        tableClassName="tv-grid-cols-sticky-ends"
        renderThead={() => (
          <thead>
            <EditableDataGridThead columns={subgroupTableColumns} />
            {/* Extra header cells for add-dimension column */}
          </thead>
        )}
        tbody={
          <ServerDrivenListTbody<SubgroupTableRow>
            colSpan={colCount}
            rows={rows}
            columns={subgroupTableColumns}
            getRowId={(row) => row.rowId}
            activeRowId={activeRowId}
            editingRowId={editingRowId}
            onDataRowEnterAtEnd={(ctx) => {
              if (ctx.mode === "edit") {
                void onInlineSave();
              } else if (ctx.mode === "view" && canUpdate && !ctx.row.subgroupRaw.is_system) {
                onStartInlineEdit(ctx.row);
              }
            }}
            onDataRowEscape={(ctx) => {
              if (ctx.mode === "edit") {
                onInlineCancel();
              }
            }}
            trProps={(row) => ({
              onMouseDown: () => {
                if (editingRowId != null && editingRowId !== row.rowId) {
                  onInlineCancel();
                  setActiveRowId(row.rowId);
                }
              },
              onKeyDown: (event) => {
                if (editingRowId != null) return;
                if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
                if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                if (shouldPreserveLocalArrowHandling(event.target, event.key)) return;
                event.preventDefault();
                moveFocusBetweenGridRows(
                  event.currentTarget,
                  event.key === "ArrowDown" ? 1 : -1,
                  0
                );
              },
            })}
            onDeleteKeyToggleRowSelection={toggleSelect}
            getRowClassName={(row) =>
              recentCreatedKeySet.has(subgroupListRowRecentKey(row.subgroupRaw))
                ? TV_ROW_NEWLY_ADDED_CLASS
                : ""
            }
            emptyMessage={t("NO_SUBGROUPS_FOUND")}
            showLoadingRow={false}
            showEmptyRow={!loading && !showTabSwitchLoader && rows.length === 0}
            showDataRows={!showTabSwitchLoader && rows.length > 0}
            addRow={
              showTabSwitchLoader
                ? null
                : {
                    ref: addRowRef,
                    promptLabel: t("ADD_SUBGROUP_PROMPT"),
                    expanded: addRowExpanded,
                    onExpandedChange: setAddRowExpanded,
                    primaryColumnId: "subgroup_name",
                    disabled: !canCreate,
                    disabledTitle: t("NO_PERMISSION_CREATE"),
                    className: `add-row${addRowExpanded ? "" : " add-row-collapsed"}${!canCreate ? " add-row-interaction-blocked" : ""}`,
                    ariaDisabled: !canCreate,
                    title: !canCreate ? t("NO_PERMISSION_CREATE") : undefined,
                    onRowEnterAtEnd: () => {
                      if (!canCreate) return;
                      if (!addRowExpanded) {
                        setAddRowExpanded(true);
                        return;
                      }
                      void handleAddRowSubmit();
                    },
                    onRowEscape: handleAddRowEscape,
                    onArrowIntoRow: canCreate ? () => {
                      setAddRowExpanded(true);
                    } : undefined,
                    onArrowLeaveRow: canCreate ? resetAddRow : undefined,
                    expandedFields: subgroupListAddRowExpandedFields,
                    collapsedSave: {
                      title: t("SUBGROUPS_ADD_CREATE_TITLE"),
                      ariaLabel: t("SUBGROUPS_ADD_CREATE_ARIA"),
                    },
                    collapsedCancel: {
                      title: t("SUBGROUPS_ADD_CLEAR_TITLE"),
                      ariaLabel: t("SUBGROUPS_ADD_CLEAR_ARIA"),
                    },
                    showActionsColumn: canCreate,
                    actionsWidth: "icon",
                    save: {
                      title: t("SUBGROUPS_ADD_CREATE_TITLE"),
                      ariaLabel: t("SUBGROUPS_ADD_CREATE_ARIA"),
                      disabled:
                        addRowLoading ||
                        Object.values(addRowSelections).every((v) => v.length === 0),
                      onClick: () => void handleAddRowSubmit(),
                    },
                    cancel: {
                      title: t("SUBGROUPS_ADD_CLEAR_TITLE"),
                      ariaLabel: t("SUBGROUPS_ADD_CLEAR_ARIA"),
                      disabled: addRowLoading,
                      onClick: resetAddRow,
                    },
                  }
            }
          />
        }
        pagination={{
          page,
          displayPage: meta?.page ?? page,
          totalPages,
          totalCount,
          totalCountUnfiltered: listState.totalCountUnfiltered,
          pageSize,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
          countNoun: t("SUBGROUPS"),
          labels: { t },
        }}
      />

      {/* ── Dimension detail drawer ─────────────────────────────────────── */}
      <Drawer
        open={panelOpen && Boolean(panelDim)}
        onClose={closeDimensionPanel}
        onEscapeFirst={handleDimensionDrawerEscapeFirst}
        width="38%"
        title={
          panelDim ? (
            panelDimIsSystem ? (
              <span className="flex items-center gap-1.5 max-w-full min-w-0">
                <span className="truncate text-sm font-semibold text-text">{panelDim.name}</span>
                <span className="label-tag tone-pill--muted-subtle ml-1.5">
                  {t("SYSTEM_ROLE_BADGE", "System")}
                </span>
              </span>
            ) : panelTitleEditMode ? (
              <input
                ref={panelTitleInputRef}
                type="text"
                className={textFieldClassName("md", "min-w-0 text-sm")}
                value={panelTitleInput}
                disabled={!panelDimEditAllowed}
                onChange={(e) => setPanelTitleInput(e.target.value)}
                onBlur={(e) => {
                  const next = e.relatedTarget as HTMLElement | null;
                  if (next?.closest("[data-dm-sg-panel-body]")) return;
                  setPanelTitleEditMode(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setPanelTitleEditMode(false);
                    return;
                  }
                  if (
                    e.key === "ArrowDown" &&
                    !e.altKey &&
                    !e.ctrlKey &&
                    !e.metaKey &&
                    !e.shiftKey &&
                    canCreate
                  ) {
                    e.preventDefault();
                    if (panelValuesAddRowExpanded) {
                      queueMicrotask(() => {
                        panelNewValueNameInputRef.current?.focus();
                      });
                    } else {
                      panelAddValueRowExpandFocusRef.current = true;
                      setPanelValuesAddRowExpanded(true);
                    }
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="max-w-full truncate bg-transparent border-0 p-0 text-left text-sm font-semibold text-text hover:text-primary disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:text-text"
                title={
                  panelDimEditAllowed
                    ? t("SUBGROUPS_PANEL_TITLE_EDIT_HINT")
                    : t("NO_PERMISSION_UPDATE")
                }
                disabled={!panelDimEditAllowed}
                onClick={() => setPanelTitleEditMode(true)}
              >
                {panelTitleInput || panelDim.name}
              </button>
            )
          ) : null
        }
        headerActions={
          panelDim ? (
            <>
              <button
                type="button"
                className="btn-comp-primary"
                disabled={
                  panelSaveLoading ||
                  panelDeleteLoading ||
                  (!canUpdate && !canCreate)
                }
                title={
                  !canUpdate && !canCreate
                    ? t("NO_PERMISSION_UPDATE")
                    : undefined
                }
                onClick={() => void handlePanelSave()}
              >
                {panelSaveLoading
                  ? t("SAVING")
                  : t("SAVE")}
              </button>
              {!panelDimIsSystem && (
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-muted transition hover:bg-surface-muted hover:text-error disabled:opacity-60"
                  title={
                    !canDelete
                      ? t("NO_PERMISSION_DELETE")
                      : t("SUBGROUPS_PANEL_DELETE_TITLE")
                  }
                  disabled={panelSaveLoading || panelDeleteLoading || !canDelete}
                  onClick={() => setPanelDeleteCategoryModalOpen(true)}
                >
                  <Mi name={panelDeleteLoading ? "hourglass_top" : "delete"} className="!text-sm" />
                </button>
              )}
            </>
          ) : null
        }
      >
        {panelDim ? (
          <div data-dm-sg-panel-body className="contents">
            <h4 className="mb-3 text-xs font-semibold tracking-wider text-text-muted">
              {t("DIMENSION")}
            </h4>
            <div className="mb-4 flex items-center gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs tracking-wider text-text-muted">
                  {t("ID")}
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    className="w-[180px] rounded border border-border bg-surface-muted px-2 py-1 text-xs text-text"
                    data-dm-sg-panel-category-gid-input={
                      panelDim.gid.startsWith(LOCAL_DIM_GID_PREFIX) ? "" : undefined
                    }
                    value={
                      panelDim.gid.startsWith(LOCAL_DIM_GID_PREFIX)
                        ? panelCategoryGidInput
                        : panelDim.gid
                    }
                    placeholder={
                      panelDim.gid.startsWith(LOCAL_DIM_GID_PREFIX)
                        ? t("DIMENSION_GID_PLACEHOLDER")
                        : ""
                    }
                    readOnly={!panelDimIsLocal || !canCreate}
                    onChange={(e) =>
                      setPanelCategoryGidInput(sanitizeManualGidInput(e.target.value))
                    }
                  />
                  <button
                    type="button"
                    className="flex items-center justify-center rounded p-0.5 hover:bg-surface-muted"
                    title={t("COPY_ID")}
                    disabled={
                      panelDim.gid.startsWith(LOCAL_DIM_GID_PREFIX) &&
                      !panelCategoryGidInput.trim()
                    }
                    onClick={() => {
                      const gidToCopy = panelDim.gid.startsWith(LOCAL_DIM_GID_PREFIX)
                        ? panelCategoryGidInput.trim()
                        : panelDim.gid;
                      if (!gidToCopy) return;
                      void navigator.clipboard.writeText(gidToCopy);
                      toast.success(t("ID_COPIED"));
                    }}
                  >
                    <Mi name="content_copy" className="!text-sm text-text-muted" />
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs tracking-wider text-text-muted">
                {t("USED_IN")}
                </span>
                <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded bg-surface-muted px-1.5 text-xs font-semibold text-text">
                  {panelDimensionUsedInCount}
                </span>
              </div>
            </div>

            <h4 className="mb-2 text-xs font-semibold tracking-wider text-text-muted">
              {t("VALUES")}
            </h4>
            <table className="panel-values-table w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-1.5 text-left font-semibold text-text-muted">
                    {t("NAME")}
                  </th>
                  <th className="pb-1.5 text-left font-semibold text-text-muted">
                    {t("ID")}
                  </th>
                  <th className="pb-1.5 text-right font-semibold text-text-muted">
                    {t("USED_IN")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {panelValuesAddRowExpanded ? (
                <tr
                  data-dm-sg-panel-add-value-row="true"
                  data-dm-sg-panel-add-expanded="true"
                  className="border-b border-border/50 text-xs transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))] focus-within:bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))] outline-none focus:outline-none focus-visible:outline-none"
                  tabIndex={-1}
                  data-tv-nav-row="true"
                  data-tv-body-row="true"
                  onFocus={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (panelSaveLoading || panelDeleteLoading) return;
                    queueMicrotask(() => {
                      const el = panelNewValueNameInputRef.current;
                      if (!el || el.disabled) return;
                      el.focus();
                    });
                  }}
                  onKeyDown={handlePanelValuesTrKeyDown}
                >
                  <td className="py-1.5 align-middle">
                    <input
                      ref={panelNewValueNameInputRef}
                      type="text"
                      className={gridTextFieldClassName(`min-w-0 ${PANEL_VALUES_INPUT_EXCEL}`)}
                      data-dm-sg-panel-value=""
                      data-dm-sg-panel-field="new-name"
                      placeholder={t(
                        "ADD_DIMENSION_VALUE_PROMPT",
                        "Add Dimension Value"
                      )}
                      value={panelNewValueName}
                      onChange={(e) => setPanelNewValueName(e.target.value)}
                      onPointerDown={onPanelTableInputPointerDown}
                      onFocus={onPanelTableInputFocus}
                      onKeyDown={onPanelTableInputKeyDown}
                      onBlur={(e) => e.currentTarget.removeAttribute("data-dm-sg-panel-navigate")}
                      disabled={panelSaveLoading || panelDeleteLoading || !canCreate}
                      aria-label={t("SUBGROUPS_PANEL_NEW_VALUE_NAME", "New value name")}
                    />
                  </td>
                  <td className="py-1.5 align-middle">
                    <div className="relative min-w-0">
                      <input
                        type="text"
                        className={gridTextFieldClassName(
                          `min-w-0 pr-8 text-xs text-text ${PANEL_VALUES_INPUT_EXCEL}`,
                        )}
                        data-dm-sg-panel-value=""
                        data-dm-sg-panel-field="new-gid"
                        placeholder={t("ID")}
                        value={panelNewValueGid}
                        onChange={(e) =>
                          setPanelNewValueGid(sanitizeManualGidInput(e.target.value))
                        }
                        onPointerDown={onPanelTableInputPointerDown}
                        onFocus={onPanelTableInputFocus}
                        onKeyDown={onPanelTableInputKeyDown}
                        onBlur={(e) => e.currentTarget.removeAttribute("data-dm-sg-panel-navigate")}
                        disabled={panelSaveLoading || panelDeleteLoading || !canCreate}
                        aria-label={t("ID")}
                      />
                      <button
                        type="button"
                        className="absolute right-0.5 top-1/2 z-[1] flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-50"
                        title={t("COPY_ID")}
                        disabled={
                          panelSaveLoading ||
                          panelDeleteLoading ||
                          !panelNewValueGid.trim()
                        }
                        onClick={() => {
                          const gid = panelNewValueGid.trim();
                          if (!gid) return;
                          void navigator.clipboard.writeText(gid);
                          toast.success(t("ID_COPIED"));
                        }}
                      >
                        <Mi
                          name="content_copy"
                          className="!text-sm text-text-muted"
                        />
                      </button>
                    </div>
                  </td>
                  <td className="py-1.5 text-right align-middle">
                    <div className="inline-flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className={BTN_GRID_ICON_TICK}
                        onClick={handlePanelAddValue}
                        disabled={panelSaveLoading || panelDeleteLoading || !canCreate}
                        aria-label={t("SUBGROUPS_PANEL_ADD_VALUE", "Add value")}
                      >
                        <Mi name="check" className={GRID_ACTION_ICON} />
                      </button>
                      <button
                        type="button"
                        className={BTN_GRID_ICON_CLOSE}
                        onClick={() => {
                          setPanelNewValueName("");
                          setPanelNewValueGid("");
                          setPanelValuesAddRowExpanded(false);
                        }}
                        title={t("SUBGROUPS_PANEL_CLEAR_NEW_VALUE", "Clear new value")}
                        aria-label={t("SUBGROUPS_PANEL_CLEAR_NEW_VALUE", "Clear new value")}
                        disabled={panelSaveLoading || panelDeleteLoading}
                      >
                        <Mi name="close" className={GRID_ACTION_ICON} />
                      </button>
                    </div>
                  </td>
                </tr>
                ) : (
                <tr
                  data-dm-sg-panel-add-value-row="true"
                  data-dm-sg-panel-add-collapsed="true"
                  className="border-b border-border/50 text-xs outline-none focus:outline-none focus-visible:outline-none"
                  tabIndex={-1}
                  data-tv-nav-row="true"
                  data-tv-body-row="true"
                  onKeyDown={handlePanelValuesTrKeyDown}
                >
                  <td colSpan={2} className="py-1.5 align-middle">
                    <button
                      type="button"
                      className="add-row-prompt-btn add-row-prompt-btn--surface"
                      disabled={panelSaveLoading || panelDeleteLoading || !canCreate}
                      title={!canCreate ? t("NO_PERMISSION_CREATE") : undefined}
                      aria-label={t(
                        "SUBGROUPS_PANEL_ADD_CATEGORY_VALUE_PROMPT",
                        "Add category Value"
                      )}
                      onClick={() => {
                        if (!canCreate) return;
                        panelAddValueRowExpandFocusRef.current = true;
                        setPanelValuesAddRowExpanded(true);
                      }}
                    >
                      <Mi name="add_circle_outline" className="!text-sm shrink-0" />
                      <span>
                        {t(
                          "SUBGROUPS_PANEL_ADD_CATEGORY_VALUE_PROMPT",
                          "Add category Value"
                        )}
                      </span>
                    </button>
                  </td>
                  <td className="py-1.5 text-right align-middle">
                    <span className="text-xs text-text-muted" aria-hidden>
                      —
                    </span>
                  </td>
                </tr>
                )}

                {panelDraftValues.map((val) => (
                  <tr
                    key={val.key}
                    tabIndex={-1}
                    data-dm-sg-panel-value-key={val.key}
                    data-tv-nav-row="true"
                    data-tv-body-row="true"
                    className="border-b border-border/50 text-xs transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))] focus-within:bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))] outline-none focus:outline-none focus-visible:outline-none"
                    onKeyDown={handlePanelValuesTrKeyDown}
                  >
                    <td className="py-1.5 align-middle">
                      <div className="relative min-w-0">
                        <input
                          type="text"
                          className={gridTextFieldClassName(`w-full min-w-0 ${val.isSystem ? "pr-16" : ""} ${PANEL_VALUES_INPUT_EXCEL} read-only:opacity-60 read-only:cursor-default`)}
                          data-dm-sg-panel-value=""
                          data-dm-sg-panel-field="draft-name"
                          data-dm-sg-panel-value-key={val.key}
                          value={val.name}
                          onPointerDown={onPanelTableInputPointerDown}
                          onFocus={onPanelTableInputFocus}
                          onKeyDown={onPanelTableInputKeyDown}
                          onBlur={(e) => e.currentTarget.removeAttribute("data-dm-sg-panel-navigate")}
                          onChange={(e) => {
                            const nextName = e.target.value;
                            setPanelDraftValues((prev) =>
                              prev.map((x) =>
                                x.key === val.key
                                  ? {
                                      ...x,
                                      name: nextName,
                                    }
                                  : x
                              )
                            );
                          }}
                          readOnly={val.isSystem}
                          disabled={
                            panelValueDeleteKey === val.key ||
                            panelSaveLoading ||
                            panelDeleteLoading ||
                            !(val.isNew ? canCreate : canUpdate)
                          }
                          aria-label={t("NAME")}
                        />
                        {val.isSystem && (
                          <span className="label-tag tone-pill--muted-subtle absolute right-1.5 top-1/2 -translate-y-1/2">
                            {t("SYSTEM_ROLE_BADGE", "System")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-1.5 align-middle">
                      <div className="relative min-w-0">
                        <input
                          type="text"
                          className={gridTextFieldClassName(
                            `min-w-0 pr-8 text-xs text-text ${PANEL_VALUES_INPUT_EXCEL} read-only:opacity-60 read-only:cursor-default`,
                          )}
                          data-dm-sg-panel-value=""
                          data-dm-sg-panel-field="draft-gid"
                          data-dm-sg-panel-value-key={val.key}
                          placeholder={t("ID")}
                          value={val.draftGid}
                          onPointerDown={onPanelTableInputPointerDown}
                          onFocus={onPanelTableInputFocus}
                          onKeyDown={onPanelTableInputKeyDown}
                          onBlur={(e) => e.currentTarget.removeAttribute("data-dm-sg-panel-navigate")}
                          onChange={(e) => {
                            const next = sanitizeManualGidInput(e.target.value);
                            setPanelDraftValues((prev) =>
                              prev.map((x) =>
                                x.key === val.key ? { ...x, draftGid: next } : x
                              )
                            );
                          }}
                          readOnly={val.isSystem}
                          disabled={
                            panelValueDeleteKey === val.key ||
                            panelSaveLoading ||
                            panelDeleteLoading ||
                            !(val.isNew ? canCreate : canUpdate)
                          }
                          aria-label={t("ID")}
                        />
                        <button
                          type="button"
                          className="absolute right-0.5 top-1/2 z-[1] flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-50"
                          title={t("COPY_ID")}
                          disabled={
                            panelValueDeleteKey === val.key ||
                            panelSaveLoading ||
                            panelDeleteLoading ||
                            !String(val.draftGid ?? "").trim()
                          }
                          onClick={() => {
                            const gid = String(val.draftGid ?? "").trim();
                            if (!gid) return;
                            void navigator.clipboard.writeText(gid);
                            toast.success(t("ID_COPIED"));
                          }}
                        >
                          <Mi
                            name="content_copy"
                            className="!text-sm text-text-muted"
                          />
                        </button>
                      </div>
                    </td>
                    <td className="py-1.5 text-right align-middle">
                      <div className="inline-flex items-center justify-end gap-3">
                        <span className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--color-primary)_14%,var(--color-surface-muted))] px-2 text-xs font-semibold text-text">
                          {val.usedInCount ?? 0}
                        </span>
                        {!val.isSystem && (
                          <button
                            type="button"
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-muted transition hover:bg-surface-muted hover:text-error disabled:opacity-60"
                            title={
                              !val.isNew && !canDelete
                                ? t("NO_PERMISSION_DELETE")
                                : val.isNew
                                  ? t("SUBGROUPS_PANEL_REMOVE_UNSAVED_VALUE", "Remove unsaved value")
                                  : t("SUBGROUPS_PANEL_DELETE_VALUE", "Delete value")
                            }
                            disabled={
                              panelValueDeleteKey === val.key ||
                              panelSaveLoading ||
                              panelDeleteLoading ||
                              (!val.isNew && !canDelete)
                            }
                            onClick={() => requestPanelDeleteValue(val)}
                          >
                            <Mi
                              name={panelValueDeleteKey === val.key ? "hourglass_top" : "delete"}
                              className="!text-sm"
                            />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Drawer>

      <DeletePermanentConfirmModal
        open={panelDeleteCategoryModalOpen && !!panelDim}
        onClose={closePanelDeleteCategoryModal}
        title={t("DIMENSION_DELETE_MODAL_TITLE")}
        titleId="dm-sg-panel-delete-category-title"
        dismissDisabled={panelDeleteLoading}
        closeAriaLabel={t("CLOSE")}
        cancelLabel={t("CANCEL")}
        onCancel={closePanelDeleteCategoryModal}
        confirmLabel={t("DELETE_PERMANENTLY")}
        confirmLoadingLabel={t("DELETING")}
        confirmLoading={panelDeleteLoading}
        onConfirm={confirmPanelDeleteCategory}
        impact={{
          title: t("IMPACT_PREVIEW"),
          lines: [
            t("DIMENSION_DELETE_IMPACT_USED_IN").replace(
              "{count}",
              panelDimensionUsedInCount.toLocaleString()
            ),
          ],
        }}
      >
        <p className="modal-lead">
          {panelDim
            ? t(
                "DIMENSION_DELETE_MODAL_LEAD"
              ).replace(
                "{name}",
                (panelTitleInput.trim() || panelDim.name || "").trim() ||
                  t("NAME")
              )
            : null}
        </p>
      </DeletePermanentConfirmModal>

      <DeletePermanentConfirmModal
        open={panelDeleteValueModalOpen && !!panelDeleteValuePending}
        onClose={closePanelDeleteValueModal}
        title={t("DIMENSION_VALUE_DELETE_MODAL_TITLE")}
        titleId="dm-sg-panel-delete-value-title"
        dismissDisabled={panelValueDeleteKey !== null}
        closeAriaLabel={t("CLOSE")}
        cancelLabel={t("CANCEL")}
        onCancel={closePanelDeleteValueModal}
        confirmLabel={t("DELETE_PERMANENTLY")}
        confirmLoadingLabel={t("DELETING")}
        confirmLoading={panelValueDeleteKey === panelDeleteValuePending?.key}
        onConfirm={confirmPanelDeleteValue}
        impact={{
          title: t("IMPACT_PREVIEW"),
          lines: [
            t("DIMENSION_VALUE_DELETE_IMPACT_USED_IN").replace(
              "{count}",
              panelDeleteValueUsedInCount.toLocaleString()
            ),
          ],
        }}
      >
        <p className="modal-lead">
          {panelDeleteValuePending
            ? t(
                "DIMENSION_VALUE_DELETE_MODAL_LEAD"
              ).replace(
                "{name}",
                (panelDeleteValuePending.name || "").trim() || t("NAME")
              )
            : null}
        </p>
      </DeletePermanentConfirmModal>

      {/* ── Delete confirmation modal ──────────────────────────────────── */}
      <GidManagerDrawer
        open={gidDrawerOpen}
        onClose={() => setGidDrawerOpen(false)}
        titleLoading={gidDrawerLoading}
        panelWidthClassName="w-[820px]"
        nameColumnLabel={t("SUBGROUP_NAME")}
        orderColumnLabel={t("ORDER")}
        gidColumnLabel={t("ID")}
        rows={gidDrawerRows}
        nameDisabled
        onSaveGid={
          canUpdate
            ? async (rowId, nextGid) => {
                const parsed = parseSubgroupListCombinationDrawerRowId(rowId);
                if (!parsed) return { success: false, err_message: "Invalid row" };
                return updateSubgroupVal(dwId, parsed.valueIdentifier, {
                  sv_gid: nextGid,
                });
              }
            : undefined
        }
        onSaveOrder={
          canUpdate
            ? async (rowId, nextOrder) => {
                const parsed = parseSubgroupListCombinationDrawerRowId(rowId);
                if (!parsed) return { success: false, err_message: "Invalid row" };
                return updateSubgroupVal(dwId, parsed.valueIdentifier, {
                  sv_order: nextOrder,
                });
              }
            : undefined
        }
        onAfterSave={() => {
          void loadGidDrawerSubgroups();
          void loadSubgroups();
        }}
      />

      <DeletePermanentConfirmModal
        open={inlineUpdateConfirmOpen && !!editingRowId}
        onClose={() => {
          if (!inlineSaveLoading) setInlineUpdateConfirmOpen(false);
        }}
        title={t("SUBGROUP_UPDATE_CONFIRM_TITLE", "Update subgroup?")}
        titleId="dm-sg-inline-update-confirm-title"
        dismissDisabled={inlineSaveLoading}
        closeAriaLabel={t("CLOSE")}
        cancelLabel={t("CANCEL")}
        onCancel={() => setInlineUpdateConfirmOpen(false)}
        confirmLabel={t("UPDATE")}
        confirmLoadingLabel={t("UPDATING")}
        confirmLoading={inlineSaveLoading}
        onConfirm={confirmInlineSave}
      >
        <p className="text-sm text-text">
          {t(
            "SUBGROUP_UPDATE_CONFIRM_IUS_MESSAGE",
            "If you update the subgroup, all the associated IUS will be updated. Are you sure you want to update the subgroup?"
          )}
        </p>
      </DeletePermanentConfirmModal>

      <DeletePermanentConfirmModal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title={t("DELETE_SUBGROUPS_MODAL_TITLE")}
        titleId="dm-sg-delete-title"
        dismissDisabled={deleteRunning}
        closeAriaLabel={t("CLOSE")}
        cancelLabel={t("CANCEL")}
        onCancel={() => setDeleteModalOpen(false)}
        confirmLabel={t("DELETE")}
        confirmLoadingLabel={t("DELETING")}
        confirmLoading={deleteRunning}
        onConfirm={handleBulkDelete}
      >
        <p className="text-sm text-text">
          {t(
            "DELETE_SUBGROUPS_MODAL_BODY",
            `Are you sure you want to delete ${selectedRowIds.size} subgroup(s)? This action cannot be undone.`
          )}
        </p>
      </DeletePermanentConfirmModal>

    </div>
  );
}
