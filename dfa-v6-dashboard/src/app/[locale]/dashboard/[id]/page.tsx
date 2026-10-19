"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useReducer, useState } from "react";

import { useAppConfig } from "@/contexts/AppConfigContext";
import { buildLocaleAppPath, getApiBaseUrl, DW_PATH } from "@/lib/constants";
import {
  type FilterItem,
  type FilterTypeId,
  type VisualizationTypeId,
  EMPTY_DASHBOARD_FORM,
  EMPTY_FILTER_ITEM,
  rowToFormValues,
  findDashboardById,
} from "@/lib/dashboards/types";
import {
  dashboardEditorReducer,
  createInitialDashboardState,
  getAvailableFilters,
  getAvailableVisualizations,
  getVisualizationById,
  INITIAL_UI_STATE,
  type DashboardEditorUIState,
} from "@/lib/dashboards/editorState";

import { DashboardConfigurationDrawer } from "@/components/dashboardEditor/Configuration/DashboardConfigurationDrawer";
import { DashboardEditorToolbar } from "@/components/dashboardEditor/DashboardEditorToolbar";
import { VisualizationSidebar } from "@/components/dashboardEditor/VisualizationSidebar";
import { VisualizationDrawer } from "@/components/dashboardEditor/VisualizationDrawer";
import { VisualizationCreateModal } from "@/components/dashboardEditor/VisualizationCreateModal";
import { DEFAULT_VISUALIZATION_SETTINGS } from "@/lib/visualizations/defaults";
import type { VisualizationState } from "@/lib/visualizations/types";
import { FilterCreateModal } from "@/components/dashboardEditor/FilterCreateModal";
import { FilterEditDrawer } from "@/components/dashboardEditor/FilterEditDrawer";
import DashboardPreview from "@/components/dashboardEditor/DashboardPreview/DashboardPreview";

function DashboardEditorShell() {
  const params = useParams();
  const locale = typeof params.locale === "string" ? params.locale : "en";
  const dashboardId = typeof params.id === "string" ? params.id : "";
  const dashboard = dashboardId ? findDashboardById(dashboardId) : undefined;
  const { isLoading, error } = useAppConfig();

  const initialConfigValues = dashboard ? rowToFormValues(dashboard) : null;

  const [editorState, dispatch] = useReducer(
    dashboardEditorReducer,
    dashboardId,
    (id) =>
      createInitialDashboardState(
        id,
        dashboard ? rowToFormValues(dashboard) : EMPTY_DASHBOARD_FORM,
      ),
  );

  const [uiState, setUiState] = useState<DashboardEditorUIState>(INITIAL_UI_STATE);

  const configurationValues =
    uiState.savedConfigOverride ?? initialConfigValues;

  const dwBaseUrl = dashboard?.datawarehouseId
    ? `${getApiBaseUrl()}${DW_PATH}/${dashboard.datawarehouseId}`
    : "";

  const availableVisualizations = useMemo(
    () => getAvailableVisualizations(editorState),
    [editorState],
  );

  const availableFilters = useMemo(
    () => getAvailableFilters(editorState),
    [editorState],
  );

  const editingVizItem = useMemo(() => {
    if (!uiState.editingVizId) return null;
    return getVisualizationById(editorState, uiState.editingVizId) ?? null;
  }, [editorState, uiState.editingVizId]);

  const editingFilterItem = useMemo(() => {
    if (!uiState.editingFilterId) return null;
    return editorState.filters.find((f) => f.id === uiState.editingFilterId) ?? null;
  }, [editorState.filters, uiState.editingFilterId]);

  const openVizPanel = useCallback((item: VisualizationState) => {
    setUiState((prev) => ({
      ...prev,
      editingVizId: item.vizId,
      vizDrawerOpen: true,
    }));
  }, []);

  const closeVizPanel = useCallback(() => {
    setUiState((prev) => ({
      ...prev,
      vizDrawerOpen: false,
      editingVizId: null,
      liveVizPreview: null,
    }));
  }, []);

  const handleEditVisualization = useCallback(
    (item: VisualizationState) => {
      openVizPanel(item);
    },
    [openVizPanel],
  );

  const handleAddVisualization = useCallback((name: string, typeId: string) => {
    const vizId = `viz-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newVizItem: VisualizationState = {
      vizId,
      inUse: false,
      name,
      typeId: typeId as VisualizationTypeId,
      settings: {
        ...DEFAULT_VISUALIZATION_SETTINGS,
        charts: { typeId: typeId as VisualizationTypeId, chartVariant: "" },
      },
    };
    dispatch({ type: "ADD_VISUALIZATION", visualization: newVizItem });
  }, []);

  const handleDeleteVisualization = useCallback((item: VisualizationState) => {
    dispatch({ type: "DELETE_VISUALIZATION", vizId: item.vizId });
  }, []);

  const handlePreviewVisualization = useCallback((_item: VisualizationState) => {}, []);

  const handleVisualizationDropped = useCallback(
    (vizId: string) => {
      const viz = getVisualizationById(editorState, vizId);
      if (viz) openVizPanel({ ...viz, inUse: true });
    },
    [editorState, openVizPanel],
  );

  const handleEditCanvasBlock = useCallback(
    (vizId: string) => {
      const vizItem = getVisualizationById(editorState, vizId);
      if (vizItem) openVizPanel(vizItem);
    },
    [editorState, openVizPanel],
  );

  const handleAddFilter = useCallback((name: string, filterType: FilterTypeId) => {
    const newFilter: FilterItem = {
      id: Math.random().toString(36).substring(2, 15),
      name,
      filterType,
      ...EMPTY_FILTER_ITEM,
    };
    dispatch({ type: "ADD_FILTER", filter: newFilter });
    setUiState((prev) => ({
      ...prev,
      editingFilterId: newFilter.id,
      filterDrawerOpen: true,
    }));
  }, []);

  const handleEditFilter = useCallback((filter: FilterItem) => {
    setUiState((prev) => ({
      ...prev,
      editingFilterId: filter.id,
      filterDrawerOpen: true,
    }));
  }, []);

  const handleSaveFilter = useCallback((filter: FilterItem) => {
    dispatch({ type: "UPDATE_FILTER", filter });
    setUiState((prev) => ({
      ...prev,
      editingFilterId: null,
      filterDrawerOpen: false,
    }));
  }, []);

  const handleDeleteFilter = useCallback((filter: FilterItem) => {
    dispatch({ type: "DELETE_FILTER", filterId: filter.id });
  }, []);

  const handleSaveVisualizationItem = useCallback(
    (item: VisualizationState) => {
      dispatch({ type: "UPDATE_VISUALIZATION", visualization: item });
      setUiState((prev) => ({
        ...prev,
        liveVizPreview: null,
      }));
      closeVizPanel();
    },
    [closeVizPanel],
  );

  const handleVizDrawerChange = useCallback((item: VisualizationState) => {
    setUiState((prev) => ({ ...prev, liveVizPreview: item }));
  }, []);

  const listHref = buildLocaleAppPath(locale, "dashboard");

  if (isLoading) {
    return (
      <div className="app-body flex items-center justify-center">
        <div className="loader">
          <div className="loader__logo">
            <span className="text-lg font-bold text-on-primary">A</span>
          </div>
          <p className="loader__status-text">Loading project configuration...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-body flex items-center justify-center p-lg">
        <p className="modal-error text-center text-sm">{error}</p>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="app-body flex flex-col">
        <main className="flex flex-1 flex-col items-center justify-center gap-3 bg-surface-muted p-lg">
          <p className="text-sm text-text">Dashboard not found.</p>
          <Link href={listHref} className="btn-comp-primary">
            Back to dashboards
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="app-body flex flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <DashboardEditorToolbar
          title={dashboard.title}
          backHref={listHref}
          onConfigurationClick={() =>
            setUiState((prev) => ({ ...prev, configurationOpen: true }))
          }
        />
        {configurationValues ? (
          <DashboardConfigurationDrawer
            open={uiState.configurationOpen}
            initialValues={configurationValues}
            datawarehouseOptions={[]}
            onClose={() =>
              setUiState((prev) => ({ ...prev, configurationOpen: false }))
            }
            onSave={(values) => {
              dispatch({ type: "SET_CONFIG", config: values });
              setUiState((prev) => ({
                ...prev,
                savedConfigOverride: values,
                configurationOpen: false,
              }));
            }}
          />
        ) : null}
        <VisualizationCreateModal
          open={uiState.vizCreateModalOpen}
          onClose={() =>
            setUiState((prev) => ({ ...prev, vizCreateModalOpen: false }))
          }
          onCreate={handleAddVisualization}
        />
        <FilterCreateModal
          open={uiState.filterCreateModalOpen}
          onClose={() =>
            setUiState((prev) => ({ ...prev, filterCreateModalOpen: false }))
          }
          onCreate={handleAddFilter}
        />
        <FilterEditDrawer
          open={uiState.filterDrawerOpen}
          item={editingFilterItem}
          onClose={() =>
            setUiState((prev) => ({ ...prev, filterDrawerOpen: false }))
          }
          onSave={handleSaveFilter}
        />
        <div className="flex min-h-0 flex-1 overflow-hidden bg-surface-muted">
          {!uiState.vizDrawerOpen && (
            <VisualizationSidebar
              items={availableVisualizations}
              filters={availableFilters}
              onEditItem={handleEditVisualization}
              onDeleteItem={handleDeleteVisualization}
              onAddItem={() =>
                setUiState((prev) => ({ ...prev, vizCreateModalOpen: true }))
              }
              onPreviewItem={handlePreviewVisualization}
              onAddFilter={() =>
                setUiState((prev) => ({ ...prev, filterCreateModalOpen: true }))
              }
              onEditFilter={handleEditFilter}
              onDeleteFilter={handleDeleteFilter}
            />
          )}
          <DashboardPreview
            editorState={editorState}
            dispatch={dispatch}
            configurationValues={configurationValues}
            liveVizPreview={uiState.liveVizPreview}
            baseUrl={dwBaseUrl}
            onVisualizationDrop={handleVisualizationDropped}
            onEditBlock={handleEditCanvasBlock}
          />
          <VisualizationDrawer
            open={uiState.vizDrawerOpen}
            item={editingVizItem}
            onSave={handleSaveVisualizationItem}
            onChange={handleVizDrawerChange}
            onClose={closeVizPanel}
            baseUrl={dwBaseUrl}
          />
        </div>
      </div>
    </div>
  );
}

export default function DashboardEditorPage() {
  return <DashboardEditorShell />;
}
