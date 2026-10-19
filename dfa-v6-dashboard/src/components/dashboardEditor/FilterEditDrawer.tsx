"use client";

import Drawer from "@/components/Drawer";
import { PrimarySaveButton } from "@/components/PrimarySaveButton";
import { SelectField } from "@/components/SelectField";
import { TextField } from "@/components/TextField";
import type { FilterItem } from "@/lib/dashboards/types";
import { useState, useEffect } from "react";

type FilterEditDrawerProps = {
  open: boolean;
  item: FilterItem | null;
  onClose: () => void;
  onSave: (item: FilterItem) => void;
};

const VIEW_TYPE_OPTIONS = [
  { value: "", label: "---Select---" },
  { value: "dropdown", label: "Dropdown" },
  { value: "radio", label: "Radio" },
  { value: "checkbox", label: "Checkbox" },
];

const DATA_TYPE_OPTIONS = [
  { value: "", label: "---Select---" },
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
];

export function FilterEditDrawer({
  open,
  item,
  onClose,
  onSave,
}: FilterEditDrawerProps) {
  const [viewType, setViewType] = useState("");
  const [dataType, setDataType] = useState("");
  const [label, setLabel] = useState("");
  const [enableSearch, setEnableSearch] = useState(false);
  const [dwConnection, setDwConnection] = useState("");

  useEffect(() => {
    if (open && item) {
      setViewType(item.viewType);
      setDataType(item.dataType);
      setLabel(item.label);
      setEnableSearch(item.enableSearch);
      setDwConnection(item.datawarehouseConnection);
    }
  }, [open, item]);

  const handleSave = () => {
    if (!item) return;
    onSave({
      ...item,
      viewType,
      dataType,
      label,
      enableSearch,
      datawarehouseConnection: dwConnection,
    });
  };

  const isGlobal = item?.filterType === "global";
  const drawerTitle = isGlobal ? "Add Global Select List" : "Edit Select List Filter";

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="40%"
      zIndexClassName="z-[500]"
      title={drawerTitle}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="btn-comp-secondary !h-9 !text-xs font-semibold"
            onClick={onClose}
          >
            Cancel
          </button>
          <PrimarySaveButton
            className="!h-9 !text-xs font-semibold"
            onClick={handleSave}
          >
            Save
          </PrimarySaveButton>
        </div>
      }
    >
      <div className="flex flex-col gap-5 px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-primary mb-3">
            {isGlobal ? "Global Select List" : "Select List Filter"}
          </p>

          <div className="flex flex-col gap-3">
            <label className="sp-field min-w-0">
              <span className="form-label">View type</span>
              <SelectField
                options={VIEW_TYPE_OPTIONS}
                value={viewType}
                onChange={(e) => setViewType(e.target.value)}
              />
            </label>

            <label className="sp-field min-w-0">
              <span className="form-label">Data Type</span>
              <SelectField
                options={DATA_TYPE_OPTIONS}
                value={dataType}
                onChange={(e) => setDataType(e.target.value)}
              />
            </label>

            <label className="sp-field min-w-0">
              <span className="form-label">Label</span>
              <TextField
                fieldSize="md"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder=""
                autoComplete="off"
              />
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enableSearch}
                onChange={(e) => setEnableSearch(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary accent-primary"
              />
              <span className="form-label text-text">Enable search</span>
            </label>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-text-muted mb-3">
            Settings
          </p>

          <div className="rounded-md border-l-4 border-primary bg-[color:color-mix(in_srgb,var(--color-primary)_5%,var(--color-surface))] p-3">
            <details open>
              <summary className="cursor-pointer text-xs font-semibold text-primary select-none">
                Datawarehouse
              </summary>
              <div className="mt-3 flex flex-col gap-2">
                <label className="sp-field min-w-0">
                  <span className="form-label flex items-center gap-1">
                    <span className="text-primary">*</span> Datawarehouse Connection
                  </span>
                  <div className="flex items-center gap-2">
                    <TextField
                      fieldSize="md"
                      value={dwConnection}
                      onChange={(e) => setDwConnection(e.target.value)}
                      placeholder="Sample Data warehouse [en,fr,ar]"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary"
                      aria-label="Info"
                    >
                      <span className="material-icons !text-xs">info</span>
                    </button>
                  </div>
                </label>
              </div>
            </details>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
