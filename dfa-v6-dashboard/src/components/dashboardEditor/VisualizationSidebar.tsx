"use client";

import { DashboardWidgetActions } from "@/components/dashboardEditor/DashboardWidgetActions";
import type { VisualizationState } from "@/lib/visualizations/types";
import type { FilterItem, DragPayload } from "@/lib/dashboards/types";
import { FILTER_TYPES, iconFromType } from "@/lib/dashboards/types";
import { useMemo, useState, type DragEvent } from "react";

type SidebarTab = "visualization" | "filters";

type VisualizationSidebarProps = {
  items: VisualizationState[];
  filters: FilterItem[];
  onEditItem: (item: VisualizationState) => void;
  onDeleteItem?: (item: VisualizationState) => void;
  onAddItem?: () => void;
  onPreviewItem: (item: VisualizationState) => void;
  onAddFilter?: () => void;
  onEditFilter?: (filter: FilterItem) => void;
  onDeleteFilter?: (filter: FilterItem) => void;
};

export function VisualizationSidebar({
  items,
  filters,
  onEditItem,
  onDeleteItem,
  onAddItem,
  onPreviewItem,
  onAddFilter,
  onEditFilter,
  onDeleteFilter,
}: VisualizationSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("visualization");

  const handleDragStart = (e: DragEvent<HTMLDivElement>, item: VisualizationState) => {
    const payload:DragPayload={dragType:'visualization',dragData:item};
    e.dataTransfer.setData("application/json", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleFilterDragStart = (e: DragEvent<HTMLDivElement>, filter: FilterItem) => {
    const payload: DragPayload = filter.filterType === "global"
      ? { dragType: "global_filter", dragData: filter }
      : { dragType: "select_list_filter", dragData: filter };
    e.dataTransfer.setData("application/json", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <aside className="side-nav-col w-[20%] shrink-0 !bg-surface">
      <div className="shrink-0 px-1 pt-1 pb-2">
        <p className="text-lg font-bold text-text">Visualization</p>
      </div>

      <div className="shrink-0 px-1 pb-2">
        <div className="flex rounded-sm border border-border bg-surface-muted">
          <button
            type="button"
            className={`flex-1 text-xs rounded-tl-sm rounded-bl-sm py-1.5 px-2.5 font-semibold transition-colors ${
              activeTab === "visualization"
                ? "bg-primary-subtle text-primary shadow-sm"
                : "text-text-muted hover:text-text"
            }`}
            onClick={() => setActiveTab("visualization")}
          >
            Visualization
          </button>
          <button
            type="button"
            className={`flex-1 text-xs rounded-tl-sm rounded-bl-sm py-1.5 px-2.5 font-semibold transition-colors ${
              activeTab === "filters"
                ? "bg-primary-subtle text-primary shadow-sm"
                : "text-text-muted hover:text-text"
            }`}
            onClick={() => setActiveTab("filters")}
          >
            Filters
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {activeTab === "visualization" && (
          <>
            <button
              type="button"
              className="btn-comp-primary w-full gap-1.5"
              onClick={onAddItem}
            >
              <span className="material-icons !text-sm leading-none">add</span>
              Add visualization
            </button>

            <div className="mt-2 flex flex-col gap-2">
              {items.map((item) => (
                item.inUse?null:(<div
                  key={item.vizId}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item)}
                  className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-2 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[color:color-mix(in_srgb,var(--color-primary)_10%,var(--color-surface))] text-primary"
                    aria-hidden
                  >
                    <span className="material-icons !text-base leading-none">
                      {iconFromType(item.typeId)}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-text">
                    {item.name}
                  </span>
                  <DashboardWidgetActions
                    onEdit={() => onEditItem(item)}
                    onDelete={() => onDeleteItem?.(item)}
                    onPreview={() => onPreviewItem(item)}
                  />
                </div>)
              ))}
            </div>
          </>
        )}

        {activeTab === "filters" && (
          <>
            <button
              type="button"
              className="btn-comp-primary w-full gap-1.5"
              onClick={onAddFilter}
            >
              <span className="material-icons !text-sm leading-none">add</span>
              Add filter
            </button>

            <div className="mt-2 flex flex-col gap-2">
              {filters.map((filter) => {
                const typeInfo = FILTER_TYPES.find((t) => t.id === filter.filterType);
                return (
                  <div
                    key={filter.id}
                    draggable
                    onDragStart={(e) => handleFilterDragStart(e, filter)}
                    className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-2 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[color:color-mix(in_srgb,var(--color-primary)_10%,var(--color-surface))] text-primary"
                      aria-hidden
                    >
                      <span className="material-icons !text-base leading-none">
                        {typeInfo?.icon ?? "filter_list"}
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-text">
                        {filter.name}
                      </span>
                      <span className="block truncate text-[10px] text-text-muted">
                        {typeInfo?.label ?? "Filter"}
                      </span>
                    </div>
                    <DashboardWidgetActions
                      onEdit={() => onEditFilter?.(filter)}
                      onDelete={() => onDeleteFilter?.(filter)}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
