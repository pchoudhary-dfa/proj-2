"use client";

import type { Dispatch, SetStateAction } from "react";
import { SelectField } from "@/components/SelectField";
import type { CustomTextSettings, VisualizationState } from "@/lib/visualizations/types";
import { DEFAULT_CUSTOM_TEXT } from "@/lib/visualizations/defaults";

const FONT_FAMILY_OPTIONS = [
  { value: "", label: "Select font family" },
  { value: "Arial", label: "Arial" },
  { value: "Helvetica", label: "Helvetica" },
  { value: "Times New Roman", label: "Times New Roman" },
  { value: "Georgia", label: "Georgia" },
];

type TextSettingsTabProps = {
  textState: CustomTextSettings;
  setVizState: Dispatch<SetStateAction<VisualizationState>>;
};

export default function TextSettingsTab({ textState, setVizState }: TextSettingsTabProps) {
  function updateText(patch: Partial<CustomTextSettings>) {
    setVizState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        customText: { ...(prev.settings.customText ?? DEFAULT_CUSTOM_TEXT), ...patch },
      },
    }));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="sp-field">
        <label className="form-label">Text</label>
        <textarea
          className="field-comp w-full min-h-[120px] resize-y px-[11px] py-1.5 text-xs"
          placeholder="Enter text"
          value={textState.text}
          onChange={(e) => updateText({ text: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SelectField
          className="w-[150px]"
          options={FONT_FAMILY_OPTIONS}
          value={textState.fontFamily}
          onChange={(e) => updateText({ fontFamily: e.target.value })}
        />
        <input
          type="color"
          className="h-8 w-8 cursor-pointer rounded border border-border p-0.5"
          value={textState.color}
          onChange={(e) => updateText({ color: e.target.value })}
          title="Text color"
        />
        <button
          type="button"
          aria-pressed={textState.bold}
          onClick={() => updateText({ bold: !textState.bold })}
          className={`flex h-8 w-8 items-center justify-center rounded border text-xs font-bold transition ${
            textState.bold
              ? "border-primary bg-primary-subtle text-primary"
              : "border-border bg-surface text-text-muted hover:border-primary"
          }`}
        >
          B
        </button>
        <button
          type="button"
          aria-pressed={textState.italic}
          onClick={() => updateText({ italic: !textState.italic })}
          className={`flex h-8 w-8 items-center justify-center rounded border text-xs italic transition ${
            textState.italic
              ? "border-primary bg-primary-subtle text-primary"
              : "border-border bg-surface text-text-muted hover:border-primary"
          }`}
        >
          I
        </button>
        <button
          type="button"
          aria-pressed={textState.underline}
          onClick={() => updateText({ underline: !textState.underline })}
          className={`flex h-8 w-8 items-center justify-center rounded border text-xs underline transition ${
            textState.underline
              ? "border-primary bg-primary-subtle text-primary"
              : "border-border bg-surface text-text-muted hover:border-primary"
          }`}
        >
          U
        </button>
      </div>
    </div>
  );
}
