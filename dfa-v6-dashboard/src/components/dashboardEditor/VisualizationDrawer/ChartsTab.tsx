"use client";

import { ChartPreview } from "@/components/dashboardEditor/ChartPreview";
import { VISUALIZATION_TYPES, CUSTOM_TYPES } from "@/lib/visualizations/types";
import type { VisualizationTypeId } from "@/lib/dashboards/types";
import type { ChartSettings, VisualizationState } from "@/lib/visualizations/types";
import type { Dispatch, SetStateAction } from "react";

const CUSTOM_TYPE_IDS = new Set<string>(CUSTOM_TYPES.map((t) => t.id));

type ChartsTabProps = {
  vizName: string;
  chartsState: ChartSettings;
  setVizState: Dispatch<SetStateAction<VisualizationState>>;
};

export default function ChartsTab({
  vizName,
  chartsState,
  setVizState,
}: ChartsTabProps) {
  const showPreview = false;

  const handleTypeSelect = (typeId: VisualizationTypeId) => {
    setVizState((prev) => ({
      ...prev,
      typeId,
      settings: {
        ...prev.settings,
        charts: { ...prev.settings.charts, typeId },
      },
    }));
  };

  const handleVariantSelect = (variantId: string) => {
    setVizState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        charts: { ...prev.settings.charts, chartVariant: variantId },
      },
    }));
  };

  const isCustomType = CUSTOM_TYPE_IDS.has(chartsState.typeId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-text">
          Visualization Name
        </span>
        <input
          type="text"
          className="field-comp--md"
          placeholder="Enter visualization name"
          value={vizName}
          onChange={(e) =>
            setVizState((prev) => ({ ...prev, name: e.target.value }))
          }
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-text">
          Select visualization type
        </span>
        <div className="grid grid-cols-4 gap-2">
          {VISUALIZATION_TYPES.map((type) => {
            const isSelected = chartsState.typeId === type.id;
            return (
              <button
                key={type.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => handleTypeSelect(type.id)}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-md border py-1 text-center transition ${
                  isSelected
                    ? "border-primary bg-primary-subtle text-primary"
                    : "border-border bg-surface text-text-muted hover:border-primary"
                }`}
              >
                <span className="material-icons !text-sm !font-semibold leading-none" aria-hidden>
                  {type.icon}
                </span>
                <span className="text-[10px] font-semibold">{type.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {!isCustomType && (
        <div className="flex flex-col gap-2">
          {VISUALIZATION_TYPES.find((type) => type.id === chartsState.typeId)?.chartVariant?.length ? (
            <span className="text-xs font-medium text-text">Select chart variant</span>
          ) : null}
          <div className="grid grid-cols-4 gap-2">
            {VISUALIZATION_TYPES.find((type) => type.id === chartsState.typeId)?.chartVariant.map((variant) => {
              const isSelected = chartsState.chartVariant === variant.id;
              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => handleVariantSelect(variant.id)}
                  aria-pressed={isSelected}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-md border py-1 text-center transition ${
                    isSelected
                      ? "border-primary bg-primary-subtle text-primary"
                      : "border-border bg-surface text-text-muted hover:border-primary"
                  }`}
                >
                  <span className="material-symbols-outlined !text-lg leading-none" aria-hidden>
                    {variant.icon}
                  </span>
                  <span className="text-[10px] font-medium">{variant.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-text">Custom</span>
        <div className="grid grid-cols-4 gap-2">
          {CUSTOM_TYPES.map((type) => {
            const isSelected = chartsState.typeId === type.id;
            return (
              <button
                key={type.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => handleTypeSelect(type.id)}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-md border py-1 text-center transition ${
                  isSelected
                    ? "border-primary bg-primary-subtle text-primary"
                    : "border-border bg-surface text-text-muted hover:border-primary"
                }`}
              >
                <span className="material-icons !text-lg leading-none" aria-hidden>
                  {type.icon}
                </span>
                <span className="text-[10px] font-medium">{type.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {showPreview && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-text">Preview</span>
          <div className="rounded-md border border-border bg-surface p-2">
            <ChartPreview typeId={chartsState.typeId} baseUrl="" height={220} />
          </div>
        </div>
      )}
    </div>
  );
}
