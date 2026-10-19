"use client";

import { PrimarySaveButton } from "@/components/PrimarySaveButton";
import { useEffect, useMemo, useState } from "react";
import type { VisualizationState } from "@/lib/visualizations/types";
import {
  EMPTY_VISUALIZATION_STATE,
  getTabsForType
} from "@/lib/visualizations/defaults";
import TabContent from "./TabContent";

// ─── Drawer ─────────────────────────────────────────────────────────────────

type VisualizationDrawerProps = {
  open: boolean;
  item: VisualizationState | null;
  onClose: () => void;
  onSave: (item: VisualizationState) => void;
  onChange?: (item: VisualizationState) => void;
  baseUrl?: string;
};

export function VisualizationDrawer({
  open,
  item,
  onClose,
  onSave,
  onChange,
  baseUrl = "",
}: VisualizationDrawerProps) {
  const [activeTab, setActiveTab] = useState("charts");
  const [vizState, setVizState] = useState<VisualizationState>(EMPTY_VISUALIZATION_STATE);

  useEffect(() => {
    if (open && item) {
      setActiveTab("charts");
      setVizState({ ...item });
    }
  }, [open, item]);

  useEffect(() => {
    if (open && onChange) {
      onChange(vizState);
    }
  }, [vizState, open]);

  const tabs = useMemo(() => getTabsForType(vizState.typeId), [vizState.typeId]);

  useEffect(() => {
    const tabIds = tabs.map((t) => t.id);
    if (!tabIds.includes(activeTab)) {
      setActiveTab("charts");
    }
  }, [tabs, activeTab]);

  const handleSave = () => {
    onSave(vizState);
  };

  if (!open || !item) return null;

  const title = "Add Visualization";

  return (
    <aside className="flex w-[35%] shrink-0 flex-col border-l border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-surface-muted"
            onClick={onClose}
            aria-label="Back"
          >
            <span className="material-icons !text-base text-text-muted">arrow_back</span>
          </button>
          <h3 className="text-sm font-semibold text-text truncate">{title}</h3>
        </div>
      </div>

      <nav className="flex-wrap bc-main-tabs shrink-0 overflow-x-auto border-b border-border px-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`btn-comp-tab whitespace-nowrap !text-xs ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 h-[70%] overflow-y-auto px-4 py-4">
        <TabContent
          activeTab={activeTab}
          vizState={vizState}
          setVizState={setVizState}
          baseUrl={baseUrl}
        />
      </div>

      <div className="flex items-center justify-end gap-2 shrink-0 border-t border-border px-4 py-3">
        <button
          type="button"
          className="btn-comp-secondary !h-9 !text-xs font-semibold"
          onClick={onClose}
        >
          Cancel
        </button>
        <PrimarySaveButton
          className="!h-9 !text-xs font-semibold"
          onClick={handleSave}
        >
          Save
        </PrimarySaveButton>
      </div>
    </aside>
  );
}
