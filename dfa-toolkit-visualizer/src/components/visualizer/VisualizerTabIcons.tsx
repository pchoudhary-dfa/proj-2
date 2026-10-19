"use client";

import { BarChart3, Table, FileText, Lightbulb } from "lucide-react";
import { getTooltipHandlers } from "@/components/CustomTooltip";
import { useCore } from "@/contexts/CoreContext";

export type VisualizerContentViewTab = "visualization" | "data" | "metadata";

export interface VisualizerTabIconsProps {
  activeTab: VisualizerContentViewTab;
  onTabChange?: (tab: VisualizerContentViewTab) => void;
  /** Optional class for the wrapper div (e.g. "border-r border-border pr-2 xl:pr-3" or "mb-3"). */
  className?: string;
  /** Called when the Insights icon button is clicked. Only shown when ENABLE_INSIGHTS="yes" in app config. */
  onInsightsClick?: () => void;
  /** Whether the Insights panel is currently active/open (for active styling). */
  insightsActive?: boolean;
}

export function VisualizerTabIcons({
  activeTab,
  onTabChange,
  className = "",
  onInsightsClick,
  insightsActive = false,
}: VisualizerTabIconsProps) {
  const { t, getConfig } = useCore();

  const insightsEnabled = getConfig("ENABLE_INSIGHTS").toLowerCase() === "yes";

  const baseClass =
    "flex items-center gap-1 shrink-0 justify-end-safe";
  const wrapperClass = className ? `${baseClass} ${className}` : baseClass;

  return (
    <div className={wrapperClass} role="tablist" aria-label={t("VISUALIZER_ARIA_CONTENT_VIEW")}>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "visualization"}
        onClick={() => onTabChange?.("visualization")}
        className={`btn-comp-secondary flex items-center justify-center p-2 rounded-md transition-colors shrink-0 ${
          activeTab === "visualization"
            ? "bg-primary/10 text-primary"
            : "text-text-muted hover:text-text hover:bg-surface-muted"
        }`}
        {...getTooltipHandlers(t("VISUALIZER_TAB_VISUALIZATION"))}
      >
        <BarChart3 className="w-5 h-5" />
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "data"}
        onClick={() => onTabChange?.("data")}
        className={`btn-comp-secondary flex items-center justify-center p-2 rounded-md transition-colors shrink-0 ${
          activeTab === "data"
            ? "bg-primary/10 text-primary"
            : "text-text-muted hover:text-text hover:bg-surface-muted"
        }`}
        {...getTooltipHandlers(t("VISUALIZER_TAB_DATA_TABLE"))}
      >
        <Table className="w-5 h-5" />
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "metadata"}
        onClick={() => onTabChange?.("metadata")}
        className={`btn-comp-secondary flex items-center justify-center p-2 rounded-md transition-colors shrink-0 ${
          activeTab === "metadata"
            ? "bg-primary/10 text-primary"
            : "text-text-muted hover:text-text hover:bg-surface-muted"
        }`}
        {...getTooltipHandlers(t("VISUALIZER_TAB_METADATA"))}
      >
        <FileText className="w-5 h-5" />
      </button>
      {insightsEnabled && (
        <button
          type="button"
          role="button"
          onClick={onInsightsClick}
          className={`btn-comp-secondary flex items-center justify-center p-2 rounded-md transition-colors shrink-0 ${
            insightsActive
              ? "bg-primary/10 text-primary"
              : "text-text-muted hover:text-text hover:bg-surface-muted"
          }`}
          {...getTooltipHandlers(t("INSIGHTS"))}
        >
          <Lightbulb className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
