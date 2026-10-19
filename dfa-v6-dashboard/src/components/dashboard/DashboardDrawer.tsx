"use client";

import Drawer from "@/components/Drawer";
import { PrimarySaveButton } from "@/components/PrimarySaveButton";
import { SelectField } from "@/components/SelectField";
import { TextField } from "@/components/TextField";
import RequiredLabel from "@/components/RequiredLabel";
import type {
  DashboardFormValues,
  DatawarehouseOption,
} from "@/lib/dashboards/types";
import { useEffect, useState } from "react";

export type DashboardDrawerProps = {
  open: boolean;
  mode: "create" | "edit";
  initialValues: DashboardFormValues;
  datawarehouseOptions: DatawarehouseOption[];
  saving?: boolean;
  testing?: boolean;
  onClose: () => void;
  onSave: (values: DashboardFormValues) => void | Promise<void>;
  onTestConnection?: (values: DashboardFormValues) => void | Promise<void>;
};

export default function DashboardDrawer({
  open,
  mode,
  initialValues,
  datawarehouseOptions,
  saving = false,
  onClose,
  onSave,
}: DashboardDrawerProps) {
  const [values, setValues] = useState<DashboardFormValues>(initialValues);

  useEffect(() => {
    if (open) {
      setValues(initialValues);
    }
  }, [open, initialValues]);

  const title = mode === "edit" ? "Edit Dashboard" : "New Dashboard";
  const busy = saving;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="min(520px, 92vw)"
      zIndexClassName="z-[500]"
      title={title}
      headerActions={
        <>
          {saving ? (
            <button
              type="button"
              className="btn-comp-primary !h-9 gap-1.5 !text-xs font-semibold"
              disabled
            >
              <span
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden
              />
              Saving…
            </button>
          ) : (
            <PrimarySaveButton
              className="!h-9 !text-xs font-semibold"
              disabled={busy}
              onClick={() => void onSave(values)}
            >
              Save
            </PrimarySaveButton>
          )}
        </>
      }
    >
      <div className="sp-grid">
        <label className="sp-full sp-field">
          <RequiredLabel label="Dashboard Name" />
          <TextField
            fieldSize="md"
            value={values.dashboardName}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, dashboardName: e.target.value }))
            }
            autoComplete="off"
          />
        </label>

        <label className="sp-full sp-field">
          <RequiredLabel label="Map URL" />
          <TextField
            fieldSize="md"
            value={values.mapUrl}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, mapUrl: e.target.value }))
            }
            autoComplete="off"
          />

        </label>

        <label className="sp-full sp-field">
          <RequiredLabel label="Dashboard URL" />
          <TextField
            fieldSize="md"
            value={values.dashboardUrl}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, dashboardUrl: e.target.value }))
            }
            autoComplete="off"
          />
        </label>

        <label className="sp-full sp-field">
          <RequiredLabel label="Resolution" />
          <TextField
            fieldSize="md"
            value={values.resolution}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, resolution: e.target.value }))
            }
            autoComplete="off"
          />
        </label>

        <label className="sp-full sp-field">
          <RequiredLabel label="Datawarehouse Connection" />
          <SelectField
            value={values.datawarehouseId}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, datawarehouseId: e.target.value }))
            }
            placeholder="Select Datawarehouse"
            options={datawarehouseOptions}
          />
        </label>
      </div>
    </Drawer>
  );
}
