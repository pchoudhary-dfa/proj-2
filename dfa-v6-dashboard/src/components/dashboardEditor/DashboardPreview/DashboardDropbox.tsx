"use client";
import { useCallback, useRef, useState, type DragEvent } from "react";
import { GridLayout, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import type { DragPayload, VisualizationTypeId } from "@/lib/dashboards/types";
import type { ResolvedCanvasBlock } from "@/lib/dashboards/editorState";
import { ChartPreview } from "../ChartPreview";

export type GridLayoutItemData = Layout;

const DEFAULT_W = 4;
const DEFAULT_H = 3;
const COLS = 12;
const ROW_HEIGHT = 50;

type DashboardDropboxProps = {
  canvasBlocks: ResolvedCanvasBlock[];
  layout: Layout;
  baseUrl: string;
  onLayoutChange: (layout: Layout) => void;
  onDrop: (payload: DragPayload) => void;
  onRemoveBlock?: (blockId: string) => void;
  onEditBlock?: (vizId: string) => void;
  headerHtml?: string;
  footerHtml?: string;
  footerFixedAtBottom?: boolean;
};

export default function DashboardDropbox({
  canvasBlocks,
  layout,
  baseUrl,
  onLayoutChange,
  onDrop,
  onRemoveBlock,
  onEditBlock,
  headerHtml,
  footerHtml,
  footerFixedAtBottom,
}: DashboardDropboxProps) {

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
      if (payload.dragType === "global_filter") return;
      onDrop(payload);
    } catch {
      // ignore malformed data
    }
  };

  return (
    <div
      ref={measureWidth}
      className={`relative flex min-h-0 flex-1 flex-col overflow-auto transition-colors ${
        dragOver ? "bg-primary-soft" : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {headerHtml && (
        <div
          className="shrink-0 w-full flex-none [&_header]:!static"
          dangerouslySetInnerHTML={{ __html: headerHtml }}
        />
      )}

      <div className="shrink-0 flex grow">
        {canvasBlocks.length === 0 && !dragOver ? (
          <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
            Drag and drop visualizations here
          </div>
        ) : (
          <GridLayout
            className="layout"
            layout={layout}
            width={containerWidth}
            gridConfig={{
              cols: COLS,
              rowHeight: ROW_HEIGHT,
              margin: [1, 1] as const,
              containerPadding: [5, 5] as const,
              maxRows: Infinity,
            }}
            resizeConfig={{
              enabled: true,
              handles: ["se", "e", "s"] as const,
            }}
            dragConfig={{
              enabled: true,
              bounded: false,
              threshold: 3,
            }}
            onLayoutChange={onLayoutChange}
          >
            {canvasBlocks.map((block) => (
              <div
                key={block.placementId}
                className="relative border-2 border-white/30 shadow-md flex flex-col items-center justify-center gap-2 select-none overflow-hidden group"
              >
                <div className="absolute top-1 right-1 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {onEditBlock && block.sourceType === "visualization" && (
                    <button
                      type="button"
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/70"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditBlock(block.entityId);
                      }}
                    >
                      <span className="material-icons !text-xs">edit</span>
                    </button>
                  )}
                  {onRemoveBlock && (
                    <button
                      type="button"
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/70"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveBlock(block.placementId);
                      }}
                    >
                      <span className="material-icons !text-xs">close</span>
                    </button>
                  )}
                </div>
                {block.sourceType === "visualization" && block.typeId ? (
                  <ChartPreview
                    typeId={block.typeId as VisualizationTypeId}
                    vizSettings={block.settings}
                    baseUrl={baseUrl}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-text-muted">
                    <span className="material-icons text-primary">
                      {block.icon ?? "filter_list"}
                    </span>
                    <span className="text-xs font-medium text-text truncate max-w-full px-2">
                      {block.name}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </GridLayout>
        )}
      </div>
      {footerHtml && (
        <div
          className={`shrink-0 w-full flex-none [&_footer]:!static ${footerFixedAtBottom ? "mt-auto" : ""}`}
          dangerouslySetInnerHTML={{ __html: footerHtml }}
        />
      )}
    </div>
  );
}
export { DEFAULT_W, DEFAULT_H, COLS, ROW_HEIGHT };

