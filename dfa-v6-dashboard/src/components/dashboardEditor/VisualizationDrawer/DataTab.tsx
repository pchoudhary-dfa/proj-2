"use client";

import { useState, type SetStateAction, type Dispatch } from "react";
import { useCore } from "@/contexts/CoreContext";
import { AccordionGroup, AccordionSection } from "./AccordionSection";
import { IndicatorSelectionModal } from "./IndicatorSelectionModal";
import { SubgroupSelectionModal } from "./SubgroupSelectionModal";
import { AreaSelectionModal } from "./AreaSelectionModal";
import { TimePeriodSelectionModal } from "./TimePeriodSelectionModal";
import "dfa-v6-comp-indicator/styles.css";
import "dfa-v6-comp-subgroup/styles.css";
import "dfa-v6-comp-area/styles.css";
import "dfa-v6-comp-timeperiod/styles.css";
import "dfa-v6-comp-list-view/styles.css";
import {
  DataSettings,
  VisualizationState,
  DimensionKind,
  CHART_LAYOUT_DIMENSIONS,
  DIMENSION_LABELS,
  AxisSeriesMapping,
} from "@/lib/visualizations/types";

// ─── Axis Mapping Matrix ─────────────────────────────────────────────────────

const Y_MAX = 2;
const Y_MIN = 0;

function buildMappingFromMatrix(
  xDim: DimensionKind,
  yDims: DimensionKind[],
): AxisSeriesMapping {
  const sorted = [...yDims].sort(
    (a, b) =>
      CHART_LAYOUT_DIMENSIONS.indexOf(a) - CHART_LAYOUT_DIMENSIONS.indexOf(b),
  );
  return {
    xDimension: xDim,
    seriesDimension: sorted[0] ?? null,
    seriesDimension2: sorted[1] ?? null,
  };
}

function AxisMappingMatrix({
  mapping,
  onChange,
}: {
  mapping: AxisSeriesMapping;
  onChange: (m: AxisSeriesMapping) => void;
}) {
  const x = mapping.xDimension;
  const yChecked: DimensionKind[] = [
    mapping.seriesDimension,
    mapping.seriesDimension2 ?? null,
  ].filter((d): d is DimensionKind => d != null);

  const handleXSelect = (newX: DimensionKind) => {
    if (newX === x) return;
    const nextY = yChecked.filter((d) => d !== newX);
    onChange(buildMappingFromMatrix(newX, nextY));
  };

  const handleYToggle = (dim: DimensionKind) => {
    const isChecked = yChecked.includes(dim);

    if (isChecked) {
      if (yChecked.length <= Y_MIN) return;
      onChange(buildMappingFromMatrix(x, yChecked.filter((d) => d !== dim)));
    } else {
      let nextY: DimensionKind[];
      if (yChecked.length >= Y_MAX) {
        const last = [...yChecked].sort(
          (a, b) =>
            CHART_LAYOUT_DIMENSIONS.indexOf(a) -
            CHART_LAYOUT_DIMENSIONS.indexOf(b),
        ).pop()!;
        nextY = [...yChecked.filter((d) => d !== last), dim];
      } else {
        nextY = [...yChecked, dim];
      }
      onChange(buildMappingFromMatrix(x, nextY));
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 mb-1">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
          Dimension
        </span>
        <span className="text-xs font-medium text-text-muted uppercase tracking-wide text-center w-14">
          X-Axis
        </span>
        <span className="text-xs font-medium text-text-muted uppercase tracking-wide text-center w-14">
          Y-Axis
        </span>
      </div>

      {CHART_LAYOUT_DIMENSIONS.map((dim) => {
        const isXActive = dim === x;
        const isYActive = yChecked.includes(dim);
        const yDisabled = isXActive;

        return (
          <div
            key={dim}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 py-1"
          >
            <span className="text-xs text-text">
              {DIMENSION_LABELS[dim]}
            </span>

            <div className="flex justify-center w-14">
              <input
                type="checkbox"
                checked={isXActive}
                onChange={(e) => {
                  if (e.target.checked) handleXSelect(dim);
                }}
                className="w-4 h-4 rounded border-border accent-primary"
                aria-label={`${DIMENSION_LABELS[dim]} — X-Axis`}
              />
            </div>

            <div className="flex justify-center w-14">
              <input
                type="checkbox"
                checked={isYActive}
                disabled={
                  yDisabled ||
                  (!isYActive && yChecked.length >= Y_MAX)
                }
                onChange={() => handleYToggle(dim)}
                className="w-4 h-4 rounded border-border accent-primary disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={`${DIMENSION_LABELS[dim]} — Y-Axis`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── DataTab ─────────────────────────────────────────────────────────────────

type DataTabProps = {
  baseUrl?: string;
  dataState: DataSettings;
  setVizState: Dispatch<SetStateAction<VisualizationState>>;
};

export default function DataTab({ baseUrl = "", dataState, setVizState }: DataTabProps) {
  const { locale } = useCore();

  const [indicatorModalOpen, setIndicatorModalOpen] = useState(false);
  const [subgroupModalOpen, setSubgroupModalOpen] = useState(false);
  const [areaModalOpen, setAreaModalOpen] = useState(false);
  const [timePeriodModalOpen, setTimePeriodModalOpen] = useState(false);

  function updateDataSettings<K extends keyof DataSettings>(key: K, value: DataSettings[K]) {
    setVizState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        data: {
          ...prev.settings.data,
          [key]: value,
        },
      },
    }));
  }

  function removeIndicator(id: string | number) {
    updateDataSettings("indicators", dataState.indicators.filter((i) => i.id !== id));
  }

  function removeSubgroup(id: string | number) {
    updateDataSettings("subgroups", dataState.subgroups.filter((s) => s.id !== id));
  }

  function removeArea(id: string | number) {
    updateDataSettings("areas", dataState.areas.filter((a) => a.id !== id));
  }

  function removeTimePeriod(id: string | number) {
    updateDataSettings("timePeriods", dataState.timePeriods.filter((tp) => tp.id !== id));
  }

  return (
    <>
      <AccordionGroup>
      <AccordionSection
        title="Select Indicator"
        badge={
          <span className="text-xs font-normal opacity-80">
            {dataState.indicators.length} Selected:
          </span>
        }
        defaultOpen
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 form-label text-text">
              <span className="text-error">*</span> Indicator
            </span>
            <button
              type="button"
              className="btn-comp-primary gap-1 !text-[11px]"
              onClick={() => setIndicatorModalOpen(true)}
            >
              <span className="material-icons !text-xs leading-none" aria-hidden>
                add
              </span>
              Select
            </button>
          </div>
          <div className="field-comp w-full min-h-8 flex flex-wrap items-center gap-1 px-[11px] py-1.5">
            {dataState.indicators.length > 0 ? (
              dataState.indicators.map((indicator) => (
                <span
                  key={indicator.id}
                  className="inline-flex items-center gap-0.5 rounded bg-surface-muted px-2 py-0.5 text-xs text-text text-wrap"
                >
                  <span>
                    {indicator.label ?? indicator.id}
                  </span>
                  <button
                    type="button"
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text"
                    aria-label={`Remove ${indicator.label ?? indicator.id}`}
                    onClick={() => removeIndicator(indicator.id)}
                  >
                    <span className="material-icons !text-xs leading-none" aria-hidden>
                      close
                    </span>
                  </button>
                </span>
              ))
            ) : (
              <p className="text-xs text-text-muted">
                Select Indicator
              </p>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="form-label text-text">Subgroup</span>
            <button
              type="button"
              className="btn-comp-primary gap-1 !text-[11px]"
              onClick={() => setSubgroupModalOpen(true)}
            >
              <span className="material-icons !text-xs leading-none" aria-hidden>
                add
              </span>
              Select
            </button>
          </div>
          <div className="field-comp w-full min-h-8 flex flex-wrap items-center gap-1 px-[11px] py-1.5">
            {dataState.subgroups.length > 0 ? (
              dataState.subgroups.map((subgroup) => (
                <span
                  key={subgroup.id}
                  className="inline-flex items-center gap-0.5 rounded bg-surface-muted px-2 py-0.5 text-xs text-text text-wrap"
                >
                  <span>
                    {subgroup.label ?? subgroup.id}
                  </span>
                  <button
                    type="button"
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text"
                    aria-label={`Remove ${subgroup.label ?? subgroup.id}`}
                    onClick={() => removeSubgroup(subgroup.id)}
                  >
                    <span className="material-icons !text-xs leading-none" aria-hidden>
                      close
                    </span>
                  </button>
                </span>
              ))
            ) : (
              <p className="text-xs text-text-muted">
                Select Subgroup
              </p>
            )}
          </div>
        </div>
      </AccordionSection>

      <AccordionSection
        title="Select Area"
        badge={
          <span className="text-xs font-normal opacity-80">
            {dataState.areas.length} Selected
          </span>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="form-label text-text">Area</span>
            <button
              type="button"
              className="btn-comp-primary gap-1 !text-[11px]"
              onClick={() => setAreaModalOpen(true)}
            >
              <span className="material-icons !text-xs leading-none" aria-hidden>
                add
              </span>
              Select
            </button>
          </div>
          <div className="field-comp w-full min-h-8 flex flex-wrap items-center gap-1 px-[11px] py-1.5">
            {dataState.areas.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {dataState.areas.map((area) => (
                  <span
                    key={area.id}
                    className="inline-flex items-center gap-1 rounded bg-surface-muted px-2 py-0.5 text-xs text-text"
                  >
                    <span>
                      {area.label ?? area.id}
                    </span>
                    <button
                      type="button"
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text"
                      aria-label={`Remove ${area.label ?? area.id}`}
                      onClick={() => removeArea(area.id)}
                    >
                      <span className="material-icons !text-xs leading-none" aria-hidden>
                        close
                      </span>
                    </button>
                  </span>

                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted">
                Select Area
              </p>
            )}
          </div>
        </div>
      </AccordionSection>

      <AccordionSection
        title="Select Time Period"
        badge={
          <span className="text-xs font-normal opacity-80">
            {dataState.timePeriods.length > 0
              ? `${dataState.timePeriods.length} Selected`
              : "MRD"}
          </span>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="form-label text-text">Time Period</span>
            <button
              type="button"
              className="btn-comp-primary gap-1 !text-[11px]"
              onClick={() => setTimePeriodModalOpen(true)}
            >
              <span className="material-icons !text-xs leading-none" aria-hidden>
                add
              </span>
              Select
            </button>
          </div>
          <div className="field-comp w-full min-h-8 flex flex-wrap items-center gap-1 px-[11px] py-1.5">
            {dataState.timePeriods.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {dataState.timePeriods.map((tp) => (
                  <span
                    key={tp.id}
                    className="inline-flex items-center gap-1 rounded bg-surface-muted px-2 py-0.5 text-xs text-text"
                  >
                    <span>
                      {tp.label ?? tp.id}
                    </span>
                    <button
                      type="button"
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text"
                      aria-label={`Remove ${tp.label ?? tp.id}`}
                      onClick={() => removeTimePeriod(tp.id)}
                    >
                      <span className="material-icons !text-xs leading-none" aria-hidden>
                        close
                      </span>
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-muted">
                Select Time Period
              </p>
            )}
          </div>
        </div>
      </AccordionSection>

      <AccordionSection title="X-Axis & Y-Axis" defaultOpen>
        <AxisMappingMatrix
          mapping={dataState.mapping}
          onChange={(mapping) => updateDataSettings("mapping", mapping)}
        />
      </AccordionSection>
  </AccordionGroup>

      <IndicatorSelectionModal
        isOpen={indicatorModalOpen}
        onClose={() => setIndicatorModalOpen(false)}
        baseUrl={baseUrl}
        locale={locale}
        selectionMode="MULTIPLE"
        initialSelectedItems={dataState.indicators}
        onApply={(items) => updateDataSettings("indicators", items)}
      />

      <SubgroupSelectionModal
        isOpen={subgroupModalOpen}
        onClose={() => setSubgroupModalOpen(false)}
        baseUrl={baseUrl}
        locale={locale}
        selectionMode="MULTIPLE"
        initialSelectedItems={dataState.subgroups}
        onApply={(items) => updateDataSettings("subgroups", items)}
      />

      <AreaSelectionModal
        isOpen={areaModalOpen}
        onClose={() => setAreaModalOpen(false)}
        baseUrl={baseUrl}
        locale={locale}
        selectionMode="MULTIPLE"
        initialSelectedItems={dataState.areas}
        onApply={(items) => updateDataSettings("areas", items)}
      />

      <TimePeriodSelectionModal
        isOpen={timePeriodModalOpen}
        onClose={() => setTimePeriodModalOpen(false)}
        baseUrl={baseUrl}
        locale={locale}
        selectionMode="MULTIPLE"
        initialSelectedItems={dataState.timePeriods}
        onApply={(items) => updateDataSettings("timePeriods", items)}
      />
    </>
  );
}
