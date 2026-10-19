"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { useCore } from "@/contexts/CoreContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { useDwCrudPermissions } from "@/hooks/useDwCrudPermissions";
import { useDwPermissionGuard } from "@/hooks/useDwPermissionGuard";
import { DW_ROUTE_PERMISSIONS } from "@/lib/auth/user";
import {
  deleteComputeProcess,
  listComputeProcesses,
  type ComputeProcessListItem,
} from "@/lib/api/computeProcess";
import type { DwSourceListItem } from "@/lib/api/sources";
import { fetchAllDwSources } from "@/lib/api/sources";
import {
  buildSourcePublisherTitleIndex,
  titlesForPublisherPick,
} from "@/lib/datamanager/sourcePublisherTitleCatalog";
import { loadComputeProcessFilterCatalog } from "@/lib/datamanager/computeProcessFilterCatalog";
import { ComputeExecuteProcessModal } from "@/components/compute/ComputeExecuteProcessModal";
import {
  ComputeProcessAddDrawer,
  DEFAULT_COMPUTE_ADD_DRAFT,
  type ComputeProcessAddDraft,
} from "@/components/compute/ComputeProcessAddDrawer";
import { ComputeProcessExecutionLogsPanel } from "@/components/compute/ComputeProcessExecutionLogsPanel";
import { ComputeIusPickerModal } from "@/components/compute/ComputeIusPickerModal";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { DeletePermanentConfirmModal } from "@/components/DeletePermanentConfirmModal";
import { MainTabsBar } from "@/components/MainTabsBar";
import { Modal } from "@/components/Modal";
import { SearchInputBar } from "@/components/SearchInputBar";
import type { SearchableListComboboxOption } from "@/components/SearchableListCombobox";
import {
  EditableDataGridThead,
  InlineEditableTable,
  ServerDrivenListTbody,
  type EditableGridColumnDef,
} from "@/components/TableView";
import {
  COMPUTE_PROCESS_GRID_COL_COUNT,
  COMPUTE_PROCESS_TYPE_ORDER,
  computeProcessRowId,
  getSrcPublisher,
  getSrcTitle,
  processTypeGroupIcon,
  processTypeGroupLabel,
  rowMatchesComputeFilters,
  useComputeProcessGridColumns,
} from "./computeProcessGridColumns";

function emptyAddDrafts(): Record<string, ComputeProcessAddDraft> {
  const o: Record<string, ComputeProcessAddDraft> = {};
  for (const pt of COMPUTE_PROCESS_TYPE_ORDER) {
    o[pt] = { ...DEFAULT_COMPUTE_ADD_DRAFT };
  }
  return o;
}

export default function ComputeEngineExecutePage() {
  const params = useParams();
  const dwId = String(params?.dw_id ?? "").trim();
  const { t, locale } = useCore();
  const { setToolbarExtra } = useSidebar();
  const { allowed } = useDwPermissionGuard(DW_ROUTE_PERMISSIONS.dataManagement.calculateIus, {
    parentResourceCode: DW_ROUTE_PERMISSIONS.dataManagement.parent,
  });
  const { canCreate, canDelete } = useDwCrudPermissions(
    DW_ROUTE_PERMISSIONS.dataManagement.calculateIus
  );
  const tblScrollRef = useRef<HTMLDivElement | null>(null);

  const [executeProcess, setExecuteProcess] =
    useState<ComputeProcessListItem | null>(null);

  const [processes, setProcesses] = useState<ComputeProcessListItem[]>([]);
  const [processesLoading, setProcessesLoading] = useState(true);
  const [sourceRows, setSourceRows] = useState<DwSourceListItem[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);

  const [activeProcessType, setActiveProcessType] = useState<string>(
    COMPUTE_PROCESS_TYPE_ORDER[0]
  );
  const [addDrawerOpen, setAddDrawerOpen] = useState(false);

  const [filterCatalog, setFilterCatalog] = useState<{
    areaLevels: import("@/lib/datamanager/computeProcessFilterCatalog").AreaLevelCatalogRow[];
    areas: import("@/lib/datamanager/computeProcessFilterCatalog").AreaCatalogRow[];
    iusOptions: Array<{ id: string; label: string }>;
    areaKeyToLevel: Map<string, number>;
  }>({
    areaLevels: [],
    areas: [],
    iusOptions: [],
    areaKeyToLevel: new Map(),
  });

  const [areaLevelFilterKey, setAreaLevelFilterKey] = useState("");
  const [areasUnderFilterKey, setAreasUnderFilterKey] = useState("");
  const [targetIusFilterKey, setTargetIusFilterKey] = useState("");

  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  const [addRowByType, setAddRowByType] =
    useState<Record<string, ComputeProcessAddDraft>>(emptyAddDrafts);
  const [iusPickerForType, setIusPickerForType] = useState<string | null>(null);

  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(
    () => new Set()
  );
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [processesToDelete, setProcessesToDelete] = useState<
    ComputeProcessListItem[]
  >([]);
  const [bulkDeleteRunning, setBulkDeleteRunning] = useState(false);

  const [expandedExecutionRowIds, setExpandedExecutionRowIds] = useState<
    Set<string>
  >(() => new Set());

  const [areasUnderDetail, setAreasUnderDetail] = useState<
    | null
    | { kind: "all" }
    | { kind: "list"; areaIds: string[] }
  >(null);
  const [areasDetailSearch, setAreasDetailSearch] = useState("");

  const setActiveAddDraft = useCallback(
    (
      next:
        | ComputeProcessAddDraft
        | ((prev: ComputeProcessAddDraft) => ComputeProcessAddDraft)
    ) => {
      setAddRowByType((prev) => {
        const cur =
          prev[activeProcessType] ?? { ...DEFAULT_COMPUTE_ADD_DRAFT };
        const resolved =
          typeof next === "function" ? next(cur) : next;
        return { ...prev, [activeProcessType]: resolved };
      });
    },
    [activeProcessType]
  );

  const openAddDrawer = useCallback(() => {
    if (!canCreate) return;
    setAddDrawerOpen(true);
  }, [canCreate]);

  const closeAddDrawer = useCallback(() => {
    setAddDrawerOpen(false);
  }, []);

  const loadProcesses = useCallback(async () => {
    if (!dwId) return;
    setProcessesLoading(true);
    const res = await listComputeProcesses(dwId, { locale });
    setProcessesLoading(false);
    if (!res.ok) {
      toast.error(res.message);
      setProcesses([]);
      return;
    }
    const sorted = [...res.processes].sort((a, b) => b.id - a.id);
    setProcesses(sorted);
  }, [dwId, locale]);

  const loadDwSources = useCallback(async () => {
    if (!dwId.trim()) {
      setSourceRows([]);
      return;
    }
    setSourcesLoading(true);
    const res = await fetchAllDwSources(dwId, locale);
    setSourcesLoading(false);
    if (!res.ok) {
      toast.error(res.message);
      setSourceRows([]);
      return;
    }
    setSourceRows(res.rows);
  }, [dwId, locale]);

  useEffect(() => {
    void loadProcesses();
  }, [loadProcesses]);

  useEffect(() => {
    void loadDwSources();
  }, [loadDwSources]);

  useEffect(() => {
    if (!dwId) {
      setFilterCatalog({
        areaLevels: [],
        areas: [],
        iusOptions: [],
        areaKeyToLevel: new Map(),
      });
      return;
    }
    let cancelled = false;
    void loadComputeProcessFilterCatalog(dwId).then((d) => {
      if (!cancelled) setFilterCatalog(d);
    });
    return () => {
      cancelled = true;
    };
  }, [dwId]);

  useEffect(() => {
    setAddDrawerOpen(false);
    setIusPickerForType(null);
  }, [activeProcessType]);

  useEffect(() => {
    setExpandedExecutionRowIds(new Set());
    setSelectedRowIds(new Set());
  }, [activeProcessType]);

  const onToggleExecutionExpand = useCallback(
    (row: ComputeProcessListItem) => {
      const id = computeProcessRowId(row);
      setExpandedExecutionRowIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    []
  );

  const onExecuteRow = useCallback((row: ComputeProcessListItem) => {
    setExecuteProcess(row);
  }, []);

  const anyLabel = t("ANY");

  const iusLabelByGid = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of filterCatalog.iusOptions) {
      m.set(o.id, o.label);
    }
    return m;
  }, [filterCatalog.iusOptions]);

  const areaNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of filterCatalog.areas) {
      const name = (a.ar_name ?? "").trim();
      m.set(a.ar_id, name || a.ar_id);
    }
    return m;
  }, [filterCatalog.areas]);

  const areasDetailModalRows = useMemo(() => {
    if (!areasUnderDetail || areasUnderDetail.kind !== "list") return [];
    const q = areasDetailSearch.trim().toLowerCase();
    return areasUnderDetail.areaIds
      .map((id) => {
        const name = areaNameById.get(id) ?? id;
        return { id, name };
      })
      .filter(({ id, name }) => {
        if (!q) return true;
        return (
          id.toLowerCase().includes(q) || name.toLowerCase().includes(q)
        );
      })
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );
  }, [areasUnderDetail, areasDetailSearch, areaNameById]);

  const closeAreasUnderDetail = useCallback(() => {
    setAreasUnderDetail(null);
    setAreasDetailSearch("");
  }, []);

  const onOpenAreasUnderDetail = useCallback(
    (detail: { kind: "all" } | { kind: "list"; areaIds: string[] }) => {
      setAreasDetailSearch("");
      setAreasUnderDetail(detail);
    },
    []
  );

  const tabRows = useMemo(() => {
    return processes
      .filter((p) => p.process_type === activeProcessType)
      .filter((row) =>
        rowMatchesComputeFilters(
          row,
          areaLevelFilterKey,
          areasUnderFilterKey,
          targetIusFilterKey,
          filterCatalog.areaKeyToLevel,
          filterCatalog.areas,
          iusLabelByGid
        )
      )
      .sort((a, b) => b.id - a.id);
  }, [
    processes,
    activeProcessType,
    areaLevelFilterKey,
    areasUnderFilterKey,
    targetIusFilterKey,
    filterCatalog.areaKeyToLevel,
    filterCatalog.areas,
    iusLabelByGid,
  ]);

  const selectedInTabCount = useMemo(() => {
    let n = 0;
    for (const row of tabRows) {
      if (selectedRowIds.has(computeProcessRowId(row))) n += 1;
    }
    return n;
  }, [tabRows, selectedRowIds]);

  const allVisibleSelected = useMemo(
    () =>
      tabRows.length > 0 &&
      tabRows.every((r) => selectedRowIds.has(computeProcessRowId(r))),
    [tabRows, selectedRowIds]
  );

  const selectAllVisible = useCallback(() => {
    setSelectedRowIds((prev) => {
      const ids = tabRows.map(computeProcessRowId);
      const allOn =
        ids.length > 0 && ids.every((id) => prev.has(id));
      if (allOn) return new Set();
      return new Set(ids);
    });
  }, [tabRows]);

  const toggleSelectRow = useCallback((rowId: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const clearComputeSelection = useCallback(() => {
    setSelectedRowIds(new Set());
  }, []);

  const getComputeDataRowClassName = useCallback(
    (row: ComputeProcessListItem) =>
      selectedRowIds.has(computeProcessRowId(row)) ? "selected" : "",
    [selectedRowIds]
  );

  const openBulkDeleteModal = useCallback(() => {
    const list = tabRows.filter((r) =>
      selectedRowIds.has(computeProcessRowId(r))
    );
    if (list.length === 0) return;
    setProcessesToDelete(list);
    setBulkDeleteOpen(true);
  }, [tabRows, selectedRowIds]);

  const openDeleteModalForRow = useCallback((row: ComputeProcessListItem) => {
    setProcessesToDelete([row]);
    setBulkDeleteOpen(true);
  }, []);

  const closeBulkDeleteModal = useCallback(() => {
    setBulkDeleteOpen(false);
    setProcessesToDelete([]);
  }, []);

  const handleConfirmBulkDelete = useCallback(async () => {
    if (!dwId || processesToDelete.length === 0) return;
    setBulkDeleteRunning(true);
    const deletedIds = new Set<number>();
    const errors: string[] = [];
    for (const row of processesToDelete) {
      const res = await deleteComputeProcess(dwId, row.id, locale);
      if (res.ok) deletedIds.add(row.id);
      else
        errors.push(
          `${row.id}: ${res.message || t("DELETE_FAILED", "Delete failed")}`
        );
    }
    setBulkDeleteRunning(false);
    closeBulkDeleteModal();
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      for (const id of deletedIds) next.delete(String(id));
      return next;
    });
    if (executeProcess && deletedIds.has(executeProcess.id)) {
      setExecuteProcess(null);
    }
    void loadProcesses();
    if (errors.length > 0) {
      toast.error(errors.slice(0, 5).join("\n"));
    }
    if (deletedIds.size > 0) {
      toast.success(
        t("PROCESSES_DELETED_COUNT").replace(
          "{count}",
          String(deletedIds.size)
        )
      );
    }
  }, [
    dwId,
    processesToDelete,
    locale,
    t,
    closeBulkDeleteModal,
    loadProcesses,
    executeProcess,
  ]);

  const areaLevelPickOptions = useMemo((): SearchableListComboboxOption[] => {
    const base: SearchableListComboboxOption[] = [{ id: "", label: anyLabel }];
    for (const l of filterCatalog.areaLevels) {
      base.push({
        id: `lvlnum:${l.al_level}`,
        label: l.al_name,
      });
    }
    return base;
  }, [anyLabel, filterCatalog.areaLevels]);

  const processFilterPairs = useMemo(
    () =>
      processes
        .map((p) => ({
          publisher: getSrcPublisher(p.filter_object),
          title: getSrcTitle(p.filter_object),
        }))
        .filter((x) => x.publisher.trim().length > 0 && x.title.trim().length > 0),
    [processes]
  );

  const sourcePubTitleIndex = useMemo(
    () => buildSourcePublisherTitleIndex(sourceRows, processFilterPairs),
    [sourceRows, processFilterPairs]
  );

  const addDraftForActiveTab =
    addRowByType[activeProcessType] ?? DEFAULT_COMPUTE_ADD_DRAFT;

  const publisherTextOptions = useMemo((): SearchableListComboboxOption[] => {
    return sourcePubTitleIndex.publishers.map((p) => ({ id: p, label: p }));
  }, [sourcePubTitleIndex]);

  const titleTextOptions = useMemo((): SearchableListComboboxOption[] => {
    const titles = titlesForPublisherPick(
      sourcePubTitleIndex,
      addDraftForActiveTab.srcPublisher
    );
    return titles.map((v) => ({ id: v, label: v }));
  }, [sourcePubTitleIndex, addDraftForActiveTab.srcPublisher]);

  const publisherGridSuggestions = useMemo(
    () => publisherTextOptions.map((o) => o.label),
    [publisherTextOptions]
  );
  const titleGridSuggestions = useMemo(
    () => titleTextOptions.map((o) => o.label),
    [titleTextOptions]
  );

  const columns = useComputeProcessGridColumns({
    t,
    locale,
    rowsLength: tabRows.length,
    allVisibleSelected,
    selectedRowIds,
    selectAll: selectAllVisible,
    toggleSelect: toggleSelectRow,
    areaLevels: filterCatalog.areaLevels,
    areasCatalog: filterCatalog.areas,
    areaKeyToLevel: filterCatalog.areaKeyToLevel,
    areaLevelFilterKey,
    setAreaLevelFilterKey,
    areaLevelPickOptions,
    areasUnderFilterKey,
    setAreasUnderFilterKey,
    targetIusFilterKey,
    setTargetIusFilterKey,
    onExecute: onExecuteRow,
    canDelete,
    onDelete: openDeleteModalForRow,
    expandedExecutionRowIds,
    onToggleExecutionExpand,
    onOpenAreasUnderDetail,
    iusLabelByGid,
  });

  const pickerDraft = iusPickerForType
    ? addRowByType[iusPickerForType]
    : undefined;

  const mainTabs = useMemo(
    () =>
      COMPUTE_PROCESS_TYPE_ORDER.map((pt) => ({
        value: pt,
        label: processTypeGroupLabel(pt, t),
        icon: processTypeGroupIcon(pt),
      })),
    [t]
  );

  const activeProcessTypeLabel = useMemo(
    () => processTypeGroupLabel(activeProcessType, t),
    [activeProcessType, t]
  );

  const bulkDeleteDisabled =
    selectedInTabCount === 0 ||
    processesLoading ||
    !dwId ||
    !canDelete;

  const toolbarExtra = useMemo<ReactNode>(() => {
    if (!canCreate && !canDelete) return null;
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {canCreate ? (
            <PrimaryButton
              type="button"
              icon="add"
              disabled={processesLoading || !dwId}
              onClick={openAddDrawer}
            >
              {t("ADD")}
            </PrimaryButton>
          ) : null}
          {canDelete ? (
            !bulkDeleteDisabled ? (
              <PrimaryButton
                type="button"
                variant="destructive"
                icon="delete"
                onClick={openBulkDeleteModal}
                title={t("TOOLBAR_DELETE_SELECTED")}
              >
                {t("DELETE")}
              </PrimaryButton>
            ) : (
              <SecondaryButton
                type="button"
                icon="delete"
                disabled
                title={t("TOOLBAR_SELECT_HINT")}
              >
                {t("DELETE")}
              </SecondaryButton>
            )
          ) : null}
        </div>
      </div>
    );
  }, [
    bulkDeleteDisabled,
    canCreate,
    canDelete,
    dwId,
    openAddDrawer,
    openBulkDeleteModal,
    processesLoading,
    t,
  ]);

  useEffect(() => {
    setToolbarExtra(toolbarExtra);
    return () => setToolbarExtra(null);
  }, [setToolbarExtra, toolbarExtra]);

  if (!allowed) return null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overflow-x-hidden bg-surface-muted">
      <div className="shrink-0 border-b border-border bg-surface">
        <MainTabsBar
          className="!border-b-0"
          variant="bar"
          tabs={mainTabs}
          activeValue={activeProcessType}
          onSelect={setActiveProcessType}
          tablistAccessibility={{
            ariaLabel: t(
              "COMPUTE_PROCESS_EXEC_TYPE_TABS",
              "Compute execution type"
            ),
          }}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <InlineEditableTable
          selection={{
            count: selectedInTabCount,
            onClear: clearComputeSelection,
          }}
          scrollRef={tblScrollRef}
          loading={processesLoading}
          gridColumns={columns as EditableGridColumnDef<unknown>[]}
          tableClassName="tv-compute-process-grid min-w-[960px]"
          thead={
            <thead>
              <EditableDataGridThead columns={columns} showFilterRow />
            </thead>
          }
          tbody={
            <ServerDrivenListTbody<ComputeProcessListItem>
              colSpan={COMPUTE_PROCESS_GRID_COL_COUNT}
              rows={tabRows}
              columns={columns}
              getRowId={computeProcessRowId}
              activeRowId={activeRowId}
              editingRowId={null}
              getRowClassName={getComputeDataRowClassName}
              emptyMessage={t(
                "PROCESSES_NO_MATCH",
                "No processes match the current filters."
              )}
              showLoadingRow={false}
              showEmptyRow={!processesLoading && tabRows.length === 0}
              showDataRows={!processesLoading}
              renderAfterRow={({ row, rowId }) =>
                expandedExecutionRowIds.has(rowId) ? (
                  <ComputeProcessExecutionLogsPanel
                    dwId={dwId}
                    locale={locale}
                    process={row}
                    colSpan={COMPUTE_PROCESS_GRID_COL_COUNT}
                    t={t}
                    canDelete={canDelete}
                    onReExecuteSuccess={() => void loadProcesses()}
                  />
                ) : null
              }
            />
          }
        />
      </div>

      <DeletePermanentConfirmModal
        open={bulkDeleteOpen}
        onClose={closeBulkDeleteModal}
        title={
          processesToDelete.length === 1
            ? t("DELETE_PROCESS_TITLE", "Delete process definition")
            : t(
                "COMPUTE_PROCESS_BULK_DELETE_TITLE",
                "Delete process definitions"
              )
        }
        titleId="dm-compute-process-bulk-delete-title"
        closeAriaLabel={t("CLOSE")}
        dismissDisabled={bulkDeleteRunning}
        cancelLabel={t("CANCEL", "Cancel")}
        onCancel={closeBulkDeleteModal}
        confirmLabel={t("DELETE_PERMANENTLY", "Delete permanently")}
        confirmLoadingLabel={t("DELETING", "Deleting…")}
        confirmLoading={bulkDeleteRunning}
        onConfirm={handleConfirmBulkDelete}
      >
        <p className="modal-lead text-xs leading-relaxed text-text">
          {processesToDelete.length === 1
            ? t(
                "COMPUTE_PROCESS_DELETE_CONFIRM",
                "Delete this process definition? This cannot be undone."
              )
            : t(
                "COMPUTE_PROCESS_BULK_DELETE_LEAD",
                "Permanently delete {count} process definition(s)? This cannot be undone."
              ).replace("{count}", String(processesToDelete.length))}
        </p>
        <ul className="modal-list">
          {processesToDelete.map((row) => (
            <li key={row.id}>
              <span className="modal-list-name">
                {getSrcTitle(row.filter_object).trim() ||
                  getSrcPublisher(row.filter_object).trim() ||
                  `#${row.id}`}
              </span>
              {getSrcPublisher(row.filter_object).trim() ? (
                <span className="modal-list-meta">
                  {getSrcPublisher(row.filter_object).trim()}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </DeletePermanentConfirmModal>

      <Modal
        open={areasUnderDetail != null}
        onClose={closeAreasUnderDetail}
        title={t("AREAS_UNDER")}
        titleId="dm-compute-areas-under-detail-title"
        className="max-w-lg"
        bodyClassName="flex min-h-0 flex-col gap-3"
        footer={
          <SecondaryButton type="button" variant="modal" onClick={closeAreasUnderDetail}>
            {t("CLOSE")}
          </SecondaryButton>
        }
      >
        {areasUnderDetail?.kind === "all" ? (
          <p className="modal-lead text-xs leading-relaxed text-text-muted">
            {t(
              "COMPUTE_PROCESS_AREAS_DETAIL_ALL",
              "This process applies to all areas."
            )}
          </p>
        ) : areasUnderDetail?.kind === "list" ? (
          <>
            <p className="text-xs text-text-muted">
              {t(
                "COMPUTE_PROCESS_AREAS_DETAIL_COUNT",
                "{count} area(s) in this definition"
              ).replace("{count}", String(areasUnderDetail.areaIds.length))}
            </p>
            <SearchInputBar
              embedded
              placeholder={t("SEARCH_PLACEHOLDER")}
              value={areasDetailSearch}
              onChange={(e) => setAreasDetailSearch(e.target.value)}
              aria-label={t(
                "COMPUTE_PROCESS_AREAS_DETAIL_FILTER",
                "Filter area list"
              )}
            />
            <div className="min-h-0 max-h-[min(55vh,400px)] overflow-y-auto rounded border border-border bg-surface-muted/60">
              {areasDetailModalRows.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-text-muted">
                  {t(
                    "COMPUTE_PROCESS_AREAS_DETAIL_EMPTY_FILTER",
                    "No areas match your search."
                  )}
                </p>
              ) : (
                <ul className="divide-y divide-border px-0 py-0 text-xs">
                  {areasDetailModalRows.map(({ id, name }) => (
                    <li
                      key={id}
                      className="flex min-w-0 flex-col gap-0.5 px-3 py-2"
                    >
                      <span className="min-w-0 truncate font-medium text-text">
                        {name}
                      </span>
                      {name !== id ? (
                        <span className="min-w-0 truncate text-xs text-text-muted">
                          {id}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </Modal>

      <ComputeProcessAddDrawer
        open={addDrawerOpen}
        onClose={closeAddDrawer}
        processType={activeProcessType}
        processTypeLabel={activeProcessTypeLabel}
        dwId={dwId}
        locale={locale}
        t={t}
        areaLevels={filterCatalog.areaLevels}
        draft={
          addRowByType[activeProcessType] ?? DEFAULT_COMPUTE_ADD_DRAFT
        }
        setDraft={setActiveAddDraft}
        onOpenIusPicker={() => setIusPickerForType(activeProcessType)}
        onCreated={() => void loadProcesses()}
        disabled={!canCreate}
        publisherTextOptions={publisherTextOptions}
        publisherGridSuggestions={publisherGridSuggestions}
        titleTextOptions={titleTextOptions}
        titleGridSuggestions={titleGridSuggestions}
        sourceRows={sourceRows}
        sourcesLoading={sourcesLoading}
        onRefreshSources={loadDwSources}
      />

      <ComputeIusPickerModal
        open={iusPickerForType != null && pickerDraft != null}
        onClose={() => setIusPickerForType(null)}
        dwId={dwId}
        locale={locale}
        eligibleTargetProcessType={iusPickerForType}
        initialSelected={pickerDraft?.iusGids ?? []}
        onConfirm={(gids) => {
          const pt = iusPickerForType;
          if (!pt) return;
          setAddRowByType((prev) => ({
            ...prev,
            [pt]: {
              ...(prev[pt] ?? { ...DEFAULT_COMPUTE_ADD_DRAFT }),
              iusGids: gids,
            },
          }));
          setIusPickerForType(null);
        }}
      />

      <ComputeExecuteProcessModal
        open={executeProcess != null}
        onClose={() => setExecuteProcess(null)}
        dwId={dwId}
        process={executeProcess}
        onExecuted={() => void loadProcesses()}
      />
    </div>
  );
}
