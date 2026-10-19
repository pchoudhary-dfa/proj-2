"use client";

import type { Dispatch, SetStateAction } from "react";
import { SelectField } from "@/components/SelectField";
import type { CustomImageSettings, VisualizationState } from "@/lib/visualizations/types";
import { DEFAULT_CUSTOM_IMAGE } from "@/lib/visualizations/defaults";

const MEDIA_FILES_MOCK = [
  { value: "", label: "Select media file" },
  { value: "logo.png", label: "logo.png" },
  { value: "banner.jpg", label: "banner.jpg" },
  { value: "background.png", label: "background.png" },
];

type ImageGeneralTabProps = {
  imageState: CustomImageSettings;
  setVizState: Dispatch<SetStateAction<VisualizationState>>;
};

export default function ImageGeneralTab({ imageState, setVizState }: ImageGeneralTabProps) {
  function updateImage(patch: Partial<CustomImageSettings>) {
    setVizState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        customImage: { ...(prev.settings.customImage ?? DEFAULT_CUSTOM_IMAGE), ...patch },
      },
    }));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="img-source"
            checked={imageState.source === "media"}
            onChange={() => updateImage({ source: "media" })}
            className="accent-primary"
          />
          <span className="form-label">Media</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="img-source"
            checked={imageState.source === "url"}
            onChange={() => updateImage({ source: "url" })}
            className="accent-primary"
          />
          <span className="form-label">URL</span>
        </label>
      </div>

      {imageState.source === "media" ? (
        <div className="sp-field">
          <SelectField
            className="w-full"
            options={MEDIA_FILES_MOCK}
            value={imageState.mediaFile}
            onChange={(e) => updateImage({ mediaFile: e.target.value })}
          />
        </div>
      ) : (
        <div className="sp-field">
          <label className="form-label">Image URL</label>
          <input
            type="text"
            className="field-comp--md w-full"
            placeholder="Paste image URL"
            value={imageState.url}
            onChange={(e) => updateImage({ url: e.target.value })}
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="sp-field">
          <label className="form-label">Width</label>
          <input
            type="text"
            className="field-comp--md w-[80px]"
            value={imageState.width}
            onChange={(e) => updateImage({ width: e.target.value })}
          />
        </div>
        <div className="sp-field">
          <label className="form-label">Height</label>
          <input
            type="text"
            className="field-comp--md w-[80px]"
            value={imageState.height}
            onChange={(e) => updateImage({ height: e.target.value })}
          />
        </div>
        <div className="sp-field">
          <label className="form-label">&nbsp;</label>
          <SelectField
            className="w-[70px]"
            options={[
              { value: "%", label: "%" },
              { value: "px", label: "px" },
            ]}
            value={imageState.unit}
            onChange={(e) => updateImage({ unit: e.target.value as "%" | "px" })}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="sp-field">
          <label className="form-label flex items-center gap-1">
            <span className="material-icons !text-sm" aria-hidden>border_style</span>
            Width
          </label>
          <input
            type="number"
            className="field-comp--md w-[70px]"
            value={imageState.borderWidth}
            onChange={(e) => updateImage({ borderWidth: Number(e.target.value) })}
            min={0}
          />
        </div>
        <div className="sp-field">
          <label className="form-label flex items-center gap-1">
            <span className="material-icons !text-sm" aria-hidden>rounded_corner</span>
            Radius
          </label>
          <input
            type="number"
            className="field-comp--md w-[70px]"
            value={imageState.borderRadius}
            onChange={(e) => updateImage({ borderRadius: Number(e.target.value) })}
            min={0}
          />
        </div>
        <div className="flex items-end gap-1 ml-2">
          {(["left", "center", "right"] as const).map((alignment) => (
            <button
              key={alignment}
              type="button"
              aria-pressed={imageState.align === alignment}
              onClick={() => updateImage({ align: alignment })}
              className={`flex h-8 w-8 items-center justify-center rounded border transition ${
                imageState.align === alignment
                  ? "border-primary bg-primary-subtle text-primary"
                  : "border-border bg-surface text-text-muted hover:border-primary"
              }`}
            >
              <span className="material-icons !text-sm" aria-hidden>
                {alignment === "left" ? "format_align_left" : alignment === "center" ? "format_align_center" : "format_align_right"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
