"use client";

import { ModalCloseButton } from "@/components/ModalCloseButton";
import { PrimarySaveButton } from "@/components/PrimarySaveButton";
import { TextField } from "@/components/TextField";
import { useEffect, useState } from "react";
import { type VisualizationTypeId } from "@/lib/dashboards/types";
import { VISUALIZATION_TYPES } from "@/lib/visualizations/types";

export type VisualizationCreateModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate?: (name: string, typeId: VisualizationTypeId) => void;
};

export function VisualizationCreateModal({
  open,
  onClose,
  onCreate,
}: VisualizationCreateModalProps) {
  const [name, setName] = useState("");
  const [selectedTypeId, setSelectedTypeId] = useState<VisualizationTypeId | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    setName("");
    setSelectedTypeId(null);
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

  const canCreate = name.trim().length > 0 && selectedTypeId !== null;

  const handleCreate = () => {
    if (!canCreate || !selectedTypeId) return;
    onCreate?.(name.trim(), selectedTypeId);
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
        aria-labelledby="visualization-settings-title"
      >
        <div className="modal-header">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ModalCloseButton onClick={onClose} />
            <span
              className="material-icons text-primary !text-lg leading-none"
              aria-hidden
            >
              settings
            </span>
            <h2 id="visualization-settings-title" className="modal-title">
              Visualization Settings
            </h2>
          </div>
        </div>

        <div className="modal-body flex flex-col gap-4">
          <label className="sp-field min-w-0">
            <span className="form-label">Visualization Name</span>
            <TextField
              fieldSize="md"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Visualization Name"
              autoComplete="off"
            />
          </label>

          <div className="sp-field min-w-0 gap-2">
            <span className="form-label">Select visualization type</span>
            <div className="grid grid-cols-4 gap-2">
              {VISUALIZATION_TYPES.map((type) => {
                const isSelected = selectedTypeId === type.id;
                return (
                  <button
                    key={type.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedTypeId(type.id)}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-md border px-1 py-3 text-center transition ${
                      isSelected
                        ? "border-primary bg-primary-subtle text-primary"
                        : "border-border bg-surface text-text-muted hover:border-primary"
                    }`}
                  >
                    <span className="material-icons !text-2xl leading-none" aria-hidden>
                      {type.icon}
                    </span>
                    <span className="text-[11px] font-medium">{type.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <PrimarySaveButton disabled={!canCreate} onClick={handleCreate}>
            Create Visualization
          </PrimarySaveButton>
        </div>
      </div>
    </div>
  );
}
