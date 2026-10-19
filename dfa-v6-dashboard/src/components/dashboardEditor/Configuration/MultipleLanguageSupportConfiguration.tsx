"use client";

import type { DashboardFormValues } from "@/lib/dashboards/types";
import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";

type MultipleLanguageSupportConfigurationProps = {
  values: DashboardFormValues;
  setValues: Dispatch<SetStateAction<DashboardFormValues>>;
  onExport?: () => void;
  onImport?: (file: File) => void;
};

export default function MultipleLanguageSupportConfiguration({
  values,
  setValues,
  onExport,
  onImport,
}: MultipleLanguageSupportConfigurationProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleLanguage = useCallback(() => {
    setValues((prev) => ({
      ...prev,
      multipleLanguageSupport: {
        ...prev.multipleLanguageSupport,
        enableLanguage: !prev.multipleLanguageSupport.enableLanguage,
      },
    }));
  }, [setValues]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onImport?.(file);
      e.target.value = "";
    },
    [onImport],
  );

  const handleImportClick = useCallback(() => {
    const file = fileInputRef.current?.files?.[0];
    if (file) {
      onImport?.(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [onImport]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h3 className="text-sm font-semibold text-primary">
        Multiple Language Support
      </h3>

      <div className="flex flex-col gap-4">
        <h4 className="text-sm font-semibold text-text">
          Multiple Language Support
        </h4>

        <div className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-text">
              Enable Language
            </span>
            <span className="text-xs text-text-muted">
              {values.multipleLanguageSupport.datawarehouseLabel
                ? `Sample Data warehouse [${values.multipleLanguageSupport.datawarehouseLabel}]`
                : "Sample Data warehouse []"}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={values.multipleLanguageSupport.enableLanguage}
            onClick={toggleLanguage}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
              values.multipleLanguageSupport.enableLanguage
                ? "bg-primary"
                : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                values.multipleLanguageSupport.enableLanguage
                  ? "translate-x-6"
                  : "translate-x-1"
              }`}
            />
            <span className="ml-auto mr-1.5 text-[10px] font-medium text-white">
              {values.multipleLanguageSupport.enableLanguage ? "" : "Off"}
            </span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h4 className="text-sm font-semibold text-text">
          Import and Export Language Files
        </h4>

        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-text">
            Export Language File
          </span>
          <button
            type="button"
            className="btn-comp-primary flex h-8 w-8 items-center justify-center rounded"
            onClick={onExport}
            title="Export language file"
          >
            <span className="material-icons !text-base" aria-hidden>
              download
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="shrink-0 text-xs font-medium text-text">
            Import Language File
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv,.xlsx,.xls"
              className="field-comp--md min-w-0 flex-1 text-xs file:mr-2 file:rounded file:border-0 file:bg-transparent file:text-xs file:text-text-muted"
              onChange={handleFileChange}
            />
            <button
              type="button"
              className="btn-comp-primary flex h-8 w-8 shrink-0 items-center justify-center rounded"
              onClick={() => fileInputRef.current?.click()}
              title="Choose file"
            >
              <span className="material-icons !text-base" aria-hidden>
                upload
              </span>
            </button>
            <button
              type="button"
              className="btn-comp-primary h-8 shrink-0 rounded px-3 text-xs font-semibold"
              onClick={handleImportClick}
            >
              Import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
