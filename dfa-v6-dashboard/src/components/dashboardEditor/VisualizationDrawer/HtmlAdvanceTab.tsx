"use client";

import type { Dispatch, SetStateAction } from "react";
import { SelectField } from "@/components/SelectField";
import type { CustomHtmlSettings, VisualizationState } from "@/lib/visualizations/types";
import { DEFAULT_CUSTOM_HTML } from "@/lib/visualizations/defaults";

type HtmlAdvanceTabProps = {
  htmlState: CustomHtmlSettings;
  setVizState: Dispatch<SetStateAction<VisualizationState>>;
};

export default function HtmlAdvanceTab({ htmlState, setVizState }: HtmlAdvanceTabProps) {
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
        <label className="form-label">
          <span className="text-error">*</span> Datawarehouse Connection
        </label>
        <SelectField
          className="w-full"
          options={[
            { value: "", label: "Select datawarehouse" },
            { value: "sample_dw", label: "Sample Data warehouse [en,fr,ar]" },
          ]}
          value={htmlState.datawarehouseConnection}
          onChange={(e) => updateHtml({ datawarehouseConnection: e.target.value })}
        />
      </div>
      <label className="config-toggle-row">
        <input
          type="checkbox"
          className="checkbox-comp"
          checked={htmlState.enableExternalApi}
          onChange={(e) => updateHtml({ enableExternalApi: e.target.checked })}
        />
        <span className="form-label">Enable External API</span>
      </label>
    </div>
  );
}
