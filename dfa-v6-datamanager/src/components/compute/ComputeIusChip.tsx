"use client";

import { SideNavTruncatingLabel } from "@/components/SideNavListColumn";

export type ComputeIusChipProps = {
  label: string;
  onRemove: () => void;
  disabled?: boolean;
  removeAriaLabel: string;
};

/** Compact removable pill for selected source / operand IUS on the compute tab. */
export function ComputeIusChip({
  label,
  onRemove,
  disabled = false,
  removeAriaLabel,
}: ComputeIusChipProps) {
  return (
    <li className="compute-ius-chip">
      <SideNavTruncatingLabel
        text={label}
        className="compute-ius-chip__label"
      />
      <button
        type="button"
        className="btn-comp-ghost btn-comp-ghost--xs btn-comp-ghost--primary shrink-0 rounded-full"
        aria-label={removeAriaLabel}
        disabled={disabled}
        onClick={onRemove}
      >
        <span className="material-icons !text-[14px] leading-none" aria-hidden>
          close
        </span>
      </button>
    </li>
  );
}
