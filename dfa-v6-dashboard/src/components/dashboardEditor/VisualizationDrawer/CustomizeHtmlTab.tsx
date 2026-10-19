"use client";

import type { Dispatch, SetStateAction } from "react";
import type { CustomHtmlSettings, VisualizationState } from "@/lib/visualizations/types";
import { DEFAULT_CUSTOM_HTML } from "@/lib/visualizations/defaults";

type CustomizeHtmlTabProps = {
  htmlState: CustomHtmlSettings;
  setVizState: Dispatch<SetStateAction<VisualizationState>>;
};

export default function CustomizeHtmlTab({ htmlState, setVizState }: CustomizeHtmlTabProps) {
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
      <div className="sp-field">
        <label className="form-label">HTML</label>
        <textarea
          className="field-comp w-full min-h-[80px] resize-y px-[11px] py-1.5 text-xs"
          placeholder="Enter HTML"
          value={htmlState.html}
          onChange={(e) => updateHtml({ html: e.target.value })}
        />
      </div>
      <div className="sp-field">
        <label className="form-label">No Data Text</label>
        <textarea
          className="field-comp w-full min-h-[60px] resize-y px-[11px] py-1.5 text-xs"
          placeholder="Enter no data text"
          value={htmlState.noDataText}
          onChange={(e) => updateHtml({ noDataText: e.target.value })}
        />
      </div>
      <label className="config-toggle-row">
        <input
          type="checkbox"
          className="checkbox-comp"
          checked={htmlState.enableChildHook}
          onChange={(e) => updateHtml({ enableChildHook: e.target.checked })}
        />
        <span className="form-label">Enable Child Hook</span>
      </label>
    </div>
  );
}
