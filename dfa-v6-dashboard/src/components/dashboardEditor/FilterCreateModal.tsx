"use client";

import { ModalCloseButton } from "@/components/ModalCloseButton";
import { PrimarySaveButton } from "@/components/PrimarySaveButton";
import { TextField } from "@/components/TextField";
import { FILTER_TYPES, type FilterTypeId } from "@/lib/dashboards/types";
import { useEffect, useState } from "react";

export type FilterCreateModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate?: (name: string, filterType: FilterTypeId) => void;
};

export function FilterCreateModal({
  open,
  onClose,
  onCreate,
}: FilterCreateModalProps) {
  const [name, setName] = useState("");
  const [selectedType, setSelectedType] = useState<FilterTypeId>("select_list");

  useEffect(() => {
    if (!open) return;
    setName("");
    setSelectedType("select_list");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [open, onClose]);

  if (!open) return null;

  const canCreate = name.trim().length > 0;

  const handleCreate = () => {
    if (!canCreate) return;
    onCreate?.(name.trim(), selectedType);
    onClose();
  };

  return (
    <div className="modal-overlay" role="presentation">
      <button
        type="button"
        className="modal-backdrop"
        onClick={onClose}
        aria-label="Close modal overlay"
      />
      <div
        className="modal-panel !max-w-[560px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-create-title"
      >
        <div className="modal-header">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ModalCloseButton onClick={onClose} />
            <span
              className="material-icons text-primary !text-lg leading-none"
              aria-hidden
            >
              filter_list
            </span>
            <h2 id="filter-create-title" className="modal-title">
              Create Filter
            </h2>
          </div>
        </div>

        <div className="modal-body flex flex-col gap-4">
          <div className="sp-field min-w-0 gap-2">
            <span className="form-label">Select filter type</span>
            <div className="grid grid-cols-2 gap-2">
              {FILTER_TYPES.map((type) => {
                const isSelected = selectedType === type.id;
                return (
                  <button
                    key={type.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedType(type.id)}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-md border px-2 py-3 text-center transition ${
                      isSelected
                        ? "border-primary bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))] text-primary"
                        : "border-border bg-surface text-text-muted hover:border-[color:color-mix(in_srgb,var(--color-primary)_28%,var(--color-border))]"
                    }`}
                  >
                    <span
                      className="material-icons !text-2xl leading-none"
                      aria-hidden
                    >
                      {type.icon}
                    </span>
                    <span className="text-[11px] font-medium">{type.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="sp-field min-w-0">
            <span className="form-label">Filter name</span>
            <TextField
              fieldSize="md"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Filter name"
              autoComplete="off"
            />
          </label>
        </div>

        <div className="modal-footer">
          <PrimarySaveButton disabled={!canCreate} onClick={handleCreate}>
            Create filter
          </PrimarySaveButton>
        </div>
      </div>
    </div>
  );
}
