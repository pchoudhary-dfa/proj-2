"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { toast } from "sonner";
import { useCore } from "@/contexts/CoreContext";
import { useSidebar, type FileImportSubmitPayload } from "@/contexts/SidebarContext";
import { useDwCrudPermissions } from "@/hooks/useDwCrudPermissions";
import { useDwPermissionGuard } from "@/hooks/useDwPermissionGuard";
import { DW_ROUTE_PERMISSIONS } from "@/lib/auth/user";
import {
  deleteRequest,
  downloadRequest,
  getFileResponse,
  getRequest,
  patchRequest,
  postRequest,
  putRequest,
} from "@/lib/api/http";
import type {
  ExportIndicatorsParams,
  FetchIndicatorClassificationsParams,
  FetchIndicatorClassificationsResult,
  FetchIndicatorsParams,
  IcIusMappingItem,
  IndicatorClassificationItem,
  IndicatorListItem,
  IndicatorsListError,
  IndicatorsListResponse,
  IndicatorsListResult,
} from "@/lib/api/types";
import {
  getDWAPIURL,
  REFERENCE_PATH_IC_IUS_EXPORT,
  REFERENCE_PATH_IC_IUS_IMPORT,
  REFERENCE_PATH_INDICATOR_CLASSIFICATIONS,
  REFERENCE_PATH_INDICATORS,
} from "@/lib/constants";
import { formatGridFooterTotalCount } from "@/lib/gridListMeta";
import { GidManagerDrawer, GID_MANAGER_DRAWER_OPEN_SELECTOR } from "@/components/GidManagerDrawer";
import { ExpandChevronButton } from "@/components/ExpandChevronButton";
import { DeletePermanentConfirmModal } from "@/components/DeletePermanentConfirmModal";
import { MainTabsBar } from "@/components/MainTabsBar";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PrimarySaveButton } from "@/components/PrimarySaveButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SearchInputBar } from "@/components/SearchInputBar";
import {
  EditableDataGridThead,
  InlineEditableTable,
  ServerDrivenListTbody,
} from "@/components/TableView";
import {
  icAssocRowId,
  useIcAssocGridColumns,
  type IcAssocGridRow,
} from "./icAssocGridColumns";

function appendIndicatorsQuery(
  searchParams: URLSearchParams,
  params: ExportIndicatorsParams
): void {
  if (params.sort_order) searchParams.set("sort_order", params.sort_order);
  if (params.sort_field) searchParams.set("sort_field", params.sort_field);
  if (params.search != null && params.search !== "")
    searchParams.set("search", params.search);
  if (params.search_by != null && params.search_by !== "")
    searchParams.set("search_by", params.search_by);
  if (params.u_identifier != null && params.u_identifier !== "")
    searchParams.set("u_identifier", params.u_identifier);
  if (params.sg_identifier != null && params.sg_identifier !== "")
    searchParams.set("sg_identifier", params.sg_identifier);
  if (params.ic_identifier != null && params.ic_identifier !== "")
    searchParams.set("ic_identifier", params.ic_identifier);
  if (params.ic_type != null && params.ic_type !== "")
    searchParams.set("ic_type", params.ic_type);
  if (params.subgroup === true) searchParams.set("subgroup", "true");
  if (params.default_subgroup_only === true)
    searchParams.set("default_subgroup_only", "true");
}

async function fetchIndicators(
  dwId: string,
  params: FetchIndicatorsParams = {}
): Promise<IndicatorsListResult> {
  const searchParams = new URLSearchParams();

  if (params.page != null) searchParams.set("page", String(params.page));
  if (params.page_size != null)
    searchParams.set("page_size", String(params.page_size));
  appendIndicatorsQuery(searchParams, params);

  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_INDICATORS)}?${searchParams.toString()}`;

  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as IndicatorsListResponse | IndicatorsListError;

  if ((json as IndicatorsListResponse).success === true) {
    return json as IndicatorsListResponse;
  }

  const err = json as IndicatorsListError;
  return {
    success: false,
    err_message: err.err_message ?? "Request failed",
    errors: err.errors,
  };
}

async function fetchIndicatorClassifications(
  dwId: string,
  params: FetchIndicatorClassificationsParams = {}
): Promise<FetchIndicatorClassificationsResult> {
  const searchParams = new URLSearchParams();
  if (params.page != null) searchParams.set("page", String(params.page));
  if (params.page_size != null) searchParams.set("page_size", String(params.page_size));
  if (params.sort_order) searchParams.set("sort_order", params.sort_order);
  if (params.sort_field) searchParams.set("sort_field", params.sort_field);
  if (params.search) searchParams.set("search", params.search);
  if (params.ic_type) searchParams.set("ic_type", params.ic_type);
  if (params.ic_parent_nid != null) searchParams.set("ic_parent_nid", String(params.ic_parent_nid));
  if (params.hierarchical === true) searchParams.set("hierarchical", "true");
  if (params.include_ic_ius_counts === true) searchParams.set("include_ic_ius_counts", "true");
  if (params.export === true) searchParams.set("export", "true");
  const q = searchParams.toString();
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_INDICATOR_CLASSIFICATIONS)}${q ? `?${q}` : ""}`;
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as FetchIndicatorClassificationsResult;
  if (json.success !== true) {
    return {
      success: false,
      err_message: (json as { err_message?: string }).err_message ?? "Request failed",
      errors: (json as { errors?: Record<string, unknown> }).errors,
    };
  }
  return json;
}

async function downloadIndicatorClassificationsExport(
  dwId: string,
  params: Omit<FetchIndicatorClassificationsParams, "page" | "page_size"> = {}
): Promise<{ ok: true } | { ok: false; message: string }> {
  const searchParams = new URLSearchParams();
  searchParams.set("export", "true");
  if (params.sort_order) searchParams.set("sort_order", params.sort_order);
  if (params.sort_field) searchParams.set("sort_field", params.sort_field);
  if (params.search) searchParams.set("search", params.search);
  if (params.ic_type) searchParams.set("ic_type", params.ic_type);
  if (params.ic_parent_nid != null) searchParams.set("ic_parent_nid", String(params.ic_parent_nid));
  if (params.hierarchical === true) searchParams.set("hierarchical", "true");
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_INDICATOR_CLASSIFICATIONS)}?${searchParams.toString()}`;
  const res = await getFileResponse(url);
  if (!res.ok) {
    const text = await res.text();
    try {
      const json = JSON.parse(text) as { err_message?: string; message?: string };
      return { ok: false, message: json.err_message ?? json.message ?? `Export failed (${res.status})` };
    } catch {
      return { ok: false, message: `Export failed (${res.status})` };
    }
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `indicator-classifications-${dwId}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
  return { ok: true };
}

async function fetchIndicatorClassificationTypes(
  dwId: string
): Promise<
  | { success: true; data: Record<string, string> }
  | { success: false; err_message?: string; errors?: Record<string, unknown> }
> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_INDICATOR_CLASSIFICATIONS)}/type`;
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as {
    success?: boolean;
    data?: Record<string, string>;
    err_message?: string;
    errors?: Record<string, unknown>;
  };
  if (json.success !== true || !json.data) {
    return {
      success: false,
      err_message: json.err_message ?? "Request failed",
      errors: json.errors,
    };
  }
  return { success: true, data: json.data };
}

async function createIndicatorClassifications(
  dwId: string,
  data: Record<string, unknown>[]
): Promise<{ success: true; data?: unknown } | { success: false; err_message?: string; errors?: Record<string, unknown> }> {
  const json = (await postRequest(
    getDWAPIURL(dwId, REFERENCE_PATH_INDICATOR_CLASSIFICATIONS),
    data,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as {
    success?: boolean;
    data?: unknown;
    err_message?: string;
    errors?: Record<string, unknown>;
  };
  if (json.success !== true) {
    return {
      success: false,
      err_message: json.err_message ?? "Request failed",
      errors: json.errors,
    };
  }
  return { success: true, data: json.data };
}

async function updateIndicatorClassification(
  dwId: string,
  identifier: string,
  patch: Record<string, unknown>
): Promise<{ success: true; data?: unknown } | { success: false; err_message?: string; errors?: Record<string, unknown>; status?: number }> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_INDICATOR_CLASSIFICATIONS)}/${encodeURIComponent(identifier)}`;
  const json = (await patchRequest(url, patch, undefined, undefined, {
    suppressErrorMessage: true,
  })) as {
    success?: boolean;
    data?: unknown;
    err_message?: string;
    errors?: Record<string, unknown>;
    status?: number;
  };
  if (json.success !== true) {
    return {
      success: false,
      err_message: json.err_message ?? "Request failed",
      errors: json.errors,
      status: typeof json.status === "number" ? json.status : undefined,
    };
  }
  return { success: true, data: json.data };
}

async function deleteIndicatorClassification(
  dwId: string,
  identifier: string
): Promise<{ success: true } | { success: false; err_message?: string; errors?: Record<string, unknown>; status?: number }> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_INDICATOR_CLASSIFICATIONS)}/${encodeURIComponent(identifier)}`;
  const json = (await deleteRequest(url, undefined, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success === false) {
    return {
      success: false,
      err_message: (json.err_message as string | undefined) ?? "Request failed",
      errors: json.errors as Record<string, unknown> | undefined,
      status: json.status as number | undefined,
    };
  }
  return { success: true };
}

async function fetchIndicatorsByClassification(
  dwId: string,
  icIdentifier: string,
  params: { page?: number; page_size?: number; sort_order?: "asc" | "desc"; sort_field?: string } = {}
): Promise<
  | { success: true; data: IndicatorListItem[]; meta?: Record<string, unknown> }
  | { success: false; err_message?: string; errors?: Record<string, unknown> }
> {
  const searchParams = new URLSearchParams();
  if (params.page != null) searchParams.set("page", String(params.page));
  if (params.page_size != null) searchParams.set("page_size", String(params.page_size));
  if (params.sort_order) searchParams.set("sort_order", params.sort_order);
  if (params.sort_field) searchParams.set("sort_field", params.sort_field);
  const q = searchParams.toString();
  const base = `${getDWAPIURL(dwId, `/ic/${encodeURIComponent(icIdentifier)}/indicators`)}`;
  const url = q ? `${base}?${q}` : base;
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as {
    success?: boolean;
    data?: IndicatorListItem[];
    meta?: Record<string, unknown>;
    err_message?: string;
    errors?: Record<string, unknown>;
  };
  if (json.success !== true || !Array.isArray(json.data)) {
    return {
      success: false,
      err_message: json.err_message ?? "Request failed",
      errors: json.errors,
    };
  }
  return { success: true, data: json.data, meta: json.meta };
}

async function updateIndicatorClassificationIusMapping(
  dwId: string,
  mappings: IcIusMappingItem[]
): Promise<
  | { success: true; data?: unknown; meta?: Record<string, unknown> }
  | { success: false; err_message?: string; errors?: Record<string, unknown>; status?: number }
> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_INDICATOR_CLASSIFICATIONS)}/ius`;
  const json = (await putRequest(
    url,
    { data: mappings },
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as {
    success?: boolean;
    data?: unknown;
    meta?: Record<string, unknown>;
    err_message?: string;
    errors?: Record<string, unknown>;
    status?: number;
  };
  if (json.success !== true) {
    return {
      success: false,
      err_message: json.err_message ?? "Request failed",
      errors: json.errors,
      status: typeof json.status === "number" ? json.status : undefined,
    };
  }
  return { success: true, data: json.data, meta: json.meta };
}

async function downloadIcIusExport(
  dwId: string,
  payload: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await downloadRequest(getDWAPIURL(dwId, REFERENCE_PATH_IC_IUS_EXPORT), payload);
  if (!res.ok) {
    const text = await res.text();
    try {
      const json = JSON.parse(text) as { err_message?: string; message?: string };
      return { ok: false, message: json.err_message ?? json.message ?? `Export failed (${res.status})` };
    } catch {
      return { ok: false, message: `Export failed (${res.status})` };
    }
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `ic-ius-export-${dwId}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
  return { ok: true };
}

type AssocViewMeta = {
  viewPage: number;
  pageSize: number;
  mappedCount: number;
  hasNextPage: boolean;
};

type AssocTab = "ius" | "iu";
type TreeNode = IndicatorClassificationItem & { children: TreeNode[] };

/** Page sizes for the associations grid (and GET /indicators chunk size when scanning unmapped rows). */
const IC_ASSOC_PAGE_SIZES = [100, 250, 500, 1000] as const;
/** Backend max for GET /indicators list page_size. */
const INDICATORS_API_MAX_PAGE_SIZE = 1000;

/** GET /indicators page_size when scanning indicator pages; matches grid control, capped at API max. */
function assocApiPageSize(uiPageSize: number): number {
  return Math.min(Math.max(uiPageSize, 1), INDICATORS_API_MAX_PAGE_SIZE);
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

type AssocRow = IcAssocGridRow;

const Mi = ({ name, className = "" }: { name: string; className?: string }) => (
  <span className={`material-icons ${className}`.trim()} aria-hidden>
    {name}
  </span>
);

function getIcName(node: IndicatorClassificationItem): string {
  return String(node.ic_name ?? "").trim();
}

function getIcId(node: IndicatorClassificationItem): string {
  const gid = String(node.ic_gid ?? "").trim();
  if (gid) return gid;
  return String(node.ic_nid ?? "");
}

/** Prefer ic_nid for PATCH/DELETE — the API treats all-digit paths as ic_nid, so a numeric ic_gid would resolve wrongly. */
function getIcApiIdentifier(node: IndicatorClassificationItem): string {
  const nid = node.ic_nid;
  if (nid != null && Number.isFinite(Number(nid))) return String(nid);
  const gid = String(node.ic_gid ?? "").trim();
  if (gid) return gid;
  return getIcId(node);
}

function findPathToIc(nodes: TreeNode[], targetId: string): TreeNode[] | null {
  for (const n of nodes) {
    const id = getIcId(n);
    if (id === targetId) return [n];
    if (n.children?.length) {
      const sub = findPathToIc(n.children, targetId);
      if (sub) return [n, ...sub];
    }
  }
  return null;
}

/** IC ids that must be expanded for `targetId` to be reachable (ancestors only, not `targetId`). */
function ancestorIdsToOpenForPath(nodes: TreeNode[], targetId: string, prefix: string[] = []): string[] | null {
  for (const n of nodes) {
    const id = getIcId(n);
    if (id === targetId) return prefix;
    const kids = n.children ?? [];
    const found = ancestorIdsToOpenForPath(kids, targetId, [...prefix, id]);
    if (found !== null) return found;
  }
  return null;
}

function getIcTreeBadgeCount(node: TreeNode): number {
  const v = node.ic_ius_subtree_union_count;
  return typeof v === "number" ? v : 0;
}

function getIndicatorName(row: IndicatorListItem): string {
  return String(row.indicator_name ?? row.i_name ?? "").trim();
}

function getIndicatorGid(row: IndicatorListItem): string {
  return String(row.indicator_gid ?? row.i_gid ?? "").trim();
}

type UnitMetaLo = Record<string, { u_name?: string; unit_name?: string }>;
type SgMetaLo = Record<string, { sg_name?: string; subgroup_val_name?: string }>;

function sortAssocRowsLex(rows: AssocRow[]): void {
  rows.sort((a, b) => {
    const ka = `${a.indicator}\0${a.unit}\0${a.subgroup}\0${a.id}`;
    const kb = `${b.indicator}\0${b.unit}\0${b.subgroup}\0${b.id}`;
    return ka.localeCompare(kb, undefined, { sensitivity: "base" });
  });
}

function expandIndicatorsToAssocRows(
  indicators: IndicatorListItem[],
  assocTab: AssocTab,
  unitMeta: UnitMetaLo,
  subgroupMeta: SgMetaLo
): AssocRow[] {
  const rows: AssocRow[] = [];
  if (assocTab === "ius") {
    for (const row of indicators) {
      const iName = getIndicatorName(row);
      const iGid = getIndicatorGid(row);
      const units = Array.isArray(row.unit_gid ?? row.u_gid) ? (row.unit_gid ?? row.u_gid ?? []) : [];
      const sgMap = row.s_gid ?? null;
      for (const u of units) {
        const uu = String(u ?? "").trim();
        if (!uu) continue;
        const sgList = sgMap?.[uu]?.sg_gid ?? [];
        const unitName = String(unitMeta[uu]?.u_name ?? unitMeta[uu]?.unit_name ?? uu).trim();
        if (sgList.length === 0) {
          rows.push({ id: `${iGid}|${uu}|`, indicator: iName, unit: unitName, subgroup: "" });
          continue;
        }
        for (const sg of sgList) {
          const sgGid = String(sg);
          const subgroupName = String(
            subgroupMeta[sgGid]?.sg_name ?? subgroupMeta[sgGid]?.subgroup_val_name ?? sgGid
          ).trim();
          rows.push({
            id: `${iGid}|${uu}|${sgGid}`,
            indicator: iName,
            unit: unitName,
            subgroup: subgroupName,
          });
        }
      }
    }
  } else {
    for (const row of indicators) {
      const iName = getIndicatorName(row);
      const iGid = getIndicatorGid(row);
      const units = Array.isArray(row.unit_gid ?? row.u_gid) ? (row.unit_gid ?? row.u_gid ?? []) : [];
      for (const u of units) {
        const uu = String(u ?? "").trim();
        if (!uu) continue;
        const unitName = String(unitMeta[uu]?.u_name ?? unitMeta[uu]?.unit_name ?? uu).trim();
        rows.push({ id: `${iGid}|${uu}`, indicator: iName, unit: unitName, subgroup: "" });
      }
    }
  }
  return rows;
}

async function collectUnmappedAssocRows(
  dwId: string,
  options: {
    assocTab: AssocTab;
    serverMappedIds: Set<string>;
    skipUnmapped: number;
    take: number;
    /** GET /indicators page_size; list is exhausted only after all pages (meta.total_pages), not after one chunk. */
    indicatorsListPageSize: number;
    listParams: Record<string, string | undefined>;
    cancelled: () => boolean;
  }
): Promise<{ rows: AssocRow[]; indicatorsExhausted: boolean }> {
  const { assocTab, serverMappedIds, skipUnmapped, take, indicatorsListPageSize, listParams, cancelled } = options;
  if (take <= 0) return { rows: [], indicatorsExhausted: true };
  const collected: AssocRow[] = [];
  let unmappedSeen = 0;
  let indPage = 1;
  let totalIndPages = 1;

  for (;;) {
    if (cancelled()) return { rows: collected, indicatorsExhausted: false };
    const indRes = await fetchIndicators(dwId, {
      page: indPage,
      page_size: indicatorsListPageSize,
      subgroup: true,
      default_subgroup_only: false,
      sort_field: "i_order",
      sort_order: "asc",
      ...listParams,
    });
    if (!indRes.success) {
      toast.error(indRes.err_message ?? "Failed to load indicators");
      return { rows: collected, indicatorsExhausted: true };
    }
    totalIndPages = indRes.meta?.total_pages ?? 1;
    const unitMeta = (indRes.meta?.unit ?? {}) as UnitMetaLo;
    const subgroupMeta = (indRes.meta?.subgroup ?? {}) as SgMetaLo;
    const batch = expandIndicatorsToAssocRows(indRes.data, assocTab, unitMeta, subgroupMeta);
    for (const row of batch) {
      if (serverMappedIds.has(row.id)) continue;
      if (unmappedSeen < skipUnmapped) {
        unmappedSeen += 1;
        continue;
      }
      collected.push(row);
      if (collected.length >= take) {
        const moreIndicatorPages = indPage < totalIndPages;
        return { rows: collected, indicatorsExhausted: !moreIndicatorPages };
      }
    }
    indPage += 1;
    if (indPage > totalIndPages) {
      return { rows: collected, indicatorsExhausted: true };
    }
  }
}

/** All pages of GET /indicators with ic_identifier (and optional column search); expands to IUS/IU assoc rows. */
async function loadMappedAssocCatalogFromIndicators(
  dwId: string,
  options: {
    assocTab: AssocTab;
    icIdentifier: string;
    icType?: string;
    extraListParams: Record<string, string | undefined>;
    cancelled: () => boolean;
  }
): Promise<AssocRow[] | null> {
  const { assocTab, icIdentifier, icType, extraListParams, cancelled } = options;
  const chunkSize = INDICATORS_API_MAX_PAGE_SIZE;
  let page = 1;
  let totalPages = 1;
  const allIndicators: IndicatorListItem[] = [];
  const unitMeta: UnitMetaLo = {};
  const subgroupMeta: SgMetaLo = {};

  while (page <= totalPages) {
    if (cancelled()) return null;
    const res = await fetchIndicators(dwId, {
      page,
      page_size: chunkSize,
      subgroup: true,
      default_subgroup_only: false,
      sort_field: "i_order",
      sort_order: "asc",
      ic_identifier: icIdentifier,
      ...(icType ? { ic_type: icType } : {}),
      ...extraListParams,
    });
    if (!res.success) {
      toast.error(res.err_message ?? "Failed to load classification mappings");
      return null;
    }
    totalPages = res.meta?.total_pages ?? 1;
    allIndicators.push(...res.data);
    Object.assign(unitMeta, (res.meta?.unit ?? {}) as UnitMetaLo);
    Object.assign(subgroupMeta, (res.meta?.subgroup ?? {}) as SgMetaLo);
    page += 1;
  }

  const catalog = expandIndicatorsToAssocRows(allIndicators, assocTab, unitMeta, subgroupMeta);
  sortAssocRowsLex(catalog);
  return catalog;
}

function buildTree(nodes: IndicatorClassificationItem[]): TreeNode[] {
  const clone = nodes.map((n) => ({ ...n, children: Array.isArray(n.children) ? buildTree(n.children) : [] }));
  return clone;
}

function flattenTree(nodes: TreeNode[], out: TreeNode[] = []): TreeNode[] {
  for (const n of nodes) {
    out.push(n);
    flattenTree(n.children, out);
  }
  return out;
}

/** Visual / DOM order of focus targets in the classification tree (ghost add rows + nodes), for keyboard nav. */
function buildIcTreeFocusKeys(
  nodes: TreeNode[],
  expanded: Set<string>,
  parentKey: string
): string[] {
  const keys: string[] = [`ghost:${parentKey}`];
  for (const node of nodes) {
    const id = getIcId(node);
    keys.push(`node:${id}`);
    if (expanded.has(id)) {
      keys.push(...buildIcTreeFocusKeys(node.children ?? [], expanded, id));
    }
  }
  return keys;
}

function getTreeNodeById(nodes: TreeNode[], targetId: string): TreeNode | null {
  for (const n of nodes) {
    if (getIcId(n) === targetId) return n;
    const found = getTreeNodeById(n.children ?? [], targetId);
    if (found) return found;
  }
  return null;
}

const IC_ASSOC_GRID_SELECTOR = "[data-ic-assoc-grid]";
const IC_CLASSIFICATION_TREE_SELECTOR = "[data-ic-classification-tree]";

function isIcTextLikeKeyboardTrap(el: HTMLElement): boolean {
  const t = el.closest(
    "input, textarea, select, [contenteditable='true'], [role='textbox'], [role='combobox']"
  );
  return t != null;
}

function generateIcGid(): string {
  return "XXXXXXXX-XXXX-4XXX-YXXX-XXXXXXXXXXXX".replace(/[XY]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "X" ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

/** Parse first created item from POST indicator-classifications (full or reduced body). */
function parseCreatedIcFirstItem(data: unknown): { ic_nid?: number; ic_gid?: string } | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const item = data[0];
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const nidRaw = o.ic_nid ?? o.i_nid;
  let ic_nid: number | undefined;
  if (typeof nidRaw === "number" && Number.isFinite(nidRaw)) ic_nid = nidRaw;
  else if (typeof nidRaw === "string" && nidRaw.trim() && Number.isFinite(Number(nidRaw))) ic_nid = Number(nidRaw);
  const gidRaw = o.ic_gid ?? o.i_gid;
  const ic_gid = gidRaw != null && String(gidRaw).trim() ? String(gidRaw).trim() : undefined;
  if (ic_nid == null && ic_gid == null) return null;
  return { ic_nid, ic_gid };
}

/** Insert `child` as the first child under `parentKey` (null = root). Immutable. */
function mapTreeInsertChildFirst(nodes: TreeNode[], parentKey: string | null, child: TreeNode): TreeNode[] {
  const childNode: TreeNode = { ...child, children: child.children ?? [] };
  if (!parentKey) {
    return [childNode, ...nodes];
  }
  return nodes.map((n): TreeNode => {
    const id = getIcId(n);
    if (id === parentKey) {
      const kids: TreeNode[] = n.children ?? [];
      return { ...n, children: [childNode, ...kids] };
    }
    const kids: TreeNode[] = n.children ?? [];
    if (kids.length > 0) {
      return { ...n, children: mapTreeInsertChildFirst(kids, parentKey, childNode) };
    }
    return n;
  });
}

export default function IndicatorClassificationsPage() {
  const { t } = useCore();
  const {
    dwId,
    setToolbarExport,
    setToolbarImport,
    setFileImportSubmitHandler,
    setFileImportTemplateHandler,
  } = useSidebar();
  const { allowed } = useDwPermissionGuard(DW_ROUTE_PERMISSIONS.template.classifications);
  const { canCreate, canUpdate, canDelete } = useDwCrudPermissions(
    DW_ROUTE_PERMISSIONS.template.classifications
  );
  const [loading, setLoading] = useState(false);
  const [types, setTypes] = useState<Array<{ code: string; label: string }>>([]);
  const [activeType, setActiveType] = useState<string>("");
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  /** Latest tree for loadTree selection fallback (reselect by ic_nid after ic_gid rename). */
  const treeRef = useRef<TreeNode[]>([]);
  treeRef.current = tree;
  const [assocTab, setAssocTab] = useState<AssocTab>("ius");
  const [assocRows, setAssocRows] = useState<AssocRow[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [savingMap, setSavingMap] = useState(false);
  const [savingNodeId, setSavingNodeId] = useState<string>("");
  const [gidDrawerOpen, setGidDrawerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [filterIndicator, setFilterIndicator] = useState("");
  const [filterUnit, setFilterUnit] = useState("");
  const [filterSubgroup, setFilterSubgroup] = useState("");
  const [assocListPage, setAssocListPage] = useState(1);
  const [assocPageSize, setAssocPageSize] = useState<number>(500);
  const [assocViewMeta, setAssocViewMeta] = useState<AssocViewMeta | null>(null);
  /** GET /indicators `total_count` (same search as association grid) for footer “of N records”. */
  const [assocWarehouseRecordCount, setAssocWarehouseRecordCount] = useState<number | null>(null);
  const [assocWarehouseRecordCountUnfiltered, setAssocWarehouseRecordCountUnfiltered] =
    useState<number | undefined>(undefined);
  const [assocIndLoading, setAssocIndLoading] = useState(false);
  const [leftWidth, setLeftWidth] = useState(360);
  const [addingUnderId, setAddingUnderId] = useState<string | null>(null);
  const [addingName, setAddingName] = useState("");
  const [mappingRefreshNonce, setMappingRefreshNonce] = useState(0);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [baselineChecked, setBaselineChecked] = useState<Set<string>>(() => new Set());
  const baselineCheckedRef = useRef<Set<string>>(new Set());
  /** All mapped IUS/IU rows for the selected IC (unfiltered); drives baseline ids and unmapped skip set. */
  const fullMappedAssocCatalogRef = useRef<AssocRow[]>([]);
  const fullMappedAssocIdsRef = useRef<Set<string>>(new Set());
  /** Catalog slice for the grid: full list or server-filtered list when column search is active. */
  const mappedAssocCatalogRef = useRef<AssocRow[]>([]);
  const headerSelectAllRef = useRef<HTMLInputElement>(null);
  const icAssocScrollRef = useRef<HTMLDivElement>(null);
  /** Roving tabindex targets in the left tree (keys like `ghost:root`, `node:<id>`). */
  const icTreeFocusElRef = useRef<Map<string, HTMLElement>>(new Map());
  const [icTreeFocusKey, setIcTreeFocusKey] = useState<string | null>(null);
  const [assocActiveRowId, setAssocActiveRowId] = useState<string | null>(null);
  const filteredTreeRef = useRef<TreeNode[]>([]);
  const expandedRef = useRef<Set<string>>(new Set());
  const assocRowsRef = useRef<AssocRow[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<TreeNode | null>(null);
  const [deleteRunning, setDeleteRunning] = useState(false);
  const [deleteRunError, setDeleteRunError] = useState<string | null>(null);
  const [parentNodeHintOpen, setParentNodeHintOpen] = useState(false);
  const parentNodeHintRef = useRef<HTMLDivElement | null>(null);
  const parentNodeHintButtonRef = useRef<HTMLButtonElement | null>(null);
  const [parentNodeHintPos, setParentNodeHintPos] = useState<{ top: number; left: number } | null>(null);
  /** Prevents duplicate POSTs when Enter is pressed again (or blur races) before the first create finishes. */
  const icAddInFlightRef = useRef(false);

  const selectedNode = useMemo(
    () => flattenTree(tree).find((n) => getIcId(n) === selectedId) ?? null,
    [tree, selectedId]
  );
  const selectedNodeCanMap = useMemo(
    () => (selectedNode?.children?.length ?? 0) === 0,
    [selectedNode]
  );
  const parentNodeMappingHint = t(
    "IC_MAPPING_PARENT_NODE_HINT",
    "Mapping is disabled for parent nodes. Select the lowest sub-classification to tag IUS/IU."
  );
  const updateParentNodeHintPosition = useCallback(() => {
    const button = parentNodeHintButtonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const tooltipWidth = 320;
    const maxLeft = Math.max(8, window.innerWidth - tooltipWidth - 8);
    const nextLeft = Math.max(8, Math.min(maxLeft, rect.right - tooltipWidth));
    setParentNodeHintPos({ top: rect.bottom + 8, left: nextLeft });
  }, []);
  const toggleParentNodeHint = useCallback(() => {
    setParentNodeHintOpen((prev) => {
      const next = !prev;
      if (next) updateParentNodeHintPosition();
      return next;
    });
  }, [updateParentNodeHintPosition]);

  const loadTree = useCallback(
    async (typeCode: string, selectAfter?: string) => {
      if (!dwId || !typeCode) return;
      setLoading(true);
      const res = await fetchIndicatorClassifications(dwId, {
        ic_type: typeCode,
        hierarchical: true,
        include_ic_ius_counts: true,
      });
      setLoading(false);
      if (!res.success) {
        toast.error(res.err_message ?? "Failed to load classifications");
        return;
      }
      const nextTree = buildTree(res.data);
      setTree(nextTree);
      const ids = flattenTree(nextTree).map((n) => getIcId(n)).filter(Boolean);

      let nextSel = "";
      if (selectAfter && ids.includes(selectAfter)) nextSel = selectAfter;
      else {
        const prev = selectedIdRef.current;
        if (prev && ids.includes(prev)) nextSel = prev;
        else if (prev) {
          const prevNode = flattenTree(treeRef.current).find((n) => getIcId(n) === prev);
          const prevNid = prevNode?.ic_nid;
          if (prevNid != null) {
            const match = flattenTree(nextTree).find((n) => n.ic_nid === prevNid);
            if (match) nextSel = getIcId(match);
          }
        }
        if (!nextSel && ids[0]) nextSel = ids[0];
      }
      const ancestors = nextSel ? ancestorIdsToOpenForPath(nextTree, nextSel) ?? [] : [];
      setExpanded(new Set(ancestors));
      setSelectedId(nextSel);
    },
    [dwId]
  );

  useEffect(() => {
    if (!dwId) return;
    let cancelled = false;
    (async () => {
      const t = await fetchIndicatorClassificationTypes(dwId);
      if (cancelled) return;
      if (!t.success) {
        toast.error(t.err_message ?? "Failed to load classification types");
        return;
      }
      const rows = Object.entries(t.data).map(([code, label]) => ({ code, label }));
      setTypes(rows);
      const first = rows[0]?.code ?? "";
      setActiveType((prev) => prev || first);
    })();
    return () => {
      cancelled = true;
    };
  }, [dwId]);

  useEffect(() => {
    if (!activeType) return;
    void loadTree(activeType);
  }, [activeType, loadTree]);

  useEffect(() => {
    if (!addingUnderId || addingUnderId === "root") return;
    if (!expanded.has(addingUnderId)) {
      setAddingUnderId(null);
      setAddingName("");
    }
  }, [expanded, addingUnderId]);

  useEffect(() => {
    if (!parentNodeHintOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const host = parentNodeHintRef.current;
      if (!host) return;
      if (host.contains(event.target as Node)) return;
      setParentNodeHintOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setParentNodeHintOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", updateParentNodeHintPosition);
    window.addEventListener("scroll", updateParentNodeHintPosition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", updateParentNodeHintPosition);
      window.removeEventListener("scroll", updateParentNodeHintPosition, true);
    };
  }, [parentNodeHintOpen, updateParentNodeHintPosition]);

  useEffect(() => {
    setParentNodeHintOpen(false);
    setParentNodeHintPos(null);
  }, [selectedId, selectedNodeCanMap]);

  useEffect(() => {
    setToolbarImport({
      onClick: () => {},
      disabled: !dwId || !canCreate,
    });
    setToolbarExport({
      onClick: async () => setExportOpen(true),
      disabled: false,
    });
    return () => {
      setToolbarImport(null);
      setToolbarExport(null);
    };
  }, [dwId, canCreate, setToolbarImport, setToolbarExport]);

  const debouncedFilterIndicator = useDebounce(filterIndicator, 300);
  const debouncedFilterUnit = useDebounce(filterUnit, 300);
  const debouncedFilterSubgroup = useDebounce(filterSubgroup, 300);

  const assocIndicatorListParams = useMemo(() => {
    const parts: string[] = [];
    const terms: string[] = [];
    const fi = debouncedFilterIndicator.trim();
    const fu = debouncedFilterUnit.trim();
    const fs = debouncedFilterSubgroup.trim();
    if (fi) {
      parts.push("indicator");
      terms.push(fi);
    }
    if (fu) {
      parts.push("unit");
      terms.push(fu);
    }
    if (assocTab === "ius" && fs) {
      parts.push("subgroup");
      terms.push(fs);
    }
    if (!parts.length) return {};
    return {
      search: terms.join("|"),
      search_by: parts.join("|"),
    };
  }, [debouncedFilterIndicator, debouncedFilterUnit, debouncedFilterSubgroup, assocTab]);

  useEffect(() => {
    if (!dwId || !selectedNode) {
      setAssocWarehouseRecordCount(null);
      return;
    }
    let cancelled = false;
    const listParams = assocIndicatorListParams as Record<string, string | undefined>;
    (async () => {
      const res = await fetchIndicators(dwId, {
        page: 1,
        page_size: 1,
        subgroup: true,
        default_subgroup_only: false,
        sort_field: "i_order",
        sort_order: "asc",
        ...listParams,
      });
      if (cancelled || !res.success) return;
      const tc = res.meta?.total_count;
      if (typeof tc === "number") setAssocWarehouseRecordCount(tc);
      const tu = res.meta?.total_count_unfiltered;
      setAssocWarehouseRecordCountUnfiltered(
        typeof tu === "number" && tu >= 0 ? tu : undefined
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [dwId, selectedNode, assocIndicatorListParams]);

  useEffect(() => {
    baselineCheckedRef.current = baselineChecked;
  }, [baselineChecked]);

  /** Reload full server mapping when IC / tab / post-save (not when column search changes). */
  const assocFullBaselineCtxRef = useRef("");

  /**
   * Mapped IUS/IU: GET /indicators with ic_identifier (pages until total_pages), subgroup expansion matches IC-mapped IUS only (API).
   * Unmapped: GET /indicators without ic filter pages until the slice is filled or indicators exhausted.
   * Column search uses GET /indicators search/search_by on the mapped fetch; baseline loads without search.
   */
  useEffect(() => {
    if (!dwId || !selectedNode) {
      setAssocRows([]);
      setAssocViewMeta(null);
      setBaselineChecked(new Set());
      setChecked(new Set());
      baselineCheckedRef.current = new Set();
      fullMappedAssocCatalogRef.current = [];
      fullMappedAssocIdsRef.current = new Set();
      mappedAssocCatalogRef.current = [];
      assocFullBaselineCtxRef.current = "";
      return;
    }
    let cancelled = false;
    const fullBaselineCtx = `${dwId}|${getIcId(selectedNode)}|${assocTab}|${mappingRefreshNonce}`;
    const needFullBaseline = assocFullBaselineCtxRef.current !== fullBaselineCtx;
    const listParams = assocIndicatorListParams as Record<string, string | undefined>;
    const hasColumnSearch = Boolean(listParams.search?.trim() && listParams.search_by?.trim());

    (async () => {
      setAssocIndLoading(true);
      const pageSize = assocApiPageSize(assocPageSize);
      const icIdentifier = selectedNode.ic_gid ? String(selectedNode.ic_gid) : String(selectedNode.ic_nid ?? "");
      const icTypeRaw = String(selectedNode.ic_type ?? "").trim();
      const icType = icTypeRaw || undefined;

      if (needFullBaseline) {
        const catalog = await loadMappedAssocCatalogFromIndicators(dwId, {
          assocTab,
          icIdentifier,
          icType,
          extraListParams: {},
          cancelled: () => cancelled,
        });
        if (cancelled) return;
        if (catalog === null) {
          setAssocIndLoading(false);
          setAssocRows([]);
          setAssocViewMeta(null);
          fullMappedAssocCatalogRef.current = [];
          fullMappedAssocIdsRef.current = new Set();
          mappedAssocCatalogRef.current = [];
          return;
        }
        fullMappedAssocCatalogRef.current = catalog;
        fullMappedAssocIdsRef.current = new Set(catalog.map((r) => r.id));
        const initial = new Set(catalog.map((r) => r.id));
        baselineCheckedRef.current = initial;
        setBaselineChecked(initial);
        setChecked(new Set(initial));
        assocFullBaselineCtxRef.current = fullBaselineCtx;
      }

      if (hasColumnSearch) {
        const filteredCatalog = await loadMappedAssocCatalogFromIndicators(dwId, {
          assocTab,
          icIdentifier,
          icType,
          extraListParams: {
            search: listParams.search,
            search_by: listParams.search_by,
          },
          cancelled: () => cancelled,
        });
        if (cancelled || filteredCatalog === null) return;
        mappedAssocCatalogRef.current = filteredCatalog;
      } else {
        mappedAssocCatalogRef.current = fullMappedAssocCatalogRef.current;
      }

      const catalogSnap = mappedAssocCatalogRef.current;
      const m = catalogSnap.length;
      const viewStart = (assocListPage - 1) * pageSize;
      const viewEnd = viewStart + pageSize;

      let mappedPart: AssocRow[] = [];
      let unmappedSkip = 0;
      let unmappedTake = 0;

      if (viewEnd <= m) {
        mappedPart = catalogSnap.slice(viewStart, viewEnd);
      } else if (viewStart >= m) {
        unmappedSkip = viewStart - m;
        unmappedTake = pageSize;
      } else {
        mappedPart = catalogSnap.slice(viewStart, m);
        unmappedTake = pageSize - mappedPart.length;
      }

      if (mappedPart.length > 0 && unmappedTake > 0 && !cancelled) {
        setAssocRows(mappedPart);
      }

      let unmappedRows: AssocRow[] = [];
      if (unmappedTake > 0 && !cancelled) {
        const { rows } = await collectUnmappedAssocRows(dwId, {
          assocTab,
          serverMappedIds: fullMappedAssocIdsRef.current,
          skipUnmapped: unmappedSkip,
          take: unmappedTake,
          indicatorsListPageSize: pageSize,
          listParams: assocIndicatorListParams as Record<string, string | undefined>,
          cancelled: () => cancelled,
        });
        unmappedRows = rows;
      }

      if (cancelled) return;
      const fullSlice = [...mappedPart, ...unmappedRows];
      if (fullSlice.length === 0 && assocListPage > 1) {
        setAssocListPage((p) => Math.max(1, p - 1));
        setAssocIndLoading(false);
        return;
      }
      setAssocRows(fullSlice);

      const sliceFull = fullSlice.length === pageSize;
      /** Full page ⇒ there may be more mapped or more unmapped; short page ⇒ end of list. */
      const hasNextPage = sliceFull;

      setAssocViewMeta({
        viewPage: assocListPage,
        pageSize,
        mappedCount: m,
        hasNextPage,
      });
      setAssocIndLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    dwId,
    selectedNode,
    assocTab,
    assocListPage,
    assocPageSize,
    assocIndicatorListParams,
    mappingRefreshNonce,
  ]);

  const filteredTree = useMemo(() => {
    if (!search.trim()) return tree;
    const q = search.trim().toLowerCase();
    const filterNodes = (nodes: TreeNode[]): TreeNode[] =>
      nodes
        .map((n) => ({ ...n, children: filterNodes(n.children) }))
        .filter((n) => getIcName(n).toLowerCase().includes(q) || String(n.ic_gid ?? "").toLowerCase().includes(q) || n.children.length > 0);
    return filterNodes(tree);
  }, [tree, search]);

  filteredTreeRef.current = filteredTree;
  expandedRef.current = expanded;
  assocRowsRef.current = assocRows;

  const icTreeFocusOrder = useMemo(
    () => buildIcTreeFocusKeys(filteredTree, expanded, "root"),
    [filteredTree, expanded]
  );

  useLayoutEffect(() => {
    if (!icTreeFocusKey) return;
    const el = icTreeFocusElRef.current.get(icTreeFocusKey);
    if (el && document.activeElement !== el) {
      el.focus();
      el.scrollIntoView({ block: "nearest" });
    }
  }, [icTreeFocusKey]);

  useEffect(() => {
    if (icTreeFocusKey && !icTreeFocusOrder.includes(icTreeFocusKey)) {
      setIcTreeFocusKey(null);
    }
  }, [icTreeFocusKey, icTreeFocusOrder]);

  useEffect(() => {
    setIcTreeFocusKey(null);
  }, [activeType]);

  useEffect(() => {
    const onArrowNavigation = (event: KeyboardEvent) => {
      if (document.querySelector(GID_MANAGER_DRAWER_OPEN_SELECTOR)) return;
      if (event.defaultPrevented) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (!(event.target instanceof HTMLElement)) return;
      if (
        event.target.closest(
          "input, textarea, select, button, [contenteditable='true'], [role='textbox'], [role='combobox']"
        ) != null
      ) {
        return;
      }
      if (event.target.closest(IC_ASSOC_GRID_SELECTOR) != null) {
        setAssocActiveRowId(null);
      }
    };
    document.addEventListener("keydown", onArrowNavigation);
    return () => {
      document.removeEventListener("keydown", onArrowNavigation);
    };
  }, []);

  useEffect(() => {
    const onKeyDownCapture = (event: KeyboardEvent) => {
      if (document.querySelector(GID_MANAGER_DRAWER_OPEN_SELECTOR)) return;
      if (event.defaultPrevented) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const inAssocGrid = target.closest(IC_ASSOC_GRID_SELECTOR) != null;
      const inClassificationTree = target.closest(IC_CLASSIFICATION_TREE_SELECTOR) != null;

      const jumpToAssocGrid = () => {
        const rows = assocRowsRef.current;
        const node = flattenTree(treeRef.current).find((n) => getIcId(n) === selectedIdRef.current);
        if (!node || rows.length === 0) return;
        event.preventDefault();
        setAssocActiveRowId(icAssocRowId(rows[0]));
      };

      if (event.ctrlKey && (event.key === "ArrowDown" || event.key === "Enter")) {
        if (inClassificationTree && !isIcTextLikeKeyboardTrap(target)) {
          jumpToAssocGrid();
        }
        return;
      }

      if (event.altKey || event.metaKey) return;

      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        if (event.ctrlKey || event.shiftKey) return;
        if (!inClassificationTree || isIcTextLikeKeyboardTrap(target)) return;
        const rowEl = target.closest("[data-ic-tree-focus-key^='node:']");
        if (!(rowEl instanceof HTMLElement)) return;
        const keyAttr = rowEl.getAttribute("data-ic-tree-focus-key");
        if (!keyAttr?.startsWith("node:")) return;
        const nodeId = keyAttr.slice("node:".length);
        const node = getTreeNodeById(filteredTreeRef.current, nodeId);
        if (!node) return;
        const id = getIcId(node);
        const childList = node.children ?? [];
        const isOpen = expandedRef.current.has(id);
        if (event.key === "ArrowRight") {
          if (!isOpen && childList.length > 0) {
            event.preventDefault();
            setExpanded((prev) => new Set(prev).add(id));
          }
        } else if (isOpen) {
          event.preventDefault();
          setExpanded((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
        return;
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (event.ctrlKey || event.shiftKey) return;

      if (inAssocGrid) return;

      if (!inClassificationTree && isIcTextLikeKeyboardTrap(target)) return;

      const order = buildIcTreeFocusKeys(
        filteredTreeRef.current,
        expandedRef.current,
        "root"
      );
      if (order.length === 0) return;

      event.preventDefault();

      const dir: 1 | -1 = event.key === "ArrowDown" ? 1 : -1;
      let idx: number;
      if (inClassificationTree) {
        const host = target.closest("[data-ic-tree-focus-key]");
        const fk =
          host instanceof HTMLElement ? host.getAttribute("data-ic-tree-focus-key") : null;
        const cur = fk && order.includes(fk) ? order.indexOf(fk) : -1;
        if (cur < 0) {
          idx = dir > 0 ? 0 : order.length - 1;
        } else {
          idx = Math.max(0, Math.min(order.length - 1, cur + dir));
        }
      } else {
        const sel = selectedIdRef.current;
        if (sel) {
          const nkey = `node:${sel}`;
          const at = order.indexOf(nkey);
          if (at >= 0) {
            idx = Math.max(0, Math.min(order.length - 1, at + dir));
          } else {
            idx = dir > 0 ? 0 : order.length - 1;
          }
        } else {
          idx = dir > 0 ? 0 : order.length - 1;
        }
      }

      const nextKey = order[idx];
      setIcTreeFocusKey(nextKey);
      if (nextKey.startsWith("node:")) {
        setSelectedId(nextKey.slice("node:".length));
      }
    };

    document.addEventListener("keydown", onKeyDownCapture, true);
    return () => document.removeEventListener("keydown", onKeyDownCapture, true);
  }, []);

  useEffect(() => {
    setAssocListPage(1);
  }, [debouncedFilterIndicator, debouncedFilterUnit, debouncedFilterSubgroup, selectedId, assocTab]);

  const toggleCheck = useCallback((id: string) => {
    if (!selectedNode || !selectedNodeCanMap) return;
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [selectedNode, selectedNodeCanMap]);

  const toggleAll = useCallback(() => {
    if (!selectedNode || !selectedNodeCanMap) return;
    const allChecked = assocRows.length > 0 && assocRows.every((r) => checked.has(r.id));
    if (allChecked) {
      setChecked((prev) => {
        const next = new Set(prev);
        for (const r of assocRows) next.delete(r.id);
        return next;
      });
      return;
    }
    setChecked((prev) => {
      const next = new Set(prev);
      for (const r of assocRows) next.add(r.id);
      return next;
    });
  }, [assocRows, checked, selectedNode, selectedNodeCanMap]);

  const allPageRowsSelected = useMemo(
    () => assocRows.length > 0 && assocRows.every((r) => checked.has(r.id)),
    [assocRows, checked]
  );

  const assocGridColumns = useIcAssocGridColumns({
    assocTab,
    headerSelectAllRef,
    allPageRowsSelected,
    mappingDisabled: !selectedNodeCanMap,
    mappingDisabledTitle: t(
      "IC_MAPPING_LOWEST_LEVEL_ONLY",
      "Mapping is allowed only at the lowest sub-classification level."
    ),
    toggleAll,
    filterIndicator,
    setFilterIndicator,
    filterUnit,
    setFilterUnit,
    filterSubgroup,
    setFilterSubgroup,
    checked,
    toggleCheck,
    t,
  });

  const handleAddNode = useCallback(
    async (parent?: TreeNode) => {
      if (!dwId || !activeType) return;
      const icName = addingName.trim();
      if (!icName) return;
      if (icAddInFlightRef.current) return;
      icAddInFlightRef.current = true;
      try {
      const payloadIcGid = generateIcGid();
      const payload: Record<string, unknown> = {
        ic_name: icName,
        ic_gid: payloadIcGid,
        ic_type: activeType,
        ic_parent_nid: parent?.ic_nid ?? 0,
      };
      const res = await createIndicatorClassifications(dwId, [payload]);
      if (!res.success) {
        toast.error(res.err_message ?? "Failed to create classification");
        return;
      }
      const parsed = parseCreatedIcFirstItem(res.data);
      const newGid = String(parsed?.ic_gid ?? payloadIcGid).trim();

      /** First sub-classification under a parent: inherit all IUS mapped on the parent (same as v5 / PUT ius). */
      const isFirstSubUnderParent =
        Boolean(parent) && (parent?.children?.length ?? 0) === 0;
      let inheritedIus = false;
      if (isFirstSubUnderParent && parent && newGid) {
        const parentGid = String(parent.ic_gid ?? "").trim();
        const parentIcType = String(parent.ic_type ?? activeType ?? "").trim() || undefined;
        if (parentGid) {
          const catalog = await loadMappedAssocCatalogFromIndicators(dwId, {
            assocTab: "ius",
            icIdentifier: parentGid,
            icType: parentIcType,
            extraListParams: {},
            cancelled: () => false,
          });
          if (catalog && catalog.length > 0) {
            const mapRes = await updateIndicatorClassificationIusMapping(dwId, [
              {
                ic_gid: newGid,
                parent_ic_gid: parentGid,
                i_u_sg_gid: catalog.map((r) => r.id),
              },
            ]);
            if (!mapRes.success) {
              toast.error(
                mapRes.err_message ??
                  "Classification was created but copying parent IUS associations failed."
              );
            } else {
              inheritedIus = true;
              setMappingRefreshNonce((n) => n + 1);
            }
          }
        }
      }

      setAddingName("");
      setAddingUnderId(null);
      toast.success(
        inheritedIus
          ? "Classification created; IUS associations copied from parent."
          : "Classification created"
      );

      if (parsed?.ic_nid == null) {
        void loadTree(activeType, newGid || undefined);
        return;
      }

      const newNode: TreeNode = {
        ic_nid: parsed.ic_nid,
        ic_name: icName,
        ic_gid: newGid || null,
        ic_parent_nid: parent?.ic_nid ?? 0,
        ic_type: activeType,
        children: [],
        ic_ius_subtree_union_count: 0,
      };
      const parentKey = parent ? getIcId(parent) : null;
      setTree((prev) => mapTreeInsertChildFirst(prev, parentKey, newNode));
      setExpanded((ex) => {
        const next = new Set(ex);
        if (parentKey) next.add(parentKey);
        return next;
      });
      setSelectedId(getIcId(newNode));
      if (inheritedIus) {
        void loadTree(activeType, getIcId(newNode));
      }
      } finally {
        icAddInFlightRef.current = false;
      }
    },
    [dwId, activeType, loadTree, addingName]
  );

  const openDeleteModal = useCallback((node: TreeNode) => {
    setDeleteRunError(null);
    setNodeToDelete(node);
    setDeleteModalOpen(true);
  }, []);

  const closeDeleteModal = useCallback(() => {
    if (deleteRunning) return;
    setDeleteModalOpen(false);
    setNodeToDelete(null);
    setDeleteRunError(null);
  }, [deleteRunning]);

  const deleteClassificationImpactLines = useMemo(() => {
    return [
      t("DELETE_CLASSIFICATION_IMPACT_IUS_REMOVED"),
      t("DELETE_CLASSIFICATION_IMPACT_RECORD_REMOVED"),
      t("DELETE_CLASSIFICATION_IMPACT_CHILDREN"),
      t("DELETE_CLASSIFICATION_IMPACT_DATA_KEPT"),
    ];
  }, [t]);

  const handleConfirmDelete = useCallback(async () => {
    if (!dwId || !nodeToDelete) return;
    setDeleteRunning(true);
    setDeleteRunError(null);
    const res = await deleteIndicatorClassification(dwId, getIcApiIdentifier(nodeToDelete));
    setDeleteRunning(false);
    if (!res.success) {
      setDeleteRunError(res.err_message ?? "Delete failed");
      return;
    }
    toast.success("Classification deleted");
    setDeleteModalOpen(false);
    setNodeToDelete(null);
    void loadTree(activeType);
  }, [dwId, nodeToDelete, activeType, loadTree]);

  const handleSaveMapping = useCallback(async () => {
    if (!dwId || !selectedNode) return;
    if (!canUpdate) return;
    if (!selectedNodeCanMap) {
      toast.error(
        t(
          "IC_MAPPING_LOWEST_LEVEL_ONLY",
          "Mapping is allowed only at the lowest sub-classification level."
        )
      );
      return;
    }
    const icGid = String(selectedNode.ic_gid ?? "").trim();
    if (!icGid) {
      toast.error("Selected classification has no GID.");
      return;
    }
    setSavingMap(true);
    const pathToIc = findPathToIc(tree, getIcId(selectedNode));
    const parentIc =
      pathToIc && pathToIc.length >= 2 ? pathToIc[pathToIc.length - 2] : null;
    const parentIcGid = parentIc ? String(parentIc.ic_gid ?? "").trim() : "";
    const payload: IcIusMappingItem = { ic_gid: icGid };
    if (parentIcGid) payload.parent_ic_gid = parentIcGid;
    if (assocTab === "ius") {
      payload.i_u_sg_gid = Array.from(checked);
    } else {
      payload.i_u_gid = Array.from(checked);
    }
    const res = await updateIndicatorClassificationIusMapping(dwId, [payload]);
    setSavingMap(false);
    if (!res.success) {
      toast.error(res.err_message ?? "Failed to save mapping");
      return;
    }
    toast.success("Associations updated");
    setBaselineChecked(new Set(checked));
    setMappingRefreshNonce((n) => n + 1);
    void loadTree(activeType);
  }, [dwId, selectedNode, selectedNodeCanMap, assocTab, checked, loadTree, activeType, tree, t, canUpdate]);

  const runExport = useCallback(async () => {
    if (!dwId) return;
    if (assocTab === "iu" || assocTab === "ius") {
      const resp = await downloadIcIusExport(dwId, {
        ic_identifier: selectedNode ? getIcId(selectedNode) : undefined,
        ic_type: activeType || undefined,
      });
      if (!resp.ok) toast.error(resp.message);
      else {
        toast.success("Export started");
        setExportOpen(false);
      }
      return;
    }
    const out = await downloadIndicatorClassificationsExport(dwId, {
      ic_type: activeType || undefined,
      hierarchical: true,
    });
    if (!out.ok) toast.error(out.message);
    else {
      toast.success("Classification export started");
      setExportOpen(false);
    }
  }, [dwId, assocTab, selectedNode, activeType]);

  const runImportTemplateExport = useCallback(async () => {
    if (!dwId) return;
    const resp = await downloadIcIusExport(dwId, {
      ic_identifier: selectedNode ? getIcId(selectedNode) : undefined,
      ic_type: activeType || undefined,
    });
    if (!resp.ok) {
      toast.error(resp.message);
      return;
    }
    toast.success("Template download started");
  }, [dwId, selectedNode, activeType]);

  const handleIcIusImport = useCallback(
    async ({ file, format }: FileImportSubmitPayload) => {
      if (!file) {
        toast.error(t("FILE_REQUIRED", "Please select a file to import."));
        throw new Error("ic-ius-import-missing-file");
      }
      const targetDwId = String(dwId ?? "").trim();
      if (!targetDwId) {
        toast.error(t("DATA_WAREHOUSE_REQUIRED", "Data warehouse context is missing."));
        throw new Error("ic-ius-import-missing-dw");
      }
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const mime = String(file.type ?? "").toLowerCase();
      const looksCsv = ext === "csv" || mime.includes("csv") || mime.includes("text/plain");
      const looksXlsx =
        ext === "xlsx" ||
        mime.includes("spreadsheetml") ||
        mime.includes("officedocument");
      const chosenLooksValid =
        (format === "csv" && looksCsv) || (format === "xlsx" && looksXlsx);
      if (!chosenLooksValid && !looksCsv && !looksXlsx) {
        toast.error(
          t(
            "IMPORT_CSV_XLSX_ONLY",
            "Upload a CSV or XLSX file in the same format as the export file."
          )
        );
        throw new Error("ic-ius-import-format");
      }
      const fd = new FormData();
      fd.append("file", file);
      const json = (await postRequest(
        getDWAPIURL(targetDwId, REFERENCE_PATH_IC_IUS_IMPORT),
        fd,
        undefined,
        undefined,
        { suppressErrorMessage: true }
      )) as {
        success?: boolean;
        message?: string;
        err_message?: string;
      };
      if (json.success !== true) {
        const err =
          typeof json.err_message === "string" && json.err_message.trim()
            ? json.err_message
            : typeof json.message === "string" && json.message.trim()
              ? json.message
              : "Failed to import IC-IUS mappings.";
        toast.error(err);
        throw new Error("ic-ius-import-failed");
      }
      toast.success(
        typeof json.message === "string" && json.message.trim()
          ? json.message
          : "IC-IUS mappings imported successfully."
      );
      setMappingRefreshNonce((n) => n + 1);
      await loadTree(activeType);
    },
    [dwId, t, loadTree, activeType]
  );

  useEffect(() => {
    setFileImportSubmitHandler(handleIcIusImport);
    return () => setFileImportSubmitHandler(null);
  }, [handleIcIusImport, setFileImportSubmitHandler]);

  useEffect(() => {
    setFileImportTemplateHandler(runImportTemplateExport);
    return () => setFileImportTemplateHandler(null);
  }, [runImportTemplateExport, setFileImportTemplateHandler]);

  const dirtyAssocCount = useMemo(() => {
    let n = 0;
    for (const id of checked) {
      if (!baselineChecked.has(id)) n += 1;
    }
    for (const id of baselineChecked) {
      if (!checked.has(id)) n += 1;
    }
    return n;
  }, [checked, baselineChecked]);

  const savedMappedCount = baselineChecked.size;

  const breadcrumbPath = useMemo(
    () => (selectedId ? findPathToIc(tree, selectedId) : null),
    [tree, selectedId]
  );

  useEffect(() => {
    const el = headerSelectAllRef.current;
    if (!el) return;
    if (!selectedNode) {
      el.indeterminate = false;
      return;
    }
    const all = assocRows.length > 0 && assocRows.every((r) => checked.has(r.id));
    const some = assocRows.some((r) => checked.has(r.id));
    el.indeterminate = !all && some;
  }, [assocRows, checked, selectedNode]);

  const commitRename = useCallback(
    async (node: TreeNode, rawName: string) => {
      const next = rawName.trim();
      setRenamingId(null);
      if (!dwId || !next || next === getIcName(node)) return;
      setSavingNodeId(getIcId(node));
      const res = await updateIndicatorClassification(dwId, getIcApiIdentifier(node), { ic_name: next });
      setSavingNodeId("");
      if (!res.success) {
        toast.error(res.err_message ?? "Failed to rename classification");
        return;
      }
      toast.success("Classification updated");
      void loadTree(activeType);
    },
    [dwId, activeType, loadTree]
  );

  /** Same left inset as tree rows (`renderTreeNodes`). */
  function treeRowInsetLeft(depth: number): number {
    return 8 + depth * 18;
  }

  function renderGhostRow(depth: number, parentKey: string, label: string): ReactElement {
    const inset = treeRowInsetLeft(depth);
    if (addingUnderId === parentKey) {
      return (
        <div
          key={`ghost-active-${parentKey}`}
          className="mx-1 flex min-w-0 items-center gap-0.5 py-0.5 pr-2"
          style={{ paddingLeft: `${inset}px` }}
        >
          <span className="inline-flex h-6 w-5 shrink-0 items-center justify-center" aria-hidden />
          <input
            autoFocus
            value={addingName}
            onChange={(e) => setAddingName(e.target.value)}
            onBlur={() => {
              if (!addingName.trim()) {
                setAddingUnderId(null);
                return;
              }
              const parent =
                parentKey === "root"
                  ? undefined
                  : (flattenTree(tree).find((n) => getIcId(n) === parentKey) ?? undefined);
              void handleAddNode(parent);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const parent =
                  parentKey === "root"
                    ? undefined
                    : (flattenTree(tree).find((n) => getIcId(n) === parentKey) ?? undefined);
                void handleAddNode(parent);
              } else if (e.key === "Escape") {
                setAddingUnderId(null);
                setAddingName("");
              }
            }}
            className="h-7 min-w-0 flex-1 rounded border border-primary/40 bg-surface px-2 text-xs outline-none focus:border-primary"
            placeholder={t("NAME")}
          />
        </div>
      );
    }
    const ghostFocusKey = `ghost:${parentKey}`;
    const ghostTabIndex =
      icTreeFocusKey === ghostFocusKey
        ? 0
        : icTreeFocusKey == null && ghostFocusKey === "ghost:root"
          ? 0
          : -1;
    return (
      <div key={`ghost-wrap-${parentKey}`} className="mx-1 min-w-0 py-1">
        <button
          type="button"
          data-ic-tree-focus-key={ghostFocusKey}
          tabIndex={ghostTabIndex}
          ref={(el) => {
            if (el) icTreeFocusElRef.current.set(ghostFocusKey, el);
            else icTreeFocusElRef.current.delete(ghostFocusKey);
          }}
          className={`add-row-prompt-btn min-h-[32px] gap-1.5 focus-visible:shadow-[var(--shadow-focus-ring)]${!canCreate ? " opacity-50 cursor-not-allowed" : ""}`}
          style={{ paddingLeft: `${inset}px` }}
          disabled={!canCreate}
          title={!canCreate ? t("NO_PERMISSION_CREATE") : undefined}
          onClick={() => {
            if (!canCreate) return;
            setIcTreeFocusKey(ghostFocusKey);
            setAddingUnderId(parentKey);
            setAddingName("");
            if (parentKey !== "root") {
              setExpanded((prev) => new Set(prev).add(parentKey));
            }
          }}
        >
          <Mi name="add_circle_outline" className="!text-sm shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      </div>
    );
  }

  function renderTreeNodes(nodes: TreeNode[], depth: number, parentGhostKey: string): ReactElement[] {
    const typeLabel = types.find((t) => t.code === activeType)?.label ?? "item";
    const out: ReactElement[] = [];
    out.push(
      renderGhostRow(
        depth,
        parentGhostKey,
        parentGhostKey === "root" ? `${t("ADD")} ${typeLabel}` : t("IC_ADD_SUB_ITEM")
      )
    );
    for (const node of nodes) {
      const id = getIcId(node);
      const childList = node.children ?? [];
      const isOpen = expanded.has(id);
      const isSelected = selectedId === id;
      const isRenaming = renamingId === id;
      const nodeFocusKey = `node:${id}`;
      out.push(
        <div key={id}>
          <div
            data-ic-tree-focus-key={nodeFocusKey}
            tabIndex={icTreeFocusKey === nodeFocusKey ? 0 : -1}
            ref={(el) => {
              if (el) icTreeFocusElRef.current.set(nodeFocusKey, el);
              else icTreeFocusElRef.current.delete(nodeFocusKey);
            }}
            className={[
              "group flex items-center gap-0.5 px-2 py-1.5 text-xs leading-tight cursor-pointer outline-none",
              "transition-colors duration-75",
              "focus-visible:shadow-[var(--shadow-focus-ring)]",
              /* Match .tbl-wrap tbody tr:hover / .selected background */
              "hover:bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))]",
              "focus-visible:bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))]",
              isSelected
                ? "bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))] text-primary"
                : "",
            ].join(" ")}
            style={{ paddingLeft: `${8 + depth * 18}px` }}
            onClick={() => {
              if (renamingId !== null || addingUnderId !== null) return;
              setIcTreeFocusKey(nodeFocusKey);
              setSelectedId(id);
            }}
          >
            <ExpandChevronButton
              expanded={isOpen}
              iconClassName={
                isSelected ? "!text-primary" : "text-text-muted"
              }
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              }}
              expandAriaLabel="Expand"
              collapseAriaLabel="Collapse"
            />
            {isRenaming ? (
              <input
                autoFocus
                className="min-w-0 flex-1 rounded border border-primary/40 bg-surface px-1.5 py-0.5 text-xs outline-none focus:border-primary"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  void commitRename(node, e.currentTarget.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitRename(node, (e.currentTarget as HTMLInputElement).value);
                  } else if (e.key === "Escape") {
                    setRenamingId(null);
                  }
                }}
              />
            ) : (
              <span
                className={`truncate flex-1${canUpdate ? "" : " cursor-default"}`}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (!canUpdate) return;
                  setRenamingId(id);
                  setRenameDraft(getIcName(node));
                  setAddingUnderId(null);
                }}
              >
                {getIcName(node)}
              </span>
            )}
            {!isRenaming ? (
              <span
                className={`shrink-0 rounded px-1 py-px text-xs font-semibold leading-none tabular-nums ${
                  getIcTreeBadgeCount(node) > 0 ? "bg-primary/15 text-primary" : "text-text-muted"
                }`}
                title={`${getIcTreeBadgeCount(node)} IUS (subtree)`}
              >
                {getIcTreeBadgeCount(node)}
              </span>
            ) : null}
            {!isRenaming ? (
              <div
                className="pointer-events-none flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className={`btn-comp-secondary !h-6 !w-6 !min-w-6 !p-0 !gap-0 !shadow-none${!canUpdate ? " opacity-50 cursor-not-allowed" : ""}`}
                  disabled={!canUpdate}
                  onClick={() => {
                    if (!canUpdate) return;
                    setRenamingId(id);
                    setRenameDraft(getIcName(node));
                    setAddingUnderId(null);
                  }}
                  title={!canUpdate ? t("NO_PERMISSION_UPDATE") : t("COMMON_EDIT")}
                  aria-label={t("COMMON_EDIT")}
                >
                  <Mi name="edit" className="!text-sm" />
                </button>
                <button
                  type="button"
                  className={`btn-comp-secondary !h-6 !w-6 !min-w-6 !p-0 !gap-0 !shadow-none text-error hover:!text-error${!canDelete ? " opacity-50 cursor-not-allowed" : ""}`}
                  disabled={!canDelete}
                  onClick={() => {
                    if (!canDelete) return;
                    openDeleteModal(node);
                  }}
                  title={!canDelete ? t("NO_PERMISSION_DELETE") : "Delete"}
                >
                  <Mi name={savingNodeId === id ? "hourglass_top" : "delete_outline"} className="!text-sm" />
                </button>
              </div>
            ) : null}
          </div>
          {isOpen ? renderTreeNodes(childList, depth + 1, id) : null}
        </div>
      );
    }
    return out;
  }

  if (!allowed) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-muted">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 shrink-0 flex-col border-r border-border bg-surface" style={{ width: leftWidth }}>
          <div className="bc-main-tabs !gap-2">
            <div className="scrollbar-hide flex min-h-0 min-w-0 flex-1 items-center gap-5 overflow-x-auto">
              <MainTabsBar
                variant="buttonsOnly"
                tabs={types.map((ty) => ({
                  value: ty.code,
                  label: ty.label,
                  tabClassName: "shrink-0",
                }))}
                activeValue={activeType}
                onSelect={setActiveType}
              />
            </div>
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
          <div className="flex h-11 shrink-0 items-center border-b border-border px-5">
            <SearchInputBar
              embedded
              wrapperClassName="w-full min-w-0"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("SEARCH_CLASSIFICATIONS")}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto" data-ic-classification-tree>
            {loading ? (
              <div className="p-3 text-xs text-text-muted">{t("LOADING")}</div>
            ) : null}
            {!loading && filteredTree.length === 0 ? (
              <div className="p-3 text-xs italic text-text-muted">
                {search.trim()
                  ? "No classifications match your search."
                  : `This type is empty. Add the first ${types.find((x) => x.code === activeType)?.label ?? "item"} below.`}
              </div>
            ) : null}
            {!loading ? renderTreeNodes(filteredTree, 0, "root") : null}
          </div>
        </div>
        <div
          className="w-1 cursor-col-resize bg-border/70 hover:bg-primary/40"
          onMouseDown={(e) => {
            const startX = e.clientX;
            const startW = leftWidth;
            const onMove = (ev: MouseEvent) => setLeftWidth(Math.max(260, Math.min(520, startW + ev.clientX - startX)));
            const onUp = () => {
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
        />
        <div className="flex min-h-0 flex-1 flex-col bg-surface">
          <MainTabsBar
            tabs={[
              { value: "ius", label: "IUS", icon: "dashboard" },
              { value: "iu", label: "IU", icon: "analytics" },
            ]}
            activeValue={assocTab}
            onSelect={setAssocTab}
          />

          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-surface-muted/40 px-5">
            {!selectedNode ? (
              <>
                <span className="text-xs text-text-muted">← Select a node on the left to map IUS</span>
                <div className="flex-1" />
                <PrimarySaveButton disabled className="shrink-0">
                  {t("SAVE", "Save")}
                </PrimarySaveButton>
              </>
            ) : (
              <>
                <span className="shrink-0 rounded-md border border-border bg-surface px-2 py-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {types.find((t) => t.code === activeType)?.label ?? activeType}
                </span>
                <div className="flex min-w-0 flex-wrap items-center gap-0.5 text-xs text-text">
                  {breadcrumbPath?.map((seg, i) => {
                    const last = i === (breadcrumbPath?.length ?? 0) - 1;
                    return (
                      <span key={`${getIcId(seg)}-${i}`} className="flex items-center gap-0.5">
                        {i > 0 ? <span className="text-text-muted p-1">›</span> : null}
                        <span className={last ? "font-semibold text-text" : "text-text-muted"}>{getIcName(seg)}</span>
                      </span>
                    );
                  })}
                </div>
                <div className="flex-1" />
                {!selectedNodeCanMap ? (
                  <div ref={parentNodeHintRef} className="relative shrink-0">
                    <button
                      ref={parentNodeHintButtonRef}
                      type="button"
                      className="btn-comp-ghost--warning"
                      aria-label="Show mapping warning"
                      aria-expanded={parentNodeHintOpen}
                      onClick={toggleParentNodeHint}
                    >
                      <Mi name="warning_amber" className="!text-sm" />
                    </button>
                    {parentNodeHintOpen && parentNodeHintPos ? (
                      <div
                        role="tooltip"
                        className="fixed z-[1200] w-[320px] max-w-[min(85vw,320px)] rounded-md border border-[color:color-mix(in_srgb,var(--color-warning)_35%,var(--color-border))] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,var(--color-surface))] px-3 py-2 text-xs text-[color:color-mix(in_srgb,var(--color-warning)_72%,var(--color-text))] shadow-lg"
                        style={{ top: parentNodeHintPos.top, left: parentNodeHintPos.left }}
                      >
                        {parentNodeMappingHint}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {dirtyAssocCount > 0 ? (
                  <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-border bg-[#f3f4f6] px-2.5 text-xs font-semibold text-[#4b5563]">
                    <span>{dirtyAssocCount}</span>
                    <span className="ml-1">selected</span>
                  </span>
                ) : null}
                <PrimarySaveButton
                  className="shrink-0"
                  disabled={
                    !selectedNode ||
                    !selectedNodeCanMap ||
                    savingMap ||
                    dirtyAssocCount === 0 ||
                    !canUpdate
                  }
                  title={!canUpdate ? t("NO_PERMISSION_UPDATE") : undefined}
                  onClick={() => void handleSaveMapping()}
                >
                  {savingMap ? "Saving…" : t("SAVE", "Save")}
                </PrimarySaveButton>
              </>
            )}
          </div>

          {selectedNode ? (
            <div className="flex min-h-0 flex-1 flex-col" data-ic-assoc-grid>
            <InlineEditableTable
              scrollRef={icAssocScrollRef}
              loading={assocIndLoading}
              wrapClassName="tbl-wrap"
              scrollClassName="tbl-scroll"
              thead={
                <thead>
                  <EditableDataGridThead columns={assocGridColumns} />
                </thead>
              }
              tbody={
                <ServerDrivenListTbody<IcAssocGridRow>
                  colSpan={4}
                  rows={assocRows}
                  columns={assocGridColumns}
                  getRowId={icAssocRowId}
                  activeRowId={assocActiveRowId}
                  editingRowId={null}
                  getRowClassName={(row) => {
                    const inBase = baselineChecked.has(row.id);
                    const inCur = checked.has(row.id);
                    const rowPending = inBase !== inCur;
                    if (inBase && inCur) return "bg-primary/5";
                    if (rowPending && inCur) return "bg-amber-50/80 dark:bg-amber-950/20";
                    if (rowPending && !inCur) return "bg-orange-50/60 dark:bg-orange-950/15";
                    return "";
                  }}
                  showLoadingRow={false}
                  showEmptyRow={!assocIndLoading && assocRows.length === 0}
                  showDataRows={!assocIndLoading && assocRows.length > 0}
                  emptyMessage={t("IC_NO_INDICATORS_ON_PAGE")}
                />
              }
              pagination={{
                page: assocListPage,
                totalPages:
                  assocViewMeta == null
                    ? 1
                    : assocViewMeta.hasNextPage
                      ? 0
                      : Math.max(1, assocListPage),
                totalCount: 0,
                pageSize: assocPageSize,
                onPageChange: setAssocListPage,
                onPageSizeChange: setAssocPageSize,
                pageSizes: IC_ASSOC_PAGE_SIZES,
                countNoun: t("RECORDS"),
                showTotalCount: false,
                hasNextPage:
                  assocViewMeta == null
                    ? false
                    : assocViewMeta.hasNextPage
                      ? true
                      : undefined,
                labels: { t, rowsPerPage: "Indicators per page" },
                renderPageSummary: assocViewMeta?.hasNextPage
                  ? (p) => <>{t("PAGE").replace("{page}", String(p))}</>
                  : (p) => (
                      <>
                        {t("PAGE_OF")
                          .replace("{page}", String(p))
                          .replace("{pages}", String(Math.max(1, assocListPage)))}
                      </>
                    ),
                afterPageSizeSlot: (
                  <>
                    <span className="text-text-muted">
                      {assocWarehouseRecordCount != null
                        ? formatGridFooterTotalCount(
                            assocWarehouseRecordCount,
                            assocWarehouseRecordCountUnfiltered,
                            t,
                            "FOOTER_OF_TOTAL_RECORDS"
                          )
                        : `— ${t("RECORDS")}`}
                    </span>
                    <span className="hidden sm:inline text-border">·</span>
                    <span id="footer-count">
                      {t("MAPPED")}:{" "}
                      <strong
                        className={
                          savedMappedCount > 0 ? "text-primary" : "text-text-muted"
                        }
                      >
                        {savedMappedCount}
                      </strong>
                      <span className="font-normal text-text-muted"> </span>
                    </span>
                  </>
                ),
              }}
            />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 py-16 text-center text-sm italic text-text-muted">
              {t("IC_SELECT_NODE_TO_VIEW")}
            </div>
          )}
        </div>
      </div>

      <DeletePermanentConfirmModal
        open={deleteModalOpen && !!nodeToDelete}
        onClose={closeDeleteModal}
        title={t("DELETE_CLASSIFICATION")}
        titleId="dm-ic-delete-title"
        dismissDisabled={deleteRunning}
        closeAriaLabel={t("CLOSE")}
        cancelLabel={t("CANCEL")}
        onCancel={closeDeleteModal}
        confirmLabel={t("DELETE_PERMANENTLY")}
        confirmLoadingLabel={t("DELETING")}
        confirmLoading={deleteRunning}
        onConfirm={handleConfirmDelete}
        impact={{
          title: t("IMPACT"),
          lines: deleteClassificationImpactLines,
        }}
        runError={deleteRunError}
      >
        {nodeToDelete ? (
          <>
            <p className="modal-lead">
              {t("DELETE_CLASSIFICATION_WARNING")}
            </p>
            <ul className="modal-list">
              <li>
                <span className="modal-list-name">{getIcName(nodeToDelete)}</span>
                {nodeToDelete.ic_gid ? (
                  <span className="modal-list-meta">{String(nodeToDelete.ic_gid)}</span>
                ) : null}
              </li>
            </ul>
          </>
        ) : null}
      </DeletePermanentConfirmModal>

      <GidManagerDrawer
        open={gidDrawerOpen}
        onClose={() => setGidDrawerOpen(false)}
        gidColumnLabel={t("ID", "ID")}
        rows={flattenTree(tree).map((node) => ({
          id: getIcId(node),
          name: getIcName(node),
          gid: String(node.ic_gid ?? ""),
        }))}
        onSaveName={
          canUpdate
            ? async (rowId, nextName) => {
                const node = flattenTree(tree).find((n) => getIcId(n) === rowId);
                if (!node) return { success: false, err_message: "Row not found" };
                return updateIndicatorClassification(dwId, getIcApiIdentifier(node), { ic_name: nextName });
              }
            : undefined
        }
        onSaveGid={
          canUpdate
            ? async (rowId, nextGid) => {
                const node = flattenTree(tree).find((n) => getIcId(n) === rowId);
                if (!node) return { success: false, err_message: "Row not found" };
                return updateIndicatorClassification(dwId, getIcApiIdentifier(node), { ic_gid: nextGid });
              }
            : undefined
        }
        onAfterSave={() => void loadTree(activeType)}
      />

      {exportOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onClick={() => setExportOpen(false)}>
          <div className="w-[520px] rounded-lg border border-border bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 text-sm font-semibold">{t("EXPORT_DATA")}</div>
            <div className="text-xs text-text-muted">
              {t("EXPORT_CLASSIFICATION_DATA_DESC")}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <SecondaryButton type="button" onClick={() => setExportOpen(false)}>
                {t("CANCEL")}
              </SecondaryButton>
              <PrimaryButton type="button" icon="download" onClick={() => void runExport()}>
                {t("EXPORT")}
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
