"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useCore } from "@/contexts/CoreContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { useDwCrudPermissions } from "@/hooks/useDwCrudPermissions";
import { useDwPermissionGuard } from "@/hooks/useDwPermissionGuard";
import {
  DW_ROUTE_PERMISSIONS,
  getStoredWorkflowCodes,
  isSuperAdmin,
} from "@/lib/auth/user";
import { DEFAULT_TABLE_PAGE_SIZES } from "@/components/TablePaginationFooter";
import { gridConfigPanelRowTrProps } from "@/components/gridConfigPanelRowClick";
import { Modal } from "@/components/Modal";
import { SecondaryButton } from "@/components/SecondaryButton";
import { DeletePermanentConfirmModal } from "@/components/DeletePermanentConfirmModal";
import { SelectField } from "@/components/SelectField";
import { gridTextFieldClassName } from "@/components/TextField";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import {
  EditableDataGridThead,
  ServerDrivenListTbody,
  ServerDrivenTable,
  useServerListQuery,
  type ServerDrivenListAddRowField,
  type ServerListParseResult,
} from "@/components/TableView";
import type {
  CreateWorkflowPayload,
  WorkflowAreaLevelRaw,
  WorkflowListItem,
  WorkflowListSortState,
  WorkflowMutationResult,
  WorkflowsListMeta,
  WorkflowsListResponse,
  WorkflowsListResult,
} from "@/lib/api/types";
import { postRequest, deleteRequest } from "@/lib/api/http";
import {
  getDWAPIURL,
  REFERENCE_PATH_WORKFLOW,
} from "@/lib/constants";
import { parseListMetaTotals } from "@/lib/gridListMeta";
import {
  TV_COL_PRIMARY_STICKY_TD,
  TV_COL_SELECT_TD,
} from "@/components/editableGridColumnClasses";
import {
  useWorkflowGridColumns,
  workflowRowId,
  type WorkflowSortColumnId,
} from "./workflowGridColumns";
import {
  WorkFlowSettingsComponent,
  fetchWorkflowAreaLevels,
} from "./WorkFlowSettingsComponent";

async function createWorkflow(
  dwId: string,
  payload: CreateWorkflowPayload
): Promise<WorkflowMutationResult> {
  const url = getDWAPIURL(dwId, REFERENCE_PATH_WORKFLOW);
  const json = await postRequest(
    url,
    payload as unknown as Record<string, unknown>,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  );
  return json as WorkflowMutationResult;
}

async function deleteWorkflow(
  dwId: string,
  workflowId: number
): Promise<WorkflowMutationResult> {
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_WORKFLOW)}/${encodeURIComponent(String(workflowId))}`;
  const json = (await deleteRequest(url, undefined, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success === false) return json as WorkflowMutationResult;
  return { success: true, message: json.message as string | undefined } as WorkflowMutationResult;
}

const MAX_REVIEW_LEVEL_ROWS = 50;

function buildWorkflowCodeFromName(name: string): string {
  const normalized = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return normalized || "WORKFLOW";
}

const Mi = ({ name, className = "" }: { name: string; className?: string }) => (
  <span className={`material-icons ${className}`.trim()} aria-hidden>
    {name}
  </span>
);

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

function isWorkflowsListResponse(r: WorkflowsListResult): r is WorkflowsListResponse {
  return r.success === true && Array.isArray((r as WorkflowsListResponse).data);
}

function cycleWorkflowListSort(
  columnId: WorkflowSortColumnId,
  prev: WorkflowListSortState
): WorkflowListSortState {
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

function mapWorkflowSortColumnToApi(
  columnId: WorkflowSortColumnId | null
): "name" | "allow_review" | "review_stage" | "created_on" | null {
  switch (columnId) {
    case "name":
      return "name";
    case "allow_review":
      return "allow_review";
    case "review_levels":
      return "review_stage";
    case "created":
      return "created_on";
    default:
      return null;
  }
}

export default function WorkflowPage() {
  const { dwId, setBulkDelete, setSidebarCollapsed } = useSidebar();
  const { t } = useCore();
  const { allowed } = useDwPermissionGuard(DW_ROUTE_PERMISSIONS.administration.workflow);
  const { canCreate, canDelete } = useDwCrudPermissions(
    DW_ROUTE_PERMISSIONS.administration.workflow
  );
  const tblScrollRef = useRef<HTMLDivElement>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_TABLE_PAGE_SIZES[0]);
  const [listSort, setListSort] = useState<WorkflowListSortState>({
    columnId: null,
    direction: null,
  });

  const [colFilterName, setColFilterNameState] = useState("");
  const setColFilterName = useCallback((value: string) => {
    setPage(1);
    setColFilterNameState(value);
  }, []);
  const debouncedName = useDebounce(colFilterName, 300);
  const [allowReviewFilter, setAllowReviewFilter] = useState<"" | "yes" | "no">(
    ""
  );
  const [activeFilter, setActiveFilter] = useState<"" | "yes" | "no">("");

  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  const addRowRef = useRef<HTMLTableRowElement>(null);
  const addRowNameInputRef = useRef<HTMLInputElement>(null);
  const [addRowExpanded, setAddRowExpanded] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState("");
  const [newWorkflowAllowReview, setNewWorkflowAllowReview] = useState(false);
  const [newWorkflowReviewLevels, setNewWorkflowReviewLevels] = useState("0");
  const [newWorkflowActive, setNewWorkflowActive] = useState(true);
  const [addSaving, setAddSaving] = useState(false);

  const [configDrawerOpen, setConfigDrawerOpen] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null);
  const [selectedWorkflowIsPending, setSelectedWorkflowIsPending] = useState(false);

  const [workflowAreaLevels, setWorkflowAreaLevels] = useState<WorkflowAreaLevelRaw[]>([]);
  const [workflowAreaLevelsLoaded, setWorkflowAreaLevelsLoaded] = useState(false);

  const maxReviewLevelsByAreaCount = useMemo(
    () => Math.min(MAX_REVIEW_LEVEL_ROWS, workflowAreaLevels.length),
    [workflowAreaLevels.length]
  );

  /** Add-row review stages: 1 … max (same idea as WorkFlowSettingsComponent). */
  const addWorkflowReviewLevelsOptions = useMemo(
    () =>
      Array.from({ length: maxReviewLevelsByAreaCount }, (_, index) => ({
        value: String(index + 1),
        label: String(index + 1),
      })),
    [maxReviewLevelsByAreaCount]
  );

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

  useEffect(() => {
    void loadWorkflowAreaLevels();
  }, [loadWorkflowAreaLevels]);

  const workflowsListUrl = useMemo(
    () => (dwId ? getDWAPIURL(dwId, REFERENCE_PATH_WORKFLOW) : ""),
    [dwId]
  );

  const workflowsListQuery = useMemo(() => {
    const q: Record<string, string | number | boolean | undefined | null> = {
      page,
      page_size: pageSize,
    };
    const nameQ = debouncedName.trim();
    if (nameQ) {
      q.search = nameQ;
      q.search_by = "workflow_name";
    }
    if (allowReviewFilter === "yes") q.allow_review = true;
    if (allowReviewFilter === "no") q.allow_review = "false";
    if (activeFilter === "yes") q.is_active = true;
    if (activeFilter === "no") q.is_active = "false";
    const sortBy = mapWorkflowSortColumnToApi(listSort.columnId);
    if (sortBy != null && listSort.direction != null) {
      q.sort_by = sortBy;
      q.sort_order = listSort.direction;
    }
    return q;
  }, [
    page,
    pageSize,
    debouncedName,
    allowReviewFilter,
    activeFilter,
    listSort.columnId,
    listSort.direction,
  ]);

  const parseWorkflowsListResponse = useCallback(
    (json: unknown): ServerListParseResult<WorkflowListItem, WorkflowsListMeta> => {
      const r = json as WorkflowsListResult;
      if (!isWorkflowsListResponse(r)) {
        const msg =
          typeof r.err_message === "string"
            ? r.err_message
            : "Failed to load workflows";
        return { ok: false, message: msg };
      }
      const totals = parseListMetaTotals(r.meta);
      return {
        ok: true,
        rows: r.data,
        ...totals,
        meta: r.meta,
      };
    },
    []
  );

  const listState = useServerListQuery({
    listUrl: workflowsListUrl,
    query: workflowsListQuery,
    parseListResponse: parseWorkflowsListResponse,
    enabled: Boolean(dwId && workflowsListUrl),
  });

  const { rows: serverRows, loading, meta, refetch } = listState;
  const [optimisticRows, setOptimisticRows] = useState<WorkflowListItem[]>([]);
  const [optimisticTotalCount, setOptimisticTotalCount] = useState(0);
  const [optimisticTotalCountUnfiltered, setOptimisticTotalCountUnfiltered] =
    useState<number | undefined>(undefined);
  useEffect(() => {
    if (!isSuperAdmin()) {
      const allowedCodes = getStoredWorkflowCodes();
      if (allowedCodes.length > 0) {
        const codeSet = new Set(allowedCodes);
        const filtered = serverRows.filter((r) => codeSet.has(r.workflow_code));
        setOptimisticRows(filtered);
        return;
      }
    }
    setOptimisticRows(serverRows);
  }, [serverRows]);
  useEffect(() => {
    setOptimisticTotalCount(listState.totalCount);
    setOptimisticTotalCountUnfiltered(listState.totalCountUnfiltered);
  }, [listState.totalCount, listState.totalCountUnfiltered]);
  const totalCount = optimisticTotalCount;
  const totalPages = listState.totalPages;

  const tableRows = optimisticRows;

  useEffect(() => {
    setSelectedRowIds(new Set());
  }, [
    page,
    pageSize,
    debouncedName,
    allowReviewFilter,
    activeFilter,
    listSort.columnId,
    listSort.direction,
  ]);

  const onSort = useCallback((columnId: WorkflowSortColumnId) => {
    setPage(1);
    setListSort((prev) => cycleWorkflowListSort(columnId, prev));
  }, []);

  const setAllowReviewFilterAndPage = useCallback((value: "" | "yes" | "no") => {
    setPage(1);
    setAllowReviewFilter(value);
  }, []);

  const setActiveFilterAndPage = useCallback((value: "" | "yes" | "no") => {
    setPage(1);
    setActiveFilter(value);
  }, []);

  const selectAll = useCallback(() => {
    setSelectedRowIds((prev) => {
      const ids = tableRows.map(workflowRowId).filter(Boolean);
      if (ids.length > 0 && ids.every((id) => prev.has(id))) {
        return new Set();
      }
      return new Set(ids);
    });
  }, [tableRows]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedRowIds(new Set()), []);

  const closeWorkflowConfig = useCallback(() => {
    setConfigDrawerOpen(false);
    setSelectedWorkflowId(null);
    setSelectedWorkflowIsPending(false);
    setSidebarCollapsed(false);
  }, [setSidebarCollapsed]);

  const openWorkflowConfig = useCallback(
    (row: WorkflowListItem) => {
      setSelectedWorkflowId(row.workflow_id);
      setSelectedWorkflowIsPending(row.in_progress_dataset_cnt != null && row.in_progress_dataset_cnt > 0);
      setConfigDrawerOpen(true);
      setSidebarCollapsed(true);
    },
    [setSidebarCollapsed]
  );

  const addRowDisabledByConfig = configDrawerOpen;

  const handleAddSave = useCallback(async () => {
    if (!dwId || addSaving) return;
    const name = newWorkflowName.trim();
    if (!name) {
      toast.error(t("WORKFLOW_NAME_REQUIRED"));
      return;
    }
    if (newWorkflowAllowReview && !workflowAreaLevelsLoaded) {
      toast.error(t("AREAS_LOAD_LEVELS_FAILED"));
      return;
    }
    setAddSaving(true);
    try {
      let reviewLevelCount = 0;
      if (newWorkflowAllowReview) {
        const n = Number.parseInt(newWorkflowReviewLevels, 10);
        if (!Number.isFinite(n) || n < 1) {
          toast.error(t("REVIEW_STAGE_INVALID"));
          return;
        }
        reviewLevelCount = n;
      }
      const payload: CreateWorkflowPayload = {
        workflow_code: buildWorkflowCodeFromName(name),
        workflow_name: name,
        review_scope_type: "AREA",
        priority: 0,
        description: "",
        is_active: newWorkflowActive,
        is_system: false,
        allow_review: newWorkflowAllowReview,
        constraint_data_entry: false,
        review_level_count: reviewLevelCount,
      };
      const res = await createWorkflow(dwId, payload);
      if (!res.success) {
        toast.error(
          (res as { err_message?: string }).err_message ?? t("WORKFLOW_CREATE_FAILED")
        );
        return;
      }
      setNewWorkflowName("");
      setNewWorkflowAllowReview(false);
      setNewWorkflowReviewLevels("0");
      setNewWorkflowActive(true);
      setAddRowExpanded(false);
      toast.success(t("WORKFLOW_CREATE_SUCCESS"));
      void refetch();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("WORKFLOW_CREATE_FAILED")
      );
    } finally {
      setAddSaving(false);
    }
  }, [
    dwId,
    addSaving,
    newWorkflowName,
    newWorkflowAllowReview,
    newWorkflowReviewLevels,
    newWorkflowActive,
    workflowAreaLevelsLoaded,
    refetch,
    t,
  ]);

  const handleAddRowDiscard = useCallback(() => {
    setNewWorkflowName("");
    setNewWorkflowAllowReview(false);
    setNewWorkflowReviewLevels("0");
    setNewWorkflowActive(true);
    setAddRowExpanded(false);
  }, []);

  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [blockedDeleteMessage, setBlockedDeleteMessage] = useState<string | null>(null);

  const handleBulkDelete = useCallback(async () => {
    if (!dwId || selectedRowIds.size === 0) return;
    const idsToDelete = tableRows
      .filter((r) => selectedRowIds.has(workflowRowId(r)))
      .filter((r) => !r.is_system);
    const systemCount = selectedRowIds.size - idsToDelete.length;
    if (systemCount > 0) {
      toast.error(t("WORKFLOW_SYSTEM_CANNOT_DELETE"));
    }
    if (idsToDelete.length === 0) return;
    setDeletingIds(new Set(idsToDelete.map((r) => workflowRowId(r))));
    let successCount = 0;
    const successMessages = new Set<string>();
    const deletedWorkflowIds = new Set<number>();
    let lastErr = "";
    for (const row of idsToDelete) {
      try {
        const res = await deleteWorkflow(dwId, row.workflow_id);
        if (res.success) {
          successCount++;
          deletedWorkflowIds.add(row.workflow_id);
          if (typeof res.message === "string" && res.message.trim()) {
            successMessages.add(res.message.trim());
          }
        } else {
          lastErr = (res as { err_message?: string }).err_message ?? t("WORKFLOW_DELETE_FAILED");
        }
      } catch (err) {
        lastErr = err instanceof Error ? err.message : t("WORKFLOW_DELETE_FAILED");
      }
    }
    if (deletedWorkflowIds.size > 0) {
      setOptimisticRows((prev) =>
        prev.filter((row) => !deletedWorkflowIds.has(row.workflow_id))
      );
      setOptimisticTotalCount((prev) => Math.max(0, prev - deletedWorkflowIds.size));
      if (
        selectedWorkflowId != null &&
        deletedWorkflowIds.has(selectedWorkflowId)
      ) {
        closeWorkflowConfig();
      }
    }
    if (successCount > 0) {
      if (successMessages.size === 1) {
        const onlyMessage = Array.from(successMessages)[0];
        toast.success(
          successCount === 1 ? onlyMessage : `${onlyMessage} (${successCount})`
        );
      } else {
        toast.success(
          t("WORKFLOW_DELETE_SUCCESS").replace("{count}", String(successCount))
        );
      }
    }
    if (lastErr) toast.error(lastErr);
    setSelectedRowIds(new Set());
    setDeletingIds(new Set());
  }, [dwId, selectedRowIds, tableRows, t, selectedWorkflowId, closeWorkflowConfig]);

  const workflowListAddRowExpandedFields = useMemo((): ServerDrivenListAddRowField[] => {
    const addRowDisabled = addSaving || addRowDisabledByConfig;
    return [
      {
        kind: "custom" as const,
        content: <span className="inline-block h-4 w-4" aria-hidden />,
      },
      {
        kind: "text" as const,
        value: newWorkflowName,
        onChange: (v: string) => setNewWorkflowName(v),
        placeholder: t("WORKFLOW_ADD_PLACEHOLDER_NAME"),
        inputClassName: gridTextFieldClassName("min-w-0"),
        inputRef: addRowNameInputRef,
        disabled: addRowDisabled,
        ariaLabel: t("NAME"),
      },
      {
        kind: "custom" as const,
        content: (
          <SelectField
            data-tv-enter-field="true"
            menuPortal
            className="w-full min-w-0 [&_button]:!h-7 [&_button]:!min-h-[28px] [&_button]:!rounded-sm [&_button]:!py-0"
            value={newWorkflowAllowReview ? "yes" : "no"}
            onChange={(e) => {
              const allow = e.target.value === "yes";
              setNewWorkflowAllowReview(allow);
              if (!allow) {
                setNewWorkflowReviewLevels("0");
                return;
              }
              setNewWorkflowReviewLevels((prev) => {
                if (prev === "0" || prev.trim() === "") return "1";
                return addWorkflowReviewLevelsOptions.some((o) => o.value === prev)
                  ? prev
                  : "1";
              });
            }}
            aria-label={t("ALLOW_REVIEW")}
            disabled={addRowDisabled}
            options={[
              { value: "yes", label: t("YES") },
              { value: "no", label: t("NO") },
            ]}
          />
        ),
      },
      {
        kind: "custom" as const,
        content: (
          <SelectField
            data-tv-enter-field="true"
            menuPortal
            className="w-full min-w-0 [&_button]:!h-7 [&_button]:!min-h-[28px] [&_button]:!rounded-sm [&_button]:!py-0"
            value={
              newWorkflowAllowReview
                ? addWorkflowReviewLevelsOptions.some(
                    (o) => o.value === newWorkflowReviewLevels
                  )
                  ? newWorkflowReviewLevels
                  : maxReviewLevelsByAreaCount > 0
                    ? "1"
                    : ""
                : "0"
            }
            onChange={(e) => {
              if (!newWorkflowAllowReview) return;
              setNewWorkflowReviewLevels(e.target.value);
            }}
            disabled={
              addRowDisabled ||
              !newWorkflowAllowReview ||
              (newWorkflowAllowReview && !workflowAreaLevelsLoaded)
            }
            aria-label={t("REVIEW_STAGES")}
            options={
              newWorkflowAllowReview
                ? addWorkflowReviewLevelsOptions
                : [{ value: "0", label: "0" }]
            }
          />
        ),
      },
      {
        kind: "custom" as const,
        content: <span className="text-text-muted">-</span>,
      },
      {
        kind: "custom" as const,
        content: <span className="text-text-muted">-</span>,
      },
      {
        kind: "custom" as const,
        content: (
          <div className="flex items-center justify-center">
            <ToggleSwitch
              data-tv-enter-field="true"
              checked={newWorkflowActive}
              onCheckedChange={(v) => setNewWorkflowActive(v)}
              aria-label={t("ACTIVE")}
              disabled={addRowDisabled}
            />
          </div>
        ),
      },
    ];
  }, [
    addRowDisabledByConfig,
    newWorkflowName,
    newWorkflowAllowReview,
    newWorkflowReviewLevels,
    newWorkflowActive,
    addSaving,
    maxReviewLevelsByAreaCount,
    addWorkflowReviewLevelsOptions,
    workflowAreaLevelsLoaded,
    t,
  ]);

  useEffect(() => {
    return () => setSidebarCollapsed(false);
  }, [setSidebarCollapsed]);

  const workflowColumns = useWorkflowGridColumns({
    t,
    rowsLength: tableRows.length,
    selectedRowIds,
    selectAll,
    toggleSelect,
    colFilterName,
    setColFilterName,
    allowReviewFilter,
    setAllowReviewFilter: setAllowReviewFilterAndPage,
    activeFilter,
    setActiveFilter: setActiveFilterAndPage,
    sortColumnId: listSort.columnId,
    sortDirection: listSort.direction,
    onSort,
    onConfigure: openWorkflowConfig,
  });

  const requestBulkDelete = useCallback(() => {
    if (selectedRowIds.size === 0) {
      toast.message(t("BULK_DELETE_NO_IDS"));
      return;
    }
    const selected = tableRows.filter((r) => selectedRowIds.has(workflowRowId(r)));
    const withDatasets = selected.filter((r) => (r.dataset_count ?? 0) > 0);
    if (withDatasets.length > 0) {
      const names = withDatasets.map((r) => r.workflow_name || r.workflow_code).join(", ");
      setBlockedDeleteMessage(
        t("WORKFLOW_DELETE_BLOCKED_DATASETS").replace("{workflow_names}", names)
      );
      setDeleteConfirmOpen(true);
      return;
    }
    setBlockedDeleteMessage(null);
    setDeleteConfirmOpen(true);
  }, [selectedRowIds, tableRows, t]);

  useEffect(() => {
    setBulkDelete({
      onClick: requestBulkDelete,
      disabled: selectedRowIds.size === 0 || deletingIds.size > 0 || !canDelete,
    });
    return () => setBulkDelete(null);
  }, [setBulkDelete, selectedRowIds.size, deletingIds.size, requestBulkDelete, canDelete]);

  if (!allowed) return null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overflow-x-hidden">

      <ServerDrivenTable<WorkflowListItem, WorkflowsListMeta>
        listState={{ ...listState, loading: false }}
        columns={workflowColumns}
        selection={{
          count: selectedRowIds.size,
          onClear: clearSelection,
        }}
        scrollRef={tblScrollRef}
        disableGlobalArrowNavigation={configDrawerOpen}
        renderThead={() => (
          <thead>
            <EditableDataGridThead columns={workflowColumns} />
          </thead>
        )}
        tbody={
          <ServerDrivenListTbody<WorkflowListItem>
            colSpan={8}
            rows={tableRows}
            columns={workflowColumns}
            getRowId={workflowRowId}
            activeRowId={null}
            editingRowId={null}
            onDeleteKeyToggleRowSelection={
              configDrawerOpen ? undefined : toggleSelect
            }
            getRowClassName={(row) =>
              configDrawerOpen && selectedWorkflowId === row.workflow_id
                ? "settings-active"
                : ""
            }
            trProps={(row) => {
              const switchProps = gridConfigPanelRowTrProps({
                panelOpen: configDrawerOpen,
                isActiveRow:
                  configDrawerOpen && selectedWorkflowId === row.workflow_id,
                onSwitchRow: () => openWorkflowConfig(row),
              });
              if (!configDrawerOpen) return switchProps;
              return {
                ...switchProps,
                onKeyDown: (event) => {
                  if (
                    event.key === "ArrowUp" ||
                    event.key === "ArrowDown" ||
                    event.key === "ArrowLeft" ||
                    event.key === "ArrowRight" ||
                    event.key === "Enter" ||
                    event.key === "Delete"
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                },
              };
            }}
            emptyMessage={t("WORKFLOW_EMPTY")}
            showLoadingRow={false}
            showEmptyRow={!loading && tableRows.length === 0}
            showDataRows={!loading}
            addRow={{
              ref: addRowRef,
              promptLabel: t("ADD_WORKFLOW_PROMPT"),
              expanded: addRowExpanded,
              onExpandedChange: setAddRowExpanded,
              primaryColumnId: "name",
              disabled: addRowDisabledByConfig || !canCreate,
              disabledTitle: !canCreate
                ? t("NO_PERMISSION_CREATE")
                : addRowDisabledByConfig
                  ? t("WORKFLOW_ADD_ROW_FINISH_EDIT_FIRST")
                  : undefined,
              onExpand: () => {
                queueMicrotask(() => addRowNameInputRef.current?.focus());
              },
              className: `add-row${addRowExpanded ? "" : " add-row-collapsed"}${addRowDisabledByConfig || !canCreate ? " add-row-interaction-blocked" : ""}`,
              ariaDisabled: addRowDisabledByConfig || !canCreate,
              title: !canCreate
                ? t("NO_PERMISSION_CREATE")
                : addRowDisabledByConfig
                  ? t("WORKFLOW_ADD_ROW_FINISH_EDIT_FIRST")
                  : undefined,
              onRowEnterAtEnd: () => {
                if (!canCreate) return;
                if (addRowDisabledByConfig) return;
                if (!addRowExpanded) {
                  setAddRowExpanded(true);
                  queueMicrotask(() => addRowNameInputRef.current?.focus());
                  return;
                }
                void handleAddSave();
              },
              onRowEscape: () => {
                if (addRowExpanded) {
                  handleAddRowDiscard();
                }
              },
              onArrowIntoRow: addRowDisabledByConfig || !canCreate
                ? undefined
                : () => { setAddRowExpanded(true); },
              onArrowLeaveRow: addRowDisabledByConfig || !canCreate
                ? undefined
                : () => { setAddRowExpanded(false); },
              expandedFields: workflowListAddRowExpandedFields,
              collapsedSave: {
                title: "save",
                ariaLabel: "save-placeholder",
              },
              collapsedCancel: {
                title: "cancel",
                ariaLabel: "cancel-placeholder",
              },
              showActionsColumn: canCreate,
              actionsWidth: "icon",
              save: {
                title: !newWorkflowName.trim()
                  ? t("WORKFLOW_NAME_REQUIRED")
                  : t("SAVE"),
                ariaLabel: !newWorkflowName.trim()
                  ? t("WORKFLOW_NAME_REQUIRED")
                  : t("SAVE"),
                disabled:
                  addSaving || !newWorkflowName.trim() || addRowDisabledByConfig,
                onClick: () => void handleAddSave(),
              },
              cancel: {
                title: t("ADD_CLEAR_ROW"),
                ariaLabel: t("ADD_CLEAR_ROW"),
                disabled: addSaving || addRowDisabledByConfig,
                onClick: handleAddRowDiscard,
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
          countNoun: t("WORKFLOWS"),
          countSpanId: "footer-workflow-count",
          labels: { t },
        }}
      />

      <DeletePermanentConfirmModal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title={t("WORKFLOW_DELETE_CONFIRM_TITLE")}
        titleId="dm-workflow-delete-confirm-title"
        closeAriaLabel={t("CLOSE")}
        cancelLabel={t("CANCEL")}
        onCancel={() => setDeleteConfirmOpen(false)}
        confirmLabel={t("DELETE_PERMANENTLY")}
        confirmLoadingLabel={t("DELETING")}
        confirmLoading={deletingIds.size > 0}
        confirmDisabled={!!blockedDeleteMessage}
        onConfirm={async () => {
          setDeleteConfirmOpen(false);
          await handleBulkDelete();
        }}
      >
        {blockedDeleteMessage ? (
          <p className="modal-lead text-xs leading-relaxed text-text-muted">
            {blockedDeleteMessage}
          </p>
        ) : (
          <p className="modal-lead text-xs leading-relaxed text-text-muted">
            {t("WORKFLOW_DELETE_CONFIRM_MESSAGE")}
          </p>
        )}
      </DeletePermanentConfirmModal>

      <WorkFlowSettingsComponent
        open={configDrawerOpen}
        workflowId={selectedWorkflowId}
        workflowIsPending={selectedWorkflowIsPending}
        onClose={closeWorkflowConfig}
        onSaved={refetch}
      />
    </div>
  );
}
