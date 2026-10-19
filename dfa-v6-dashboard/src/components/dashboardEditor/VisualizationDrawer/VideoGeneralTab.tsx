"use client";

import type { Dispatch, SetStateAction } from "react";
import { SelectField } from "@/components/SelectField";
import type { CustomVideoSettings, VisualizationState } from "@/lib/visualizations/types";
import { DEFAULT_CUSTOM_VIDEO } from "@/lib/visualizations/defaults";

const MEDIA_FILES_MOCK = [
  { value: "", label: "Select media file" },
  { value: "logo.png", label: "logo.png" },
  { value: "banner.jpg", label: "banner.jpg" },
  { value: "background.png", label: "background.png" },
];

type VideoGeneralTabProps = {
  videoState: CustomVideoSettings;
  setVizState: Dispatch<SetStateAction<VisualizationState>>;
};

export default function VideoGeneralTab({ videoState, setVizState }: VideoGeneralTabProps) {
  function updateVideo(patch: Partial<CustomVideoSettings>) {
    setVizState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        customVideo: { ...(prev.settings.customVideo ?? DEFAULT_CUSTOM_VIDEO), ...patch },
      },
    }));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="sp-field">
        <label className="form-label">Source</label>
        <div className="flex items-center gap-2">
          <SelectField
            className="flex-1"
            options={[
              { value: "media", label: "Media" },
              { value: "url", label: "URL" },
            ]}
            value={videoState.source}
            onChange={(e) => updateVideo({ source: e.target.value as "media" | "url" })}
          />
          {videoState.source === "media" && (
            <button type="button" className="btn-comp-primary !h-8 !px-2" title="Upload media">
              <span className="material-icons !text-sm" aria-hidden>upload</span>
            </button>
          )}
        </div>
      </div>

      {videoState.source === "media" ? (
        <div className="sp-field">
          <label className="form-label">Media File</label>
          <SelectField
            className="w-full"
            options={MEDIA_FILES_MOCK}
            value={videoState.mediaFile}
            onChange={(e) => updateVideo({ mediaFile: e.target.value })}
          />
        </div>
      ) : null}

      <div className="sp-field">
        <label className="form-label">Video URL</label>
        <input
          type="text"
          className="field-comp--md w-full"
          placeholder="Paste video URL"
          value={videoState.videoUrl}
          onChange={(e) => updateVideo({ videoUrl: e.target.value })}
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="sp-field">
          <label className="form-label">Width</label>
          <input
            type="text"
            className="field-comp--md w-[80px]"
            placeholder="Width"
            value={videoState.width}
            onChange={(e) => updateVideo({ width: e.target.value })}
          />
        </div>
        <div className="sp-field">
          <label className="form-label">Height</label>
          <input
            type="text"
            className="field-comp--md w-[80px]"
            placeholder="Height"
            value={videoState.height}
            onChange={(e) => updateVideo({ height: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer mt-5">
          <input
            type="checkbox"
            className="checkbox-comp"
            checked={videoState.autoSize}
            onChange={(e) => updateVideo({ autoSize: e.target.checked })}
          />
          <span className="form-label">Auto</span>
        </label>
      </div>
    </div>
  );
}
