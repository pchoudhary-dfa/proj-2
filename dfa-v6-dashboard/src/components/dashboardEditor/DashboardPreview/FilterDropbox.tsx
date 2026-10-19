"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import type { DragPayload } from "@/lib/dashboards/types";
import type { ResolvedGlobalFilter } from "@/lib/dashboards/editorState";
import { GridLayout, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const COLS = 12;
const ROW_HEIGHT = 40;
const DEFAULT_W = 3;
const DEFAULT_H = 1;

type FilterDropboxProps = {
  globalFilters: ResolvedGlobalFilter[];
  layout: Layout;
  onLayoutChange: (layout: Layout) => void;
  onDrop: (payload: DragPayload) => void;
  onRemoveFilter?: (placementId: string) => void;
};

export default function FilterDropbox({
  globalFilters,
  layout,
  onLayoutChange,
  onDrop,
  onRemoveFilter,
}: FilterDropboxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(900);
  const [dragOver, setDragOver] = useState(false);

  const measureWidth = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      containerRef.current = node;
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width);
        }
      });
      observer.observe(node);
      setContainerWidth(node.clientWidth);
    }
  }, []);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    try {
      const raw = e.dataTransfer.getData("application/json");
      if (!raw) return;
      const payload = JSON.parse(raw) as DragPayload;
      if (payload.dragType !== "global_filter") return;
      onDrop(payload);
    } catch {
      // ignore malformed data
    }
  };

  return (
    <div
      ref={measureWidth}
      className={`flex flex-1 items-center gap-2 overflow-x-auto px-3 transition-colors ${
        dragOver ? "bg-primary-soft" : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="shrink-0 flex grow">
        {globalFilters.length === 0 && !dragOver ? (
          <span className="w-full text-center text-sm text-text-muted">
            Drag and drop global filters here
          </span>
        ) : (
          <GridLayout
            className="layout"
            layout={layout}
            width={containerWidth}
            gridConfig={{
              cols: COLS,
              rowHeight: ROW_HEIGHT,
              margin: [4, 4] as const,
              containerPadding: [5, 5] as const,
              maxRows: Infinity,
            }}
            resizeConfig={{
              enabled: true,
              handles: ["se"] as const,
            }}
            dragConfig={{
              enabled: true,
              bounded: false,
              threshold: 3,
            }}
            onLayoutChange={onLayoutChange}
          >
            {globalFilters.map((filter) => (
              <div
                key={filter.placementId}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-3 text-xs font-medium text-text shadow-sm group"
              >
                <span className="material-icons !text-sm text-primary" aria-hidden>
                  {filter.icon}
                </span>
                <span className="truncate grow">{filter.name}</span>
                {onRemoveFilter && (
                  <button
                    type="button"
                    className="flex h-4 w-4 items-center justify-center rounded-full text-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-muted hover:text-text"
                    aria-label={`Remove ${filter.name}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveFilter(filter.placementId);
                    }}
                  >
                    <span className="material-icons !text-xs">close</span>
                  </button>
                )}
              </div>
            ))}
          </GridLayout>
        )}
      </div>
    </div>
  );
}

export { COLS as FILTER_COLS, ROW_HEIGHT as FILTER_ROW_HEIGHT, DEFAULT_W as FILTER_DEFAULT_W, DEFAULT_H as FILTER_DEFAULT_H };
