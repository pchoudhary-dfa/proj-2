"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SecondaryButton } from "@/components/SecondaryButton";
import { PrimaryButton } from "@/components/PrimaryButton";
import { createPortal } from "react-dom";
import type { MultiSelectOption } from "@/components/MultiSelectDropdown";
import { ModalCloseButton } from "@/components/ModalCloseButton";

function Mi({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`material-icons ${className}`.trim()} aria-hidden>
      {name}
    </span>
  );
}

export type ItemSelectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  searchPlaceholder?: string;
  options: MultiSelectOption[];
  selectedValues: string[];
  onApply: (values: string[]) => void;
  showSelectAll?: boolean;
  scopeMode?: "SINGLE" | "MULTIPLE";
  selectedCountLabel?: (count: number) => string;
  clearLabel?: string;
  cancelLabel?: string;
  applyLabel?: string;
  selectAllLabel?: string;
  deselectAllLabel?: string;
};

export function ItemSelectionModal({
  isOpen,
  onClose,
  title,
  searchPlaceholder = "Search...",
  options,
  selectedValues,
  onApply,
  showSelectAll = true,
  scopeMode = "MULTIPLE",
  selectedCountLabel,
  clearLabel = "Clear",
  cancelLabel = "Cancel",
  applyLabel = "Apply",
  selectAllLabel = "Select All",
  deselectAllLabel = "Deselect All",
}: ItemSelectionModalProps) {
  const [draft, setDraft] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft([...selectedValues]);
      setSearch("");
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [isOpen, selectedValues]);

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q)
    );
  }, [options, search]);

  const draftSet = useMemo(() => new Set(draft), [draft]);

  const allFilteredSelected = useMemo(
    () =>
      filteredOptions.length > 0 &&
      filteredOptions.every((opt) => draftSet.has(opt.value)),
    [filteredOptions, draftSet]
  );

  const toggleValue = useCallback(
    (value: string) => {
      if (scopeMode === "SINGLE") {
        setDraft((prev) => (prev[0] === value ? [] : [value]));
        return;
      }
      setDraft((prev) =>
        prev.includes(value)
          ? prev.filter((v) => v !== value)
          : [...prev, value]
      );
    },
    [scopeMode]
  );

  const handleSelectAll = useCallback(() => {
    if (allFilteredSelected) {
      const filterSet = new Set(filteredOptions.map((o) => o.value));
      setDraft((prev) => prev.filter((v) => !filterSet.has(v)));
    } else {
      const existing = new Set(draft);
      const toAdd = filteredOptions
        .filter((o) => !existing.has(o.value))
        .map((o) => o.value);
      setDraft((prev) => [...prev, ...toAdd]);
    }
  }, [allFilteredSelected, draft, filteredOptions]);

  const handleClear = useCallback(() => setDraft([]), []);

  const handleApply = useCallback(() => {
    onApply(draft);
  }, [draft, onApply]);

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  const countLabel = selectedCountLabel
    ? selectedCountLabel(draft.length)
    : `${draft.length} selected`;

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  const overlay = (
    <div className="modal-overlay" role="presentation">
      <div className="modal-backdrop" aria-hidden onClick={onClose} />
      <div
        className="modal-panel w-full max-w-[540px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-selection-modal-title"
      >
        <div className="modal-header">
          <h2 id="item-selection-modal-title" className="modal-title">
            {title}
          </h2>
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="px-5 pt-3 pb-2">
          <div className="relative">
            <input
              ref={searchRef}
              type="text"
              className="h-9 w-full rounded-sm border border-border bg-surface-muted pl-3 pr-8 text-xs text-text outline-none placeholder:text-text-muted focus:border-primary focus:ring-1 focus:ring-primary/30"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
            <Mi
              name="search"
              className="!text-sm absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            />
          </div>
        </div>

        {showSelectAll && scopeMode !== "SINGLE" && filteredOptions.length > 0 && (
          <div className="flex items-center gap-3 px-5 pb-2">
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => {
                const filterSet = new Set(filteredOptions.map((o) => o.value));
                const existing = new Set(draft);
                const toAdd = filteredOptions
                  .filter((o) => !existing.has(o.value))
                  .map((o) => o.value);
                setDraft((prev) => [...prev, ...toAdd]);
                void filterSet;
              }}
            >
              {selectAllLabel}
            </button>
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => {
                const filterSet = new Set(filteredOptions.map((o) => o.value));
                setDraft((prev) => prev.filter((v) => !filterSet.has(v)));
              }}
            >
              {deselectAllLabel}
            </button>
          </div>
        )}

        <div className="max-h-[320px] overflow-y-auto px-5 pb-2">
          {filteredOptions.length === 0 ? (
            <div className="py-6 text-center text-xs text-text-muted">
              No items found
            </div>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = draftSet.has(opt.value);
              return (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-xs transition-colors ${
                    isSelected
                      ? "bg-primary/10"
                      : "hover:bg-surface-muted"
                  }`}
                >
                  {scopeMode === "SINGLE" ? (
                    <input
                      type="radio"
                      className="radio-comp"
                      checked={isSelected}
                      onChange={() => toggleValue(opt.value)}
                    />
                  ) : (
                    <input
                      type="checkbox"
                      className="checkbox-comp"
                      checked={isSelected}
                      onChange={() => toggleValue(opt.value)}
                    />
                  )}
                  <span className="text-text">{opt.label}</span>
                </label>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <span className="text-xs text-text-muted">{countLabel}</span>
          <div className="flex items-center gap-2">
            <SecondaryButton type="button" onClick={handleClear}>
              {clearLabel}
            </SecondaryButton>
            <SecondaryButton type="button" onClick={handleCancel}>
              {cancelLabel}
            </SecondaryButton>
            <PrimaryButton type="button" onClick={handleApply}>
              {applyLabel}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
