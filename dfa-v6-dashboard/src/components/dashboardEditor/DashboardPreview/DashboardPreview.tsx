"use client";

import { useCallback, useMemo, type Dispatch } from "react";

import DashboardDropbox, { DEFAULT_W, DEFAULT_H } from "./DashboardDropbox";
import { DashboardSheetTabs } from "./DashboardSheetTabs";
import FilterDropbox, {
  FILTER_DEFAULT_W,
  FILTER_DEFAULT_H,
} from "./FilterDropbox";

import type { DashboardFormValues, DragPayload, FilterItem } from "@/lib/dashboards/types";
import {
  type DashboardEditorAction,
  type DashboardEditorState,
  type GridLayoutItemData,
  CANVAS_DEFAULT_W,
  CANVAS_DEFAULT_H,
  createDefaultSection,
  getActiveSection,
  getSectionTabs,
  resolveCanvasBlocks,
  resolveGlobalFilters,
} from "@/lib/dashboards/editorState";
import type { VisualizationState } from "@/lib/visualizations/types";

type DashboardPreviewProps = {
  editorState: DashboardEditorState;
  dispatch: Dispatch<DashboardEditorAction>;
  configurationValues: DashboardFormValues | null;
  liveVizPreview: VisualizationState | null;
  baseUrl: string;
  onVisualizationDrop?: (vizId: string) => void;
  onEditBlock?: (vizId: string) => void;
};

export default function DashboardPreview(props: DashboardPreviewProps) {
  const {
    editorState,
    dispatch,
    configurationValues,
    liveVizPreview,
    baseUrl,
    onVisualizationDrop,
    onEditBlock,
  } = props;

  const activeSection = getActiveSection(editorState);
  const sectionTabs = getSectionTabs(editorState);
  const canvasBlocks = activeSection?.canvas.blocks ?? [];
  const canvasLayout = activeSection?.canvas.layout ?? [];

  const resolvedBlocks = useMemo(() => {
    const blocks = resolveCanvasBlocks(editorState, canvasBlocks);
    if (!liveVizPreview) return blocks;
    const vizId = liveVizPreview.vizId;
    const hasMatch = blocks.some(
      (b) => b.sourceType === "visualization" && b.entityId === vizId,
    );
    if (!hasMatch) return blocks;
    return blocks.map((b) =>
      b.sourceType === "visualization" && b.entityId === vizId
        ? { ...b, name: liveVizPreview.name, typeId: liveVizPreview.typeId, settings: liveVizPreview.settings }
        : b,
    );
  }, [editorState, canvasBlocks, liveVizPreview]);

  const globalFilters = useMemo(
    () => resolveGlobalFilters(editorState),
    [editorState],
  );

  const handleTabClick = useCallback(
    (tabId: string) => {
      dispatch({ type: "SET_ACTIVE_SECTION", sectionId: tabId });
    },
    [dispatch],
  );

  const handleTabReorder = useCallback(
    (newTabs: { id: string; label: string }[]) => {
      const reordered = newTabs
        .map((tab) => editorState.sections.find((s) => s.id === tab.id))
        .filter((s): s is NonNullable<typeof s> => s !== undefined);
      dispatch({ type: "REORDER_SECTIONS", sections: reordered });
    },
    [dispatch, editorState.sections],
  );

  const handleTabRename = useCallback(
    (tabId: string, newLabel: string) => {
      dispatch({ type: "RENAME_SECTION", sectionId: tabId, label: newLabel });
    },
    [dispatch],
  );

  const handleTabAdd = useCallback(() => {
    const section = createDefaultSection(
      `Sheet ${editorState.sections.length + 1}`,
    );
    dispatch({ type: "ADD_SECTION", section });
  }, [dispatch, editorState.sections.length]);

  const handleTabClose = useCallback(
    (tabId: string) => {
      dispatch({ type: "DELETE_SECTION", sectionId: tabId });
    },
    [dispatch],
  );

  const handleDropOnFilterPreview = useCallback(
    (payload: DragPayload) => {
      if (payload.dragType !== "global_filter") return;
      const filter = payload.dragData as FilterItem;

      const placementId = `gf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const maxX = editorState.globalFilterBar.layout.reduce(
        (acc, item) => Math.max(acc, item.x + item.w),
        0,
      );
      const layoutItem: GridLayoutItemData = {
        i: placementId,
        x: maxX,
        y: 0,
        w: FILTER_DEFAULT_W,
        h: FILTER_DEFAULT_H,
      };

      dispatch({
        type: "PLACE_GLOBAL_FILTER",
        placement: { placementId, filterId: filter.id },
        layoutItem,
      });
    },
    [dispatch, editorState.globalFilterBar.layout],
  );

  const handleRemoveGlobalFilter = useCallback(
    (placementId: string) => {
      dispatch({ type: "REMOVE_GLOBAL_FILTER", placementId });
    },
    [dispatch],
  );

  const handleDropOnCanvas = useCallback(
    (payload: DragPayload) => {
      if (payload.dragType === "global_filter") return;

      const sectionId = editorState.activeSectionId;
      const section = getActiveSection(editorState);
      if (!section) return;

      const placementId = `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const blockCount = section.canvas.blocks.length;

      if (payload.dragType === "select_list_filter") {
        const filter = payload.dragData as FilterItem;
        const layoutItem: GridLayoutItemData = {
          i: placementId,
          x: (blockCount * DEFAULT_W) % 12,
          y: Infinity,
          w: DEFAULT_W,
          h: DEFAULT_H,
          minW: 1,
          minH: 1,
        };
        dispatch({
          type: "PLACE_SELECT_LIST_FILTER_ON_SECTION",
          sectionId,
          block: {
            placementId,
            sourceType: "select_list_filter",
            entityId: filter.id,
          },
          layoutItem,
        });
        return;
      }

      const viz = payload.dragData as VisualizationState;
      const layoutItem: GridLayoutItemData = {
        i: placementId,
        x: (blockCount * CANVAS_DEFAULT_W) % 12,
        y: Infinity,
        w: CANVAS_DEFAULT_W,
        h: CANVAS_DEFAULT_H,
        minW: 1,
        minH: 1,
      };
      dispatch({
        type: "PLACE_VISUALIZATION_ON_SECTION",
        sectionId,
        block: {
          placementId,
          sourceType: "visualization",
          entityId: viz.vizId,
        },
        layoutItem,
      });
      onVisualizationDrop?.(viz.vizId);
    },
    [dispatch, editorState, onVisualizationDrop],
  );

  const handleLayoutChange = useCallback(
    (newLayout: readonly GridLayoutItemData[]) => {
      dispatch({
        type: "UPDATE_SECTION_LAYOUT",
        sectionId: editorState.activeSectionId,
        layout: [...newLayout],
      });
    },
    [dispatch, editorState.activeSectionId],
  );

  const handleRemoveBlock = useCallback(
    (placementId: string) => {
      dispatch({
        type: "REMOVE_CANVAS_BLOCK",
        sectionId: editorState.activeSectionId,
        placementId,
      });
    },
    [dispatch, editorState.activeSectionId],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col m-2 mr-3 h-[89%] gap-2">
      <div className="flex h-[15%] rounded-md border border-border bg-surface shadow-sm">
        <FilterDropbox
          globalFilters={globalFilters}
          layout={editorState.globalFilterBar.layout}
          onLayoutChange={(l) =>
            dispatch({ type: "UPDATE_GLOBAL_FILTER_LAYOUT", layout: [...l] })
          }
          onDrop={handleDropOnFilterPreview}
          onRemoveFilter={handleRemoveGlobalFilter}
        />
      </div>
      <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-surface shadow-sm grow ">
        <DashboardSheetTabs
          tabs={sectionTabs}
          activeId={editorState.activeSectionId}
          onTabClick={handleTabClick}
          onReorder={handleTabReorder}
          onRenameTab={handleTabRename}
          onAddTab={handleTabAdd}
          onCloseTab={handleTabClose}
        />
        <DashboardDropbox
          canvasBlocks={resolvedBlocks}
          layout={canvasLayout}
          baseUrl={baseUrl}
          onLayoutChange={handleLayoutChange}
          onDrop={handleDropOnCanvas}
          onRemoveBlock={handleRemoveBlock}
          onEditBlock={onEditBlock}
          headerHtml={configurationValues?.headerFooter.headerHtml}
          footerHtml={configurationValues?.headerFooter.footerHtml}
          footerFixedAtBottom={
            configurationValues?.headerFooter.footerFixedAtBottom
          }
        />
      </div>
    </div>
  );
}
