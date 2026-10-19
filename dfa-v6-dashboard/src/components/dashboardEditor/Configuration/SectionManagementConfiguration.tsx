"use client";

import { TextField } from "@/components/TextField";
import type { DashboardFormValues } from "@/lib/dashboards/types";
import type { Dispatch, SetStateAction } from "react";

type SectionManagementConfigurationProps = {
  values: DashboardFormValues;
  setValues: Dispatch<SetStateAction<DashboardFormValues>>;
};

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-text">{label}</span>
      <div className="flex items-center gap-2">
        <TextField
          fieldSize="md"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1"
          autoComplete="off"
        />
        <input
          type="color"
          value={value.startsWith("#") ? (value.length >= 7 ? value : "#000000") : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-9 w-10 shrink-0 cursor-pointer rounded border border-border bg-surface p-0.5"
          aria-label={`${label} color picker`}
        />
      </div>
    </label>
  );
}

export default function SectionManagementConfiguration({
  values,
  setValues,
}: SectionManagementConfigurationProps) {
  const updateField = (
    field: keyof DashboardFormValues["sectionManagement"],
    value: string,
  ) => {
    setValues((prev) => ({
      ...prev,
      sectionManagement: { ...prev.sectionManagement, [field]: value },
    }));
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <h3 className="text-sm font-semibold text-text">Section Management</h3>

      <div className="sp-grid">
        <div className="sp-field">
          <ColorField
            label="Background Color"
            value={values.sectionManagement.backgroundColor}
            onChange={(v) => updateField("backgroundColor", v)}
          />
        </div>
        <div className="sp-field">
          <ColorField
            label="Border Color"
            value={values.sectionManagement.borderColor}
            onChange={(v) => updateField("borderColor", v)}
          />
        </div>
        <div className="sp-field">
          <ColorField
            label="Font Color"
            value={values.sectionManagement.fontColor}
            onChange={(v) => updateField("fontColor", v)}
          />
        </div>
        <div className="sp-field">
          <ColorField
            label="Selected Section Background Color"
            value={values.sectionManagement.selectedSectionBgColor}
            onChange={(v) => updateField("selectedSectionBgColor", v)}
          />
        </div>
        <div className="sp-field">
          <ColorField
            label="Selected Section Font Color"
            value={values.sectionManagement.selectedSectionFontColor}
            onChange={(v) => updateField("selectedSectionFontColor", v)}
          />
        </div>
        <div className="sp-field">
          <ColorField
            label="Hover Over Background Color"
            value={values.sectionManagement.hoverOverBgColor}
            onChange={(v) => updateField("hoverOverBgColor", v)}
          />
        </div>
        <div className="sp-field">
          <ColorField
            label="Hover Over Font Color"
            value={values.sectionManagement.hoverOverFontColor}
            onChange={(v) => updateField("hoverOverFontColor", v)}
          />
        </div>
        <div className="sp-field">
          <ColorField
            label="Bottom Margin"
            value={values.sectionManagement.bottomMargin}
            onChange={(v) => updateField("bottomMargin", v)}
          />
        </div>
      </div>
    </div>
  );
}
