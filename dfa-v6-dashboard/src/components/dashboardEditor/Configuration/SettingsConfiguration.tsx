"use client";
import { SelectField } from "@/components/SelectField";
import { TextField } from "@/components/TextField";
import RequiredLabel from "@/components/RequiredLabel";
import type { DashboardFormValues, DatawarehouseOption } from "@/lib/dashboards/types";
import type { Dispatch, SetStateAction } from "react";

const RESOLUTION_OPTIONS = [
  { value: "Width = 1024px", label: "Width = 1024px" },
  { value: "Width = 1280px", label: "Width = 1280px" },
  { value: "Width = 1920px", label: "Width = 1920px" },
];

type SettingsConfigurationProps = {
  values: DashboardFormValues;
  setValues: Dispatch<SetStateAction<DashboardFormValues>>;
  publishPreview: string;
  datawarehouseOptions: DatawarehouseOption[];
};

export default function SettingsConfiguration({
  values,
  setValues,
  publishPreview,
  datawarehouseOptions,
}: SettingsConfigurationProps) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <h3 className="text-sm font-semibold text-primary">Settings</h3>
      <div className="sp-grid">
        <label className="sp-full flex min-w-0 flex-col gap-1.5">
          <RequiredLabel label="Dashboard Name" />
          <TextField
            fieldSize="md"
            value={values.dashboardName}
            onChange={(event) =>
              setValues((prev) => ({
                ...prev,
                dashboardName: event.target.value,
              }))
            }
            autoComplete="off"
          />
        </label>

        <label className="sp-field flex min-w-0 flex-col gap-1.5">
          <RequiredLabel label="Map URL" />
          <TextField
            fieldSize="md"
            value={values.mapUrl}
            onChange={(event) =>
              setValues((prev) => ({ ...prev, mapUrl: event.target.value }))
            }
            autoComplete="off"
          />
          <p className="text-[11px] text-text-muted">{publishPreview}</p>
        </label>

        <label className="sp-field flex min-w-0 flex-col gap-1.5">
          <RequiredLabel label="Dashboard URL" />
          <TextField
            fieldSize="md"
            value={values.dashboardUrl}
            onChange={(event) =>
              setValues((prev) => ({
                ...prev,
                dashboardUrl: event.target.value,
              }))
            }
            autoComplete="off"
          />
        </label>

        <label className="sp-field flex min-w-0 flex-col gap-1.5">
          <RequiredLabel label="Resolution" />
          <SelectField
            value={values.resolution}
            onChange={(event) =>
              setValues((prev) => ({
                ...prev,
                resolution: event.target.value,
              }))
            }
            options={RESOLUTION_OPTIONS}
          />
        </label>

        <label className="sp-field flex min-w-0 flex-col gap-1.5">
          <RequiredLabel label="Datawarehouse Connection" />
          <SelectField
            value={values.datawarehouseId}
            onChange={(event) =>
              setValues((prev) => ({
                ...prev,
                datawarehouseId: event.target.value,
              }))
            }
            placeholder="Select Datawarehouse"
            options={datawarehouseOptions.map((option) => ({
              ...option,
              label: `${option.label} [en]`,
            }))}
          />
        </label>
      </div>
    </div>
  );
}