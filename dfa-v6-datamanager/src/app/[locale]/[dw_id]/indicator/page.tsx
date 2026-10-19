"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type UIEvent,
} from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { useCore } from "@/contexts/CoreContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { useDwCrudPermissions } from "@/hooks/useDwCrudPermissions";
import { useDwPermissionGuard } from "@/hooks/useDwPermissionGuard";
import { useSubgroupPickerList } from "@/hooks/useSubgroupPickerList";
import { useUnitPickerList } from "@/hooks/useUnitPickerList";
import { DW_ROUTE_PERMISSIONS } from "@/lib/auth/user";
import {
  deleteRequest,
  getFileResponse,
  getRequest,
  patchRequest,
  postRequest,
} from "@/lib/api/http";
import type {
  BulkCreateSgCategoryValueItem,
  BulkCreateSgCategoryValuesError,
  BulkCreateSgCategoryValuesResult,
  BulkCreateSgCategoryValuesSuccess,
  CreateIndicatorMetaError,
  CreateIndicatorPayload,
  CreateIndicatorsError,
  CreateIndicatorsResponse,
  CreateIndicatorsResult,
  CreateSubgroupCombinationItem,
  CreateSubgroupCombinationsError,
  CreateSubgroupCombinationsResult,
  CreateSubgroupCombinationsSuccess,
  CreateUnitPayload,
  CreateUnitsError,
  CreateUnitsResponse,
  CreateUnitsResult,
  DeleteIndicatorResult,
  ExportIndicatorsParams,
  FetchIndicatorsParams,
  GetIndicatorByIdOptions,
  GetIndicatorError,
  GetIndicatorResponse,
  GetIndicatorResult,
  IndicatorAssociationCountsData,
  IndicatorAssociationCountsResult,
  IndicatorListItem,
  IndicatorMetadataUpdateItem,
  IndicatorsListError,
  IndicatorsListMeta,
  IndicatorsListResponse,
  IndicatorsListResult,
  IusUpsertBody,
  IusUpsertError,
  IusUpsertResponse,
  IusUpsertResult,
  SubgroupRaw,
  UnitRaw,
  UpdateIndicatorMetadataResult,
  UpsertIndicatorValidationRulesResult,
  ValidationRuleUpsertPayload,
} from "@/lib/api/types";
import { getUnitGid, getUnitName } from "@/lib/api/units";
import {
  API_KEY_FORMAT,
  DEFAULT_IUS_SUBGROUP_GID,
  getDWAPIURL,
  REFERENCE_PATH_INDICATORS,
  REFERENCE_PATH_IUS,
  REFERENCE_PATH_SG_CATEGORIES_VALUES,
  REFERENCE_PATH_SUBGROUPS,
  REFERENCE_PATH_UNITS,
  SUBGROUP_OTHERS_TYPE_GID,
} from "@/lib/constants";
import { normalizeIndicator } from "@/lib/datamanager/indicatorAdapter";
import { parseListMetaTotals } from "@/lib/gridListMeta";
import type { Indicator } from "@/lib/api/types";
import { GridInlineTextField } from "@/components/gridEditableTextCell";
import { gridTextFieldClassName, shellTextFieldClassName } from "@/components/TextField";
import { SearchableListCombobox } from "@/components/SearchableListCombobox";
import { DEFAULT_TABLE_PAGE_SIZES } from "@/components/TablePaginationFooter";
import {
  dataIusAssociationImpactLines,
  DeletePermanentConfirmModal,
} from "@/components/DeletePermanentConfirmModal";
import { Modal } from "@/components/Modal";
import { ModalCloseButton } from "@/components/ModalCloseButton";
import { Loader } from "@/components/Loader";
import { MainTabsBar } from "@/components/MainTabsBar";
import { PrimarySaveButton } from "@/components/PrimarySaveButton";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import {
  EditableDataGridThead,
  ServerDrivenListTbody,
  ServerDrivenTable,
  TV_ROW_NEWLY_ADDED_CLASS,
  useServerListQuery,
  type ServerDrivenListAddRowField,
  type ServerListParseResult,
} from "@/components/TableView";
import {
  TV_COL_KEY_HIGH,
  TV_COL_PRIMARY_STICKY_TD,
  TV_COL_SELECT_TD,
} from "@/components/editableGridColumnClasses";
import {
  useIndicatorTableColumns,
  type HighIsGoodFilter,
} from "./indicatorGridColumns";
import type {
  IndicatorTableRow,
  InlineEditFocusField,
  InlineEditModel,
} from "./indicatorTableShared";
import {
  IndicatorComputeTab,
  type IndicatorComputeTabHandle,
} from "./IndicatorComputeTab";
import {
  IndicatorMetadataTab,
  type IndicatorMetadataTabHandle,
} from "./IndicatorMetadataTab";
import {
  IndicatorValidationTab,
  type IndicatorValidationTabHandle,
} from "./IndicatorValidationTab";

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

function isIndicatorsListResponse(
  r: IndicatorsListResult
): r is IndicatorsListResponse {
  return r.success === true && Array.isArray((r as IndicatorsListResponse).data);
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

/**
 * GET indicators with export=true — returns XLSX (StreamingResponse).
 * Triggers a browser download. Call only in client components.
 */
async function downloadIndicatorsExport(
  dwId: string,
  params: ExportIndicatorsParams = {}
): Promise<{ ok: true } | { ok: false; message: string }> {
  const searchParams = new URLSearchParams();
  searchParams.set("export", "true");
  appendIndicatorsQuery(searchParams, params);

  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_INDICATORS)}?${searchParams.toString()}`;

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
  let filename = "indicators_export.xlsx";
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

function serializeCreatePayload(item: CreateIndicatorPayload): Record<string, unknown> {
  if (API_KEY_FORMAT === "external") {
    const body: Record<string, unknown> = {
      i_name: item.indicator_name,
      i_high_is_good: item.highisgood ?? false,
    };
    if (item.unit_gid?.length) body.u_gid = item.unit_gid;
    if (item.subgroup_val_gid?.length) body.sg_gid = item.subgroup_val_gid;
    return body;
  }
  const body: Record<string, unknown> = {
    indicator_name: item.indicator_name,
    highisgood: item.highisgood ?? false,
  };
  if (item.unit_gid?.length) body.unit_gid = item.unit_gid;
  if (item.subgroup_val_gid?.length) body.subgroup_val_gid = item.subgroup_val_gid;
  return body;
}

function getCreateIndicatorsMetaErrorMessages(
  meta: CreateIndicatorsResponse["meta"] | undefined
): string[] {
  const raw = meta?.errors as unknown[] | undefined;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw
    .map((e: unknown) => {
      if (e == null) return "";
      if (typeof e === "string") return e.trim();
      if (typeof e === "object" && e !== null && "error" in e) {
        const err = (e as CreateIndicatorMetaError).error;
        return typeof err === "string" ? err.trim() : "";
      }
      return "";
    })
    .filter(Boolean);
}

async function createIndicators(
  dwId: string,
  data: CreateIndicatorPayload[]
): Promise<CreateIndicatorsResult> {
  const url = getDWAPIURL(dwId, REFERENCE_PATH_INDICATORS);
  const body = data.map(serializeCreatePayload);
  const json = (await postRequest(
    url,
    body,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as CreateIndicatorsResponse | CreateIndicatorsError;
  if ((json as CreateIndicatorsResponse).success === true) {
    return json as CreateIndicatorsResponse;
  }
  return json as CreateIndicatorsError;
}

async function getIndicatorById(
  dwId: string,
  identifier: string,
  options?: GetIndicatorByIdOptions
): Promise<GetIndicatorResult> {
  let metadata = false;
  let subgroup = false;
  let subgroupComputeFormula = false;
  if (typeof options === "object" && options !== null) {
    metadata = options.metadata === true;
    subgroup = options.subgroup === true;
    subgroupComputeFormula = options.subgroupComputeFormula === true;
  }

  const params = new URLSearchParams();
  if (metadata) params.set("metadata", "true");
  if (subgroup) params.set("subgroup", "true");
  if (subgroupComputeFormula) params.set("subgroup_compute_formula", "true");
  const q = params.toString();
  const url = `${getDWAPIURL(dwId, `${REFERENCE_PATH_INDICATORS}/${encodeURIComponent(identifier)}`)}${q ? `?${q}` : ""}`;
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as GetIndicatorResponse | GetIndicatorError;
  if ((json as GetIndicatorResponse).success === true) {
    return json as GetIndicatorResponse;
  }
  if ((json as GetIndicatorError).success === false) {
    return json as GetIndicatorError;
  }
  const err = json as GetIndicatorError;
  return {
    success: false,
    err_message: err.err_message ?? "Request failed",
    errors: err.errors,
  };
}

async function updateIndicator(
  dwId: string,
  identifier: string,
  body: Record<string, unknown>
): Promise<
  | { success: true; data?: Record<string, unknown> }
  | { success: false; err_message?: string; errors?: Record<string, unknown> }
> {
  const url = getDWAPIURL(
    dwId,
    `${REFERENCE_PATH_INDICATORS}/${encodeURIComponent(identifier)}`
  );
  const json = await patchRequest(
    url,
    body,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  );
  return json as
    | { success: true; data?: Record<string, unknown> }
    | { success: false; err_message?: string; errors?: Record<string, unknown> };
}

async function fetchIndicatorAssociationCounts(
  dwId: string,
  indicatorIdentifiers: string[]
): Promise<IndicatorAssociationCountsResult> {
  const params = new URLSearchParams();
  if (indicatorIdentifiers.length > 0) {
    params.set("identifier", indicatorIdentifiers.join(","));
  }
  const q = params.toString();
  const url = `${getDWAPIURL(dwId, `${REFERENCE_PATH_INDICATORS}/association-count`)}${q ? `?${q}` : ""}`;
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success === false) {
    return {
      success: false,
      err_message: (json.err_message as string | undefined) ?? "Request failed",
      errors: json.errors as Record<string, unknown> | undefined,
    };
  }
  if (json.success === true && json.data && typeof json.data === "object") {
    const d = json.data as Record<string, unknown>;
    return {
      success: true,
      message: json.message as string | undefined,
      data: {
        data_count: Number(d.data_count) || 0,
        ius_count: Number(d.ius_count) || 0,
      },
    };
  }
  return {
    success: false,
    err_message: (json.err_message as string) ?? "Invalid association-count response",
    errors: json.errors as Record<string, unknown> | undefined,
  };
}

async function deleteIndicator(
  dwId: string,
  identifier: string
): Promise<DeleteIndicatorResult> {
  const url = getDWAPIURL(
    dwId,
    `${REFERENCE_PATH_INDICATORS}/${encodeURIComponent(identifier)}`
  );
  const json = (await deleteRequest(url, undefined, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success === false) {
    return {
      success: false,
      err_message: json.err_message as string | undefined,
      status: json.status as number | undefined,
      errors: json.errors as Record<string, unknown> | undefined,
    };
  }
  return { success: true };
}

type DeleteIndicatorsMultipleOk = {
  success: true;
  data: { deleted: number[] };
  meta?: {
    errors?: Array<{
      index?: number;
      indicator_nid?: number;
      error?: string;
    }>;
  };
};

type DeleteIndicatorsMultipleErr = {
  success: false;
  err_message?: string;
};

async function deleteIndicatorsMultiple(
  dwId: string,
  indicatorNids: number[]
): Promise<DeleteIndicatorsMultipleOk | DeleteIndicatorsMultipleErr> {
  const url = getDWAPIURL(
    dwId,
    `${REFERENCE_PATH_INDICATORS}/multiple-delete`
  );
  const json = (await postRequest(
    url,
    { indicator_nid: indicatorNids },
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as Record<string, unknown>;
  if (json.success === false) {
    return {
      success: false,
      err_message:
        typeof json.err_message === "string" ? json.err_message : undefined,
    };
  }
  const d = json.data as Record<string, unknown> | undefined;
  const deletedRaw = d?.deleted;
  const deleted = Array.isArray(deletedRaw)
    ? deletedRaw
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n))
    : [];
  return {
    success: true,
    data: { deleted },
    meta: json.meta as DeleteIndicatorsMultipleOk["meta"],
  };
}

async function upsertIus(
  dwId: string,
  body: IusUpsertBody
): Promise<IusUpsertResult> {
  const url = getDWAPIURL(dwId, REFERENCE_PATH_IUS);
  const json = (await postRequest(
    url,
    body as unknown as Record<string, unknown>,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as IusUpsertResponse | IusUpsertError;
  if ((json as IusUpsertResponse).success === true) {
    return json as IusUpsertResponse;
  }
  return json as IusUpsertError;
}

function getSubgroupGid(s: SubgroupRaw): string | null {
  const gid = s.sg_gid ?? s.subgroup_val_gid ?? s.sv_gid ?? null;
  return gid != null && gid !== "" ? gid : null;
}

function getSubgroupName(s: SubgroupRaw): string {
  return (
    (s.sg_name ?? s.subgroup_val ?? s.sv_name ?? s.sg_gid ?? s.subgroup_val_gid ?? s.sv_gid ?? "") ||
    ""
  );
}

function serializeCreateUnitBody(items: CreateUnitPayload[]): unknown[] {
  if (API_KEY_FORMAT === "external") {
    return items.map((p) => {
      const o: Record<string, unknown> = { u_name: p.unit_name };
      if (p.unit_gid != null && p.unit_gid !== "") o.u_gid = p.unit_gid;
      if (p.unit_global === true) o.u_is_global = true;
      return o;
    });
  }
  return items.map((p) => {
    const o: Record<string, unknown> = { unit_name: p.unit_name };
    if (p.unit_gid != null && p.unit_gid !== "") o.unit_gid = p.unit_gid;
    if (p.unit_global === true) o.unit_global = true;
    return o;
  });
}

async function createUnits(
  dwId: string,
  data: CreateUnitPayload[]
): Promise<CreateUnitsResult> {
  const url = getDWAPIURL(dwId, REFERENCE_PATH_UNITS);
  const json = (await postRequest(
    url,
    serializeCreateUnitBody(data),
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as CreateUnitsResponse | CreateUnitsError;
  if ((json as CreateUnitsResponse).success === true) {
    return json as CreateUnitsResponse;
  }
  return json as CreateUnitsError;
}

function indicatorMetadataUpdateWireItems(
  items: IndicatorMetadataUpdateItem[]
): Record<string, string>[] {
  if (API_KEY_FORMAT === "external") {
    return items.map(({ mt_catg_gid, metadata_text }) => ({
      mt_catg_gid,
      mt_rpt_metadata: metadata_text,
    }));
  }
  return items.map(({ mt_catg_gid, metadata_text }) => ({
    mt_catg_gid,
    metadata_text,
  }));
}

async function updateIndicatorMetadata(
  dwId: string,
  indicatorIdentifier: string,
  items: IndicatorMetadataUpdateItem[]
): Promise<UpdateIndicatorMetadataResult> {
  const url = getDWAPIURL(
    dwId,
    `${REFERENCE_PATH_INDICATORS}/${encodeURIComponent(indicatorIdentifier)}/metadata`
  );
  const json = (await patchRequest(
    url,
    { update_items: indicatorMetadataUpdateWireItems(items) },
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as {
    success?: boolean;
    data?: Record<string, unknown>;
    meta?: { errors?: unknown[] };
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
  return { success: true, data: json.data, meta: json.meta };
}

async function upsertIndicatorValidationRules(
  dwId: string,
  indicatorIdentifier: string,
  payload: ValidationRuleUpsertPayload
): Promise<UpsertIndicatorValidationRulesResult> {
  const url = getDWAPIURL(
    dwId,
    `${REFERENCE_PATH_INDICATORS}/${encodeURIComponent(indicatorIdentifier)}/validation-rules`
  );
  const body: Record<string, unknown> = {
    unit_gids: payload.unit_gids,
    validation_type: payload.validation_type,
    options: payload.options.map((o) => {
      const row: Record<string, unknown> = {
        option_code: o.option_code,
        score: o.score ?? null,
        display_order: o.display_order ?? 0,
        is_active: o.is_active !== false,
      };
      if (o.labels != null) {
        row.labels = o.labels;
      } else {
        row.label = o.label ?? "";
      }
      return row;
    }),
  };
  if (payload.validation_type === "NUM") {
    body.min_value = payload.min_value ?? null;
    body.max_value = payload.max_value ?? null;
  }
  if (payload.validation_type === "TEXT") {
    body.min_length = payload.min_length ?? null;
    body.max_length = payload.max_length ?? null;
  }
  const json = (await patchRequest(
    url,
    body,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as {
    success?: boolean;
    message?: string;
    err_message?: string;
    errors?: Record<string, unknown>;
  };
  if (json.success !== true) {
    return {
      success: false,
      err_message: json.err_message ?? json.message ?? "Request failed",
      errors: json.errors,
    };
  }
  return { success: true, message: json.message };
}

function parseBulkCreatedSgCategoryValueGid(data: unknown): string | null {
  if (data == null) return null;
  const rows = Array.isArray(data) ? data : [data];
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row || typeof row !== "object") return null;
  const gid = row.sg_catg_val_gid ?? row.subgroup_gid ?? row.g_id;
  return typeof gid === "string" && gid.trim() ? gid.trim() : null;
}

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
  const json = (await postRequest(
    url,
    bodyItems,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as BulkCreateSgCategoryValuesResult;
  if ((json as BulkCreateSgCategoryValuesSuccess).success === true) {
    return json as BulkCreateSgCategoryValuesSuccess;
  }
  return json as BulkCreateSgCategoryValuesError;
}

async function createSubgroupCombinations(
  dwId: string,
  items: CreateSubgroupCombinationItem[]
): Promise<CreateSubgroupCombinationsResult> {
  const url = getDWAPIURL(dwId, REFERENCE_PATH_SUBGROUPS);
  const json = (await postRequest(
    url,
    items,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as CreateSubgroupCombinationsResult;
  if ((json as CreateSubgroupCombinationsSuccess).success === true) {
    return json as CreateSubgroupCombinationsSuccess;
  }
  return json as CreateSubgroupCombinationsError;
}

/** How to apply a unit change on an existing indicator–unit row (IUS). */
type UnitIusChangeMode = "replace" | "add";

/**
 * PATCH replaces all IUS rows for the indicator. Merge other units' subgroup mappings
 * with the row being edited; default empty subgroup lists to env-driven subgroup.
 * When the row's unit changes: `replace` drops the previous unit from the payload;
 * `add` keeps the previous unit and adds the new one (extra IUS association).
 */
function buildIndicatorTabUnitIusPayload(
  indicator: Indicator,
  rowUnitGid: string | null,
  formUnitGid: string | null,
  formSubgroupGids: string[],
  defaultSgGids: string[],
  useExternalKeys: boolean,
  unitChangeMode: UnitIusChangeMode = "replace"
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!formUnitGid) return out;

  const formSgList =
    formSubgroupGids.length > 0
      ? [...formSubgroupGids]
      : ([DEFAULT_IUS_SUBGROUP_GID] as string[]);

  const seen = new Set<string>();
  const sourceUnits: string[] = [];
  for (const u of indicator.unit_gid ?? []) {
    if (u && !seen.has(u)) {
      seen.add(u);
      sourceUnits.push(u);
    }
  }
  if (sourceUnits.length === 0 && indicator.s_gid) {
    for (const k of Object.keys(indicator.s_gid)) {
      if (k && !seen.has(k)) {
        seen.add(k);
        sourceUnits.push(k);
      }
    }
  }

  const s_gid: Record<string, string[]> = {};

  for (const u of sourceUnits) {
    if (
      unitChangeMode === "replace" &&
      rowUnitGid &&
      u === rowUnitGid &&
      formUnitGid !== rowUnitGid
    ) {
      continue;
    }
    if (u === formUnitGid) {
      s_gid[u] = formSgList;
      continue;
    }
    const prev = indicator.s_gid?.[u];
    const prevList = prev?.sg_gid;
    s_gid[u] =
      prevList && prevList.length > 0
        ? [...prevList]
        : ([DEFAULT_IUS_SUBGROUP_GID] as string[]);
  }

  if (!s_gid[formUnitGid]) {
    s_gid[formUnitGid] = formSgList;
  }

  const allU = Object.keys(s_gid);
  if (useExternalKeys) {
    out.u_gid = allU;
  } else {
    out.unit_gid = allU;
  }
  out.s_gid = s_gid;
  const uniqDefaults = [...new Set(defaultSgGids.map((g) => g.trim()).filter(Boolean))];
  if (uniqDefaults.length > 0) {
    out.default_sg_gids = uniqDefaults;
  }
  return out;
}

type ConfigPanelTab = "indicator" | "subgroups" | "validation" | "metadata" | "compute";

/** Pending confirm when user changes unit on an existing indicator–unit row */
type UnitChangeDialogState =
  | null
  | {
      source: "inline";
      editSnapshot: InlineEditModel;
      row: IndicatorTableRow;
      formSgList: string[];
      defaultSg: string;
      formUnit: string;
    }
  | { source: "panel"; panelTab: ConfigPanelTab };

type ConfigPanelRow = {
  indicator: Indicator;
  unitGid: string | null;
  defaultSgGid: string | null;
  sgGids: string[];
  rowId: string;
};

const SORT_FIELD_NAME = "i_name";
/** Default subgroup GID when none selected for new IUS link */
const DEFAULT_SUBGROUP_GID = DEFAULT_IUS_SUBGROUP_GID;

type IndicatorListSortState = {
  columnId: string | null;
  direction: "asc" | "desc" | null;
};

function cycleIndicatorListSort(
  columnId: string,
  prev: IndicatorListSortState
): IndicatorListSortState {
  if (prev.columnId !== columnId) {
    return { columnId, direction: "asc" };
  }
  if (prev.direction === "asc") {
    return { columnId, direction: "desc" };
  }
  if (prev.direction === "desc") {
    return { columnId: null, direction: null };
  }
  return { columnId, direction: "asc" };
}

function indicatorSortHeaderMaterialIcon(
  columnId: string,
  activeColumnId: string | null,
  direction: IndicatorListSortState["direction"]
): "arrow_upward" | "arrow_downward" | "unfold_more" {
  if (activeColumnId === columnId && direction === "asc") return "arrow_upward";
  if (activeColumnId === columnId && direction === "desc") return "arrow_downward";
  return "unfold_more";
}

function getDefaultSgGidsForUnit(
  indicator: Indicator,
  unitGid: string | null
): string[] {
  const keys = indicator.s_gid ? Object.keys(indicator.s_gid) : [];
  const u =
    (unitGid && keys.includes(unitGid) ? unitGid : null) ??
    (keys.length > 0 ? keys[0] : null);
  if (!u) return [];
  const cfg = indicator.s_gid?.[u];
  if (!cfg) return [];
  const multi = cfg.default_sg_gids;
  if (Array.isArray(multi) && multi.length > 0) {
    return multi.filter((x): x is string => typeof x === "string" && x.length > 0);
  }
  return [];
}
const RECENT_CREATED_ROW_HIGHLIGHT_MS = 4500;

function buildInlineEditModelFromRow(row: IndicatorTableRow): InlineEditModel {
  return {
    rowId: row.rowId,
    indicatorNid: row.indicator.indicator_nid,
    originalUnitGid: row.unitGid,
    originalDefaultSg: row.defaultSgGid,
    originalSgGids: [...row.sgGids],
    name: row.indicator.indicator_name ?? "",
    unitGid: row.unitGid,
    subgroupGid: row.defaultSgGid ?? row.sgGids[0] ?? DEFAULT_SUBGROUP_GID,
    highIsGood: row.indicator.highisgood ?? false,
    unitSearch: "",
    subgroupSearch: "",
    unitDdOpen: false,
    subgroupDdOpen: false,
    unitHi: -1,
    subgroupHi: -1,
    subgroupEditable: false,
  };
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

/* Icons: use Material Icons class names to match HTML design */
const Mi = ({ name, className = "" }: { name: string; className?: string }) => (
  <span className={`material-icons ${className}`.trim()} aria-hidden>{name}</span>
);

export default function IndicatorPage() {
  const params = useParams();
  const localeParam =
    typeof params?.locale === "string" && params.locale.trim()
      ? params.locale.trim()
      : undefined;

  const {
    dwId,
    setSidebarCollapsed,
    setToolbarExport,
    setToolbarImport,
    dwDropdownOpen,
    setDwDropdownOpen,
    setBulkDelete,
  } = useSidebar();
  const { t } = useCore();
  const { allowed } = useDwPermissionGuard(DW_ROUTE_PERMISSIONS.template.indicators);
  const { canCreate, canUpdate, canDelete } = useDwCrudPermissions(
    DW_ROUTE_PERMISSIONS.template.indicators
  );
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const exportBusyRef = useRef(false);
  const tblScrollRef = useRef<HTMLDivElement>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(
    DEFAULT_TABLE_PAGE_SIZES[0]
  );
  const [listSort, setListSort] = useState<IndicatorListSortState>({
    columnId: null,
    direction: null,
  });

  const [searchInput, setSearchInput] = useState("");
  const [colFilterIndicator, setColFilterIndicator] = useState("");
  const [colFilterUnits, setColFilterUnits] = useState("");
  const [colFilterSubgroups, setColFilterSubgroups] = useState("");
  const [highIsGoodFilter, setHighIsGoodFilter] = useState<HighIsGoodFilter>("");

  /** Row id = "indicator_nid-unitGid" for selection (one row per indicator+unit) */
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  /** Bulk delete modal */
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const [unitChangeDialog, setUnitChangeDialog] =
    useState<UnitChangeDialogState>(null);
  const [indicatorsToDelete, setIndicatorsToDelete] = useState<Indicator[]>([]);
  const [deleteAssocLoading, setDeleteAssocLoading] = useState(false);
  const [deleteAssoc, setDeleteAssoc] = useState<IndicatorAssociationCountsData | null>(null);
  const [deleteAssocError, setDeleteAssocError] = useState<string | null>(null);
  const [deleteRunning, setDeleteRunning] = useState(false);
  const [deleteRunError, setDeleteRunError] = useState<string | null>(null);

  /** Add-new row state */
  const [newIndicatorName, setNewIndicatorName] = useState("");
  const [newUnitGid, setNewUnitGid] = useState<string | null>(null);
  const [newSubgroupGid, setNewSubgroupGid] = useState<string | null>(DEFAULT_SUBGROUP_GID);
  const [newHighIsGood, setNewHighIsGood] = useState(false);
  const [addRowExpanded, setAddRowExpanded] = useState(false);
  const [unitDropdownOpen, setUnitDropdownOpen] = useState(false);
  const [unitSearch, setUnitSearch] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [, setCreateError] = useState<string | null>(null);
  /** After Enter on name: indicator exists on server; tick confirms IUS, cross discards. */
  const [pendingAddIndicator, setPendingAddIndicator] = useState<{
    nid: number;
    gid: string | null;
    name: string;
    highisgood: boolean;
  } | null>(null);
  const [iusLinkLoading, setIusLinkLoading] = useState(false);
  const [addRowHighGoodSaving, setAddRowHighGoodSaving] = useState(false);
  const [addRowUnitHighlightIdx, setAddRowUnitHighlightIdx] = useState(-1);
  const [addRowUnitCreateLoading, setAddRowUnitCreateLoading] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const unitListRef = useRef<HTMLDivElement>(null);
  const addRowIndicatorInputRef = useRef<HTMLInputElement>(null);
  const addRowUnitInputRef = useRef<HTMLInputElement>(null);
  const inlineEditNameInputRef = useRef<HTMLInputElement>(null);
  const inlineEditUnitInputRef = useRef<HTMLInputElement>(null);
  const inlineEditHighToggleRef = useRef<HTMLButtonElement>(null);
  const pendingInlineFocusRef = useRef<InlineEditFocusField | null>(null);
  /** Add row <tr> — blur-to-create skips when focus stays inside this row */
  const addRowRef = useRef<HTMLTableRowElement>(null);
  /** Prevents duplicate POST if both blur and Enter fire */
  const addRowCreateInFlightRef = useRef(false);
  /** Request focus on Unit input after indicator draft is created. */
  const focusUnitAfterIndicatorCreateRef = useRef(false);
  const focusUnitRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inlineUnitFocusRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const focusAddRowUnitInput = useCallback((attempt = 0) => {
    const input = addRowUnitInputRef.current;
    if (input && !input.disabled && input.isConnected) {
      input.focus();
      return;
    }
    if (attempt >= 8) return;
    if (focusUnitRetryTimerRef.current) clearTimeout(focusUnitRetryTimerRef.current);
    focusUnitRetryTimerRef.current = setTimeout(() => {
      focusAddRowUnitInput(attempt + 1);
    }, 40);
  }, []);

  const focusAddRowHighToggle = useCallback(() => {
    queueMicrotask(() => {
      addRowRef.current
        ?.querySelector<HTMLButtonElement>(`td.${TV_COL_KEY_HIGH} button[type='button']`)
        ?.focus();
    });
  }, []);

  const focusInlineEditUnitInput = useCallback((attempt = 0) => {
    const input = inlineEditUnitInputRef.current;
    if (input && !input.disabled && input.isConnected) {
      input.focus();
      return;
    }
    if (attempt >= 8) return;
    if (inlineUnitFocusRetryTimerRef.current) {
      clearTimeout(inlineUnitFocusRetryTimerRef.current);
    }
    inlineUnitFocusRetryTimerRef.current = setTimeout(() => {
      focusInlineEditUnitInput(attempt + 1);
    }, 40);
  }, []);

  useEffect(() => {
    return () => {
      if (focusUnitRetryTimerRef.current) clearTimeout(focusUnitRetryTimerRef.current);
      if (inlineUnitFocusRetryTimerRef.current) {
        clearTimeout(inlineUnitFocusRetryTimerRef.current);
      }
    };
  }, []);

  /** Table row inline edit (double-click) */
  const [inlineEdit, setInlineEdit] = useState<InlineEditModel | null>(null);
  const [inlineSaveLoading, setInlineSaveLoading] = useState(false);
  const [inlineRowUnitCreateLoading, setInlineRowUnitCreateLoading] = useState(false);

  /** Locally known units (e.g. just created) for combobox labels when not in list meta. */
  const [unitExtras, setUnitExtras] = useState<Record<string, UnitRaw>>({});

  /** Config panel (right slide-over) */
  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const configPanelOpenRef = useRef(false);
  useEffect(() => {
    configPanelOpenRef.current = configPanelOpen;
  }, [configPanelOpen]);

  const [configPanelRow, setConfigPanelRow] = useState<ConfigPanelRow | null>(null);
  const [configPanelTab, setConfigPanelTab] = useState<ConfigPanelTab>("indicator");
  const [panelIndicatorDetail, setPanelIndicatorDetail] = useState<Record<string, unknown> | null>(null);
  const [panelDetailLoading, setPanelDetailLoading] = useState(false);
  const [panelSaveLoading, setPanelSaveLoading] = useState(false);
  const [panelSaveError, setPanelSaveError] = useState<string | null>(null);
  /** Subgroups tab: local list and default (for unsaved edits) */
  const [panelSgGids, setPanelSgGids] = useState<string[]>([]);
  const [panelDefaultSgGids, setPanelDefaultSgGids] = useState<string[]>([]);
  /** Subgroup GID → display label when meta is stale (e.g. right after create); shared with Compute tab. */
  const [panelSgDisplayNames, setPanelSgDisplayNames] = useState<Record<string, string>>({});
  /** Indicator tab form (controlled from panelIndicatorDetail or row) */
  const [panelFormName, setPanelFormName] = useState("");
  const [panelFormGid, setPanelFormGid] = useState("");
  const [panelFormShortName, setPanelFormShortName] = useState("");
  const [panelFormKeywords, setPanelFormKeywords] = useState("");
  const [panelFormDisplayOrder, setPanelFormDisplayOrder] = useState<string>("");
  const [panelFormHighIsGood, setPanelFormHighIsGood] = useState(false);
  /** Unit: selected GID; Unit column is combobox search + inline create */
  const [panelFormUnitGid, setPanelFormUnitGid] = useState("");
  /** Filter query for panel unit combobox; display name comes from `panelFormUnitGid` when set. */
  const [panelUnitSearch, setPanelUnitSearch] = useState("");
  const [panelUnitComboOpen, setPanelUnitComboOpen] = useState(false);
  const [panelUnitHighlightIdx, setPanelUnitHighlightIdx] = useState(-1);
  const [panelUnitCreateLoading, setPanelUnitCreateLoading] = useState(false);
  /** Ignore stale getIndicatorById responses when switching rows quickly */
  const panelDetailFetchKeyRef = useRef<string | null>(null);
  const panelMetadataTabRef = useRef<IndicatorMetadataTabHandle>(null);
  const panelValidationTabRef = useRef<IndicatorValidationTabHandle>(null);
  const panelComputeTabRef = useRef<IndicatorComputeTabHandle>(null);
  /** Confirmation dialog state for subgroup removal on save */
  const [sgRemovalConfirm, setSgRemovalConfirm] = useState<{
    removedGids: string[];
    unitMode: UnitIusChangeMode;
  } | null>(null);

  const debouncedSearch = useDebounce(searchInput, 300);
  const debouncedColIndicator = useDebounce(colFilterIndicator, 300);
  const debouncedColUnits = useDebounce(colFilterUnits, 300);
  const debouncedColSubgroups = useDebounce(colFilterSubgroups, 300);

  const buildSearchBy = useCallback(() => {
    const parts: string[] = [];
    const terms: string[] = [];
    const indicatorTerm = (debouncedSearch.trim() || debouncedColIndicator.trim()) || null;
    if (indicatorTerm) {
      parts.push("indicator");
      terms.push(indicatorTerm);
    }
    if (debouncedColUnits.trim()) {
      parts.push("unit");
      terms.push(debouncedColUnits.trim());
    }
    if (debouncedColSubgroups.trim()) {
      parts.push("subgroup");
      terms.push(debouncedColSubgroups.trim());
    }
    if (highIsGoodFilter === "yes") {
      parts.push("highisgood");
      terms.push("true");
    } else if (highIsGoodFilter === "no") {
      parts.push("highisgood");
      terms.push("false");
    }
    const searchBy = parts.join("|");
    const search = terms.join("|");
    return { search: terms.length ? search : undefined, search_by: searchBy || undefined };
  }, [
    debouncedSearch,
    highIsGoodFilter,
    debouncedColIndicator,
    debouncedColUnits,
    debouncedColSubgroups,
  ]);

  const indicatorsListUrl = useMemo(
    () => (dwId ? getDWAPIURL(dwId, REFERENCE_PATH_INDICATORS) : ""),
    [dwId]
  );

  const parseIndicatorsListResponse = useCallback(
    (json: unknown): ServerListParseResult<Indicator, IndicatorsListMeta> => {
      const r = json as IndicatorsListResult;
      if (!isIndicatorsListResponse(r)) {
        const msg =
          typeof r.err_message === "string" ? r.err_message : "Failed to load indicators";
        return { ok: false, message: msg };
      }
      const totals = parseListMetaTotals(r.meta);
      return {
        ok: true,
        rows: r.data.map(normalizeIndicator),
        ...totals,
        meta: r.meta,
      };
    },
    []
  );

  const indicatorsListQuery = useMemo(() => {
    const { search, search_by } = buildSearchBy();
    const sortActive =
      listSort.direction != null && listSort.columnId === "indicator";
    return {
      page,
      page_size: pageSize,
      ...(sortActive
        ? {
            sort_order: listSort.direction!,
            sort_field: SORT_FIELD_NAME,
          }
        : {}),
      subgroup: true as const,
      default_subgroup_only: false as const,
      ...(search != null && search !== "" ? { search } : {}),
      ...(search_by != null && search_by !== "" ? { search_by } : {}),
    };
  }, [page, pageSize, listSort.columnId, listSort.direction, buildSearchBy]);

  const listState = useServerListQuery({
    listUrl: indicatorsListUrl,
    query: indicatorsListQuery,
    parseListResponse: parseIndicatorsListResponse,
    enabled: Boolean(dwId && indicatorsListUrl),
  });

  const { rows: serverIndicators, meta, loading, error } = listState;

  const [recentCreatedRowIds, setRecentCreatedRowIds] = useState<string[]>([]);
  /** Keeps newly linked indicator rows directly under the add row until the warehouse changes. */
  const [pinnedIndicatorRowIds, setPinnedIndicatorRowIds] = useState<string[]>([]);

  useEffect(() => {
    setRecentCreatedRowIds([]);
    setPinnedIndicatorRowIds([]);
  }, [dwId]);

  useEffect(() => {
    if (recentCreatedRowIds.length === 0) return;
    const snapshot = [...recentCreatedRowIds];
    const id = window.setTimeout(() => {
      setRecentCreatedRowIds((prev) =>
        prev.filter((k) => !snapshot.includes(k))
      );
    }, RECENT_CREATED_ROW_HIGHLIGHT_MS);
    return () => window.clearTimeout(id);
  }, [recentCreatedRowIds]);

  const recentCreatedRowIdSet = useMemo(
    () => new Set(recentCreatedRowIds),
    [recentCreatedRowIds]
  );
  const [optimisticIndicators, setOptimisticIndicators] = useState<Indicator[]>([]);
  const [optimisticTotalCount, setOptimisticTotalCount] = useState(0);
  const [optimisticTotalCountUnfiltered, setOptimisticTotalCountUnfiltered] =
    useState<number | undefined>(undefined);
  useEffect(() => {
    setOptimisticIndicators(serverIndicators);
  }, [serverIndicators]);
  useEffect(() => {
    setOptimisticTotalCount(listState.totalCount);
    setOptimisticTotalCountUnfiltered(listState.totalCountUnfiltered);
  }, [listState.totalCount, listState.totalCountUnfiltered]);
  const indicators = optimisticIndicators;

  const openConfigPanel = useCallback((row: ConfigPanelRow) => {
    setInlineEdit(null);
    const wasAlreadyOpen = configPanelOpenRef.current;
    setConfigPanelRow(row);
    setConfigPanelOpen(true);
    if (!wasAlreadyOpen) {
      setConfigPanelTab("indicator");
    } else {
      setConfigPanelTab((t) => (t === "subgroups" && !row.unitGid ? "indicator" : t));
    }
    setPanelSaveError(null);
    setPanelFormName(row.indicator.indicator_name ?? "");
    setPanelFormGid(row.indicator.indicator_gid ?? "");
    const ind = row.indicator as unknown as Record<string, unknown>;
    setPanelFormShortName((ind.short_name as string) ?? "");
    setPanelFormKeywords((ind.keywords as string) ?? "");
    const order = ind.indicator_order ?? ind.i_order;
    setPanelFormDisplayOrder(order != null ? String(order) : "");
    setPanelFormHighIsGood(row.indicator.highisgood ?? false);
    setPanelFormUnitGid(row.unitGid ?? "");
    setPanelUnitSearch("");
    setPanelUnitComboOpen(false);
    setPanelUnitHighlightIdx(-1);
    setPanelSgGids([...row.sgGids]);
    setPanelDefaultSgGids(getDefaultSgGidsForUnit(row.indicator, row.unitGid));
    setPanelSgDisplayNames({});
    setSidebarCollapsed(true);
  }, [meta?.unit]);

  const closeConfigPanel = useCallback(() => {
    setConfigPanelOpen(false);
    setConfigPanelRow(null);
    setPanelIndicatorDetail(null);
    setPanelDetailLoading(false);
    setPanelSaveError(null);
    setPanelSaveLoading(false);
    setSidebarCollapsed(false);
  }, []);

  useEffect(() => {
    if (!panelSaveError) return;
    toast.error(panelSaveError);
  }, [panelSaveError]);

  useEffect(() => {
    if (!configPanelOpen) return;
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (unitChangeDialog?.source === "panel") {
        setUnitChangeDialog(null);
        e.preventDefault();
        return;
      }
      closeConfigPanel();
      e.preventDefault();
    };
    document.addEventListener("keydown", onDocKeyDown);
    return () => document.removeEventListener("keydown", onDocKeyDown);
  }, [configPanelOpen, closeConfigPanel, unitChangeDialog]);

  /** When config panel opens or target row changes, fetch full indicator for the form */
  useEffect(() => {
    if (!configPanelOpen || !configPanelRow) {
      setPanelIndicatorDetail(null);
      setPanelDetailLoading(false);
      panelDetailFetchKeyRef.current = null;
      return;
    }
    const id = String(configPanelRow.indicator.indicator_nid ?? configPanelRow.indicator.indicator_gid ?? "");
    if (!id) {
      setPanelDetailLoading(false);
      return;
    }
    const rowUnitGid = configPanelRow.unitGid?.trim() ? configPanelRow.unitGid : null;
    const fetchKey = `${id}:${rowUnitGid ?? ""}`;
    panelDetailFetchKeyRef.current = fetchKey;
    setPanelIndicatorDetail(null);
    setPanelDetailLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const res = await getIndicatorById(dwId, id, {
          subgroup: true,
          subgroupComputeFormula: true,
        });
        if (cancelled || panelDetailFetchKeyRef.current !== fetchKey) return;
        if (res.success && res.data) {
          setPanelIndicatorDetail(res.data as Record<string, unknown>);
          const d = res.data as Record<string, unknown>;
          setPanelFormName((d.indicator_name ?? d.i_name ?? "") as string);
          setPanelFormGid((d.indicator_gid ?? d.i_gid ?? "") as string);
          setPanelFormShortName((d.short_name ?? d.i_short_name ?? "") as string);
          setPanelFormKeywords((d.keywords ?? d.i_keywords ?? "") as string);
          const order = d.indicator_order ?? d.i_order;
          setPanelFormDisplayOrder(order != null ? String(order) : "");
          setPanelFormHighIsGood((d.highisgood ?? d.i_high_is_good ?? false) as boolean);
          // Keep the table row's unit when fetching detail — do not replace with first API unit.
          const uGid =
            rowUnitGid ??
            (d.unit_gid as string[])?.[0] ??
            (d.u_gid as string[])?.[0] ??
            "";
          setPanelFormUnitGid(uGid);
          setPanelUnitSearch("");
        }
      } finally {
        if (!cancelled && panelDetailFetchKeyRef.current === fetchKey) {
          setPanelDetailLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configPanelOpen, configPanelRow, dwId, localeParam]);

  /** Server-driven unit pickers (paginated GET /units + debounced search). */
  const addRowUnitPicker = useUnitPickerList({
    dwId,
    search: unitSearch,
    open: unitDropdownOpen,
  });
  const inlineUnitPicker = useUnitPickerList({
    dwId,
    search: inlineEdit?.unitSearch ?? "",
    open: inlineEdit?.unitDdOpen ?? false,
  });
  const panelUnitPicker = useUnitPickerList({
    dwId,
    search: panelUnitSearch,
    open: panelUnitComboOpen,
  });

  const registerUnitExtra = useCallback((name: string, gid: string) => {
    setUnitExtras((prev) => ({
      ...prev,
      [gid]: {
        unit_name: name,
        unit_gid: gid,
        u_name: name,
        u_gid: gid,
      } as UnitRaw,
    }));
  }, []);

  const unitPickerRows = useMemo(() => {
    const merged: UnitRaw[] = [];
    const seen = new Set<string>();
    const addRows = (rows: UnitRaw[]) => {
      for (const row of rows) {
        const gid = getUnitGid(row);
        if (gid && !seen.has(gid)) {
          seen.add(gid);
          merged.push(row);
        }
      }
    };
    addRows(addRowUnitPicker.rows);
    addRows(inlineUnitPicker.rows);
    addRows(panelUnitPicker.rows);
    for (const row of Object.values(unitExtras)) addRows([row]);
    return merged;
  }, [
    addRowUnitPicker.rows,
    inlineUnitPicker.rows,
    panelUnitPicker.rows,
    unitExtras,
  ]);

  const resolveUnitInputLabel = useCallback(
    (unitGid: string | null | undefined) => {
      if (!unitGid) return "";
      const metaName = meta?.unit?.[unitGid]?.u_name;
      if (metaName != null && String(metaName).trim() !== "") {
        return String(metaName).trim();
      }
      const extra = unitExtras[unitGid];
      if (extra) {
        const label = getUnitName(extra).trim();
        if (label) return label;
      }
      const fromPicker = unitPickerRows.find((x) => (getUnitGid(x) ?? "") === unitGid);
      if (fromPicker) {
        const label = getUnitName(fromPicker).trim();
        if (label) return label;
      }
      return unitGid;
    },
    [meta?.unit, unitExtras, unitPickerRows]
  );

  const handleAddRowUnitListScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const el = event.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight > 48) return;
      void addRowUnitPicker.loadMore();
    },
    [addRowUnitPicker.loadMore]
  );

  const handleInlineUnitListScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const el = event.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight > 48) return;
      void inlineUnitPicker.loadMore();
    },
    [inlineUnitPicker.loadMore]
  );

  const handlePanelUnitListScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const el = event.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight > 48) return;
      void panelUnitPicker.loadMore();
    },
    [panelUnitPicker.loadMore]
  );

  const handleAddRowUnitNeedMore = useCallback(() => {
    addRowUnitPicker.requestMoreIfAvailable();
  }, [addRowUnitPicker.requestMoreIfAvailable]);

  const handleInlineUnitNeedMore = useCallback(() => {
    inlineUnitPicker.requestMoreIfAvailable();
  }, [inlineUnitPicker.requestMoreIfAvailable]);

  const handlePanelUnitNeedMore = useCallback(() => {
    panelUnitPicker.requestMoreIfAvailable();
  }, [panelUnitPicker.requestMoreIfAvailable]);

  const addRowUnitListFooter =
    addRowUnitPicker.loadingMore ? (
      <div className="list-opt-empty list-opt-empty--grid text-xs">{t("LOADING")}</div>
    ) : null;

  const inlineUnitListFooter =
    inlineUnitPicker.loadingMore ? (
      <div className="list-opt-empty list-opt-empty--grid text-xs">{t("LOADING")}</div>
    ) : null;

  const panelUnitListFooter =
    panelUnitPicker.loadingMore ? (
      <div className="list-opt-empty list-opt-empty--grid text-xs">{t("LOADING")}</div>
    ) : null;

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

  const addRowUnitOptions = addRowUnitPicker.comboOptions;

  const addRowUnitShowCreate = useMemo(() => {
    const term = unitSearch.trim();
    if (!term || addRowUnitPicker.loading) return false;
    return !addRowUnitPicker.exactNameMatch;
  }, [unitSearch, addRowUnitPicker.loading, addRowUnitPicker.exactNameMatch]);

  const addRowUnitOptionCount =
    addRowUnitOptions.length + (addRowUnitShowCreate ? 1 : 0);

  const handleAddRowCreateUnit = useCallback(async () => {
    const name = unitSearch.trim();
    if (!name || addRowUnitCreateLoading || createLoading) return;
    setAddRowUnitCreateLoading(true);
    setCreateError(null);
    try {
      const createRes = await createUnits(dwId, [{ unit_name: name }]);
      if (!createRes.success) {
        toast.error(createRes.err_message ?? "Failed to create unit");
        return;
      }
      const created = createRes.data;
      const newGid =
        created?.[0]?.unit_gid ?? (created?.[0] as { u_gid?: string })?.u_gid ?? null;
      if (!newGid) {
        toast.error("Created unit but no GID returned");
        return;
      }
      registerUnitExtra(name, newGid);
      addRowUnitPicker.refresh();
      setNewUnitGid(newGid);
      setUnitSearch("");
      setUnitDropdownOpen(false);
      setAddRowUnitHighlightIdx(-1);
      queueMicrotask(() => addRowUnitInputRef.current?.focus());
    } finally {
      setAddRowUnitCreateLoading(false);
    }
  }, [
    dwId,
    unitSearch,
    addRowUnitCreateLoading,
    createLoading,
    registerUnitExtra,
    addRowUnitPicker,
  ]);

  /** Subgroup name lookup from indicators list meta (configure panel uses paginated GET /subgroups). */
  const subgroupsForDropdown = useMemo(() => {
    if (!meta?.subgroup || typeof meta.subgroup !== "object") return [];
    return Object.values(meta.subgroup).map((s) => ({
      subgroup_val_gid: s.sg_gid,
      subgroup_val: s.sg_name,
      sv_gid: s.sg_gid,
      sv_name: s.sg_name,
    })) as SubgroupRaw[];
  }, [meta?.subgroup]);

  const inlineRowUnitShowCreate = useMemo(() => {
    if (!inlineEdit) return false;
    const term = inlineEdit.unitSearch.trim();
    if (!term || inlineUnitPicker.loading) return false;
    return !inlineUnitPicker.exactNameMatch;
  }, [inlineEdit, inlineUnitPicker.loading, inlineUnitPicker.exactNameMatch]);

  const handleInlineCreateUnit = useCallback(async () => {
    if (!inlineEdit) return;
    const name = inlineEdit.unitSearch.trim();
    if (!name || inlineRowUnitCreateLoading || inlineSaveLoading) return;
    let focusTarget: "unit" | "high" | null = null;
    setInlineRowUnitCreateLoading(true);
    try {
      const createRes = await createUnits(dwId, [{ unit_name: name }]);
      if (!createRes.success) {
        toast.error(createRes.err_message ?? "Failed to create unit");
        focusTarget = "unit";
        return;
      }
      const created = createRes.data;
      const newGid =
        created?.[0]?.unit_gid ?? (created?.[0] as { u_gid?: string })?.u_gid ?? null;
      if (!newGid) {
        toast.error("Created unit but no GID returned");
        focusTarget = "unit";
        return;
      }
      registerUnitExtra(name, newGid);
      inlineUnitPicker.refresh();
      setInlineEdit((e) =>
        e
          ? {
              ...e,
              unitGid: newGid,
              unitSearch: "",
              unitDdOpen: false,
              unitHi: -1,
            }
          : null
      );
      focusTarget = "high";
    } finally {
      setInlineRowUnitCreateLoading(false);
      if (focusTarget === "unit") {
        focusInlineEditUnitInput();
      } else if (focusTarget === "high") {
        queueMicrotask(() => inlineEditHighToggleRef.current?.focus());
      }
    }
  }, [
    dwId,
    inlineEdit,
    inlineRowUnitCreateLoading,
    inlineSaveLoading,
    focusInlineEditUnitInput,
    registerUnitExtra,
    inlineUnitPicker,
  ]);

  const handleInlineEditCancel = useCallback(() => {
    setInlineEdit(null);
  }, []);

  useEffect(() => {
    if (!inlineEdit) return;
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (unitChangeDialog) {
        setUnitChangeDialog(null);
        e.preventDefault();
        return;
      }
      handleInlineEditCancel();
      e.preventDefault();
    };
    document.addEventListener("keydown", onDocKeyDown);
    return () => document.removeEventListener("keydown", onDocKeyDown);
  }, [inlineEdit, unitChangeDialog, handleInlineEditCancel]);

  /** Enter / blur on indicator name: create indicator only (no IUS). Blur uses silentIfEmpty to avoid errors on empty field. */
  const handleAddRowCreateIndicatorOnly = useCallback(
    async (opts?: { silentIfEmpty?: boolean; focusUnitAfterCreate?: boolean }) => {
      if (pendingAddIndicator || addRowCreateInFlightRef.current) return;
      const name = newIndicatorName.trim();
      if (!name) {
        if (!opts?.silentIfEmpty) {
          toast.error("Indicator name is required.");
          queueMicrotask(() => addRowIndicatorInputRef.current?.focus());
        }
        return;
      }
      addRowCreateInFlightRef.current = true;
      setCreateLoading(true);
      setCreateError(null);
      try {
        const payload: CreateIndicatorPayload = {
          indicator_name: name,
          highisgood: newHighIsGood,
        };
        const result = await createIndicators(dwId, [payload]);
        if (!result.success) {
          toast.error(result.err_message ?? "Failed to create indicator.");
          queueMicrotask(() => addRowIndicatorInputRef.current?.focus());
          return;
        }
        const metaErrors = getCreateIndicatorsMetaErrorMessages(result.meta);
        if (metaErrors.length > 0) {
          const primary = metaErrors[0];
          const more = metaErrors.slice(1);
          toast.error(primary, {
            description: more.length ? more.join("\n") : undefined,
          });
          queueMicrotask(() => addRowIndicatorInputRef.current?.focus());
          return;
        }
        const row = result.data?.[0] as Record<string, unknown> | undefined;
        const nid = Number(row?.indicator_nid ?? row?.i_nid ?? 0);
        let gid = (row?.indicator_gid ?? row?.i_gid ?? null) as string | null;
        if (!nid) {
          toast.error("Created indicator but no ID returned.");
          queueMicrotask(() => addRowIndicatorInputRef.current?.focus());
          return;
        }
        if (!gid) {
          const detail = await getIndicatorById(dwId, String(nid));
          if (detail.success && detail.data) {
            const d = detail.data as Record<string, unknown>;
            gid = (d.indicator_gid ?? d.i_gid ?? null) as string | null;
          }
        }
        const createdDraft = {
          nid,
          gid,
          name,
          highisgood: newHighIsGood,
        };
        setPendingAddIndicator(createdDraft);
        setNewIndicatorName("");
        setCreateError(null);
        focusUnitAfterIndicatorCreateRef.current = opts?.focusUnitAfterCreate ?? true;
        return createdDraft;
      } finally {
        setCreateLoading(false);
        addRowCreateInFlightRef.current = false;
        if (focusUnitAfterIndicatorCreateRef.current) {
          focusUnitAfterIndicatorCreateRef.current = false;
          focusAddRowUnitInput();
        }
      }
      return null;
    },
    [
      dwId,
      localeParam,
      newIndicatorName,
      newHighIsGood,
      pendingAddIndicator,
      focusAddRowUnitInput,
      t
    ]
  );

  const addRowHighIsGood = pendingAddIndicator?.highisgood ?? newHighIsGood;

  /** Toggle High is Good before create (local) or after (PATCH indicator). */
  const handleAddRowToggleHighIsGood = useCallback(async () => {
    if (createLoading || iusLinkLoading || addRowHighGoodSaving) return;
    if (pendingAddIndicator) {
      const p = pendingAddIndicator;
      const next = !p.highisgood;
      setPendingAddIndicator({ ...p, highisgood: next });
      setAddRowHighGoodSaving(true);
      setCreateError(null);
      const id = String(p.nid);
      const body: Record<string, unknown> =
        API_KEY_FORMAT === "external"
          ? { i_high_is_good: next }
          : { highisgood: next };
      const res = await updateIndicator(dwId, id, body);
      setAddRowHighGoodSaving(false);
      if (!res.success) {
        setPendingAddIndicator({ ...p, highisgood: !next });
        toast.error(res.err_message ?? "Could not update High is Good.");
      }
    } else {
      setNewHighIsGood((v) => !v);
    }
  }, [
    createLoading,
    iusLinkLoading,
    pendingAddIndicator,
    dwId,
    addRowHighGoodSaving,
  ]);

  /** Tick: POST /ius to link unit + subgroup (default TOTAL if subgroup not chosen). */
  const handleAddRowConfirmIus = useCallback(
    async (opts?: {
      indicator?: {
        nid: number;
        gid: string | null;
        name: string;
        highisgood: boolean;
      } | null;
      unitGid?: string | null;
      subgroupGid?: string | null;
    }) => {
    const draft = opts?.indicator ?? pendingAddIndicator;
    if (!draft) return;
    const uGid = (opts?.unitGid ?? newUnitGid)?.trim() || null;
    if (!uGid) {
      toast.error("Select or create a unit before confirming.");
      return;
    }
    const iGid = draft.gid?.trim() || null;
    if (!iGid) {
      toast.error("Indicator GID missing; cannot create IUS link.");
      return;
    }
    const chosenSg = (opts?.subgroupGid ?? newSubgroupGid)?.trim() || DEFAULT_SUBGROUP_GID;
    const sgList = [chosenSg];
    const defaultSg = chosenSg;
    setIusLinkLoading(true);
    setCreateError(null);
    try {
      const body: IusUpsertBody = {
        data: [
          {
            i_gid: iGid,
            u_gid: [uGid],
            u_sg_gid: {
              [uGid]: {
                sg_gid: sgList,
                default_sg_gids: [defaultSg],
              },
            },
          },
        ],
      };
      const res = await upsertIus(dwId, body);
      if (!res.success) {
        toast.error(res.err_message ?? "Failed to create IUS link.");
        return;
      }
      const createdRowId = `${draft.nid}-${uGid}`;
      setOptimisticIndicators((prev) => {
        const next = [...prev];
        const indicatorIndex = next.findIndex(
          (ind) => ind.indicator_nid === draft.nid
        );
        const mappedSubgroups = [chosenSg];
        if (indicatorIndex >= 0) {
          const current = next[indicatorIndex];
          const unitSet = new Set(current.unit_gid ?? []);
          unitSet.add(uGid);
          next[indicatorIndex] = {
            ...current,
            indicator_name: draft.name,
            highisgood: draft.highisgood,
            unit_gid: Array.from(unitSet),
            s_gid: {
              ...(current.s_gid ?? {}),
              [uGid]: {
                sg_gid: mappedSubgroups,
                default_sg_gids: [chosenSg],
              },
            },
          };
        } else {
          next.unshift({
            indicator_nid: draft.nid,
            indicator_gid: draft.gid,
            indicator_name: draft.name,
            highisgood: draft.highisgood,
            unit_gid: [uGid],
            s_gid: {
              [uGid]: {
                sg_gid: mappedSubgroups,
                default_sg_gids: [chosenSg],
              },
            },
          } as Indicator);
        }
        return next;
      });
      setPendingAddIndicator(null);
      setNewUnitGid(null);
      setNewSubgroupGid(DEFAULT_SUBGROUP_GID);
      setNewHighIsGood(false);
      setUnitSearch("");
      setPage(1);
      setRecentCreatedRowIds([createdRowId]);
      setPinnedIndicatorRowIds((prev) => [
        createdRowId,
        ...prev.filter((x) => x !== createdRowId),
      ]);
      setActiveRowId(createdRowId);
    } finally {
      setIusLinkLoading(false);
    }
  }, [dwId, pendingAddIndicator, newUnitGid, newSubgroupGid]);

  /** Cross: cancel add flow; delete draft indicator on server when it was already created. */
  const handleAddRowDiscard = useCallback(async () => {
    setCreateError(null);
    if (pendingAddIndicator) {
      const nid = pendingAddIndicator.nid;
      setIusLinkLoading(true);
      let removed = false;
      try {
        const del = await deleteIndicator(dwId, String(nid));
        if (del.success) {
          removed = true;
        } else {
          toast.error(del.err_message ?? "Could not remove draft indicator.");
        }
      } finally {
        setIusLinkLoading(false);
      }
      if (!removed) return;
      setPendingAddIndicator(null);
    }
    setNewIndicatorName("");
    setNewUnitGid(null);
    setNewSubgroupGid(DEFAULT_SUBGROUP_GID);
    setNewHighIsGood(false);
    setUnitSearch("");
    setUnitDropdownOpen(false);
    setAddRowExpanded(false);
  }, [dwId, pendingAddIndicator]);

  const totalCount = optimisticTotalCount;
  const totalPages = meta?.total_pages ?? 0;

  const onSortIndicator = useCallback(() => {
    setPage(1);
    setListSort((prev) => cycleIndicatorListSort("indicator", prev));
  }, []);

  const applyInlineFocus = useCallback((field: InlineEditFocusField) => {
    const run = () => {
      switch (field) {
        case "name": {
          const el = inlineEditNameInputRef.current;
          el?.focus();
          el?.select();
          break;
        }
        case "unit":
          inlineEditUnitInputRef.current?.focus();
          break;
        case "subgroup":
          inlineEditHighToggleRef.current?.focus();
          break;
        case "high":
          inlineEditHighToggleRef.current?.focus();
          break;
      }
    };
    requestAnimationFrame(run);
  }, []);

  /** One row per (indicator, unit); if no units, one row with unitGid=null. sgGids = full subgroup list for this row. */
  const rows = useMemo((): IndicatorTableRow[] => {
    const out: IndicatorTableRow[] = [];
    for (const ind of indicators) {
      const units = ind.unit_gid ?? [];
      if (units.length === 0) {
        const firstUnitKey = ind.s_gid && Object.keys(ind.s_gid).length > 0 ? Object.keys(ind.s_gid)[0] : null;
        const firstSg =
          firstUnitKey != null
            ? getDefaultSgGidsForUnit(ind, firstUnitKey)[0] ?? null
            : null;
        const sgGids = firstUnitKey && ind.s_gid?.[firstUnitKey]?.sg_gid ? ind.s_gid[firstUnitKey].sg_gid! : [];
        out.push({
          indicator: ind,
          unitGid: null,
          defaultSgGid: firstSg,
          sgGids: Array.isArray(sgGids) ? sgGids : [],
          rowId: `${ind.indicator_nid}-none`,
        });
      } else {
        for (const u of units) {
          const unitSg = ind.s_gid?.[u];
          const defaultSgGid = getDefaultSgGidsForUnit(ind, u)[0] ?? null;
          const sgGids = unitSg?.sg_gid && Array.isArray(unitSg.sg_gid) ? unitSg.sg_gid : [];
          out.push({
            indicator: ind,
            unitGid: u,
            defaultSgGid: defaultSgGid,
            sgGids,
            rowId: `${ind.indicator_nid}-${u}`,
          });
        }
      }
    }
    if (pinnedIndicatorRowIds.length === 0) return out;
    const priority = new Map(pinnedIndicatorRowIds.map((id, i) => [id, i]));
    const head: IndicatorTableRow[] = [];
    const tail: IndicatorTableRow[] = [];
    for (const row of out) {
      if (priority.has(row.rowId)) head.push(row);
      else tail.push(row);
    }
    head.sort(
      (a, b) =>
        (priority.get(a.rowId) ?? 0) - (priority.get(b.rowId) ?? 0)
    );
    return [...head, ...tail];
  }, [indicators, pinnedIndicatorRowIds]);

  const executeInlineSave = useCallback(
    async (
      row: IndicatorTableRow,
      edit: InlineEditModel,
      formSgList: string[],
      defaultSg: string,
      formUnit: string | null,
      unitChangeMode: UnitIusChangeMode
    ) => {
      const id = String(edit.indicatorNid);
      const nm = edit.name.trim();
      if (!nm) {
        toast.error("Indicator name is required.");
        return false;
      }
      if (edit.originalUnitGid != null && !formUnit) {
        toast.error("Unit cannot be cleared; select a unit or cancel.");
        return false;
      }

      const unitPayload = buildIndicatorTabUnitIusPayload(
        row.indicator,
        edit.originalUnitGid,
        formUnit,
        formSgList,
        [defaultSg],
        API_KEY_FORMAT === "external",
        unitChangeMode
      );

      const body: Record<string, unknown> =
        API_KEY_FORMAT === "external"
          ? {
              i_name: nm,
              i_gid: row.indicator.indicator_gid ?? "",
              i_high_is_good: edit.highIsGood,
              ...unitPayload,
            }
          : {
              indicator_name: nm,
              indicator_gid: row.indicator.indicator_gid ?? "",
              highisgood: edit.highIsGood,
              ...unitPayload,
            };

      const res = await updateIndicator(dwId, id, body);
      if (!res.success) {
        toast.error(res.err_message ?? "Update failed");
        return false;
      }

      const nextUnitGid = formUnit;
      const nextSgList =
        formSgList.length > 0 ? formSgList : [DEFAULT_SUBGROUP_GID];
      const nextDefaultSg =
        defaultSg ?? nextSgList[0] ?? DEFAULT_SUBGROUP_GID;
      const origU = edit.originalUnitGid;
      const unitActuallyChanged =
        origU != null && nextUnitGid != null && origU !== nextUnitGid;

      setOptimisticIndicators((prev) =>
        prev.map((ind) => {
          if (ind.indicator_nid !== edit.indicatorNid) return ind;
          const nextUnitSet = new Set(ind.unit_gid ?? []);
          if (unitActuallyChanged && unitChangeMode === "replace") {
            nextUnitSet.delete(origU!);
          }
          if (nextUnitGid) {
            nextUnitSet.add(nextUnitGid);
          }
          const nextSgid = { ...(ind.s_gid ?? {}) };
          if (unitActuallyChanged && unitChangeMode === "replace") {
            delete nextSgid[origU!];
          }
          if (nextUnitGid) {
            nextSgid[nextUnitGid] = {
              sg_gid: nextSgList,
              default_sg_gids: [nextDefaultSg],
            };
          }
          return {
            ...ind,
            indicator_name: nm,
            highisgood: edit.highIsGood,
            unit_gid: Array.from(nextUnitSet),
            s_gid: nextSgid,
          };
        })
      );

      setInlineEdit(null);
      const newRowId = `${edit.indicatorNid}-${nextUnitGid ?? "none"}`;
      if (unitActuallyChanged && unitChangeMode === "add" && nextUnitGid) {
        setRecentCreatedRowIds([newRowId]);
        setPinnedIndicatorRowIds((prev) => [
          newRowId,
          ...prev.filter((x) => x !== newRowId),
        ]);
      }
      setActiveRowId(newRowId);
      return true;
    },
    [dwId]
  );

  const handleInlineEditSave = useCallback(async () => {
    if (!inlineEdit) return;
    const row = rows.find((r) => r.rowId === inlineEdit.rowId);
    if (!row) {
      setInlineEdit(null);
      return;
    }
    const nm = inlineEdit.name.trim();
    if (!nm) {
      toast.error("Indicator name is required.");
      return;
    }

    const chosenSg =
      inlineEdit.subgroupGid?.trim() || DEFAULT_SUBGROUP_GID;
    const baseList =
      inlineEdit.originalSgGids.length > 0
        ? [...inlineEdit.originalSgGids]
        : [DEFAULT_SUBGROUP_GID];
    const merged = new Set(baseList);
    merged.add(chosenSg);
    const formSgList = Array.from(merged);
    const defaultSg = chosenSg;

    const formUnit = inlineEdit.unitGid?.trim() || null;
    if (inlineEdit.originalUnitGid != null && !formUnit) {
      toast.error("Unit cannot be cleared; select a unit or cancel.");
      return;
    }

    const orig = inlineEdit.originalUnitGid?.trim() || null;
    const nextU = formUnit?.trim() || null;
    const needsUnitIusChoice =
      orig != null && nextU != null && orig !== nextU;

    if (needsUnitIusChoice) {
      setUnitChangeDialog({
        source: "inline",
        editSnapshot: { ...inlineEdit },
        row,
        formSgList,
        defaultSg,
        formUnit: nextU,
      });
      return;
    }

    setInlineSaveLoading(true);
    try {
      await executeInlineSave(
        row,
        inlineEdit,
        formSgList,
        defaultSg,
        formUnit,
        "replace"
      );
    } finally {
      setInlineSaveLoading(false);
    }
  }, [inlineEdit, rows, executeInlineSave]);

  useEffect(() => {
    if (!inlineEdit) return;
    if (!rows.some((r) => r.rowId === inlineEdit.rowId)) {
      setInlineEdit(null);
    }
  }, [rows, inlineEdit]);

  const onInlineCellDoubleClick = useCallback(
    (row: IndicatorTableRow, focus: InlineEditFocusField, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!canUpdate) return;
      if (inlineSaveLoading || createLoading || iusLinkLoading) return;
      if (inlineEdit?.rowId === row.rowId) {
        if (focus === "subgroup") {
          applyInlineFocus("high");
          return;
        }
        applyInlineFocus(focus);
        return;
      }
      setActiveRowId(row.rowId);
      pendingInlineFocusRef.current = focus === "subgroup" ? "high" : focus;
      setInlineEdit(buildInlineEditModelFromRow(row));
    },
    [
      applyInlineFocus,
      inlineEdit,
      inlineSaveLoading,
      createLoading,
      iusLinkLoading,
      canUpdate,
    ]
  );

  // Auto-focus first input field when navigating to a data row with arrow keys
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
      
      // Auto-focus first input field when navigating to a data row
      setTimeout(() => {
        const focusedRow = document.activeElement?.closest('tr[data-tv-row-id]');
        if (focusedRow) {
          const firstInput = focusedRow.querySelector('input:not([type="checkbox"]):not([disabled])') as HTMLInputElement;
          if (firstInput && !firstInput.closest('.add-row')) {
            // Start inline edit for the focused row
            const rowId = focusedRow.getAttribute('data-tv-row-id');
            if (rowId) {
              const row = rows.find(r => r.rowId === rowId);
              if (row && inlineEdit?.rowId !== rowId) {
                onInlineCellDoubleClick(row, "name", { stopPropagation: () => {} } as React.MouseEvent);
              }
            }
          }
        }
      }, 0);
    };
    document.addEventListener("keydown", onArrowNavigation);
    return () => {
      document.removeEventListener("keydown", onArrowNavigation);
    };
  }, [rows, inlineEdit, onInlineCellDoubleClick]);

  useLayoutEffect(() => {
    if (!inlineEdit) {
      pendingInlineFocusRef.current = null;
      return;
    }
    const f = pendingInlineFocusRef.current;
    pendingInlineFocusRef.current = null;
    if (f) applyInlineFocus(f);
  }, [inlineEdit, applyInlineFocus]);

  const selectedIndicatorCount = useMemo(() => {
    const nids = new Set<number>();
    for (const row of rows) {
      if (selectedRowIds.has(row.rowId)) nids.add(row.indicator.indicator_nid);
    }
    return nids.size;
  }, [rows, selectedRowIds]);

  const openDeleteModal = useCallback(() => {
    const map = new Map<number, Indicator>();
    for (const row of rows) {
      if (selectedRowIds.has(row.rowId)) {
        map.set(row.indicator.indicator_nid, row.indicator);
      }
    }
    const list = Array.from(map.values());
    if (list.length === 0) return;
    setIndicatorsToDelete(list);
    setDeleteAssoc(null);
    setDeleteAssocError(null);
    setDeleteRunError(null);
    setDeleteModalOpen(true);
  }, [rows, selectedRowIds]);

  const closeDeleteModal = useCallback(() => {
    setDeleteModalOpen(false);
    setIndicatorsToDelete([]);
    setDeleteAssoc(null);
    setDeleteAssocError(null);
    setDeleteRunError(null);
    setDeleteAssocLoading(false);
  }, []);

  useEffect(() => {
    if (!deleteModalOpen || indicatorsToDelete.length === 0) return;
    let cancelled = false;
    setDeleteAssocLoading(true);
    setDeleteAssoc(null);
    setDeleteAssocError(null);
    const ids = indicatorsToDelete.map((i) => String(i.indicator_nid));
    fetchIndicatorAssociationCounts(dwId, ids).then((r) => {
      if (cancelled) return;
      setDeleteAssocLoading(false);
      if (r.success) setDeleteAssoc(r.data);
      else
        setDeleteAssocError(
          r.err_message ??
            t("ASSOC_COUNTS_FAILED")
        );
    });
    return () => {
      cancelled = true;
    };
  }, [deleteModalOpen, dwId, indicatorsToDelete, t]);

  useEffect(() => {
    setBulkDelete({
      onClick: openDeleteModal,
      disabled: selectedIndicatorCount === 0 || !canDelete,
    });
    return () => setBulkDelete(null);
  }, [setBulkDelete, openDeleteModal, selectedIndicatorCount, canDelete]);

  useEffect(() => {
    setToolbarExport({
      onClick: async () => {
        if (!dwId || exportBusyRef.current) return;
        exportBusyRef.current = true;
        const { search, search_by } = buildSearchBy();
        try {
          const result = await downloadIndicatorsExport(dwId, {
            ...(listSort.direction != null && listSort.columnId === "indicator"
              ? {
                  sort_order: listSort.direction,
                  sort_field: SORT_FIELD_NAME,
                }
              : {}),
            search,
            search_by,
            subgroup: true,
            default_subgroup_only: false,
          });
          if (!result.ok) {
            toast.error(
              t("ERROR_MESSAGE", "{message}").replace(
                "{message}",
                result.message
              )
            );
          } else {
            toast.success(t("EXPORT_SUCCESS"));
          }
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : t("EXPORT_FAILED")
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
    listSort.columnId,
    listSort.direction,
    buildSearchBy,
    setToolbarExport,
    t,
  ]);

  useEffect(() => {
    setToolbarImport({
      onClick: () => {},
      disabled: !dwId || !canCreate,
    });
    return () => setToolbarImport(null);
  }, [dwId, canCreate, setToolbarImport]);

  const handleConfirmBulkDelete = useCallback(async () => {
    if (indicatorsToDelete.length === 0) return;
    setDeleteRunning(true);
    setDeleteRunError(null);
    const nids = indicatorsToDelete.map((i) => i.indicator_nid);
    const r = await deleteIndicatorsMultiple(dwId, nids);
    setDeleteRunning(false);
    if (!r.success) {
      setDeleteRunError(
        r.err_message ??
          t("DELETE_FAILED", "Delete failed")
      );
      return;
    }
    const deletedNids = new Set(r.data.deleted);
    if (deletedNids.size > 0) {
      setOptimisticIndicators((prev) =>
        prev.filter((ind) => !deletedNids.has(ind.indicator_nid))
      );
      setOptimisticTotalCount((prev) => Math.max(0, prev - deletedNids.size));
      toast.success(
        t(
          "INDICATORS_BULK_DELETE_SUCCESS",
          `Deleted ${deletedNids.size} indicator(s) successfully`
        ).replace("{count}", String(deletedNids.size))
      );
    }
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      for (const row of rows) {
        if (deletedNids.has(row.indicator.indicator_nid)) next.delete(row.rowId);
      }
      return next;
    });
    if (configPanelOpen && configPanelRow && deletedNids.has(configPanelRow.indicator.indicator_nid)) {
      closeConfigPanel();
    }
    const apiErrors = r.meta?.errors ?? [];
    if (apiErrors.length > 0) {
      setDeleteRunError(
        apiErrors
          .map(
            (e) =>
              `${e.indicator_nid ?? "?"}: ${e.error ?? "Delete failed"}`
          )
          .join("\n")
      );
    }
    const remaining = indicatorsToDelete.filter((i) => !deletedNids.has(i.indicator_nid));
    setIndicatorsToDelete(remaining);
    if (remaining.length === 0) {
      closeDeleteModal();
    }
  }, [
    indicatorsToDelete,
    dwId,
    rows,
    configPanelOpen,
    configPanelRow,
    closeConfigPanel,
    closeDeleteModal,
    t,
  ]);

  const selectAll = () => {
    if (selectedRowIds.size === rows.length) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(rows.map((r) => r.rowId)));
    }
  };

  const toggleSelect = (rowId: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const clearSelection = () => setSelectedRowIds(new Set());

  const getUnitDisplay = useCallback(
    (unitGid: string | null) => {
      if (unitGid == null) return "—";
      const label = resolveUnitInputLabel(unitGid);
      return label || unitGid;
    },
    [resolveUnitInputLabel]
  );

  /** Core PATCH indicator + IUS payload (panel); `unitChangeMode` applies when the row unit changes. */
  const runConfigPanelCoreSave = useCallback(
    async (unitChangeMode: UnitIusChangeMode): Promise<boolean> => {
      if (!configPanelRow) return false;
      const id = String(
        configPanelRow.indicator.indicator_nid ??
          configPanelRow.indicator.indicator_gid ??
          ""
      );
      const resolvedUnitGid = panelFormUnitGid.trim() || null;
      const indForMerge = panelIndicatorDetail
        ? normalizeIndicator(panelIndicatorDetail as IndicatorListItem)
        : configPanelRow.indicator;
      const effectiveDefaultSgGids =
        panelDefaultSgGids.length > 0
          ? panelDefaultSgGids.filter((g) => panelSgGids.includes(g))
          : configPanelRow.defaultSgGid != null &&
              panelSgGids.includes(configPanelRow.defaultSgGid)
            ? [configPanelRow.defaultSgGid]
            : panelSgGids.length > 0
              ? [panelSgGids[0]]
              : [];
      const unitPayload = buildIndicatorTabUnitIusPayload(
        indForMerge,
        configPanelRow.unitGid,
        resolvedUnitGid,
        panelSgGids,
        effectiveDefaultSgGids,
        API_KEY_FORMAT === "external",
        unitChangeMode
      );
      const body: Record<string, unknown> =
        API_KEY_FORMAT === "external"
          ? {
              i_name: panelFormName,
              i_gid: panelFormGid,
              i_short_name: panelFormShortName || undefined,
              i_keywords: panelFormKeywords || undefined,
              i_order:
                panelFormDisplayOrder !== ""
                  ? Number(panelFormDisplayOrder)
                  : undefined,
              i_high_is_good: panelFormHighIsGood,
              ...unitPayload,
            }
          : {
              indicator_name: panelFormName,
              indicator_gid: panelFormGid,
              short_name: panelFormShortName || undefined,
              keywords: panelFormKeywords || undefined,
              indicator_order:
                panelFormDisplayOrder !== ""
                  ? Number(panelFormDisplayOrder)
                  : undefined,
              highisgood: panelFormHighIsGood,
              ...unitPayload,
            };
      const res = await updateIndicator(dwId, id, body);
      if (!res.success) {
        setPanelSaveError(res.err_message ?? "Update failed");
        return false;
      }
      const nextSgList =
        panelSgGids.length > 0 ? [...panelSgGids] : [DEFAULT_SUBGROUP_GID];
      const nextDefaultList =
        effectiveDefaultSgGids.length > 0
          ? [...effectiveDefaultSgGids]
          : nextSgList.length > 0
            ? [nextSgList[0]]
            : [DEFAULT_SUBGROUP_GID];
      const nextDefaultSg =
        nextDefaultList[0] ?? nextSgList[0] ?? DEFAULT_SUBGROUP_GID;
      const rowU = configPanelRow.unitGid;
      const needsSplitBehavior =
        rowU != null &&
        resolvedUnitGid != null &&
        rowU.trim() !== resolvedUnitGid.trim();

      setOptimisticIndicators((prev) =>
        prev.map((ind) => {
          if (ind.indicator_nid !== configPanelRow.indicator.indicator_nid) {
            return ind;
          }
          const nextUnitSet = new Set(ind.unit_gid ?? []);
          if (needsSplitBehavior && unitChangeMode === "replace") {
            if (rowU && rowU !== resolvedUnitGid) {
              nextUnitSet.delete(rowU);
            }
          }
          if (resolvedUnitGid) {
            nextUnitSet.add(resolvedUnitGid);
          }
          const nextSgid = { ...(ind.s_gid ?? {}) };
          if (needsSplitBehavior && unitChangeMode === "replace") {
            if (rowU && rowU !== resolvedUnitGid) {
              delete nextSgid[rowU];
            }
          }
          if (resolvedUnitGid) {
            nextSgid[resolvedUnitGid] = {
              sg_gid: nextSgList,
              default_sg_gids: nextDefaultList,
            };
          }
          return {
            ...ind,
            indicator_name: panelFormName,
            indicator_gid: panelFormGid || ind.indicator_gid,
            highisgood: panelFormHighIsGood,
            indicator_order:
              panelFormDisplayOrder !== ""
                ? Number(panelFormDisplayOrder)
                : ind.indicator_order,
            unit_gid: Array.from(nextUnitSet),
            s_gid: nextSgid,
          };
        })
      );
      setActiveRowId(
        `${configPanelRow.indicator.indicator_nid}-${resolvedUnitGid ?? "none"}`
      );
      if (needsSplitBehavior && unitChangeMode === "add" && resolvedUnitGid) {
        const newRowId = `${configPanelRow.indicator.indicator_nid}-${resolvedUnitGid}`;
        setRecentCreatedRowIds([newRowId]);
        setPinnedIndicatorRowIds((prev) => [
          newRowId,
          ...prev.filter((x) => x !== newRowId),
        ]);
      }
      return true;
    },
    [
      configPanelRow,
      panelIndicatorDetail,
      panelFormUnitGid,
      panelDefaultSgGids,
      panelSgGids,
      panelFormName,
      panelFormGid,
      panelFormShortName,
      panelFormKeywords,
      panelFormDisplayOrder,
      panelFormHighIsGood,
      dwId,
    ]
  );

  /** Panel Save: core PATCH then optional metadata / validation for the active tab. */
  const runFullPanelSave = useCallback(
    async (
      unitMode: UnitIusChangeMode,
      options?: { panelTab?: ConfigPanelTab }
    ) => {
      if (!configPanelRow) return;
      const tab = options?.panelTab ?? configPanelTab;
      const id = String(
        configPanelRow.indicator.indicator_nid ??
          configPanelRow.indicator.indicator_gid ??
          ""
      );
      setPanelSaveLoading(true);
      setPanelSaveError(null);
      try {
        const ok = await runConfigPanelCoreSave(unitMode);
        if (!ok) return;

        const computeSave =
          (await panelComputeTabRef.current?.saveComputeIfNeeded()) ?? {
            ok: true as const,
          };
        if (!computeSave.ok) {
          const msg =
            computeSave.tab === "total"
              ? t(
                  "COMPUTE_TOTAL_SAVE_FAILED",
                  "Could not save the Total compute rule. Add at least one source IUS or turn off Total."
                )
              : computeSave.tab === "minus"
                ? t(
                    "COMPUTE_MINUS_SAVE_FAILED",
                    "Could not save the Minus compute rule. Choose both Minuend and Subtrahend IUS, or turn off Minus."
                  )
                : computeSave.tab === "percentage"
                  ? t(
                      "COMPUTE_PERCENT_SAVE_FAILED",
                      "Could not save the Percentage compute rule. Choose numerator and denominator IUS, or turn off Percentage."
                    )
                  : computeSave.tab === "timePeriod"
                    ? t(
                        "COMPUTE_TIME_SAVE_FAILED",
                        "Could not save the Time period compute rule. Check frequencies and decimals, or turn off Time period."
                      )
                    : t(
                        "COMPUTE_AREA_SAVE_FAILED",
                        "Could not save the Area compute rule. Choose valid target and source levels (target level must be less than source level), or turn off Area."
                      );
          setPanelSaveError(msg);
          return;
        }

        if (tab === "indicator" || tab === "subgroups" || tab === "compute") {
          toast.success(
            t("INDICATORS_PANEL_SAVE_SUCCESS", "Changes saved")
          );
          return;
        }

        if (tab === "metadata") {
          const items =
            panelMetadataTabRef.current?.getUpdateItems() ?? null;
          if (items === null) {
            setPanelSaveError(
              "Metadata is still loading. Try again in a moment."
            );
          } else if (items.length === 0) {
            toast.success(
              t("INDICATORS_PANEL_SAVE_SUCCESS", "Changes saved")
            );
          } else {
            const res = await updateIndicatorMetadata(dwId, id, items);
            if (res.success) {
              const errs = res.meta?.errors;
              if (Array.isArray(errs) && errs.length > 0) {
                toast.message(
                  typeof errs[0] === "object" &&
                    errs[0] &&
                    "error" in errs[0]
                    ? String((errs[0] as { error?: unknown }).error)
                    : "Some metadata rows reported warnings — check API meta.errors"
                );
              } else {
                toast.success(t("METADATA_SAVE_SUCCESS"));
              }
            } else {
              setPanelSaveError(
                res.err_message ?? "Failed to save metadata"
              );
            }
          }
          return;
        }

        if (tab === "validation") {
          const payload =
            panelValidationTabRef.current?.getUpsertPayload();
          if (payload == null) {
            setPanelSaveError(
              panelValidationTabRef.current?.getBlockingReason() ??
                "Cannot save validation rules."
            );
          } else {
            const res = await upsertIndicatorValidationRules(
              dwId,
              id,
              payload
            );
            if (res.success) {
              toast.success(
                t(
                  "VALIDATION_SAVE_SUCCESS",
                )
              );
            } else {
              setPanelSaveError(
                res.err_message ?? "Failed to save validation rules"
              );
            }
          }
        }
      } finally {
        setPanelSaveLoading(false);
      }
    },
    [configPanelRow, configPanelTab, runConfigPanelCoreSave, dwId, t]
  );

  /** Unit GIDs linked to the indicator (list + detail) for the validation-rules tab. */
  const validationIndicatorUnitGids = useMemo(() => {
    const s = new Set<string>();
    const ind = configPanelRow?.indicator;
    if (ind) {
      for (const u of ind.unit_gid ?? []) {
        if (typeof u === "string" && u.trim()) s.add(u.trim());
      }
      if (ind.s_gid) {
        for (const k of Object.keys(ind.s_gid)) {
          if (k) s.add(k);
        }
      }
    }
    const d = panelIndicatorDetail;
    if (d && typeof d === "object") {
      const ug = d.unit_gid ?? d.u_gid;
      if (Array.isArray(ug)) {
        for (const u of ug) {
          if (typeof u === "string" && u.trim()) s.add(u.trim());
        }
      }
      const sg = d.s_gid as Record<string, unknown> | undefined;
      if (sg && typeof sg === "object") {
        for (const k of Object.keys(sg)) {
          if (k) s.add(k);
        }
      }
    }
    return [...s];
  }, [configPanelRow, panelIndicatorDetail]);

  /** Subgroup GIDs that have a saved compute rule for the panel unit (subgroup_compute_formula on indicator GET). */
  const panelSubgroupGidsWithComputeFormula = useMemo(() => {
    const d = panelIndicatorDetail;
    if (!d || typeof d !== "object") return [];
    const u = (
      panelFormUnitGid.trim() ||
      configPanelRow?.unitGid?.trim() ||
      ""
    ).trim();
    if (!u) return [];
    const sgMap = d.s_gid as
      | Record<string, { sg_gid_with_compute_formula?: string[] }>
      | undefined;
    const list = sgMap?.[u]?.sg_gid_with_compute_formula;
    return Array.isArray(list) ? [...list] : [];
  }, [panelIndicatorDetail, panelFormUnitGid, configPanelRow?.unitGid]);

  const getSubgroupFallbackLabel = useCallback(
    (gid: string) => (gid === DEFAULT_SUBGROUP_GID ? t("TOTAL") : gid),
    [t]
  );

  const getPanelSubgroupDisplayName = useCallback(
    (gid: string) => {
      const fromLocal = panelSgDisplayNames[gid]?.trim();
      if (fromLocal) return fromLocal;
      const metaName = meta?.subgroup?.[gid]?.sg_name?.trim();
      if (metaName) return metaName;
      const row = subgroupsForDropdown.find((s) => (getSubgroupGid(s) ?? "") === gid);
      if (row) {
        const fromList = getSubgroupName(row).trim();
        if (fromList && fromList !== gid) return fromList;
      }
      return gid === DEFAULT_SUBGROUP_GID ? t("TOTAL") : gid;
    },
    [
      panelSgDisplayNames,
      meta?.subgroup,
      subgroupsForDropdown,
      getSubgroupGid,
      getSubgroupName,
      t,
    ]
  );

  const panelUnitComboOptions = panelUnitPicker.comboOptions;

  const panelUnitShowCreate = useMemo(() => {
    const term = panelUnitSearch.trim();
    if (!term || panelUnitPicker.loading) return false;
    return !panelUnitPicker.exactNameMatch;
  }, [panelUnitSearch, panelUnitPicker.loading, panelUnitPicker.exactNameMatch]);

  const panelUnitOptionCount =
    panelUnitComboOptions.length + (panelUnitShowCreate ? 1 : 0);

  const handlePanelCreateUnit = useCallback(async () => {
    const name = panelUnitSearch.trim();
    if (!name || panelUnitCreateLoading) return;
    setPanelUnitCreateLoading(true);
    setPanelSaveError(null);
    try {
      const createRes = await createUnits(dwId, [{ unit_name: name }]);
      if (!createRes.success) {
        setPanelSaveError(createRes.err_message ?? "Failed to create unit");
        return;
      }
      const created = createRes.data;
      const newGid =
        created?.[0]?.unit_gid ?? (created?.[0] as { u_gid?: string })?.u_gid ?? null;
      if (!newGid) {
        setPanelSaveError("Created unit but no GID returned");
        return;
      }
      registerUnitExtra(name, newGid);
      panelUnitPicker.refresh();
      setPanelFormUnitGid(newGid);
      setPanelUnitSearch("");
      setPanelUnitComboOpen(false);
      setPanelUnitHighlightIdx(-1);
    } finally {
      setPanelUnitCreateLoading(false);
    }
  }, [
    dwId,
    panelUnitSearch,
    panelUnitCreateLoading,
    registerUnitExtra,
    panelUnitPicker,
  ]);

  const getSubgroupDisplay = (defaultSgGid: string | null) => {
    if (defaultSgGid == null) return "—";
    return (
      meta?.subgroup?.[defaultSgGid]?.sg_name ??
      getSubgroupFallbackLabel(defaultSgGid)
    );
  };

  const getSubgroupListDisplay = (sgGids: string[]) => {
    if (!sgGids.length) return "—";
    const names = sgGids.map(
      (gid) => meta?.subgroup?.[gid]?.sg_name ?? getSubgroupFallbackLabel(gid)
    );
    return names;
  };

  const onInlineEnterSave = useCallback(() => {
    if (inlineSaveLoading || inlineRowUnitCreateLoading) return;
    void handleInlineEditSave();
  }, [inlineSaveLoading, inlineRowUnitCreateLoading, handleInlineEditSave]);

  const indicatorSortIcon = useMemo(
    () =>
      indicatorSortHeaderMaterialIcon(
        "indicator",
        listSort.columnId,
        listSort.direction
      ),
    [listSort.columnId, listSort.direction]
  );

  const indicatorTableColumns = useIndicatorTableColumns({
    t,
    rowsLength: rows.length,
    selectedRowIds,
    selectAll,
    toggleSelect,
    onSortIndicator,
    indicatorSortIcon,
    colFilterIndicator,
    setColFilterIndicator,
    colFilterUnits,
    setColFilterUnits,
    colFilterSubgroups,
    setColFilterSubgroups,
    highIsGoodFilter,
    setHighIsGoodFilter,
    inlineEdit,
    setInlineEdit,
    inlineEditNameInputRef,
    inlineEditUnitInputRef,
    inlineEditHighToggleRef,
    inlineSaveLoading,
    inlineRowUnitCreateLoading,
    inlineRowUnitShowCreate,
    inlineUnitComboOptions: inlineUnitPicker.comboOptions,
    inlineUnitPickerLoading: inlineUnitPicker.loading,
    onInlineUnitListScroll: handleInlineUnitListScroll,
    onInlineUnitNeedMore: handleInlineUnitNeedMore,
    inlineUnitListFooter,
    resolveUnitInputLabel,
    meta,
    onInlineCellDoubleClick,
    handleInlineCreateUnit,
    handleInlineEditSave,
    handleInlineEditCancel,
    openConfigPanel,
    getUnitDisplay,
    getSubgroupListDisplay,
    getSubgroupFallbackLabel,
    rows,
  });

  const tableListState = useMemo(
    () => ({
      ...listState,
      rows,
    }),
    [listState, rows]
  );

  const showClickOutside = dwDropdownOpen || filterDropdownOpen;
  /** Block add-new row while a data row is in inline edit or user lacks create permission */
  const addRowDisabledByInlineEdit = inlineEdit != null;
  const addRowDisabledByPermission = !canCreate;
  useEffect(() => {
    if (!inlineEdit) return;
    setUnitDropdownOpen(false);
    setAddRowUnitHighlightIdx(-1);
  }, [inlineEdit]);

  const indicatorListAddRowFields = useMemo((): ServerDrivenListAddRowField[] => {
    const unitInputValue = newUnitGid
      ? resolveUnitInputLabel(newUnitGid)
      : unitSearch;

    const addRowSubgroupReadOnlyLabel =
      newSubgroupGid != null
        ? getSubgroupName(
            subgroupsForDropdown.find((s) => getSubgroupGid(s) === newSubgroupGid) ??
              ({} as SubgroupRaw)
          ) || getSubgroupFallbackLabel(newSubgroupGid)
        : "—";

    return [
      {
        kind: "custom" as const,
        content: <span className="inline-block h-4 w-4" />,
      },
      {
        kind: "custom" as const,
        content: pendingAddIndicator ? (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="cell-name">{pendingAddIndicator.name}</span>
            {pendingAddIndicator.gid ? (
              <span
                className="break-all text-xs text-text-muted"
                title={t("INDICATOR_GID_TITLE")}
              >
                {pendingAddIndicator.gid}
              </span>
            ) : null}
          </div>
        ) : (
          <GridInlineTextField
            className={gridTextFieldClassName()}
            inputRef={addRowIndicatorInputRef}
            placeholder={t("PLACEHOLDER_INDICATOR_NAME")}
            value={newIndicatorName}
            onChange={setNewIndicatorName}
            onBlur={() => {
              void handleAddRowCreateIndicatorOnly({ silentIfEmpty: true });
            }}
            disabled={createLoading || iusLinkLoading || addRowDisabledByInlineEdit}
            ariaLabel={t("NEW_INDICATOR_NAME")}
          />
        ),
      },
      {
        kind: "autocomplete" as const,
        inputRef: addRowUnitInputRef,
        listRef: unitListRef,
        inputValue: unitInputValue,
        onInputChange: (v) => {
          setUnitSearch(v);
          setAddRowUnitHighlightIdx(-1);
          if (!v) setNewUnitGid(null);
          else if (newUnitGid) {
            const curName = resolveUnitInputLabel(newUnitGid);
            if (
              curName &&
              v.trim().toLowerCase() !== curName.trim().toLowerCase()
            ) {
              setNewUnitGid(null);
            }
          }
        },
        open: unitDropdownOpen,
        setOpen: setUnitDropdownOpen,
        highlightIdx: addRowUnitHighlightIdx,
        setHighlightIdx: setAddRowUnitHighlightIdx,
        options: addRowUnitOptions,
        selectedId: newUnitGid,
        onSelect: (gid) => {
          setNewUnitGid(gid);
          setUnitSearch("");
          setUnitDropdownOpen(false);
          setAddRowUnitHighlightIdx(-1);
          focusAddRowHighToggle();
        },
        placeholder: t("UNIT_COMBO_PLACEHOLDER"),
        disabled:
          createLoading ||
          addRowUnitCreateLoading ||
          iusLinkLoading ||
          addRowDisabledByInlineEdit,
        ariaLabel: t("INDICATORS_ADD_ARIA_UNIT"),
        emptyHint: addRowUnitPicker.loading ? t("LOADING") : t("NO_UNITS_MATCH"),
        optionCountForKeyboard: addRowUnitOptionCount,
        createOption: addRowUnitShowCreate
          ? {
              show: true,
              loading: addRowUnitCreateLoading,
              label: t("CREATE_UNIT").replace(
                "{name}",
                unitSearch.trim()
              ),
              onCreate: () => void handleAddRowCreateUnit(),
              highlightIndex: addRowUnitOptions.length,
            }
          : undefined,
        onListScroll: handleAddRowUnitListScroll,
        onNeedMoreIfNotScrollable: handleAddRowUnitNeedMore,
        listFooter: addRowUnitListFooter,
        dropdownInteractive: !addRowDisabledByInlineEdit,
      },
      {
        kind: "custom" as const,
        content: (
          <div
            className="dim-list px-1"
            title={t("SUBGROUPS")}
            aria-label={t("INDICATORS_ADD_ARIA_SUBGROUP")}
          >
            <span className="cell-name text-text-muted">{addRowSubgroupReadOnlyLabel}</span>
          </div>
        ),
      },
      {
        kind: "toggle" as const,
        pressed: addRowHighIsGood,
        onToggle: () => void handleAddRowToggleHighIsGood(),
        disabled:
          createLoading ||
          iusLinkLoading ||
          addRowHighGoodSaving ||
          addRowDisabledByInlineEdit,
        saving: addRowHighGoodSaving,
        ariaLabel: t("HIGH_IS_GOOD"),
      },
    ];
  }, [
    addRowUnitOptions,
    addRowUnitPicker.loading,
    addRowUnitListFooter,
    handleAddRowUnitListScroll,
    handleAddRowUnitNeedMore,
    resolveUnitInputLabel,
    newUnitGid,
    newSubgroupGid,
    getSubgroupFallbackLabel,
    unitSearch,
    subgroupsForDropdown,
    focusAddRowHighToggle,
    unitDropdownOpen,
    addRowUnitHighlightIdx,
    addRowUnitOptionCount,
    addRowUnitShowCreate,
    addRowUnitCreateLoading,
    pendingAddIndicator,
    newIndicatorName,
    rows,
    getUnitDisplay,
    addRowDisabledByInlineEdit,
    addRowDisabledByPermission,
    createLoading,
    iusLinkLoading,
    addRowHighIsGood,
    addRowHighGoodSaving,
    handleAddRowCreateIndicatorOnly,
    handleAddRowCreateUnit,
    handleAddRowToggleHighIsGood,
    handleAddRowConfirmIus,
    handleAddRowDiscard,
    setNewIndicatorName,
    setUnitSearch,
    setNewUnitGid,
    setUnitDropdownOpen,
    setAddRowUnitHighlightIdx,
    t,
  ]);

  const indicatorAddRowSaveTitle = !pendingAddIndicator
    ? t(
        "INDICATORS_ADD_IUS_TITLE_DRAFT_FIRST",
        "Enter indicator name and press Enter or leave the field to create the draft, then select a unit"
      )
    : !newUnitGid
      ? t(
          "INDICATORS_ADD_IUS_TITLE_NEED_UNIT",
          "Select or create a unit before confirming"
        )
      : t(
          "INDICATORS_ADD_IUS_TITLE_CONFIRM",
          "Create indicator–unit–subgroup link"
        );
  const indicatorAddRowSaveAriaLabel = !pendingAddIndicator
    ? t(
        "CONFIRM_IUS_LINK_DRAFT_FIRST",
        "Confirm IUS link (create indicator draft first)"
      )
    : !newUnitGid
      ? t("CONFIRM_IUS_LINK_NEED_UNIT", "Confirm IUS link (select unit)")
      : t("CONFIRM_IUS_LINK");

  const clickOutsideOverlay = showClickOutside ? (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200 }}
      aria-hidden
      onClick={() => {
        setDwDropdownOpen(false);
        setFilterDropdownOpen(false);
      }}
    />
  ) : null;

  if (!allowed) return null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overflow-x-hidden">
      {/* Table wrapper */}
      <ServerDrivenTable<IndicatorTableRow, IndicatorsListMeta>
            listState={tableListState}
            columns={indicatorTableColumns}
            selection={{
              count: selectedRowIds.size,
              onClear: clearSelection,
            }}
            scrollRef={tblScrollRef}
            renderThead={() => (
                <thead>
                  <EditableDataGridThead columns={indicatorTableColumns} />
                </thead>
            )}
            tbody={
              <ServerDrivenListTbody<IndicatorTableRow>
                colSpan={6}
                rows={rows}
                columns={indicatorTableColumns}
                getRowId={(r) => r.rowId}
                activeRowId={activeRowId}
                editingRowId={inlineEdit?.rowId ?? null}
                onDataRowEnterAtEnd={({ mode }) => {
                  if (mode === "edit") onInlineEnterSave();
                }}
                onDataRowEscape={({ mode }) => {
                  if (mode === "edit") handleInlineEditCancel();
                }}
                onDeleteKeyToggleRowSelection={toggleSelect}
                getRowClassName={(row) =>
                  [
                    selectedRowIds.has(row.rowId) ? "selected" : "",
                    configPanelRow?.rowId === row.rowId ? "settings-active" : "",
                    recentCreatedRowIdSet.has(row.rowId)
                      ? TV_ROW_NEWLY_ADDED_CLASS
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")
                }
                trProps={(row) => ({
                  className: configPanelOpen ? "tv-grid-row--clickable" : undefined,
                  onClick: (e: ReactMouseEvent<HTMLTableRowElement>) => {
                    if (!configPanelOpen) return;
                    if (configPanelRow?.rowId === row.rowId) return;
                    const clickTarget = e.target as HTMLElement;
                    if (
                      clickTarget.closest(
                        "input, button, textarea, select, label, [role='listbox'], [role='option']"
                      )
                    ) {
                      return;
                    }
                    openConfigPanel(row);
                  },
                })}
                emptyMessage={t("INDICATORS_EMPTY")}
                showLoadingRow={false}
                showEmptyRow={!loading && rows.length === 0}
                showDataRows={!loading}
                addRow={{
                  ref: addRowRef,
                  promptLabel: t("ADD_INDICATOR_PROMPT"),
                  expanded: addRowExpanded,
                  onExpandedChange: setAddRowExpanded,
                  primaryColumnId: "indicator",
                  disabled: addRowDisabledByInlineEdit || addRowDisabledByPermission,
                  disabledTitle: addRowDisabledByPermission
                    ? t("NO_PERMISSION_CREATE")
                    : addRowDisabledByInlineEdit
                      ? t(
                          "INDICATORS_ADD_ROW_FINISH_EDIT_FIRST",
                          "Finish editing the indicator row below before adding a new one"
                        )
                      : undefined,
                  onExpand: () => {
                    queueMicrotask(() => addRowIndicatorInputRef.current?.focus());
                  },
                  className: `add-row${addRowExpanded ? "" : " add-row-collapsed"}${addRowDisabledByInlineEdit || addRowDisabledByPermission ? " add-row-interaction-blocked" : ""}`,
                  ariaDisabled: addRowDisabledByInlineEdit || addRowDisabledByPermission,
                  title: addRowDisabledByPermission
                    ? t("NO_PERMISSION_CREATE")
                    : addRowDisabledByInlineEdit
                      ? t(
                          "INDICATORS_ADD_ROW_FINISH_EDIT_FIRST",
                          "Finish editing the indicator row below before adding a new one"
                        )
                      : undefined,
                  onRowEnterAtEnd: () => {
                    if (addRowDisabledByInlineEdit || addRowDisabledByPermission) return;
                    if (!addRowExpanded) {
                      setAddRowExpanded(true);
                      queueMicrotask(() => addRowIndicatorInputRef.current?.focus());
                      return;
                    }
                    if (!pendingAddIndicator) {
                      if (!newUnitGid?.trim()) {
                        void handleAddRowCreateIndicatorOnly();
                        return;
                      }
                      void (async () => {
                        const createdDraft = await handleAddRowCreateIndicatorOnly({
                          focusUnitAfterCreate: false,
                        });
                        if (!createdDraft) return;
                        await handleAddRowConfirmIus({
                          indicator: createdDraft,
                          unitGid: newUnitGid,
                          subgroupGid: newSubgroupGid,
                        });
                      })();
                      return;
                    }
                    if (!newUnitGid) {
                      toast.error("Select or create a unit before confirming.");
                      queueMicrotask(() => addRowUnitInputRef.current?.focus());
                      return;
                    }
                    void handleAddRowConfirmIus();
                  },
                  onRowEscape: () => {
                    if (addRowExpanded) {
                      void handleAddRowDiscard();
                    }
                  },
                  onArrowIntoRow: addRowDisabledByInlineEdit
                    ? undefined
                    : () => {
                        setAddRowExpanded(true);
                      },
                  onArrowLeaveRow: addRowDisabledByInlineEdit
                    ? undefined
                    : () => {
                        setAddRowExpanded(false);
                        setUnitDropdownOpen(false);
                      },
                  expandedFields: indicatorListAddRowFields,
                  collapsedSave: {
                    title: t(
                      "INDICATORS_ADD_IUS_TITLE_DRAFT_FIRST",
                      "Enter indicator name and press Enter or leave the field to create the draft, then select a unit"
                    ),
                    ariaLabel: t(
                      "CONFIRM_IUS_LINK_DRAFT_FIRST",
                      "Confirm IUS link (create indicator draft first)"
                    ),
                  },
                  collapsedCancel: {
                    title: t("ADD_CLEAR_ROW"),
                    ariaLabel: t("ADD_CLEAR_ROW"),
                  },
                  showActionsColumn: !addRowDisabledByPermission,
                  actionsWidth: "icon",
                  save: {
                    title: indicatorAddRowSaveTitle,
                    ariaLabel: indicatorAddRowSaveAriaLabel,
                    disabled:
                      iusLinkLoading ||
                      createLoading ||
                      !pendingAddIndicator ||
                      !newUnitGid ||
                      addRowDisabledByInlineEdit,
                    onClick: () => void handleAddRowConfirmIus(),
                  },
                  cancel: {
                    title: pendingAddIndicator
                      ? t(
                          "INDICATORS_ADD_CANCEL_DRAFT_TITLE",
                          "Cancel and remove draft indicator"
                        )
                      : t("ADD_CLEAR_ROW"),
                    ariaLabel: pendingAddIndicator
                      ? t("CANCEL_DRAFT_INDICATOR")
                      : t("ADD_CLEAR_ROW"),
                    disabled:
                      iusLinkLoading || createLoading || addRowDisabledByInlineEdit,
                    onClick: () => void handleAddRowDiscard(),
                  },
                }}
              />
            }
            pagination={{
              page,
              displayPage: meta?.page ?? page,
              totalPages,
              totalCount,
              totalCountUnfiltered: optimisticTotalCountUnfiltered,
              pageSize,
              onPageChange: setPage,
              onPageSizeChange: setPageSize,
              countNoun: t("FOOTER_NOUN_INDICATORS"),
              labels: { t, filteredOnly: "FOOTER_OF_TOTAL_INDICATORS" },
            }}
          />

      <Modal
        open={unitChangeDialog != null}
        onClose={() => setUnitChangeDialog(null)}
        title={t("UNIT_CHANGE_IUS_TITLE", "Change unit for this row")}
        titleId="dm-unit-ius-title"
        className="!max-w-[min(96vw,636px)]"
        dismissDisabled={inlineSaveLoading || panelSaveLoading}
        closeAriaLabel={t("CLOSE")}
        footerClassName="!justify-start flex w-full min-w-0 flex-nowrap items-center gap-2"
        footer={
          <>
            <button
              type="button"
              className="btn-comp-secondary btn-comp--comfortable shrink-0 whitespace-nowrap text-sm font-semibold"
              disabled={inlineSaveLoading || panelSaveLoading}
              onClick={() => setUnitChangeDialog(null)}
            >
              {t("CANCEL")}
            </button>
            <div className="flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-2 overflow-x-auto">
              <button
                type="button"
                className="btn-comp-secondary btn-comp--comfortable shrink-0 whitespace-nowrap text-sm font-semibold"
                disabled={inlineSaveLoading || panelSaveLoading}
                onClick={() => {
                  const d = unitChangeDialog;
                  if (!d) return;
                  if (d.source === "inline") {
                    setUnitChangeDialog(null);
                    setInlineSaveLoading(true);
                    void (async () => {
                      try {
                        await executeInlineSave(
                          d.row,
                          d.editSnapshot,
                          d.formSgList,
                          d.defaultSg,
                          d.formUnit,
                          "add"
                        );
                      } finally {
                        setInlineSaveLoading(false);
                      }
                    })();
                  } else {
                    setUnitChangeDialog(null);
                    void runFullPanelSave("add", { panelTab: d.panelTab });
                  }
                }}
              >
                {t(
                  "UNIT_CHANGE_IUS_ADD",
                  "Keep old unit and add new link"
                )}
              </button>
              <button
                type="button"
                className="btn-comp-primary btn-comp--comfortable shrink-0 whitespace-nowrap text-sm font-semibold"
                disabled={inlineSaveLoading || panelSaveLoading}
                onClick={() => {
                  const d = unitChangeDialog;
                  if (!d) return;
                  if (d.source === "inline") {
                    setUnitChangeDialog(null);
                    setInlineSaveLoading(true);
                    void (async () => {
                      try {
                        await executeInlineSave(
                          d.row,
                          d.editSnapshot,
                          d.formSgList,
                          d.defaultSg,
                          d.formUnit,
                          "replace"
                        );
                      } finally {
                        setInlineSaveLoading(false);
                      }
                    })();
                  } else {
                    setUnitChangeDialog(null);
                    void runFullPanelSave("replace", {
                      panelTab: d.panelTab,
                    });
                  }
                }}
              >
                {inlineSaveLoading || panelSaveLoading
                  ? t("SAVING")
                  : t(
                      "UNIT_CHANGE_IUS_REPLACE",
                      "Replace link (remove old unit)"
                    )}
              </button>
            </div>
          </>
        }
      >
        {unitChangeDialog ? (
          <>
            <p className="modal-lead">
              {unitChangeDialog.source === "inline"
                ? t(
                    "UNIT_CHANGE_IUS_LEAD_INLINE",
                    "You changed the unit for this indicator row. Replace the existing indicator–unit link, or keep the current unit and add a new link (both units will stay associated)."
                  )
                : t(
                    "UNIT_CHANGE_IUS_LEAD_PANEL",
                    "You changed the unit for this indicator. Replace the existing indicator–unit link, or keep the current unit and add a new link (both units will stay associated)."
                  )}
            </p>
            <ul className="modal-list" style={{ marginTop: 8 }}>
              <li>
                <span className="modal-list-name">
                  {t("UNIT_CHANGE_IUS_FROM", "Current unit")}:{" "}
                  {unitChangeDialog.source === "inline"
                    ? getUnitDisplay(
                        unitChangeDialog.editSnapshot.originalUnitGid
                      )
                    : configPanelRow?.unitGid
                      ? getUnitDisplay(configPanelRow.unitGid)
                      : "—"}
                </span>
              </li>
              <li>
                <span className="modal-list-name">
                  {t("UNIT_CHANGE_IUS_TO", "New unit")}:{" "}
                  {unitChangeDialog.source === "inline"
                    ? getUnitDisplay(unitChangeDialog.formUnit)
                    : getUnitDisplay(panelFormUnitGid.trim() || null)}
                </span>
              </li>
            </ul>
          </>
        ) : null}
      </Modal>

      <DeletePermanentConfirmModal
        open={deleteModalOpen}
        onClose={closeDeleteModal}
        title={t("DELETE_INDICATORS")}
        titleId="dm-delete-title"
        dismissDisabled={deleteRunning}
        closeAriaLabel={t("CLOSE")}
        cancelLabel={t("CANCEL")}
        onCancel={closeDeleteModal}
        confirmLabel={t("DELETE_PERMANENTLY")}
        confirmLoadingLabel={t("DELETING")}
        confirmDisabled={deleteAssocLoading}
        confirmLoading={deleteRunning}
        onConfirm={handleConfirmBulkDelete}
        impact={{
          title: t("IMPACT_PREVIEW"),
          loading: deleteAssocLoading,
          loadingLabel: t("LOADING"),
          error: deleteAssocError,
          errorInfoLabel: t(
            "DELETE_PREVIEW_INFO_ONLY",
            "You can still delete; the preview above is only informational."
          ),
          lines: deleteAssoc
            ? dataIusAssociationImpactLines(
                {
                  dataRows: t("IMPACT_DATA_ROWS"),
                  iusRows: t("IMPACT_IUS_ROWS"),
                },
                {
                  dataCount: deleteAssoc.data_count,
                  iusCount: deleteAssoc.ius_count,
                }
              )
            : null,
        }}
        runError={deleteRunError}
      >
        <p className="modal-lead">
          {t("INDICATORS_DELETE_MODAL_LEAD").replace(
            "{count}",
            String(indicatorsToDelete.length)
          )}
        </p>
        <ul className="modal-list">
          {indicatorsToDelete.map((ind) => (
            <li key={ind.indicator_nid}>
              <span className="modal-list-name">
                {ind.indicator_name ?? ind.indicator_gid ?? `NID ${ind.indicator_nid}`}
              </span>
              {ind.indicator_gid ? (
                <span className="modal-list-meta">{ind.indicator_gid}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </DeletePermanentConfirmModal>

      <Modal
        open={sgRemovalConfirm != null}
        onClose={() => setSgRemovalConfirm(null)}
        title={t("SUBGROUP_REMOVAL_CONFIRM_TITLE", "Remove subgroup associations")}
        titleId="dm-sg-removal-title"
        dismissDisabled={panelSaveLoading}
        closeAriaLabel={t("CLOSE")}
        footer={
          <>
            <button
              type="button"
              className="btn-comp-secondary !h-9 shrink-0 whitespace-nowrap text-sm font-semibold"
              disabled={panelSaveLoading}
              onClick={() => setSgRemovalConfirm(null)}
            >
              {t("CANCEL")}
            </button>
            <button
              type="button"
              className="btn-comp-primary !h-9 shrink-0 whitespace-nowrap text-sm font-semibold"
              disabled={panelSaveLoading}
              onClick={() => {
                const mode = sgRemovalConfirm?.unitMode ?? "replace";
                setSgRemovalConfirm(null);
                void runFullPanelSave(mode);
              }}
            >
              {panelSaveLoading
                ? t("SAVING")
                : t("CONFIRM_AND_SAVE", "Confirm & Save")}
            </button>
          </>
        }
      >
        {sgRemovalConfirm ? (
          <>
            <p className="modal-lead">
              {t(
                "SUBGROUP_REMOVAL_CONFIRM_LEAD",
                "You are removing {count} subgroup association(s) from this indicator. This action will disassociate the following subgroups."
              ).replace("{count}", String(sgRemovalConfirm.removedGids.length))}
            </p>
            <div className="modal-impact">
              <div className="modal-impact-title">
                {t("REMOVED_SUBGROUPS", "Subgroups being removed")}
              </div>
              <ul className="modal-impact-list">
                {sgRemovalConfirm.removedGids.map((gid) => (
                  <li key={gid}>
                    <span className="modal-list-name">
                      {getPanelSubgroupDisplayName(gid)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </Modal>

      <div className="panel-extras">
        {clickOutsideOverlay}
        <div
          className={`sp-panel ${configPanelOpen ? "translate-x-0" : "translate-x-full"}`}
          id="sp-panel"
          aria-hidden={!configPanelOpen}
        >
          <div className="sp-header">
            <ModalCloseButton
              onClick={closeConfigPanel}
              ariaLabel={t("CLOSE")}
            />
            <div className="sp-header-info">
              <div className="sp-title" id="sp-title">
                {configPanelRow
                  ? configPanelRow.unitGid
                    ? `${configPanelRow.indicator!.indicator_name ?? configPanelRow.indicator!.indicator_gid ?? t("INDICATORS")}, ${getUnitDisplay(configPanelRow.unitGid)}`
                    : (configPanelRow.indicator!.indicator_name ??
                      configPanelRow.indicator!.indicator_gid ??
                      t("INDICATORS"))
                  : t("INDICATOR_SETTINGS")}
              </div>
            </div>
            <PrimarySaveButton
              onClick={async () => {
                if (!configPanelRow) return;
                setPanelSaveError(null);
                const resolvedUnitGid = panelFormUnitGid.trim() || null;
                const hasSubgroupSelection =
                  panelSgGids.length > 0 || panelDefaultSgGids.length > 0;
                if (!resolvedUnitGid && hasSubgroupSelection) {
                  const msg =
                    "Unit is not selected. Please select a unit before saving subgroup changes.";
                  setPanelSaveError(msg);
                  return;
                }

                const rowU = configPanelRow.unitGid?.trim() || null;
                const needsUnitIusChoice =
                  rowU != null &&
                  resolvedUnitGid != null &&
                  rowU !== resolvedUnitGid;

                if (needsUnitIusChoice) {
                  setUnitChangeDialog({
                    source: "panel",
                    panelTab: configPanelTab,
                  });
                  return;
                }

                const removedSgGids = configPanelRow.sgGids.filter(
                  (g) => !panelSgGids.includes(g)
                );
                if (removedSgGids.length > 0) {
                  setSgRemovalConfirm({ removedGids: removedSgGids, unitMode: "replace" });
                  return;
                }

                await runFullPanelSave("replace");
              }}
              disabled={panelSaveLoading || panelDetailLoading || !canUpdate}
              title={
                !canUpdate
                  ? t(
                      "NO_PERMISSION_UPDATE",
                      "You do not have permission to update this indicator"
                    )
                  : undefined
              }
            >
              {panelSaveLoading
                ? t("SAVING")
                : t("SAVE")}
            </PrimarySaveButton>
          </div>
          <div className="sp-panel-main relative flex min-h-0 flex-1 flex-col">
            <MainTabsBar
              className="shrink-0"
              tabRole
              tabs={[
                { value: "indicator", label: t("LABEL_INDICATOR"), icon: "bar_chart" },
                { value: "subgroups", label: t("SUBGROUPS"), icon: "account_tree" },
                { value: "validation", label: t("VALIDATION_RULES"), icon: "rule" },
                { value: "metadata", label: t("LABEL_METADATA"), icon: "info" },
                { value: "compute", label: t("COMPUTE"), icon: "calculate" },
              ]}
              activeValue={configPanelTab}
              onSelect={(v) => setConfigPanelTab(v)}
            />
            <div className="sp-body-wrap">
              <div
                className={`sp-body${
                configPanelTab === "metadata" || configPanelTab === "compute"
                  ? " sp-body--metadata"
                  : ""
              }${
                configPanelTab === "validation"
                  ? " sp-body--validation"
                  : configPanelTab === "subgroups"
                    ? " sp-body--subgroups"
                    : ""
              }`}
              id="sp-body"
            >
            {configPanelTab === "indicator" && configPanelRow && (
              <div className="mb-7">
                <fieldset
                  disabled={!canUpdate}
                  className="sp-grid m-0 min-w-0 border-0 p-0"
                >
                  <div className="sp-field">
                    <label className="form-label">{t("NAME")}</label>
                    <input
                      className="field-comp--md"
                      value={panelFormName}
                      onChange={(e) => setPanelFormName(e.target.value)}
                      placeholder={t("PLACEHOLDER_INDICATOR_NAME")}
                    />
                  </div>
                  <div className="sp-field">
                    <label className="form-label">{t("ID")}</label>
                    <input
                      className="field-comp--md"
                      value={panelFormGid}
                      onChange={(e) => setPanelFormGid(e.target.value)}
                      placeholder={t("INDICATOR_GID")}
                    />
                  </div>
                  <div className="sp-field">
                    <label className="form-label">{t("SHORT_NAME")}</label>
                    <input
                      className="field-comp--md"
                      value={panelFormShortName}
                      onChange={(e) => setPanelFormShortName(e.target.value)}
                      placeholder={t("PLACEHOLDER_SHORT_NAME")}
                    />
                  </div>
                  <div className="sp-field">
                    <label className="form-label">{t("KEYWORDS")}</label>
                    <input
                      className="field-comp--md"
                      value={panelFormKeywords}
                      onChange={(e) => setPanelFormKeywords(e.target.value)}
                      placeholder={t("PLACEHOLDER_KEYWORDS")}
                    />
                  </div>
                  <div className="sp-field">
                    <label className="form-label">{t("DISPLAY_ORDER")}</label>
                    <input
                      className="field-comp--md"
                      type="number"
                      value={panelFormDisplayOrder}
                      onChange={(e) => setPanelFormDisplayOrder(e.target.value)}
                      placeholder={t("PLACEHOLDER_DISPLAY_ORDER")}
                    />
                  </div>
                  <div className="sp-field sp-field-inline">
                    <label className="form-label m-0">{t("HIGH_IS_GOOD")}</label>
                    <div className="sp-toggle-wrap">
                      <ToggleSwitch
                        checked={panelFormHighIsGood}
                        onCheckedChange={(v) => setPanelFormHighIsGood(v)}
                        aria-label={t("HIGH_IS_GOOD")}
                      />
                    </div>
                  </div>
                  <hr className="sp-divider col-span-full my-2 border-border" />
                  <div className="sp-field">
                    <label className="form-label">{t("UNITS")}</label>
                    <SearchableListCombobox
                      className="relative w-full min-w-0"
                      inputClassName="field-comp--md w-full"
                      placeholder={t("UNIT_COMBO_PLACEHOLDER")}
                      disabled={panelSaveLoading || panelUnitCreateLoading}
                      ariaLabel={t("EDIT_UNIT")}
                      inputValue={
                        panelFormUnitGid
                          ? resolveUnitInputLabel(panelFormUnitGid)
                          : panelUnitSearch
                      }
                      onInputChange={(v) => {
                        setPanelUnitSearch(v);
                        setPanelUnitComboOpen(true);
                        setPanelUnitHighlightIdx(-1);
                        const sel = panelFormUnitGid;
                        if (!v) {
                          setPanelFormUnitGid("");
                          return;
                        }
                        if (sel) {
                          const curName = resolveUnitInputLabel(sel);
                          if (
                            curName &&
                            v.trim().toLowerCase() !== curName.trim().toLowerCase()
                          ) {
                            setPanelFormUnitGid("");
                          }
                        }
                      }}
                      open={panelUnitComboOpen}
                      onOpenChange={(open) => {
                        setPanelUnitComboOpen(open);
                        if (!open) setPanelUnitHighlightIdx(-1);
                      }}
                      highlightIndex={panelUnitHighlightIdx}
                      onHighlightChange={setPanelUnitHighlightIdx}
                      navigableCount={panelUnitOptionCount}
                      options={panelUnitComboOptions}
                      selectedId={panelFormUnitGid || null}
                      onSelect={(id) => {
                        setPanelFormUnitGid(id);
                        setPanelUnitSearch("");
                        setPanelUnitComboOpen(false);
                        setPanelUnitHighlightIdx(-1);
                      }}
                      emptyMessage={
                        panelUnitPicker.loading ? t("LOADING") : t("NO_UNITS_MATCH")
                      }
                      onListScroll={handlePanelUnitListScroll}
                      onNeedMoreIfNotScrollable={handlePanelUnitNeedMore}
                      listFooter={panelUnitListFooter}
                      createSlot={
                        panelUnitShowCreate
                          ? {
                              show: true,
                              loading: panelUnitCreateLoading,
                              label: t("CREATE_UNIT").replace(
                                "{name}",
                                panelUnitSearch.trim()
                              ),
                              onCreate: () => void handlePanelCreateUnit(),
                              highlightIndex: panelUnitComboOptions.length,
                            }
                          : undefined
                      }
                    />
                  </div>
                  <div className="sp-field">
                    <label className="form-label">{t("LABEL_UNIT_ID")}</label>
                    <input
                      className="field-comp--md bg-surface-muted"
                      value={panelFormUnitGid}
                      readOnly
                      aria-readonly
                      placeholder={t("SELECT_UNIT_PROMPT")}
                    />
                  </div>
                </fieldset>
              </div>
            )}
            {configPanelTab === "subgroups" && configPanelRow && (
              <SubgroupsTabBody
                dwId={dwId}
                panelSgGids={panelSgGids}
                panelDefaultSgGids={panelDefaultSgGids}
                setPanelSgGids={setPanelSgGids}
                setPanelDefaultSgGids={setPanelDefaultSgGids}
                panelSgDisplayNames={panelSgDisplayNames}
                setPanelSgDisplayNames={setPanelSgDisplayNames}
                getSubgroupGid={getSubgroupGid}
                getSubgroupName={getSubgroupName}
                meta={meta}
                canUpdate={canUpdate}
              />
            )}
            {configPanelTab === "validation" && configPanelRow && (
              <IndicatorValidationTab
                ref={panelValidationTabRef}
                dwId={dwId}
                indicatorIdentifier={String(
                  configPanelRow.indicator.indicator_nid ??
                    configPanelRow.indicator.indicator_gid ??
                    ""
                )}
                languageCode={localeParam}
                rowUnitGid={configPanelRow.unitGid}
                indicatorUnitGids={validationIndicatorUnitGids}
                getUnitLabel={(gid) => getUnitDisplay(gid)}
                readOnly={!canUpdate}
              />
            )}
            {configPanelTab === "metadata" && configPanelRow && (
              <IndicatorMetadataTab
                ref={panelMetadataTabRef}
                dwId={dwId}
                indicatorIdentifier={String(
                  configPanelRow.indicator.indicator_nid ??
                    configPanelRow.indicator.indicator_gid ??
                    ""
                )}
                readOnly={!canUpdate}
              />
            )}
            {configPanelRow ? (
              <div
                className={
                  configPanelTab === "compute"
                    ? "flex min-h-0 min-w-0 flex-1 flex-col"
                    : "hidden"
                }
                aria-hidden={configPanelTab !== "compute"}
              >
                <IndicatorComputeTab
                  ref={panelComputeTabRef}
                  dwId={dwId}
                  locale={localeParam}
                  loadServerFormula={configPanelTab === "compute"}
                  subgroupGidsWithComputeFormulaFromApi={
                    panelSubgroupGidsWithComputeFormula
                  }
                  indicatorGid={
                    panelFormGid.trim() ||
                    configPanelRow.indicator.indicator_gid ||
                    ""
                  }
                  indicatorDisplayName={
                    panelFormName.trim() ||
                    configPanelRow.indicator.indicator_name?.trim() ||
                    configPanelRow.indicator.indicator_gid ||
                    ""
                  }
                  unitGid={
                    panelFormUnitGid.trim() || configPanelRow.unitGid || ""
                  }
                  panelSgGids={panelSgGids}
                  getSubgroupDisplayName={getPanelSubgroupDisplayName}
                  getUnitLabel={(g) => getUnitDisplay(g)}
                  unitDisplayLabel={getUnitDisplay(
                    panelFormUnitGid.trim() || configPanelRow.unitGid
                  )}
                  readOnly={!canUpdate}
                />
              </div>
            ) : null}
              </div>
            </div>
            {panelDetailLoading ? (
              <div
                className="sp-panel-tab-loading-overlay"
                aria-live="polite"
                aria-busy="true"
              >
                <Loader loadingLabel={t("LOADING")} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatSubgroupCreateMetaErrors(errors: unknown): string | null {
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const parts = errors.map((e) => {
    if (typeof e === "string") return e;
    if (e && typeof e === "object" && "error" in e) {
      const rec = e as { index?: unknown; error?: unknown };
      const msg = rec.error != null ? String(rec.error) : JSON.stringify(e);
      const idx = rec.index;
      return idx != null && idx !== "" ? `[${idx}] ${msg}` : msg;
    }
    return JSON.stringify(e);
  });
  return parts.join("; ") || null;
}

function extractCreatedSubgroupCombinationGid(data: unknown): string | null {
  if (data == null) return null;
  const rows = Array.isArray(data) ? data : [data];
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row || typeof row !== "object") return null;
  const gid =
    row.subgroup_val_gid ??
    row.sg_gid ??
    row.subgroup_gid ??
    row.s_gid ??
    row.sv_gid;
  return typeof gid === "string" && gid.trim() ? gid.trim() : null;
}

/** Subgroup add combobox in configure panel — off until product re-enables selection. */
const SUBGROUP_PANEL_COMBOBOX_DISABLED = false;

function SubgroupsTabBody({
  dwId,
  panelSgGids,
  panelDefaultSgGids,
  setPanelSgGids,
  setPanelDefaultSgGids,
  panelSgDisplayNames,
  setPanelSgDisplayNames,
  getSubgroupGid,
  getSubgroupName,
  meta,
  canUpdate,
}: {
  dwId: string;
  panelSgGids: string[];
  panelDefaultSgGids: string[];
  setPanelSgGids: React.Dispatch<React.SetStateAction<string[]>>;
  setPanelDefaultSgGids: React.Dispatch<React.SetStateAction<string[]>>;
  panelSgDisplayNames: Record<string, string>;
  setPanelSgDisplayNames: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  getSubgroupGid: (s: SubgroupRaw) => string | null;
  getSubgroupName: (s: SubgroupRaw) => string;
  meta: IndicatorsListMeta | null;
  canUpdate: boolean;
}) {
  const { t } = useCore();
  const [sgSearch, setSgSearch] = useState("");
  const [sgDropdownOpen, setSgDropdownOpen] = useState(false);
  const [sgHighlightIdx, setSgHighlightIdx] = useState(-1);
  const [sgCreateLoading, setSgCreateLoading] = useState(false);
  const sgInputRef = useRef<HTMLInputElement>(null);
  const sgListRef = useRef<HTMLDivElement>(null);

  const {
    rows: pickerRows,
    comboOptions: sgComboOptions,
    loading: sgPickerLoading,
    loadingMore: sgPickerLoadingMore,
    loadMore: loadMoreSubgroups,
    refresh: refreshSubgroupPicker,
    exactNameMatch: sgExactNameMatch,
  } = useSubgroupPickerList({
    dwId,
    search: sgSearch,
    open: sgDropdownOpen,
    getSubgroupGid,
    getSubgroupName,
  });

  const handleSubgroupListScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const el = event.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight > 48) return;
      void loadMoreSubgroups();
    },
    [loadMoreSubgroups]
  );

  const panelSgShowCreate = useMemo(() => {
    const name = sgSearch.trim();
    if (!name || sgPickerLoading) return false;
    return !sgExactNameMatch;
  }, [sgSearch, sgPickerLoading, sgExactNameMatch]);

  useEffect(() => {
    if (panelSgGids.length === 0) {
      setPanelDefaultSgGids([]);
      return;
    }
    setPanelDefaultSgGids((prev) => {
      const filtered = prev.filter((g) => panelSgGids.includes(g));
      if (filtered.length === 0) return [panelSgGids[0]];
      return filtered;
    });
  }, [panelSgGids, setPanelDefaultSgGids]);

  const addSubgroup = (gid: string | null) => {
    if (!gid || panelSgGids.includes(gid)) return;
    setPanelSgGids((prev) => [...prev, gid]);
    setSgSearch("");
    setSgDropdownOpen(false);
    setSgHighlightIdx(-1);
  };

  const handleCreateNewSubgroup = useCallback(async () => {
    const name = sgSearch.trim();
    if (!name || sgCreateLoading) return;
    setSgCreateLoading(true);
    try {
      const bulkRes = await bulkCreateSgCategoryValues(
        dwId,
        [{ sg_cat_gid: SUBGROUP_OTHERS_TYPE_GID, subgroup_name: name }],
        { ensureSgCatGids: [SUBGROUP_OTHERS_TYPE_GID] }
      );
      if (!bulkRes.success) {
        toast.error(bulkRes.err_message ?? "Failed to create subgroup category value");
        return;
      }
      const bulkErr = formatSubgroupCreateMetaErrors(bulkRes.meta?.errors);
      const catValGid = parseBulkCreatedSgCategoryValueGid(bulkRes.data);
      const bulkRows = Array.isArray(bulkRes.data) ? bulkRes.data : bulkRes.data != null ? [bulkRes.data] : [];
      if (!catValGid || bulkRows.length === 0) {
        toast.error(bulkErr ?? "No subgroup category value was created");
        return;
      }

      const comboRes = await createSubgroupCombinations(dwId, [{ sg_cat_val_gids: [catValGid] }]);
      if (!comboRes.success) {
        toast.error(comboRes.err_message ?? "Failed to create subgroup combination");
        return;
      }
      const comboErr = formatSubgroupCreateMetaErrors(comboRes.meta?.errors);
      const newGid = extractCreatedSubgroupCombinationGid(comboRes.data);
      const comboRows = Array.isArray(comboRes.data)
        ? comboRes.data
        : comboRes.data != null
          ? [comboRes.data]
          : [];
      if (comboErr && (!newGid || comboRows.length === 0)) {
        toast.error(comboErr);
        return;
      }

      refreshSubgroupPicker();
      if (newGid) {
        setPanelSgDisplayNames((m) => ({ ...m, [newGid]: name.trim() }));
        setPanelSgGids((prev) => (prev.includes(newGid) ? prev : [...prev, newGid]));
        setSgSearch("");
        setSgDropdownOpen(false);
        setSgHighlightIdx(-1);
        toast.success(t("SUBGROUP_CREATED"));
        if (comboErr) toast.message(comboErr);
      } else {
        toast.success(t("SUBGROUP_VALUE_CREATED"));
        if (comboErr) toast.message(comboErr);
        setSgSearch("");
        setSgDropdownOpen(true);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create subgroup");
    } finally {
      setSgCreateLoading(false);
    }
  }, [dwId, sgSearch, sgCreateLoading, refreshSubgroupPicker, setPanelSgGids, t]);
  const removeSubgroup = (gid: string) => {
    setPanelSgGids((prev) => prev.filter((x) => x !== gid));
    setPanelSgDisplayNames((m) => {
      if (!(gid in m)) return m;
      const next = { ...m };
      delete next[gid];
      return next;
    });
  };

  /** Toggle membership from the checkbox list without closing the picker or clearing search. */
  const toggleSubgroupInPicker = (gid: string) => {
    if (panelSgGids.includes(gid)) {
      removeSubgroup(gid);
    } else {
      setPanelSgGids((prev) => (prev.includes(gid) ? prev : [...prev, gid]));
    }
  };

  const toggleSelectAllVisibleSubgroups = useCallback(() => {
    const ids = sgComboOptions.map((o) => o.id);
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const allSelected = ids.every((id) => panelSgGids.includes(id));
    if (allSelected) {
      setPanelSgGids((prev) => prev.filter((g) => !idSet.has(g)));
    } else {
      setPanelSgGids((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return Array.from(next);
      });
    }
  }, [sgComboOptions, panelSgGids, setPanelSgGids]);

  const toggleDefault = (gid: string) => {
    setPanelDefaultSgGids((prev) => {
      if (prev.includes(gid)) {
        const next = prev.filter((x) => x !== gid);
        if (next.length === 0 && panelSgGids.length > 0) return [panelSgGids[0]];
        return next;
      }
      return [...prev, gid];
    });
  };
  const getName = useCallback(
    (gid: string) => {
      const fromLocal = panelSgDisplayNames[gid]?.trim();
      if (fromLocal) return fromLocal;
      const metaName = meta?.subgroup?.[gid]?.sg_name?.trim();
      if (metaName) return metaName;
      const row = pickerRows.find((s) => (getSubgroupGid(s) ?? "") === gid);
      if (row) {
        const fromList = getSubgroupName(row).trim();
        if (fromList && fromList !== gid) return fromList;
      }
      return gid === DEFAULT_SUBGROUP_GID ? t("TOTAL") : gid;
    },
    [panelSgDisplayNames, meta?.subgroup, pickerRows, getSubgroupGid, getSubgroupName, t]
  );

  return (
    <fieldset
      disabled={!canUpdate}
      className="m-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-0 p-0"
    >
      <div className="sp-grid shrink-0">
        <div className="sp-field sp-full">
          <div className="field-hint">
            <span>{t("SUBGROUPS_HELP")}</span>
          </div>
          <div
            className={`option-picker p-0 ${sgDropdownOpen ? "focused" : ""}`}
          >
            <div
              className="option-picker-row"
              onMouseDown={(e) => {
                if (SUBGROUP_PANEL_COMBOBOX_DISABLED) return;
                const target = e.target as HTMLElement;
                if (target.closest("button, [role='listbox'], [role='option']")) return;
                e.preventDefault();
                setSgDropdownOpen(true);
                sgInputRef.current?.focus();
              }}
            >
              <SearchableListCombobox
                inputRef={sgInputRef}
                listRef={sgListRef}
                className="w-full"
                inputClassName={shellTextFieldClassName()}
                disabled={SUBGROUP_PANEL_COMBOBOX_DISABLED}
                dropdownInteractive={!SUBGROUP_PANEL_COMBOBOX_DISABLED}
                placeholder={t("SUBGROUPS_PLACEHOLDER")}
                ariaLabel={t("SEARCH_SUBGROUP")}
                inputValue={sgSearch}
                onInputChange={(v) => {
                  setSgSearch(v);
                  setSgHighlightIdx(-1);
                }}
                open={sgDropdownOpen}
                onOpenChange={(o) => {
                  setSgDropdownOpen(o);
                  if (!o) setSgHighlightIdx(-1);
                }}
                highlightIndex={sgHighlightIdx}
                onHighlightChange={setSgHighlightIdx}
                navigableCount={sgComboOptions.length + (panelSgShowCreate ? 1 : 0)}
                options={sgComboOptions}
                selectedId={null}
                onSelect={(id) => addSubgroup(id)}
                checkboxSelection={{
                  isChecked: (id) => panelSgGids.includes(id),
                  onToggle: toggleSubgroupInPicker,
                }}
                onCheckboxSelectAll={toggleSelectAllVisibleSubgroups}
                checkboxSelectAllLabel={t("SELECT_ALL")}
                checkboxUnselectAllLabel={t("DESELECT_ALL")}
                emptyMessage={
                  sgPickerLoading ? t("LOADING") : t("NO_SUBGROUPS_FOUND")
                }
                onListScroll={handleSubgroupListScroll}
                listFooter={
                  sgPickerLoadingMore ? (
                    <div className="list-opt-empty list-opt-empty--grid text-xs">
                      {t("LOADING")}
                    </div>
                  ) : null
                }
                createSlot={
                  panelSgShowCreate
                    ? {
                        show: true,
                        loading: sgCreateLoading,
                        label: t("CREATE_NEW_SUBGROUP").replace(
                          "{name}",
                          sgSearch.trim()
                        ),
                        onCreate: () => void handleCreateNewSubgroup(),
                        highlightIndex: sgComboOptions.length,
                      }
                    : undefined
                }
                blurCloseMs={150}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="option-list-header shrink-0">
          <span className="min-w-0">{t("SUBGROUPS")}</span>
          <span className="option-list-header-flag">
            {t("SET_AS_DEFAULT")}
          </span>
        </div>
        <ul className="option-list option-list--scrollable min-h-0">
          {panelSgGids.length === 0 ? (
            <li className="option-list-item option-list-empty">
              {t("NONE_ADDED")}
            </li>
          ) : (
            panelSgGids.map((gid) => (
              <li
                key={gid}
                className="option-list-item"
              >
                <span className="option-list-item-name">{getName(gid)}</span>
                <div className="option-list-flag-cell">
                  <ToggleSwitch
                    appearance="rounded"
                    checked={panelDefaultSgGids.includes(gid)}
                    onCheckedChange={() => toggleDefault(gid)}
                    title={
                      panelDefaultSgGids.includes(gid)
                        ? t("DEFAULT_ON")
                        : t("SET_AS_DEFAULT")
                    }
                    aria-label={
                      panelDefaultSgGids.includes(gid)
                        ? t("DEFAULT_ON")
                        : t("SET_AS_DEFAULT")
                    }
                  />
                </div>
                <div className="option-list-item-actions">
                  <button
                    type="button"
                    className="btn-comp-secondary !w-8 !min-w-8 !p-0"
                    onClick={() => removeSubgroup(gid)}
                    aria-label={t("REMOVE_SUBGROUP").replace(
                      "{name}",
                      getName(gid)
                    )}
                  >
                    <span className="material-icons !text-sm" aria-hidden>close</span>
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </fieldset>
  );
}
