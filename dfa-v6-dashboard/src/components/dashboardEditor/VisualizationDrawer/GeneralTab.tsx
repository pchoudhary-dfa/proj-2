"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { TextField } from "@/components/TextField";
import { SelectField } from "@/components/SelectField";
import { AccordionGroup, AccordionSection } from "./AccordionSection";
import type {
  GeneralSettings,
  FontStyle,
  AxisSettings,
  TitleTabId,
  LegendPosition,
  TextAlign,
  VisualizationState,
} from "@/lib/visualizations/types";

const FONT_FAMILY_OPTIONS = [
  { value: "", label: "Select font family" },
  { value: "Arial", label: "Arial" },
  { value: "Helvetica", label: "Helvetica" },
  { value: "Times New Roman", label: "Times New Roman" },
  { value: "Georgia", label: "Georgia" },
  { value: "Verdana", label: "Verdana" },
  { value: "Roboto", label: "Roboto" },
  { value: "Open Sans", label: "Open Sans" },
];

const FONT_SIZE_OPTIONS = [
  { value: "", label: "Font Size" },
  { value: "8", label: "8" },
  { value: "9", label: "9" },
  { value: "10", label: "10" },
  { value: "11", label: "11" },
  { value: "12", label: "12" },
  { value: "14", label: "14" },
  { value: "16", label: "16" },
  { value: "18", label: "18" },
  { value: "20", label: "20" },
  { value: "24", label: "24" },
];

const DASH_STYLE_OPTIONS = [
  { value: "SHORT_", label: "SHORT_" },
  { value: "SOLID", label: "SOLID" },
  { value: "DASH", label: "DASH" },
  { value: "DOT", label: "DOT" },
  { value: "LONG_DASH", label: "LONG_DASH" },
];

const LABEL_FORMAT_OPTIONS = [
  { value: "", label: "Select Unit" },
  { value: "number", label: "Number" },
  { value: "percent", label: "Percent" },
  { value: "currency", label: "Currency" },
];

const DYNAMIC_TOKENS = ["IND", "Unit", "SUB", "Area", "Time"] as const;

type GeneralTabProps = {
  generalState: GeneralSettings;
  setVizState: Dispatch<SetStateAction<VisualizationState>>;
};

// ─── Reusable sub-components ─────────────────────────────────────────────────

function FontStyleRow({
  fontStyle,
  onChange,
  showAlign,
  align,
  onAlignChange,
}: {
  fontStyle: FontStyle;
  onChange: (fs: FontStyle) => void;
  showAlign?: boolean;
  align?: TextAlign;
  onAlignChange?: (a: TextAlign) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SelectField
        className="w-[130px]"
        options={FONT_FAMILY_OPTIONS}
        value={fontStyle.fontFamily}
        onChange={(e) => onChange({ ...fontStyle, fontFamily: e.target.value })}
      />
      <input
        type="color"
        className="sys-config__color-swatch"
        value={fontStyle.color}
        onChange={(e) => onChange({ ...fontStyle, color: e.target.value })}
        title="Font color"
      />
      <SelectField
        className="w-[90px]"
        options={FONT_SIZE_OPTIONS}
        value={fontStyle.fontSize}
        onChange={(e) => onChange({ ...fontStyle, fontSize: e.target.value })}
      />
      <button
        type="button"
        className={`btn-comp-icon ${fontStyle.bold ? "!border-primary !text-primary" : ""}`}
        onClick={() => onChange({ ...fontStyle, bold: !fontStyle.bold })}
        title="Bold"
      >
        <span className="text-xs font-bold">B</span>
      </button>
      <button
        type="button"
        className={`btn-comp-icon ${fontStyle.italic ? "!border-primary !text-primary" : ""}`}
        onClick={() => onChange({ ...fontStyle, italic: !fontStyle.italic })}
        title="Italic"
      >
        <span className="text-xs italic">I</span>
      </button>
      <button
        type="button"
        className={`btn-comp-icon ${fontStyle.underline ? "!border-primary !text-primary" : ""}`}
        onClick={() => onChange({ ...fontStyle, underline: !fontStyle.underline })}
        title="Underline"
      >
        <span className="text-xs underline">U</span>
      </button>
      {showAlign && onAlignChange && (
        <button
          type="button"
          className="btn-comp-icon"
          onClick={() => {
            const cycle: TextAlign[] = ["left", "center", "right"];
            const idx = cycle.indexOf(align ?? "left");
            onAlignChange(cycle[(idx + 1) % cycle.length]);
          }}
          title={`Align: ${align}`}
        >
          <span className="material-icons !text-sm">
            {align === "center" ? "format_align_center" : align === "right" ? "format_align_right" : "format_align_left"}
          </span>
        </button>
      )}
    </div>
  );
}

function AxisSection({
  axis,
  onChange,
}: {
  axis: AxisSettings;
  onChange: (a: AxisSettings) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Title */}
      <div className="sp-field">
        <label className="form-label">Title</label>
        <TextField
          fieldSize="md"
          value={axis.title}
          onChange={(e) => onChange({ ...axis, title: e.target.value })}
        />
      </div>
      <FontStyleRow
        fontStyle={axis.titleFontStyle}
        onChange={(fs) => onChange({ ...axis, titleFontStyle: fs })}
        showAlign
        align={axis.titleAlign}
        onAlignChange={(a) => onChange({ ...axis, titleAlign: a })}
      />

      {/* Labels */}
      <label className="config-toggle-row">
        <input
          type="checkbox"
          className="checkbox-comp"
          checked={axis.labelsEnabled}
          onChange={(e) => onChange({ ...axis, labelsEnabled: e.target.checked })}
        />
        <span className="form-label">Labels</span>
      </label>
      {axis.labelsEnabled && (
        <FontStyleRow
          fontStyle={axis.labelsFontStyle}
          onChange={(fs) => onChange({ ...axis, labelsFontStyle: fs })}
        />
      )}

      {/* Enable Text Wrap */}
      <label className="config-toggle-row">
        <input
          type="checkbox"
          className="checkbox-comp"
          checked={axis.enableTextWrap}
          onChange={(e) => onChange({ ...axis, enableTextWrap: e.target.checked })}
        />
        <span className="form-label">Enable Text Wrap</span>
      </label>

      {/* Axis Line */}
      <div className="sp-field">
        <span className="form-label font-semibold">Axis Line</span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="sys-config__color-swatch"
            value={axis.axisLine.color}
            onChange={(e) =>
              onChange({ ...axis, axisLine: { ...axis.axisLine, color: e.target.value } })
            }
          />
          <TextField
            fieldSize="md"
            type="number"
            className="w-16"
            value={String(axis.axisLine.width)}
            onChange={(e) =>
              onChange({
                ...axis,
                axisLine: { ...axis.axisLine, width: Number(e.target.value) },
              })
            }
          />
        </div>
      </div>

      {/* Grid Lines */}
      <div className="sp-field">
        <span className="form-label font-semibold">Grid Lines</span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="sys-config__color-swatch"
            value={axis.gridLines.color}
            onChange={(e) =>
              onChange({
                ...axis,
                gridLines: { ...axis.gridLines, color: e.target.value },
              })
            }
          />
          <TextField
            fieldSize="md"
            type="number"
            className="w-16"
            value={String(axis.gridLines.width)}
            onChange={(e) =>
              onChange({
                ...axis,
                gridLines: { ...axis.gridLines, width: Number(e.target.value) },
              })
            }
          />
          <SelectField
            className="w-[110px]"
            options={DASH_STYLE_OPTIONS}
            value={axis.gridLines.dashStyle}
            onChange={(e) =>
              onChange({
                ...axis,
                gridLines: { ...axis.gridLines, dashStyle: e.target.value },
              })
            }
          />
        </div>
      </div>

      {/* Ticks */}
      <label className="config-toggle-row">
        <input
          type="checkbox"
          className="checkbox-comp"
          checked={axis.ticksEnabled}
          onChange={(e) => onChange({ ...axis, ticksEnabled: e.target.checked })}
        />
        <span className="form-label">Ticks</span>
      </label>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function GeneralTab({ generalState, setVizState }: GeneralTabProps) {
  const [activeTitleTab, setActiveTitleTab] = useState<TitleTabId>("title");

  const activeTitleEntry = generalState.title[activeTitleTab];

  function updateGeneral(patch: Partial<GeneralSettings>) {
    setVizState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        general: { ...prev.settings.general, ...patch },
      },
    }));
  }

  function updateTitleEntry(patch: Partial<typeof activeTitleEntry>) {
    updateGeneral({
      title: {
        ...generalState.title,
        [activeTitleTab]: { ...activeTitleEntry, ...patch },
      },
    });
  }

  return (
    <AccordionGroup>
      {/* ═══ General Section ═══ */}
      <AccordionSection title="General" defaultOpen>
        <div className="flex flex-col gap-4">
          {/* Chart Area */}

          <div className="sp-field">
            <label className="form-label">Chart Area</label>
            <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4">
              <SelectField
                className="w-[130px]"
                options={FONT_FAMILY_OPTIONS}
                value={generalState.chartArea.fontFamily}
                onChange={(e) => updateGeneral({ chartArea: { ...generalState.chartArea, fontFamily: e.target.value } })}
              />
              <input
                type="color"
                className="sys-config__color-swatch"
                value={generalState.chartArea.backgroundColor}
                onChange={(e) => updateGeneral({ chartArea: { ...generalState.chartArea, backgroundColor: e.target.value } })}
                title="Font color"
              />
            </div>
          </div>

          {/* Chart Border */}
          <div className="sp-field border-b border-border pb-4">
            <span className="form-label font-semibold">Chart Border</span>
            <div className="sp-grid">
              <div className="sp-field">
                <label className="form-label">Width</label>
                <TextField
                  fieldSize="md"
                  type="number"
                  placeholder="Width"
                  value={generalState.chartBorder.width}
                  onChange={(e) =>
                    updateGeneral({
                      chartBorder: {
                        ...generalState.chartBorder,
                        width: Number(e.target.value),
                      },
                    })
                  }
                />
              </div>
              <div className="sp-field">
                <label className="form-label">Radius</label>
                <TextField
                  fieldSize="md"
                  type="number"
                  value={String(generalState.chartBorder.radius)}
                  onChange={(e) =>
                    updateGeneral({
                      chartBorder: {
                        ...generalState.chartBorder,
                        radius: Number(e.target.value),
                      },
                    })
                  }
                />
              </div>
            </div>
            <div className="sp-field mt-2">
              <label className="form-label">Color</label>
              <input
                type="color"
                className="sys-config__color-swatch"
                value={generalState.chartBorder.color}
                onChange={(e) =>
                  updateGeneral({
                    chartBorder: {
                      ...generalState.chartBorder,
                      color: e.target.value,
                    },
                  })
                }
                title="border color"
              />
            </div>
          </div>

          {/* Plot Area */}
          <div className="sp-field border-b border-border pb-4">
            <label className="form-label">Plot Area</label>
            <label className="form-label">Width</label>
            <TextField
              fieldSize="md"
              type="number"
              placeholder="Width"
              value={String(generalState.plotArea.width)}
              onChange={(e) =>
                updateGeneral({
                  plotArea: {
                    ...generalState.plotArea,
                    width: Number(e.target.value),
                  },
                })
              }
            />
            <div className="sp-grid">

              <div className="sp-field">
                <label className="form-label">Border Color</label>
                <input
                  type="color"
                  className="sys-config__color-swatch"
                  value={generalState.plotArea.borderColor}
                  onChange={(e) =>
                    updateGeneral({
                      plotArea: {
                        ...generalState.plotArea,
                        borderColor: e.target.value,
                      },
                    })
                  }
                />
              </div>
              <div className="sp-field">
                <label className="form-label">Background Color</label>
                <input
                  type="color"
                  className="sys-config__color-swatch"
                  value={generalState.plotArea.backgroundColor}
                  onChange={(e) =>
                    updateGeneral({
                      plotArea: {
                        ...generalState.plotArea,
                        backgroundColor: e.target.value,
                      },
                    })
                  }
                />
              </div>
            </div>


          </div>

          {/* Color Theme */}
          <div className="sp-field border-b border-border pb-4">
            <label className="form-label">Color Theme</label>
            <div className="sys-config__hint">
              The format should be like - #colorCode1,#colorCode2...
            </div>
            <TextField
              fieldSize="lg"
              value={generalState.colorTheme}
              onChange={(e) => updateGeneral({ colorTheme: e.target.value })}
            />
          </div>

          {/* No Data Text */}
          <div className="sp-field border-b border-border pb-4">
            <label className="form-label">No Data Text</label>
            <div className="sys-config__hint">
              This text is displayed when there is no data to show in the visualization.
            </div>
            <TextField
              fieldSize="md"
              value={generalState.chartArea.noDataText}
              onChange={(e) =>
                updateGeneral({
                  chartArea: { ...generalState.chartArea, noDataText: e.target.value },
                })
              }
            />
          </div>

          {/* Title Tabs */}
          <div className="sp-field ">
            <div className="page-subtabs-row">
              <nav className="bc-main-tabs min-w-0 flex-1 overflow-x-auto scrollbar-hide">
                <button
                  type="button"
                  className={`btn-comp-tab px-2 ${activeTitleTab === "title" ? "active" : ""}`}
                  onClick={() => setActiveTitleTab("title")}
                >
                  Title
                </button>
                <button
                  type="button"
                  className={`btn-comp-tab px-2 ${activeTitleTab === "subTitle" ? "active" : ""}`}
                  onClick={() => setActiveTitleTab("subTitle")}
                >
                  Sub Title
                </button>
                <button
                  type="button"
                    className={`btn-comp-tab px-2 ${activeTitleTab === "customLabels" ? "active" : ""}`}
                    onClick={() => setActiveTitleTab("customLabels")}
                >
                  Custom labels
                </button>

              </nav>
            </div>
          </div>

          {/* Active Title Entry */}
          <div className="sp-field">
            <label className="form-label">Title</label>
            <TextField
              fieldSize="md"
              value={activeTitleEntry.text}
              onChange={(e) => updateTitleEntry({ text: e.target.value })}
            />
          <label className="config-toggle-row">
            <input
              type="checkbox"
              className="checkbox-comp"
              checked={activeTitleEntry.dynamic}
              onChange={(e) => updateTitleEntry({ dynamic: e.target.checked })}
            />
            <span className="form-label">Dynamic</span>
          </label>
          {/* Dynamic Token Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {DYNAMIC_TOKENS.map((token) => (
              <button
                key={token}
                type="button"
                disabled={!activeTitleEntry.dynamic}
                className={`btn-comp-icon !px-4 ${activeTitleEntry.dynamicTokens.includes(token)
                  ? "border-primary text-primary"
                  : ""
                  }`}
                onClick={() => {
                  const tokens = activeTitleEntry.dynamicTokens.includes(token)
                    ? activeTitleEntry.dynamicTokens.filter((t) => t !== token)
                    : [...activeTitleEntry.dynamicTokens, token];
                  updateTitleEntry({ dynamicTokens: tokens });
                }}
              >
                {token}
              </button>
            ))}
          </div>
          </div>



          {/* Font Style Row */}
          <FontStyleRow
            fontStyle={activeTitleEntry.fontStyle}
            onChange={(fs) => updateTitleEntry({ fontStyle: fs })}
            showAlign
            align={activeTitleEntry.align}
            onAlignChange={(a) => updateTitleEntry({ align: a })}
          />
        </div>
      </AccordionSection>

      {/* ═══ Highlight Selected Area ═══ */}
      <AccordionSection title="Highlight Selected Area">
        <div className="flex flex-col gap-3">
          <label className="config-toggle-row">
            <input
              type="checkbox"
              className="checkbox-comp"
              checked={generalState.highlightSelectedArea.enabled}
              onChange={(e) =>
                updateGeneral({
                  highlightSelectedArea: {
                    ...generalState.highlightSelectedArea,
                    enabled: e.target.checked,
                  },
                })
              }
            />
            <span className="form-label">Highlight Selected Area</span>
          </label>

          <label className="config-toggle-row">
            <input
              type="checkbox"
              className="checkbox-comp"
              checked={generalState.highlightSelectedArea.dataLabel}
              onChange={(e) =>
                updateGeneral({
                  highlightSelectedArea: {
                    ...generalState.highlightSelectedArea,
                    dataLabel: e.target.checked,
                  },
                })
              }
            />
            <span className="form-label">Data Label</span>
            <span
              className="material-icons !text-sm text-text-muted"
              title="Show data labels on highlighted area"
            >
              info
            </span>
          </label>
        </div>
      </AccordionSection>

      {/* ═══ Axis Horizontal (X-Axis) ═══ */}
      <AccordionSection title="Axis Horizontal (X-Axis)">
        <AxisSection
          axis={generalState.axisHorizontal}
          onChange={(a) => updateGeneral({ axisHorizontal: a })}
        />
      </AccordionSection>

      {/* ═══ Axis Vertical (Y-Axis) ═══ */}
      <AccordionSection title="Axis Vertical (Y-Axis)">
        <AxisSection
          axis={generalState.axisVertical}
          onChange={(a) => updateGeneral({ axisVertical: a })}
        />
      </AccordionSection>

      {/* ═══ Axis Vertical (Secondary Axis) ═══ */}
      <AccordionSection title="Axis Vertical (Secondary-Axis)">
        <label className="config-toggle-row">
          <input
            type="checkbox"
            className="checkbox-comp"
            checked={generalState.secondaryAxis.enabled}
            onChange={(e) =>
              updateGeneral({
                secondaryAxis: { enabled: e.target.checked },
              })
            }
          />
          <span className="form-label">Enable secondary axis</span>
        </label>
      </AccordionSection>

      {/* ═══ Data Value Labels ═══ */}
      <AccordionSection title="Data Value Labels">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <label className="config-toggle-row">
              <input
                type="checkbox"
                className="checkbox-comp"
                checked={generalState.dataValueLabels.labelsEnabled}
                onChange={(e) =>
                  updateGeneral({
                    dataValueLabels: {
                      ...generalState.dataValueLabels,
                      labelsEnabled: e.target.checked,
                    },
                  })
                }
              />
              <span className="form-label">Labels</span>
            </label>
            <button
              type="button"
              className="btn-comp-icon"
              onClick={() => {
                const cycle: TextAlign[] = ["left", "center", "right"];
                const idx = cycle.indexOf(generalState.dataValueLabels.labelAlign);
                updateGeneral({
                  dataValueLabels: {
                    ...generalState.dataValueLabels,
                    labelAlign: cycle[(idx + 1) % cycle.length],
                  },
                });
              }}
              title={`Align: ${generalState.dataValueLabels.labelAlign}`}
            >
              <span className="material-icons !text-sm">format_align_center</span>
            </button>
            <button
              type="button"
              className="btn-comp-icon"
              onClick={() =>
                updateGeneral({
                  dataValueLabels: {
                    ...generalState.dataValueLabels,
                    labelRotation: generalState.dataValueLabels.labelRotation === 0 ? -45 : 0,
                  },
                })
              }
              title="Rotate labels"
            >
              <span className="material-icons !text-sm">rotate_left</span>
            </button>
          </div>

          <FontStyleRow
            fontStyle={generalState.dataValueLabels.fontStyle}
            onChange={(fs) =>
              updateGeneral({
                dataValueLabels: { ...generalState.dataValueLabels, fontStyle: fs },
              })
            }
          />

          <label className="config-toggle-row">
            <input
              type="checkbox"
              className="checkbox-comp"
              checked={generalState.dataValueLabels.showCategories}
              onChange={(e) =>
                updateGeneral({
                  dataValueLabels: {
                    ...generalState.dataValueLabels,
                    showCategories: e.target.checked,
                  },
                })
              }
            />
            <span className="form-label">Show Categories</span>
          </label>

          <div className="sp-field">
            <label className="form-label font-semibold">Label Format</label>
            <SelectField
              options={LABEL_FORMAT_OPTIONS}
              value={generalState.dataValueLabels.labelFormat}
              onChange={(e) =>
                updateGeneral({
                  dataValueLabels: {
                    ...generalState.dataValueLabels,
                    labelFormat: e.target.value,
                  },
                })
              }
            />
          </div>
        </div>
      </AccordionSection>

      {/* ═══ Legend ═══ */}
      <AccordionSection title="Legend">
        <div className="flex flex-col gap-4">
          <label className="config-toggle-row">
            <input
              type="checkbox"
              className="checkbox-comp"
              checked={generalState.legend.displayLegend}
              onChange={(e) =>
                updateGeneral({
                  legend: { ...generalState.legend, displayLegend: e.target.checked },
                })
              }
            />
            <span className="form-label">Display Legend</span>
          </label>

          <div className="sp-field">
            <span className="form-label">Text style</span>
            <FontStyleRow
              fontStyle={generalState.legend.textStyle}
              onChange={(fs) =>
                updateGeneral({ legend: { ...generalState.legend, textStyle: fs } })
              }
            />
          </div>

          <div className="sp-field">
            <span className="form-label">Position</span>
            <div className="flex items-center gap-1.5">
              {(["left", "right", "bottom", "top"] as LegendPosition[]).map((pos) => (
                <button
                  key={pos}
                  type="button"
                  className={`btn-comp-icon ${generalState.legend.position === pos ? "!border-primary !text-primary" : ""
                    }`}
                  onClick={() =>
                    updateGeneral({ legend: { ...generalState.legend, position: pos } })
                  }
                  title={pos}
                >
                  <span className="material-icons !text-sm">
                    {pos === "left"
                      ? "arrow_back"
                      : pos === "right"
                        ? "arrow_forward"
                        : pos === "bottom"
                          ? "arrow_downward"
                          : "arrow_upward"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <label className="config-toggle-row">
            <input
              type="checkbox"
              className="checkbox-comp"
              checked={generalState.legend.floatOnTop}
              onChange={(e) =>
                updateGeneral({
                  legend: { ...generalState.legend, floatOnTop: e.target.checked },
                })
              }
            />
            <span className="form-label">Float on Top of Plot Area</span>
          </label>
        </div>
      </AccordionSection>

      {/* ═══ Tooltip ═══ */}
      <AccordionSection title="Tooltip">
        <div className="flex flex-col gap-2">
          {(
            [
              ["disable", "Disable"],
              ["indicator", "Indicator"],
              ["unit", "Unit"],
              ["subgroup", "Subgroup"],
              ["timePeriod", "Time Period"],
              ["area", "Area"],
              ["source", "Source"],
              ["footnote", "Footnote"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="config-toggle-row">
              <input
                type="checkbox"
                className="checkbox-comp"
                checked={generalState.tooltip[key]}
                onChange={(e) =>
                  updateGeneral({
                    tooltip: { ...generalState.tooltip, [key]: e.target.checked },
                  })
                }
              />
              <span className="form-label">{label}</span>
            </label>
          ))}
        </div>
      </AccordionSection>
    </AccordionGroup>
  );
}
