"use client";

import RequiredLabel from "@/components/RequiredLabel";
import { SelectField } from "@/components/SelectField";
import { TextField } from "@/components/TextField";
import { textFieldClassName } from "@/components/TextField";
import type { DashboardFormValues } from "@/lib/dashboards/types";
import type { Dispatch, SetStateAction } from "react";

type HeaderFooterOption = {
  value: string;
  label: string;
};

type HeaderFooterConfigurationProps = {
  values: DashboardFormValues;
  setValues: Dispatch<SetStateAction<DashboardFormValues>>;
  headerFooterOptions?: HeaderFooterOption[];
  onRefreshHeaderFooters?: () => void;
  onSelectHeaderFooter?: (id: string) => void;
};

export default function HeaderFooterConfiguration({
  values,
  setValues,
  headerFooterOptions = [],
  onRefreshHeaderFooters,
  onSelectHeaderFooter,
}: HeaderFooterConfigurationProps) {
  const updateField = <K extends keyof DashboardFormValues["headerFooter"]>(
    field: K,
    value: DashboardFormValues["headerFooter"][K],
  ) => {
    setValues((prev) => ({
      ...prev,
      headerFooter: { ...prev.headerFooter, [field]: value },
    }));
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <h3 className="text-sm font-semibold uppercase text-text-muted">
        Header / Footer
      </h3>

      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-medium text-text">
          Select Header/Footer
        </span>
        <div className="flex items-center gap-2">
          <SelectField
            className="min-w-0 flex-1"
            value={values.headerFooter.selectedHeaderFooterId}
            onChange={(e) => {
              const id = e.target.value;
              updateField("selectedHeaderFooterId", id);
              if (id && onSelectHeaderFooter) {
                onSelectHeaderFooter(id);
              }
            }}
            placeholder="Select Header/Footer"
            options={headerFooterOptions}
          />
          <button
            type="button"
            className="btn-comp-primary flex h-9 w-9 shrink-0 items-center justify-center rounded"
            onClick={onRefreshHeaderFooters}
            title="Refresh"
          >
            <span className="material-icons !text-base" aria-hidden>
              refresh
            </span>
          </button>
        </div>
      </div>

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-semibold text-text">Header HTML</span>
        <textarea
          className={textFieldClassName(
            "md",
            "min-h-[100px] w-full resize-y font-mono text-xs py-2",
          )}
          value={values.headerFooter.headerHtml}
          onChange={(e) => updateField("headerHtml", e.target.value)}
          placeholder="Enter header HTML"
          spellCheck={false}
        />
      </label>

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-semibold text-text">
          Mobile Header HTML
        </span>
        <textarea
          className={textFieldClassName(
            "md",
            "min-h-[100px] w-full resize-y font-mono text-xs py-2",
          )}
          value={values.headerFooter.mobileHeaderHtml}
          onChange={(e) => updateField("mobileHeaderHtml", e.target.value)}
          placeholder="Enter mobile header HTML"
          spellCheck={false}
        />
      </label>

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-semibold text-text">Footer HTML</span>
        <textarea
          className={textFieldClassName(
            "md",
            "min-h-[100px] w-full resize-y font-mono text-xs py-2",
          )}
          value={values.headerFooter.footerHtml}
          onChange={(e) => updateField("footerHtml", e.target.value)}
          placeholder="Enter footer HTML"
          spellCheck={false}
        />
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-text">
        <input
          type="checkbox"
          className="checkbox-comp"
          checked={values.headerFooter.footerFixedAtBottom}
          onChange={(e) =>
            updateField("footerFixedAtBottom", e.target.checked)
          }
        />
        Footer fixed at bottom
      </label>

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-medium text-text">Favicon url</span>
        <TextField
          fieldSize="md"
          value={values.headerFooter.faviconUrl}
          onChange={(e) => updateField("faviconUrl", e.target.value)}
          placeholder="Enter favicon URL"
          autoComplete="off"
        />
      </label>
    </div>
  );
}
