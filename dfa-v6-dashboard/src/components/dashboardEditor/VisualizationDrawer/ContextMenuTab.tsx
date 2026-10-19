"use client";

import type { Dispatch, SetStateAction } from "react";
import type { CustomHtmlSettings, VisualizationState } from "@/lib/visualizations/types";
import { DEFAULT_CUSTOM_HTML } from "@/lib/visualizations/defaults";

type ContextMenuTabProps = {
  htmlState: CustomHtmlSettings;
  setVizState: Dispatch<SetStateAction<VisualizationState>>;
};

export default function ContextMenuTab({ htmlState, setVizState }: ContextMenuTabProps) {
  function updateHtml(patch: Partial<CustomHtmlSettings>) {
    setVizState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        customHtml: { ...(prev.settings.customHtml ?? DEFAULT_CUSTOM_HTML), ...patch },
      },
    }));
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="config-toggle-row">
        <input
          type="checkbox"
          className="checkbox-comp"
          checked={htmlState.enableContextMenu}
          onChange={(e) => updateHtml({ enableContextMenu: e.target.checked })}
        />
        <span className="form-label">Enable Context Menu</span>
      </label>
    </div>
  );
}
